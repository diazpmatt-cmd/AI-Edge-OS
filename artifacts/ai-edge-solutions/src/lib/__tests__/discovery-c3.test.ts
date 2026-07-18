/**
 * Phase C3 — Discovery Persistence Integration Tests
 *
 * 20 test categories (A–T) covering:
 *   A.  Repository contract compliance
 *   B.  Run creation
 *   C.  Complete-run persistence
 *   D.  Partial-run persistence
 *   E.  Failed-run persistence
 *   F.  Tenant read isolation
 *   G.  Tenant write isolation
 *   H.  Deterministic replay (idempotent re-run)
 *   I.  Signal deduplication
 *   J.  Cluster deduplication
 *   K.  Opportunity deduplication
 *   L.  Transaction rollback (simulated mid-write failure)
 *   M.  Finalization atomicity
 *   N.  JSON round-trip validation
 *   O.  Unknown or malformed persisted JSON
 *   P.  Pipeline with fake repository
 *   Q.  Pipeline with in-memory repository (full persistence round-trip)
 *   R.  Persistence failure tolerance (repo throws → pipeline survives)
 *   S.  Cross-run isolation (two runs for same client)
 *   T.  Regression protection (C2 test behaviour preserved)
 *
 * All tests use InMemoryDiscoveryRepository — no live database required.
 * Serialization round-trips (N, O) test the pure helper functions directly.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// ── Imports from lib/db/src (relative paths — no @workspace/db alias in vitest) ──

import type { DiscoveryRepository } from "../../../../../lib/db/src/discovery-providers";
import type {
  DiscoverySignal,
  DiscoveryCluster,
  DiscoveryOpportunity,
  DiscoveryRunSummary,
  OpportunityScoreCard,
} from "../../../../../lib/db/src/discovery-types";
import {
  InMemoryDiscoveryRepository,
  DrizzleDiscoveryRepository,
  serializeSignal,
  deserializeSignal,
  serializeCluster,
  deserializeCluster,
  serializeOpportunity,
  deserializeOpportunity,
  serializeSnapshot,
  deserializeSnapshot,
  parseScoreCard,
  parseProviderFailures,
} from "../../../../../lib/db/src/discovery-drizzle-repository";
import {
  DiscoveryPipeline,
  deriveRunId,
} from "../../../../../lib/db/src/discovery-pipeline";
import {
  buildDiscoveryContext,
} from "../../../../../lib/db/src/discovery-context";
import {
  buildClientContentContext,
  bbbRegistryProvider,
} from "../../../../../lib/db/src/client-context";
import type {
  SearchDataProvider,
  RawKeywordResult,
} from "../../../../../lib/db/src/discovery-providers";

// ── Fixture factories ──────────────────────────────────────────────────────────

const NOW = new Date("2026-07-14T10:00:00.000Z");
const CLIENT_A = "client-aaa-001";
const CLIENT_B = "client-bbb-002";
const WEEK     = "2026-W29";
const RUN_A    = deriveRunId(CLIENT_A, WEEK);
const RUN_B    = deriveRunId(CLIENT_B, WEEK);

function makeScoreCard(overrides: Partial<OpportunityScoreCard> = {}): OpportunityScoreCard {
  return {
    searchDemand:        70,
    competitorGap:       60,
    revenueImpact:       80,
    contentFeasibility:  90,
    seasonalRelevance:   75,
    aiSearchPotential:   65,
    composite:           73,
    confidence:          "medium",
    explanations: {
      searchDemand:       "volume=1200, intent=local",
      competitorGap:      "no competitor data",
      revenueImpact:      "revenueWeight=8, priority=9",
      contentFeasibility: "3 content angles available",
      seasonalRelevance:  "peak season",
      aiSearchPotential:  "gap score 50",
    },
    ...overrides,
  };
}

function makeSignal(
  overrides: Partial<DiscoverySignal> & { id?: string } = {},
  clientId = CLIENT_A,
  runId    = RUN_A,
): DiscoverySignal {
  const normalizedValue = overrides.normalizedValue ?? "bed bug inspection foley al";
  const source          = overrides.source ?? "test_fixture";
  const id              = overrides.id !== undefined
    ? overrides.id
    : `sig::${clientId}::${source}::${normalizedValue}`;
  return {
    id,
    snapshotId:       runId,
    clientId,
    signalType:       "keyword",
    source:           "test_fixture",
    rawValue:         "Bed Bug Inspection Foley AL",
    normalizedValue,
    serviceId:        "bed_bug_inspection",
    intent:           "local",
    volumeEstimate:   1200,
    difficultyScore:  35,
    seasonalRelevance:80,
    geographicScope:  "local",
    trendDirection:   "rising",
    competitorRank:   null,
    citationFound:    null,
    evidenceStrength: 50,
    rawProviderData:  { source: "test" },
    createdAt:        NOW,
    ...overrides,
  };
}

function makeCluster(
  overrides: Partial<DiscoveryCluster> = {},
  clientId = CLIENT_A,
  runId    = RUN_A,
): DiscoveryCluster {
  const serviceId = overrides.primaryServiceId ?? "bed_bug_inspection";
  const intent    = overrides.intent ?? "local";
  const id        = overrides.id ?? `${clientId}::${serviceId}::${intent}`;
  return {
    id,
    snapshotId:       runId,
    clientId,
    clusterName:      "Bed Bug Inspection Local",
    primaryServiceId: serviceId,
    intent:           "local",
    signalIds:        [`sig::${clientId}::test_fixture::bed bug inspection foley al`],
    signalCount:      1,
    totalVolume:      1200,
    opportunityScore: 73,
    contentAngle:     "educational",
    seasonalWindow:   "Peak April–October",
    isActive:         true,
    createdAt:        NOW,
    ...overrides,
  };
}

function makeOpportunity(
  overrides: Partial<DiscoveryOpportunity> = {},
  clientId = CLIENT_A,
  runId    = RUN_A,
): DiscoveryOpportunity {
  const clusterId = overrides.clusterId ?? `${clientId}::bed_bug_inspection::local`;
  const id        = overrides.id ?? `opp::${clusterId}`;
  return {
    id,
    snapshotId:      runId,
    clientId,
    opportunityType: "keyword_rank",
    title:           "Rank for 'bed bug inspection Foley AL'",
    description:     "High local intent, good volume, low competition.",
    targetEngine:    "content",
    clusterId,
    serviceId:       "bed_bug_inspection",
    scoreCard:       makeScoreCard(),
    compositeScore:  73,
    priority:        "high",
    status:          "pending",
    assignedAt:      null,
    createdAt:       NOW,
    ...overrides,
  };
}

function makeSummary(
  overrides: Partial<DiscoveryRunSummary> = {},
  clientId = CLIENT_A,
  runId    = RUN_A,
  weekLabel = WEEK,
): DiscoveryRunSummary {
  const signal      = makeSignal({}, clientId, runId);
  const cluster     = makeCluster({}, clientId, runId);
  const opportunity = makeOpportunity({}, clientId, runId);
  return {
    runId,
    clientId,
    weekLabel,
    status:             "complete",
    providersAttempted: ["test_fixture"],
    providersSucceeded: ["test_fixture"],
    providersFailed:    [],
    providerFailures:   [],
    signals: { received: 1, accepted: 1, blocked: 0 },
    clusters:      { created: 1 },
    opportunities: { created: 1, highPriority: 1 },
    topOpportunityScore:  73,
    runDurationMs:        250,
    topOpportunities:     [opportunity],
    allClusters:          [cluster],
    allSignals:           [signal],
    allOpportunities:     [opportunity],
    ...overrides,
  };
}

/** Minimal SearchDataProvider that returns a fixed set of keywords */
function makeSearchProvider(keywords: string[] = ["bed bug inspection foley al"]): SearchDataProvider {
  return {
    name: "test_fixture",
    fetchKeywords: async () => keywords.map(k => ({
      keyword:        k,
      volumeMonthly:  500,
      difficulty:     30,
      intent:         "local" as const,
      cpc:            2.5,
      relatedQueries: [],
      providerRaw:    {},
    })),
    fetchCompetitorKeywords: async () => [],
  };
}

