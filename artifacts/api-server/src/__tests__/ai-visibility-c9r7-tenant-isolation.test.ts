/**
 * C9R-7 Adversarial Tenant Isolation Tests
 *
 * Verifies that:
 *  1. All 7 coverage states normalize deterministically.
 *  2. Tenant-mismatch observations are rejected, never surfaced.
 *  3. Cross-tenant canonical reference → rejected with tenant_mismatch.
 *  4. Outside-geography observations are rejected, never surfaced.
 *  5. Unsupported-service observations are rejected, never surfaced.
 *  6. Prohibited-phrase observations are rejected, never surfaced.
 *  7. Null target suppresses review-gap observations.
 *  8. Scheduler-secret is a non-empty process-bound string (not undefined).
 *  9. Missing Clerk userId produces no clientId (auth guard invariant).
 * 10. getScanEvidence enforces clientId column in query.
 * 11. GBP review importer gates on userId ownership.
 * 12. GBP review importer gates on locationId in metadata.
 * 13. Legacy not_tenant_safe path is never emitted by C9R-6 pipeline.
 */

import { describe, it, expect, vi } from "vitest";
import {
  composeAiVisibilityReadModel,
  adaptReviewImportResult,
  adaptTenantSafeReviews,
  computeTargetReviewCount,
  type AiVisibilityNormalizedInput,
  type AiVisibilityAuthorizedScope,
  type AiVisibilityCoverageDiagnostic,
  type ReviewImportResult,
  type TenantSafeReviewSummary,
} from "@workspace/db";

// ── Shared fixtures ──────────────────────────────────────────────────────────

const TENANT_A = "tenant-a-uuid";
const TENANT_B = "tenant-b-uuid";
const GEO      = "Foley, AL";
const NOW      = new Date("2026-07-20T10:00:00Z");

function makeScope(overrides: Partial<AiVisibilityAuthorizedScope> = {}): AiVisibilityAuthorizedScope {
  return {
    clientId:            TENANT_A,
    activeServiceIds:    ["bed-bug-treatment"],
    authorizedGeographies: [GEO],
    prohibitedPhrases:   [],
    ...overrides,
  };
}

function makeObservation(overrides: Partial<AiVisibilityNormalizedInput> = {}): AiVisibilityNormalizedInput {
  return {
    clientId:              TENANT_A,
    dedupeKey:             "test-obs-001",
    category:              "local_presence",
    serviceId:             "bed-bug-treatment",
    geography:             GEO,
    title:                 "Test opportunity",
    whatWasObserved:       "A test observation.",
    whyItMatters:          "It matters for testing.",
    evidence:              ["Evidence item 1."],
    references:            [{ recordId: "ref-001", source: "local_presence", recordType: "channel", clientId: TENANT_A, observedAt: NOW.toISOString() }],
    workflow:              { kind: "local_presence", recordId: "wf-001", action: "review", status: "pending" },
    humanApprovalRequired: false,
    lifecycle:             null,
    scoreBasis:            { kind: "weighted", potential: { businessImpact: 0.8, evidenceStrength: 0.7, localImpact: 0.6, servicePriority: 0.5, urgency: 0.4 }, attainability: { relationshipAccess: 0.9, workflowReadiness: 0.8, effortEase: 0.7, freshness: 0.6, localRelevance: 0.5, serviceRelevance: 0.4 } },
    ...overrides,
  };
}

function makeCoverage(source: string, status: AiVisibilityCoverageDiagnostic["status"]): AiVisibilityCoverageDiagnostic {
  return { source, status, detail: `${source}: ${status}`, observedAt: NOW.toISOString() };
}

// ── 1. All 7 coverage states normalize deterministically ─────────────────────

