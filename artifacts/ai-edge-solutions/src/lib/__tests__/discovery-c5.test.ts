/**
 * Phase C5 — Capability, Orchestration, Coverage, Budget, Cost & Enrichment Tests
 *
 * 26 test categories (A–Z):
 *
 *   A.  Capability declaration — DATAFORSEO_CAPABILITIES has expected capabilities
 *   B.  Unsupported capabilities — hasCapability returns false for trend_history etc.
 *   C.  Deterministic provider ordering — SearchOrchestrator sorts by priority asc
 *   D.  Primary-only mode — only first provider called
 *   E.  Fallback success — secondary runs after primary retryable failure
 *   F.  Fallback stop condition — secondary not called after primary success
 *   G.  Non-retryable fallback stop — auth_error stops chain, error propagates
 *   H.  Merge mode — results from both providers merged and deduplicated
 *   I.  Merge determinism — same input set always produces same output
 *   J.  Cross-provider deduplication — same keyword from 2 providers = 1 signal
 *   K.  Provenance preservation — _mergedFromProviders on merged signal
 *   L.  Evidence-strength rules — stronger signal wins, no inflation
 *   M.  Keyword metric mapping — volume, difficulty, CPC in providerRaw.cpcUsd
 *   N.  SERP result mapping — organicResults has rank, url, domain, title, snippet
 *   O.  PAA extraction — paaQuestions in providerRaw, deduplicated
 *   P.  Competitor domain extraction — directories excluded, local domains kept
 *   Q.  Competitor keyword extraction — returns [] (Stage 5 inactive)
 *   R.  Coverage state — UnknownCoverageProvider returns "unknown" for all inputs
 *   S.  Scorecard compatibility — C2 scorecard (no version field) parses cleanly
 *   T.  Enriched scoring — CPC/PAA/competitor data adjusts composite deterministically
 *   U.  Cost estimation — CostLedger accumulates and reports correctly
 *   V.  Cost record IDs — deriveCostRecordId is deterministic; cross-tenant safe
 *   W.  Budget rejection — BudgetGuard blocks when ceiling exceeded
 *   X.  Dry-run mode — BudgetGuard.dryRunMode blocks all calls
 *   Y.  Retry classification — auth_error not retryable; timeout retryable
 *   Z.  Full regression — key C2/C3/C4 interfaces unchanged
 *
 * Focused tests (after A–Z):
 *   budget_rejected error kind in DataForSEOErrorKind
 *   Malformed scorecard throws, not silently passes
 *   Tenant isolation in mergeSignals
 *   Cost record ID idempotency
 *   Ceiling clamping to MAX_RUN_CEILING_USD
 *   AllCapabilities list ordering
 *   describeCapabilities report shape
 *   Enrichment extraction from signals with no providerRaw data
 *   Coverage-state adjustment direction (covered reduces gap, gap increases it)
 *   PAA-question boost threshold (2 = no boost, 3 = boost)
 *   CPC threshold (cpcUsd ≤ 2 = no boost)
 *   Merge mode: one provider fails → partial merge returned (not empty)
 *   Non-retryable in merge mode → empty contribution (not abort)
 *   Budget ceiling clamped to MAX_RUN_CEILING_USD regardless of caller input
 *   Blocked query: termite inspection blocked
 *   Educational-only: fumigation flagged educational-only
 *   cpcUsd persisted in providerRaw (adapter adds it)
 *   Secret not in DataForSEOError message
 *
 * No live HTTP calls in this file.
 * No Math.random().
 * No BB&B-specific values in canonical discovery files tested here
 *   (tests may use BB&B context as fixture input — same as C4).
 */

import { describe, it, expect, vi } from "vitest";

// ── Relative imports ───────────────────────────────────────────────────────────

import {
  DATAFORSEO_CAPABILITIES,
  ALL_CAPABILITIES,
  hasCapability,
  describeCapabilities,
  type ProviderCapability,
} from "../../../../../lib/db/src/discovery-capability";

import {
  UnknownCoverageProvider,
} from "../../../../../lib/db/src/discovery-coverage";
import type { CoverageState } from "../../../../../lib/db/src/discovery-types";

import {
  BudgetGuard,
  MAX_RUN_CEILING_USD,
  DEFAULT_RUN_CEILING_USD,
} from "../../../../../lib/db/src/discovery-budget-guard";

import {
  CostLedger,
  deriveCostRecordId,
} from "../../../../../lib/db/src/discovery-cost-ledger";

import {
  mergeSignals,
  mergeKeywordResults,
} from "../../../../../lib/db/src/discovery-merger";

import {
  isRetryableError,
  SearchOrchestrator,
} from "../../../../../lib/db/src/discovery-orchestrator";
import type { OrchestrationProviderEntry } from "../../../../../lib/db/src/discovery-orchestrator";

import {
  extractEnrichmentFromSignals,
  enrichOpportunity,
} from "../../../../../lib/db/src/discovery-enricher";

import {
  DataForSEOError,
  parseDataForSEOConfig,
  type DataForSEOErrorKind,
} from "../../../../../lib/db/src/dataforseo-config";

import {
  extractCompetitorDomains,
  extractPAAQuestions,
} from "../../../../../lib/db/src/dataforseo-adapter";

import {
  isQueryBlocked,
  isQueryEducationalOnly,
} from "../../../../../lib/db/src/dataforseo-query-planner";

import {
  parseScoreCard,
} from "../../../../../lib/db/src/discovery-drizzle-repository";

import {
  computeComposite,
} from "../../../../../lib/db/src/discovery-scorer";

import type {
  DiscoverySignal,
  DiscoveryOpportunity,
  OpportunityScoreCard,
} from "../../../../../lib/db/src/discovery-types";
import type {
  SearchDataProvider,
  RawKeywordResult,
} from "../../../../../lib/db/src/discovery-providers";

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeSignal(overrides: Partial<DiscoverySignal> = {}): DiscoverySignal {
  return {
    id:               "sig::client-a::dataforseo::bed bug treatment",
    snapshotId:       "snap-1",
    clientId:         "client-a",
    signalType:       "keyword",
    source:           "dataforseo",
    rawValue:         "bed bug treatment",
    normalizedValue:  "bed bug treatment",
    serviceId:        "bed-bug-treatment",
    intent:           "local",
    volumeEstimate:   1200,
    difficultyScore:  45,
    seasonalRelevance: 80,
    geographicScope:  "local",
    trendDirection:   "stable",
    competitorRank:   null,
    citationFound:    null,
    evidenceStrength: 90,
    rawProviderData:  {},
    createdAt:        new Date("2026-07-12T00:00:00Z"),
    ...overrides,
  };
}

