import { isEligibleRequest } from "../domain/requestEligibility.js";
import { calculateSla } from "../domain/slaCalculator.js";

export class SlaReportService {
  constructor(dataService) {
    if (!dataService || typeof dataService.ingest !== "function") {
      throw new TypeError("dataService must provide an ingest method");
    }
    this.dataService = dataService;
    this.snapshot = null;
    this.snapshotPromise = null;
    this.preparedRows = null;
  }

  async generate(from, to) {
    return this.#generateFromSnapshot(
      from,
      to,
      await this.#getSnapshot(),
    );
  }

  async initialize(from, to) {
    const snapshot = await this.#getSnapshot();
    await this.#generateFromSnapshot(from, to, snapshot);
    return true;
  }

  async #getSnapshot() {
    if (this.snapshot) return this.snapshot;
    if (this.snapshotPromise) return this.snapshotPromise;

    this.snapshotPromise = this.dataService
      .ingest()
      .then((ingestion) => {
        validateIngestionResult(ingestion);
        const preparedRows = prepareRows(ingestion);
        this.snapshot = ingestion;
        this.preparedRows = preparedRows;
        return ingestion;
      })
      .catch((error) => {
        this.snapshotPromise = null;
        throw error;
      });

    return this.snapshotPromise;
  }

  async #generateFromSnapshot(from, to, ingestion) {
    validateIngestionResult(ingestion);
    const reportRequests = [];

    for (const prepared of this.preparedRows) {
      const { request, site } = prepared;
      if (isEligibleRequest(request, site, from, to)) {
        if (!prepared.row) {
          prepared.row = calculatePreparedRow(prepared);
        }
        reportRequests.push({ ...prepared.row });
      }
    }

    return {
      from,
      to,
      requests: reportRequests,
      responders: aggregateResponders(reportRequests),
    };
  }

}

function prepareRows(ingestion) {
    const {
      requests,
      eventsByRequestId,
      sites,
      staff,
      holidaysBySiteId,
    } = ingestion;
    const sitesById = new Map(sites.map((site) => [String(site.id), site]));
    const staffById = new Map(staff.map((member) => [String(member.id), member]));
    const preparedRows = [];

    for (const request of requests) {
      const site = sitesById.get(String(request.site_id));
      if (!site) {
        throw new Error(
          `Data integrity error: request ${request.id} references missing site ${request.site_id}`,
        );
      }

      preparedRows.push({
        request,
        site,
        eventsByRequestId,
        holidaysBySiteId,
        staff,
        staffById,
        row: null,
      });
    }

    return preparedRows;
}

function calculatePreparedRow(prepared) {
    const { request, site, eventsByRequestId, holidaysBySiteId, staff, staffById } =
      prepared;
    const requestKey = String(request.id);
    const siteKey = String(site.id);
    const events = eventsByRequestId[requestKey] ?? [];
    if (!Array.isArray(events)) {
      throw new Error(
        `Invalid ingestion result: events for request ${request.id} must be an array`,
      );
    }
    if (!Object.prototype.hasOwnProperty.call(holidaysBySiteId, siteKey)) {
      throw new Error(
        `Invalid ingestion result: holidays for site ${site.id} are missing`,
      );
    }
    const holidays = holidaysBySiteId[siteKey];
    if (!Array.isArray(holidays)) {
      throw new Error(
        `Invalid ingestion result: holidays for site ${site.id} must be an array`,
      );
    }
    const row = calculateSla(request, events, site, holidays, staff);

    validateSlaRow(row, request.id);
    if (row.responder_id !== null) {
      const responder = staffById.get(String(row.responder_id));
      if (!responder || typeof responder.name !== "string") {
        throw new Error(
          `Data integrity error: responder ${row.responder_id} for request ${request.id} is missing from staff`,
        );
      }
      row.responder = responder.name;
    }
    return row;
}

function validateIngestionResult(ingestion) {
  if (!ingestion || typeof ingestion !== "object" || Array.isArray(ingestion)) {
    throw new Error("Invalid ingestion result: expected an object");
  }

  for (const field of ["requests", "sites", "staff"]) {
    if (!Array.isArray(ingestion[field])) {
      throw new Error(`Invalid ingestion result: ${field} must be an array`);
    }
  }
  for (const field of ["eventsByRequestId", "holidaysBySiteId"]) {
    if (
      !ingestion[field] ||
      typeof ingestion[field] !== "object" ||
      Array.isArray(ingestion[field])
    ) {
      throw new Error(`Invalid ingestion result: ${field} must be an object`);
    }
  }
}

function validateSlaRow(row, requestId) {
  const requiredFields = [
    "id",
    "site_id",
    "responder_id",
    "responder",
    "response_business_minutes",
    "within_target",
    "completed_late",
  ];

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(
      `Invalid SLA row for request ${requestId}`,
    );
  }

  for (const field of requiredFields) {
    if (!(field in row)) {
      throw new Error(
        `SLA calculation for request ${requestId} is missing ${field}`,
      );
    }
  }

  if (row.id !== requestId) {
    throw new Error(`Invalid SLA row for request ${requestId}: id does not match`);
  }
  if (!isValidIdentifier(row.responder_id)) {
    throw new Error(
      `Invalid SLA row for request ${requestId}: responder_id must be null or a valid ID`,
    );
  }
  if (row.responder !== null && typeof row.responder !== "string") {
    throw new Error(
      `Invalid SLA row for request ${requestId}: responder must be a string or null`,
    );
  }
  if (
    row.response_business_minutes !== null &&
    (!Number.isInteger(row.response_business_minutes) ||
      row.response_business_minutes < 0)
  ) {
    throw new Error(
      `Invalid SLA row for request ${requestId}: response_business_minutes must be a non-negative integer or null`,
    );
  }
  if (!isNullableBoolean(row.within_target)) {
    throw new Error(
      `Invalid SLA row for request ${requestId}: within_target must be boolean or null`,
    );
  }
  if (!isNullableBoolean(row.completed_late)) {
    throw new Error(
      `Invalid SLA row for request ${requestId}: completed_late must be boolean or null`,
    );
  }

  if (row.responder_id === null) {
    if (
      row.responder !== null ||
      row.response_business_minutes !== null ||
      row.within_target !== null
    ) {
      throw new Error(
        `Invalid response fields for request ${requestId}`,
      );
    }
  }
}

function isValidIdentifier(value) {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.length > 0)
  );
}

function isNullableBoolean(value) {
  return value === null || typeof value === "boolean";
}

function aggregateResponders(requests) {
  const responders = new Map();

  for (const request of requests) {
    if (request.responder_id === null) continue;

    const key = String(request.responder_id);
    let summary = responders.get(key);
    if (!summary) {
      summary = {
        id: request.responder_id,
        name: request.responder,
        requests: 0,
        within_target: 0,
        completed_late: 0,
      };
      responders.set(key, summary);
    }

    summary.requests += 1;
    if (request.within_target === true) summary.within_target += 1;
    if (request.completed_late === true) summary.completed_late += 1;
  }

  return [...responders.values()];
}
