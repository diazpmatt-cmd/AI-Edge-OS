/**
 * C9R-6 coverage diagnostic tests.
 *
 * Tests the adaptReviewImportResult() adapter and verifies that:
 *  - each ReviewImportResult kind maps to the correct AiVisibilityCoverageStatus
 *  - "not_tenant_safe" is never emitted by the C9R-6 adapter path
 *  - "available" summaries pass through adaptTenantSafeReviews() correctly
 *  - provider_error is a valid coverage status in the read-model
 *  - "unauthorized" maps to the explicit "unauthorized" status (not "not_connected")
 *  - target review count V1 policy returns null (no universal benchmark)
 *  - observations are suppressed when targetReviewCount is null
 */

import { describe, it, expect } from "vitest";
import {
  adaptReviewImportResult,
  adaptTenantSafeReviews,
  composeAiVisibilityReadModel,
  computeTargetReviewCount,
  type ReviewImportResult,
  type TenantSafeReviewSummary,
} from "@workspace/db";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW         = new Date("2026-07-20T10:00:00Z");
const CLIENT_ID   = "client-c9r6-test";
const GEO         = "Foley, AL";

function makeSummary(overrides: Partial<TenantSafeReviewSummary> = {}): TenantSafeReviewSummary {
  return {
    id:                "tsrs-001",
    clientId:          CLIENT_ID,
    platform:          "google",
    reviewCount:       23,
    averageRating:     4.5,
    targetReviewCount: null,
    observedAt:        NOW,
    geography:         GEO,
    ...overrides,
  };
}

// ── V1 target policy ──────────────────────────────────────────────────────────

describe("V1 target review count policy", () => {
  it("computeTargetReviewCount returns null for any clientId (no universal benchmark in V1)", () => {
    expect(computeTargetReviewCount("client-a")).toBeNull();
    expect(computeTargetReviewCount("client-b")).toBeNull();
    expect(computeTargetReviewCount("")).toBeNull();
  });
});

// ── adaptReviewImportResult ───────────────────────────────────────────────────

describe("adaptReviewImportResult", () => {
  it("maps 'disconnected' to not_connected coverage", () => {
    const result: ReviewImportResult = { kind: "disconnected", reason: "No GBP connection found." };
    const adapted = adaptReviewImportResult(result);
    expect(adapted.observations).toHaveLength(0);
    expect(adapted.coverage).toHaveLength(1);
    expect(adapted.coverage[0].source).toBe("reviews");
    expect(adapted.coverage[0].status).toBe("not_connected");
    expect(adapted.coverage[0].detail).toContain("No GBP connection found.");
  });

  it("maps 'unauthorized' to explicit 'unauthorized' coverage status (not 'not_connected')", () => {
    const result: ReviewImportResult = { kind: "unauthorized", reason: "userId mismatch." };
    const adapted = adaptReviewImportResult(result);
    expect(adapted.coverage[0].status).toBe("unauthorized");
    expect(adapted.coverage[0].detail).toContain("authorization error");
  });

  it("unauthorized coverage does not describe it as an ordinary disconnected integration", () => {
    const result: ReviewImportResult = { kind: "unauthorized", reason: "userId mismatch." };
    const adapted = adaptReviewImportResult(result);
    expect(adapted.coverage[0].status).not.toBe("not_connected");
    expect(adapted.coverage[0].detail).not.toContain("Connect GBP");
    expect(adapted.coverage[0].detail).not.toContain("No Google Business");
  });

  it("maps 'provider_error' to provider_error coverage", () => {
    const result: ReviewImportResult = { kind: "provider_error", error: "deadlock detected" };
    const adapted = adaptReviewImportResult(result);
    expect(adapted.coverage[0].status).toBe("provider_error");
    expect(adapted.coverage[0].detail).toContain("Provider error:");
    expect(adapted.coverage[0].detail).toContain("deadlock detected");
  });

  it("maps 'no_observation' to no_observation coverage with empty summaries", () => {
    const result: ReviewImportResult = { kind: "no_observation", reason: "No stats yet." };
    const adapted = adaptReviewImportResult(result);
    expect(adapted.coverage[0].source).toBe("reviews");
    expect(adapted.coverage[0].status).toBe("no_observation");
  });

  it("maps 'available' with below-target count to an observation + available coverage", () => {
    const summary = makeSummary({ reviewCount: 23, targetReviewCount: 50 });
    const result: ReviewImportResult = { kind: "available", summaries: [summary] };
    const adapted = adaptReviewImportResult(result);
    expect(adapted.coverage[0].status).toBe("available");
    expect(adapted.observations).toHaveLength(1);
    expect(adapted.observations[0].category).toBe("review_intelligence");
    expect(adapted.observations[0].title).toContain("google");
    expect(adapted.observations[0].whatWasObserved).toContain("23 reviews");
    expect(adapted.observations[0].whatWasObserved).toContain("50");
  });

  it("maps 'available' with null target to no observation (no universal benchmark in V1)", () => {
    const summary = makeSummary({ reviewCount: 23, targetReviewCount: null });
    const result: ReviewImportResult = { kind: "available", summaries: [summary] };
    const adapted = adaptReviewImportResult(result);
    expect(adapted.coverage[0].status).toBe("available");
    expect(adapted.observations).toHaveLength(0);
  });

  it("maps 'available' with at-target count to no observation + available coverage", () => {
    const summary = makeSummary({ reviewCount: 50, targetReviewCount: 50 });
    const result: ReviewImportResult = { kind: "available", summaries: [summary] };
    const adapted = adaptReviewImportResult(result);
    expect(adapted.coverage[0].status).toBe("available");
    expect(adapted.observations).toHaveLength(0);
  });

  it("never emits not_tenant_safe for any ReviewImportResult kind", () => {
    const cases: ReviewImportResult[] = [
      { kind: "disconnected",    reason: "x" },
      { kind: "unauthorized",    reason: "x" },
      { kind: "provider_error",  error: "x" },
      { kind: "no_observation",  reason: "x" },
      { kind: "available",       summaries: [makeSummary()] },
    ];
    for (const r of cases) {
      const adapted = adaptReviewImportResult(r);
      const statuses = adapted.coverage.map(c => c.status);
      expect(statuses).not.toContain("not_tenant_safe");
    }
  });
});

