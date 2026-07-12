/**
 * Phase C2 — Tests J, K & L
 *
 * J. Scoring dimension calculations (all 6 dimensions, correct formulas)
 * K. Priority tier thresholds (75→critical, 55→high, 35→medium, <35→low)
 * L. Confidence/evidence quality (high/medium/low based on source + signal count)
 */

import { describe, it, expect } from "vitest";
import {
  scoreCluster,
  computeComposite,
  priorityFromScore,
  SCORE_WEIGHTS,
} from "../../../../../lib/db/src/discovery-scorer";
import {
  buildDiscoveryContext,
  type DiscoveryContext,
} from "../../../../../lib/db/src/discovery-context";
import {
  buildClientContentContext,
  bbbRegistryProvider,
} from "../../../../../lib/db/src/client-context";
import { buildClusters } from "../../../../../lib/db/src/discovery-cluster-builder";
import { normalizeKeywordResult } from "../../../../../lib/db/src/discovery-normalizer";
import type { DiscoverySignal, DiscoveryCluster } from "../../../../../lib/db/src/discovery-types";
import type { RawKeywordResult } from "../../../../../lib/db/src/discovery-providers";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const NOW     = new Date("2026-07-12T10:00:00.000Z");
const BBB_CTX = buildClientContentContext(null, bbbRegistryProvider);

function makeBBBContext(overrides: { aiSearchGapScore?: number; month?: number } = {}): DiscoveryContext {
  const now = overrides.month
    ? new Date(`2026-${String(overrides.month).padStart(2, "0")}-15T10:00:00.000Z`)
    : NOW;
  return buildDiscoveryContext({
    contentContext:   BBB_CTX,
    clientId:         "bbb-test-01",
    now,
    aiSearchGapScore: overrides.aiSearchGapScore ?? 50,
  });
}

function makeSignal(overrides: {
  keyword?: string;
  serviceId?: string | null;
  intent?: DiscoverySignal["intent"];
  volumeMonthly?: number | null;
  difficulty?: number | null;
  source?: DiscoverySignal["source"];
  signalType?: DiscoverySignal["signalType"];
  competitorRank?: number | null;
  seasonalRelevance?: number;
}): DiscoverySignal {
  const raw: RawKeywordResult = {
    keyword:        overrides.keyword ?? "bed bug inspection",
    volumeMonthly:  overrides.volumeMonthly !== undefined ? overrides.volumeMonthly : 500,
    difficulty:     overrides.difficulty !== undefined ? overrides.difficulty : 40,
    intent:         overrides.intent ?? "local",
    cpc:            3.00,
    relatedQueries: [],
    providerRaw:    {},
  };
  const signal = normalizeKeywordResult({
    raw,
    clientId:         "bbb-test-01",
    source:           overrides.source ?? "test_fixture",
    serviceId:        overrides.serviceId !== undefined ? overrides.serviceId : "bed_bug_inspection",
    seasonalRelevance: overrides.seasonalRelevance ?? 50,
  });
  // Apply overrides that normalizeKeywordResult doesn't handle
  return {
    ...signal,
    signalType:    overrides.signalType ?? signal.signalType,
    competitorRank: overrides.competitorRank !== undefined ? overrides.competitorRank : null,
  };
}

function makeCluster(signals: DiscoverySignal[], ctx: DiscoveryContext): {
  cluster: DiscoveryCluster; signals: DiscoverySignal[];
} {
  const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
  if (clusters.length === 0) throw new Error("No clusters built — check signal fixtures");
  const cluster = clusters[0]!;
  // Return the signals that are members of this cluster
  const memberSignals = signals.filter(s => cluster.signalIds.includes(s.id));
  return { cluster, signals: memberSignals.length > 0 ? memberSignals : signals };
}

// ══════════════════════════════════════════════════════════════════════════════
// J. Scoring dimension calculations
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-J-1: SCORE_WEIGHTS sum to 1.0", () => {
  it("weights total exactly 1.00", () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 1.0)).toBeLessThan(0.001);
  });
});