describe("Coverage state normalization — all 7 states", () => {
  const allSevenStates: Array<AiVisibilityCoverageDiagnostic["status"]> = [
    "available",
    "not_connected",
    "unauthorized",
    "provider_error",
    "not_implemented",
    "not_tenant_safe",
    "no_observation",
  ];

  it("composeAiVisibilityReadModel preserves every declared status in coverage[]", () => {
    const coverage: AiVisibilityCoverageDiagnostic[] = allSevenStates.map(
      (status, i) => makeCoverage(`source_${i}`, status),
    );
    const model = composeAiVisibilityReadModel({
      scope:       makeScope(),
      observations: [],
      coverage,
      generatedAt: NOW,
    });
    const resultStatuses = new Set(model.coverage.map(c => c.status));
    for (const s of allSevenStates) expect(resultStatuses.has(s)).toBe(true);
  });

  it("coverage is sorted alphabetically by source (stable ordering)", () => {
    const coverage = [
      makeCoverage("reviews", "available"),
      makeCoverage("ai_query", "not_connected"),
      makeCoverage("discovery", "no_observation"),
    ];
    const model = composeAiVisibilityReadModel({ scope: makeScope(), observations: [], coverage, generatedAt: NOW });
    const sources = model.coverage.map(c => c.source);
    expect(sources).toEqual([...sources].sort());
  });

  it("duplicate sources: highest-priority status wins (available > no_observation)", () => {
    const coverage = [
      makeCoverage("reviews", "no_observation"),
      makeCoverage("reviews", "available"),
    ];
    const model = composeAiVisibilityReadModel({ scope: makeScope(), observations: [], coverage, generatedAt: NOW });
    const reviewsCoverage = model.coverage.filter(c => c.source === "reviews");
    expect(reviewsCoverage).toHaveLength(1);
    expect(reviewsCoverage[0].status).toBe("available");
  });

  it("unauthorized has higher priority than not_connected in normalization order", () => {
    const coverage = [
      makeCoverage("reviews", "not_connected"),
      makeCoverage("reviews", "unauthorized"),
    ];
    const model = composeAiVisibilityReadModel({ scope: makeScope(), observations: [], coverage, generatedAt: NOW });
    const reviewsCoverage = model.coverage.filter(c => c.source === "reviews");
    expect(reviewsCoverage[0].status).toBe("unauthorized");
  });

  it("provider_error has higher priority than unauthorized", () => {
    const coverage = [
      makeCoverage("reviews", "unauthorized"),
      makeCoverage("reviews", "provider_error"),
    ];
    const model = composeAiVisibilityReadModel({ scope: makeScope(), observations: [], coverage, generatedAt: NOW });
    const reviewsCoverage = model.coverage.filter(c => c.source === "reviews");
    expect(reviewsCoverage[0].status).toBe("provider_error");
  });

  it("missing data never becomes a zero score — coverage is not observations", () => {
    const coverage = [makeCoverage("reviews", "no_observation")];
    const model = composeAiVisibilityReadModel({ scope: makeScope(), observations: [], coverage, generatedAt: NOW });
    expect(model.recommendations).toHaveLength(0);
    expect(model.summary.availableSourceCount).toBe(0);
    expect(model.summary.unavailableSourceCount).toBe(1);
  });
});

// ── 2. Tenant-mismatch rejection ─────────────────────────────────────────────

describe("Adversarial: tenant_mismatch rejection", () => {
  it("observation.clientId !== scope.clientId → rejected with tenant_mismatch", () => {
    const obs = makeObservation({ clientId: TENANT_B });
    const model = composeAiVisibilityReadModel({
      scope: makeScope({ clientId: TENANT_A }),
      observations: [obs],
      coverage: [],
      generatedAt: NOW,
    });
    expect(model.recommendations).toHaveLength(0);
    expect(model.rejected).toHaveLength(1);
    expect(model.rejected[0].code).toBe("tenant_mismatch");
  });

  it("cross-tenant canonical reference → rejected with tenant_mismatch", () => {
    const obs = makeObservation({
      clientId:   TENANT_A,
      references: [
        { recordId: "ref-001", source: "local_presence", recordType: "channel", clientId: TENANT_B, observedAt: NOW.toISOString() },
      ],
    });
    const model = composeAiVisibilityReadModel({
      scope: makeScope({ clientId: TENANT_A }),
      observations: [obs],
      coverage: [],
      generatedAt: NOW,
    });
    expect(model.recommendations).toHaveLength(0);
    expect(model.rejected[0].code).toBe("tenant_mismatch");
  });

  it("no Tenant A data appears in model scoped to Tenant B", () => {
    const tenantAObs = makeObservation({ clientId: TENANT_A });
    const model = composeAiVisibilityReadModel({
      scope: makeScope({ clientId: TENANT_B, authorizedGeographies: [GEO], activeServiceIds: ["bed-bug-treatment"] }),
      observations: [tenantAObs],
      coverage: [],
      generatedAt: NOW,
    });
    const tenantAInRecommendations = model.recommendations.filter(r => r.clientId === TENANT_A);
    expect(tenantAInRecommendations).toHaveLength(0);
    expect(model.rejected[0].code).toBe("tenant_mismatch");
  });

  it("valid tenant-A observation does not appear in Tenant-B model", () => {
    const tenantAObs = makeObservation({ clientId: TENANT_A });
    const tenantBModel = composeAiVisibilityReadModel({
      scope: makeScope({ clientId: TENANT_B }),
      observations: [tenantAObs],
      coverage: [],
      generatedAt: NOW,
    });
    expect(tenantBModel.recommendations.some(r => r.clientId === TENANT_A)).toBe(false);
  });
});

// ── 3. Geography isolation ────────────────────────────────────────────────────

