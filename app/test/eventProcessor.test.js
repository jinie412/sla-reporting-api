import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { processRequestEvents } from "../src/domain/eventProcessor.js";

describe("Domain: processRequestEvents", () => {
  test("uses the earliest valid processing event and current staff name", () => {
    const result = processRequestEvents(
      [
        { id: 3, status: "processing", at: 30, actor_id: 2 },
        { id: 1, status: "processing", at: 10, actor_id: null },
        { id: 2, status: "processing", at: 20, actor_id: 1 },
      ],
      [
        { id: 1, name: "Current Name" },
        { id: 2, name: "Later Responder" },
      ],
    );

    assert.deepEqual(result, {
      responderId: 1,
      responder: "Current Name",
      responseAt: 20,
      completedAt: null,
      dueAt: null,
    });
  });

  test("ignores both sides of a reverted event and retains the latest completion and deadline", () => {
    const result = processRequestEvents(
      [
        { id: 1, status: "processing", at: 10, actor_id: 1 },
        { id: 2, status: "complete", at: 20, actor_id: 1, due_at: "01/10/2026 09:00" },
        { id: 3, status: "pending", at: 30, reverts_id: 1 },
        { id: 4, status: "complete", at: 40, actor_id: 2 },
        { id: 5, status: "pending", at: 50, due_at: "02/10/2026 10:00" },
      ],
      [{ id: 2, name: "Finisher" }],
    );

    assert.deepEqual(result, {
      responderId: null,
      responder: null,
      responseAt: null,
      completedAt: 40,
      dueAt: "02/10/2026 10:00",
    });
  });
});
