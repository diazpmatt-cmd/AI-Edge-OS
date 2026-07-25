/**
 * C8R-9 — Historical Authority Trends & Competitive Comparison: Unit Tests
 *
 * Tests for the new analytics layer in lib/db/src/backlink-history.ts:
 *   1. BacklinkScoreSnapshot — new fields (newCount, lostCount, referringDomainCount)
 *   2. computePeriodSummaries — core period delta logic (authority, backlinks, ref domains)
 *   3. computePeriodSummaries — edge cases (empty, single snapshot, all snapshots after cutoff)
 *   4. computePeriodSummaries — new/lost backlink window aggregation
 *   5. computePeriodSummaries — direction logic (up / down / flat)
 *   6. computePeriodSummaries — snapshotsInWindow count
 *   7. computePeriodSummaries — custom periodDays parameter
 *   8. Backward compat: computeBacklinkScoreTrend is unaffected by new fields
 *
 * Import convention: relative paths to lib/db/src (not @workspace/db) — required for vitest.
 */

import { describe, test, expect } from "vitest";
import {
  computePeriodSummaries,
  computeBacklinkScoreTrend,
  EMPTY_TREND,
  type BacklinkScoreSnapshot,
} from "../../../../../lib/db/src/backlink-history";

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeSnapshot(
  snapshotDate: string,
  overrides: Partial<Omit<BacklinkScoreSnapshot, "snapshotDate">> = {},
): BacklinkScoreSnapshot {
  return {
    clientId:             "test-client",
    snapshotDate,
    authorityScore:       overrides.authorityScore         ?? 0,
    backlinkCount:        overrides.backlinkCount          ?? 0,
    opportunityCount:     overrides.opportunityCount       ?? 0,
    wonCount:             overrides.wonCount               ?? 0,
    newCount:             overrides.newCount               ?? 0,
    lostCount:            overrides.lostCount              ?? 0,
    referringDomainCount: overrides.referringDomainCount   ?? 0,
    runId:                overrides.runId                  ?? null,
  };
}

