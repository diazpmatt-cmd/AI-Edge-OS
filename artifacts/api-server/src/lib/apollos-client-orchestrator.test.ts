import { describe, expect, it } from "vitest";

import {
  APOLLOS_CAPABILITY_REGISTRY,
  buildApollosActivationPlan,
  buildApollosClientCoverage,
  evaluateApollosCapability,
  explainApollosCoverageGap,
  inferApollosBusinessKind,
  type ApollosClientEvidence,
} from "./apollos-client-orchestrator";

const bbbClient = {
  id: "client-bbb",
  name: "Bed Bugs & Beyond",
  industry: "pest_control",
} as const;

const boatlinerClient = {
  id: "client-boatliner",
  name: "Boatliner Company",
  industry: "marine_services",
} as const;

function evidence(overrides: Partial<ApollosClientEvidence> = {}): ApollosClientEvidence {
  return {
    connectedIntegrations: ["facebook", "instagram", "google_business", "youtube"],
    activeFeatures: [
      "publishing:facebook",
      "publishing:instagram",
      "publishing:youtube",
      "content_autopilot",
      "review_automation",
      "ai_receptionist",
      "lead_recovery",
      "local_presence_engine",
      "discovery_engine",
      "authority_engine",
      "optimization_engine",
      "measurement_engine",
      "ai_visibility_monitoring",
    ],
    ...overrides,
  };
}

