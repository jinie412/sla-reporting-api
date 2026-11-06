import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, createReadinessState } from "../src/app.js";

async function withServer(slaReportService, callback, readiness) {
  const server = createApp({ slaReportService, readiness }).listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

test("GET /api/sla-report validates dates and passes them to the service", async () => {
  const calls = [];
  const report = {
    from: "2026-10-01",
    to: "2026-10-31",
    requests: [
      {
        id: 1,
        site_id: 2,
        responder_id: null,
        responder: null,
        response_business_minutes: null,
        within_target: null,
        completed_late: null,
      },
    ],
    responders: [],
  };
  const service = {
    async generate(from, to) {
      calls.push([from, to]);
      return report;
    },
  };

  await withServer(service, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/sla-report?from=2026-10-01&to=2026-10-31`,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), report);
  });

  assert.deepEqual(calls, [["2026-10-01", "2026-10-31"]]);
});

test("GET /api/sla-report rejects missing, repeated, malformed, invalid, and reversed dates", async () => {
  const service = { generate: async () => { throw new Error("not called"); } };
  const cases = [
    ["?to=2026-10-31", "Both from and to are required"],
    ["?from=2026-10-01", "Both from and to are required"],
    ["?from=2026-10-01&from=2026-10-02&to=2026-10-31", "Dates must use YYYY-MM-DD format"],
    ["?from=2026/10/01&to=2026-10-31", "Dates must use YYYY-MM-DD format"],
    ["?from=2026-02-31&to=2026-03-01", "Invalid calendar date"],
    ["?from=2026-11-01&to=2026-10-31", "from must not be after to"],
  ];

  await withServer(service, async (baseUrl) => {
    for (const [query, message] of cases) {
      const response = await fetch(`${baseUrl}/api/sla-report${query}`);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: message });
    }
  });
});

test("GET /api/sla-report returns a safe error when the service fails", async () => {
  await withServer(
    { generate: async () => { throw new Error("secret internal detail"); } },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/sla-report?from=2026-10-01&to=2026-10-31`,
      );
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), {
        error: "unable to generate SLA report",
      });
    },
  );
});

test("GET /ready is unavailable until initialization succeeds", async () => {
  const readiness = createReadinessState();
  await withServer({}, async (baseUrl) => {
    let response = await fetch(`${baseUrl}/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ready: false });

    readiness.markReady();
    response = await fetch(`${baseUrl}/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ready: true });
  }, readiness);
});

test("GET /health remains available while readiness is pending", async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });
});