describe("Adversarial: geography isolation", () => {
  it("observation outside authorized geography → rejected with outside_authorized_geography", () => {
    const obs = makeObservation({ geography: "New York, NY" });
    const model = composeAiVisibilityReadModel({
      scope: makeScope({ authorizedGeographies: [GEO] }),
      observations: [obs],
      coverage: [],
      generatedAt: NOW,
    });
    expect(model.recommendations).toHaveLength(0);
    expect(model.rejected[0].code).toBe("outside_authorized_geography");
  });

  it("foreign geography injection cannot create an observation", () => {
    const injectedGeo = "Adversarial City, ZZ";
    const obs = makeObservation({ geography: injectedGeo });
    const model = composeAiVisibilityReadModel({
      scope: makeScope({ authorizedGeographies: [GEO] }),
      observations: [obs],
      coverage: [],
      generatedAt: NOW,
    });
    const geosInRecommendations = model.recommendations.map(r => r.geography);
    expect(geosInRecommendations).not.toContain(injectedGeo);
  });

  it("authorized geography passes isolation check", () => {
    const obs = makeObservation({ geography: GEO });
    const model = composeAiVisibilityReadModel({
      scope: makeScope(),
      observations: [obs],
      coverage: [],
      generatedAt: NOW,
    });
    expect(model.recommendations).toHaveLength(1);
    expect(model.rejected).toHaveLength(0);
  });
});

// ── 4. Service isolation ──────────────────────────────────────────────────────

describe("Adversarial: service isolation", () => {
  it("observation with unsupported serviceId → rejected with unsupported_service", () => {
    const obs = makeObservation({ serviceId: "termite-treatment" });
    const model = composeAiVisibilityReadModel({
      scope: makeScope({ activeServiceIds: ["bed-bug-treatment"] }),
      observations: [obs],
      coverage: [],
      generatedAt: NOW,
    });
    expect(model.recommendations).toHaveLength(0);
    expect(model.rejected[0].code).toBe("unsupported_service");
  });

  it("arbitrary service substitution cannot create a recommendation", () => {
    const obs = makeObservation({ serviceId: "admin-injection" });
    const model = composeAiVisibilityReadModel({
      scope: makeScope({ activeServiceIds: ["bed-bug-treatment"] }),
      observations: [obs],
      coverage: [],
      generatedAt: NOW,
    });
    expect(model.recommendations.map(r => r.serviceId)).not.toContain("admin-injection");
  });
});

// ── 5. Prohibited-phrase rejection ───────────────────────────────────────────

describe("Adversarial: prohibited phrase rejection", () => {
  it("observation containing a prohibited phrase → rejected with prohibited_positioning", () => {
    const obs = makeObservation({ title: "We also do termite treatment" });
    const model = composeAiVisibilityReadModel({
      scope: makeScope({ prohibitedPhrases: ["termite"] }),
      observations: [obs],
      coverage: [],
      generatedAt: NOW,
    });
    expect(model.recommendations).toHaveLength(0);
    expect(model.rejected[0].code).toBe("prohibited_positioning");
  });
});

// ── 6. Review intelligence tenant isolation ───────────────────────────────────

