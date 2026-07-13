import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  AI_VISIBILITY_ADAPTER_DEFAULTS,
  adaptBacklinkSources,
  adaptConnectedGoogle,
  adaptContentSources,
  adaptDiscoverySources,
  adaptLocalPresenceSources,
  adaptTenantSafeReviews,
  projectContentLifecycle,
} from "../../../../../lib/db/src/ai-visibility-read-model-adapters";
import {
  AI_VISIBILITY_ATTAINABILITY_WEIGHTS,
  AI_VISIBILITY_POTENTIAL_WEIGHTS,
  AI_VISIBILITY_PRIORITY_THRESHOLDS,
  aiVisibilityPriority,
  scoreAiVisibilityOpportunity,
} from "../../../../../lib/db/src/ai-visibility-prioritizer";
import {
  AI_VISIBILITY_DEDUPE_MERGE_POLICY,
  AI_VISIBILITY_WORKFLOW_PRECEDENCE,
  composeAiVisibilityReadModel,
  normalizeAiVisibilityGeography,
} from "../../../../../lib/db/src/ai-visibility-read-model";
import {
  BBB_AI_VISIBILITY_BACKLINKS,
  BBB_AI_VISIBILITY_CONTENT,
  BBB_AI_VISIBILITY_DISCOVERY,
  BBB_AI_VISIBILITY_GEOGRAPHY,
  BBB_AI_VISIBILITY_GOOGLE,
  BBB_AI_VISIBILITY_LOCAL_CHANNELS,
  BBB_AI_VISIBILITY_LOCAL_PROFILE,
  BBB_AI_VISIBILITY_NOW,
  BBB_AI_VISIBILITY_PHONE,
  BBB_AI_VISIBILITY_SCOPE,
} from "../../../../../lib/db/src/ai-visibility-fixtures";
import type {
  AiVisibilityCoverageDiagnostic,
  AiVisibilityNormalizedInput,
} from "../../../../../lib/db/src/ai-visibility-read-model-types";

const weightedBasis = {
  kind: "weighted" as const,
  potential: { businessImpact: 80, evidenceStrength: 70, localImpact: 90, servicePriority: 75, urgency: 60 },
  attainability: { relationshipAccess: 70, workflowReadiness: 80, effortEase: 60, freshness: 90, localRelevance: 95, serviceRelevance: 85 },
};

const readRepoFile = (path: string): string => readFileSync(existsSync(path) ? path : `../../${path}`, "utf8");

function normalized(overrides: Partial<AiVisibilityNormalizedInput> = {}): AiVisibilityNormalizedInput {
  return {
    clientId: BBB_AI_VISIBILITY_SCOPE.clientId,
    dedupeKey: "fixture opportunity",
    category: "discovery",
    serviceId: "bed_bug_treatment",
    geography: BBB_AI_VISIBILITY_GEOGRAPHY,
    title: "Explain furniture and item-level treatment",
    whatWasObserved: "Canonical evidence identifies a service-information gap.",
    whyItMatters: "Customers need accurate furniture and item-level treatment information.",
    evidence: ["Discovery opportunity fixture."],
    references: [{ source: "discovery", recordType: "discovery_opportunity", recordId: "discovery::fixture",
      clientId: BBB_AI_VISIBILITY_SCOPE.clientId, observedAt: BBB_AI_VISIBILITY_NOW.toISOString() }],
    workflow: { kind: "discovery", recordId: "discovery::fixture", action: "Use the existing Discovery content workflow." },
    humanApprovalRequired: true,
    lifecycle: null,
    scoreBasis: weightedBasis,
    ...overrides,
  };
}

