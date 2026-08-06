import { describe, expect, it, vi } from "vitest";
import type { ApollosDiagnosis } from "../lib/apollos-diagnostics";
import { buildApollosRepairPlan } from "../lib/apollos-repair-planner";
import {
  APOLLOS_REPAIR_ADAPTER_POLICIES,
  buildApollosRepairAdapterRegistry,
} from "../lib/apollos-repair-adapters";

function plan(rootCauseCode: string) {
  const diagnosis: ApollosDiagnosis = {
    diagnosisId: "diagnosis-adapters",
    status: "failed",
    confidence: "confirmed",
    component: "Test",
    rootCauseCode,
    rootCause: "Test cause.",
    repairAuthority: "apollos",
    canApollosRepair: true,
    requiresApproval: false,
    recommendedRepair: "Repair.",
    verification: ["Verify."],
    evidence: [],
  };
  return buildApollosRepairPlan(diagnosis);
}

describe("buildApollosRepairAdapterRegistry", () => {
  it("allows only registered default evidence handlers", () => {
    const repairPlan = plan("APOLLOS_ROOT_VIDEO_RENDERER_FAILED");
    const handler = vi.fn(async () => ({
      verified: true,
      evidence: { preserved: true },
    }));
    const registry = buildApollosRepairAdapterRegistry({
      plan: repairPlan,
      handlers: { "preserve-render-inputs": handler },
      env: {},
    });
    expect(registry.decisions[0]).toMatchObject({
      stepKey: "preserve-render-inputs",
      allowed: true,
      reasonCode: "APOLLOS_REPAIR_ADAPTER_ALLOWED",
    });
    expect(registry.actions["preserve-render-inputs"]).toBeTypeOf("function");
    expect(registry.actions["prepare-renderer-fix"]).toBeUndefined();
  });

  it("blocks a policy when no handler is implemented", () => {
    const registry = buildApollosRepairAdapterRegistry({
      plan: plan("APOLLOS_ROOT_VIDEO_RENDERER_FAILED"),
      handlers: {},
      env: {},
    });
    expect(registry.decisions[0]).toMatchObject({
      allowed: false,
      reasonCode: "APOLLOS_REPAIR_ADAPTER_HANDLER_MISSING",
    });
  });

  it("keeps production-changing policies disabled by default", () => {
    for (const item of APOLLOS_REPAIR_ADAPTER_POLICIES.filter(
      (candidate) =>
        candidate.effect !== "read_only" &&
        candidate.effect !== "checkpoint_resume",
    )) {
      expect(item.defaultEnabled).toBe(false);
      expect(item.enableEnvironmentVariable).toBeTruthy();
      expect(item.requiresApproval).toBe(true);
    }
  });

  it("requires both an enable flag and a handler for a future adapter", () => {
    const repairPlan = plan("APOLLOS_ROOT_UPSTREAM_UNREACHABLE");
    const probe = vi.fn(async () => ({
      verified: true,
      evidence: { status: 200 },
    }));
    const disabled = buildApollosRepairAdapterRegistry({
      plan: repairPlan,
      handlers: { "probe-upstream-health": probe },
      env: {},
    });
    expect(disabled.decisions[0]?.reasonCode)
      .toBe("APOLLOS_REPAIR_ADAPTER_DISABLED");

    const enabled = buildApollosRepairAdapterRegistry({
      plan: repairPlan,
      handlers: { "probe-upstream-health": probe },
      env: { APOLLOS_REPAIR_ADAPTER_UPSTREAM_PROBE_ENABLED: "true" },
    });
    expect(enabled.decisions[0]?.allowed).toBe(true);
  });

  it("lets the per-adapter kill switch override enablement", () => {
    const repairPlan = plan("APOLLOS_ROOT_UPSTREAM_UNREACHABLE");
    const registry = buildApollosRepairAdapterRegistry({
      plan: repairPlan,
      handlers: {
        "probe-upstream-health": async () => ({
          verified: true,
          evidence: { status: 200 },
        }),
      },
      env: {
        APOLLOS_REPAIR_ADAPTER_UPSTREAM_PROBE_ENABLED: "true",
        APOLLOS_REPAIR_ADAPTER_PROBE_UPSTREAM_HEALTH_KILL_SWITCH: "true",
      },
    });
    expect(registry.decisions[0]).toMatchObject({
      allowed: false,
      reasonCode: "APOLLOS_REPAIR_ADAPTER_DISABLED",
    });
  });

  it("rejects an adapter policy attached to the wrong root cause", () => {
    const upstream = plan("APOLLOS_ROOT_UPSTREAM_UNREACHABLE");
    const forged = {
      ...upstream,
      rootCauseCode: "APOLLOS_ROOT_VIDEO_RENDERER_FAILED",
    };
    const registry = buildApollosRepairAdapterRegistry({
      plan: forged,
      handlers: {
        "probe-upstream-health": async () => ({
          verified: true,
          evidence: {},
        }),
      },
      env: { APOLLOS_REPAIR_ADAPTER_UPSTREAM_PROBE_ENABLED: "true" },
    });
    expect(registry.decisions[0]?.reasonCode)
      .toBe("APOLLOS_REPAIR_ADAPTER_ROOT_CAUSE_DENIED");
  });

  it("rejects a weaker approval policy than the planned step", () => {
    const renderer = plan("APOLLOS_ROOT_VIDEO_RENDERER_FAILED");
    const forged = {
      ...renderer,
      steps: renderer.steps.map((step, index) =>
        index === 0 ? { ...step, requiresApproval: true } : step,
      ),
    };
    const registry = buildApollosRepairAdapterRegistry({
      plan: forged,
      handlers: {
        "preserve-render-inputs": async () => ({
          verified: true,
          evidence: {},
        }),
      },
      env: {},
    });
    expect(registry.decisions[0]?.reasonCode)
      .toBe("APOLLOS_REPAIR_ADAPTER_APPROVAL_POLICY_WEAK");
  });

  it("aborts and rejects adapters that exceed their runtime ceiling", async () => {
    vi.useFakeTimers();
    try {
      const renderer = plan("APOLLOS_ROOT_VIDEO_RENDERER_FAILED");
      const registry = buildApollosRepairAdapterRegistry({
        plan: renderer,
        handlers: {
          "preserve-render-inputs": ({ signal }) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener(
                "abort",
                () => reject(new Error(String(signal.reason))),
                { once: true },
              );
            }),
        },
        env: {},
      });
      const pending = registry.actions["preserve-render-inputs"]!({
        sourceTaskId: "source",
        repairTaskId: "repair",
        plan: renderer,
        stepKey: "preserve-render-inputs",
        signal: new AbortController().signal,
      });
      await vi.advanceTimersByTimeAsync(10_001);
      await expect(pending).rejects.toThrow("APOLLOS_REPAIR_ADAPTER_TIMEOUT");
    } finally {
      vi.useRealTimers();
    }
  });

  it("freezes policies and registry results", () => {
    const repairPlan = plan("APOLLOS_ROOT_VIDEO_RENDERER_FAILED");
    const registry = buildApollosRepairAdapterRegistry({
      plan: repairPlan,
      handlers: {
        "preserve-render-inputs": async () => ({
          verified: true,
          evidence: {},
        }),
      },
      env: {},
    });
    expect(Object.isFrozen(APOLLOS_REPAIR_ADAPTER_POLICIES)).toBe(true);
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.actions)).toBe(true);
    expect(Object.isFrozen(registry.decisions)).toBe(true);
  });
});
