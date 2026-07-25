/**
 * C8R-9 — Backlink Score History & Trend Calculation
 *
 * Pure functions for building, analysing, and summarising historical backlink
 * score snapshots.  No database interaction — all persistence is handled by
 * the API routes.
 *
 * All functions are deterministic and side-effect-free.
 */

// ── Score snapshot ────────────────────────────────────────────────────────────

/** One persisted row of backlink_score_history. */
export interface BacklinkScoreSnapshot {
  readonly clientId:              string;
  /** ISO date string "YYYY-MM-DD" */
  readonly snapshotDate:          string;
  /** Overall backlink authority score 0–100 */
  readonly authorityScore:        number;
  /** Total backlink / referring-domain count observed */
  readonly backlinkCount:         number;
  /** Total open opportunity count at snapshot time */
  readonly opportunityCount:      number;
  /** Total "won" opportunities at snapshot time */
  readonly wonCount:              number;
  /** New backlinks gained since previous snapshot (v1: always 0 until live DA provider) */
  readonly newCount:              number;
  /** Backlinks lost since previous snapshot (v1: always 0 until live DA provider) */
  readonly lostCount:             number;
  /** Unique referring domains at snapshot time (v1: always 0 until live DA provider) */
  readonly referringDomainCount:  number;
  /** Ingestion run ID that produced this snapshot, or null if manually recorded */
  readonly runId:                 string | null;
}

// ── Period summaries ──────────────────────────────────────────────────────────

export interface BacklinkPeriodSummary {
  /** Window size in days (e.g. 7, 30, 90) */
  readonly periodDays:            number;
  /** Authority score delta: latest − baseline. */
  readonly authorityDelta:        number;
  /** Backlink count delta: latest − baseline. */
  readonly backlinkDelta:         number;
  /** Referring domain count delta: latest − baseline. */
  readonly referringDomainDelta:  number;
  /** Opportunity count delta: latest − baseline. */
  readonly opportunityDelta:      number;
  /** Sum of new_count for all snapshots within the window. */
  readonly newBacklinks:          number;
  /** Sum of lost_count for all snapshots within the window. */
  readonly lostBacklinks:         number;
  /** Trend direction driven by authorityDelta. */
  readonly direction:             BacklinkTrendDirection;
  /** Number of snapshots present within the window (inclusive of baseline). */
  readonly snapshotsInWindow:     number;
}

// ── Competitive comparison ────────────────────────────────────────────────────

export interface BacklinkCompetitorComparison {
  readonly domain:                  string;
  readonly businessName:            string | null;
  /** Domain authority 0–100 from competitors table (NULL stored as 0). */
  readonly authorityScore:          number;
  /** Total backlink count from competitors table (NULL stored as 0). */
  readonly backlinkCount:           number;
  /** Citation score 0–100 from competitors table (NULL stored as 0). */
  readonly citationScore:           number;
  /** Opportunity score from competitors table. */
  readonly opportunityScore:        number;
  /** Organic visibility score from competitors table (NULL stored as 0). */
  readonly organicVisibilityScore:  number;
}

// ── Trend ─────────────────────────────────────────────────────────────────────

export type BacklinkTrendDirection = "up" | "down" | "flat";

export interface BacklinkScoreTrend {
  readonly direction:          BacklinkTrendDirection;
  /** authorityScore delta: latest − earliest.  Positive = improvement. */
  readonly scoreDelta:         number;
  /** backlinkCount delta: latest − earliest. */
  readonly backlinkCountDelta: number;
  /** Newest snapshot (last element of input array). */
  readonly latest:             BacklinkScoreSnapshot | null;
  /** Oldest snapshot (first element of input array). */
  readonly earliest:           BacklinkScoreSnapshot | null;
  /** Total number of snapshots provided. */
  readonly snapshotCount:      number;
  /** Peak authority score observed across all snapshots. */
  readonly peakScore:          number;
  /** Average authority score rounded to nearest integer. */
  readonly avgScore:           number;
}