function fixtureParts() {
  const local = adaptLocalPresenceSources({ trustedClientId: BBB_AI_VISIBILITY_SCOPE.clientId, profile: BBB_AI_VISIBILITY_LOCAL_PROFILE,
    channels: BBB_AI_VISIBILITY_LOCAL_CHANNELS, geography: BBB_AI_VISIBILITY_GEOGRAPHY, observedAt: BBB_AI_VISIBILITY_NOW });
  const discovery = adaptDiscoverySources(BBB_AI_VISIBILITY_DISCOVERY);
  const backlinks = adaptBacklinkSources(BBB_AI_VISIBILITY_BACKLINKS);
  const content = adaptContentSources(BBB_AI_VISIBILITY_CONTENT);
  const reviews = adaptTenantSafeReviews(null);
  const google = adaptConnectedGoogle(BBB_AI_VISIBILITY_GOOGLE);
  return { local, discovery, backlinks, content, reviews, google };
}

function fixtureModel(reverse = false) {
  const parts = fixtureParts();
  const observations = Object.values(parts).flatMap(part => part.observations);
  const coverage = Object.values(parts).flatMap(part => part.coverage);
  return composeAiVisibilityReadModel({ scope: BBB_AI_VISIBILITY_SCOPE,
    observations: reverse ? [...observations].reverse() : observations,
    coverage: reverse ? [...coverage].reverse() : coverage,
    generatedAt: BBB_AI_VISIBILITY_NOW });
}

