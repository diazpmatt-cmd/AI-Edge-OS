import { describe, expect, it } from "vitest";
import type { BacklinkOpportunity, BacklinkProspect, BacklinkWorkflow } from "@workspace/db";
import {
  classifyBacklinkOpportunityPriority,
  computeBacklinkOpportunityPriority,
  rankBacklinkOpportunities,
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
});
