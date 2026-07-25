/**
 * C8R-9 — Backlink Scheduler Configuration
 *
 * Configuration types, frequency management, retry/backoff, and auto-disable
 * logic for the scheduled backlink discovery job infrastructure.
 *
 * Design invariants:
 *   - All frequency values map to a deterministic next-run timestamp.
 *   - Backoff is exponential with a per-attempt cap to prevent runaway delays.
 *   - Auto-disable threshold is configurable per schedule row (maxRetries column).
 *   - No secrets or credentials are stored here.
 *   - All functions are pure (no side effects) to enable unit testing.
 *
 * Environment variables (process-level scheduler behaviour):
 *   BACKLINK_SCHEDULER_ENABLED        "true" to activate the scheduler tick (default: false)
 *   BACKLINK_SCHEDULER_TICK_MS        Tick interval in ms                  (default: 900000 = 15 min)
 *   BACKLINK_SCHEDULER_MAX_PER_TICK   Max rows processed per tick          (default: 5)
 */

// ── Frequency ─────────────────────────────────────────────────────────────────

export type BacklinkScheduleFrequency = "daily" | "weekly" | "biweekly";

export const BACKLINK_SCHEDULE_FREQUENCIES: readonly BacklinkScheduleFrequency[] =
  Object.freeze(["daily", "weekly", "biweekly"]);

/** Duration in hours for each frequency value. */
export const BACKLINK_SCHEDULE_FREQUENCY_HOURS: Record<BacklinkScheduleFrequency, number> =
  Object.freeze({ daily: 24, weekly: 168, biweekly: 336 });

export function isBacklinkScheduleFrequency(value: unknown): value is BacklinkScheduleFrequency {
  return BACKLINK_SCHEDULE_FREQUENCIES.includes(value as BacklinkScheduleFrequency);
}

/**
 * Parse a raw string into a BacklinkScheduleFrequency.
 * Falls back to "weekly" on unrecognised input.
 */
export function parseBacklinkScheduleFrequency(
  raw: string | null | undefined,
): BacklinkScheduleFrequency {
  if (raw && isBacklinkScheduleFrequency(raw)) return raw;
  return "weekly";
}

/**
 * Compute the next scheduled run timestamp from a reference date and frequency.
 * Returns a date exactly `hours` hours after `from`.
 */
export function calcNextRunAt(
  frequency: BacklinkScheduleFrequency,
  from: Date,
): Date {
  const hours = BACKLINK_SCHEDULE_FREQUENCY_HOURS[frequency];
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

// ── Scheduled-run status ──────────────────────────────────────────────────────

export type BacklinkScheduledRunStatus =
  | "succeeded"
  | "failed"
  | "provider_unavailable";

export const BACKLINK_SCHEDULED_RUN_STATUSES: readonly BacklinkScheduledRunStatus[] =
  Object.freeze(["succeeded", "failed", "provider_unavailable"]);

export function isBacklinkScheduledRunStatus(
  value: unknown,
): value is BacklinkScheduledRunStatus {
  return BACKLINK_SCHEDULED_RUN_STATUSES.includes(value as BacklinkScheduledRunStatus);
}

// ── Retry / backoff ───────────────────────────────────────────────────────────

/**
 * Exponential backoff delay in ms for a given consecutive-failure count (1-based).
 *
 * Formula: base × 2^(failures − 1), capped at maxMs.
 * Defaults: 30 min base, 6 h maximum cap.
 *
 * Examples with defaults:
 *   failures = 1 →  30 min
 *   failures = 2 →  60 min
 *   failures = 3 → 120 min
 *   failures = 4 → 240 min
 *   failures ≥ 5 → 360 min (cap)
 */
export function backoffMs(
  consecutiveFailures: number,
  baseMs: number = 30 * 60 * 1000,
  maxMs:  number = 6 * 60 * 60 * 1000,
): number {
  if (consecutiveFailures <= 0) return baseMs;
  const raw = baseMs * Math.pow(2, consecutiveFailures - 1);
  return Math.min(raw, maxMs);
}

/**
 * Returns true when the schedule should be auto-disabled due to repeated failures.
 * Auto-disable fires when consecutiveFailures ≥ maxRetries (minimum 1).
 */
export function shouldAutoDisable(
  consecutiveFailures: number,
  maxRetries: number,
): boolean {
  return consecutiveFailures >= Math.max(1, maxRetries);
}

/**
 * Compute the next retry timestamp from a given reference date and failure count.
 * Returns null when shouldAutoDisable returns true (schedule should be disabled).
 */
export function calcNextRetryAt(
  consecutiveFailures: number,
  maxRetries: number,
  from: Date,
): Date | null {
  if (shouldAutoDisable(consecutiveFailures, maxRetries)) return null;
  return new Date(from.getTime() + backoffMs(consecutiveFailures));
}

// ── Process-level environment config ─────────────────────────────────────────

/** Process-level environment configuration for the backlink scheduler tick. */
export interface BacklinkSchedulerEnvConfig {
  /** Master on/off switch. Defaults to false — safe by design. */
  readonly enabled:        boolean;
  /** Tick interval in ms — how often the monitor queries for due runs. */
  readonly tickIntervalMs: number;
  /** Maximum schedule rows to process per tick. Bounds concurrent load. */
  readonly maxPerTick:     number;
}

export const DEFAULT_BACKLINK_SCHEDULER_CONFIG: Readonly<BacklinkSchedulerEnvConfig> =
  Object.freeze({ enabled: false, tickIntervalMs: 15 * 60 * 1000, maxPerTick: 5 });

export function parseBacklinkSchedulerEnvConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): BacklinkSchedulerEnvConfig {
  function safeInt(raw: string | undefined, fallback: number): number {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }
  return {
    enabled:        env["BACKLINK_SCHEDULER_ENABLED"] === "true",
    tickIntervalMs: safeInt(env["BACKLINK_SCHEDULER_TICK_MS"],      DEFAULT_BACKLINK_SCHEDULER_CONFIG.tickIntervalMs),
    maxPerTick:     safeInt(env["BACKLINK_SCHEDULER_MAX_PER_TICK"], DEFAULT_BACKLINK_SCHEDULER_CONFIG.maxPerTick),
  };
}

// ── Retention policy ──────────────────────────────────────────────────────────

/** Maximum age in days for backlink_score_history rows before pruning. */
export const BACKLINK_SCORE_HISTORY_RETENTION_DAYS = 90;

/**
 * Returns the oldest snapshot date to retain (90 days ago from `now`).
 * Rows with snapshot_date older than this should be pruned.
 */
export function scoreHistoryRetentionCutoff(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - BACKLINK_SCORE_HISTORY_RETENTION_DAYS);
  return d;
}
