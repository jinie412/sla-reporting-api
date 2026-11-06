import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { calculateSla } from "../src/domain/slaCalculator.js";

const site = {
  timezone: "Asia/Bangkok",
  business_hours: {
    mon: { open: "09:00", close: "17:00" },
    tue: { open: "09:00", close: "17:00" },
    wed: { open: "09:00", close: "17:00" },
    thu: { open: "09:00", close: "17:00" },
    fri: { open: "09:00", close: "17:00" },
  },
};

describe("Domain: calculateSla", () => {
  test("calculates response target and completion against the site-local deadline", () => {
    const result = calculateSla(
      { id: 42, site_id: 7, priority: "High", created_at: "2026-10-05T02:00:00Z" },
      [
        { id: 1, status: "processing", actor_id: 9, at: 1791167400 },
        { id: 2, status: "complete", at: 1791169260, due_at: "05/10/2026 10:00" },
      ],
      site,
      [],
      [{ id: 9, name: "Ada" }],
    );

    assert.deepEqual(result, {
      id: 42,
      site_id: 7,
      responder_id: 9,
      responder: "Ada",
      response_business_minutes: 30,
      within_target: true,
      completed_late: true,
    });
  });

  test("returns null SLA fields without a response, completion, or deadline", () => {
    const result = calculateSla(
      { id: 43, site_id: 7, priority: null, created_at: "2026-10-05T02:00:00Z" },
      [],
      site,
      [],
      [],
    );

    assert.deepEqual(result, {
      id: 43,
      site_id: 7,
      responder_id: null,
      responder: null,
      response_business_minutes: null,
      within_target: null,
      completed_late: null,
    });
  });
});
