/**
 * Phase C7 — Discovery Schedule Model (Pure Logic)
 *
 * Defines canonical types, FSM transitions, ID derivation, and next-run
 * calculation for tenant-scoped discovery schedules.
 *
 * No IO. No external API calls. All functions are deterministic.
 * Uses croner for cron-expression parsing + IANA timezone handling via Intl.
 * Do not use Math.random(). Clocks are injectable for testing.
 */

import { createHash } from "node:crypto";
import { Cron } from "croner";

// ── Schedule status (lifecycle FSM) ──────────────────────────────────────────

/**
 * Canonical lifecycle states for a discovery schedule.
 *
 *   active       — normal state; eligible for dispatch
 *   paused       — temporarily halted; configuration preserved; no dispatch
 *   disabled     — administratively off; can be re-enabled
 *   archived     — terminal; cannot be reactivated
 *   error_blocked — repeated failures exceeded threshold; requires manual action
 */
export type ScheduleStatus =
  | "active"
  | "paused"
  | "disabled"
  | "archived"
  | "error_blocked";

// ── FSM transition table ───────────────────────────────────────────────────────

const SCHEDULE_TRANSITIONS: Readonly<Record<ScheduleStatus, ReadonlySet<ScheduleStatus>>> = {
  active:        new Set<ScheduleStatus>(["paused", "disabled", "error_blocked"]),
  paused:        new Set<ScheduleStatus>(["active", "disabled", "archived"]),
  disabled:      new Set<ScheduleStatus>(["active", "archived"]),
  error_blocked: new Set<ScheduleStatus>(["paused", "disabled"]),
  archived:      new Set<ScheduleStatus>(),
};

export function validateScheduleTransition(
  from: ScheduleStatus,
  to:   ScheduleStatus,
): boolean {
  return SCHEDULE_TRANSITIONS[from].has(to);
}

export function allowedScheduleNextStates(from: ScheduleStatus): ScheduleStatus[] {
  return Array.from(SCHEDULE_TRANSITIONS[from]);
}

export function isScheduleTerminal(status: ScheduleStatus): boolean {
  return status === "archived";
}

export function isScheduleEligibleForDispatch(status: ScheduleStatus): boolean {
  return status === "active";
}

// ── Occurrence status ─────────────────────────────────────────────────────────

export type OccurrenceStatus =
  | "pending"
  | "dispatched"
  | "running"
  | "complete"
  | "failed"
  | "skipped"
  | "cancelled";

// ── Policy types ──────────────────────────────────────────────────────────────

/** What to do when the previous occurrence is still running. */
export type OverlapPolicy = "skip" | "queue_one" | "allow";

/** What to do with missed occurrences after downtime. */
export type CatchUpPolicy = "skip_missed" | "run_latest" | "run_all_bounded";

/**
 * Classifies a schedule failure for failure-policy bookkeeping.
 * Only counted failures affect consecutiveFailures; skipped occurrences do not.
 */
export type FailureCategory =
  | "transient_provider"
  | "permanent_provider"
  | "budget_denied"
  | "governance_denied"
  | "config_invalid"
  | "auth_failed"
  | "persistence_failed"
  | "cancelled"
  | "skipped_overlap";

/** Whether a failure category counts toward the consecutive-failure threshold. */
export function isCountableFailure(category: FailureCategory): boolean {
  return category !== "skipped_overlap" && category !== "cancelled";
}

// ── Schedule model ────────────────────────────────────────────────────────────

export interface DiscoverySchedule {
  id:                  string;
  clientId:            string;
  name:                string;
  status:              ScheduleStatus;
  executionMode:       "live" | "dry";
  cronExpr:            string;
  timezone:            string;
  nextRunAt:           Date | null;
  lastRunAt:           Date | null;
  lastSuccessAt:       Date | null;
  consecutiveFailures: number;
  maxCostPerRunUsd:    number;
  maxRequestsPerRun:   number;
  catchUpPolicy:       CatchUpPolicy;
  maxCatchUpCount:     number;
  overlapPolicy:       OverlapPolicy;
  pauseReason:         string | null;
  contextSnapshot:     Record<string, unknown> | null;
  providerPolicy:      Record<string, unknown> | null;
  createdBy:           string | null;
  updatedBy:           string | null;
  createdAt:           Date;
  updatedAt:           Date;
  version:             number;
}

