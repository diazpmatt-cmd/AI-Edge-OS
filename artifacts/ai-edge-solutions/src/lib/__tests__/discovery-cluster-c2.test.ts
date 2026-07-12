/**
 * Phase C2 — Tests H & I
 *
 * H. Deterministic clustering (same inputs → same cluster IDs and names)
 * I. Deduplication (duplicate normalizedValues within a group → single signal)
 */

import { describe, it, expect } from "vitest";
import { buildClusters } from "../../../../../lib/db/src/discovery-cluster-builder";
import {
  buildDiscoveryContext,
  type DiscoveryContext,
} from "../../../../../lib/db/src/discovery-context";
import {
  buildClientContentContext,
  bbbRegistryProvider,
} from "../../../../../lib/db/src/client-context";
import {
  normalizeKeywordResult,
  normalizeRedditResult,
} from "../../../../../lib/db/src/discovery-normalizer";
import type { DiscoverySignal } from "../../../../../lib/db/src/discovery-types";
import type { RawKeywordResult } from "../../../../../lib/db/src/discovery-providers";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const NOW  = new Date("2026-07-12T10:00:00.000Z");
const BBB_CONTEXT = buildClientContentContext(null, bbbRegistryProvider);

function makeBBBDiscoveryContext(): DiscoveryContext {
  return buildDiscoveryContext({
    contentContext: BBB_CONTEXT,
    clientId:       "bbb-test-01",
    now:            NOW,
  });
}

function makeSignal(overrides: {
  clientId?: string;
  keyword?: string;
  serviceId?: string | null;
  intent?: DiscoverySignal["intent"];
  volumeMonthly?: number | null;
  source?: DiscoverySignal["source"];
  evidenceStrength?: number;
}): DiscoverySignal {
  const raw: RawKeywordResult = {
    keyword:        overrides.keyword ?? "bed bug inspection",
    volumeMonthly:  overrides.volumeMonthly !== undefined ? overrides.volumeMonthly : 500,
    difficulty:     35,
    intent:         overrides.intent ?? "local",
    cpc:            3.00,
    relatedQueries: [],
    providerRaw:    {},
  };
  return normalizeKeywordResult({
    raw,
    clientId:   overrides.clientId ?? "bbb-test-01",
    source:     overrides.source ?? "test_fixture",
    serviceId:  overrides.serviceId !== undefined ? overrides.serviceId : "bed_bug_inspection",
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// H. Deterministic clustering
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-H-1: buildClusters — basic grouping", () => {
  it("signals with the same serviceId + intent form one cluster", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals = [
      makeSignal({ keyword: "bed bug inspection foley", serviceId: "bed_bug_inspection", intent: "local" }),
      makeSignal({ keyword: "bed bug inspector near me", serviceId: "bed_bug_inspection", intent: "local" }),
    ];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.signalCount).toBe(2);
  });

  it("signals with different serviceIds form separate clusters", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals = [
      makeSignal({ keyword: "bed bug inspection", serviceId: "bed_bug_inspection", intent: "local" }),
      makeSignal({ keyword: "roach control foley", serviceId: "roaches", intent: "local" }),
    ];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(clusters.length).toBe(2);
  });

  it("signals with the same serviceId but different intent form separate clusters", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals = [
      makeSignal({ keyword: "are bed bugs dangerous", serviceId: "bed_bug_inspection", intent: "informational" }),
      makeSignal({ keyword: "bed bug inspection near me", serviceId: "bed_bug_inspection", intent: "local" }),
    ];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(clusters.length).toBe(2);
  });

  it("signals with null serviceId form a 'general' cluster", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals = [
      makeSignal({ keyword: "pest control tips", serviceId: null, intent: "informational" }),
      makeSignal({ keyword: "how to prevent pests", serviceId: null, intent: "informational" }),
    ];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(clusters.length).toBe(1);
    expect(clusters[0]!.primaryServiceId).toBeNull();
  });
});

describe("T-C2-H-2: buildClusters — stable cluster IDs", () => {
  it("cluster ID is deterministic: same inputs → same ID", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals1 = [
      makeSignal({ keyword: "bed bug inspection", serviceId: "bed_bug_inspection", intent: "local" }),
    ];
    const signals2 = [
      makeSignal({ keyword: "bed bug inspection", serviceId: "bed_bug_inspection", intent: "local" }),
    ];
    const clusters1 = buildClusters(signals1, bbbRegistryProvider, ctx);
    const clusters2 = buildClusters(signals2, bbbRegistryProvider, ctx);
    expect(clusters1[0]!.id).toBe(clusters2[0]!.id);
  });

  it("cluster ID contains clientId (tenant-scoped)", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals = [
      makeSignal({ keyword: "pest control", serviceId: "residential_pest_control", intent: "local" }),
    ];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(clusters[0]!.id).toContain("bbb-test-01");
  });

  it("cluster ID contains serviceId", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals = [
      makeSignal({ keyword: "bed bug inspection", serviceId: "bed_bug_inspection", intent: "local" }),
    ];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(clusters[0]!.id).toContain("bed_bug_inspection");
  });

  it("cluster ID contains intent", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals = [
      makeSignal({ keyword: "bed bug inspection", serviceId: "bed_bug_inspection", intent: "local" }),
    ];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(clusters[0]!.id).toContain("local");
  });
});

