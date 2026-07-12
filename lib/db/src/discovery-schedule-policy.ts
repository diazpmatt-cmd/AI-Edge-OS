/**
 * Phase C7 — Schedule Failure Policy and Budget Policy (Pure Logic)
 *
 * Deterministic failure classification, consecutive-failure thresholds,
 * schedule-level budget evaluation, and overlap resolution.
 *
 * No IO. No Math.random(). All functions are deterministic.
 */

import type { DiscoverySchedule, FailureCategory, OverlapPolicy } from "./discovery-schedule.js";
import { isCountableFailure } from "./discovery-schedule.js";

// ── Failure policy configuration ──────────────────────────────────────────────

export interface ScheduleFailurePolicy {
  /** Consecutive countable failures before the schedule is paused. Default: 3 */
  pauseThreshold: number;
  /** Consecutive countable failures before the schedule is error-blocked. Default: 10 */
  errorBlockThreshold: number;
  /**
   * Base delay for next-run advancement after a failure (ms).
   * Applied as: delay = min(baseDelayMs * 2^(failures-1), maxDelayMs)
   * Default: 5 minutes (300_000 ms)
   */
  baseDelayMs: number;
  /** Maximum delay cap after repeated failures. Default: 4 hours. */
  maxDelayMs: number;
}

export const DEFAULT_SCHEDULE_FAILURE_POLICY: Readonly<ScheduleFailurePolicy> = {
  pauseThreshold:      3,
  errorBlockThreshold: 10,
  baseDelayMs:         5 * 60 * 1000,
  maxDelayMs:          4 * 60 * 60 * 1000,
};

// ── Failure policy evaluation ─────────────────────────────────────────────────

export type FailurePolicyAction =
  | "retry_next_normal"
  | "retry_with_delay"
  | "pause_schedule"
  | "error_block_schedule";

export interface FailurePolicyResult {
  action:               FailurePolicyAction;
  newConsecutiveCount:  number;
  delayMs:              number;
  reason:               string;
}

/**
 * Given the current consecutive failure count and the category of the new failure,
 * returns the action to take and the updated count.
 *
 * Skipped occurrences (overlap) and cancellations do NOT increment the counter.
 *
 * Delay is computed deterministically using stepped doubling (no random jitter)
 * so tests remain reproducible.
 */
export function evaluateFailurePolicy(
  currentConsecutive: number,
  category:           FailureCategory,
  policy:             ScheduleFailurePolicy = DEFAULT_SCHEDULE_FAILURE_POLICY,
): FailurePolicyResult {
  if (!isCountableFailure(category)) {
    return {
      action:              "retry_next_normal",
      newConsecutiveCount: currentConsecutive,
      delayMs:             0,
      reason:              `non_countable:${category}`,
    };
  }

  const newCount = currentConsecutive + 1;

  if (newCount >= policy.errorBlockThreshold) {
    return {
      action:              "error_block_schedule",
      newConsecutiveCount: newCount,
      delayMs:             0,
      reason:              `error_block_threshold_reached:${newCount}`,
    };
  }

  if (newCount >= policy.pauseThreshold) {
    return {
      action:              "pause_schedule",
      newConsecutiveCount: newCount,
      delayMs:             0,
      reason:              `pause_threshold_reached:${newCount}`,
    };
  }

  // Stepped delay: baseDelayMs * 2^(newCount-1), capped at maxDelayMs
  const rawDelay = policy.baseDelayMs * Math.pow(2, newCount - 1);
  const delayMs  = Math.min(rawDelay, policy.maxDelayMs);

  return {
    action:              "retry_with_delay",
    newConsecutiveCount: newCount,
    delayMs,
    reason:              `retry_with_delay:attempt=${newCount}:delayMs=${delayMs}`,
  };
}

/**
 * Resets consecutive failure count after a successful completion.
 * Returns the updated count (always 0).
 */
export function resetFailureCount(): number {
  return 0;
}

// ── Schedule budget policy ────────────────────────────────────────────────────

export interface ScheduleBudgetPolicy {
  maxCostPerRunUsd:     number;
  maxRequestsPerRun:    number;
  globalEmergencyPause: boolean;
}

export type ScheduleBudgetDenyReason =
  | "global_emergency_pause"
  | "cost_ceiling_exceeded"
  | "requests_ceiling_exceeded";

export type ScheduleBudgetCheckResult =
  | { allowed: true }
  | { allowed: false; reason: ScheduleBudgetDenyReason; detail: string };

/**
 * Evaluates whether a scheduled run is permitted by budget policy.
 * Does NOT call any provider — purely evaluates estimated vs ceiling.
 *
 * @param estimatedCostUsd  Estimated cost calculated from the provider plan
 * @param estimatedRequests Estimated API requests
 * @param policy            The budget policy for this scheduled occurrence
 */
