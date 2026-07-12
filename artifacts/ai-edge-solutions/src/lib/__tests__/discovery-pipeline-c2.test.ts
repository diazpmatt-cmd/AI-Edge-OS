/**
 * Phase C2 — Tests M, N, O, P, Q, R, S & T
 *
 * M.  Pipeline produces a DiscoveryRunSummary with correct shape
 * N.  Fault tolerance: one provider failure → status="partial", not "failed"
 * O.  All providers fail → status="partial" (stages 1/8/9/10 always succeed)
 * P.  No-provider run → zero signals, zero clusters, zero opportunities
 * Q.  Seed extraction: correct seed count and format
 * R.  deriveRunId: stable and deterministic
 * S.  Tenant isolation (pipeline-level): foreign clientId signals excluded
 * T.  Determinism: identical runs produce identical summaries
 */

import { describe, it, expect, vi } from "vitest";
import {
  DiscoveryPipeline,
  extractSeeds,
  deriveRunId,
} from "../../../../../lib/db/src/discovery-pipeline";
import {
  buildDiscoveryContext,
  type DiscoveryContext,
} from "../../../../../lib/db/src/discovery-context";
import {
  buildClientContentContext,
  bbbRegistryProvider,
} from "../../../../../lib/db/src/client-context";
import type {
  DiscoveryProviderSet,
  SearchDataProvider,
  RawKeywordResult,
} from "../../../../../lib/db/src/discovery-providers";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const NOW     = new Date("2026-07-12T10:00:00.000Z");
const BBB_CTX = buildClientContentContext(null, bbbRegistryProvider);

function makeBBBContext(overrides: { aiSearchGapScore?: number } = {}): DiscoveryContext {
  return buildDiscoveryContext({
    contentContext:   BBB_CTX,
    clientId:         "bbb-test-01",
    now:              NOW,
    aiSearchGapScore: overrides.aiSearchGapScore ?? 50,
  });
}

function makeRawKeyword(keyword: string, volumeMonthly: number | null = 500, intent = "local"): RawKeywordResult {
  return {
    keyword,
    volumeMonthly,
    difficulty:     40,
    intent:         intent as any,
    cpc:            3.00,
    relatedQueries: [],
    providerRaw:    {},
  };
}

/** A working SearchDataProvider that returns 3 keyword results */
function makeWorkingSearchProvider(): SearchDataProvider {
  return {
    name:           "test_fixture",
    fetchKeywords:  async ({ seeds }) => [
      makeRawKeyword(`${seeds[0] ?? "bed bug"} inspection foley al`, 500),
      makeRawKeyword(`${seeds[0] ?? "bed bug"} treatment near me`, 320),
      makeRawKeyword(`${seeds[0] ?? "bed bug"} exterminator daphne al`, 200),
    ],
    fetchPAAResults: async () => [],
    fetchCompetitorKeywords: async () => [],
  };
}

/** A SearchDataProvider that always throws */
function makeFailingSearchProvider(): SearchDataProvider {
  return {
    name:           "test_fixture",
    fetchKeywords:  async () => { throw new Error("provider_timeout"); },
    fetchPAAResults: async () => [],
    fetchCompetitorKeywords: async () => [],
  };
}

/** Empty provider set — no providers at all */
const EMPTY_PROVIDERS: DiscoveryProviderSet = {};

/** Provider set with one working search provider */
function makeWorkingProviders(): DiscoveryProviderSet {
  return { search: makeWorkingSearchProvider() };
}

/** Provider set where the search provider always fails */
function makeFailingProviders(): DiscoveryProviderSet {
  return { search: makeFailingSearchProvider() };
}