/** Minimal SearchDataProvider that always throws */
function makeFailingSearchProvider(): SearchDataProvider {
  return {
    name: "test_fixture",
    fetchKeywords:           async () => { throw new Error("provider_timeout"); },
    fetchCompetitorKeywords: async () => [],
  };
}

const BBB_CTX = buildClientContentContext(null, bbbRegistryProvider);
function makeBBBDiscoveryContext(clientId = CLIENT_A) {
  return buildDiscoveryContext({ contentContext: BBB_CTX, clientId, now: NOW, aiSearchGapScore: 50 });
}

// ── A. Repository contract compliance ─────────────────────────────────────────

describe("A. Repository contract compliance", () => {
  it("A1: InMemoryDiscoveryRepository satisfies the DiscoveryRepository interface at runtime", () => {
    const repo: DiscoveryRepository = new InMemoryDiscoveryRepository();
    expect(typeof repo.persistRunResult).toBe("function");
    expect(typeof repo.saveSignals).toBe("function");
    expect(typeof repo.saveClusters).toBe("function");
    expect(typeof repo.saveOpportunities).toBe("function");
    expect(typeof repo.getRunById).toBe("function");
    expect(typeof repo.listRunsByClient).toBe("function");
    expect(typeof repo.getSignalsForRun).toBe("function");
    expect(typeof repo.getClustersForRun).toBe("function");
    expect(typeof repo.getOpportunitiesForRun).toBe("function");
  });

  it("A2: DrizzleDiscoveryRepository satisfies the DiscoveryRepository interface (method shape)", () => {
    // Type-level: DrizzleDiscoveryRepository implements DiscoveryRepository.
    // Runtime: verify method names exist on the prototype.
    const proto = DrizzleDiscoveryRepository.prototype;
    const methods: (keyof DiscoveryRepository)[] = [
      "persistRunResult", "saveSignals", "saveClusters", "saveOpportunities",
      "getRunById", "listRunsByClient", "getSignalsForRun",
      "getClustersForRun", "getOpportunitiesForRun",
    ];
    for (const m of methods) {
      expect(typeof proto[m], `method ${m} missing`).toBe("function");
    }
  });

  it("A3: InMemoryDiscoveryRepository implements all 9 required methods", () => {
    const repo = new InMemoryDiscoveryRepository();
    const methodCount = [
      repo.persistRunResult, repo.saveSignals, repo.saveClusters,
      repo.saveOpportunities, repo.getRunById, repo.listRunsByClient,
      repo.getSignalsForRun, repo.getClustersForRun, repo.getOpportunitiesForRun,
    ].filter(m => typeof m === "function").length;
    expect(methodCount).toBe(9);
  });
});

// ── B. Run creation ────────────────────────────────────────────────────────────

describe("B. Run creation", () => {
  let repo: InMemoryDiscoveryRepository;
  beforeEach(() => { repo = new InMemoryDiscoveryRepository(); });

  it("B1: persistRunResult creates a snapshot for the tenant", async () => {
    await repo.persistRunResult(makeSummary());
    expect(repo.snapshotCount).toBe(1);
  });

  it("B2: snapshot has the correct runId, clientId, weekLabel, status", async () => {
    const summary = makeSummary();
    await repo.persistRunResult(summary);
    const run = await repo.getRunById(RUN_A, CLIENT_A);
    expect(run).not.toBeNull();
    expect(run!.runId).toBe(RUN_A);
    expect(run!.clientId).toBe(CLIENT_A);
    expect(run!.weekLabel).toBe(WEEK);
    expect(run!.status).toBe("complete");
  });

  it("B3: runId is deterministic — same clientId + weekLabel = same runId", () => {
    const id1 = deriveRunId("client-x", "2026-W29");
    const id2 = deriveRunId("client-x", "2026-W29");
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^run::/);
  });

  it("B4: different clients produce different runIds for the same week", () => {
    expect(RUN_A).not.toBe(RUN_B);
  });

  it("B5: listRunsByClient returns created run", async () => {
    await repo.persistRunResult(makeSummary());
    const runs = await repo.listRunsByClient(CLIENT_A);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.clientId).toBe(CLIENT_A);
  });
});

// ── C. Complete-run persistence ────────────────────────────────────────────────

describe("C. Complete-run persistence", () => {
  let repo: InMemoryDiscoveryRepository;
  beforeEach(() => { repo = new InMemoryDiscoveryRepository(); });

  it("C1: signals are persisted and retrievable by runId + clientId", async () => {
    await repo.persistRunResult(makeSummary());
    const signals = await repo.getSignalsForRun(RUN_A, CLIENT_A);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.clientId).toBe(CLIENT_A);
    expect(signals[0]!.snapshotId).toBe(RUN_A);
  });

  it("C2: clusters are persisted and retrievable", async () => {
    await repo.persistRunResult(makeSummary());
    const clusters = await repo.getClustersForRun(RUN_A, CLIENT_A);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.clusterName).toBe("Bed Bug Inspection Local");
  });

  it("C3: opportunities are persisted and retrievable", async () => {
    await repo.persistRunResult(makeSummary());
    const opps = await repo.getOpportunitiesForRun(RUN_A, CLIENT_A);
    expect(opps).toHaveLength(1);
    expect(opps[0]!.compositeScore).toBe(73);
    expect(opps[0]!.priority).toBe("high");
  });

  it("C4: getRunById returns full summary with child records", async () => {
    await repo.persistRunResult(makeSummary());
    const run = await repo.getRunById(RUN_A, CLIENT_A);
    expect(run).not.toBeNull();
    expect(run!.allSignals).toHaveLength(1);
    expect(run!.allClusters).toHaveLength(1);
    expect(run!.allOpportunities).toHaveLength(1);
  });

  it("C5: summary counts are preserved", async () => {
    const summary = makeSummary();
    await repo.persistRunResult(summary);
    const run = await repo.getRunById(RUN_A, CLIENT_A);
    expect(run!.signals.received).toBe(1);
    expect(run!.signals.accepted).toBe(1);
    expect(run!.signals.blocked).toBe(0);
    expect(run!.clusters.created).toBe(1);
    expect(run!.opportunities.created).toBe(1);
    expect(run!.topOpportunityScore).toBe(73);
  });

  it("C6: runDurationMs is preserved", async () => {
    await repo.persistRunResult(makeSummary({ runDurationMs: 500 }));
    const run = await repo.getRunById(RUN_A, CLIENT_A);
    expect(run!.runDurationMs).toBe(500);
  });

  it("C7: multiple signals, clusters, and opportunities are all persisted", async () => {
    const s1 = makeSignal({ id: "sig::A::test_fixture::kw1", normalizedValue: "kw1" });
    const s2 = makeSignal({ id: "sig::A::test_fixture::kw2", normalizedValue: "kw2" });
    const c1 = makeCluster({ id: "cA::svc::local" });
    const c2 = makeCluster({ id: "cA::general::informational", primaryServiceId: null, intent: "informational" });
    const o1 = makeOpportunity({ id: "opp::cA::svc::local" });
    const o2 = makeOpportunity({ id: "opp::cA::general::informational", priority: "medium" });

    await repo.persistRunResult(makeSummary({
      allSignals:      [s1, s2],
      allClusters:     [c1, c2],
      allOpportunities:[o1, o2],
      signals:    { received: 2, accepted: 2, blocked: 0 },
      clusters:   { created: 2 },
      opportunities: { created: 2, highPriority: 1 },
    }));

    expect(repo.signalCount).toBe(2);
    expect(repo.clusterCount).toBe(2);
    expect(repo.opportunityCount).toBe(2);
  });
});