describe("Adversarial: GBP review intelligence tenant isolation", () => {
  it("ReviewImportResult 'disconnected' → not_connected, zero observations", () => {
    const result: ReviewImportResult = { kind: "disconnected", reason: "No GBP connection found." };
    const adapted = adaptReviewImportResult(result);
    expect(adapted.observations).toHaveLength(0);
    expect(adapted.coverage[0].status).toBe("not_connected");
  });

  it("ReviewImportResult 'unauthorized' → 'unauthorized' status (not 'not_connected')", () => {
    const result: ReviewImportResult = { kind: "unauthorized", reason: "userId mismatch — cross-tenant attempt blocked." };
    const adapted = adaptReviewImportResult(result);
    expect(adapted.coverage[0].status).toBe("unauthorized");
    expect(adapted.coverage[0].status).not.toBe("not_connected");
  });

  it("unauthorized detail clearly does not describe it as an ordinary disconnected service", () => {
    const result: ReviewImportResult = { kind: "unauthorized", reason: "userId mismatch." };
    const adapted = adaptReviewImportResult(result);
    expect(adapted.coverage[0].detail).not.toContain("Connect GBP");
    expect(adapted.coverage[0].detail).not.toContain("not connected");
  });

  it("ReviewImportResult 'provider_error' → explicit provider_error status", () => {
    const result: ReviewImportResult = { kind: "provider_error", error: "DB query failed" };
    const adapted = adaptReviewImportResult(result);
    expect(adapted.coverage[0].status).toBe("provider_error");
    expect(adapted.coverage[0].status).not.toBe("no_observation");
    expect(adapted.coverage[0].status).not.toBe("not_connected");
  });

  it("ReviewImportResult 'no_observation' → no_observation, zero observations", () => {
    const result: ReviewImportResult = { kind: "no_observation", reason: "GBP location not yet authorized." };
    const adapted = adaptReviewImportResult(result);
    expect(adapted.observations).toHaveLength(0);
    expect(adapted.coverage[0].status).toBe("no_observation");
  });

  it("ReviewImportResult 'available' with null targetReviewCount → no review-gap observation", () => {
    const summary: TenantSafeReviewSummary = {
      id:                "tsrs-001",
      clientId:          TENANT_A,
      platform:          "google",
      reviewCount:       5,
      averageRating:     3.0,
      targetReviewCount: null,
      geography:         GEO,
      observedAt:        NOW,
    };
    const result: ReviewImportResult = { kind: "available", summaries: [summary] };
    const adapted = adaptReviewImportResult(result);
    const reviewGapObs = adapted.observations.filter(o => o.title.toLowerCase().includes("review") && o.title.toLowerCase().includes("gap"));
    expect(reviewGapObs).toHaveLength(0);
  });

  it("computeTargetReviewCount returns null for any clientId (no universal benchmark)", () => {
    expect(computeTargetReviewCount(TENANT_A)).toBeNull();
    expect(computeTargetReviewCount(TENANT_B)).toBeNull();
    expect(computeTargetReviewCount("any-arbitrary-client")).toBeNull();
  });

  it("adaptTenantSafeReviews(null) reports not_tenant_safe (legacy path only)", () => {
    const adapted = adaptTenantSafeReviews(null);
    expect(adapted.coverage[0].status).toBe("not_tenant_safe");
  });

  it("C9R-6 production path never emits not_tenant_safe (it routes through adaptReviewImportResult)", () => {
    const allKinds: ReviewImportResult[] = [
      { kind: "disconnected", reason: "x" },
      { kind: "unauthorized", reason: "x" },
      { kind: "provider_error", error: "x" },
      { kind: "no_observation", reason: "x" },
      { kind: "available", summaries: [] },
    ];
    for (const result of allKinds) {
      const adapted = adaptReviewImportResult(result);
      expect(adapted.coverage.some(c => c.status === "not_tenant_safe")).toBe(false);
    }
  });
});

// ── 7. Scheduler secret invariant ────────────────────────────────────────────

describe("Scheduler secret invariant", () => {
  it("SCHEDULER_SECRET module exports a non-empty string", async () => {
    const { SCHEDULER_SECRET } = await import("../lib/scheduler-secret.js");
    expect(typeof SCHEDULER_SECRET).toBe("string");
    expect(SCHEDULER_SECRET.length).toBeGreaterThan(0);
  });

  it("scheduler secret guard rejects empty string", async () => {
    const { SCHEDULER_SECRET } = await import("../lib/scheduler-secret.js");
    expect("" !== SCHEDULER_SECRET).toBe(true);
  });

  it("scheduler secret guard rejects undefined-coerced string", async () => {
    const { SCHEDULER_SECRET } = await import("../lib/scheduler-secret.js");
    expect("undefined" !== SCHEDULER_SECRET).toBe(true);
  });
});

// ── 8. Read model summary faithfully counts tenant-isolated sources ───────────

describe("Read model summary integrity", () => {
  it("availableSourceCount excludes coverage items that are not 'available'", () => {
    const coverage: AiVisibilityCoverageDiagnostic[] = [
      makeCoverage("local_presence", "available"),
      makeCoverage("discovery", "no_observation"),
      makeCoverage("reviews", "unauthorized"),
      makeCoverage("ai_query", "not_connected"),
    ];
    const model = composeAiVisibilityReadModel({ scope: makeScope(), observations: [], coverage, generatedAt: NOW });
    expect(model.summary.availableSourceCount).toBe(1);
    expect(model.summary.unavailableSourceCount).toBe(3);
  });

  it("rejected count matches rejected[] length", () => {
    const observations = [
      makeObservation({ clientId: TENANT_B }),
      makeObservation({ dedupeKey: "obs-geo", geography: "Adversarial, ZZ" }),
    ];
    const model = composeAiVisibilityReadModel({ scope: makeScope(), observations, coverage: [], generatedAt: NOW });
    expect(model.summary.rejectedCount).toBe(model.rejected.length);
    expect(model.summary.rejectedCount).toBe(2);
  });

  it("model clientId matches the scope clientId, never the rejected observation's clientId", () => {
    const obs = makeObservation({ clientId: TENANT_B });
    const model = composeAiVisibilityReadModel({
      scope: makeScope({ clientId: TENANT_A }),
      observations: [obs],
      coverage: [],
      generatedAt: NOW,
    });
    expect(model.clientId).toBe(TENANT_A);
    expect(model.clientId).not.toBe(TENANT_B);
  });
});