export const EMPTY_TREND: BacklinkScoreTrend = Object.freeze({
  direction:          "flat" as BacklinkTrendDirection,
  scoreDelta:         0,
  backlinkCountDelta: 0,
  latest:             null,
  earliest:           null,
  snapshotCount:      0,
  peakScore:          0,
  avgScore:           0,
});

/**
 * Compute a trend summary from an ordered (oldest-first) array of snapshots.
 * Returns EMPTY_TREND when fewer than 1 snapshot is provided.
 */
export function computeBacklinkScoreTrend(
  snapshots: readonly BacklinkScoreSnapshot[],
): BacklinkScoreTrend {
  if (snapshots.length === 0) return EMPTY_TREND;

  const earliest = snapshots[0]!;
  const latest   = snapshots[snapshots.length - 1]!;

  const scoreDelta         = latest.authorityScore - earliest.authorityScore;
  const backlinkCountDelta = latest.backlinkCount  - earliest.backlinkCount;
  const peakScore          = Math.max(...snapshots.map(s => s.authorityScore));
  const totalScore         = snapshots.reduce((acc, s) => acc + s.authorityScore, 0);
  const avgScore           = Math.round(totalScore / snapshots.length);

  const direction: BacklinkTrendDirection =
    scoreDelta > 0 ? "up"   :
    scoreDelta < 0 ? "down" :
                     "flat";

  return { direction, scoreDelta, backlinkCountDelta, latest, earliest, snapshotCount: snapshots.length, peakScore, avgScore };
}

/**
 * Compute period summaries (7-day, 30-day, 90-day) from an ordered (oldest-first)
 * array of BacklinkScoreSnapshot records.
 *
 * For each period N:
 *  - Baseline: the latest snapshot whose date is ≤ (now − N days).
 *    Falls back to the oldest snapshot if none qualify.
 *  - Latest: the most recent snapshot in the array.
 *  - Deltas: latest − baseline for authority, backlinkCount, referringDomainCount, opportunityCount.
 *  - newBacklinks / lostBacklinks: sum of newCount / lostCount for snapshots AFTER the baseline.
 */
export function computePeriodSummaries(
  snapshots:  readonly BacklinkScoreSnapshot[],
  periodDays: readonly number[] = [7, 30, 90],
  now:        Date              = new Date(),
): BacklinkPeriodSummary[] {
  if (snapshots.length === 0) return [];
  const latest = snapshots[snapshots.length - 1]!;

  return periodDays.map(days => {
    const cutoffDate = new Date(now.getTime() - days * 86_400_000);
    const cutoffStr  = cutoffDate.toISOString().slice(0, 10);

    // Find the latest snapshot on or before the cutoff (scanning from oldest end).
    let baseline: BacklinkScoreSnapshot = snapshots[0]!;
    for (let i = 0; i < snapshots.length; i++) {
      if (snapshots[i]!.snapshotDate <= cutoffStr) {
        baseline = snapshots[i]!;
      } else {
        break;
      }
    }

    const authorityDelta        = latest.authorityScore        - baseline.authorityScore;
    const backlinkDelta         = latest.backlinkCount         - baseline.backlinkCount;
    const referringDomainDelta  = latest.referringDomainCount  - baseline.referringDomainCount;
    const opportunityDelta      = latest.opportunityCount      - baseline.opportunityCount;

    const windowSnapshots = snapshots.filter(s => s.snapshotDate > baseline.snapshotDate);
    const newBacklinks    = windowSnapshots.reduce((a, s) => a + s.newCount,  0);
    const lostBacklinks   = windowSnapshots.reduce((a, s) => a + s.lostCount, 0);

    const direction: BacklinkTrendDirection =
      authorityDelta > 0 ? "up" :
      authorityDelta < 0 ? "down" : "flat";

    return {
      periodDays,
      authorityDelta,
      backlinkDelta,
      referringDomainDelta,
      opportunityDelta,
      newBacklinks,
      lostBacklinks,
      direction,
      snapshotsInWindow: windowSnapshots.length + 1,
    } as unknown as BacklinkPeriodSummary;
  }).map((s, i) => ({ ...s, periodDays: periodDays[i]! }));
}

// ── Run history summary ───────────────────────────────────────────────────────