describe("C8R-5 transparent dual scoring", () => {
  it("exports weights that each sum to exactly one", () => {
    expect(Object.values(AI_VISIBILITY_POTENTIAL_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(1);
    expect(Object.values(AI_VISIBILITY_ATTAINABILITY_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("scores potential value and attainability independently and deterministically", () => {
    const a = scoreAiVisibilityOpportunity(weightedBasis);
    const b = scoreAiVisibilityOpportunity(weightedBasis);
    expect(a).toEqual(b);
    expect(a.potentialFactors).not.toEqual(a.attainabilityFactors);
    expect(a).toHaveProperty("potentialValue");
    expect(a).toHaveProperty("attainability");
    expect(a.basis).toBe("weighted");
  });

  it("clamps score components and preserves canonical backlink scores", () => {
    expect(scoreAiVisibilityOpportunity({ kind: "canonical_backlink", potentialValue: 82, attainability: 74 }))
      .toMatchObject({ potentialValue: 82, attainability: 74, basis: "canonical_backlink" });
    expect(scoreAiVisibilityOpportunity({ kind: "canonical_backlink", potentialValue: 999, attainability: -5 }))
      .toMatchObject({ potentialValue: 100, attainability: 0 });
  });

  it("publishes deterministic priority thresholds without a generic SEO score", () => {
    expect(AI_VISIBILITY_PRIORITY_THRESHOLDS).toEqual({ critical: 80, high: 65, medium: 45 });
    expect([aiVisibilityPriority(80), aiVisibilityPriority(65), aiVisibilityPriority(45), aiVisibilityPriority(44)])
      .toEqual(["critical", "high", "medium", "low"]);
  });
});

describe("C8R-5 strict pre-prioritization gates", () => {
  it("rejects termite, whole-home heat, and out-of-area opportunities", () => {
    const model = fixtureModel();
    expect(model.rejected.map(item => item.code)).toEqual(expect.arrayContaining([
      "unsupported_service", "prohibited_positioning", "outside_authorized_geography",
    ]));
    expect(model.recommendations.flatMap(item => [item.title, ...item.whatWasObserved]).join(" ").toLowerCase()).not.toContain("termite");
    expect(model.recommendations.flatMap(item => [item.title, ...item.whatWasObserved]).join(" ").toLowerCase()).not.toContain("whole-home");
  });

  it("rejects an unsupported service before scoring", () => {
    const model = composeAiVisibilityReadModel({ scope: BBB_AI_VISIBILITY_SCOPE,
      observations: [normalized({ serviceId: "unsupported_service" })], coverage: [], generatedAt: BBB_AI_VISIBILITY_NOW });
    expect(model.recommendations).toHaveLength(0);
    expect(model.rejected[0].code).toBe("unsupported_service");
  });

  it("rejects mixed-tenant observations and canonical references", () => {
    const model = composeAiVisibilityReadModel({ scope: BBB_AI_VISIBILITY_SCOPE,
      observations: [normalized({ clientId: "client::other" }), normalized({ dedupeKey: "bad reference",
        references: [{ ...normalized().references[0], clientId: "client::other" }] })], coverage: [], generatedAt: BBB_AI_VISIBILITY_NOW });
    expect(model.recommendations).toHaveLength(0);
    expect(model.rejected.every(item => item.code === "tenant_mismatch")).toBe(true);
  });

  it("rejects missing explanations, workflow data, or canonical evidence references", () => {
    const model = composeAiVisibilityReadModel({ scope: BBB_AI_VISIBILITY_SCOPE,
      observations: [normalized({ whatWasObserved: "" }), normalized({ dedupeKey: "no refs", references: [] })], coverage: [], generatedAt: BBB_AI_VISIBILITY_NOW });
    expect(model.recommendations).toHaveLength(0);
    expect(model.rejected.every(item => item.code === "invalid_input")).toBe(true);
  });

  it("normalizes harmless Baldwin County punctuation, spacing, and Alabama/AL differences", () => {
    expect(normalizeAiVisibilityGeography(" Baldwin County, Alabama ")).toBe("baldwin county al");
    expect(normalizeAiVisibilityGeography("Baldwin   County - AL")).toBe("baldwin county al");
  });
});

describe("C8R-5 pure composition and provenance", () => {
  it("produces identical output for forward and reverse adapter order", () => {
    expect(fixtureModel(false)).toEqual(fixtureModel(true));
  });

  it("keeps recommendations in stable potential/attainability/id order", () => {
    const model = fixtureModel();
    const sorted = [...model.recommendations].sort((a, b) => b.potentialValue - a.potentialValue || b.attainability - a.attainability || a.id.localeCompare(b.id));
    expect(model.recommendations).toEqual(sorted);
  });

  it("retains canonical references and complete recommendation explanations", () => {
    for (const recommendation of fixtureModel().recommendations) {
      expect(recommendation.whatWasObserved.length).toBeGreaterThan(0);
      expect(recommendation.whyItMatters.length).toBeGreaterThan(0);
      expect(recommendation.evidence.length).toBeGreaterThan(0);
      expect(recommendation.references.length).toBeGreaterThan(0);
      expect(recommendation.workflow.recordId).not.toBe("");
      expect(typeof recommendation.humanApprovalRequired).toBe("boolean");
    }
  });

  it("deduplicates cross-domain observations, merges provenance, and uses canonical workflow precedence", () => {
    const local = normalized({ dedupeKey: "citation nextdoor", category: "citation_directory",
      references: [{ source: "local_presence", recordType: "channel", recordId: "lp::nextdoor", clientId: BBB_AI_VISIBILITY_SCOPE.clientId,
        observedAt: BBB_AI_VISIBILITY_NOW.toISOString() }], workflow: { kind: "local_presence", recordId: "lp::nextdoor", action: "Complete listing." } });
    const backlink = normalized({ dedupeKey: "citation-nextdoor", category: "citation_directory",
      references: [{ source: "backlink", recordType: "backlink_opportunity", recordId: "blop::nextdoor", clientId: BBB_AI_VISIBILITY_SCOPE.clientId,
        observedAt: BBB_AI_VISIBILITY_NOW.toISOString() }], workflow: { kind: "backlink", recordId: "blwf::nextdoor", action: "Pursue listing." },
      scoreBasis: { kind: "canonical_backlink", potentialValue: 88, attainability: 76 } });
    const model = composeAiVisibilityReadModel({ scope: BBB_AI_VISIBILITY_SCOPE, observations: [local, backlink], coverage: [], generatedAt: BBB_AI_VISIBILITY_NOW });
    expect(model.recommendations).toHaveLength(1);
    expect(model.recommendations[0]).toMatchObject({ basis: "canonical_backlink", potentialValue: 88, attainability: 76,
      workflow: { kind: "backlink", recordId: "blwf::nextdoor" } });
    expect(model.recommendations[0].references).toHaveLength(2);
    expect(AI_VISIBILITY_WORKFLOW_PRECEDENCE.backlink).toBeGreaterThan(AI_VISIBILITY_WORKFLOW_PRECEDENCE.local_presence);
    expect(AI_VISIBILITY_DEDUPE_MERGE_POLICY.provenance).toContain("canonical references");
  });

  it("bounds evidence and reference arrays", () => {
    const many = Array.from({ length: 140 }, (_, index) => `evidence-${String(index).padStart(3, "0")}`);
    const references = Array.from({ length: 140 }, (_, index) => ({ source: "discovery" as const, recordType: "signal", recordId: `sig-${index}`,
      clientId: BBB_AI_VISIBILITY_SCOPE.clientId, observedAt: BBB_AI_VISIBILITY_NOW.toISOString() }));
    const model = composeAiVisibilityReadModel({ scope: BBB_AI_VISIBILITY_SCOPE,
      observations: [normalized({ evidence: many, references })], coverage: [], generatedAt: BBB_AI_VISIBILITY_NOW });
    expect(model.recommendations[0].evidence).toHaveLength(50);
    expect(model.recommendations[0].references).toHaveLength(100);
  });
});

describe("C8R-5 coverage diagnostics", () => {
  it("marks legacy reviews not tenant safe and GSC/GA not implemented", () => {
    const statuses = Object.fromEntries(fixtureModel().coverage.map(item => [item.source, item.status]));
    expect(statuses.reviews).toBe("not_tenant_safe");
    expect(statuses.google_search_console).toBe("not_implemented");
    expect(statuses.google_analytics).toBe("not_implemented");
    expect(statuses.google_business).toBe("available");
  });

  it("does not lower or alter recommendation scores when a source is unavailable", () => {
    const observation = normalized();
    const unavailable: AiVisibilityCoverageDiagnostic[] = [{ source: "google_search_console", status: "not_implemented", detail: "Deferred.", observedAt: null }];
    const a = composeAiVisibilityReadModel({ scope: BBB_AI_VISIBILITY_SCOPE, observations: [observation], coverage: [], generatedAt: BBB_AI_VISIBILITY_NOW });
    const b = composeAiVisibilityReadModel({ scope: BBB_AI_VISIBILITY_SCOPE, observations: [observation], coverage: unavailable, generatedAt: BBB_AI_VISIBILITY_NOW });
    expect(b.recommendations).toEqual(a.recommendations);
    expect(b.summary.unavailableSourceCount).toBe(1);
  });

  it("does not create review recommendations from the non-tenant-safe legacy tables", () => {
    const result = adaptTenantSafeReviews(null);
    expect(result.observations).toEqual([]);
    expect(result.coverage[0].status).toBe("not_tenant_safe");
  });
});

describe("C8R-5 lifecycle and canonical workflow reuse", () => {
  it.each([
    ["generated but not approved", 3, { preparation: "generated", approval: "not_approved", dispatch: "not_queued", delivery: "not_attempted" }],
    ["pending approval", 0, { preparation: "generated", approval: "pending", dispatch: "not_queued", delivery: "not_attempted" }],
    ["approved but not queued", 4, { preparation: "generated", approval: "approved", dispatch: "not_queued", delivery: "not_attempted" }],
    ["queued but not scheduled", 5, { preparation: "generated", approval: "approved", dispatch: "queued", delivery: "not_attempted" }],
    ["scheduled but not published", 6, { preparation: "generated", approval: "approved", dispatch: "scheduled", delivery: "not_attempted" }],
    ["published", 1, { preparation: "generated", approval: "approved", dispatch: "scheduled", delivery: "published" }],
    ["failed", 2, { preparation: "generated", approval: "approved", dispatch: "not_queued", delivery: "failed" }],
  ] as const)("preserves %s as independent lifecycle facets", (_label, index, expected) => {
    const fixture = BBB_AI_VISIBILITY_CONTENT[index];
    expect(projectContentLifecycle(fixture.post, fixture.deliveries)).toEqual(expected);
  });

  it("never interprets generated, approved, queued, or scheduled content as published", () => {
    for (const index of [3, 4, 5, 6]) {
      expect(projectContentLifecycle(BBB_AI_VISIBILITY_CONTENT[index].post, BBB_AI_VISIBILITY_CONTENT[index].deliveries).delivery)
        .toBe("not_attempted");
    }
  });

  it("does not generate a recommendation for content already published successfully", () => {
    const result = adaptContentSources(BBB_AI_VISIBILITY_CONTENT);
    expect(result.observations.map(item => item.workflow.recordId)).not.toContain(BBB_AI_VISIBILITY_CONTENT[1].post.id);
    expect(result.observations).toHaveLength(2);
  });

  it("retains canonical backlink scores and workflow IDs", () => {
    const recommendation = fixtureModel().recommendations.find(item => item.workflow.kind === "backlink");
    expect(recommendation).toMatchObject({ potentialValue: 82, attainability: 74, basis: "canonical_backlink",
      workflow: { recordId: BBB_AI_VISIBILITY_BACKLINKS[0].workflow.id } });
  });
});

describe("C8R-5 BB&B fixtures and architecture exclusions", () => {
  it("preserves BB&B geography, phone, furniture/item positioning, and active fumigation", () => {
    expect(BBB_AI_VISIBILITY_GEOGRAPHY).toBe("Baldwin County, Alabama");
    expect(BBB_AI_VISIBILITY_PHONE).toBe("251-324-9090");
    expect(BBB_AI_VISIBILITY_LOCAL_PROFILE.phone).toBe(BBB_AI_VISIBILITY_PHONE);
    expect(BBB_AI_VISIBILITY_SCOPE.activeServiceIds).toContain("fumigation");
    expect(fixtureModel().recommendations.some(item => item.serviceId === "bed_bug_treatment" && item.title.toLowerCase().includes("furniture"))).toBe(true);
  });

  it("keeps source adapters separate and free of DB, API, environment, OAuth, network, and provider-client access", () => {
    const source = readRepoFile("lib/db/src/ai-visibility-read-model-adapters.ts");
    for (const forbidden of ["@workspace/db", "process.env", "fetch(", "oauth", "accessToken", "refreshToken", "DataProvider"]) expect(source).not.toContain(forbidden);
    expect(source).not.toContain("aiVisibilityAuditsTable");
  });

  it("keeps the pure composer independent of schemas, routes, environment, OAuth, network, and provider clients", () => {
    const source = readRepoFile("lib/db/src/ai-visibility-read-model.ts");
    for (const forbidden of ["/schema/", "@workspace/db", "process.env", "fetch(", "oauth", "DataProvider", "aiVisibilityAuditsTable"]) expect(source).not.toContain(forbidden);
  });

  it("exposes only bounded normalized inputs and never a legacy AI Visibility audit adapter", () => {
    const adapterSource = readRepoFile("lib/db/src/ai-visibility-read-model-adapters.ts");
    const typeSource = readRepoFile("lib/db/src/ai-visibility-read-model-types.ts");
    expect(`${adapterSource}\n${typeSource}`).not.toContain("AiVisibilityAudit");
    expect(`${adapterSource}\n${typeSource}`).not.toContain("channelsJson");
    expect(`${adapterSource}\n${typeSource}`).not.toContain("competitorsJson");
    expect(`${adapterSource}\n${typeSource}`).not.toContain("recommendationsJson");
  });

  it("does not expose a generic overall or SEO score", () => {
    const model = fixtureModel() as unknown as Record<string, unknown>;
    expect(model).not.toHaveProperty("overallScore");
    expect(model).not.toHaveProperty("seoScore");
    expect(AI_VISIBILITY_ADAPTER_DEFAULTS.localPresence.potential.businessImpact).toBe(70);
  });
});
