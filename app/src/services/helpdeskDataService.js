import { HelpdeskApiError, HelpdeskClient } from "../helpdesk.js";

import {
  REQUEST_PAGE_SIZE,
  CHANGE_PAGE_SIZE,
  CONCURRENCY,
} from "../constants/constant.js";

export class HelpdeskDataService {
  constructor({
    client = new HelpdeskClient(),
    concurrency = CONCURRENCY,
  } = {}) {
    if (!client || typeof client.get !== "function") {
      throw new TypeError("client must provide a get method");
    }
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("concurrency must be a positive integer");
    }
    this.client = client;
    this.concurrency = concurrency;
  }

  async ingest() {
    const [requests, changeResult, sites, staff] = await Promise.all([
      this.fetchRequests(),
      this.fetchChanges(),
      this.client.get("/v1/sites").then((response) => {
        return validateData(response, "/v1/sites", "site");
      }),
      this.client.get("/v1/staff").then((response) => {
        return validateData(response, "/v1/staff", "staff");
      }),
    ]);

    const holidays = await mapWithConcurrency(
      sites,
      this.concurrency,
      async (site) => [
        String(site.id),
        validateData(
          await this.client.get(
            `/v1/sites/${encodeURIComponent(site.id)}/holidays`,
          ),
          `/v1/sites/${site.id}/holidays`,
          "holiday",
          false,
        ),
      ],
    );

    const requestMap = new Map(
      requests.map((request) => [String(request.id), request]),
    );
    for (const request of changeResult.requestSnapshots.values()) {
      requestMap.set(String(request.id), request);
    }

    return {
      requests: [...requestMap.values()],
      eventsByRequestId: changeResult.eventsByRequestId,
      sites,
      staff,
      holidaysBySiteId: Object.fromEntries(holidays),
      changesCursor: changeResult.changesCursor,
    };
  }

  async fetchRequests() {
    const requestsById = new Map();
    let page = 1;

    for (;;) {
      const response = await this.client.get("/v1/requests", {
        page,
        per_page: REQUEST_PAGE_SIZE,
      });
      const data = validateData(response, "/v1/requests", "request");
      validateTotalPages(response, "/v1/requests");
      for (const request of data) {
        if (!requestsById.has(String(request.id))) {
          requestsById.set(String(request.id), request);
        }
      }

      if (response.total_pages !== undefined) {
        if (page >= response.total_pages) {
          break;
        }
      } else if (data.length < REQUEST_PAGE_SIZE) {
        break;
      }
      page += 1;
    }

    return [...requestsById.values()];
  }

  async fetchChanges() {
    let restartCount = 0;

    for (;;) {
      try {
        return await this.#readChanges();
      } catch (error) {
        if (
          !(error instanceof HelpdeskApiError) ||
          error.status !== 410 ||
          restartCount >= 1
        ) {
          throw error;
        }
        restartCount += 1;
      }
    }
  }

  async fetchEvents(requestId) {
    const eventsById = new Map();
    let page = 1;

    for (;;) {
      const response = await this.client.get(
        `/v1/requests/${encodeURIComponent(requestId)}/events`,
        { page },
      );
      const data = validateData(
        response,
        `/v1/requests/${requestId}/events`,
        "event",
      );
      if (typeof response.has_more !== "boolean") {
        throw new Error(
          `Malformed /v1/requests/${requestId}/events response: has_more must be a boolean`,
        );
      }
      for (const event of data) {
        eventsById.set(String(event.id), event);
      }
      if (!response.has_more) {
        break;
      }
      page += 1;
    }

    return [...eventsById.values()];
  }

  async #readChanges() {
    const eventsByRequest = new Map();
    const eventsById = new Map();
    const requestSnapshots = new Map();
    let cursor;
    let nextCursor = null;

    for (;;) {
      const params = { limit: CHANGE_PAGE_SIZE };
      if (cursor) {
        params.cursor = cursor;
      }
      const response = await this.client.get("/v1/changes", params);
      const data = validateData(response, "/v1/changes", "change", false);
      if (typeof response.has_more !== "boolean" && data.length !== 0) {
        throw new Error(
          "Malformed /v1/changes response: has_more must be a boolean",
        );
      }
      if (response.has_more && !isValidCursor(response.next_cursor)) {
        throw new Error(
          "Malformed /v1/changes response: has_more requires a valid next_cursor",
        );
      }

      for (const change of data) {
        if (change?.request) {
          requireIdentifier(change.request.id, "request ID");
          requestSnapshots.set(String(change.request.id), change.request);
        }
        if (change?.type !== "event.created" || !change.event) {
          continue;
        }

        const requestId = change.request_id ?? change.event.request_id;
        requireIdentifier(change.event.id, "event ID");
        requireIdentifier(requestId, "event request ID");
        const eventId = change.event.id;
        if (eventsById.has(String(eventId))) continue;

        eventsById.set(String(eventId), true);
        const key = String(requestId);
        const events = eventsByRequest.get(key) ?? [];
        events.push(change.event);
        eventsByRequest.set(key, events);
      }

      nextCursor = response.next_cursor ?? null;
      if (!response.has_more) {
        break;
      }
      cursor = nextCursor;
    }

    const eventsByRequestId = Object.fromEntries(
      [...eventsByRequest.entries()].map(([requestId, events]) => [
        requestId,
        events.sort((left, right) => compareEventTimes(left, right)),
      ]),
    );

    return { eventsByRequestId, requestSnapshots, changesCursor: nextCursor };
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

// function compareEventTimes(left, right) {
//   return eventTime(left) - eventTime(right);
// }

function compareEventTimes(left, right) {
  const timeDiff = eventTime(left) - eventTime(right);

 
  if (timeDiff !== 0) {
    return timeDiff;
  }
  return Number(left.id) - Number(right.id);
}

function eventTime(event) {
  if (typeof event.at !== "number" || !Number.isFinite(event.at)) {
    throw new Error("Malformed event: at must be a finite number");
  }
  return event.at;
}

function validateData(response, endpoint, itemName, requireItems = true) {
  if (!response || !Array.isArray(response.data)) {
    throw new Error(`Malformed ${endpoint} response: data must be an array`);
  }
  for (const item of response.data) {
    if (!item || typeof item !== "object") {
      throw new Error(
        `Malformed ${endpoint} response: ${itemName} must be an object`,
      );
    }
    if (
      requireItems &&
      (item.id === undefined || item.id === null || item.id === "")
    ) {
      throw new Error(
        `Malformed ${endpoint} response: ${itemName} ID is required`,
      );
    }
  }
  return response.data;
}

function validateTotalPages(response, endpoint) {
  if (
    response.total_pages !== undefined &&
    (!Number.isInteger(response.total_pages) || response.total_pages < 1)
  ) {
    throw new Error(
      `Malformed ${endpoint} response: total_pages must be a positive integer`,
    );
  }
}

function requireIdentifier(value, label) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Malformed change: ${label} is required`);
  }
}

function isValidCursor(cursor) {
  return typeof cursor === "string" && cursor.length > 0;
}
