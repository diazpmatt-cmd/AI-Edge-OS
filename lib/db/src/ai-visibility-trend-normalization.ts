/**
 * C9R-5: AI Visibility Trend Normalization — pure utility functions.
 *
 * Converts raw scan history into per-day trend points and derives a
 * summary direction (up / down / stable / insufficient_data).
 *
 * All functions are pure (no I/O, no side effects) and fully unit-testable
 * without mocking.
 */

// ── Public types ──────────────────────────────────────────────────────────────

export interface AiTrendDataPoint {
  /** ISO date string YYYY-MM-DD */
  date:        string;
  /** Fraction of queries that mentioned the business (0..1). */
  mentionRate: number;
  /** How many completed scans contributed to this day's aggregate. */
  scanCount:   number;
}

export type AiTrendDirection = "up" | "down" | "stable" | "insufficient_data";

export interface AiTrendSummary {
  points:        AiTrendDataPoint[];
  latestRate:    number | null;
  earliestRate:  number | null;
  trend:         AiTrendDirection;
  /** Percentage change from earliest to latest, or null if indeterminate. */
  changePercent: number | null;
  dataPoints:    number;
}

// ── Minimum data required before reporting a direction ────────────────────────

const MIN_POINTS_FOR_TREND = 2;

// ── Scan input shape (caller provides subset) ─────────────────────────────────

export interface AiScanTrendInput {
  startedAt:      string;
  completedCount: number;
  mentionCount:   number;
  status:         string;
}

// ── normalizeScanHistoryToTrendPoints ─────────────────────────────────────────
// Groups completed scans by calendar date (UTC) and computes a weighted
// mention rate per day.

export function normalizeScanHistoryToTrendPoints(
  scans: AiScanTrendInput[],
): AiTrendDataPoint[] {
  const byDate = new Map<string, { totalMentions: number; totalQueries: number; count: number }>();

  for (const scan of scans) {
    if (scan.status !== "completed" || scan.completedCount <= 0) continue;

    const date     = scan.startedAt.slice(0, 10);
    const existing = byDate.get(date) ?? { totalMentions: 0, totalQueries: 0, count: 0 };
    existing.totalMentions += scan.mentionCount;
    existing.totalQueries  += scan.completedCount;
    existing.count         += 1;
    byDate.set(date, existing);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      mentionRate: round3(data.totalMentions / data.totalQueries),
      scanCount:   data.count,
    }));
}

// ── computeTrendSummary ───────────────────────────────────────────────────────
// Derives direction + change percent from an ordered sequence of trend points.

export function computeTrendSummary(points: AiTrendDataPoint[]): AiTrendSummary {
  if (points.length < MIN_POINTS_FOR_TREND) {
    return {
      points,
      latestRate:    points.length > 0 ? points[points.length - 1].mentionRate : null,
      earliestRate:  null,
      trend:         "insufficient_data",
      changePercent: null,
      dataPoints:    points.length,
    };
  }

  const earliest = points[0].mentionRate;
  const latest   = points[points.length - 1].mentionRate;

  let changePercent: number | null = null;
  let trend: AiTrendDirection = "stable";

  if (earliest > 0) {
    changePercent = round1(((latest - earliest) / earliest) * 100);
    if (changePercent > 5)       trend = "up";
    else if (changePercent < -5) trend = "down";
    else                         trend = "stable";
  } else if (latest > 0) {
    trend = "up";
  }

  return {
    points,
    latestRate:    latest,
    earliestRate:  earliest,
    trend,
    changePercent,
    dataPoints:    points.length,
  };
}

// ── computeFullTrendSummary ───────────────────────────────────────────────────
// Convenience wrapper: normalise raw scans then compute summary in one call.

export function computeFullTrendSummary(scans: AiScanTrendInput[]): AiTrendSummary {
  return computeTrendSummary(normalizeScanHistoryToTrendPoints(scans));
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
