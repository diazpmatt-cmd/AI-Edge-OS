import { describe, expect, it, vi } from "vitest";

import {
  buildApollosActivationPlan,
  buildApollosClientCoverage,
} from "./apollos-client-orchestrator";
import type { ApollosLiveCoverageSuccess } from "./apollos-client-coverage-live";
import {
  ApollosSafeActionExecutor,
  type ApollosAiVisibilityRunner,
} from "./apollos-safe-action-executor";

function live(activeFeatures: string[] = ["discovery_engine"]): ApollosLiveCoverageSuccess {
  const coverage = buildApollosClientCoverage({
    client: {
      id: "client-bbb",
      name: "Bed Bugs & Beyond",
      industry: "pest_control",
    },
    evidence: { activeFeatures },
  });

  return {
    ok: true,
    context: {
      clientId: "client-bbb",
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

function fakeAiVisibilityRunner(): ApollosAiVisibilityRunner {
  return {
    execute: vi.fn(async () => ({
      generatedAt: new Date("2026-08-09T18:00:00.000Z"),
      recommendations: [{ id: 1 }, { id: 2 }],
      coverage: [{ id: 1 }],
      rejected: [],
    })),
  };
}

describe("ApollosSafeActionExecutor", () => {
  it("executes the canonical AI Visibility baseline for an authorized safe capability", async () => {
    const runner = fakeAiVisibilityRunner();
    const executor = new ApollosSafeActionExecutor(runner);

    const result = await executor.execute({
      live: live(),
      ownerUserId: "clerk-owner-bbb",
      capabilityKey: "ai_visibility_monitoring",
    });

    expect(runner.execute).toHaveBeenCalledWith({
      clientId: "client-bbb",
      userId: "clerk-owner-bbb",
    });
    expect(result).toMatchObject({
      status: "executed",
      capabilityKey: "ai_visibility_monitoring",
      sideEffects: true,
      externalSideEffects: false,
      providerCalls: false,
      spendAuthorized: false,
      recommendationCount: 2,
      coverageSourceCount: 1,
      rejectedCount: 0,
    });
  });

  it("rejects capabilities that require OAuth or another non-automatic gate", async () => {
    const result = await new ApollosSafeActionExecutor(fakeAiVisibilityRunner()).execute({
      live: live(),
      ownerUserId: "clerk-owner-bbb",
      capabilityKey: "facebook_social",
    });

    expect(result).toMatchObject({
      status: "execution_not_allowed",
      capabilityKey: "facebook_social",
      sideEffects: false,
      gate: "OAUTH_AUTHORIZATION_REQUIRED",
    });
  });

  it("does not auto-enable a safe-marked capability that lacks an approved handler", async () => {
    const result = await new ApollosSafeActionExecutor(fakeAiVisibilityRunner()).execute({
      live: live(),
      ownerUserId: "clerk-owner-bbb",
      capabilityKey: "discovery_engine",
    });

    expect(result).toMatchObject({
      status: "handler_not_implemented",
      capabilityKey: "discovery_engine",
      sideEffects: false,
    });
  });

  it("blocks AI Visibility execution until Discovery is active", async () => {
    const runner = fakeAiVisibilityRunner();
    const result = await new ApollosSafeActionExecutor(runner).execute({
      live: live([]),
      ownerUserId: "clerk-owner-bbb",
      capabilityKey: "ai_visibility_monitoring",
    });

    expect(result).toMatchObject({
      status: "execution_not_allowed",
      capabilityKey: "ai_visibility_monitoring",
      sideEffects: false,
      missingDependencies: ["discovery_engine"],
    });
    expect(runner.execute).not.toHaveBeenCalled();
  });

  it("fails closed for unknown capabilities", async () => {
    const result = await new ApollosSafeActionExecutor(fakeAiVisibilityRunner()).execute({
      live: live(),
      ownerUserId: "clerk-owner-bbb",
      capabilityKey: "imaginary_capability",
    });

    expect(result).toMatchObject({
      status: "capability_not_found",
      sideEffects: false,
    });
  });
});