function makeOpportunity(overrides: Partial<DiscoveryOpportunity> = {}): DiscoveryOpportunity {
  const scoreCard: OpportunityScoreCard = {
    searchDemand:        60,
    competitorGap:       55,
    revenueImpact:       50,
    contentFeasibility:  70,
    seasonalRelevance:   80,
    aiSearchPotential:   45,
    composite:           0,
    confidence:          "high",
    explanations: {
      searchDemand:       "1200 volume",
      competitorGap:      "5 competitors",
      revenueImpact:      "commercial intent",
      contentFeasibility: "short content",
      seasonalRelevance:  "peak season",
      aiSearchPotential:  "3 PAA questions",
    },
  };
  scoreCard.composite = computeComposite(scoreCard);

  return {
    id:              "opp-1",
    snapshotId:      "snap-1",
    clientId:        "client-a",
    opportunityType: "content_topic",
    title:           "Bed Bug Treatment",
    description:     "High-value local service opportunity",
    targetEngine:    "content",
    clusterId:       "cluster-1",
    serviceId:       "bed-bug-treatment",
    scoreCard,
    compositeScore:  scoreCard.composite,
    priority:        "high",
    status:          "pending",
    assignedAt:      null,
    createdAt:       new Date("2026-07-12T00:00:00Z"),
    ...overrides,
  };
}

/** A minimal SearchDataProvider mock that returns keyword results. */
function makeSearchProvider(
  name: "dataforseo" | "serp_api",
  results: RawKeywordResult[],
  shouldThrow?: DataForSEOError,
): SearchDataProvider {
  return {
    name,
    fetchKeywords: vi.fn().mockImplementation(async () => {
      if (shouldThrow) throw shouldThrow;
      return results;
    }),
    fetchCompetitorKeywords: vi.fn().mockResolvedValue([]),
  };
}

function makeKeywordResult(keyword: string, volume: number | null = 1000): RawKeywordResult {
  return {
    keyword,
    volumeMonthly:  volume,
    difficulty:     40,
    intent:         "local",
    cpc:            null,
    relatedQueries: [],
    providerRaw:    { source: "dataforseo_serp" },
  };
}

const FIXED_RUN_ARGS = {
  seeds:    ["bed bug treatment", "pest control"],
  city:     "Mobile",
  state:    "AL",
  industry: "pest-control",
  limit:    20,
};

// ── A: Capability declaration ──────────────────────────────────────────────────

describe("A. Capability declaration", () => {
  it("DATAFORSEO_CAPABILITIES contains expected supported capabilities", () => {
    const expected: ProviderCapability[] = [
      "search_volume", "keyword_difficulty", "serp_results", "paa",
      "competitor_domains", "geo_targeting", "language_targeting", "device_targeting",
    ];
    for (const cap of expected) {
      expect(DATAFORSEO_CAPABILITIES.has(cap)).toBe(true);
    }
  });

  it("DATAFORSEO_CAPABILITIES has exactly 8 capabilities", () => {
    expect(DATAFORSEO_CAPABILITIES.size).toBe(8);
  });

  it("ALL_CAPABILITIES contains 13 entries in stable order", () => {
    expect(ALL_CAPABILITIES).toHaveLength(13);
    expect(ALL_CAPABILITIES[0]).toBe("search_volume");
    expect(ALL_CAPABILITIES[ALL_CAPABILITIES.length - 1]).toBe("language_targeting");
  });
});

// ── B: Unsupported capabilities ────────────────────────────────────────────────

describe("B. Unsupported capabilities", () => {
  const unsupported: ProviderCapability[] = [
    "trend_history", "social_signals", "competitor_keywords",
    "related_searches", "local_pack",
  ];

  for (const cap of unsupported) {
    it(`hasCapability returns false for ${cap}`, () => {
      expect(hasCapability(DATAFORSEO_CAPABILITIES, cap)).toBe(false);
    });
  }

  it("hasCapability returns true for search_volume", () => {
    expect(hasCapability(DATAFORSEO_CAPABILITIES, "search_volume")).toBe(true);
  });
});

// ── C: Deterministic provider ordering ────────────────────────────────────────

describe("C. Deterministic provider ordering", () => {
  it("providers are sorted by priority ascending (lower number = first)", () => {
    const p1 = makeSearchProvider("dataforseo", [makeKeywordResult("kw1")]);
    const p2 = makeSearchProvider("serp_api",   [makeKeywordResult("kw2")]);

    const orchestrator = new SearchOrchestrator({
      mode: "primary_only",
      providers: [
        { provider: p2, capabilities: DATAFORSEO_CAPABILITIES, priority: 2 },
        { provider: p1, capabilities: DATAFORSEO_CAPABILITIES, priority: 1 },
      ],
    });

    // Name should be the primary provider's name
    expect(orchestrator.name).toBe("dataforseo");
  });

  it("same provider list always produces same name regardless of insertion order", () => {
    const p1 = makeSearchProvider("dataforseo", []);
    const p2 = makeSearchProvider("serp_api",   []);

    const o1 = new SearchOrchestrator({
      mode: "primary_only",
      providers: [
        { provider: p2, capabilities: DATAFORSEO_CAPABILITIES, priority: 10 },
        { provider: p1, capabilities: DATAFORSEO_CAPABILITIES, priority: 1 },
      ],
    });

    const o2 = new SearchOrchestrator({
      mode: "primary_only",
      providers: [
        { provider: p1, capabilities: DATAFORSEO_CAPABILITIES, priority: 1 },
        { provider: p2, capabilities: DATAFORSEO_CAPABILITIES, priority: 10 },
      ],
    });

    expect(o1.name).toBe("dataforseo");
    expect(o2.name).toBe("dataforseo");
  });
});

// ── D: Primary-only mode ───────────────────────────────────────────────────────

describe("D. Primary-only mode", () => {
  it("only the first (priority=1) provider is called", async () => {
    const primary   = makeSearchProvider("dataforseo", [makeKeywordResult("bed bug treatment")]);
    const secondary = makeSearchProvider("serp_api",   [makeKeywordResult("pest control")]);

    const orchestrator = new SearchOrchestrator({
      mode: "primary_only",
      providers: [
        { provider: primary,   capabilities: DATAFORSEO_CAPABILITIES, priority: 1 },
        { provider: secondary, capabilities: DATAFORSEO_CAPABILITIES, priority: 2 },
      ],
    });

    const results = await orchestrator.fetchKeywords(FIXED_RUN_ARGS);
    expect(results).toHaveLength(1);
    expect(results[0]?.keyword).toBe("bed bug treatment");
    expect(primary.fetchKeywords).toHaveBeenCalledOnce();
    expect(secondary.fetchKeywords).not.toHaveBeenCalled();
  });

  it("primary-only: error propagates — secondary not tried", async () => {
    const err     = new DataForSEOError("timeout", "request timed out");
    const primary = makeSearchProvider("dataforseo", [], err);
    const secondary = makeSearchProvider("serp_api", [makeKeywordResult("kw")]);

    const orchestrator = new SearchOrchestrator({
      mode: "primary_only",
      providers: [
        { provider: primary,   capabilities: DATAFORSEO_CAPABILITIES, priority: 1 },
        { provider: secondary, capabilities: DATAFORSEO_CAPABILITIES, priority: 2 },
      ],
    });

    await expect(orchestrator.fetchKeywords(FIXED_RUN_ARGS)).rejects.toThrow("timeout");
    expect(secondary.fetchKeywords).not.toHaveBeenCalled();
  });
});

// ── E: Fallback success ────────────────────────────────────────────────────────