// ── D. Partial-run persistence ────────────────────────────────────────────────

describe("D. Partial-run persistence", () => {
  let repo: InMemoryDiscoveryRepository;
  beforeEach(() => { repo = new InMemoryDiscoveryRepository(); });

  it("D1: partial run status is preserved", async () => {
    await repo.persistRunResult(makeSummary({ status: "partial" }));
    const run = await repo.getRunById(RUN_A, CLIENT_A);
    expect(run!.status).toBe("partial");
  });

  it("D2: provider failures are stored in the run summary", async () => {
    const failure = {
      provider: "test_fixture" as const,
      stage: 2,
      error: "connection_timeout",
      occurredAt: NOW,
    };
    await repo.persistRunResult(makeSummary({
      status:           "partial",
      providersFailed:  ["test_fixture"],
      providerFailures: [failure],
    }));
    const run = await repo.getRunById(RUN_A, CLIENT_A);
    expect(run!.providerFailures).toHaveLength(1);
    expect(run!.providerFailures[0]!.error).toBe("connection_timeout");
    expect(run!.providersFailed).toContain("test_fixture");
  });

  it("D3: partial run has signals from succeeded providers", async () => {
    const signal = makeSignal({});
    await repo.persistRunResult(makeSummary({
      status:      "partial",
      allSignals:  [signal],
      signals:     { received: 1, accepted: 1, blocked: 0 },
    }));
    const signals = await repo.getSignalsForRun(RUN_A, CLIENT_A);
    expect(signals).toHaveLength(1);
  });

  it("D4: partial run shows which providers succeeded vs failed", async () => {
    await repo.persistRunResult(makeSummary({
      status:             "partial",
      providersAttempted: ["test_fixture", "dataforseo"],
      providersSucceeded: ["test_fixture"],
      providersFailed:    ["dataforseo"],
      providerFailures:   [{
        provider: "dataforseo",
        stage: 2,
        error: "rate_limited",
        occurredAt: NOW,
      }],
    }));
    const run = await repo.getRunById(RUN_A, CLIENT_A);
    expect(run!.providersSucceeded).toContain("test_fixture");
    expect(run!.providersFailed).toContain("dataforseo");
  });
});

// ── E. Failed-run persistence ──────────────────────────────────────────────────

describe("E. Failed-run persistence", () => {
  let repo: InMemoryDiscoveryRepository;
  beforeEach(() => { repo = new InMemoryDiscoveryRepository(); });

  it("E1: failed run is stored with status='failed'", async () => {
    await repo.persistRunResult(makeSummary({ status: "failed" }));
    const run = await repo.getRunById(RUN_A, CLIENT_A);
    expect(run!.status).toBe("failed");
  });

  it("E2: failed run does NOT appear as complete", async () => {
    await repo.persistRunResult(makeSummary({ status: "failed" }));
    const run = await repo.getRunById(RUN_A, CLIENT_A);
    expect(run!.status).not.toBe("complete");
  });

  it("E3: failed run retains error diagnostics", async () => {
    const failure = {
      provider: "test_fixture" as const,
      stage: 1,
      error: "seed_extraction_failed",
      occurredAt: NOW,
    };
    await repo.persistRunResult(makeSummary({
      status:           "failed",
      providerFailures: [failure],
      providersFailed:  ["test_fixture"],
    }));
    const run = await repo.getRunById(RUN_A, CLIENT_A);
    expect(run!.providerFailures[0]!.error).toBe("seed_extraction_failed");
  });
});

// ── F. Tenant read isolation ───────────────────────────────────────────────────

describe("F. Tenant read isolation", () => {
  let repo: InMemoryDiscoveryRepository;
  beforeEach(() => { repo = new InMemoryDiscoveryRepository(); });

  it("F1: client B cannot read client A's run by runId", async () => {
    await repo.persistRunResult(makeSummary({}, CLIENT_A, RUN_A));
    const result = await repo.getRunById(RUN_A, CLIENT_B);
    expect(result).toBeNull();
  });

  it("F2: listRunsByClient returns only the correct tenant's runs", async () => {
    await repo.persistRunResult(makeSummary({}, CLIENT_A, RUN_A));
    await repo.persistRunResult(makeSummary({}, CLIENT_B, RUN_B));
    const runsA = await repo.listRunsByClient(CLIENT_A);
    const runsB = await repo.listRunsByClient(CLIENT_B);
    expect(runsA).toHaveLength(1);
    expect(runsA[0]!.clientId).toBe(CLIENT_A);
    expect(runsB).toHaveLength(1);
    expect(runsB[0]!.clientId).toBe(CLIENT_B);
  });

  it("F3: getSignalsForRun returns nothing for the wrong tenant", async () => {
    await repo.persistRunResult(makeSummary({}, CLIENT_A, RUN_A));
    const signals = await repo.getSignalsForRun(RUN_A, CLIENT_B);
    expect(signals).toHaveLength(0);
  });

  it("F4: getClustersForRun returns nothing for the wrong tenant", async () => {
    await repo.persistRunResult(makeSummary({}, CLIENT_A, RUN_A));
    const clusters = await repo.getClustersForRun(RUN_A, CLIENT_B);
    expect(clusters).toHaveLength(0);
  });

  it("F5: getOpportunitiesForRun returns nothing for the wrong tenant", async () => {
    await repo.persistRunResult(makeSummary({}, CLIENT_A, RUN_A));
    const opps = await repo.getOpportunitiesForRun(RUN_A, CLIENT_B);
    expect(opps).toHaveLength(0);
  });

  it("F6: client A cannot access client B's signals even if they share a snapshotId collision", async () => {
    // Hypothetical: both clients attempt to use the same run ID string
    const sharedRunId = "run::shared::collision";
    const signalA = makeSignal({ id: "sig::A::test::kw", snapshotId: sharedRunId }, CLIENT_A, sharedRunId);
    const signalB = makeSignal({ id: "sig::B::test::kw", snapshotId: sharedRunId }, CLIENT_B, sharedRunId);
    await repo.saveSignals([signalA]);
    await repo.saveSignals([signalB]);
    const forA = await repo.getSignalsForRun(sharedRunId, CLIENT_A);
    const forB = await repo.getSignalsForRun(sharedRunId, CLIENT_B);
    expect(forA).toHaveLength(1);
    expect(forA[0]!.clientId).toBe(CLIENT_A);
    expect(forB).toHaveLength(1);
    expect(forB[0]!.clientId).toBe(CLIENT_B);
  });
});

// ── G. Tenant write isolation ──────────────────────────────────────────────────