// ── Occurrence model ──────────────────────────────────────────────────────────

export interface ScheduleOccurrence {
  id:                    string;
  scheduleId:            string;
  clientId:              string;
  intendedAt:            Date;
  status:                OccurrenceStatus;
  runId:                 string | null;
  idempotencyKey:        string | null;
  catchUpReason:         string | null;
  overlapPolicyApplied:  string | null;
  skipReason:            string | null;
  claimedBy:             string | null;
  claimedAt:             Date | null;
  claimExpiresAt:        Date | null;
  dispatchCorrelationId: string | null;
  scheduleVersion:       number | null;
  createdAt:             Date;
  updatedAt:             Date;
}

// ── Leadership model ──────────────────────────────────────────────────────────

export const SCHEDULER_LEADER_ID = "discovery_scheduler" as const;

export interface SchedulerLeadershipRecord {
  leaderId:   typeof SCHEDULER_LEADER_ID;
  ownerId:    string;
  acquiredAt: Date;
  expiresAt:  Date;
  releasedAt: Date | null;
  hostInfo:   string | null;
}

export type LeadershipAcquireResult =
  | { acquired: true;  ownerId: string; expiresAt: Date }
  | { acquired: false; currentOwnerId: string; expiresAt: Date };

// ── ID derivation ─────────────────────────────────────────────────────────────

/**
 * Deterministic schedule ID.
 * Format: "sched::{clientId}::{sha256(name)[:12]}"
 * Collision-resistant within a client. Name changes → new ID (by design: immutable).
 */
export function deriveScheduleId(clientId: string, name: string): string {
  const hash = createHash("sha256").update(`${clientId}::${name}`).digest("hex");
  return `sched::${clientId}::${hash.slice(0, 12)}`;
}

/**
 * Deterministic occurrence ID.
 * Format: "occ::{scheduleId}::{intendedAt.getTime()}"
 * The UNIQUE(schedule_id, intended_at) DB constraint prevents duplicates.
 */
export function deriveOccurrenceId(scheduleId: string, intendedAt: Date): string {
  return `occ::${scheduleId}::${intendedAt.getTime()}`;
}

/**
 * Deterministic occurrence idempotency key used with the C6 idempotency boundary.
 * Encodes schedule, time, mode, and version so that:
 *   - Multiple dispatcher instances converge on one run.
 *   - A schedule revision produces a different key (preventing silent collisions).
 *   - Dry/live schedules are always distinct.
 * Format: "sched_occ::{scheduleId}::{intendedAt_ms}::{mode}::{version}"
 */
export function deriveOccurrenceIdempotencyKey(
  scheduleId:    string,
  intendedAt:    Date,
  executionMode: "live" | "dry",
  version:       number,
): string {
  return `sched_occ::${scheduleId}::${intendedAt.getTime()}::${executionMode}::${version}`;
}

/**
 * Deterministic leadership owner ID for a correlation/correlation ID pair.
 * Format: "sched_leader::{sha256(correlationId)[:16]}"
 */
export function deriveSchedulerOwnerId(correlationId: string): string {
  const hash = createHash("sha256").update(correlationId).digest("hex");
  return `sched_leader::${hash.slice(0, 16)}`;
}

// ── Cron + timezone validation ────────────────────────────────────────────────

/**
 * Validates that a string is a recognized IANA timezone identifier.
 * Uses the Intl API — does not depend on process-local timezone.
 * Returns false for null, undefined, empty string, or unrecognized values.
 */
export function isValidScheduleTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.trim() === "") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a cron expression using croner.
 * Returns an error message string if invalid, null if valid.
 * Croner supports standard 5-field (min hour dom month dow) and
 * 6-field (with seconds) cron syntax.
 */
