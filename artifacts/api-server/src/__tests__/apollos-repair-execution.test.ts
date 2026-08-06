import { describe, expect, it } from "vitest";
import type { ApollosDiagnosis } from "../lib/apollos-diagnostics";
import {
  buildApollosRepairPlan,
  type ApollosRepairPlan,
} from "../lib/apollos-repair-planner";
import {
  createApollosRepairReceipt,
  decideApollosRepairExecution,
  type ApollosRepairStepReceipt,
} from "../lib/apollos-repair-execution";

function diagnosis(
  rootCauseCode: string,
  overrides: Partial<ApollosDiagnosis> = {},
): ApollosDiagnosis {
  return {
    diagnosisId: "diagnosis-guarded",
    status: "failed",
    confidence: "confirmed",
    component: "Test",
    rootCauseCode,
    rootCause: "Test evidence.",
    repairAuthority: "apollos",
    canApollosRepair: true,
    requiresApproval: false,
    recommendedRepair: "Repair.",
    verification: ["Verify final result."],
    evidence: [],
    ...overrides,
  };
}

function decide(
  plan: ApollosRepairPlan,
  overrides: Partial<Parameters<typeof decideApollosRepairExecution>[0]> = {},
) {
  return decideApollosRepairExecution({
    plan,
    currentDiagnosisId: plan.diagnosisId,
    currentPlanId: plan.planId,
    approvedPlanId: null,
    approvedDiagnosisId: null,
    receipts: [],
    ...overrides,
  });
}

function verified(
  plan: ApollosRepairPlan,
  stepKey: string,
): ApollosRepairStepReceipt {
  const step = plan.steps.find((item) => item.key === stepKey)!;
  return createApollosRepairReceipt({
    plan,
    step,
    status: "verified",
    verificationEvidence: { ok: true, stepKey },
    completedAt: "2026-08-06T18:00:00.000Z",
  });
}