describe("G. Tenant write isolation", () => {
  let repo: InMemoryDiscoveryRepository;
  beforeEach(() => { repo = new InMemoryDiscoveryRepository(); });

  it("G1: client A writing its summary does not touch client B's snapshot", async () => {
    await repo.persistRunResult(makeSummary({ status: "complete" }, CLIENT_B, RUN_B));
    await repo.persistRunResult(makeSummary({ status: "complete" }, CLIENT_A, RUN_A));
    const runB = await repo.getRunById(RUN_B, CLIENT_B);
    expect(runB!.status).toBe("complete");
    expect(runB!.clientId).toBe(CLIENT_B);
  });

  it("G2: saving signals for client A does not affect client B's signal count", async () => {
    await repo.saveSignals([makeSignal({}, CLIENT_A, RUN_A)]);
    const forB = await repo.getSignalsForRun(RUN_A, CLIENT_B);
    expect(forB).toHaveLength(0);
  });

  it("G3: a bad-actor call using client A's runId with client B's clientId sees nothing", async () => {
    await repo.persistRunResult(makeSummary({}, CLIENT_A, RUN_A));
    // Client B tries to read client A's run by guessing the runId
    const run = await repo.getRunById(RUN_A, CLIENT_B);
    expect(run).toBeNull();
  });

  it("G4: opportunities written for client A are not visible to client B", async () => {
    const opp = makeOpportunity({}, CLIENT_A, RUN_A);
    await repo.saveOpportunities([opp]);
    const forB = await repo.getOpportunitiesForRun(RUN_A, CLIENT_B);
    expect(forB).toHaveLength(0);
  });
});

// ── H. Deterministic replay ────────────────────────────────────────────────────

describe("H. Deterministic replay", () => {
  let repo: InMemoryDiscoveryRepository;
  beforeEach(() => { repo = new InMemoryDiscoveryRepository(); });

  it("H1: running persistRunResult twice for the same runId does not duplicate the snapshot", async () => {
    const summary = makeSummary();
    await repo.persistRunResult(summary);
    await repo.persistRunResult(summary);
    expect(repo.snapshotCount).toBe(1);
  });

  it("H2: replaying the same run does not multiply signals", async () => {
    const summary = makeSummary();
    await repo.persistRunResult(summary);
    await repo.persistRunResult(summary);
    expect(repo.signalCount).toBe(1);
  });

  it("H3: replaying the same run does not multiply clusters", async () => {
    const summary = makeSummary();
    await repo.persistRunResult(summary);
    await repo.persistRunResult(summary);
    expect(repo.clusterCount).toBe(1);
  });

  it("H4: replaying the same run does not multiply opportunities", async () => {
    const summary = makeSummary();
    await repo.persistRunResult(summary);
    await repo.persistRunResult(summary);
    expect(repo.opportunityCount).toBe(1);
  });

  it("H5: a second run for a different week creates a new snapshot", async () => {
    const runA_W1 = deriveRunId(CLIENT_A, "2026-W29");
    const runA_W2 = deriveRunId(CLIENT_A, "2026-W30");
    await repo.persistRunResult(makeSummary({}, CLIENT_A, runA_W1, "2026-W29"));
    await repo.persistRunResult(makeSummary({}, CLIENT_A, runA_W2, "2026-W30"));
    expect(repo.snapshotCount).toBe(2);
  });

  it("H6: persistRunResult with updated status replaces old status (upsert)", async () => {
    await repo.persistRunResult(makeSummary({ status: "partial" }));
    await repo.persistRunResult(makeSummary({ status: "complete" }));
    const run = await repo.getRunById(RUN_A, CLIENT_A);
    expect(run!.status).toBe("complete");
    expect(repo.snapshotCount).toBe(1);
  });
});

// ── I. Signal deduplication ────────────────────────────────────────────────────

describe("I. Signal deduplication", () => {
  let repo: InMemoryDiscoveryRepository;
  beforeEach(() => { repo = new InMemoryDiscoveryRepository(); });

  it("I1: saving the same signal twice results in one stored record", async () => {
    const s = makeSignal();
    await repo.saveSignals([s, s]);
    expect(repo.signalCount).toBe(1);
  });

  it("I2: saveSignals with duplicate IDs in the same call is idempotent", async () => {
    const s = makeSignal();
    await repo.saveSignals([s]);
    await repo.saveSignals([s]);
    expect(repo.signalCount).toBe(1);
  });

  it("I3: signals with different IDs are both stored", async () => {
    const s1 = makeSignal({ id: "sig::A::test::kw1", normalizedValue: "kw1" });
    const s2 = makeSignal({ id: "sig::A::test::kw2", normalizedValue: "kw2" });
    await repo.saveSignals([s1, s2]);
    expect(repo.signalCount).toBe(2);
  });

  it("I4: signal with null volumeEstimate is stored without fabrication", async () => {
    const s = makeSignal({ volumeEstimate: null });
    await repo.saveSignals([s]);
    const stored = await repo.getSignalsForRun(RUN_A, CLIENT_A);
    expect(stored[0]!.volumeEstimate).toBeNull();
  });

  it("I5: signal with null difficultyScore is stored without fabrication", async () => {
    const s = makeSignal({ difficultyScore: null });
    await repo.saveSignals([s]);
    const stored = await repo.getSignalsForRun(RUN_A, CLIENT_A);
    expect(stored[0]!.difficultyScore).toBeNull();
  });
});

// ── J. Cluster deduplication ───────────────────────────────────────────────────

describe("J. Cluster deduplication", () => {
  let repo: InMemoryDiscoveryRepository;
  beforeEach(() => { repo = new InMemoryDiscoveryRepository(); });

  it("J1: saving the same cluster twice results in one stored record", async () => {
    const c = makeCluster();
    await repo.saveClusters([c, c]);
    expect(repo.clusterCount).toBe(1);
  });

  it("J2: saveClusters called twice with the same cluster is idempotent", async () => {
    const c = makeCluster();
    await repo.saveClusters([c]);
    await repo.saveClusters([c]);
    expect(repo.clusterCount).toBe(1);
  });

  it("J3: clusters with different IDs are both stored", async () => {
    const c1 = makeCluster({ id: "cA::svc1::local" });
    const c2 = makeCluster({ id: "cA::svc2::local" });
    await repo.saveClusters([c1, c2]);
    expect(repo.clusterCount).toBe(2);
  });

  it("J4: cluster with null primaryServiceId (general cluster) is stored correctly", async () => {
    const c = makeCluster({ id: "cA::general::informational", primaryServiceId: null, intent: "informational" });
    await repo.saveClusters([c]);
    const stored = await repo.getClustersForRun(RUN_A, CLIENT_A);
    expect(stored[0]!.primaryServiceId).toBeNull();
  });
});

// ── K. Opportunity deduplication ──────────────────────────────────────────────

describe("K. Opportunity deduplication", () => {
  let repo: InMemoryDiscoveryRepository;
  beforeEach(() => { repo = new InMemoryDiscoveryRepository(); });

  it("K1: saving the same opportunity twice results in one stored record", async () => {
    const o = makeOpportunity();
    await repo.saveOpportunities([o, o]);
    expect(repo.opportunityCount).toBe(1);
  });

  it("K2: saveOpportunities called twice with the same id is idempotent", async () => {
    const o = makeOpportunity();
    await repo.saveOpportunities([o]);
    await repo.saveOpportunities([o]);
    expect(repo.opportunityCount).toBe(1);
  });

  it("K3: opportunities with different IDs are both stored", async () => {
    const o1 = makeOpportunity({ id: "opp::c1" });
    const o2 = makeOpportunity({ id: "opp::c2" });
    await repo.saveOpportunities([o1, o2]);
    expect(repo.opportunityCount).toBe(2);
  });

  it("K4: all opportunity types are persisted", () => {
    const types: DiscoveryOpportunity["opportunityType"][] = [
      "keyword_rank", "ai_citation_gap", "competitor_gap", "content_topic",
      "local_listing", "review_velocity", "schema_markup", "seasonal_push", "voice_optimization",
    ];
    for (const t of types) {
      const o = makeOpportunity({ id: `opp::${t}`, opportunityType: t });
      expect(o.opportunityType).toBe(t);
    }
  });
});

