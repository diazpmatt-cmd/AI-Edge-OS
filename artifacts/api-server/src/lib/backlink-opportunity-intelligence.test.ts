import { describe, expect, it } from "vitest";
import type {
  BacklinkEvidenceRecord,
  BacklinkOpportunity,
  BacklinkProspect,
  BacklinkWorkflow,
} from "@workspace/db";
import {
  classifyBacklinkOpportunityPriority,
  computeBacklinkOpportunityPriority,
  rankBacklinkOpportunities,
  selectBacklinkEvidencePreview,
} from "./backlink-opportunity-intelligence.js";

const now = new Date("2026-08-07T00:00:00.000Z");

function opportunity(overrides: Partial<BacklinkOpportunity> = {}): BacklinkOpportunity {
  return {
    id: "op-1",
    clientId: "client-1",
    prospectId: "prospect-1",
    category: "competitor_link_gap",
    serviceId: "bed-bugs",
    potentialValue: 80,
    attainability: 70,
    rationale: "Competitor placement exists.",
    recommendedAction: "Review the linking source.",
    evidenceIds: ["e-1", "e-2"],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function workflow(overrides: Partial<BacklinkWorkflow> = {}): BacklinkWorkflow {
  return {
    id: "wf-1",
    clientId: "client-1",
    opportunityId: "op-1",
    status: "discovered",
    ownerId: null,
    nextAction: null,
    dueAt: null,
    outcomeSummary: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    ...overrides,
  };
}

function prospect(overrides: Partial<BacklinkProspect> = {}): BacklinkProspect {
  return {
    id: "prospect-1",
    clientId: "client-1",
    prospectType: "domain",
    domain: "example.com",
    pageUrl: null,
    displayName: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function evidence(overrides: Partial<BacklinkEvidenceRecord> = {}): BacklinkEvidenceRecord {
  return {
    id: "e-1",
    clientId: "client-1",
    prospectId: "prospect-1",
    sourceDomain: "publisher.example",
    sourceUrl: "https://publisher.example/resources",
    targetUrl: "https://client.example/service",
    competitorUrl: "https://competitor.example/service",
    category: "competitor_link_gap",
    serviceId: "bed-bugs",
    providers: ["provider-z", "provider-a"],
    discoveredAt: now,
    freshnessDays: 2,
    localRelevance: 80,
    serviceRelevance: 90,
    competitorFrequency: 3,
    relationshipAccessibility: 75,
    editorialRequirements: 40,
    estimatedEffort: 35,
    authority: 82,
    createdAt: now,
    ...overrides,
  };
}

describe("backlink opportunity intelligence", () => {
  it("uses a transparent 55/45 value-to-attainability priority score", () => {
    expect(computeBacklinkOpportunityPriority({ potentialValue: 80, attainability: 70 })).toBe(75.5);
    expect(classifyBacklinkOpportunityPriority(80)).toBe("top");
    expect(classifyBacklinkOpportunityPriority(65)).toBe("high");
    expect(classifyBacklinkOpportunityPriority(50)).toBe("medium");
    expect(classifyBacklinkOpportunityPriority(49.99)).toBe("low");
  });

  it("ranks the strongest actionable opportunity first", () => {
    const ranked = rankBacklinkOpportunities([
      { opportunity: opportunity({ id: "op-low", potentialValue: 55, attainability: 60 }), workflow: workflow({ id: "wf-low", opportunityId: "op-low" }), prospect: prospect({ id: "p-low", domain: "low.example" }) },
      { opportunity: opportunity({ id: "op-top", potentialValue: 92, attainability: 88 }), workflow: workflow({ id: "wf-top", opportunityId: "op-top" }), prospect: prospect({ id: "p-top", domain: "top.example" }) },
    ]);
    expect(ranked.map((item) => item.opportunityId)).toEqual(["op-top", "op-low"]);
    expect(ranked[0]).toMatchObject({ domain: "top.example", priorityTier: "top" });
  });

  it("explains competitor gaps and evidence strength without inventing new provider facts", () => {
    const [item] = rankBacklinkOpportunities([
      { opportunity: opportunity({ potentialValue: 82, attainability: 78 }), workflow: workflow({ status: "approved", nextAction: "Prepare outreach for review." }), prospect: prospect() },
    ]);
    expect(item.reasonCodes).toEqual(["high_value", "easy_win", "competitor_gap", "evidence_strength", "already_approved"]);
    expect(item.recommendedAction).toBe("Prepare outreach for review.");
  });

  it("excludes terminal workflows and bounds result size", () => {
    const items = [
      { opportunity: opportunity({ id: "won" }), workflow: workflow({ id: "wf-won", opportunityId: "won", status: "won" }), prospect: prospect() },
      { opportunity: opportunity({ id: "open" }), workflow: workflow({ id: "wf-open", opportunityId: "open", status: "discovered" }), prospect: prospect() },
    ];
    expect(rankBacklinkOpportunities(items, 1).map((item) => item.opportunityId)).toEqual(["open"]);
  });

  it("selects only evidence referenced by the opportunity", () => {
    const preview = selectBacklinkEvidencePreview(
      opportunity({ evidenceIds: ["e-1", "e-2"] }),
      [
        evidence({ id: "unrelated", sourceDomain: "ignore.example" }),
        evidence({ id: "e-1", sourceDomain: "one.example" }),
        evidence({ id: "e-2", sourceDomain: "two.example" }),
      ],
    );

    expect(preview.map((item) => item.id).sort()).toEqual(["e-1", "e-2"]);
    expect(preview.some((item) => item.sourceDomain === "ignore.example")).toBe(false);
  });

  it("keeps competitor acquisition evidence bounded, deterministic, and safe", () => {
    const preview = selectBacklinkEvidencePreview(
      opportunity({ evidenceIds: ["e-1", "e-2", "e-3", "e-4"] }),
      [
        evidence({ id: "e-4", discoveredAt: new Date("2026-08-04T00:00:00.000Z") }),
        evidence({ id: "e-2", discoveredAt: new Date("2026-08-06T00:00:00.000Z") }),
        evidence({ id: "e-1", discoveredAt: new Date("2026-08-07T00:00:00.000Z") }),
        evidence({ id: "e-3", discoveredAt: new Date("2026-08-05T00:00:00.000Z") }),
      ],
      3,
    );

    expect(preview.map((item) => item.id)).toEqual(["e-1", "e-2", "e-3"]);
    expect(preview[0]).toEqual({
      id: "e-1",
      sourceDomain: "publisher.example",
      sourceUrl: "https://publisher.example/resources",
      competitorUrl: "https://competitor.example/service",
      targetUrl: "https://client.example/service",
      authority: 82,
      competitorFrequency: 3,
      relationshipAccessibility: 75,
      estimatedEffort: 35,
      discoveredAt: "2026-08-07T00:00:00.000Z",
      providers: ["provider-a", "provider-z"],
    });
    expect("clientId" in preview[0]).toBe(false);
    expect("prospectId" in preview[0]).toBe(false);
    expect("providerMetadata" in preview[0]).toBe(false);
  });
});