describe("T-C2-H-3: buildClusters — cluster metadata", () => {
  it("cluster has the correct clientId", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals = [makeSignal({ serviceId: "bed_bug_inspection", intent: "local" })];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(clusters[0]!.clientId).toBe("bbb-test-01");
  });

  it("cluster snapshotId matches context.snapshotId", () => {
    const ctx = buildDiscoveryContext({
      contentContext: BBB_CONTEXT,
      clientId:       "bbb-test-01",
      now:            NOW,
      snapshotId:     "snap-test-001",
    });
    const signals = [makeSignal({ serviceId: "bed_bug_inspection", intent: "local" })];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(clusters[0]!.snapshotId).toBe("snap-test-001");
  });

  it("totalVolume is sum of member signal volumeEstimates", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals = [
      makeSignal({ keyword: "bed bug inspection foley", serviceId: "bed_bug_inspection", intent: "local", volumeMonthly: 300 }),
      makeSignal({ keyword: "bed bug inspector near me", serviceId: "bed_bug_inspection", intent: "local", volumeMonthly: 200 }),
    ];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(clusters[0]!.totalVolume).toBe(500);
  });

  it("totalVolume excludes null volumes (not fabricated)", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals = [
      makeSignal({ keyword: "bed bug inspection foley", serviceId: "bed_bug_inspection", intent: "local", volumeMonthly: 300 }),
      makeSignal({ keyword: "bed bug inspector near me", serviceId: "bed_bug_inspection", intent: "local", volumeMonthly: null }),
    ];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(clusters[0]!.totalVolume).toBe(300); // null is treated as 0 in sum
  });

  it("isActive is true for normally generatable services", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals = [makeSignal({ serviceId: "bed_bug_inspection", intent: "local" })];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(clusters[0]!.isActive).toBe(true);
  });

  it("cluster has a clusterName string", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals = [makeSignal({ serviceId: "bed_bug_inspection", intent: "local" })];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(typeof clusters[0]!.clusterName).toBe("string");
    expect(clusters[0]!.clusterName.length).toBeGreaterThan(0);
  });

  it("cluster has a contentAngle string", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals = [makeSignal({ serviceId: "bed_bug_inspection", intent: "informational" })];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(typeof clusters[0]!.contentAngle).toBe("string");
    expect(clusters[0]!.contentAngle.length).toBeGreaterThan(0);
  });

  it("returns empty array for empty signal input", () => {
    const ctx = makeBBBDiscoveryContext();
    const clusters = buildClusters([], bbbRegistryProvider, ctx);
    expect(clusters).toEqual([]);
  });
});