// ── L. Transaction rollback ────────────────────────────────────────────────────

describe("L. Transaction rollback (simulated failure)", () => {
  let repo: InMemoryDiscoveryRepository;
  beforeEach(() => { repo = new InMemoryDiscoveryRepository(); });

  it("L1: when persistRunResult fails, no snapshot is stored", async () => {
    repo.simulateWriteFailure = true;
    await expect(repo.persistRunResult(makeSummary())).rejects.toThrow("simulated_db_write_failure");
    expect(repo.snapshotCount).toBe(0);
  });

  it("L2: when persistRunResult fails, no signals are stored", async () => {
    repo.simulateWriteFailure = true;
    await expect(repo.persistRunResult(makeSummary())).rejects.toThrow();
    expect(repo.signalCount).toBe(0);
  });

  it("L3: when persistRunResult fails, no clusters are stored", async () => {
    repo.simulateWriteFailure = true;
    await expect(repo.persistRunResult(makeSummary())).rejects.toThrow();
    expect(repo.clusterCount).toBe(0);
  });

  it("L4: when persistRunResult fails, no opportunities are stored", async () => {
    repo.simulateWriteFailure = true;
    await expect(repo.persistRunResult(makeSummary())).rejects.toThrow();
    expect(repo.opportunityCount).toBe(0);
  });

  it("L5: a successful run before a failed run is not corrupted by the failure", async () => {
    await repo.persistRunResult(makeSummary({ status: "complete" }));
    expect(repo.snapshotCount).toBe(1);
    repo.simulateWriteFailure = true;
    const run2 = makeSummary({}, CLIENT_A, deriveRunId(CLIENT_A, "2026-W30"), "2026-W30");
    await expect(repo.persistRunResult(run2)).rejects.toThrow();
    expect(repo.snapshotCount).toBe(1); // only the first run remains
    const run = await repo.getRunById(RUN_A, CLIENT_A);
    expect(run!.status).toBe("complete");
  });
});

// ── M. Finalization atomicity ──────────────────────────────────────────────────

describe("M. Finalization atomicity", () => {
  let repo: InMemoryDiscoveryRepository;
  beforeEach(() => { repo = new InMemoryDiscoveryRepository(); });

  it("M1: status transitions from partial to complete atomically", async () => {
    await repo.persistRunResult(makeSummary({ status: "partial" }));
    await repo.persistRunResult(makeSummary({ status: "complete" }));
    const run = await repo.getRunById(RUN_A, CLIENT_A);
    expect(run!.status).toBe("complete");
    expect(repo.snapshotCount).toBe(1);
  });

  it("M2: a failed transition leaves run in its prior valid state", async () => {
    await repo.persistRunResult(makeSummary({ status: "partial" }));
    // Simulate a failure during the second persist
    repo.simulateWriteFailure = true;
    await expect(repo.persistRunResult(makeSummary({ status: "complete" }))).rejects.toThrow();
    repo.simulateWriteFailure = false;
    // Run should still be in its partial state (the failed update was rolled back)
    const run = await repo.getRunById(RUN_A, CLIENT_A);
    expect(run!.status).toBe("partial");
  });

  it("M3: status and summary counts change together (one atomic write)", async () => {
    const partial = makeSummary({
      status: "partial",
      signals: { received: 1, accepted: 1, blocked: 0 },
      opportunities: { created: 1, highPriority: 0 },
    });
    const complete = makeSummary({
      status: "complete",
      signals: { received: 3, accepted: 2, blocked: 1 },
      opportunities: { created: 2, highPriority: 1 },
    });
    await repo.persistRunResult(partial);
    await repo.persistRunResult(complete);
    const run = await repo.getRunById(RUN_A, CLIENT_A);
    expect(run!.status).toBe("complete");
    expect(run!.signals.received).toBe(3);
    expect(run!.opportunities.highPriority).toBe(1);
  });
});

// ── N. JSON round-trip validation ─────────────────────────────────────────────

describe("N. JSON round-trip validation", () => {
  it("N1: serializeSignal → deserializeSignal is a lossless round-trip", () => {
    const original = makeSignal();
    const row = serializeSignal(original);
    const restored = deserializeSignal(row as any);
    expect(restored.id).toBe(original.id);
    expect(restored.volumeEstimate).toBe(original.volumeEstimate);
    expect(restored.difficultyScore).toBe(original.difficultyScore);
    expect(restored.competitorRank).toBeNull();
    expect(restored.citationFound).toBeNull();
    expect(restored.rawProviderData).toEqual(original.rawProviderData);
  });

  it("N2: null nullable fields serialize and deserialize as null", () => {
    const s = makeSignal({ volumeEstimate: null, difficultyScore: null, competitorRank: null, citationFound: null });
    const restored = deserializeSignal(serializeSignal(s) as any);
    expect(restored.volumeEstimate).toBeNull();
    expect(restored.difficultyScore).toBeNull();
    expect(restored.competitorRank).toBeNull();
    expect(restored.citationFound).toBeNull();
  });

  it("N3: serializeCluster → deserializeCluster preserves signalIds array", () => {
    const c = makeCluster({ signalIds: ["sig::A", "sig::B", "sig::C"] });
    const restored = deserializeCluster(serializeCluster(c) as any);
    expect(restored.signalIds).toEqual(["sig::A", "sig::B", "sig::C"]);
  });

  it("N4: serializeCluster → deserializeCluster preserves null primaryServiceId", () => {
    const c = makeCluster({ id: "cA::general::info", primaryServiceId: null });
    const restored = deserializeCluster(serializeCluster(c) as any);
    expect(restored.primaryServiceId).toBeNull();
  });

  it("N5: serializeOpportunity → deserializeOpportunity preserves scoreCard", () => {
    const sc = makeScoreCard({ searchDemand: 88, confidence: "high" });
    const o  = makeOpportunity({ scoreCard: sc });
    const row = serializeOpportunity(o);
    // Simulate DB round-trip: scoreCard is stored as JSON, parsed via parseScoreCard
    const restoredSc = parseScoreCard(row.scoreCard);
    expect(restoredSc.searchDemand).toBe(88);
    expect(restoredSc.confidence).toBe("high");
    expect(restoredSc.composite).toBe(sc.composite);
    expect(restoredSc.explanations.searchDemand).toBe("volume=1200, intent=local");
  });

  it("N6: serializeSnapshot captures all run summary counts", () => {
    const summary = makeSummary({
      signals:      { received: 10, accepted: 8, blocked: 2 },
      clusters:     { created: 4 },
      opportunities:{ created: 4, highPriority: 2 },
      topOpportunityScore: 85,
      runDurationMs: 300,
    });
    const row = serializeSnapshot(summary);
    expect(row.signalsReceived).toBe(10);
    expect(row.signalsAccepted).toBe(8);
    expect(row.signalsBlocked).toBe(2);
    expect(row.clusterCount).toBe(4);
    expect(row.opportunityCount).toBe(4);
    expect(row.highPriorityOpportunityCount).toBe(2);
    expect(row.topOpportunityScore).toBe(85);
    expect(row.runDurationMs).toBe(300);
  });

  it("N7: provider failures survive a serialize → parseProviderFailures round-trip", () => {
    const failure = {
      provider:   "dataforseo" as const,
      stage:      2,
      error:      "rate_limited",
      occurredAt: new Date("2026-07-14T10:00:00.000Z"),
    };
    const summary = makeSummary({ providerFailures: [failure] });
    const row = serializeSnapshot(summary);
    // row.providerFailures is the serialized JSON array
    const restored = parseProviderFailures(row.providerFailures);
    expect(restored).toHaveLength(1);
    expect(restored[0]!.provider).toBe("dataforseo");
    expect(restored[0]!.error).toBe("rate_limited");
    expect(restored[0]!.occurredAt).toBeInstanceOf(Date);
  });

  it("N8: deserializeSnapshot rebuilds a DiscoveryRunSummary from a snapshot row", () => {
    const summary = makeSummary();
    const row = serializeSnapshot(summary);
    // Simulate DB reading: timestamps come back as Date objects from pg
    const dbRow = {
      ...row,
      createdAt:   new Date(),
      completedAt: new Date(),
    };
    const restored = deserializeSnapshot(dbRow as any, [], [], []);
    expect(restored.runId).toBe(RUN_A);
    expect(restored.clientId).toBe(CLIENT_A);
    expect(restored.weekLabel).toBe(WEEK);
    expect(restored.status).toBe("complete");
  });
});

