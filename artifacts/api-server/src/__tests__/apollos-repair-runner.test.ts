import { describe, expect, it, vi } from "vitest";
import type { ApollosDiagnosis } from "../lib/apollos-diagnostics";
import { buildApollosRepairPlan } from "../lib/apollos-repair-planner";
import { runApollosRepairPlan } from "../lib/apollos-repair-runner";

function diagnosis(rootCauseCode: string): ApollosDiagnosis {
  return {
    diagnosisId: "diagnosis-runner",
    status: "failed",
    confidence: "confirmed",
    component: "Test",
    rootCauseCode,
    rootCause: "Test evidence.",
    repairAuthority: "apollos",
    canApollosRepair: true,
    requiresApproval: false,
    recommendedRepair: "Repair.",
    verification: ["Verify final operation."],
    evidence: [],
  };
}

function baseInput(rootCauseCode: string) {
  const plan = buildApollosRepairPlan(diagnosis(rootCauseCode));
  return {
    plan,
    input: {
      sourceTaskId: "source-task",
      repairTaskId: "repair-task",
      plan,
      approvedPlanId: null,
      approvedDiagnosisId: null,
      receipts: [],
      signal: new AbortController().signal,
    },
  };
}

describe("runApollosRepairPlan", () => {
  it("runs registered bounded actions and completes with persisted receipts", async () => {
    const { plan, input } = baseInput("APOLLOS_ROOT_UPSTREAM_UNREACHABLE");
    const persisted: unknown[] = [];
    const result = await runApollosRepairPlan(input, {
      actions: {
        "probe-upstream-health": async () => ({
          verified: true,
          evidence: { status: 200 },
        }),
        "retry-upstream-checkpoint": async () => ({
          verified: true,
          evidence: { receiptId: "provider-receipt" },
        }),
      },
      readCurrentBinding: async () => ({
        diagnosisId: plan.diagnosisId,
        planId: plan.planId,
      }),
      persistReceipt: async (receipt) => {
        persisted.push(receipt);
      },
      now: () => "2026-08-06T18:00:00.000Z",
    });

    expect(result).toMatchObject({
      status: "completed",
      completedSteps: 2,
      totalSteps: 2,
    });
    expect(persisted).toHaveLength(2);
    expect(result.receipts).toHaveLength(2);
  });

  it("stops before any action when evidence is stale", async () => {
    const { plan, input } = baseInput("APOLLOS_ROOT_UPSTREAM_UNREACHABLE");
    const action = vi.fn();
    const result = await runApollosRepairPlan(input, {
      actions: { "probe-upstream-health": action },
      readCurrentBinding: async () => ({
        diagnosisId: "new-diagnosis",
        planId: plan.planId,
      }),
      persistReceipt: vi.fn(),
      now: () => "2026-08-06T18:00:00.000Z",
    });
    expect(result.status).toBe("stopped_stale_evidence");
    expect(action).not.toHaveBeenCalled();
  });

  it("revalidates evidence after every action before writing a receipt", async () => {
    const { plan, input } = baseInput("APOLLOS_ROOT_UPSTREAM_UNREACHABLE");
    let reads = 0;
    const persistReceipt = vi.fn();
    const result = await runApollosRepairPlan(input, {
      actions: {
        "probe-upstream-health": async () => ({
          verified: true,
          evidence: { status: 200 },
        }),
      },
      readCurrentBinding: async () => {
        reads += 1;
        return reads === 1
          ? { diagnosisId: plan.diagnosisId, planId: plan.planId }
          : { diagnosisId: "changed-after-action", planId: plan.planId };
      },
      persistReceipt,
      now: () => "2026-08-06T18:00:00.000Z",
    });
    expect(result).toMatchObject({
      status: "stopped_stale_evidence",
      reasonCode: "APOLLOS_REPAIR_EVIDENCE_CHANGED_AFTER_ACTION",
    });
    expect(persistReceipt).not.toHaveBeenCalled();
  });

  it("blocks safely when no explicit action adapter is registered", async () => {
    const { plan, input } = baseInput("APOLLOS_ROOT_UPSTREAM_UNREACHABLE");
    const result = await runApollosRepairPlan(input, {
      actions: {},
      readCurrentBinding: async () => ({
        diagnosisId: plan.diagnosisId,
        planId: plan.planId,
      }),
      persistReceipt: vi.fn(),
      now: () => "2026-08-06T18:00:00.000Z",
    });
    expect(result).toMatchObject({
      status: "blocked_unsupported",
      reasonCode: "APOLLOS_REPAIR_ACTION_NOT_REGISTERED",
    });
  });

  it("persists a failed receipt and stops when verification fails", async () => {
    const { plan, input } = baseInput("APOLLOS_ROOT_UPSTREAM_UNREACHABLE");
    const persistReceipt = vi.fn();
    const result = await runApollosRepairPlan(input, {
      actions: {
        "probe-upstream-health": async () => ({
          verified: false,
          evidence: { status: 503 },
        }),
      },
      readCurrentBinding: async () => ({
        diagnosisId: plan.diagnosisId,
        planId: plan.planId,
      }),
      persistReceipt,
      now: () => "2026-08-06T18:00:00.000Z",
    });
    expect(result.status).toBe("verification_failed");
    expect(result.receipts[0]).toMatchObject({ status: "failed" });
    expect(persistReceipt).toHaveBeenCalledTimes(1);
  });

  it("runs pre-approval inspection but stops before a mutable step", async () => {
    const { plan, input } = baseInput("APOLLOS_ROOT_VIDEO_RENDERER_FAILED");
    const calls: string[] = [];
    const result = await runApollosRepairPlan(input, {
      actions: {
        "preserve-render-inputs": async ({ stepKey }) => {
          calls.push(stepKey);
          return { verified: true, evidence: { preserved: true } };
        },
        "reproduce-render-failure": async ({ stepKey }) => {
          calls.push(stepKey);
          return { verified: true, evidence: { reproduced: true } };
        },
        "prepare-renderer-fix": async ({ stepKey }) => {
          calls.push(stepKey);
          return { verified: true, evidence: { fixed: true } };
        },
      },
      readCurrentBinding: async () => ({
        diagnosisId: plan.diagnosisId,
        planId: plan.planId,
      }),
      persistReceipt: vi.fn(),
      now: () => "2026-08-06T18:00:00.000Z",
    });
    expect(result.status).toBe("waiting_for_approval");
    expect(calls).toEqual([
      "preserve-render-inputs",
      "reproduce-render-failure",
    ]);
  });

  it("honors cancellation before work begins", async () => {
    const { plan, input } = baseInput("APOLLOS_ROOT_UPSTREAM_UNREACHABLE");
    const controller = new AbortController();
    controller.abort();
    const action = vi.fn();
    const result = await runApollosRepairPlan(
      { ...input, signal: controller.signal },
      {
        actions: { "probe-upstream-health": action },
        readCurrentBinding: async () => ({
          diagnosisId: plan.diagnosisId,
          planId: plan.planId,
        }),
        persistReceipt: vi.fn(),
        now: () => "2026-08-06T18:00:00.000Z",
      },
    );
    expect(result.status).toBe("cancelled");
    expect(action).not.toHaveBeenCalled();
  });
});