// ══════════════════════════════════════════════════════════════════════════════
// M. Pipeline produces a DiscoveryRunSummary with correct shape
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-M-1: DiscoveryRunSummary — required fields", () => {
  it("summary has all required top-level fields", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const summary  = await pipeline.run(makeBBBContext());

    expect(typeof summary.runId).toBe("string");
    expect(typeof summary.clientId).toBe("string");
    expect(typeof summary.weekLabel).toBe("string");
    expect(["complete", "partial", "failed"]).toContain(summary.status);
    expect(Array.isArray(summary.providersAttempted)).toBe(true);
    expect(Array.isArray(summary.providersSucceeded)).toBe(true);
    expect(Array.isArray(summary.providersFailed)).toBe(true);
    expect(Array.isArray(summary.providerFailures)).toBe(true);
    expect(typeof summary.signals).toBe("object");
    expect(typeof summary.clusters).toBe("object");
    expect(typeof summary.opportunities).toBe("object");
    expect(typeof summary.topOpportunityScore).toBe("number");
    expect(typeof summary.runDurationMs).toBe("number");
    expect(Array.isArray(summary.topOpportunities)).toBe(true);
    expect(Array.isArray(summary.allClusters)).toBe(true);
  });

  it("signals object has received/accepted/blocked counts", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(typeof summary.signals.received).toBe("number");
    expect(typeof summary.signals.accepted).toBe("number");
    expect(typeof summary.signals.blocked).toBe("number");
  });

  it("accepted + blocked = received", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.signals.accepted + summary.signals.blocked).toBe(summary.signals.received);
  });

  it("clientId matches context.clientId", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const ctx      = makeBBBContext();
    const summary  = await pipeline.run(ctx);
    expect(summary.clientId).toBe(ctx.clientId);
  });

  it("weekLabel matches context.currentWeek", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const ctx      = makeBBBContext();
    const summary  = await pipeline.run(ctx);
    expect(summary.weekLabel).toBe(ctx.currentWeek);
  });

  it("runDurationMs is a non-negative number", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.runDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("topOpportunities.length ≤ 5", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.topOpportunities.length).toBeLessThanOrEqual(5);
  });

  it("topOpportunities are sorted by compositeScore descending", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    for (let i = 1; i < summary.topOpportunities.length; i++) {
      expect(summary.topOpportunities[i - 1]!.compositeScore)
        .toBeGreaterThanOrEqual(summary.topOpportunities[i]!.compositeScore);
    }
  });
});