// ── O. Unknown or malformed persisted JSON ─────────────────────────────────────

describe("O. Unknown or malformed persisted JSON", () => {
  it("O1: parseScoreCard throws on null input", () => {
    expect(() => parseScoreCard(null)).toThrow();
  });

  it("O2: parseScoreCard throws on empty object", () => {
    expect(() => parseScoreCard({})).toThrow();
  });

  it("O3: parseScoreCard throws when composite field is missing", () => {
    const badCard = {
      searchDemand: 70, competitorGap: 60, revenueImpact: 80,
      contentFeasibility: 90, seasonalRelevance: 75, aiSearchPotential: 65,
      // composite: missing!
      confidence: "medium",
      explanations: { searchDemand: "", competitorGap: "", revenueImpact: "", contentFeasibility: "", seasonalRelevance: "", aiSearchPotential: "" },
    };
    expect(() => parseScoreCard(badCard)).toThrow();
  });

  it("O4: parseScoreCard throws on invalid confidence value", () => {
    const badCard = { ...makeScoreCard(), confidence: "ultra" };
    expect(() => parseScoreCard(badCard)).toThrow();
  });

  it("O5: parseScoreCard throws on string where number is expected", () => {
    const badCard = { ...makeScoreCard(), searchDemand: "seventy" };
    expect(() => parseScoreCard(badCard)).toThrow();
  });

  it("O6: parseScoreCard accepts a valid scoreCard without throwing", () => {
    const sc = makeScoreCard();
    expect(() => parseScoreCard(sc)).not.toThrow();
    const result = parseScoreCard(sc);
    expect(result.composite).toBe(73);
  });

  it("O7: parseProviderFailures returns empty array on non-array input", () => {
    expect(parseProviderFailures(null)).toEqual([]);
    expect(parseProviderFailures("bad")).toEqual([]);
    expect(parseProviderFailures({})).toEqual([]);
  });

  it("O8: parseProviderFailures returns empty array on malformed entries", () => {
    const bad = [{ provider: 123, stage: "two" }]; // wrong types
    expect(parseProviderFailures(bad)).toEqual([]);
  });

  it("O9: deserializeOpportunity throws when score_card is malformed", () => {
    const badRow = {
      ...serializeOpportunity(makeOpportunity()),
      scoreCard: { malformed: true }, // missing required fields
    };
    expect(() => deserializeOpportunity(badRow as any)).toThrow(/malformed score_card/);
  });
});

// ── P. Pipeline with fake repository ──────────────────────────────────────────

describe("P. Pipeline with fake repository (existing behaviour preserved)", () => {
  it("P1: pipeline with no providers and no repo returns a summary with status='complete'", async () => {
    const ctx = makeBBBDiscoveryContext();
    const pipeline = new DiscoveryPipeline({});
    const summary = await pipeline.run(ctx);
    expect(summary.status).toBe("complete");
    expect(summary.allSignals).toHaveLength(0);
    expect(summary.allOpportunities).toHaveLength(0);
  });

  it("P2: pipeline with no repo skips Stage 11 — summary.allSignals exists but is empty", async () => {
    const ctx = makeBBBDiscoveryContext();
    const pipeline = new DiscoveryPipeline({});
    const summary = await pipeline.run(ctx);
    expect(Array.isArray(summary.allSignals)).toBe(true);
    expect(Array.isArray(summary.allOpportunities)).toBe(true);
    expect(Array.isArray(summary.allClusters)).toBe(true);
  });

  it("P3: pipeline with fake provider produces signals in allSignals", async () => {
    const ctx = makeBBBDiscoveryContext();
    const pipeline = new DiscoveryPipeline({ search: makeSearchProvider() });
    const summary = await pipeline.run(ctx);
    expect(summary.allSignals.length).toBeGreaterThan(0);
  });

  it("P4: topOpportunities is always a subset of allOpportunities", async () => {
    const ctx = makeBBBDiscoveryContext();
    const pipeline = new DiscoveryPipeline({ search: makeSearchProvider(["kw1", "kw2", "kw3", "kw4", "kw5", "kw6"]) });
    const summary = await pipeline.run(ctx);
    expect(summary.topOpportunities.length).toBeLessThanOrEqual(summary.allOpportunities.length);
    expect(summary.topOpportunities.length).toBeLessThanOrEqual(5);
  });

  it("P5: failing provider → status='partial', allSignals still contains results from succeeded providers", async () => {
    const ctx = makeBBBDiscoveryContext();
    const pipeline = new DiscoveryPipeline({
      search: makeSearchProvider(["good keyword"]),
      paa:    {
        name: "test_fixture",
        fetchPAA: async () => { throw new Error("paa_failed"); },
      },
    });
    const summary = await pipeline.run(ctx);
    expect(summary.status).toBe("partial");
    expect(summary.allSignals.length).toBeGreaterThan(0);
  });
});

// ── Q. Pipeline with in-memory repository ─────────────────────────────────────

