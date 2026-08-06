import { describe, expect, it } from "vitest";
import type { ApollosDiagnosis } from "../lib/apollos-diagnostics";
import { buildApollosRepairPlan } from "../lib/apollos-repair-planner";

function diagnosis(
  rootCauseCode: string,
  overrides: Partial<ApollosDiagnosis> = {},
): ApollosDiagnosis {
  return {
    diagnosisId: "diagnosis-123",
    status: "failed",
    confidence: "confirmed",
    component: "Test component",
    rootCauseCode,
    rootCause: "Evidence-backed test cause.",
    repairAuthority: "apollos",
    canApollosRepair: true,
    requiresApproval: false,
    recommendedRepair: "Repair it.",
    verification: ["Verify the original operation."],
    evidence: [],
    ...overrides,
  };
}

describe("buildApollosRepairPlan", () => {
  it("produces a stable plan bound to the diagnosis", () => {
    const first = buildApollosRepairPlan(diagnosis("APOLLOS_ROOT_VIDEO_RENDERER_FAILED"));
    const second = buildApollosRepairPlan(diagnosis("APOLLOS_ROOT_VIDEO_RENDERER_FAILED"));
    expect(first.planId).toBe(second.planId);
    expect(first.diagnosisId).toBe("diagnosis-123");
  });

  it("does not invent a repair when evidence is unknown", () => {
    const plan = buildApollosRepairPlan(diagnosis(
      "APOLLOS_ROOT_CAUSE_UNCLASSIFIED",
      { confidence: "unknown", canApollosRepair: false },
    ));
    expect(plan).toMatchObject({
      status: "insufficient_evidence",
      canApollosExecute: false,
      approvalRequired: false,
    });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      key: "collect-causal-evidence",
      effect: "read_only",
    });
  });

  it("marks every mutable effect as approval gated", () => {
    const roots = [
      "APOLLOS_ROOT_PROVIDER_CREDITS_EXHAUSTED",
      "APOLLOS_ROOT_PROVIDER_NOT_CONFIGURED",
      "APOLLOS_ROOT_GOOGLE_CERTIFICATE_PATH_INVALID",
      "APOLLOS_ROOT_VIDEO_RENDERER_FAILED",
      "APOLLOS_ROOT_MEDIA_STORAGE_FAILED",
      "APOLLOS_ROOT_EXECUTION_BINDING_MISMATCH",
      "APOLLOS_ROOT_AUTHENTICATION_FAILED",
      "APOLLOS_ROOT_PERMISSION_DENIED",
    ];
    for (const root of roots) {
      const plan = buildApollosRepairPlan(diagnosis(root));
      for (const repairStep of plan.steps) {
        if (repairStep.effect !== "read_only" && repairStep.effect !== "checkpoint_resume") {
          expect(repairStep.requiresApproval).toBe(true);
        }
      }
    }
  });

  it("keeps provider spending and credentials under operator control", () => {
    const credits = buildApollosRepairPlan(
      diagnosis("APOLLOS_ROOT_PROVIDER_CREDITS_EXHAUSTED", {
        repairAuthority: "operator",
        canApollosRepair: false,
      }),
    );
    const configuration = buildApollosRepairPlan(
      diagnosis("APOLLOS_ROOT_PROVIDER_NOT_CONFIGURED", {
        repairAuthority: "operator",
        canApollosRepair: false,
      }),
    );
    expect(credits.status).toBe("manual_required");
    expect(credits.steps.find((item) => item.key === "restore-provider-balance"))
      .toMatchObject({ executableByApollos: false, requiresApproval: true });
    expect(configuration.steps.find((item) => item.key === "correct-provider-config"))
      .toMatchObject({ executableByApollos: false, effect: "credential_change" });
  });

  it("preserves, tests, deploys, and verifies renderer repairs", () => {
    const plan = buildApollosRepairPlan(diagnosis("APOLLOS_ROOT_VIDEO_RENDERER_FAILED"));
    expect(plan.status).toBe("approval_required");
    expect(plan.steps.map((item) => item.key)).toEqual([
      "preserve-render-inputs",
      "reproduce-render-failure",
      "prepare-renderer-fix",
      "deploy-renderer-fix",
      "rerun-video-checkpoint",
    ]);
    expect(plan.steps.find((item) => item.key === "deploy-renderer-fix"))
      .toMatchObject({ effect: "deployment_change", requiresApproval: true });
    expect(plan.finalVerification).toEqual(["Verify the original operation."]);
  });

  it("requires a fresh plan after an execution binding mismatch", () => {
    const plan = buildApollosRepairPlan(
      diagnosis("APOLLOS_ROOT_EXECUTION_BINDING_MISMATCH", {
        canApollosRepair: false,
        requiresApproval: true,
      }),
    );
    expect(plan.status).toBe("approval_required");
    expect(plan.steps.map((item) => item.key)).toContain("create-fresh-plan");
    expect(plan.steps.map((item) => item.key)).toContain("request-fresh-approval");
  });

  it("permits only bounded recovery plans to be automatic", () => {
    for (const root of [
      "APOLLOS_ROOT_EXECUTION_LEASE",
      "APOLLOS_ROOT_PROVIDER_RATE_LIMITED",
      "APOLLOS_ROOT_UPSTREAM_UNREACHABLE",
    ]) {
      const plan = buildApollosRepairPlan(diagnosis(root));
      expect(plan.status).toBe("ready");
      expect(plan.canApollosExecute).toBe(true);
      expect(plan.approvalRequired).toBe(false);
    }
  });

  it("returns no repair for a healthy task", () => {
    const plan = buildApollosRepairPlan(diagnosis(
      "APOLLOS_NO_FAILURE_DETECTED",
      { status: "healthy", confidence: "confirmed" },
    ));
    expect(plan).toMatchObject({
      status: "not_required",
      canApollosExecute: false,
      approvalRequired: false,
    });
    expect(plan.steps).toEqual([]);
  });

  it("freezes the plan and all steps", () => {
    const plan = buildApollosRepairPlan(diagnosis("APOLLOS_ROOT_VIDEO_RENDERER_FAILED"));
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.steps)).toBe(true);
    expect(plan.steps.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(plan.finalVerification)).toBe(true);
  });
});