/** N daily snapshots starting from startDate (inclusive). */
function dailySnapshots(
  startDate: string,
  count: number,
  builder: (i: number) => Partial<Omit<BacklinkScoreSnapshot, "snapshotDate">>,
): BacklinkScoreSnapshot[] {
  const base = new Date(`${startDate}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base.getTime() + i * 86_400_000);
    return makeSnapshot(d.toISOString().slice(0, 10), builder(i));
  });
}

const NOW = new Date("2026-07-19T12:00:00Z");

// ── BacklinkScoreSnapshot: new fields ─────────────────────────────────────────

describe("BacklinkScoreSnapshot: new fields", () => {
  test("accepts newCount, lostCount, referringDomainCount", () => {
    const s = makeSnapshot("2026-07-01", { newCount: 5, lostCount: 2, referringDomainCount: 120 });
    expect(s.newCount).toBe(5);
    expect(s.lostCount).toBe(2);
    expect(s.referringDomainCount).toBe(120);
  });

  test("defaults new fields to 0", () => {
    const s = makeSnapshot("2026-07-01");
    expect(s.newCount).toBe(0);
    expect(s.lostCount).toBe(0);
    expect(s.referringDomainCount).toBe(0);
  });

  test("newCount and lostCount are independent", () => {
    const s = makeSnapshot("2026-07-01", { newCount: 10, lostCount: 3 });
    expect(s.newCount + s.lostCount).toBe(13);
  });
});

// ── computePeriodSummaries: empty / degenerate inputs ─────────────────────────

describe("computePeriodSummaries: empty / degenerate inputs", () => {
  test("empty array returns empty array", () => {
    expect(computePeriodSummaries([], [7, 30, 90], NOW)).toEqual([]);
  });

  test("single snapshot produces one result per requested period", () => {
    const s = [makeSnapshot("2026-07-15", { backlinkCount: 50 })];
    expect(computePeriodSummaries(s, [7, 30], NOW)).toHaveLength(2);
  });

  test("all deltas are 0 and direction is flat when only one snapshot exists", () => {
    const s = [makeSnapshot("2026-07-15", { authorityScore: 30, backlinkCount: 50 })];
    const [p] = computePeriodSummaries(s, [7], NOW);
    expect(p!.authorityDelta).toBe(0);
    expect(p!.backlinkDelta).toBe(0);
    expect(p!.direction).toBe("flat");
  });

  test("custom periodDays returns correct count and labels", () => {
    const s = [makeSnapshot("2026-07-01"), makeSnapshot("2026-07-15")];
    const result = computePeriodSummaries(s, [14, 60], NOW);
    expect(result).toHaveLength(2);
    expect(result[0]!.periodDays).toBe(14);
    expect(result[1]!.periodDays).toBe(60);
  });
});

// ── computePeriodSummaries: authority delta + direction ───────────────────────

describe("computePeriodSummaries: authority delta + direction", () => {
  test("rising authority scores → direction=up, positive delta", () => {
    const snaps = dailySnapshots("2026-06-19", 30, i => ({ authorityScore: 10 + i }));
    const [p] = computePeriodSummaries(snaps, [7], NOW);
    expect(p!.direction).toBe("up");
    expect(p!.authorityDelta).toBeGreaterThan(0);
  });

  test("falling authority scores → direction=down, negative delta", () => {
    const snaps = dailySnapshots("2026-06-19", 30, i => ({ authorityScore: 40 - i }));
    const [p] = computePeriodSummaries(snaps, [7], NOW);
    expect(p!.direction).toBe("down");
    expect(p!.authorityDelta).toBeLessThan(0);
  });

  test("flat authority scores → direction=flat, delta=0", () => {
    const snaps = dailySnapshots("2026-06-19", 30, () => ({ authorityScore: 25 }));
    const [p] = computePeriodSummaries(snaps, [30], NOW);
    expect(p!.direction).toBe("flat");
    expect(p!.authorityDelta).toBe(0);
  });

  test("30-day delta exceeds 7-day delta for steadily growing score", () => {
    const snaps = dailySnapshots("2026-04-20", 90, i => ({ authorityScore: i }));
    const [p7, p30] = computePeriodSummaries(snaps, [7, 30], NOW);
    expect(p30!.authorityDelta).toBeGreaterThan(p7!.authorityDelta);
  });
});

// ── computePeriodSummaries: backlink + referring domain deltas ─────────────────

describe("computePeriodSummaries: backlink + referring domain deltas", () => {
  test("backlinkDelta = latest − baseline within window", () => {
    const snaps = [
      makeSnapshot("2026-07-06", { backlinkCount: 100 }),
      makeSnapshot("2026-07-12", { backlinkCount: 110 }),
      makeSnapshot("2026-07-19", { backlinkCount: 125 }),
    ];
    const [p] = computePeriodSummaries(snaps, [7], NOW);
    expect(p!.backlinkDelta).toBe(15);
  });

  test("referringDomainDelta is computed correctly", () => {
    const snaps = [
      makeSnapshot("2026-06-19", { referringDomainCount: 50 }),
      makeSnapshot("2026-07-19", { referringDomainCount: 65 }),
    ];
    const [p] = computePeriodSummaries(snaps, [30], NOW);
    expect(p!.referringDomainDelta).toBe(15);
  });

  test("opportunityDelta is computed correctly", () => {
    const snaps = [
      makeSnapshot("2026-06-19", { opportunityCount: 3 }),
      makeSnapshot("2026-07-19", { opportunityCount: 8 }),
    ];
    const [p] = computePeriodSummaries(snaps, [30], NOW);
    expect(p!.opportunityDelta).toBe(5);
  });
});

// ── computePeriodSummaries: new/lost backlinks window aggregation ──────────────

describe("computePeriodSummaries: newBacklinks / lostBacklinks sums", () => {
  test("sums newCount for all snapshots AFTER the baseline", () => {
    const snaps = [
      makeSnapshot("2026-07-05", { newCount: 100, lostCount: 50 }), // outside 7d window → baseline
      makeSnapshot("2026-07-13", { newCount: 5,   lostCount: 2  }),
      makeSnapshot("2026-07-17", { newCount: 3,   lostCount: 1  }),
      makeSnapshot("2026-07-19", { newCount: 2,   lostCount: 0  }),
    ];
    const [p] = computePeriodSummaries(snaps, [7], NOW);
    // Window snapshots: 07-13, 07-17, 07-19 → new=10, lost=3
    expect(p!.newBacklinks).toBe(10);
    expect(p!.lostBacklinks).toBe(3);
  });

  test("baseline snapshot's newCount is NOT included in the window sum", () => {
    const snaps = [
      makeSnapshot("2026-07-12", { newCount: 999 }), // baseline — must be excluded
      makeSnapshot("2026-07-19", { newCount: 7   }),
    ];
    const [p] = computePeriodSummaries(snaps, [7], NOW);
    expect(p!.newBacklinks).toBe(7);
  });

  test("zero new/lost when all counts are 0 (v1 placeholder data)", () => {
    const snaps = dailySnapshots("2026-06-19", 30, () => ({ newCount: 0, lostCount: 0 }));
    const [p] = computePeriodSummaries(snaps, [30], NOW);
    expect(p!.newBacklinks).toBe(0);
    expect(p!.lostBacklinks).toBe(0);
  });
});

// ── computePeriodSummaries: snapshotsInWindow count ───────────────────────────

describe("computePeriodSummaries: snapshotsInWindow", () => {
  test("counts baseline + all snapshots after it", () => {
    const snaps = [
      makeSnapshot("2026-07-01"),
      makeSnapshot("2026-07-13"),
      makeSnapshot("2026-07-16"),
      makeSnapshot("2026-07-19"),
    ];
    const [p] = computePeriodSummaries(snaps, [7], NOW);
    // Baseline (2026-07-01) + 3 after = 4
    expect(p!.snapshotsInWindow).toBe(4);
  });

  test("snapshotsInWindow=1 when only the baseline snapshot exists", () => {
    const snaps = [makeSnapshot("2026-07-19")];
    const [p] = computePeriodSummaries(snaps, [7], NOW);
    expect(p!.snapshotsInWindow).toBe(1);
  });
});

// ── computePeriodSummaries: fallback when all snapshots are within the period ──

describe("computePeriodSummaries: fallback baseline", () => {
  test("falls back to oldest snapshot when none predate the cutoff", () => {
    const snaps = [
      makeSnapshot("2026-07-17", { authorityScore: 10 }),
      makeSnapshot("2026-07-18", { authorityScore: 12 }),
      makeSnapshot("2026-07-19", { authorityScore: 15 }),
    ];
    const [p] = computePeriodSummaries(snaps, [7], NOW);
    // Falls back to oldest (score=10); delta = 15 − 10 = 5
    expect(p!.authorityDelta).toBe(5);
  });
});

// ── computeBacklinkScoreTrend: backward compat after snapshot field additions ──

describe("computeBacklinkScoreTrend: backward compat", () => {
  test("returns EMPTY_TREND for empty array", () => {
    expect(computeBacklinkScoreTrend([])).toEqual(EMPTY_TREND);
  });

  test("correctly calculates scoreDelta with new fields present", () => {
    const snaps = [
      makeSnapshot("2026-07-01", { authorityScore: 20, newCount: 5, lostCount: 2, referringDomainCount: 50 }),
      makeSnapshot("2026-07-19", { authorityScore: 30, newCount: 8, lostCount: 1, referringDomainCount: 60 }),
    ];
    const trend = computeBacklinkScoreTrend(snaps);
    expect(trend.scoreDelta).toBe(10);
    expect(trend.direction).toBe("up");
  });

  test("peakScore and avgScore are unaffected by new fields", () => {
    const snaps = [
      makeSnapshot("2026-07-01", { authorityScore: 20, newCount: 99 }),
      makeSnapshot("2026-07-10", { authorityScore: 40, lostCount: 99 }),
      makeSnapshot("2026-07-19", { authorityScore: 30, referringDomainCount: 999 }),
    ];
    const trend = computeBacklinkScoreTrend(snaps);
    expect(trend.peakScore).toBe(40);
    expect(trend.avgScore).toBe(30);
  });
});