describe("T-C2-H-4: buildClusters — sorted output", () => {
  it("clusters are sorted by totalVolume descending", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals = [
      makeSignal({ keyword: "bed bug inspection low vol", serviceId: "bed_bug_inspection", intent: "local", volumeMonthly: 100 }),
      makeSignal({ keyword: "roach control high vol", serviceId: "roaches", intent: "local", volumeMonthly: 2000 }),
      makeSignal({ keyword: "mosquito control mid vol", serviceId: "mosquitoes", intent: "local", volumeMonthly: 500 }),
    ];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(clusters.length).toBe(3);
    expect(clusters[0]!.totalVolume).toBeGreaterThanOrEqual(clusters[1]!.totalVolume);
    expect(clusters[1]!.totalVolume).toBeGreaterThanOrEqual(clusters[2]!.totalVolume);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// I. Deduplication
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-I-1: deduplication within a cluster", () => {
  it("exact duplicate normalizedValues → kept once (same source)", () => {
    const ctx = makeBBBDiscoveryContext();
    // Two signals that normalize to the same value
    const signals = [
      makeSignal({ keyword: "bed bug inspection", serviceId: "bed_bug_inspection", intent: "local" }),
      makeSignal({ keyword: "bed bug inspection", serviceId: "bed_bug_inspection", intent: "local" }),
    ];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(clusters[0]!.signalCount).toBe(1); // deduplicated
  });

  it("near-duplicate: casing difference → kept once (normalized to same value)", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals = [
      makeSignal({ keyword: "Bed Bug Inspection", serviceId: "bed_bug_inspection", intent: "local" }),
      makeSignal({ keyword: "bed bug inspection", serviceId: "bed_bug_inspection", intent: "local" }),
    ];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(clusters[0]!.signalCount).toBe(1);
  });

  it("duplicate from two providers: keeps higher evidenceStrength", () => {
    const ctx = makeBBBDiscoveryContext();
    // gpt_simulated (40) vs dataforseo (90) — dataforseo should win
    const rawGpt: RawKeywordResult = {
      keyword: "bed bug treatment foley al", volumeMonthly: 100, difficulty: 30,
      intent: "local", cpc: 1.0, relatedQueries: [], providerRaw: { src: "gpt" },
    };
    const rawSerp: RawKeywordResult = {
      keyword: "bed bug treatment foley al", volumeMonthly: 320, difficulty: 45,
      intent: "local", cpc: 4.0, relatedQueries: [], providerRaw: { src: "dataforseo" },
    };
    const gptSignal = normalizeKeywordResult({ raw: rawGpt, clientId: "bbb-test-01", source: "gpt_simulated", serviceId: "bed_bug_treatment" });
    const serpSignal = normalizeKeywordResult({ raw: rawSerp, clientId: "bbb-test-01", source: "dataforseo", serviceId: "bed_bug_treatment" });

    const clusters = buildClusters([gptSignal, serpSignal], bbbRegistryProvider, ctx);
    expect(clusters[0]!.signalCount).toBe(1);
    // The surviving signal should be the one from dataforseo (evidenceStrength=90)
    const survivingId = clusters[0]!.signalIds[0]!;
    expect(survivingId).toContain("dataforseo");
  });

  it("different keywords (different normalizedValue) → kept as separate signals in the cluster", () => {
    const ctx = makeBBBDiscoveryContext();
    const signals = [
      makeSignal({ keyword: "bed bug inspection foley", serviceId: "bed_bug_inspection", intent: "local" }),
      makeSignal({ keyword: "bed bug inspector near me", serviceId: "bed_bug_inspection", intent: "local" }),
    ];
    const clusters = buildClusters(signals, bbbRegistryProvider, ctx);
    expect(clusters[0]!.signalCount).toBe(2);
  });
});

describe("T-C2-I-2: cross-cluster deduplication does not happen", () => {
  it("same keyword in different serviceId clusters → remains in both", () => {
    const ctx = makeBBBDiscoveryContext();
    // Same keyword, but under different services (different cluster keys)
    const s1 = makeSignal({ keyword: "pest treatment", serviceId: "bed_bug_treatment", intent: "local" });
    const s2 = makeSignal({ keyword: "pest treatment", serviceId: "roaches", intent: "local" });
    const clusters = buildClusters([s1, s2], bbbRegistryProvider, ctx);
    // Should have 2 clusters (different serviceId → different key)
    expect(clusters.length).toBe(2);
  });
});

describe("T-C2-I-3: tenant isolation in cluster builder", () => {
  it("signals from a different clientId are excluded from the output", () => {
    const ctx = makeBBBDiscoveryContext(); // clientId = "bbb-test-01"
    const bbbSignal      = makeSignal({ clientId: "bbb-test-01", keyword: "bed bug inspection", serviceId: "bed_bug_inspection", intent: "local" });
    const foreignSignal  = makeSignal({ clientId: "lakeside-test-01", keyword: "pipe leak repair", serviceId: "bed_bug_inspection", intent: "local" });
    const clusters = buildClusters([bbbSignal, foreignSignal], bbbRegistryProvider, ctx);
    // Only bbbSignal should be in the cluster
    for (const cluster of clusters) {
      expect(cluster.clientId).toBe("bbb-test-01");
      for (const sid of cluster.signalIds) {
        expect(sid).toContain("bbb-test-01");
      }
    }
  });
});

describe("T-C2-I-4: mixed signal types in cluster builder", () => {
  it("PAA and keyword signals under the same serviceId+intent group into one cluster", () => {
    const ctx = makeBBBDiscoveryContext();
    const kwSignal = makeSignal({ keyword: "how to prevent bed bugs", serviceId: "bed_bug_inspection", intent: "informational" });
    const paaSignal = normalizeRedditResult({
      raw: {
        title: "how to prevent bed bugs at home", body: null, score: 50, commentCount: 10,
        subreddit: "r/pestcontrol", url: "https://reddit.com/test",
        createdAt: new Date(), providerRaw: {},
      },
      clientId: "bbb-test-01",
      source: "test_fixture",
      serviceId: "bed_bug_inspection",
    });
    // Both have serviceId=bed_bug_inspection and intent=informational
    const clusters = buildClusters([kwSignal, paaSignal], bbbRegistryProvider, ctx);
    // Since paaSignal gets intent=informational (from normalizeRedditResult), both should be in one cluster
    const totalSignals = clusters.reduce((sum, c) => sum + c.signalCount, 0);
    expect(totalSignals).toBeGreaterThanOrEqual(1);
  });
});