describe("T-C2-J-2: computeComposite — weighted sum", () => {
  it("all dimensions 100 → composite = 100", () => {
    const dims = {
      searchDemand: 100, competitorGap: 100, revenueImpact: 100,
      contentFeasibility: 100, seasonalRelevance: 100, aiSearchPotential: 100,
    };
    expect(computeComposite(dims)).toBe(100);
  });

  it("all dimensions 0 → composite = 0", () => {
    const dims = {
      searchDemand: 0, competitorGap: 0, revenueImpact: 0,
      contentFeasibility: 0, seasonalRelevance: 0, aiSearchPotential: 0,
    };
    expect(computeComposite(dims)).toBe(0);
  });

  it("only searchDemand=100, rest 0 → composite = 25 (weight 0.25)", () => {
    const dims = {
      searchDemand: 100, competitorGap: 0, revenueImpact: 0,
      contentFeasibility: 0, seasonalRelevance: 0, aiSearchPotential: 0,
    };
    expect(computeComposite(dims)).toBeCloseTo(25, 1);
  });

  it("only competitorGap=100, rest 0 → composite = 20 (weight 0.20)", () => {
    const dims = {
      searchDemand: 0, competitorGap: 100, revenueImpact: 0,
      contentFeasibility: 0, seasonalRelevance: 0, aiSearchPotential: 0,
    };
    expect(computeComposite(dims)).toBeCloseTo(20, 1);
  });

  it("only revenueImpact=100, rest 0 → composite = 20 (weight 0.20)", () => {
    const dims = {
      searchDemand: 0, competitorGap: 0, revenueImpact: 100,
      contentFeasibility: 0, seasonalRelevance: 0, aiSearchPotential: 0,
    };
    expect(computeComposite(dims)).toBeCloseTo(20, 1);
  });

  it("only contentFeasibility=100, rest 0 → composite = 15 (weight 0.15)", () => {
    const dims = {
      searchDemand: 0, competitorGap: 0, revenueImpact: 0,
      contentFeasibility: 100, seasonalRelevance: 0, aiSearchPotential: 0,
    };
    expect(computeComposite(dims)).toBeCloseTo(15, 1);
  });

  it("composite is clamped between 0 and 100", () => {
    const dims = {
      searchDemand: 50, competitorGap: 50, revenueImpact: 50,
      contentFeasibility: 50, seasonalRelevance: 50, aiSearchPotential: 50,
    };
    const composite = computeComposite(dims);
    expect(composite).toBeGreaterThanOrEqual(0);
    expect(composite).toBeLessThanOrEqual(100);
  });
});

describe("T-C2-J-3: searchDemand — volume-based scoring", () => {
  it("high-volume keyword scores higher than low-volume", () => {
    const ctx = makeBBBContext();
    const highVolSignals = [makeSignal({ volumeMonthly: 5000, serviceId: "bed_bug_inspection", intent: "local", keyword: "pest control foley" })];
    const lowVolSignals  = [makeSignal({ volumeMonthly: 10, serviceId: "roaches", intent: "local", keyword: "roach exterminator" })];
    const { cluster: highCluster, signals: hs } = makeCluster(highVolSignals, ctx);
    const { cluster: lowCluster,  signals: ls } = makeCluster(lowVolSignals, ctx);
    const highOpp = scoreCluster({ cluster: highCluster, signals: hs, context: ctx });
    const lowOpp  = scoreCluster({ cluster: lowCluster,  signals: ls, context: ctx });
    expect(highOpp.scoreCard.searchDemand).toBeGreaterThan(lowOpp.scoreCard.searchDemand);
  });

  it("null volume → searchDemand is the default (30) with explanation", () => {
    const ctx = makeBBBContext();
    const signals = [makeSignal({ volumeMonthly: null, serviceId: "bed_bug_inspection", intent: "local", keyword: "bed bug inspection no vol" })];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(opp.scoreCard.searchDemand).toBe(30);
    expect(opp.scoreCard.explanations.searchDemand).toContain("No search volume");
  });

  it("local intent scores higher than navigational for the same volume", () => {
    const ctx = makeBBBContext();
    const localSignals = [makeSignal({ volumeMonthly: 500, intent: "local", serviceId: "bed_bug_inspection", keyword: "bed bug local" })];
    const navSignals   = [makeSignal({ volumeMonthly: 500, intent: "navigational", serviceId: "roaches", keyword: "roach nav" })];
    const { cluster: lc, signals: ls } = makeCluster(localSignals, ctx);
    const { cluster: nc, signals: ns } = makeCluster(navSignals, ctx);
    const localOpp = scoreCluster({ cluster: lc, signals: ls, context: ctx });
    const navOpp   = scoreCluster({ cluster: nc, signals: ns, context: ctx });
    expect(localOpp.scoreCard.searchDemand).toBeGreaterThan(navOpp.scoreCard.searchDemand);
  });
});