export function validateCronExpression(expr: unknown): string | null {
  if (typeof expr !== "string" || expr.trim() === "") {
    return "Cron expression must be a non-empty string";
  }
  try {
    const job = new Cron(expr.trim(), { legacyMode: false });
    job.nextRun();
    return null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Invalid cron expression: ${msg}`;
  }
}

// ── Next-run calculation ──────────────────────────────────────────────────────

/**
 * Calculates the next occurrence of a cron schedule after `after`.
 *
 * DST policy:
 *   spring-forward (nonexistent local time): croner advances to the next valid
 *   local time after the gap, preventing duplicate execution.
 *
 *   fall-back (repeated local time): croner executes on the first occurrence
 *   of the repeated hour, then advances normally — prevents double-execution.
 *
 * Persisted timestamps are always UTC. The timezone parameter controls only
 * which wall-clock interpretation is used when matching cron fields.
 *
 * @param cronExpr  Validated cron expression (5 or 6 fields)
 * @param timezone  IANA timezone string (must be validated before calling)
 * @param after     The reference point; next run is strictly AFTER this time
 * @returns         UTC Date of next occurrence, or null if none (e.g. past end-of-year)
 */
export function calculateNextRun(
  cronExpr: string,
  timezone: string,
  after:    Date,
): Date | null {
  try {
    const job = new Cron(cronExpr.trim(), {
      timezone,
      legacyMode: false,
    });
    const next = job.nextRun(after);
    return next ?? null;
  } catch {
    return null;
  }
}

/**
 * Generates the ordered list of occurrence timestamps between `windowStart`
 * (exclusive) and `windowEnd` (inclusive), up to `maxCount`.
 *
 * Used to enumerate missed occurrences during catch-up.
 * Returned in ascending chronological order.
 */
export function enumerateCronOccurrences(
  cronExpr:    string,
  timezone:    string,
  windowStart: Date,
  windowEnd:   Date,
  maxCount:    number,
): Date[] {
  const results: Date[] = [];
  let cursor = windowStart;

  for (let i = 0; i < maxCount + 1; i++) {
    const next = calculateNextRun(cronExpr, timezone, cursor);
    if (!next || next > windowEnd) break;
    results.push(next);
    cursor = next;
    if (results.length >= maxCount) break;
  }

  return results;
}

// ── Catch-up occurrence resolution ───────────────────────────────────────────

export interface CatchUpResolution {
  occurrencesToDispatch: Date[];
  skippedCount:          number;
  reason:                string;
}

/**
 * Given a schedule whose `nextRunAt` is in the past (i.e. missed occurrences
 * exist between lastRunAt and now), resolves the list of occurrences to dispatch
 * according to the catch-up policy.
 *
 * @param schedule    The schedule being evaluated
 * @param now         Current wall-clock time (injectable for testing)
 */
export function resolveCatchUp(
  schedule: Pick<DiscoverySchedule, "cronExpr" | "timezone" | "catchUpPolicy" | "maxCatchUpCount" | "nextRunAt" | "lastRunAt">,
  now:      Date,
): CatchUpResolution {
  const windowStart = schedule.lastRunAt ?? new Date(0);
  const windowEnd   = now;

  if (!schedule.nextRunAt || schedule.nextRunAt > now) {
    return { occurrencesToDispatch: [], skippedCount: 0, reason: "no_missed" };
  }

  const missed = enumerateCronOccurrences(
    schedule.cronExpr,
    schedule.timezone,
    windowStart,
    windowEnd,
    (schedule.maxCatchUpCount ?? 3) + 1, // +1 to detect overflow
  );

  switch (schedule.catchUpPolicy) {
    case "skip_missed":
      return {
        occurrencesToDispatch: [],
        skippedCount:          missed.length,
        reason:                "skip_missed",
      };

    case "run_latest": {
      if (missed.length === 0) return { occurrencesToDispatch: [], skippedCount: 0, reason: "no_missed" };
      const latest = missed[missed.length - 1]!;
      return {
        occurrencesToDispatch: [latest],
        skippedCount:          missed.length - 1,
        reason:                "run_latest",
      };
    }

    case "run_all_bounded": {
      const max    = schedule.maxCatchUpCount ?? 3;
      const bounded = missed.slice(0, max);
      return {
        occurrencesToDispatch: bounded,
        skippedCount:          Math.max(0, missed.length - bounded.length),
        reason:                "run_all_bounded",
      };
    }

    default:
      return { occurrencesToDispatch: [], skippedCount: missed.length, reason: "unknown_policy" };
  }
}

// ── Schedule validation ───────────────────────────────────────────────────────

export interface ScheduleValidationError {
  field:   string;
  message: string;
}

export interface ScheduleValidationResult {
  valid:  boolean;
  errors: ScheduleValidationError[];
}

export function validateScheduleInput(input: {
  name?:             unknown;
  cronExpr?:         unknown;
  timezone?:         unknown;
  executionMode?:    unknown;
  maxCostPerRunUsd?: unknown;
  maxRequestsPerRun?:unknown;
  catchUpPolicy?:    unknown;
  overlapPolicy?:    unknown;
  maxCatchUpCount?:  unknown;
}): ScheduleValidationResult {
  const errors: ScheduleValidationError[] = [];

  if (!input.name || typeof input.name !== "string" || input.name.trim().length === 0) {
    errors.push({ field: "name", message: "Name must be a non-empty string" });
  } else if (input.name.length > 200) {
    errors.push({ field: "name", message: "Name must be ≤200 characters" });
  }

  const cronErr = validateCronExpression(input.cronExpr);
  if (cronErr) errors.push({ field: "cronExpr", message: cronErr });

  if (!isValidScheduleTimezone(input.timezone)) {
    errors.push({ field: "timezone", message: "timezone must be a valid IANA timezone identifier" });
  }

  if (input.executionMode !== "live" && input.executionMode !== "dry") {
    errors.push({ field: "executionMode", message: 'executionMode must be "live" or "dry"' });
  }

  if (input.maxCostPerRunUsd !== undefined) {
    const cost = Number(input.maxCostPerRunUsd);
    if (isNaN(cost) || cost < 0 || cost > 100) {
      errors.push({ field: "maxCostPerRunUsd", message: "maxCostPerRunUsd must be a number between 0 and 100" });
    }
  }

  if (input.maxRequestsPerRun !== undefined) {
    const reqs = Number(input.maxRequestsPerRun);
    if (isNaN(reqs) || !Number.isInteger(reqs) || reqs < 1 || reqs > 10000) {
      errors.push({ field: "maxRequestsPerRun", message: "maxRequestsPerRun must be an integer between 1 and 10000" });
    }
  }

  const validCatchUp: CatchUpPolicy[] = ["skip_missed", "run_latest", "run_all_bounded"];
  if (input.catchUpPolicy !== undefined && !validCatchUp.includes(input.catchUpPolicy as CatchUpPolicy)) {
    errors.push({ field: "catchUpPolicy", message: `catchUpPolicy must be one of: ${validCatchUp.join(", ")}` });
  }

  const validOverlap: OverlapPolicy[] = ["skip", "queue_one", "allow"];
  if (input.overlapPolicy !== undefined && !validOverlap.includes(input.overlapPolicy as OverlapPolicy)) {
    errors.push({ field: "overlapPolicy", message: `overlapPolicy must be one of: ${validOverlap.join(", ")}` });
  }

  if (input.maxCatchUpCount !== undefined) {
    const n = Number(input.maxCatchUpCount);
    if (isNaN(n) || !Number.isInteger(n) || n < 1 || n > 50) {
      errors.push({ field: "maxCatchUpCount", message: "maxCatchUpCount must be an integer between 1 and 50" });
    }
  }

  return { valid: errors.length === 0, errors };
}
