/**
 * C9R-5 — Unit tests for AI Visibility Trend Normalization pure functions.
 *
 * All tests are pure (no DB or I/O). Imported directly from @workspace/db.
 */

import { describe, test, expect } from "vitest";
import {
  normalizeScanHistoryToTrendPoints,
  computeTrendSummary,
  computeFullTrendSummary,
  type AiScanTrendInput,
} from "@workspace/db";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeScan(
  startedAt: string,
  completedCount: number,
  mentionCount: number,
  status = "completed",
): AiScanTrendInput {
  return { startedAt, completedCount, mentionCount, status };
}

// ── normalizeScanHistoryToTrendPoints ─────────────────────────────────────────

describe("normalizeScanHistoryToTrendPoints", () => {
  test("empty input → empty array", () => {
    expect(normalizeScanHistoryToTrendPoints([])).toEqual([]);
  });

  test("only non-completed scans → empty array", () => {
    const scans = [
      makeScan("2026-07-01T10:00:00Z", 5, 2, "failed"),
      makeScan("2026-07-02T10:00:00Z", 5, 3, "running"),
    ];
    expect(normalizeScanHistoryToTrendPoints(scans)).toEqual([]);
  });

  test("zero completedCount scans are skipped", () => {
    const scans = [makeScan("2026-07-01T10:00:00Z", 0, 0)];
    expect(normalizeScanHistoryToTrendPoints(scans)).toEqual([]);
  });

  test("single completed scan produces one trend point", () => {
    const scans = [makeScan("2026-07-01T10:00:00Z", 10, 4)];
    const pts   = normalizeScanHistoryToTrendPoints(scans);
    expect(pts).toHaveLength(1);
    expect(pts[0].date).toBe("2026-07-01");
    expect(pts[0].mentionRate).toBeCloseTo(0.4, 3);
    expect(pts[0].scanCount).toBe(1);
  });

  test("two scans on same day are merged into one point", () => {
    const scans = [
      makeScan("2026-07-01T08:00:00Z", 10, 3),
      makeScan("2026-07-01T20:00:00Z", 10, 7),
    ];
    const pts = normalizeScanHistoryToTrendPoints(scans);
    expect(pts).toHaveLength(1);
    expect(pts[0].date).toBe("2026-07-01");
    expect(pts[0].scanCount).toBe(2);
    expect(pts[0].mentionRate).toBeCloseTo(0.5, 3); // (3+7)/(10+10)
  });

  test("multiple days are sorted ascending by date", () => {
    const scans = [
      makeScan("2026-07-03T10:00:00Z", 10, 5),
      makeScan("2026-07-01T10:00:00Z", 10, 2),
      makeScan("2026-07-02T10:00:00Z", 10, 8),
    ];
    const pts = normalizeScanHistoryToTrendPoints(scans);
    expect(pts).toHaveLength(3);
    expect(pts[0].date).toBe("2026-07-01");
    expect(pts[1].date).toBe("2026-07-02");
    expect(pts[2].date).toBe("2026-07-03");
  });

  test("mixed statuses — only completed contribute", () => {
    const scans = [
      makeScan("2026-07-01T10:00:00Z", 10, 5, "completed"),
      makeScan("2026-07-01T10:00:00Z", 10, 3, "failed"),
    ];
    const pts = normalizeScanHistoryToTrendPoints(scans);
    expect(pts).toHaveLength(1);
    expect(pts[0].mentionRate).toBeCloseTo(0.5, 3); // only the completed scan counts
  });

  test("mention rate is rounded to 3 decimal places", () => {
    const scans = [makeScan("2026-07-01T10:00:00Z", 3, 1)];
    const pts   = normalizeScanHistoryToTrendPoints(scans);
    expect(pts[0].mentionRate).toBe(0.333); // 1/3 rounded to 3 dp
  });
});

// ── computeTrendSummary ───────────────────────────────────────────────────────

describe("computeTrendSummary", () => {
  test("0 points → insufficient_data, latestRate null", () => {
    const s = computeTrendSummary([]);
    expect(s.trend).toBe("insufficient_data");
    expect(s.latestRate).toBeNull();
    expect(s.dataPoints).toBe(0);
  });

  test("1 point → insufficient_data, latestRate = the point's rate", () => {
    const pts = [{ date: "2026-07-01", mentionRate: 0.4, scanCount: 1 }];
    const s   = computeTrendSummary(pts);
    expect(s.trend).toBe("insufficient_data");
    expect(s.latestRate).toBe(0.4);
    expect(s.dataPoints).toBe(1);
  });

  test("2 points increasing by > 5% → 'up'", () => {
    const pts = [
      { date: "2026-07-01", mentionRate: 0.2, scanCount: 1 },
      { date: "2026-07-08", mentionRate: 0.4, scanCount: 1 },
    ];
    const s = computeTrendSummary(pts);
    expect(s.trend).toBe("up");
    expect(s.changePercent).toBeGreaterThan(5);
  });

  test("2 points decreasing by > 5% → 'down'", () => {
    const pts = [
      { date: "2026-07-01", mentionRate: 0.5, scanCount: 1 },
      { date: "2026-07-08", mentionRate: 0.3, scanCount: 1 },
    ];
    const s = computeTrendSummary(pts);
    expect(s.trend).toBe("down");
    expect(s.changePercent).toBeLessThan(-5);
  });

  test("change within ±5% → 'stable'", () => {
    const pts = [
      { date: "2026-07-01", mentionRate: 0.4,   scanCount: 1 },
      { date: "2026-07-08", mentionRate: 0.402,  scanCount: 1 },
    ];
    const s = computeTrendSummary(pts);
    expect(s.trend).toBe("stable");
  });

  test("earliest rate 0, latest > 0 → 'up'", () => {
    const pts = [
      { date: "2026-07-01", mentionRate: 0,   scanCount: 1 },
      { date: "2026-07-08", mentionRate: 0.3, scanCount: 1 },
    ];
    const s = computeTrendSummary(pts);
    expect(s.trend).toBe("up");
    expect(s.changePercent).toBeNull();
  });

  test("both rates 0 → stable (no change detectable, not 'up')", () => {
    const pts = [
      { date: "2026-07-01", mentionRate: 0, scanCount: 1 },
      { date: "2026-07-08", mentionRate: 0, scanCount: 1 },
    ];
    const s = computeTrendSummary(pts);
    expect(s.trend).toBe("stable");
    expect(s.changePercent).toBeNull();
  });

  test("returns earliestRate and latestRate correctly", () => {
    const pts = [
      { date: "2026-07-01", mentionRate: 0.2, scanCount: 1 },
      { date: "2026-07-08", mentionRate: 0.5, scanCount: 1 },
    ];
    const s = computeTrendSummary(pts);
    expect(s.earliestRate).toBe(0.2);
    expect(s.latestRate).toBe(0.5);
  });
});

// ── computeFullTrendSummary ───────────────────────────────────────────────────

describe("computeFullTrendSummary", () => {
  test("pipes normalization + summary for a complete scan list", () => {
    const scans: AiScanTrendInput[] = [
      makeScan("2026-07-01T10:00:00Z", 10, 2),
      makeScan("2026-07-08T10:00:00Z", 10, 6),
    ];
    const summary = computeFullTrendSummary(scans);
    expect(summary.trend).toBe("up");
    expect(summary.dataPoints).toBe(2);
    expect(summary.latestRate).toBeCloseTo(0.6, 3);
  });

  test("empty input → insufficient_data", () => {
    const summary = computeFullTrendSummary([]);
    expect(summary.trend).toBe("insufficient_data");
    expect(summary.dataPoints).toBe(0);
  });
});
