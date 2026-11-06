import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isEligibleRequest } from "../src/domain/requestEligibility.js";

describe("Domain: isEligibleRequest", () => {
  const mockSite = { timezone: "Asia/Singapore" }; 
  const from = "2026-10-01";
  const to = "2026-10-31";

  test("1. Returns TRUE for a valid request fully within the month", () => {
    const request = {
      status: "complete",
      created_at: "2026-10-15T10:00:00Z", 
      deleted_at: null,
      merged_into_id: null,
    };
    assert.equal(isEligibleRequest(request, mockSite, from, to), true);
  });

  test("2. Returns FALSE if the request is canceled, deleted, or merged", () => {
    const baseRequest = { created_at: "2026-10-15T10:00:00Z" };

    assert.equal(
      isEligibleRequest(
        { ...baseRequest, status: "canceled" },
        mockSite,
        from,
        to,
      ),
      false,
    );
    assert.equal(
      isEligibleRequest(
        { ...baseRequest, deleted_at: "2026-10-16" },
        mockSite,
        from,
        to,
      ),
      false,
    );
    assert.equal(
      isEligibleRequest(
        { ...baseRequest, merged_into_id: 123 },
        mockSite,
        from,
        to,
      ),
      false,
    );
  });

  test("3. TIMEZONE EDGE CASE 1: Request is in late September (UTC) but in October (local time)", () => {
    const request = {
      status: "pending",
      // 17:00 on September 30 UTC -> 01:00 on October 1 in Singapore
      created_at: "2026-09-30T17:00:00Z",
    };
    // Must be included in the October report
    assert.equal(isEligibleRequest(request, mockSite, from, to), true);
  });

  test("4. TIMEZONE EDGE CASE 2: Request is in late October (UTC) but in November (local time)", () => {
    const request = {
      status: "pending",
      // 22:00 on October 31 UTC -> 06:00 on November 1 in Singapore
      created_at: "2026-10-31T22:00:00Z",
    };
    // Must be excluded from the October report
    assert.equal(isEligibleRequest(request, mockSite, from, to), false);
  });

  test("5. Returns FALSE if the data is missing or incorrectly formatted", () => {
    assert.equal(isEligibleRequest(null, mockSite, from, to), false);
    assert.equal(
      isEligibleRequest(
        { created_at: "invalid-date-string" },
        mockSite,
        from,
        to,
      ),
      false,
    );
    assert.equal(
      isEligibleRequest(
        { created_at: "2026-10-15T10:00:00Z" },
        { timezone: null },
        from,
        to,
      ),
      false,
    );
  });
});