describe("canonical Apollos capability registry", () => {
  it("uses unique stable capability keys", () => {
    const keys = APOLLOS_CAPABILITY_REGISTRY.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("contains all seven AI Edge operating pillars", () => {
    expect(new Set(APOLLOS_CAPABILITY_REGISTRY.map((item) => item.pillar))).toEqual(
      new Set([
        "discovery",
        "content",
        "authority",
        "optimization",
        "measurement",
        "lead_conversion",
        "commerce",
      ]),
    );
  });

  it("keeps planned adapters out of coverage-score weight", () => {
    for (const capability of APOLLOS_CAPABILITY_REGISTRY.filter((item) => item.productStage === "planned")) {
      expect(capability.scoreWeight).toBe(0);
    }
  });
});

describe("business applicability", () => {
  it("classifies service businesses separately from commerce", () => {
    expect(inferApollosBusinessKind("pest_control")).toBe("local_service");
    expect(inferApollosBusinessKind("marine_services")).toBe("local_service");
    expect(inferApollosBusinessKind("ecommerce_retail")).toBe("commerce");
  });

  it("does not apply commerce-only capability to a local service tenant", () => {
    const sellerEdge = APOLLOS_CAPABILITY_REGISTRY.find((item) => item.key === "seller_edge_commerce")!;
    const result = evaluateApollosCapability({
      capability: sellerEdge,
      businessKind: "local_service",
      evidence: evidence(),
    });
    expect(result.status).toBe("NOT_APPLICABLE");
  });
});

describe("client coverage engine", () => {
  it("gives a fully activated local service tenant full score without counting planned adapters", () => {
    const coverage = buildApollosClientCoverage({ client: bbbClient, evidence: evidence() });
    expect(coverage.score).toBe(100);
    expect(coverage.authorizationRequired).toBe(0);
    expect(coverage.capabilities.find((item) => item.capability.key === "tiktok_social")?.status).toBe("BLOCKED");
    expect(coverage.capabilities.find((item) => item.capability.key === "tiktok_social")?.scoreEligible).toBe(false);
  });

  it("distinguishes connected from meaningfully active", () => {
    const coverage = buildApollosClientCoverage({
      client: boatlinerClient,
      evidence: evidence({
        activeFeatures: ["discovery_engine"],
      }),
    });

    expect(coverage.capabilities.find((item) => item.capability.key === "facebook_social")?.status)
      .toBe("CONNECTED_NOT_ACTIVE");
    expect(coverage.score).toBeLessThan(100);
  });

  it("requires OAuth when an applicable account integration is missing", () => {
    const coverage = buildApollosClientCoverage({
      client: boatlinerClient,
      evidence: evidence({ connectedIntegrations: [] }),
    });

    const facebook = coverage.capabilities.find((item) => item.capability.key === "facebook_social")!;
    expect(facebook.status).toBe("AUTHORIZATION_REQUIRED");
    expect(facebook.actionGate).toBe("OAUTH_AUTHORIZATION_REQUIRED");
  });

  it("fails closed on an explicit blocker instead of treating a capability as active", () => {
    const coverage = buildApollosClientCoverage({
      client: bbbClient,
      evidence: evidence({
        blockedCapabilities: {
          google_business_profile: {
            reason: "Provider approval is pending.",
            gate: "BLOCKED",
          },
        },
      }),
    });

    const google = coverage.capabilities.find((item) => item.capability.key === "google_business_profile")!;
    expect(google.status).toBe("BLOCKED");
    expect(google.blockedReason).toBe("Provider approval is pending.");
  });

  it("treats degraded evidence as a real coverage loss", () => {
    const coverage = buildApollosClientCoverage({
      client: bbbClient,
      evidence: evidence({
        activeFeatures: evidence().activeFeatures?.filter((key) => key !== "content_autopilot"),
        degradedFeatures: ["content_autopilot"],
      }),
    });

    expect(coverage.capabilities.find((item) => item.capability.key === "content_autopilot")?.status)
      .toBe("DEGRADED");
    expect(coverage.score).toBeLessThan(100);
  });

  it("is deterministic for identical client evidence", () => {
    const first = buildApollosClientCoverage({ client: boatlinerClient, evidence: evidence() });
    const second = buildApollosClientCoverage({ client: boatlinerClient, evidence: evidence() });
    expect(second).toEqual(first);
  });

  it("does not leak BB&B identity or status into Boatliner coverage", () => {
    const boatliner = buildApollosClientCoverage({
      client: boatlinerClient,
      evidence: {
        connectedIntegrations: ["google_business"],
        activeFeatures: ["discovery_engine"],
      },
    });

    expect(boatliner.client.name).toBe("Boatliner Company");
    expect(JSON.stringify(boatliner)).not.toContain("Bed Bugs & Beyond");
    expect(JSON.stringify(boatliner)).not.toContain("bed bug");
  });
});

describe("activation planner", () => {
  it("prioritizes repair/degraded work above ordinary setup opportunities", () => {
    const base = evidence({
      activeFeatures: ["discovery_engine"],
      degradedFeatures: ["content_autopilot"],
      misconfiguredFeatures: ["review_automation"],
    });
    const plan = buildApollosActivationPlan(
      buildApollosClientCoverage({ client: boatlinerClient, evidence: base }),
    );

    expect(plan.items[0]?.capabilityKey).toBe("review_automation");
    expect(plan.items[1]?.capabilityKey).toBe("content_autopilot");
  });

  it("keeps authorization-blocked actions in the plan without blocking independent ready work", () => {
    const plan = buildApollosActivationPlan(
      buildApollosClientCoverage({
        client: boatlinerClient,
        evidence: {
          connectedIntegrations: [],
          activeFeatures: [],
        },
      }),
    );

    expect(plan.items.some((item) => item.executionStatus === "authorization_required")).toBe(true);
    expect(plan.items.some((item) => item.executionStatus === "ready")).toBe(true);
  });

  it("includes dependencies and expected benefit for actionable gaps", () => {
    const plan = buildApollosActivationPlan(
      buildApollosClientCoverage({ client: boatlinerClient, evidence: { activeFeatures: [] } }),
    );
    const authority = plan.items.find((item) => item.capabilityKey === "authority_engine")!;
    expect(authority.dependencies).toContain("discovery_engine");
    expect(authority.expectedBenefit.length).toBeGreaterThan(10);
  });

  it("explains one gap using the same deterministic activation contract", () => {
    const coverage = buildApollosClientCoverage({ client: boatlinerClient, evidence: { activeFeatures: [] } });
    const gap = explainApollosCoverageGap(coverage, "measurement_engine");
    expect(gap).toMatchObject({
      capabilityKey: "measurement_engine",
      gate: "SAFE_AUTOMATIC_ACTION",
      executionStatus: "ready",
    });
  });
});
