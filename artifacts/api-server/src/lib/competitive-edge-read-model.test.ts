import { describe, expect, it } from "vitest";

import {
  buildCompetitiveEdgeReadModel,
  type CompetitiveEdgeSources,
} from "./competitive-edge-read-model";

const client = Object.freeze({
  clientId: " client-bbb ",
  clientName: "Bed Bugs & Beyond",
  industry: "Pest Control",
  region: "Baldwin County, Alabama",
});

function sources(overrides: Partial<CompetitiveEdgeSources> = {}): CompetitiveEdgeSources {
  const authorityItems = Array.from({ length: 8 }, (_, index) => Object.freeze({
    opportunityId: `authority-${index + 1}`,
    reasonCodes: Object.freeze(["competitor_gap"]),
  }));
  const discoveryOpportunities = Array.from({ length: 8 }, (_, index) => Object.freeze({
    id: `discovery-${index + 1}`,
    title: `Opportunity ${index + 1}`,
    description: "Evidence-backed discovery opportunity",
    opportunityType: "content_gap",
    targetEngine: "content",
    compositeScore: 90 - index,
    priority: "high",
    status: "open",
    createdAt: "2026-08-14T12:00:00.000Z",
  }));

  return {
    competitors: async () => ({
      observedAt: "2026-08-14T12:00:00.000Z",
      data: {
        totalCompetitors: 2,
        criticalCount: 1,
        highCount: 1,
        mediumCount: 0,
        lowCount: 0,
        lastUpdatedAt: "2026-08-14T12:00:00.000Z",
        items: Object.freeze([
          Object.freeze({
            id: "competitor-1",
            businessName: "Coastal Pest Co",
            domain: "coastalpest.example",
            keywordGapCount: 12,
            opportunityScore: 88,
            threatLevel: "high",
            confidenceScore: 70,
            discoveredProviders: Object.freeze(["canonical_discovery"]),
            lastSeenAt: "2026-08-14T12:00:00.000Z",
          }),
        ]),
      },
    }),
    discovery: async () => ({
      observedAt: "2026-08-14T12:05:00.000Z",
      data: {
        runId: "run-1",
        weekLabel: "2026-W33",
        status: "complete",
        signalsReceived: 20,
        signalsAccepted: 18,
        signalsBlocked: 2,
        clusterCount: 5,
        opportunityCount: 8,
        highPriorityCount: 4,
        topOpportunityScore: 90,
        competitorGapCount: 7,
        gaps: Object.freeze([]),
        opportunities: Object.freeze(discoveryOpportunities),
      },
    }),
    authority: async () => ({
      observedAt: null,
      data: {
        clientId: "client-bbb",
        scoring: {
          potentialValueWeight: 0.55,
          attainabilityWeight: 0.45,
          terminalWorkflowsExcluded: true,
        },
        summary: {
          totalActionable: 8,
          topPriority: 3,
          highPriority: 5,
          competitorGaps: 8,
          easyWins: 2,
        },
        items: Object.freeze(authorityItems),
      },
    }),
    aiVisibility: async () => ({
      observedAt: "2026-08-14T12:10:00.000Z",
      data: {
        scanId: "scan-1",
        provider: "openai_model_observation",
        model: "configured-model",
        queryCount: 10,
        completedCount: 10,
        mentionCount: 4,
        competitorMentionCount: 6,
        citationCount: 3,
        startedAt: "2026-08-14T12:09:00.000Z",
        completedAt: "2026-08-14T12:10:00.000Z",
      },
    }),
    measurement: async () => ({
      observedAt: "2026-08-14T12:15:00.000Z",
      data: {
        snapshotDate: "2026-08-14",
        backlinkCount: 15,
        referringDomainCount: 12,
        newCount: 2,
        lostCount: 0,
        restoredCount: 1,
        opportunityCount: 8,
        wonCount: 1,
        edgeAuthorityScore: 62,
        inventoryRunId: "inventory-1",
        measurementSource: "observed_backlink_lifecycle_v1",
        measurementObservedAt: "2026-08-14T12:15:00.000Z",
      },
    }),
    ...overrides,
  };
}

describe("buildCompetitiveEdgeReadModel", () => {
  it("composes existing evidence without inventing a cross-engine score", async () => {
    const model = await buildCompetitiveEdgeReadModel(client, sources());

    expect(model.client.clientId).toBe("client-bbb");
    expect(model.lanes.competitors.available).toBe(true);
    expect(model.lanes.discovery.available).toBe(true);
    expect(model.lanes.authority.available).toBe(true);
    expect(model.lanes.aiVisibility.available).toBe(true);
    expect(model.lanes.measurement.available).toBe(true);
    expect(model.lanes.localPresence).toEqual({
      available: false,
      observedAt: null,
      reason: "local_presence_not_aggregated_in_a1",
      data: null,
    });
    expect(model).not.toHaveProperty("score");
    expect(model).not.toHaveProperty("competitiveScore");
  });

  it("bounds the action plan to existing source-native actions", async () => {
    const model = await buildCompetitiveEdgeReadModel(client, sources());

    expect(model.actionPlan.discovery).toHaveLength(5);
    expect(model.actionPlan.authority).toHaveLength(5);
    expect(model.actionPlan.discovery[0]?.id).toBe("discovery-1");
    expect((model.actionPlan.authority[0] as { opportunityId: string }).opportunityId).toBe("authority-1");
  });

  it("keeps missing evidence unavailable instead of converting it to zero", async () => {
    const model = await buildCompetitiveEdgeReadModel(client, sources({
      measurement: async () => null,
      aiVisibility: async () => null,
    }));

    expect(model.lanes.measurement).toEqual({
      available: false,
      observedAt: null,
      reason: "trusted_measurement_unavailable",
      data: null,
    });
    expect(model.lanes.aiVisibility).toEqual({
      available: false,
      observedAt: null,
      reason: "ai_visibility_evidence_unavailable",
      data: null,
    });
  });

  it("isolates a lane failure instead of failing the whole Competitive Edge snapshot", async () => {
    const model = await buildCompetitiveEdgeReadModel(client, sources({
      discovery: async () => {
        throw new Error("database unavailable");
      },
    }));

    expect(model.lanes.discovery.available).toBe(false);
    expect(model.lanes.competitors.available).toBe(true);
    expect(model.lanes.authority.available).toBe(true);
  });

  it("preserves provider-truthful AI visibility identity from persisted evidence", async () => {
    const model = await buildCompetitiveEdgeReadModel(client, sources());
    if (!model.lanes.aiVisibility.available) throw new Error("expected AI visibility lane");

    expect(model.lanes.aiVisibility.data.provider).toBe("openai_model_observation");
    expect(model.lanes.aiVisibility.data.provider).not.toBe("gemini");
    expect(model.lanes.aiVisibility.data.provider).not.toBe("perplexity");
  });

  it("rejects an empty client id before any source executes", async () => {
    let calls = 0;
    const sourceSet = sources({
      competitors: async () => {
        calls += 1;
        return null;
      },
    });

    await expect(buildCompetitiveEdgeReadModel({ ...client, clientId: "   " }, sourceSet))
      .rejects.toThrow("COMPETITIVE_EDGE_CLIENT_ID_REQUIRED");
    expect(calls).toBe(0);
  });
});
