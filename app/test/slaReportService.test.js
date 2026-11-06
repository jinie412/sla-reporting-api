import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { SlaReportService } from "../src/services/slaReportService.js";

const site = {
  id: 1,
  timezone: "UTC",
  business_hours: {
    mon: { open: "09:00", close: "17:00" },
    tue: { open: "09:00", close: "17:00" },
    wed: { open: "09:00", close: "17:00" },
    thu: { open: "09:00", close: "17:00" },
    fri: { open: "09:00", close: "17:00" },
  },
};

const singaporeSite = {
  ...site,
  id: "2",
  timezone: "Asia/Singapore",
};

function dataService(data) {
  return { ingest: async () => data };
}

function request(id, siteId = 1, overrides = {}) {
  return {
    id,
    site_id: siteId,
    status: "processing",
    priority: "High",
    created_at: "2026-10-05T09:00:00Z",
    deleted_at: null,
    merged_into_id: null,
    ...overrides,
  };
}

describe("SlaReportService", () => {
  test("reuses one snapshot for sequential and concurrent reports", async () => {
    let ingestionCalls = 0;
    let resolveIngestion;
    const ingestion = {
      requests: [],
      eventsByRequestId: {},
      sites: [],
      staff: [],
      holidaysBySiteId: {},
    };
    const service = new SlaReportService({
      ingest: async () => {
        ingestionCalls += 1;
        await new Promise((resolve) => {
          resolveIngestion = resolve;
        });
        return ingestion;
      },
    });

    const first = service.generate("2026-10-01", "2026-10-31");
    const second = service.generate("2026-05-01", "2026-10-31");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(ingestionCalls, 1);
    resolveIngestion();

    await Promise.all([first, second]);
    await service.generate("2026-10-01", "2026-10-31");
    assert.equal(ingestionCalls, 1);
  });

  test("failed initialization does not mark the snapshot as ready", async () => {
    let ingestionCalls = 0;
    const service = new SlaReportService({
      ingest: async () => {
        ingestionCalls += 1;
        throw new Error("temporary upstream failure");
      },
    });

    await assert.rejects(
      service.initialize("2026-05-01", "2026-10-31"),
      /temporary upstream failure/,
    );
    await assert.rejects(
      service.generate("2026-10-01", "2026-10-31"),
      /temporary upstream failure/,
    );
    assert.equal(ingestionCalls, 2);
  });

  test("creates rows from the correct request events and aggregates current responders", async () => {
    const report = await new SlaReportService(
      dataService({
        requests: [
          request(1),
          request(2, 1, { created_at: "2026-10-06T09:00:00Z" }),
          request(3, 2, { created_at: "2026-10-05T00:30:00Z" }),
          request(4, 1, { status: "canceled" }),
        ],
        eventsByRequestId: {
          "1": [
            {
              id: 11,
              status: "processing",
              actor_id: 7,
              actor_name: "Old Name",
              at: Date.parse("2026-10-05T09:30:00Z") / 1000,
            },
            {
              id: 12,
              status: "complete",
              at: Date.parse("2026-10-05T10:00:00Z") / 1000,
              due_at: "05/10/2026 09:45",
            },
          ],
          "2": [
            {
              id: 21,
              status: "processing",
              actor_id: 7,
              actor_name: "Old Name",
              at: Date.parse("2026-10-06T10:00:00Z") / 1000,
            },
          ],
          "3": [],
        },
        sites: [site, singaporeSite],
        staff: [{ id: 7, name: "Current Name" }],
        holidaysBySiteId: { "1": [], "2": [] },
      }),
    ).generate("2026-10-01", "2026-10-31");

    assert.deepEqual(report.requests, [
      {
        id: 1,
        site_id: 1,
        responder_id: 7,
        responder: "Current Name",
        response_business_minutes: 30,
        within_target: true,
        completed_late: true,
      },
      {
        id: 2,
        site_id: 1,
        responder_id: 7,
        responder: "Current Name",
        response_business_minutes: 60,
        within_target: true,
        completed_late: null,
      },
      {
        id: 3,
        site_id: 2,
        responder_id: null,
        responder: null,
        response_business_minutes: null,
        within_target: null,
        completed_late: null,
      },
    ]);
    assert.deepEqual(report.responders, [
      {
        id: 7,
        name: "Current Name",
        requests: 2,
        within_target: 2,
        completed_late: 1,
      },
    ]);
  });

  test("excludes requests outside the range", async () => {
    const report = await new SlaReportService(
      dataService({
        requests: [
          request(1, 1, { created_at: "2026-09-30T23:00:00Z" }),
        ],
        eventsByRequestId: {},
        sites: [site],
        staff: [],
        holidaysBySiteId: {},
      }),
    ).generate("2026-10-01", "2026-10-31");

    assert.deepEqual(report.requests, []);
    assert.deepEqual(report.responders, []);
  });

  test("reports a missing site", async () => {
    const service = new SlaReportService(
      dataService({
        requests: [
          request(2, 99),
        ],
        eventsByRequestId: {},
        sites: [site],
        staff: [],
        holidaysBySiteId: {},
      }),
    );

    await assert.rejects(
      service.generate("2026-10-01", "2026-10-31"),
      /request 2 references missing site 99/,
    );
  });

  test("rejects a responder that is missing from staff", async () => {
    const service = new SlaReportService(
      dataService({
        requests: [request(1)],
        eventsByRequestId: {
          "1": [
            {
              id: 11,
              status: "processing",
              actor_id: 7,
              at: Date.parse("2026-10-05T10:00:00Z") / 1000,
            },
          ],
        },
        sites: [site],
        staff: [],
        holidaysBySiteId: { "1": [] },
      }),
    );

    await assert.rejects(
      service.generate("2026-10-01", "2026-10-31"),
      /responder 7 for request 1 is missing from staff/,
    );
  });

  test("rejects incomplete ingestion results", async () => {
    const service = new SlaReportService(
      dataService({
        requests: [],
        sites: [],
        staff: [],
        holidaysBySiteId: {},
      }),
    );

    await assert.rejects(
      service.generate("2026-10-01", "2026-10-31"),
      /eventsByRequestId must be an object/,
    );
  });

  test("requires a holiday entry for every referenced site", async () => {
    const service = new SlaReportService(
      dataService({
        requests: [request(1)],
        eventsByRequestId: {},
        sites: [site],
        staff: [],
        holidaysBySiteId: {},
      }),
    );

    await assert.rejects(
      service.generate("2026-10-01", "2026-10-31"),
      /holidays for site 1 are missing/,
    );
  });

  test("does not create a null responder group and counts only true values", async () => {
    const report = await new SlaReportService(
      dataService({
        requests: [
          request(1),
          request(2, 1, { priority: "High", created_at: "2026-10-06T09:00:00Z" }),
          request(3, 1, { created_at: "2026-10-07T09:00:00Z" }),
        ],
        eventsByRequestId: {
          "1": [
            {
              id: 1,
              status: "processing",
              actor_id: 7,
              at: Date.parse("2026-10-05T10:00:00Z") / 1000,
            },
          ],
          "2": [
            {
              id: 2,
              status: "processing",
              actor_id: 7,
              at: Date.parse("2026-10-06T17:00:00Z") / 1000,
            },
          ],
          "3": [],
        },
        sites: [site],
        staff: [{ id: 7, name: "Responder" }],
        holidaysBySiteId: { "1": [] },
      }),
    ).generate("2026-10-01", "2026-10-31");

    assert.deepEqual(report.responders, [
      {
        id: 7,
        name: "Responder",
        requests: 2,
        within_target: 1,
        completed_late: 0,
      },
    ]);
    assert.equal(report.requests[2].responder_id, null);
  });

  test("returns empty arrays for empty ingestion data", async () => {
    const report = await new SlaReportService(
      dataService({
        requests: [],
        eventsByRequestId: {},
        sites: [],
        staff: [],
        holidaysBySiteId: {},
      }),
    ).generate("2026-10-01", "2026-10-31");

    assert.deepEqual(report, {
      from: "2026-10-01",
      to: "2026-10-31",
      requests: [],
      responders: [],
    });
  });
});