describe("T-C2-M-2: working provider produces signals, clusters, opportunities", () => {
  it("signals.received > 0 with working provider", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.signals.received).toBeGreaterThan(0);
  });

  it("clusters.created > 0 with working provider", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.clusters.created).toBeGreaterThan(0);
  });

  it("opportunities.created > 0 with working provider", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.opportunities.created).toBeGreaterThan(0);
  });

  it("opportunities.highPriority ≤ opportunities.created", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.opportunities.highPriority).toBeLessThanOrEqual(summary.opportunities.created);
  });

  it("providersAttempted contains provider name", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.providersAttempted).toContain("test_fixture");
  });

  it("providersSucceeded contains provider name on success", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.providersSucceeded).toContain("test_fixture");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// N. Fault tolerance: one provider failure → status="partial", not "failed"
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-N-1: single provider failure → partial status", () => {
  it("failing search provider → status='partial'", async () => {
    const pipeline = new DiscoveryPipeline(makeFailingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.status).toBe("partial");
  });

  it("failing provider → providersFailed contains provider name", async () => {
    const pipeline = new DiscoveryPipeline(makeFailingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.providersFailed).toContain("test_fixture");
  });

  it("failing provider → providersSucceeded does NOT contain provider name", async () => {
    const pipeline = new DiscoveryPipeline(makeFailingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.providersSucceeded).not.toContain("test_fixture");
  });

  it("failing provider → providerFailures contains the error", async () => {
    const pipeline = new DiscoveryPipeline(makeFailingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.providerFailures.length).toBeGreaterThan(0);
    expect(summary.providerFailures[0]!.error).toContain("provider_timeout");
  });

  it("failing provider → providerFailures[0].stage is 2 (keyword expansion stage)", async () => {
    const pipeline = new DiscoveryPipeline(makeFailingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.providerFailures[0]!.stage).toBe(2);
  });

  it("failing provider → run still completes (does not throw)", async () => {
    const pipeline = new DiscoveryPipeline(makeFailingProviders());
    await expect(pipeline.run(makeBBBContext())).resolves.toBeDefined();
  });

  it("failing search provider → signals.received = 0 (no signals from failed stage)", async () => {
    const pipeline = new DiscoveryPipeline(makeFailingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.signals.received).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// O. All providers fail → status="partial" (pure stages always succeed)
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-O-1: all providers fail → partial (not 'failed')", () => {
  it("all providers failing → status='partial'", async () => {
    const providers: DiscoveryProviderSet = {
      search:   makeFailingSearchProvider(),
      paa:      { name: "paa_failing", fetchPAA: async () => { throw new Error("paa_err"); } },
      trend:    { name: "trend_failing", getSeasonalTrends: async () => { throw new Error("trend_err"); } },
      aiSearch: { name: "ai_failing", probeQuery: async () => { throw new Error("ai_err"); } },
      social:   { name: "social_failing", fetchRedditSignals: async () => { throw new Error("social_err"); } },
    };
    const pipeline = new DiscoveryPipeline(providers);
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.status).toBe("partial");
  });

  it("all providers failing → run completes without throwing", async () => {
    const providers: DiscoveryProviderSet = {
      search: makeFailingSearchProvider(),
    };
    const pipeline = new DiscoveryPipeline(providers);
    await expect(pipeline.run(makeBBBContext())).resolves.toBeDefined();
  });

  it("all providers failing → signals.received = 0", async () => {
    const pipeline = new DiscoveryPipeline(makeFailingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.signals.received).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P. No-provider run: zero signals, clusters, opportunities
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-P-1: empty provider set → all-zero output", () => {
  it("no providers → signals.received = 0", async () => {
    const pipeline = new DiscoveryPipeline(EMPTY_PROVIDERS);
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.signals.received).toBe(0);
  });

  it("no providers → signals.accepted = 0", async () => {
    const pipeline = new DiscoveryPipeline(EMPTY_PROVIDERS);
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.signals.accepted).toBe(0);
  });

  it("no providers → clusters.created = 0", async () => {
    const pipeline = new DiscoveryPipeline(EMPTY_PROVIDERS);
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.clusters.created).toBe(0);
  });

  it("no providers → opportunities.created = 0", async () => {
    const pipeline = new DiscoveryPipeline(EMPTY_PROVIDERS);
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.opportunities.created).toBe(0);
  });

  it("no providers → topOpportunityScore = 0", async () => {
    const pipeline = new DiscoveryPipeline(EMPTY_PROVIDERS);
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.topOpportunityScore).toBe(0);
  });

  it("no providers → status = 'complete' (no failures to report)", async () => {
    const pipeline = new DiscoveryPipeline(EMPTY_PROVIDERS);
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.status).toBe("complete");
  });

  it("no providers → providersAttempted is empty", async () => {
    const pipeline = new DiscoveryPipeline(EMPTY_PROVIDERS);
    const summary  = await pipeline.run(makeBBBContext());
    expect(summary.providersAttempted).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Q. Seed extraction
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-Q-1: extractSeeds — count and format", () => {
  it("produces at least 1 seed for BBB context", () => {
    const ctx   = makeBBBContext();
    const seeds = extractSeeds(ctx);
    expect(seeds.length).toBeGreaterThan(0);
  });

  it("produces at most 30 seeds (10 services × 3 cities)", () => {
    const ctx   = makeBBBContext();
    const seeds = extractSeeds(ctx);
    expect(seeds.length).toBeLessThanOrEqual(30);
  });

  it("all seeds are non-empty strings", () => {
    const ctx   = makeBBBContext();
    const seeds = extractSeeds(ctx);
    expect(seeds.every(s => typeof s === "string" && s.length > 0)).toBe(true);
  });

  it("seeds are deduplicated (no exact duplicates)", () => {
    const ctx   = makeBBBContext();
    const seeds = extractSeeds(ctx);
    const unique = new Set(seeds);
    expect(unique.size).toBe(seeds.length);
  });

  it("at least one seed includes the primary city name", () => {
    const ctx   = makeBBBContext();
    const seeds = extractSeeds(ctx);
    const hasCity = seeds.some(s => s.toLowerCase().includes(ctx.location.city.toLowerCase()));
    expect(hasCity).toBe(true);
  });

  it("at least one seed is a bare service displayName", () => {
    const ctx   = makeBBBContext();
    const seeds = extractSeeds(ctx);
    const serviceNames = ctx.discoveryServices.map(s => s.displayName);
    const hasBareService = seeds.some(s => serviceNames.includes(s));
    expect(hasBareService).toBe(true);
  });

  it("extractSeeds is deterministic: same context → same seeds", () => {
    const ctx    = makeBBBContext();
    const seeds1 = extractSeeds(ctx);
    const seeds2 = extractSeeds(ctx);
    expect(seeds1).toEqual(seeds2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// R. deriveRunId: stable and deterministic
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-R-1: deriveRunId", () => {
  it("same (clientId, weekLabel) → same runId", () => {
    expect(deriveRunId("bbb-01", "2026-W28")).toBe(deriveRunId("bbb-01", "2026-W28"));
  });

  it("different clientId → different runId", () => {
    expect(deriveRunId("bbb-01", "2026-W28")).not.toBe(deriveRunId("lakeside-01", "2026-W28"));
  });

  it("different weekLabel → different runId", () => {
    expect(deriveRunId("bbb-01", "2026-W28")).not.toBe(deriveRunId("bbb-01", "2026-W29"));
  });

  it("runId starts with 'run::'", () => {
    expect(deriveRunId("bbb-01", "2026-W28")).toMatch(/^run::/);
  });

  it("runId contains clientId", () => {
    expect(deriveRunId("bbb-test-01", "2026-W28")).toContain("bbb-test-01");
  });

  it("runId contains weekLabel", () => {
    expect(deriveRunId("bbb-01", "2026-W28")).toContain("2026-W28");
  });

  it("pipeline run summary runId matches deriveRunId(context)", async () => {
    const pipeline = new DiscoveryPipeline(EMPTY_PROVIDERS);
    const ctx      = makeBBBContext();
    const summary  = await pipeline.run(ctx);
    expect(summary.runId).toBe(deriveRunId(ctx.clientId, ctx.currentWeek));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// S. Tenant isolation (pipeline-level)
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-S-1: pipeline signals carry correct clientId", () => {
  it("all opportunities have clientId = context.clientId", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const ctx      = makeBBBContext();
    const summary  = await pipeline.run(ctx);
    for (const opp of summary.topOpportunities) {
      expect(opp.clientId).toBe(ctx.clientId);
    }
  });

  it("all clusters have clientId = context.clientId", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const ctx      = makeBBBContext();
    const summary  = await pipeline.run(ctx);
    for (const cluster of summary.allClusters) {
      expect(cluster.clientId).toBe(ctx.clientId);
    }
  });
});

describe("T-C2-S-2: pipeline runs for different clients are independent", () => {
  it("two concurrent runs for different clients produce separate summaries", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());

    // Lakeside Plumbing is the second tenant fixture — created inline, not in DB
    const LAKESIDE_REGISTRY = bbbRegistryProvider; // uses BBB registry for test simplicity
    const LAKESIDE_CTX_CONTENT = buildClientContentContext(null, LAKESIDE_REGISTRY);
    const lakesideContext = buildDiscoveryContext({
      contentContext: LAKESIDE_CTX_CONTENT,
      clientId: "lakeside-test-01",
      now: NOW,
    });
    const bbbContext = makeBBBContext();

    const [bbbSummary, lakesideSummary] = await Promise.all([
      pipeline.run(bbbContext),
      pipeline.run(lakesideContext),
    ]);

    expect(bbbSummary.clientId).toBe("bbb-test-01");
    expect(lakesideSummary.clientId).toBe("lakeside-test-01");
    expect(bbbSummary.runId).not.toBe(lakesideSummary.runId);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// T. Determinism: identical runs produce identical summaries
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-T-1: pipeline determinism (no Math.random)", () => {
  it("two identical runs produce the same runId", async () => {
    const pipeline = new DiscoveryPipeline(EMPTY_PROVIDERS);
    const ctx      = makeBBBContext();
    const s1 = await pipeline.run(ctx);
    const s2 = await pipeline.run(ctx);
    expect(s1.runId).toBe(s2.runId);
  });

  it("two identical runs produce the same signal counts", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const ctx      = makeBBBContext();
    const s1 = await pipeline.run(ctx);
    const s2 = await pipeline.run(ctx);
    expect(s1.signals.received).toBe(s2.signals.received);
    expect(s1.signals.accepted).toBe(s2.signals.accepted);
  });

  it("two identical runs produce the same cluster count", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const ctx      = makeBBBContext();
    const s1 = await pipeline.run(ctx);
    const s2 = await pipeline.run(ctx);
    expect(s1.clusters.created).toBe(s2.clusters.created);
  });

  it("two identical runs produce the same topOpportunityScore", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const ctx      = makeBBBContext();
    const s1 = await pipeline.run(ctx);
    const s2 = await pipeline.run(ctx);
    expect(s1.topOpportunityScore).toBe(s2.topOpportunityScore);
  });

  it("pipeline never returns NaN in any score field", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    for (const opp of summary.topOpportunities) {
      expect(Number.isNaN(opp.compositeScore)).toBe(false);
      expect(Number.isNaN(opp.scoreCard.searchDemand)).toBe(false);
      expect(Number.isNaN(opp.scoreCard.competitorGap)).toBe(false);
      expect(Number.isNaN(opp.scoreCard.revenueImpact)).toBe(false);
      expect(Number.isNaN(opp.scoreCard.contentFeasibility)).toBe(false);
      expect(Number.isNaN(opp.scoreCard.seasonalRelevance)).toBe(false);
      expect(Number.isNaN(opp.scoreCard.aiSearchPotential)).toBe(false);
      expect(Number.isNaN(opp.scoreCard.composite)).toBe(false);
    }
  });

  it("all composite scores are in [0, 100]", async () => {
    const pipeline = new DiscoveryPipeline(makeWorkingProviders());
    const summary  = await pipeline.run(makeBBBContext());
    for (const opp of summary.topOpportunities) {
      expect(opp.compositeScore).toBeGreaterThanOrEqual(0);
      expect(opp.compositeScore).toBeLessThanOrEqual(100);
    }
  });
});