export interface BacklinkRunHistorySummary {
  readonly totalRuns:               number;
  readonly successRuns:             number;
  readonly failedRuns:              number;
  readonly providerUnavailableRuns: number;
  /** ISO timestamp of most recent succeeded run, or null */
  readonly lastSuccessAt:           string | null;
  /** ISO timestamp of most recent run of any status, or null */
  readonly lastRunAt:               string | null;
  readonly lastRunStatus:           string | null;
  /** ISO timestamp of next scheduled run, or null */
  readonly nextScheduledAt:         string | null;
  readonly consecutiveFailures:     number;
  readonly enabled:                 boolean;
  readonly frequency:               string | null;
}

export const EMPTY_RUN_HISTORY_SUMMARY: BacklinkRunHistorySummary = Object.freeze({
  totalRuns:               0,
  successRuns:             0,
  failedRuns:              0,
  providerUnavailableRuns: 0,
  lastSuccessAt:           null,
  lastRunAt:               null,
  lastRunStatus:           null,
  nextScheduledAt:         null,
  consecutiveFailures:     0,
  enabled:                 false,
  frequency:               null,
});

// ── Formatting helpers (pure, usable in both frontend and backend) ─────────────

/**
 * Format an ISO timestamp as a short relative-time string.
 * Examples: "Just now", "14m ago", "3h ago", "5d ago", "2mo ago", "Never"
 */
export function formatRelativeTime(isoTimestamp: string | Date | null | undefined): string {
  if (!isoTimestamp) return "Never";
  const d = typeof isoTimestamp === "string" ? new Date(isoTimestamp) : isoTimestamp;
  if (isNaN(d.getTime())) return "Unknown";
  const diffMs  = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60)   return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60)   return `${diffMin}m ago`;
  const diffH   = Math.floor(diffMin / 60);
  if (diffH   < 24)   return `${diffH}h ago`;
  const diffD   = Math.floor(diffH   / 24);
  if (diffD   < 30)   return `${diffD}d ago`;
  const diffMo  = Math.floor(diffD   / 30);
  return `${diffMo}mo ago`;
}

/**
 * Human-friendly label for a BacklinkScheduleFrequency value.
 */
export function scheduleFrequencyLabel(frequency: string | null | undefined): string {
  if (!frequency) return "Not set";
  const labels: Record<string, string> = {
    daily:    "Daily",
    weekly:   "Weekly",
    biweekly: "Every 2 Weeks",
  };
  return labels[frequency] ?? frequency;
}

/**
 * Icon, label, and colour for a scheduled run status.
 */
export function scheduledRunStatusConfig(
  status: string | null | undefined,
): { icon: string; label: string; color: string } {
  if (!status) return { icon: "○", label: "Unknown", color: "#475569" };
  const map: Record<string, { icon: string; label: string; color: string }> = {
    succeeded:            { icon: "✓", label: "Succeeded",            color: "#22C55E" },
    failed:               { icon: "✕", label: "Failed",               color: "#EF4444" },
    provider_unavailable: { icon: "⚠", label: "Provider Unavailable", color: "#F59E0B" },
  };
  return map[status] ?? { icon: "○", label: status, color: "#475569" };
}

/**
 * Arrow icon for a trend direction.
 */
export function trendDirectionIcon(direction: BacklinkTrendDirection): string {
  return direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
}

/**
 * Format a numeric score delta as a signed string: "+5" / "-3" / "±0"
 */
export function formatScoreDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "±0";
}

/**
 * Build a minimal SVG sparkline path from an array of y-values.
 * Returns a polyline "points" string usable directly in <polyline points=...>.
 * Normalises values to fit within a (width × height) viewport.
 */
export function buildSparklinePoints(
  values:  readonly number[],
  width:   number,
  height:  number,
): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `0,${height / 2} ${width},${height / 2}`;

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range  = maxVal - minVal || 1;

  const stepX  = width / (values.length - 1);

  return values
    .map((v, i) => {
      const x = Math.round(i * stepX);
      const y = Math.round(height - ((v - minVal) / range) * height);
      return `${x},${y}`;
    })
    .join(" ");
}