describe("decideApollosRepairExecution", () => {
  it("stops immediately when the diagnosis changes", () => {
    const plan = buildApollosRepairPlan(
      diagnosis("APOLLOS_ROOT_VIDEO_RENDERER_FAILED"),
    );
    expect(decide(plan, { currentDiagnosisId: "new-diagnosis" })).toMatchObject({
      action: "stop_stale_evidence",
      reasonCode: "APOLLOS_REPAIR_EVIDENCE_CHANGED",
      nextStep: null,
    });
  });

  it("stops immediately when the plan changes", () => {
    const plan = buildApollosRepairPlan(
      diagnosis("APOLLOS_ROOT_VIDEO_RENDERER_FAILED"),
    );
    expect(decide(plan, { currentPlanId: "new-plan" }).action)
      .toBe("stop_stale_evidence");
  });

  it("allows evidence inspection before approval", () => {
    const plan = buildApollosRepairPlan(
      diagnosis("APOLLOS_ROOT_VIDEO_RENDERER_FAILED"),
    );
    expect(decide(plan)).toMatchObject({
      action: "run",
      reasonCode: "APOLLOS_REPAIR_INSPECTION_READY",
      nextStep: { key: "preserve-render-inputs", effect: "read_only" },
    });
  });

  it("blocks the first mutable step until the exact plan is approved", () => {
    const plan = buildApollosRepairPlan(
      diagnosis("APOLLOS_ROOT_VIDEO_RENDERER_FAILED"),
    );
    const receipts = [
      verified(plan, "preserve-render-inputs"),
      verified(plan, "reproduce-render-failure"),
    ];
    expect(decide(plan, { receipts })).toMatchObject({
      action: "wait_for_approval",
      reasonCode: "APOLLOS_REPAIR_PLAN_APPROVAL_REQUIRED",
      nextStep: { key: "prepare-renderer-fix" },
    });
    expect(decide(plan, {
      receipts,
      approvedPlanId: plan.planId,
      approvedDiagnosisId: plan.diagnosisId,
    })).toMatchObject({
      action: "run",
      reasonCode: "APOLLOS_REPAIR_APPROVED_STEP_READY",
    });
  });

  it("does not accept approval for a different diagnosis", () => {
    const plan = buildApollosRepairPlan(
      diagnosis("APOLLOS_ROOT_VIDEO_RENDERER_FAILED"),
    );
    const receipts = [
      verified(plan, "preserve-render-inputs"),
      verified(plan, "reproduce-render-failure"),
    ];
    expect(decide(plan, {
      receipts,
      approvedPlanId: plan.planId,
      approvedDiagnosisId: "old-diagnosis",
    }).action).toBe("wait_for_approval");
  });

  it("permits only ordered, verified progression", () => {
    const plan = buildApollosRepairPlan(
      diagnosis("APOLLOS_ROOT_UPSTREAM_UNREACHABLE"),
    );
    const forgedLaterReceipt = verified(plan, "retry-upstream-checkpoint");
    const result = decide(plan, { receipts: [forgedLaterReceipt] });
    expect(result).toMatchObject({
      action: "run",
      nextStep: { key: "probe-upstream-health" },
      completedSteps: 1,
    });
  });

  it("allows a bounded checkpoint resume after inspection verification", () => {
    const plan = buildApollosRepairPlan(
      diagnosis("APOLLOS_ROOT_UPSTREAM_UNREACHABLE"),
    );
    const result = decide(plan, {
      receipts: [verified(plan, "probe-upstream-health")],
    });
    expect(result).toMatchObject({
      action: "run",
      reasonCode: "APOLLOS_REPAIR_BOUNDED_RESUME_READY",
      nextStep: { key: "retry-upstream-checkpoint" },
    });
  });

  it("never runs operator-only provider spending", () => {
    const plan = buildApollosRepairPlan(
      diagnosis("APOLLOS_ROOT_PROVIDER_CREDITS_EXHAUSTED", {
        repairAuthority: "operator",
        canApollosRepair: false,
      }),
    );
    expect(decide(plan)).toMatchObject({
      action: "wait_for_operator",
      reasonCode: "APOLLOS_REPAIR_OPERATOR_ACTION_REQUIRED",
    });
  });

  it("completes only after every plan step has a verified receipt", () => {
    const plan = buildApollosRepairPlan(
      diagnosis("APOLLOS_ROOT_UPSTREAM_UNREACHABLE"),
    );
    const receipts = plan.steps.map((item) => verified(plan, item.key));
    expect(decide(plan, { receipts })).toMatchObject({
      action: "complete",
      reasonCode: "APOLLOS_REPAIR_ALL_STEPS_VERIFIED",
      completedSteps: plan.steps.length,
    });
  });
});

describe("createApollosRepairReceipt", () => {
  it("binds verification evidence to the plan, diagnosis, and step", () => {
    const plan = buildApollosRepairPlan(
      diagnosis("APOLLOS_ROOT_UPSTREAM_UNREACHABLE"),
    );
    const receipt = verified(plan, "probe-upstream-health");
    expect(receipt).toMatchObject({
      planId: plan.planId,
      diagnosisId: plan.diagnosisId,
      stepKey: "probe-upstream-health",
      status: "verified",
    });
    expect(receipt.evidenceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it("rejects a receipt for a step outside the plan", () => {
    const plan = buildApollosRepairPlan(
      diagnosis("APOLLOS_ROOT_UPSTREAM_UNREACHABLE"),
    );
    expect(() => createApollosRepairReceipt({
      plan,
      step: { ...plan.steps[0]!, key: "forged-step" },
      status: "verified",
      verificationEvidence: { ok: true },
      completedAt: "2026-08-06T18:00:00.000Z",
    })).toThrow("APOLLOS_REPAIR_RECEIPT_STEP_NOT_IN_PLAN");
  });
});
