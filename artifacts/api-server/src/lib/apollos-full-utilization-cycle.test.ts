import { describe, expect, it, vi } from "vitest";

import {
  buildApollosActivationPlan,
  buildApollosClientCoverage,
} from "./apollos-client-orchestrator";
import type { ApollosLiveCoverageSuccess } from "./apollos-client-coverage-live";
import {
  ApollosFullUtilizationCycleRunner,
  type ApollosCycleSafeActionRunner,
} from "./apollos-full-utilization-cycle";

function live(activeFeatures: string[], clientId = "client-bbb"): ApollosLiveCoverageSuccess {
  const coverage = buildApollosClientCoverage({
    client: { id: clientId, name: "Bed Bugs & Beyond", industry: "pest_control" },
    evidence: { activeFeatures },
  });
  return {
    ok: true,
    context: {
      clientId,
      clientName: "Bed Bugs & Beyond",
      industry: "pest_control",
      industryLabel: "Pest Control",
      region: "Baldwin County, Alabama",
      serviceAreas: ["Foley, AL"],
      configuredPlatforms: ["facebook"],
      approvalMode: "approval_required",
      frequency: "weekly",
      serviceNames: ["Bed Bug Treatment"],
    },
    evidence: { activeFeatures },
    coverage,
    activationPlan: buildApollosActivationPlan(coverage),
  };
}

function runnerThatExecutesAiVisibility(): ApollosCycleSafeActionRunner {
  return {
    execute: vi.fn(async ({ live: current, capabilityKey }) => {
      if (capabilityKey === "ai_visibility_monitoring") {
        return {
          status: "executed" as const,
          capabilityKey: "ai_visibility_monitoring" as const,
          clientId: current.context.clientId,
          clientName: current.context.clientName,
          sideEffects: true as const,
          externalSideEffects: false as const,
          effectScope: "ai_edge_internal_state_only" as const,
          providerCalls: false as const,
          spendAuthorized: false as const,
          generatedAt: "2026-08-09T18:00:00.000Z",
          recommendationCount: 2,
          coverageSourceCount: 3,
          rejectedCount: 0,
        };
      }
      return {
        status: "handler_not_implemented" as const,
        capabilityKey,
        sideEffects: false as const,
        gate: "SAFE_AUTOMATIC_ACTION",
        reason: "No approved handler.",
      };
    }),
  };
}

describe("ApollosFullUtilizationCycleRunner", () => {
  it("executes available safe handlers, refreshes state, and returns the remaining queue", async () => {
    const initial = live(["discovery_engine"]);
    const refreshed = live(["discovery_engine", "ai_visibility_monitoring"]);
    const buildLive = vi.fn(async () => refreshed);
    const safeActions = runnerThatExecutesAiVisibility();

    const result = await new ApollosFullUtilizationCycleRunner(buildLive, safeActions).run({
      ownerUserId: "clerk-owner-bbb",
      initialLive: initial,
    });

    expect(result.mission).toBe("maximize_ai_edge_utilization");
    expect(result.sideEffects).toBe(true);
    expect(result.executedCapabilityKeys).toContain("ai_visibility_monitoring");
    expect(result.finalCoverageScore).toBeGreaterThanOrEqual(result.initialCoverageScore);
    expect(result.remainingAutomaticCapabilityKeys).toContain("measurement_engine");
    expect(result.remainingHumanActions.some((item) => item.gate !== "SAFE_AUTOMATIC_ACTION")).toBe(true);
    expect(buildLive).toHaveBeenCalledWith("clerk-owner-bbb");
  });

  it("continues past safe-marked capabilities that have no implemented handler", async () => {
    const noHandler: ApollosCycleSafeActionRunner = {
      execute: vi.fn(async ({ capabilityKey }) => ({
        status: "handler_not_implemented" as const,
        capabilityKey,
        sideEffects: false as const,
        gate: "SAFE_AUTOMATIC_ACTION",
        reason: "No approved handler.",
      })),
    };
    const buildLive = vi.fn(async () => live(["discovery_engine"]));

    const result = await new ApollosFullUtilizationCycleRunner(buildLive, noHandler).run({
      ownerUserId: "clerk-owner-bbb",
      initialLive: live(["discovery_engine"]),
    });

    expect(result.sideEffects).toBe(false);
    expect(result.executedCapabilityKeys).toEqual([]);
    expect(result.attemptedSafeActions.length).toBeGreaterThan(0);
    expect(buildLive).not.toHaveBeenCalled();
  });

  it("fails closed if a successful action refresh resolves to a different client", async () => {
    const buildLive = vi.fn(async () => live(
      ["discovery_engine", "ai_visibility_monitoring"],
      "client-other",
    ));

    await expect(new ApollosFullUtilizationCycleRunner(
      buildLive,
      runnerThatExecutesAiVisibility(),
    ).run({
      ownerUserId: "clerk-owner-bbb",
      initialLive: live(["discovery_engine"]),
    })).rejects.toThrow("APOLLOS_CYCLE_CLIENT_RESOLUTION_MISMATCH");
  });
});
