import { describe, expect, it } from "vitest";
import { evaluateTask, KNOWN_TASK_TYPES } from "../lib/approval-engine";

describe("weekly campaign approval boundary", () => {
  it("registers weekly_campaign as a known bounded task", () => {
    expect(KNOWN_TASK_TYPES).toContain("weekly_campaign");
  });

  it("always requires human review before weekly execution", () => {
    expect(
      evaluateTask("weekly_campaign", {
        batchKey: "weekly:user:2026-08-10:facebook,instagram,google_business,youtube",
      }),
    ).toEqual({
      decision: "requires_review",
      ruleId: "HIGH_STAKES_REVIEW",
      reason: "weekly_campaign always requires human review before execution",
    });
  });

  it("does not auto-approve weekly execution with an empty payload", () => {
    expect(evaluateTask("weekly_campaign", {}).decision).toBe("requires_review");
  });
});