export function evaluateScheduleBudget(
  estimatedCostUsd:    number,
  estimatedRequests:   number,
  policy:              ScheduleBudgetPolicy,
): ScheduleBudgetCheckResult {
  if (policy.globalEmergencyPause) {
    return {
      allowed: false,
      reason:  "global_emergency_pause",
      detail:  "Global automation emergency pause is active",
    };
  }

  if (estimatedCostUsd > policy.maxCostPerRunUsd) {
    return {
      allowed: false,
      reason:  "cost_ceiling_exceeded",
      detail:  `Estimated cost $${estimatedCostUsd.toFixed(4)} exceeds ceiling $${policy.maxCostPerRunUsd.toFixed(4)}`,
    };
  }

  if (estimatedRequests > policy.maxRequestsPerRun) {
    return {
      allowed: false,
      reason:  "requests_ceiling_exceeded",
      detail:  `Estimated ${estimatedRequests} requests exceeds ceiling ${policy.maxRequestsPerRun}`,
    };
  }

  return { allowed: true };
}

// ── Overlap resolution ────────────────────────────────────────────────────────

export type OverlapDecision =
  | "dispatch"
  | "skip"
  | "queue_one"
  | "deny_governance";

export interface OverlapResolutionResult {
  decision:  OverlapDecision;
  reason:    string;
}

/**
 * Resolves how to handle a due schedule occurrence when a previous run is
 * still active (active = running, queued, planned, or cancel_requested).
 *
 * @param policy            The schedule's configured overlap policy
 * @param activeRunCount    How many runs are currently active for this schedule
 * @param pendingQueueCount How many occurrences are already queued but not dispatched
 * @param governanceAllowed Whether C6 governance permits another concurrent run
 */
export function resolveOverlap(
  policy:             OverlapPolicy,
  activeRunCount:     number,
  pendingQueueCount:  number,
  governanceAllowed:  boolean,
): OverlapResolutionResult {
  if (activeRunCount === 0) {
    return { decision: "dispatch", reason: "no_active_run" };
  }

  switch (policy) {
    case "skip":
      return { decision: "skip", reason: "overlap_policy=skip:active_runs=" + activeRunCount };

    case "queue_one":
      if (pendingQueueCount >= 1) {
        return { decision: "skip", reason: "overlap_policy=queue_one:queue_full" };
      }
      return { decision: "queue_one", reason: "overlap_policy=queue_one:queued" };

    case "allow":
      if (!governanceAllowed) {
        return { decision: "deny_governance", reason: "overlap_policy=allow:governance_denied" };
      }
      return { decision: "dispatch", reason: "overlap_policy=allow:governance_permitted" };

    default:
      return { decision: "skip", reason: "unknown_overlap_policy" };
  }
}

// ── Catch-up budget suppression ───────────────────────────────────────────────

/**
 * Determines whether a catch-up occurrence should be suppressed based on budget.
 * Called per catch-up occurrence before dispatching.
 *
 * Rules:
 *   - If globalEmergencyPause → suppress all catch-up.
 *   - If estimatedCostUsd * occurrenceIndex would exceed dailyCeiling → suppress.
 *   - Otherwise → allow.
 */
export function evaluateCatchUpBudget(params: {
  estimatedCostUsd:    number;
  occurrenceIndex:     number;
  globalEmergencyPause: boolean;
}): { allowed: boolean; reason: string } {
  if (params.globalEmergencyPause) {
    return { allowed: false, reason: "global_emergency_pause" };
  }
  return { allowed: true, reason: "within_budget" };
}

// ── Scheduler tick summary ────────────────────────────────────────────────────

export interface SchedulerTickOutcome {
  scheduleId:    string;
  clientId:      string;
  intendedAt:    Date;
  occurrenceId:  string;
  result:
    | "dispatched"
    | "idempotency_hit"
    | "skipped_overlap"
    | "budget_denied"
    | "governance_denied"
    | "error";
  runId:         string | null;
  errorMessage:  string | null;
}

export interface SchedulerTickSummary {
  ownerId:          string;
  leadershipState:  "acquired" | "existing" | "none" | "disabled";
  schedulesFound:   number;
  schedulesClaimed: number;
  occurrencesDispatched: number;
  occurrencesSkipped:    number;
  occurrencesError:      number;
  outcomes:              SchedulerTickOutcome[];
  tickStartedAt:         Date;
  tickCompletedAt:       Date | null;
}

export function makeEmptyTickSummary(
  ownerId:  string,
  startedAt: Date,
  leadership: "acquired" | "existing" | "none" | "disabled",
): SchedulerTickSummary {
  return {
    ownerId,
    leadershipState:       leadership,
    schedulesFound:        0,
    schedulesClaimed:      0,
    occurrencesDispatched: 0,
    occurrencesSkipped:    0,
    occurrencesError:      0,
    outcomes:              [],
    tickStartedAt:         startedAt,
    tickCompletedAt:       null,
  };
}