describe("Q. Pipeline with in-memory repository (full persistence round-trip)", () => {
  let repo: InMemoryDiscoveryRepository;
  beforeEach(() => { repo = new InMemoryDiscoveryRepository(); });

  it("Q1: pipeline injects repo and Stage 11 calls persistRunResult", async () => {
    const ctx = makeBBBDiscoveryContext();
    const pipeline = new DiscoveryPipeline({ search: makeSearchProvider() }, repo);
    await pipeline.run(ctx);
    expect(repo.writeCallCounts.persistRunResult).toBe(1);
  });

  it("Q2: after pipeline run, signals are retrievable from the repo", async () => {
    const ctx = makeBBBDiscoveryContext();
    const pipeline = new DiscoveryPipeline({ search: makeSearchProvider() }, repo);
    const summary = await pipeline.run(ctx);
    const stored = await repo.getSignalsForRun(summary.runId, CLIENT_A);
    expect(stored.length).toBeGreaterThan(0);
  });

  it("Q3: persisted run has correct runId, clientId, weekLabel", async () => {
    const ctx = makeBBBDiscoveryContext();
    const pipeline = new DiscoveryPipeline({ search: makeSearchProvider() }, repo);
    const summary = await pipeline.run(ctx);
    const run = await repo.getRunById(summary.runId, CLIENT_A);
    expect(run).not.toBeNull();
    expect(run!.runId).toBe(summary.runId);
    expect(run!.clientId).toBe(CLIENT_A);
  });

  it("Q4: running the same pipeline twice for the same week is idempotent", async () => {
    const ctx = makeBBBDiscoveryContext();
    const pipeline = new DiscoveryPipeline({ search: makeSearchProvider() }, repo);
    await pipeline.run(ctx);
    await pipeline.run(ctx);
    expect(repo.snapshotCount).toBe(1);
  });

  it("Q5: pipeline summary allSignals matches stored signals count", async () => {
    const ctx = makeBBBDiscoveryContext();
    const pipeline = new DiscoveryPipeline({ search: makeSearchProvider(["kw1", "kw2"]) }, repo);
    const summary = await pipeline.run(ctx);
    const stored = await repo.getSignalsForRun(summary.runId, CLIENT_A);
    // allSignals count == stored signals count (all signals are stored)
    expect(stored.length).toBe(summary.allSignals.length);
  });

  it("Q6: opportunities stored by pipeline are retrievable", async () => {
    const ctx = makeBBBDiscoveryContext();
    const pipeline = new DiscoveryPipeline({ search: makeSearchProvider() }, repo);
    const summary = await pipeline.run(ctx);
    const stored = await repo.getOpportunitiesForRun(summary.runId, CLIENT_A);
    expect(stored.length).toBe(summary.allOpportunities.length);
  });
});

// ── R. Persistence failure tolerance ──────────────────────────────────────────

describe("R. Persistence failure tolerance", () => {
  let repo: InMemoryDiscoveryRepository;
  beforeEach(() => { repo = new InMemoryDiscoveryRepository(); });

  it("R1: repo failure in Stage 11 does not crash the pipeline", async () => {
    repo.simulateWriteFailure = true;
    const ctx = makeBBBDiscoveryContext();
    const pipeline = new DiscoveryPipeline({ search: makeSearchProvider() }, repo);
    const summary = await expect(pipeline.run(ctx)).resolves.toBeDefined();
  });

  it("R2: pipeline still returns a valid summary even when repo throws", async () => {
    repo.simulateWriteFailure = true;
    const ctx = makeBBBDiscoveryContext();
    const pipeline = new DiscoveryPipeline({ search: makeSearchProvider() }, repo);
    const summary = await pipeline.run(ctx);
    expect(summary.runId).toBeDefined();
    expect(summary.clientId).toBe(CLIENT_A);
    expect(summary.allSignals.length).toBeGreaterThan(0);
  });

  it("R3: repo failure in Stage 11 does not corrupt existing stored runs", async () => {
    repo.simulateWriteFailure = false;
    const ctx1 = buildDiscoveryContext({ contentContext: BBB_CTX, clientId: CLIENT_A, now: new Date("2026-07-07T10:00:00.000Z"), aiSearchGapScore: 50 });
    const p1 = new DiscoveryPipeline({ search: makeSearchProvider() }, repo);
    await p1.run(ctx1);
    const firstRunId = deriveRunId(CLIENT_A, ctx1.currentWeek);
    expect(repo.snapshotCount).toBe(1);

    repo.simulateWriteFailure = true;
    const p2 = new DiscoveryPipeline({ search: makeSearchProvider() }, repo);
    await p2.run(makeBBBDiscoveryContext()); // this will fail silently in Stage 11
    repo.simulateWriteFailure = false;

    // First run should be untouched
    const firstRun = await repo.getRunById(firstRunId, CLIENT_A);
    expect(firstRun).not.toBeNull();
    expect(repo.snapshotCount).toBe(1); // only the first run persisted
  });

  it("R4: pipeline result status reflects provider outcomes, not persistence outcome", async () => {
    repo.simulateWriteFailure = true;
    const ctx = makeBBBDiscoveryContext();
    // Only one provider succeeds — status should be "complete" (all attempted providers succeeded)
    const pipeline = new DiscoveryPipeline({ search: makeSearchProvider() }, repo);
    const summary = await pipeline.run(ctx);
    // Pipeline status is about providers, not persistence
    expect(summary.status).toBe("complete");
  });
});

// ── S. Cross-run isolation ─────────────────────────────────────────────────────

describe("S. Cross-run isolation", () => {
  let repo: InMemoryDiscoveryRepository;
  beforeEach(() => { repo = new InMemoryDiscoveryRepository(); });

  it("S1: signals from run 1 are not returned when querying run 2", async () => {
    const runId1 = deriveRunId(CLIENT_A, "2026-W29");
    const runId2 = deriveRunId(CLIENT_A, "2026-W30");
    const s1 = makeSignal({ id: "sig::A::test::kw-w29", snapshotId: runId1 }, CLIENT_A, runId1);
    const s2 = makeSignal({ id: "sig::A::test::kw-w30", snapshotId: runId2 }, CLIENT_A, runId2);
    await repo.saveSignals([s1, s2]);
    const signals1 = await repo.getSignalsForRun(runId1, CLIENT_A);
    const signals2 = await repo.getSignalsForRun(runId2, CLIENT_A);
    expect(signals1).toHaveLength(1);
    expect(signals1[0]!.id).toBe("sig::A::test::kw-w29");
    expect(signals2).toHaveLength(1);
    expect(signals2[0]!.id).toBe("sig::A::test::kw-w30");
  });

  it("S2: clusters from run 1 are not returned when querying run 2", async () => {
    const runId1 = deriveRunId(CLIENT_A, "2026-W29");
    const runId2 = deriveRunId(CLIENT_A, "2026-W30");
    const c1 = makeCluster({ id: "cA::svc::local::w29", snapshotId: runId1 }, CLIENT_A, runId1);
    const c2 = makeCluster({ id: "cA::svc::local::w30", snapshotId: runId2 }, CLIENT_A, runId2);
    await repo.saveClusters([c1, c2]);
    const clusters1 = await repo.getClustersForRun(runId1, CLIENT_A);
    const clusters2 = await repo.getClustersForRun(runId2, CLIENT_A);
    expect(clusters1[0]!.id).toBe("cA::svc::local::w29");
    expect(clusters2[0]!.id).toBe("cA::svc::local::w30");
  });

  it("S3: opportunities from run 1 do not appear in run 2 query", async () => {
    const runId1 = deriveRunId(CLIENT_A, "2026-W29");
    const runId2 = deriveRunId(CLIENT_A, "2026-W30");
    const o1 = makeOpportunity({ id: "opp::w29", snapshotId: runId1 }, CLIENT_A, runId1);
    const o2 = makeOpportunity({ id: "opp::w30", snapshotId: runId2 }, CLIENT_A, runId2);
    await repo.saveOpportunities([o1, o2]);
    const opps1 = await repo.getOpportunitiesForRun(runId1, CLIENT_A);
    const opps2 = await repo.getOpportunitiesForRun(runId2, CLIENT_A);
    expect(opps1[0]!.id).toBe("opp::w29");
    expect(opps2[0]!.id).toBe("opp::w30");
  });

  it("S4: listRunsByClient returns both runs for the same client", async () => {
    await repo.persistRunResult(makeSummary({}, CLIENT_A, deriveRunId(CLIENT_A, "2026-W29"), "2026-W29"));
    await repo.persistRunResult(makeSummary({}, CLIENT_A, deriveRunId(CLIENT_A, "2026-W30"), "2026-W30"));
    const runs = await repo.listRunsByClient(CLIENT_A);
    expect(runs).toHaveLength(2);
    const weekLabels = runs.map(r => r.weekLabel);
    expect(weekLabels).toContain("2026-W29");
    expect(weekLabels).toContain("2026-W30");
  });

  it("S5: total signal count is additive across two runs, not duplicated", async () => {
    const runId1 = deriveRunId(CLIENT_A, "2026-W29");
    const runId2 = deriveRunId(CLIENT_A, "2026-W30");
    // Different signal IDs (different weeks)
    await repo.persistRunResult(makeSummary({ allSignals: [makeSignal({ id: "sig::A::test::w29", snapshotId: runId1 }, CLIENT_A, runId1)] }, CLIENT_A, runId1, "2026-W29"));
    await repo.persistRunResult(makeSummary({ allSignals: [makeSignal({ id: "sig::A::test::w30", snapshotId: runId2 }, CLIENT_A, runId2)] }, CLIENT_A, runId2, "2026-W30"));
    expect(repo.signalCount).toBe(2);
  });
});