describe("T-C2-J-4: competitorGap — competitor signal scoring", () => {
  it("no competitor signals → default gap 50", () => {
    const ctx = makeBBBContext();
    const signals = [makeSignal({ serviceId: "bed_bug_inspection", intent: "local", keyword: "bed bug inspection" })];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(opp.scoreCard.competitorGap).toBe(50);
    expect(opp.scoreCard.explanations.competitorGap).toContain("No competitor");
  });

  it("competitor rank 1 → gap score 100", () => {
    const ctx = makeBBBContext();
    const baseSignal = makeSignal({ serviceId: "bed_bug_inspection", intent: "local", keyword: "bed bug competitor" });
    const compSignal: DiscoverySignal = {
      ...makeSignal({ keyword: "bed bug competitor rank1", serviceId: "bed_bug_inspection", intent: "local", signalType: "competitor_keyword", competitorRank: 1 }),
      signalType: "competitor_keyword",
      competitorRank: 1,
    };
    const { cluster, signals: cs } = makeCluster([baseSignal, compSignal], ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(opp.scoreCard.competitorGap).toBe(100);
  });
});

describe("T-C2-J-5: revenueImpact — registry service scoring", () => {
  it("high revenueWeight service scores higher", () => {
    const ctx = makeBBBContext();
    // bed_bug_inspection has revenueWeight=9, priority=1 → high impact
    const signals = [makeSignal({ serviceId: "bed_bug_inspection", intent: "local", keyword: "bed bug impact" })];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(opp.scoreCard.revenueImpact).toBeGreaterThan(50);
  });

  it("no service match → revenueImpact default 40", () => {
    const ctx = makeBBBContext();
    const signals = [makeSignal({ serviceId: null, intent: "informational", keyword: "general pest tip" })];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(opp.scoreCard.revenueImpact).toBe(40);
    expect(opp.scoreCard.explanations.revenueImpact).toContain("No service");
  });
});

describe("T-C2-J-6: contentFeasibility — registry gate scoring", () => {
  it("generatable service scores at least 80", () => {
    const ctx = makeBBBContext();
    const signals = [makeSignal({ serviceId: "bed_bug_inspection", intent: "local", keyword: "bed bug feasibility" })];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(opp.scoreCard.contentFeasibility).toBeGreaterThanOrEqual(80);
  });

  it("no service match → contentFeasibility default 60", () => {
    const ctx = makeBBBContext();
    const signals = [makeSignal({ serviceId: null, intent: "informational", keyword: "general tip no service" })];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(opp.scoreCard.contentFeasibility).toBe(60);
  });
});

describe("T-C2-J-7: aiSearchPotential — gap amplification", () => {
  it("aiSearchGapScore 50 → aiSearchPotential 60 (50 × 1.2, clamped 100)", () => {
    const ctx = makeBBBContext({ aiSearchGapScore: 50 });
    const signals = [makeSignal({ serviceId: "bed_bug_inspection", intent: "local", keyword: "ai potential test" })];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(opp.scoreCard.aiSearchPotential).toBeCloseTo(60, 1);
  });

  it("aiSearchGapScore 100 → aiSearchPotential 100 (clamped)", () => {
    const ctx = makeBBBContext({ aiSearchGapScore: 100 });
    const signals = [makeSignal({ serviceId: "bed_bug_inspection", intent: "local", keyword: "ai potential max" })];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(opp.scoreCard.aiSearchPotential).toBe(100);
  });

  it("aiSearchGapScore 0 → aiSearchPotential 0", () => {
    const ctx = makeBBBContext({ aiSearchGapScore: 0 });
    const signals = [makeSignal({ serviceId: "bed_bug_inspection", intent: "local", keyword: "ai potential zero" })];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(opp.scoreCard.aiSearchPotential).toBe(0);
  });
});

describe("T-C2-J-8: explanations field — all 6 dimensions documented", () => {
  it("every scoreCard has explanations for all 6 dimensions", () => {
    const ctx = makeBBBContext();
    const signals = [makeSignal({ serviceId: "bed_bug_inspection", intent: "local", keyword: "explanations test" })];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    const expl = opp.scoreCard.explanations;
    expect(typeof expl.searchDemand).toBe("string");
    expect(typeof expl.competitorGap).toBe("string");
    expect(typeof expl.revenueImpact).toBe("string");
    expect(typeof expl.contentFeasibility).toBe("string");
    expect(typeof expl.seasonalRelevance).toBe("string");
    expect(typeof expl.aiSearchPotential).toBe("string");
    expect(expl.searchDemand.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// K. Priority tier thresholds
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-K-1: priorityFromScore — tier boundaries", () => {
  it("composite 75 → critical", () => {
    expect(priorityFromScore(75)).toBe("critical");
  });
  it("composite 100 → critical", () => {
    expect(priorityFromScore(100)).toBe("critical");
  });
  it("composite 74.9 → high", () => {
    expect(priorityFromScore(74.9)).toBe("high");
  });
  it("composite 55 → high", () => {
    expect(priorityFromScore(55)).toBe("high");
  });
  it("composite 54.9 → medium", () => {
    expect(priorityFromScore(54.9)).toBe("medium");
  });
  it("composite 35 → medium", () => {
    expect(priorityFromScore(35)).toBe("medium");
  });
  it("composite 34.9 → low", () => {
    expect(priorityFromScore(34.9)).toBe("low");
  });
  it("composite 0 → low", () => {
    expect(priorityFromScore(0)).toBe("low");
  });
});

describe("T-C2-K-2: priority in scoreCluster output", () => {
  it("opportunity has a valid priority tier", () => {
    const ctx = makeBBBContext();
    const signals = [makeSignal({ serviceId: "bed_bug_inspection", intent: "local", keyword: "priority check" })];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(["critical", "high", "medium", "low"]).toContain(opp.priority);
  });

  it("priority matches compositeScore tier", () => {
    const ctx = makeBBBContext();
    const signals = [makeSignal({ serviceId: "bed_bug_inspection", intent: "local", keyword: "priority tier check" })];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    // Priority must be consistent with compositeScore
    const expectedPriority = priorityFromScore(opp.compositeScore);
    // Allow for priority overrides (the override may upgrade the tier)
    const tiers = ["low", "medium", "high", "critical"];
    const oppIdx      = tiers.indexOf(opp.priority);
    const expectedIdx = tiers.indexOf(expectedPriority);
    expect(oppIdx).toBeGreaterThanOrEqual(expectedIdx); // overrides can only upgrade, not downgrade
  });
});

describe("T-C2-K-3: scoreCluster — suppression for blocked services", () => {
  it("opportunity has status 'pending' for generatable services", () => {
    const ctx = makeBBBContext();
    const signals = [makeSignal({ serviceId: "bed_bug_inspection", intent: "local", keyword: "pending status check" })];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(opp.status).toBe("pending");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// L. Confidence/evidence quality
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-L-1: confidence — 'low' for single signal", () => {
  it("cluster with 1 signal → confidence 'low'", () => {
    const ctx = makeBBBContext();
    const signals = [makeSignal({ serviceId: "bed_bug_inspection", intent: "local", keyword: "single signal" })];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(opp.scoreCard.confidence).toBe("low");
  });
});

describe("T-C2-L-2: confidence — 'medium' for gpt_simulated", () => {
  it("multiple gpt_simulated signals → confidence 'medium'", () => {
    const ctx = makeBBBContext();
    const signals = [
      makeSignal({ source: "gpt_simulated", serviceId: "bed_bug_inspection", intent: "local", keyword: "gpt signal one" }),
      makeSignal({ source: "gpt_simulated", serviceId: "bed_bug_inspection", intent: "local", keyword: "gpt signal two diff" }),
    ];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(opp.scoreCard.confidence).toBe("medium");
  });

  it("multiple signals where all have null volume → confidence 'medium'", () => {
    const ctx = makeBBBContext();
    const signals = [
      makeSignal({ volumeMonthly: null, source: "test_fixture", serviceId: "bed_bug_inspection", intent: "local", keyword: "no vol one" }),
      makeSignal({ volumeMonthly: null, source: "test_fixture", serviceId: "bed_bug_inspection", intent: "local", keyword: "no vol two diff" }),
    ];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(opp.scoreCard.confidence).toBe("medium");
  });
});

describe("T-C2-L-3: confidence — 'high' for real SERP provider with volume", () => {
  it("multiple dataforseo signals with volume → confidence 'high'", () => {
    const ctx = makeBBBContext();
    const signals = [
      makeSignal({ source: "dataforseo", volumeMonthly: 500, serviceId: "bed_bug_inspection", intent: "local", keyword: "serp high vol one" }),
      makeSignal({ source: "dataforseo", volumeMonthly: 300, serviceId: "bed_bug_inspection", intent: "local", keyword: "serp high vol two" }),
    ];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(opp.scoreCard.confidence).toBe("high");
  });
});

describe("T-C2-L-4: scoreCluster is deterministic (no Math.random)", () => {
  it("identical inputs produce identical scoreCard across multiple calls", () => {
    const ctx = makeBBBContext();
    const signals = [
      makeSignal({ volumeMonthly: 750, serviceId: "bed_bug_inspection", intent: "local", keyword: "determinism test" }),
    ];
    const { cluster, signals: cs } = makeCluster(signals, ctx);
    const opp1 = scoreCluster({ cluster, signals: cs, context: ctx });
    const opp2 = scoreCluster({ cluster, signals: cs, context: ctx });
    expect(opp1.scoreCard.composite).toBe(opp2.scoreCard.composite);
    expect(opp1.scoreCard.searchDemand).toBe(opp2.scoreCard.searchDemand);
    expect(opp1.priority).toBe(opp2.priority);
  });
});
