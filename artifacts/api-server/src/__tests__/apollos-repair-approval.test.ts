import { describe, expect, it } from "vitest";
import { evaluateTask } from "../lib/approval-engine";

describe("execute_repair_plan approval boundary", () => {
  it("requires review for an exactly bound repair request", () => {
    expect(evaluateTask("execute_repair_plan", {
      sourceTaskId: "task-123",
      planId: "plan-123",
      diagnosisId: "diagnosis-123",
    })).toEqual({
      decision: "requires_review",
      ruleId: "REPAIR_PLAN_EXACT_BINDING_REVIEW",
      reason: "Repair execution requires review of the exact diagnosis-bound plan",
    });
  });

  it.each(["sourceTaskId", "planId", "diagnosisId"])(
    "rejects a missing %s binding",
    (field) => {
      const payload: Record<string, string> = {
        sourceTaskId: "task-123",
        planId: "plan-123",
        diagnosisId: "diagnosis-123",
      };
      delete payload[field];
      expect(evaluateTask("execute_repair_plan", payload)).toMatchObject({
        decision: "rejected",
        ruleId: "REPAIR_PLAN_BINDING_INVALID",
      });
    },
  );

  it("does not trust a caller claiming no approval is required", () => {
    expect(evaluateTask("execute_repair_plan", {
      sourceTaskId: "task-123",
      planId: "plan-123",
      diagnosisId: "diagnosis-123",
      approvalRequired: false,
      canApollosExecute: true,
    }).decision).toBe("requires_review");
  });
});