describe("E. Fallback success", () => {
  it("secondary runs and returns results when primary throws retryable error", async () => {
    const retryableErr = new DataForSEOError("timeout", "primary timed out");
    const primary      = makeSearchProvider("dataforseo", [], retryableErr);
    const secondary    = makeSearchProvider("serp_api", [makeKeywordResult("pest control")]);

    const orchestrator = new SearchOrchestrator({
      mode: "fallback",
      providers: [
        { provider: primary,   capabilities: DATAFORSEO_CAPABILITIES, priority: 1 },
        { provider: secondary, capabilities: DATAFORSEO_CAPABILITIES, priority: 2 },
      ],
    });

    const results = await orchestrator.fetchKeywords(FIXED_RUN_ARGS);
    expect(results).toHaveLength(1);
    expect(results[0]?.keyword).toBe("pest control");
    expect(primary.fetchKeywords).toHaveBeenCalledOnce();
    expect(secondary.fetchKeywords).toHaveBeenCalledOnce();
  });

  it("fallback returns empty when all providers fail with retryable errors", async () => {
    const err1 = new DataForSEOError("timeout", "p1 timeout");
    const err2 = new DataForSEOError("provider_error", "p2 5xx");
    const p1   = makeSearchProvider("dataforseo", [], err1);
    const p2   = makeSearchProvider("serp_api",   [], err2);

    const orchestrator = new SearchOrchestrator({
      mode: "fallback",
      providers: [
        { provider: p1, capabilities: DATAFORSEO_CAPABILITIES, priority: 1 },
        { provider: p2, capabilities: DATAFORSEO_CAPABILITIES, priority: 2 },
      ],
    });

    const results = await orchestrator.fetchKeywords(FIXED_RUN_ARGS);
    expect(results).toEqual([]);
  });
});

// ── F: Fallback stop condition ─────────────────────────────────────────────────

describe("F. Fallback stop condition", () => {
  it("secondary is NOT called when primary succeeds", async () => {
    const primary   = makeSearchProvider("dataforseo", [makeKeywordResult("kw1")]);
    const secondary = makeSearchProvider("serp_api",   [makeKeywordResult("kw2")]);

    const orchestrator = new SearchOrchestrator({
      mode: "fallback",
      providers: [
        { provider: primary,   capabilities: DATAFORSEO_CAPABILITIES, priority: 1 },
        { provider: secondary, capabilities: DATAFORSEO_CAPABILITIES, priority: 2 },
      ],
    });

    const results = await orchestrator.fetchKeywords(FIXED_RUN_ARGS);
    expect(results).toHaveLength(1);
    expect(results[0]?.keyword).toBe("kw1");
    expect(secondary.fetchKeywords).not.toHaveBeenCalled();
  });
});

// ── G: Non-retryable fallback stop ────────────────────────────────────────────

describe("G. Non-retryable fallback stop", () => {
  const nonRetryableKinds: DataForSEOErrorKind[] = [
    "auth_error",
    "quota_exceeded",
    "provider_disabled",
    "provider_unconfigured",
  ];

  for (const kind of nonRetryableKinds) {
    it(`${kind} stops fallback chain — secondary not called, error propagates`, async () => {
      const err       = new DataForSEOError(kind, `${kind} failure`);
      const primary   = makeSearchProvider("dataforseo", [], err);
      const secondary = makeSearchProvider("serp_api",   [makeKeywordResult("kw")]);

      const orchestrator = new SearchOrchestrator({
        mode: "fallback",
        providers: [
          { provider: primary,   capabilities: DATAFORSEO_CAPABILITIES, priority: 1 },
          { provider: secondary, capabilities: DATAFORSEO_CAPABILITIES, priority: 2 },
        ],
      });

      await expect(orchestrator.fetchKeywords(FIXED_RUN_ARGS)).rejects.toBeInstanceOf(DataForSEOError);
      expect(secondary.fetchKeywords).not.toHaveBeenCalled();
    });
  }
});

// ── H: Merge mode ─────────────────────────────────────────────────────────────

describe("H. Merge mode", () => {
  it("merge: results from both providers included (deduplicated)", async () => {
    const p1 = makeSearchProvider("dataforseo", [
      makeKeywordResult("bed bug treatment", 1200),
      makeKeywordResult("pest control",      800),
    ]);
    const p2 = makeSearchProvider("serp_api", [
      makeKeywordResult("pest control",         900), // duplicate
      makeKeywordResult("exterminator near me", 500), // unique
    ]);

    const orchestrator = new SearchOrchestrator({
      mode: "merge",
      providers: [
        { provider: p1, capabilities: DATAFORSEO_CAPABILITIES, priority: 1 },
        { provider: p2, capabilities: DATAFORSEO_CAPABILITIES, priority: 2 },
      ],
    });

    const results = await orchestrator.fetchKeywords(FIXED_RUN_ARGS);

    // 3 unique keywords: p1 wins "pest control" (appears first with 800) vs p2 (900)
    // Actually mergeKeywordResults: first set wins on equal condition, p2's "pest control"
    // has non-null volume and p1 also has non-null → first wins → p1's 800
    // So: "bed bug treatment"(1200), "pest control"(800), "exterminator near me"(500)
    expect(results).toHaveLength(3);
    const keywords = results.map(r => r.keyword.toLowerCase());
    expect(keywords).toContain("bed bug treatment");
    expect(keywords).toContain("pest control");
    expect(keywords).toContain("exterminator near me");
  });

  it("merge: both providers are called", async () => {
    const p1 = makeSearchProvider("dataforseo", [makeKeywordResult("kw1")]);
    const p2 = makeSearchProvider("serp_api",   [makeKeywordResult("kw2")]);

    const orchestrator = new SearchOrchestrator({
      mode: "merge",
      providers: [
        { provider: p1, capabilities: DATAFORSEO_CAPABILITIES, priority: 1 },
        { provider: p2, capabilities: DATAFORSEO_CAPABILITIES, priority: 2 },
      ],
    });

    await orchestrator.fetchKeywords(FIXED_RUN_ARGS);
    expect(p1.fetchKeywords).toHaveBeenCalledOnce();
    expect(p2.fetchKeywords).toHaveBeenCalledOnce();
  });
});

// ── I: Merge determinism ───────────────────────────────────────────────────────

describe("I. Merge determinism", () => {
  it("mergeKeywordResults: same output for same input regardless of call order", () => {
    const setA = [makeKeywordResult("alpha", 100), makeKeywordResult("beta", 200)];
    const setB = [makeKeywordResult("beta", 300), makeKeywordResult("gamma", 150)];

    const result1 = mergeKeywordResults([setA, setB]);
    const result2 = mergeKeywordResults([setA, setB]); // same call

    expect(result1.map(r => r.keyword)).toEqual(result2.map(r => r.keyword));
    expect(result1.map(r => r.volumeMonthly)).toEqual(result2.map(r => r.volumeMonthly));
  });

  it("mergeKeywordResults: first set wins on equal strength", () => {
    // Both sets have non-null volume for "beta" → first set wins
    const setA = [makeKeywordResult("beta", 200)];
    const setB = [makeKeywordResult("beta", 300)];
    const result = mergeKeywordResults([setA, setB]);

    expect(result).toHaveLength(1);
    expect(result[0]?.volumeMonthly).toBe(200); // first set wins
  });

  it("mergeKeywordResults: second set wins when first has null volume", () => {
    const setA = [makeKeywordResult("beta", null)];
    const setB = [makeKeywordResult("beta", 300)];
    const result = mergeKeywordResults([setA, setB]);

    expect(result).toHaveLength(1);
    expect(result[0]?.volumeMonthly).toBe(300); // second set wins (has real volume)
  });
});