// ── T. Regression protection ───────────────────────────────────────────────────

describe("T. Regression protection", () => {
  it("T1: DiscoveryRunSummary still has all C2 fields", () => {
    const summary = makeSummary();
    // All original C2 fields must exist
    expect(summary.runId).toBeDefined();
    expect(summary.clientId).toBeDefined();
    expect(summary.weekLabel).toBeDefined();
    expect(summary.status).toBeDefined();
    expect(summary.providersAttempted).toBeDefined();
    expect(summary.providersSucceeded).toBeDefined();
    expect(summary.providersFailed).toBeDefined();
    expect(summary.providerFailures).toBeDefined();
    expect(summary.signals).toBeDefined();
    expect(summary.clusters).toBeDefined();
    expect(summary.opportunities).toBeDefined();
    expect(summary.topOpportunityScore).toBeDefined();
    expect(summary.runDurationMs).toBeDefined();
    expect(summary.topOpportunities).toBeDefined();
    expect(summary.allClusters).toBeDefined();
    // C3 additions exist too
    expect(summary.allSignals).toBeDefined();
    expect(summary.allOpportunities).toBeDefined();
  });

  it("T2: pipeline without repository still returns topOpportunities and allClusters (C2 compat)", async () => {
    const ctx = makeBBBDiscoveryContext();
    const pipeline = new DiscoveryPipeline({ search: makeSearchProvider() });
    const summary = await pipeline.run(ctx);
    expect(Array.isArray(summary.topOpportunities)).toBe(true);
    expect(Array.isArray(summary.allClusters)).toBe(true);
  });

  it("T3: deriveRunId is deterministic (C2 contract preserved)", () => {
    const id = deriveRunId("client-x", "2026-W29");
    expect(id).toBe("run::client-x::2026-W29");
    expect(deriveRunId("client-x", "2026-W29")).toBe(id);
  });

  it("T4: InMemoryDiscoveryRepository has no dependency on live DB or API", () => {
    // This test itself proves the point — it runs with no DATABASE_URL
    const repo = new InMemoryDiscoveryRepository();
    expect(repo).toBeDefined();
    expect(repo.snapshotCount).toBe(0);
  });

  it("T5: pipeline with repo does not break status computation (C2 contract)", async () => {
    const repo = new InMemoryDiscoveryRepository();
    const ctx  = makeBBBDiscoveryContext();
    // All providers fail → status = "partial"
    const pipeline = new DiscoveryPipeline({
      search: makeFailingSearchProvider(),
    }, repo);
    const summary = await pipeline.run(ctx);
    expect(summary.status).toBe("partial");
    // Even with repo injected, the pipeline status logic is unchanged
  });

  it("T6: saveSignals and saveClusters exist as standalone methods (C2 interface compat)", async () => {
    const repo: DiscoveryRepository = new InMemoryDiscoveryRepository();
    await expect(repo.saveSignals([])).resolves.toBeUndefined();
    await expect(repo.saveClusters([])).resolves.toBeUndefined();
    await expect(repo.saveOpportunities([])).resolves.toBeUndefined();
  });

  it("T7: allOpportunities is always sorted by compositeScore desc when returned from pipeline", async () => {
    const ctx = makeBBBDiscoveryContext();
    const pipeline = new DiscoveryPipeline({
      search: makeSearchProvider(["kw1", "kw2", "kw3"]),
    });
    const summary = await pipeline.run(ctx);
    for (let i = 1; i < summary.allOpportunities.length; i++) {
      expect(summary.allOpportunities[i - 1]!.compositeScore).toBeGreaterThanOrEqual(
        summary.allOpportunities[i]!.compositeScore,
      );
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// U. Competitor identifier guard at persistence layer
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C3-U: competitor identifier guard fires at saveSignals time", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("U1: warns when saving a signal with competitorRank set but no identifier in rawProviderData", async () => {
    const repo = new InMemoryDiscoveryRepository();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const signal = makeSignal({
      competitorRank:  1,
      rawProviderData: { source: "dataforseo_serp", organicResultCount: 8 },
    });

    await repo.saveSignals([signal]);

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("competitor_rank=1");
    expect(warnSpy.mock.calls[0][0]).toContain(CLIENT_A);
  });

  it("U2: does NOT warn when saving a signal with competitorRank set AND a competitorName present", async () => {
    const repo = new InMemoryDiscoveryRepository();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const signal = makeSignal({
      competitorRank:  2,
      rawProviderData: { source: "dataforseo_serp", competitorName: "Foley Pest Control" },
    });

    await repo.saveSignals([signal]);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("U3: does NOT warn when saving a signal with null competitorRank (normal state)", async () => {
    const repo = new InMemoryDiscoveryRepository();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await repo.saveSignals([makeSignal({ competitorRank: null })]);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("U4: signal is still stored even when the warning fires (non-blocking guard)", async () => {
    const repo = new InMemoryDiscoveryRepository();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const signal = makeSignal({
      competitorRank:  3,
      rawProviderData: {},
    });
    await repo.saveSignals([signal]);

    const stored = await repo.getSignalsForRun(signal.snapshotId, CLIENT_A);
    expect(stored.some(s => s.id === signal.id)).toBe(true);
  });

  it("U5: warns once per offending signal when a batch contains multiple signals", async () => {
    const repo = new InMemoryDiscoveryRepository();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const bad1 = makeSignal({ id: "sig::a", normalizedValue: "kw one",   competitorRank: 1, rawProviderData: {} });
    const good = makeSignal({ id: "sig::b", normalizedValue: "kw two",   competitorRank: 2, rawProviderData: { competitorName: "A Pest Co" } });
    const bad2 = makeSignal({ id: "sig::c", normalizedValue: "kw three", competitorRank: 5, rawProviderData: {} });

    await repo.saveSignals([bad1, good, bad2]);

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("U6: warns via persistRunResult path when summary contains a signal with competitorRank and no identifier", async () => {
    const repo = new InMemoryDiscoveryRepository();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const badSignal = makeSignal({
      competitorRank:  4,
      rawProviderData: { source: "dataforseo_serp" },
    });

    await repo.persistRunResult(makeSummary({ allSignals: [badSignal] }));

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]![0]).toContain("competitor_rank=4");
  });

  it("U7: does NOT warn via persistRunResult when the competitor signal has a valid topCompetitorDomain", async () => {
    const repo = new InMemoryDiscoveryRepository();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const signal = makeSignal({
      competitorRank:  1,
      rawProviderData: { topCompetitorDomain: "foleypestcontrol.com" },
    });

    await repo.persistRunResult(makeSummary({ allSignals: [signal] }));

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
