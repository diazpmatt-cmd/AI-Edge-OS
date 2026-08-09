import { describe, expect, it } from "vitest";

import {
  buildApollosActivationPlan,
  buildApollosClientCoverage,
} from "./apollos-client-orchestrator";
import { buildApollosClientMissionSummary } from "./apollos-client-mission";

const client = {
  id: "boatliner-client",
  name: "Boatliner Company",
  industry: "marine_services",
} as const;

describe("buildApollosClientMissionSummary", () => {
  it("groups independent, approval, OAuth, external, and real blocked work without roadmap-only noise", () => {
    const coverage = buildApollosClientCoverage({
      client,
      evidence: {
        connectedIntegrations: [],
        activeFeatures: [],
        blockedCapabilities: {
          review_automation: {
            reason: "Review provider migration is blocked.",
            gate: "BLOCKED",
          },
        },
      },
    });
    const activationPlan = buildApollosActivationPlan(coverage);
    const mission = buildApollosClientMissionSummary({ coverage, activationPlan });

    expect(mission.status).toBe("action_required");
    expect(mission.oauthAuthorizationRequired.length).toBeGreaterThan(0);
    expect(mission.readyAutomatic.length).toBeGreaterThan(0);
    expect(mission.humanApprovalRequired.length).toBeGreaterThan(0);
    expect(mission.externalConfigurationRequired.length).toBeGreaterThan(0);
    expect(mission.blockedActions.map((item) => item.capabilityKey)).toContain("review_automation");
    expect(mission.blockedActions.map((item) => item.capabilityKey)).not.toContain("tiktok_social");
    expect(mission.topPriorityActions.length).toBeLessThanOrEqual(8);
  });

  it("fails closed when coverage and activation plan belong to different tenants", () => {
    const coverage = buildApollosClientCoverage({ client, evidence: {} });
    const activationPlan = {
      ...buildApollosActivationPlan(coverage),
      clientId: "another-client",
    };

    expect(() => buildApollosClientMissionSummary({ coverage, activationPlan }))
      .toThrow("APOLLOS_MISSION_TENANT_MISMATCH");
  });

  it("reports optimized when every capability currently offered to the client is active", () => {
    const coverage = buildApollosClientCoverage({
      client,
      evidence: {
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
          "local_presence:apple",
          "local_presence:bing",
          "local_presence:nextdoor",
          "discovery_engine",
          "authority_engine",
          "optimization_engine",
          "measurement_engine",
          "ai_visibility_monitoring",
        ],
      },
    });
    const activationPlan = buildApollosActivationPlan(coverage);
    const mission = buildApollosClientMissionSummary({ coverage, activationPlan });

    expect(coverage.score).toBe(100);
    expect(mission.status).toBe("optimized");
    expect(mission.topPriorityActions).toEqual([]);
  });
});