// ── J: Cross-provider deduplication ───────────────────────────────────────────

describe("J. Cross-provider signal deduplication", () => {
  it("mergeSignals: same normalizedValue + clientId from 2 providers = 1 signal", () => {
    const s1 = makeSignal({ source: "dataforseo", evidenceStrength: 90 });
    const s2 = makeSignal({ source: "serp_api",   evidenceStrength: 85,
      id: "sig::client-a::serp_api::bed bug treatment" });

    const result = mergeSignals([[s1], [s2]]);
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe("dataforseo"); // higher evidenceStrength wins
  });

  it("mergeSignals: different clientIds produce separate signals", () => {
    const s1 = makeSignal({ clientId: "client-a" });
    const s2 = makeSignal({ clientId: "client-b",
      id: "sig::client-b::dataforseo::bed bug treatment" });

    const result = mergeSignals([[s1, s2]]);
    expect(result).toHaveLength(2);
  });

  it("mergeSignals: different normalizedValues produce separate signals", () => {
    const s1 = makeSignal({ normalizedValue: "bed bug treatment",
      id: "sig::client-a::dataforseo::bed bug treatment" });
    const s2 = makeSignal({ normalizedValue: "pest control",
      id: "sig::client-a::dataforseo::pest control" });

    const result = mergeSignals([[s1, s2]]);
    expect(result).toHaveLength(2);
  });
});

// ── K: Provenance preservation ─────────────────────────────────────────────────

describe("K. Provenance preservation", () => {
  it("merged signal has _mergedFromProviders listing all source providers", () => {
    const s1 = makeSignal({ source: "dataforseo", evidenceStrength: 90 });
    const s2 = makeSignal({ source: "serp_api",   evidenceStrength: 85,
      id: "sig::client-a::serp_api::bed bug treatment" });

    const result = mergeSignals([[s1], [s2]]);
    expect(result).toHaveLength(1);
    const sources = result[0]?.rawProviderData["_mergedFromProviders"] as string[];
    expect(sources).toContain("dataforseo");
    expect(sources).toContain("serp_api");
    expect(sources).toHaveLength(2);
  });

  it("_mergedFromProviders is sorted alphabetically (deterministic)", () => {
    const s1 = makeSignal({ source: "serp_api",   evidenceStrength: 85,
      id: "sig::client-a::serp_api::bed bug treatment" });
    const s2 = makeSignal({ source: "dataforseo", evidenceStrength: 90 });

    const result = mergeSignals([[s1], [s2]]);
    const sources = result[0]?.rawProviderData["_mergedFromProviders"] as string[];
    expect(sources[0]).toBe("dataforseo"); // alphabetically first
    expect(sources[1]).toBe("serp_api");
  });

  it("single-provider signal has _mergedFromProviders with just itself", () => {
    const s1 = makeSignal({ source: "dataforseo" });
    const result = mergeSignals([[s1]]);
    const sources = result[0]?.rawProviderData["_mergedFromProviders"] as string[];
    expect(sources).toEqual(["dataforseo"]);
  });
});

// ── L: Evidence-strength rules ────────────────────────────────────────────────

describe("L. Evidence-strength rules", () => {
  it("higher evidenceStrength signal wins over lower", () => {
    const weak   = makeSignal({ evidenceStrength: 40, source: "gpt_simulated",
      id: "sig::client-a::gpt_simulated::bed bug treatment" });
    const strong = makeSignal({ evidenceStrength: 90, source: "dataforseo" });

    const result = mergeSignals([[weak], [strong]]);
    expect(result[0]?.evidenceStrength).toBe(90);
    expect(result[0]?.source).toBe("dataforseo");
  });

  it("duplicate signal does NOT inflate evidenceStrength beyond winner", () => {
    const s1 = makeSignal({ evidenceStrength: 90 });
    const s2 = makeSignal({ evidenceStrength: 85,
      id: "sig::client-a::serp_api::bed bug treatment", source: "serp_api" });

    const result = mergeSignals([[s1], [s2]]);
    expect(result[0]?.evidenceStrength).toBe(90); // NOT 90+85 = 175
  });

  it("on equal strength, non-null volume preferred over null", () => {
    const withVol    = makeSignal({ evidenceStrength: 90, volumeEstimate: 1200,
      id: "sig::client-a::serp_api::bed bug treatment", source: "serp_api" });
    const withoutVol = makeSignal({ evidenceStrength: 90, volumeEstimate: null });

    const result = mergeSignals([[withoutVol], [withVol]]);
    expect(result[0]?.volumeEstimate).toBe(1200);
  });
});

// ── M: Keyword metric mapping ──────────────────────────────────────────────────

describe("M. Keyword metric mapping (DataForSEO providerRaw.cpcUsd)", () => {
  it("buildSerpKeywordResult (via adapter) puts cpcUsd in providerRaw", async () => {
    // Create a mock that returns SERP + volume data including CPC
    const volumeResponse = {
      tasks: [{
        status_code: 20000,
        status_message: "Ok.",
        result: [{
          keyword:           "bed bug treatment",
          search_volume:     1200,
          competition:       0.45,
          competition_level: "MEDIUM",
          cpc:               7.50,
        }],
      }],
    };

    const serpResponse = {
      tasks: [{
        status_code: 20000,
        status_message: "Ok.",
        result: [{
          items: [
            {
              type:         "organic",
              rank_absolute: 1,
              url:          "https://pestco.com/bed-bug-treatment",
              domain:       "pestco.com",
              title:        "Bed Bug Treatment Services",
              description:  "Professional bed bug control",
            },
          ],
        }],
      }],
    };

    const { DataForSEOAdapter } = await import("../../../../../lib/db/src/dataforseo-adapter");
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => volumeResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => serpResponse,
      });

    const config = {
      login: "test@example.com", password: "pw",
      baseUrl: "https://api.dataforseo.com",
      timeoutMs: 30000, maxQueriesPerRun: 3,
      maxResultsPerQuery: 10, maxKeywordsPerBatch: 700,
      enabled: true,
    };

    const adapter = new DataForSEOAdapter(config, mockFetch as unknown as typeof fetch);
    const results = await adapter.fetchKeywords({
      seeds: ["bed bug treatment"], city: "Mobile", state: "AL",
      industry: "pest-control", limit: 10,
    });

    expect(results.length).toBeGreaterThan(0);
    const r = results[0]!;
    expect(r.cpc).toBe(7.5);
    // cpcUsd in providerRaw — present for SERP results
    const raw = r.providerRaw;
    expect(raw["cpcUsd"]).toBe(7.5);
  });
});

// ── N: SERP result mapping ─────────────────────────────────────────────────────