// ── adaptTenantSafeReviews passthrough ────────────────────────────────────────

describe("adaptTenantSafeReviews direct", () => {
  it("returns not_tenant_safe when null is passed (legacy path)", () => {
    const result = adaptTenantSafeReviews(null);
    expect(result.coverage[0].status).toBe("not_tenant_safe");
  });

  it("returns no_observation when empty array is passed", () => {
    const result = adaptTenantSafeReviews([]);
    expect(result.coverage[0].status).toBe("no_observation");
  });

  it("returns available with zero observations when all summaries have null target", () => {
    const summaries: TenantSafeReviewSummary[] = [
      makeSummary({ platform: "google",   reviewCount: 10, targetReviewCount: null }),
      makeSummary({ platform: "facebook", reviewCount: 55, id: "tsrs-002", targetReviewCount: null }),
    ];
    const result = adaptTenantSafeReviews(summaries);
    expect(result.coverage[0].status).toBe("available");
    expect(result.observations).toHaveLength(0);
  });

  it("returns available with one observation per below-target summary (explicit target)", () => {
    const summaries: TenantSafeReviewSummary[] = [
      makeSummary({ platform: "google",   reviewCount: 10, targetReviewCount: 50 }),
      makeSummary({ platform: "facebook", reviewCount: 55, id: "tsrs-002", targetReviewCount: 50 }),
    ];
    const result = adaptTenantSafeReviews(summaries);
    expect(result.coverage[0].status).toBe("available");
    // Only google (10 < 50) generates an observation; facebook (55 >= 50) does not
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].title).toContain("google");
  });

  it("suppresses observations when targetReviewCount is null even for low counts", () => {
    const summaries: TenantSafeReviewSummary[] = [
      makeSummary({ reviewCount: 1, targetReviewCount: null }),
    ];
    const result = adaptTenantSafeReviews(summaries);
    expect(result.coverage[0].status).toBe("available");
    expect(result.observations).toHaveLength(0);
  });
});

// ── Read-model composition with C9R-6 coverage ───────────────────────────────

describe("composeAiVisibilityReadModel with provider_error reviews coverage", () => {
  it("accepts provider_error as a valid coverage status", () => {
    const scope = {
      clientId: CLIENT_ID,
      activeServiceIds: Object.freeze([] as string[]),
      authorizedGeographies: Object.freeze([GEO]),
      prohibitedPhrases: Object.freeze([] as string[]),
    };
    const coverage = adaptReviewImportResult({ kind: "provider_error", error: "test" }).coverage;

    const model = composeAiVisibilityReadModel({
      scope,
      observations: [],
      coverage,
      generatedAt: NOW,
    });

    const reviewCov = model.coverage.find(c => c.source === "reviews");
    expect(reviewCov?.status).toBe("provider_error");
    expect(model.recommendations).toBeDefined();
  });

  it("accepts unauthorized as a valid coverage status distinct from not_connected", () => {
    const scope = {
      clientId: CLIENT_ID,
      activeServiceIds: Object.freeze([] as string[]),
      authorizedGeographies: Object.freeze([GEO]),
      prohibitedPhrases: Object.freeze([] as string[]),
    };
    const coverage = adaptReviewImportResult({ kind: "unauthorized", reason: "mismatch" }).coverage;

    const model = composeAiVisibilityReadModel({
      scope,
      observations: [],
      coverage,
      generatedAt: NOW,
    });

    const reviewCov = model.coverage.find(c => c.source === "reviews");
    expect(reviewCov?.status).toBe("unauthorized");
    expect(reviewCov?.status).not.toBe("not_connected");
  });
});
