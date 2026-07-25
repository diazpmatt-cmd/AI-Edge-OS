/**
 * C9R-5: AI Visibility Scan History — shared types.
 *
 * Used by api-server routes, the execution service, and the scheduler monitor.
 * All fields intentionally match the DB column names after camelCase conversion
 * so route serialisation is a direct pass-through.
 */

export type AiScanTriggerSource = "manual" | "scheduled";
export type AiScanStatus        = "running" | "completed" | "failed";
export type AiScheduleFrequency = "daily" | "weekly" | "biweekly" | "monthly";

// ── Per-scan history summary (one row per ai_query_scans record) ──────────────

export interface AiScanHistorySummary {
  scanId:                 string;
  clientId:               string;
  triggerSource:          AiScanTriggerSource;
  provider:               string;
  model:                  string;
  status:                 AiScanStatus;
  queryCount:             number;
  completedCount:         number;
  failedCount:            number;
  mentionCount:           number;
  mentionRate:            number;
  competitorMentionCount: number | null;
  citationCount:          number | null;
  startedAt:              string;
  completedAt:            string | null;
  durationMs:             number | null;
  errorMessage:           string | null;
  evidenceHref:           string;
}

// ── Paginated response for history list endpoint ──────────────────────────────

export interface AiScanHistoryPage {
  scans:    AiScanHistorySummary[];
  total:    number;
  page:     number;
  pageSize: number;
  hasMore:  boolean;
}

// ── Schedule configuration row ────────────────────────────────────────────────

export interface AiVisibilityScheduleRow {
  id:                  string;
  clientId:            string;
  enabled:             boolean;
  frequency:           AiScheduleFrequency;
  nextRunAt:           string | null;
  lastRunAt:           string | null;
  lastSuccessAt:       string | null;
  consecutiveFailures: number;
  maxRetries:          number;
  createdAt:           string;
  updatedAt:           string;
}

// ── Scheduler monitor env config ──────────────────────────────────────────────

export interface AiVisibilitySchedulerEnvConfig {
  enabled:     boolean;
  maxPerTick:  number;
}

export function parseAiVisibilitySchedulerEnvConfig(): AiVisibilitySchedulerEnvConfig {
  return {
    enabled:    process.env.AI_VISIBILITY_SCHEDULER_ENABLED === "true",
    maxPerTick: Math.max(1, Math.min(20, parseInt(process.env.AI_VISIBILITY_SCHEDULER_MAX_PER_TICK ?? "5", 10))),
  };
}

// ── Frequency helpers ─────────────────────────────────────────────────────────

const FREQUENCY_MS: Record<AiScheduleFrequency, number> = {
  daily:     24 * 60 * 60 * 1000,
  weekly:     7 * 24 * 60 * 60 * 1000,
  biweekly:  14 * 24 * 60 * 60 * 1000,
  monthly:   30 * 24 * 60 * 60 * 1000,
};

export function calcAiVisibilityNextRunAt(
  frequency: AiScheduleFrequency,
  from: Date,
): Date {
  const ms = FREQUENCY_MS[frequency] ?? FREQUENCY_MS.weekly;
  return new Date(from.getTime() + ms);
}

export function parseAiScheduleFrequency(raw: string): AiScheduleFrequency {
  if (raw === "daily" || raw === "weekly" || raw === "biweekly" || raw === "monthly") {
    return raw;
  }
  return "weekly";
}

// ── Backoff for consecutive failures (matches backlink-scheduler pattern) ─────
//
// Failures are clamped at 8 before exponentiation, giving an effective maximum
// of 2^8 × 60 s = 15 360 000 ms (≈ 256 min / 4.27 h).
//
// NOTE: the outer Math.min(..., 24h) that appeared in earlier versions was dead
// code because 2^8 × 60s < 24h.  It has been removed to avoid misrepresenting
// the actual cap.  The named constant below is the authoritative maximum.

export const AI_VISIBILITY_BACKOFF_MAX_MS = Math.pow(2, 8) * 60 * 1000; // 15 360 000 ms

export function aiVisibilityBackoffMs(consecutiveFailures: number): number {
  const clampedFails = Math.min(consecutiveFailures, 8);
  return Math.pow(2, clampedFails) * 60 * 1000;
}

export function aiVisibilityShouldAutoDisable(
  consecutiveFailures: number,
  maxRetries: number,
): boolean {
  return consecutiveFailures >= maxRetries;
}