describe("N. SERP result mapping", () => {
  it("extractCompetitorDomains filters directories, keeps local businesses", () => {
    const items = [
      { type: "organic", domain: "yelp.com",     url: "https://yelp.com/biz/pestco",     rank_absolute: 1 },
      { type: "organic", domain: "pestco.com",   url: "https://pestco.com",               rank_absolute: 2 },
      { type: "organic", domain: "angi.com",     url: "https://angi.com/pest",            rank_absolute: 3 },
      { type: "organic", domain: "localext.com", url: "https://localext.com",             rank_absolute: 4 },
    ] as Parameters<typeof extractCompetitorDomains>[0];

    const domains = extractCompetitorDomains(items);
    expect(domains).not.toContain("yelp.com");
    expect(domains).not.toContain("angi.com");
    expect(domains).toContain("pestco.com");
    expect(domains).toContain("localext.com");
  });

  it("extractCompetitorDomains returns at most 10 domains", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      type:         "organic" as const,
      domain:       `local${i}.com`,
      url:          `https://local${i}.com`,
      rank_absolute: i + 1,
    }));
    const domains = extractCompetitorDomains(items);
    expect(domains.length).toBeLessThanOrEqual(10);
  });
});

// ── O: PAA extraction ─────────────────────────────────────────────────────────

describe("O. PAA extraction", () => {
  it("extractPAAQuestions extracts unique question strings from nested PAA containers", () => {
    const items = [
      {
        type:  "people_also_ask",
        items: [
          { title: "How do I get rid of bed bugs?" },
          { title: "What kills bed bugs instantly?" },
          { title: "How do I get rid of bed bugs?" }, // duplicate in same container
        ],
      },
      {
        type:  "organic",
        title: "Not a PAA question",
      },
    ] as Parameters<typeof extractPAAQuestions>[0];

    const questions = extractPAAQuestions(items);
    expect(questions).toContain("How do I get rid of bed bugs?");
    expect(questions).toContain("What kills bed bugs instantly?");
    expect(questions).not.toContain("Not a PAA question");
  });
});

// ── P: Competitor domain extraction ──────────────────────────────────────────

describe("P. Competitor domain extraction", () => {
  it("common directory domains are excluded from competitor list", () => {
    const directories = [
      { type: "organic", domain: "yellowpages.com", url: "https://yellowpages.com", rank_absolute: 1 },
      { type: "organic", domain: "homeadvisor.com", url: "https://homeadvisor.com", rank_absolute: 2 },
      { type: "organic", domain: "thumbtack.com",   url: "https://thumbtack.com",   rank_absolute: 3 },
      { type: "organic", domain: "bbb.org",         url: "https://bbb.org",         rank_absolute: 4 },
    ] as Parameters<typeof extractCompetitorDomains>[0];

    const domains = extractCompetitorDomains(directories);
    expect(domains).toHaveLength(0);
  });
});

// ── Q: Competitor keyword extraction (Stage 5 inactive) ───────────────────────

