import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { calculateBusinessMinutes } from "../src/domain/businessTime.js";

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

describe("Domain: calculateBusinessMinutes", () => {
  test("counts only the overlap with business hours", () => {
    assert.equal(
      calculateBusinessMinutes({
        startAt: "2026-10-05T01:00:00Z", // 08:00 Bangkok
        endAt: "2026-10-05T11:00:00Z", // 18:00 Bangkok
        site,
      }),
      480,
    );
  });

  test("excludes weekends and configured holidays", () => {
    assert.equal(
      calculateBusinessMinutes({
        startAt: "2026-10-02T02:00:00Z", // Friday 09:00 Bangkok
        endAt: "2026-10-06T10:00:00Z", // Tuesday 17:00 Bangkok
        site,
        holidays: ["05/10/2026"],
      }),
      960,
    );
  });

  test("returns zero for invalid or non-positive ranges", () => {
    assert.equal(calculateBusinessMinutes({ startAt: "bad", endAt: "2026-10-05", site }), 0);
    assert.equal(
      calculateBusinessMinutes({
        startAt: "2026-10-05T10:00:00Z",
        endAt: "2026-10-05T09:00:00Z",
        site,
      }),
      0,
    );
  });
});
