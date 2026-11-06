import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { HelpdeskApiError, HelpdeskClient } from "../src/helpdesk.js";
import { HelpdeskDataService } from "../src/services/helpdeskDataService.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("fetchRequests follows all pages and deduplicates IDs", async () => {
  const calls = [];
  const client = {
    async get(path, params) {
      calls.push([path, params]);
      return params.page === 1
        ? { data: [{ id: 1 }, { id: 2 }], total_pages: 2 }
        : { data: [{ id: 2 }, { id: 3 }], total_pages: 2 };
    },
  };

  const requests = await new HelpdeskDataService({ client }).fetchRequests();

  assert.deepEqual(requests, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.deepEqual(calls, [
    ["/v1/requests", { page: 1, per_page: 100 }],
    ["/v1/requests", { page: 2, per_page: 100 }],
  ]);
});

test("fetchChanges follows cursors, maps and sorts unique events", async () => {
  let call = 0;
  const client = {
    async get(path, params) {
      assert.equal(path, "/v1/changes");
      call += 1;
      if (call === 1) {
        assert.deepEqual(params, { limit: 500 });
        return {
          data: [
            { type: "event.created", request_id: 7, event: { id: 2, at: 20 } },
            { type: "event.created", request_id: 7, event: { id: 1, at: 10 } },
          ],
          next_cursor: "next",
          has_more: true,
        };
      }
      assert.deepEqual(params, { limit: 500, cursor: "next" });
      return {
        data: [
          { type: "event.created", request_id: 7, event: { id: 2, at: 20 } },
          { type: "request.updated", request: { id: 7, status: "complete" } },
        ],
        next_cursor: "end",
        has_more: false,
      };
    },
  };

  const result = await new HelpdeskDataService({ client }).fetchChanges();

  assert.deepEqual(result.eventsByRequestId, {
    7: [
      { id: 1, at: 10 },
      { id: 2, at: 20 },
    ],
  });
  assert.deepEqual(result.requestSnapshots.get("7"), {
    id: 7,
    status: "complete",
  });
  assert.equal(result.changesCursor, "end");
});

test("fetchChanges restarts once after cursor expiration", async () => {
  let call = 0;
  const client = {
    async get(path, params) {
      assert.equal(path, "/v1/changes");
      call += 1;
      if (call === 1) {
        return {
          data: [
            { type: "event.created", request_id: 1, event: { id: 1, at: 1 } },
          ],
          next_cursor: "expired",
          has_more: true,
        };
      }
      if (call === 2) {
        throw new HelpdeskApiError("expired", { status: 410, pathname: path });
      }
      return {
        data: [
          { type: "event.created", request_id: 1, event: { id: 2, at: 2 } },
        ],
        next_cursor: null,
        has_more: false,
      };
    },
  };

  const result = await new HelpdeskDataService({ client }).fetchChanges();

  assert.equal(call, 3);
  assert.deepEqual(result.eventsByRequestId, {
    1: [{ id: 2, at: 2 }],
  });
});

test("ingest fetches holidays for each site with the expected representation", async () => {
  const calls = [];
  const client = {
    async get(path, params) {
      calls.push([path, params]);
      if (path === "/v1/requests") return { data: [{ id: 1 }], total_pages: 1 };
      if (path === "/v1/changes")
        return { data: [], next_cursor: null, has_more: false };
      if (path === "/v1/sites") return { data: [{ id: 11 }, { id: 12 }] };
      if (path === "/v1/staff") return { data: [{ id: 4, name: "Staff" }] };
      if (path.endsWith("/holidays")) return { data: [{ date: "01/01/2026" }] };
      throw new Error(`unexpected path ${path}`);
    },
  };

  const result = await new HelpdeskDataService({
    client,
    concurrency: 1,
  }).ingest();

  assert.deepEqual(result.holidaysBySiteId, {
    11: [{ date: "01/01/2026" }],
    12: [{ date: "01/01/2026" }],
  });
  assert.equal(calls.filter(([path]) => path.endsWith("/holidays")).length, 2);
});

test("client retries 429, sends bearer auth, parses JSON, and hides token in errors", async () => {
  const token = "secret-token";
  const waits = [];
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(new URL(url).searchParams.get("page"), "1");
    if (calls === 1)
      return jsonResponse({ error: "busy" }, 429, { "Retry-After": "0" });
    return jsonResponse({ ok: true });
  };

  const client = new HelpdeskClient({
    baseUrl: "https://example.test",
    token,
    sleep: async (milliseconds) => waits.push(milliseconds),
  });

  assert.deepEqual(await client.get("/v1/requests", { page: 1 }), { ok: true });
  assert.deepEqual(waits, [0]);
  assert.equal(calls, 2);

  globalThis.fetch = async () => jsonResponse({ error: token }, 500);
  await assert.rejects(
    client.get("/v1/requests"),
    (error) => error.status === 500 && !error.message.includes(token),
  );
});

test("service propagates API errors", async () => {
  const expected = new Error("unavailable");
  const service = new HelpdeskDataService({
    client: {
      get: async () => {
        throw expected;
      },
    },
  });

  await assert.rejects(service.fetchRequests(), (error) => error === expected);
});

test("fetchRequests rejects missing or invalid data", async () => {
  for (const response of [{}, { data: {} }]) {
    const service = new HelpdeskDataService({
      client: { get: async () => response },
    });
    await assert.rejects(
      service.fetchRequests(),
      /Malformed \/v1\/requests response: data must be an array/,
    );
  }
});

test("fetchRequests rejects invalid pagination metadata", async () => {
  const service = new HelpdeskDataService({
    client: {
      get: async () => ({ data: [], total_pages: 0 }),
    },
  });

  await assert.rejects(
    service.fetchRequests(),
    /total_pages must be a positive integer/,
  );
});

test("fetchChanges rejects has_more without a cursor", async () => {
  const service = new HelpdeskDataService({
    client: {
      get: async () => ({
        data: [],
        has_more: true,
        next_cursor: null,
      }),
    },
  });

  await assert.rejects(
    service.fetchChanges(),
    /has_more requires a valid next_cursor/,
  );
});

test("equal event timestamps have stable ID ordering", async () => {
  const service = new HelpdeskDataService({
    client: {
      get: async () => ({
        data: [
          { type: "event.created", request_id: 1, event: { id: 20, at: 5 } },
          { type: "event.created", request_id: 1, event: { id: 10, at: 5 } },
        ],
        has_more: false,
        next_cursor: null,
      }),
    },
  });

  const result = await service.fetchChanges();

  assert.deepEqual(result.eventsByRequestId[1].map((event) => event.id), [10, 20]);
});

test("client uses exponential backoff when Retry-After is absent", async () => {
  const waits = [];
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls < 3 ? jsonResponse({}, 429) : jsonResponse({ ok: true });
  };

  const client = new HelpdeskClient({
    baseUrl: "https://example.test",
    token: "secret-token",
    maxRetries: 2,
    sleep: async (milliseconds) => waits.push(milliseconds),
  });

  assert.deepEqual(await client.get("/v1/requests"), { ok: true });
  assert.deepEqual(waits, [1000, 2000]);
  assert.equal(calls, 3);
});