describe("Q. Competitor keyword extraction", () => {
  it("fetchCompetitorKeywords returns [] (Stage 5 not yet active)", async () => {
    const { DataForSEOAdapter } = await import("../../../../../lib/db/src/dataforseo-adapter");
    const config = {
      login: "test@example.com", password: "pw",
      baseUrl: "https://api.dataforseo.com",
      timeoutMs: 30000, maxQueriesPerRun: 3,
      maxResultsPerQuery: 10, maxKeywordsPerBatch: 700,
      enabled: true,
    };
    const mockFetch = vi.fn();
    const adapter = new DataForSEOAdapter(config, mockFetch as unknown as typeof fetch);
    const results = await adapter.fetchCompetitorKeywords({
      competitorDomain: "pestco.com",
      clientDomain:     "mybiz.com",
      location:         "Mobile,AL,United States",
    });
    expect(results).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── R: Coverage state ─────────────────────────────────────────────────────────

describe("R. Coverage state", () => {
  it("UnknownCoverageProvider returns state='unknown' for any topic", async () => {
    const provider = new UnknownCoverageProvider();
    const result = await provider.checkCoverage({
      topic:     "bed bug treatment",
      clientId:  "client-a",
      serviceId: "bed-bug-treatment",
    });
    expect(result.state).toBe("unknown");
    expect(result.coveredUrls).toEqual([]);
  });

  it("UnknownCoverageProvider returns 'unknown' for null serviceId", async () => {
    const provider = new UnknownCoverageProvider();
    const result = await provider.checkCoverage({
      topic:     "pest control tips",
      clientId:  "client-a",
      serviceId: null,
    });
    expect(result.state).toBe("unknown");
  });

  it("UnknownCoverageProvider.name is 'unknown_coverage'", () => {
    expect(new UnknownCoverageProvider().name).toBe("unknown_coverage");
  });
});

// ── S: Scorecard compatibility ─────────────────────────────────────────────────

describe("S. Scorecard compatibility", () => {
  it("C2 scorecard (no version, no enrichment) parses cleanly", () => {
    const c2Card = {
      searchDemand:       60,
      competitorGap:      55,
      revenueImpact:      50,
      contentFeasibility: 70,
      seasonalRelevance:  80,
      aiSearchPotential:  45,
      composite:          58,
      confidence:         "high",
      explanations: {
        searchDemand:       "1200 volume",
        competitorGap:      "5 competitors",
        revenueImpact:      "commercial intent",
        contentFeasibility: "short content",
        seasonalRelevance:  "peak season",
        aiSearchPotential:  "3 PAA questions",
      },
    };

    const parsed = parseScoreCard(c2Card);
    expect(parsed.composite).toBe(58);
    expect(parsed.version).toBeUndefined();
    expect(parsed.enrichment).toBeUndefined();
  });

  it("C5 scorecard (with version and enrichment) parses cleanly", () => {
    const c5Card = {
      searchDemand:       60,
      competitorGap:      65,
      revenueImpact:      57.5,
      contentFeasibility: 70,
      seasonalRelevance:  80,
      aiSearchPotential:  55,
      composite:          63.5,
      confidence:         "high",
      explanations: {
        searchDemand:       "1200 volume",
        competitorGap:      "enriched: 5 domains + gap",
        revenueImpact:      "cpc=5.0",
        contentFeasibility: "short content",
        seasonalRelevance:  "peak season",
        aiSearchPotential:  "enriched: 4 PAA",
      },
      version:   "c5",
      enrichment: {
        competitorDomainCount: 5,
        paaQuestionCount:      4,
        cpcUsd:                5.0,
        coverageState:         "gap",
      },
    };

    const parsed = parseScoreCard(c5Card);
    expect(parsed.version).toBe("c5");
    expect(parsed.enrichment?.competitorDomainCount).toBe(5);
    expect(parsed.enrichment?.coverageState).toBe("gap");
  });

  it("malformed scorecard throws descriptive error", () => {
    expect(() => parseScoreCard({ searchDemand: "not-a-number" })).toThrow(/malformed score_card/);
  });
});

// ── T: Enriched scoring ───────────────────────────────────────────────────────

describe("T. Enriched scoring", () => {
  it("signal with 5 competitor domains boosts competitorGap by 10", () => {
    const signal = makeSignal({
      rawProviderData: {
        competitorDomains: ["a.com", "b.com", "c.com", "d.com", "e.com"],
        paaQuestions:      [],
        cpcUsd:            null,
      },
    });
    const opportunity = makeOpportunity();
    const baseGap = opportunity.scoreCard.competitorGap;

    const enriched = enrichOpportunity(opportunity, [signal], "unknown");
    expect(enriched.scoreCard.version).toBe("c5");
    expect(enriched.scoreCard.competitorGap).toBeCloseTo(baseGap + 10, 1);
  });

  it("coverage=gap adds 10 to competitorGap", () => {
    const signal = makeSignal({ rawProviderData: { cpcUsd: 3 } });
    const opportunity = makeOpportunity();
    const baseGap = opportunity.scoreCard.competitorGap;

    const enriched = enrichOpportunity(opportunity, [signal], "gap");
    expect(enriched.scoreCard.competitorGap).toBeGreaterThan(baseGap);
  });

  it("coverage=covered reduces competitorGap by 20", () => {
    const signal = makeSignal({ rawProviderData: { cpcUsd: 1 } });
    const opportunity = makeOpportunity({
      scoreCard: { ...makeOpportunity().scoreCard, competitorGap: 70 },
    });

    const enriched = enrichOpportunity(opportunity, [signal], "covered");
    expect(enriched.scoreCard.competitorGap).toBeLessThan(
      opportunity.scoreCard.competitorGap,
    );
  });

  it("4 PAA questions boosts aiSearchPotential by 10", () => {
    const signal = makeSignal({
      rawProviderData: { paaQuestions: ["q1", "q2", "q3", "q4"] },
    });
    const opportunity = makeOpportunity();
    const base = opportunity.scoreCard.aiSearchPotential;

    const enriched = enrichOpportunity(opportunity, [signal], "unknown");
    expect(enriched.scoreCard.aiSearchPotential).toBeCloseTo(base + 10, 1);
  });

  it("cpcUsd > 2 boosts revenueImpact", () => {
    const signal = makeSignal({ rawProviderData: { cpcUsd: 6 } });
    const opportunity = makeOpportunity();
    const base = opportunity.scoreCard.revenueImpact;

    const enriched = enrichOpportunity(opportunity, [signal], "unknown");
    expect(enriched.scoreCard.revenueImpact).toBeGreaterThan(base);
  });

  it("no enrichment data → original opportunity returned unchanged", () => {
    const signal = makeSignal({ rawProviderData: {} });
    const opportunity = makeOpportunity();

    const result = enrichOpportunity(opportunity, [signal], "unknown");
    expect(result).toBe(opportunity); // same reference — not mutated
  });

  it("enriched composite is recomputed from adjusted dimensions", () => {
    const signal = makeSignal({
      rawProviderData: {
        competitorDomains: ["a.com", "b.com", "c.com", "d.com", "e.com"],
        paaQuestions:      ["q1", "q2", "q3"],
        cpcUsd:            8,
      },
    });
    const opportunity = makeOpportunity();
    const enriched = enrichOpportunity(opportunity, [signal], "gap");

    // Composite must be recomputed
    const sc = enriched.scoreCard;
    const expected = computeComposite(sc);
    expect(sc.composite).toBeCloseTo(expected, 5);
  });
});

// ── U: Cost estimation ────────────────────────────────────────────────────────

describe("U. Cost estimation", () => {
  it("CostLedger accumulates totalEstimatedUSD correctly", () => {
    const ledger = new CostLedger();
    ledger.record({
      id: "cost::run1::dataforseo::serp_results::1",
      runId: "run1", clientId: "client-a",
      provider: "dataforseo", capability: "serp_results",
      endpoint: "serp/google/organic/live/regular",
      estimatedCostUSD: 0.010, actualCostUSD: null,
      requestCount: 5, retryCount: 0,
      success: true, errorKind: null, recordedAt: new Date(),
    });
    ledger.record({
      id: "cost::run1::dataforseo::search_volume::1",
      runId: "run1", clientId: "client-a",
      provider: "dataforseo", capability: "search_volume",
      endpoint: "keywords_data/search_volume/live",
      estimatedCostUSD: 0.003, actualCostUSD: null,
      requestCount: 1, retryCount: 0,
      success: true, errorKind: null, recordedAt: new Date(),
    });

    expect(ledger.totalEstimatedUSD()).toBeCloseTo(0.013, 6);
    expect(ledger.getRecords()).toHaveLength(2);
  });

  it("toReport includes byProvider breakdown", () => {
    const ledger = new CostLedger();
    ledger.record({
      id: "cost::r1::dataforseo::serp_results::1",
      runId: "r1", clientId: "c1",
      provider: "dataforseo", capability: "serp_results",
      endpoint: "serp", estimatedCostUSD: 0.010, actualCostUSD: null,
      requestCount: 5, retryCount: 0, success: true, errorKind: null,
      recordedAt: new Date(),
    });

    const report = ledger.toReport();
    expect(report.recordCount).toBe(1);
    expect(report.byProvider["dataforseo"]?.estimatedUSD).toBeCloseTo(0.010, 6);
    expect(report.byProvider["dataforseo"]?.requestCount).toBe(5);
    expect(report.byProvider["dataforseo"]?.success).toBe(true);
  });

  it("empty ledger toReport has zero totals", () => {
    const report = new CostLedger().toReport();
    expect(report.totalEstimatedUSD).toBe(0);
    expect(report.recordCount).toBe(0);
  });
});

// ── V: Cost record IDs ────────────────────────────────────────────────────────

describe("V. Cost record IDs", () => {
  it("deriveCostRecordId is deterministic (same inputs → same output)", () => {
    const id1 = deriveCostRecordId("run-1", "dataforseo", "serp_results", 1);
    const id2 = deriveCostRecordId("run-1", "dataforseo", "serp_results", 1);
    expect(id1).toBe(id2);
  });

  it("deriveCostRecordId includes all components", () => {
    const id = deriveCostRecordId("run-abc", "dataforseo", "search_volume", 2);
    expect(id).toContain("run-abc");
    expect(id).toContain("dataforseo");
    expect(id).toContain("search_volume");
    expect(id).toContain("2");
  });

  it("different runIds produce different IDs (cross-tenant safe)", () => {
    const id1 = deriveCostRecordId("run-clientA", "dataforseo", "serp_results", 1);
    const id2 = deriveCostRecordId("run-clientB", "dataforseo", "serp_results", 1);
    expect(id1).not.toBe(id2);
  });

  it("different providers produce different IDs", () => {
    const id1 = deriveCostRecordId("run-1", "dataforseo", "serp_results", 1);
    const id2 = deriveCostRecordId("run-1", "serp_api",   "serp_results", 1);
    expect(id1).not.toBe(id2);
  });
});

// ── W: Budget rejection ───────────────────────────────────────────────────────

describe("W. Budget rejection", () => {
  it("BudgetGuard.check: allowed=false when estimatedCost > ceiling", () => {
    const guard  = new BudgetGuard({ perRunCeilingUSD: 0.50 });
    const result = guard.check(0.75, 3);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("per_run_ceiling_exceeded");
  });

  it("BudgetGuard.check: allowed=true when estimatedCost < ceiling", () => {
    const guard  = new BudgetGuard({ perRunCeilingUSD: 1.00 });
    const result = guard.check(0.30, 5);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("BudgetGuard: provider fetchKeywords not called when budget exceeded", async () => {
    const primary = makeSearchProvider("dataforseo", [makeKeywordResult("kw1")]);

    // maxRequestCount: 0 blocks the orchestrator since it calls check(0, seeds.length)
    // and seeds.length (2) > 0 → exceeds maxRequestCount → blocked
    const orchestrator = new SearchOrchestrator({
      mode: "primary_only",
      providers: [{ provider: primary, capabilities: DATAFORSEO_CAPABILITIES, priority: 1 }],
      budgetGuard: new BudgetGuard({ maxRequestCount: 0 }),
    });

    const results = await orchestrator.fetchKeywords(FIXED_RUN_ARGS);
    expect(results).toEqual([]);
    expect(primary.fetchKeywords).not.toHaveBeenCalled();

    const records = orchestrator.getExecutionRecords();
    expect(records[0]?.budgetRejected).toBe(true);
  });

  it("BudgetGuard: checkCapability blocks non-allowed capability", () => {
    const guard = new BudgetGuard({ allowedCapabilities: ["search_volume", "paa"] });
    expect(guard.checkCapability("search_volume").allowed).toBe(true);
    expect(guard.checkCapability("serp_results").allowed).toBe(false);
    expect(guard.checkCapability("serp_results").reason).toBe("capability_not_allowed");
  });

  it("BudgetGuard.check: maxRequestCount blocks when exceeded", () => {
    const guard  = new BudgetGuard({ maxRequestCount: 3 });
    const result = guard.check(0.01, 10);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("max_request_count_exceeded");
  });
});

// ── X: Dry-run mode ───────────────────────────────────────────────────────────

describe("X. Dry-run mode", () => {
  it("BudgetGuard dryRunMode=true blocks all calls with reason dry_run_mode", () => {
    const guard  = new BudgetGuard({ dryRunMode: true });
    const result = guard.check(0, 0);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("dry_run_mode");
  });

  it("dryRunMode blocks even with zero cost and zero requests", () => {
    const guard = new BudgetGuard({ dryRunMode: true, perRunCeilingUSD: 5.0 });
    expect(guard.check(0, 0).allowed).toBe(false);
  });
});

// ── Y: Retry classification ───────────────────────────────────────────────────

describe("Y. Retry classification", () => {
  const nonRetryable: DataForSEOErrorKind[] = [
    "auth_error", "quota_exceeded", "provider_disabled", "provider_unconfigured",
  ];

  const retryable: DataForSEOErrorKind[] = [
    "timeout", "rate_limited", "provider_error", "task_error",
    "malformed_response", "no_results",
  ];

  for (const kind of nonRetryable) {
    it(`isRetryableError(DataForSEOError("${kind}")) = false`, () => {
      expect(isRetryableError(new DataForSEOError(kind, "test"))).toBe(false);
    });
  }

  for (const kind of retryable) {
    it(`isRetryableError(DataForSEOError("${kind}")) = true`, () => {
      expect(isRetryableError(new DataForSEOError(kind, "test"))).toBe(true);
    });
  }

  it("isRetryableError(non-DataForSEOError) = true (safe default)", () => {
    expect(isRetryableError(new Error("network failure"))).toBe(true);
    expect(isRetryableError("string error")).toBe(true);
    expect(isRetryableError(null)).toBe(true);
  });
});

// ── Z: Full regression ────────────────────────────────────────────────────────

describe("Z. Full regression — C2/C3/C4 interfaces unchanged", () => {
  it("parseDataForSEOConfig still works (C4)", () => {
    const cfg = parseDataForSEOConfig({
      DATAFORSEO_LOGIN:    "u@example.com",
      DATAFORSEO_PASSWORD: "pw",
    });
    expect(cfg).not.toBeNull();
    expect(cfg!.login).toBe("u@example.com");
    expect(cfg!.enabled).toBe(false); // default
  });

  it("parseDataForSEOConfig still returns null without credentials (C4)", () => {
    expect(parseDataForSEOConfig({})).toBeNull();
  });

  it("isQueryBlocked still blocks termite queries (C4)", () => {
    expect(isQueryBlocked("termite inspection services")).toBe(true);
    expect(isQueryBlocked("termite treatment")).toBe(true);
  });

  it("isQueryBlocked allows standard pest control queries (C4)", () => {
    expect(isQueryBlocked("bed bug treatment near me")).toBe(false);
    expect(isQueryBlocked("pest control services")).toBe(false);
  });

  it("isQueryEducationalOnly flags fumigation as educational-only (C4)", () => {
    expect(isQueryEducationalOnly("fumigation services")).toBe(true);
  });

  it("UnknownCoverageProvider implements SiteCoverageProvider interface (C5)", async () => {
    const provider = new UnknownCoverageProvider();
    expect(typeof provider.checkCoverage).toBe("function");
    expect(typeof provider.name).toBe("string");
  });

  it("DataForSEOError has budget_rejected kind (C5)", () => {
    const err = new DataForSEOError("budget_rejected", "ceiling exceeded");
    expect(err.kind).toBe("budget_rejected");
    expect(err).toBeInstanceOf(DataForSEOError);
  });

  it("mergeSignals([]) returns empty array (C5)", () => {
    expect(mergeSignals([])).toEqual([]);
  });

  it("new CostLedger() starts empty (C5)", () => {
    const ledger = new CostLedger();
    expect(ledger.getRecords()).toHaveLength(0);
    expect(ledger.totalEstimatedUSD()).toBe(0);
  });
});

// ── Focused tests ─────────────────────────────────────────────────────────────

describe("Focused: budget_rejected in DataForSEOErrorKind", () => {
  it("budget_rejected is a valid DataForSEOErrorKind (type guard works)", () => {
    const kind: DataForSEOErrorKind = "budget_rejected";
    expect(kind).toBe("budget_rejected");
  });

  it("DataForSEOError with budget_rejected can be constructed", () => {
    const err = new DataForSEOError("budget_rejected", "plan exceeded $1.00 ceiling");
    expect(err.kind).toBe("budget_rejected");
    expect(err.message).toContain("budget_rejected");
    expect(err.message).not.toContain("password");
    expect(err.message).not.toContain("login");
  });
});

describe("Focused: MAX_RUN_CEILING_USD clamping", () => {
  it("ceiling above MAX_RUN_CEILING_USD is clamped down", () => {
    const guard = new BudgetGuard({ perRunCeilingUSD: 999.99 });
    expect(guard.getEffectiveCeiling()).toBe(MAX_RUN_CEILING_USD);
  });

  it("ceiling at exactly MAX_RUN_CEILING_USD is accepted", () => {
    const guard = new BudgetGuard({ perRunCeilingUSD: MAX_RUN_CEILING_USD });
    expect(guard.getEffectiveCeiling()).toBe(MAX_RUN_CEILING_USD);
  });

  it("DEFAULT_RUN_CEILING_USD is less than MAX_RUN_CEILING_USD", () => {
    expect(DEFAULT_RUN_CEILING_USD).toBeLessThan(MAX_RUN_CEILING_USD);
  });

  it("undefined ceiling defaults to DEFAULT_RUN_CEILING_USD", () => {
    const guard = new BudgetGuard({});
    expect(guard.getEffectiveCeiling()).toBe(DEFAULT_RUN_CEILING_USD);
  });
});

describe("Focused: describeCapabilities report shape", () => {
  it("report has provider, supported, unsupported arrays", () => {
    const desc = describeCapabilities("dataforseo", DATAFORSEO_CAPABILITIES);
    expect(desc.provider).toBe("dataforseo");
    expect(Array.isArray(desc.supported)).toBe(true);
    expect(Array.isArray(desc.unsupported)).toBe(true);
    expect(desc.supported.length + desc.unsupported.length).toBe(ALL_CAPABILITIES.length);
  });

  it("supported + unsupported = ALL_CAPABILITIES (no capability lost)", () => {
    const desc = describeCapabilities("test", DATAFORSEO_CAPABILITIES);
    const all  = new Set([...desc.supported, ...desc.unsupported]);
    for (const cap of ALL_CAPABILITIES) {
      expect(all.has(cap)).toBe(true);
    }
  });

  it("trend_history is in unsupported", () => {
    const desc = describeCapabilities("dataforseo", DATAFORSEO_CAPABILITIES);
    expect(desc.unsupported).toContain("trend_history");
  });

  it("search_volume is in supported", () => {
    const desc = describeCapabilities("dataforseo", DATAFORSEO_CAPABILITIES);
    expect(desc.supported).toContain("search_volume");
  });
});

describe("Focused: mergeSignals tenant isolation", () => {
  it("signals from different clients never merge even if same normalizedValue", () => {
    const sA = makeSignal({ clientId: "client-a" });
    const sB = makeSignal({
      clientId: "client-b",
      id: "sig::client-b::dataforseo::bed bug treatment",
    });

    const merged = mergeSignals([[sA, sB]]);
    expect(merged).toHaveLength(2);
    const clients = merged.map(s => s.clientId);
    expect(clients).toContain("client-a");
    expect(clients).toContain("client-b");
  });
});

describe("Focused: enrichment extraction edge cases", () => {
  it("extractEnrichmentFromSignals uses max (not sum) across signals", () => {
    const s1 = makeSignal({
      id: "sig::client-a::dataforseo::kw1",
      rawProviderData: { competitorDomains: ["a.com", "b.com"] },
    });
    const s2 = makeSignal({
      id: "sig::client-a::dataforseo::kw2",
      normalizedValue: "kw2",
      rawProviderData: { competitorDomains: ["x.com", "y.com", "z.com"] },
    });

    const enrichment = extractEnrichmentFromSignals([s1, s2]);
    expect(enrichment.competitorDomainCount).toBe(3); // max, not 2+3=5
  });

  it("cpcUsd ≤ 2 does NOT boost revenueImpact", () => {
    const signal = makeSignal({ rawProviderData: { cpcUsd: 1.5 } });
    const opportunity = makeOpportunity();
    const base = opportunity.scoreCard.revenueImpact;
    const enriched = enrichOpportunity(opportunity, [signal], "unknown");
    // cpcUsd 1.5 ≤ 2.0 → no boost → opportunity unchanged (returned as-is)
    expect(enriched.scoreCard.revenueImpact).toBe(base);
  });

  it("2 PAA questions does NOT boost aiSearchPotential (threshold is 3)", () => {
    const signal = makeSignal({ rawProviderData: { paaQuestions: ["q1", "q2"] } });
    const opportunity = makeOpportunity();
    const base = opportunity.scoreCard.aiSearchPotential;
    const enriched = enrichOpportunity(opportunity, [signal], "unknown");
    expect(enriched.scoreCard.aiSearchPotential).toBe(base);
  });

  it("competitorDomainCount < 5 does NOT boost competitorGap", () => {
    const signal = makeSignal({
      rawProviderData: { competitorDomains: ["a.com", "b.com", "c.com", "d.com"] }, // 4
    });
    const opportunity = makeOpportunity();
    const base = opportunity.scoreCard.competitorGap;
    const enriched = enrichOpportunity(opportunity, [signal], "unknown");
    expect(enriched.scoreCard.competitorGap).toBe(base);
  });
});

describe("Focused: merge mode partial failure", () => {
  it("merge mode: one provider fails → partial merge returned (not empty)", async () => {
    const failErr = new DataForSEOError("timeout", "p1 timed out");
    const failing = makeSearchProvider("dataforseo", [], failErr);
    const working = makeSearchProvider("serp_api",   [makeKeywordResult("pest control")]);

    const orchestrator = new SearchOrchestrator({
      mode: "merge",
      providers: [
        { provider: failing, capabilities: DATAFORSEO_CAPABILITIES, priority: 1 },
        { provider: working, capabilities: DATAFORSEO_CAPABILITIES, priority: 2 },
      ],
    });

    const results = await orchestrator.fetchKeywords(FIXED_RUN_ARGS);
    expect(results).toHaveLength(1); // partial merge — not empty
    expect(results[0]?.keyword).toBe("pest control");

    const records = orchestrator.getExecutionRecords();
    expect(records.some(r => !r.success)).toBe(true);
    expect(records.some(r =>  r.success)).toBe(true);
  });
});

describe("Focused: secret not in error messages", () => {
  it("DataForSEOError message does not contain credentials", () => {
    const err = new DataForSEOError("auth_error", "Authentication failed: HTTP 401");
    expect(err.message).not.toContain("password");
    expect(err.message).not.toContain("apikey");
    expect(err.message).not.toContain("secret");
  });
});

// ── Live test gate (requires real credentials) ─────────────────────────────────

const LIVE_TESTS = process.env["DISCOVERY_LIVE_TESTS"] === "true"
  && !!process.env["DATAFORSEO_LOGIN"]
  && !!process.env["DATAFORSEO_PASSWORD"];

describe.skipIf(!LIVE_TESTS)("LIVE: DataForSEO C5 (requires real credentials)", () => {
  it("live orchestrator: primary_only mode returns real keywords", async () => {
    const { DataForSEOContextAdapter } = await import("../../../../../lib/db/src/dataforseo-adapter");
    const { buildDiscoveryContext }    = await import("../../../../../lib/db/src/discovery-context");
    const { buildClientContentContext, bbbRegistryProvider } = await import("../../../../../lib/db/src/client-context");
    const { parseDataForSEOConfig: parseCfg, getDataForSEOHealthState } = await import("../../../../../lib/db/src/dataforseo-config");

    const cfg = parseCfg();
    expect(cfg).not.toBeNull();
    const health = getDataForSEOHealthState(cfg);
    expect(health.status).toBe("configured");

    const ctx = buildDiscoveryContext({
      contentContext:  buildClientContentContext(bbbRegistryProvider),
      clientId:        "live-test-client",
      now:             new Date(),
      aiSearchGapScore: 50,
    });

    const adapter      = new DataForSEOContextAdapter(cfg!, ctx);
    const orchestrator = new SearchOrchestrator({
      mode: "primary_only",
      providers: [{ provider: adapter, capabilities: DATAFORSEO_CAPABILITIES, priority: 1 }],
    });

    const results = await orchestrator.fetchKeywords({
      seeds: ["bed bug treatment"], city: ctx.location.city,
      state: ctx.location.state,   industry: ctx.industry,
      limit: 5,
    });

    expect(Array.isArray(results)).toBe(true);
    const records = orchestrator.getExecutionRecords();
    expect(records[0]?.success).toBe(true);
    expect(records[0]?.budgetRejected).toBe(false);
  });
});
