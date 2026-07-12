/**
 * C7 Discovery Scheduler — Single-Tick Executor
 *
 * `runSchedulerTick()` is directly testable — no timers, no side effects beyond
 * DB writes. The runtime loop (`discovery-scheduler-runtime.ts`) calls this on
 * a setInterval; tests call it directly with mocked deps.
 *
 * Tick sequence:
 *   1. Acquire (or renew) scheduler leadership — only one instance runs per tick.
 *   2. Find schedules with next_run_at <= now (bounded by maxSchedulesPerTick).
 *   3. For each schedule: atomically advance next_run_at (optimistic lock).
 *      Only the winning instance proceeds to dispatch.
 *   4. Determine occurrences to dispatch (catch-up policy applied when missed > 1).
 *   5. Insert each occurrence (UNIQUE constraint prevents duplicates) and dispatch.
 *   6. Run stale-claim recovery scan.
 *   7. Return structured SchedulerTickSummary.
 */

import {
  pool as defaultPool,
  deriveSchedulerOwnerId,
  acquireSchedulerLeadership,
  findDueSchedules,
  atomicAdvanceScheduleNextRun,
  insertOccurrence,
  updateOccurrenceStatus,
  findStaleClaimedOccurrences,
  releaseStaleOccurrenceClaim,
  calculateNextRun,
  enumerateCronOccurrences,
  resolveCatchUp,
  deriveOccurrenceId,
  deriveOccurrenceIdempotencyKey,
} from "@workspace/db";
import type {
  DiscoverySchedule,
  ScheduleOccurrence,
  DiscoveryContext,
  SchedulerTickSummary,
  SchedulerTickOutcome,
} from "@workspace/db";
import { makeEmptyTickSummary } from "@workspace/db";
import type { SchedulerAutomationConfig } from "./discovery-scheduler-config.js";
import { ScheduledDispatcher } from "./discovery-scheduler-dispatcher.js";
import type { DiscoveryExecutionService } from "./discovery-execution-service.js";

type Pool = typeof defaultPool;

// ── Tick input ─────────────────────────────────────────────────────────────────

export interface SchedulerTickInput {
  pool:             Pool;
  config:           SchedulerAutomationConfig;
  executionService: DiscoveryExecutionService;
  ownerId:          string;
  now?:             Date;
  /**
   * Injectable context resolver. Defaults to the real resolver in production.
   * Override in tests with a mock that returns a DiscoveryContext synchronously.
   */
  contextResolver?: (clientId: string, now: Date) => Promise<DiscoveryContext | null>;
}

// ── Main tick ──────────────────────────────────────────────────────────────────

export async function runSchedulerTick(
  input: SchedulerTickInput,
): Promise<SchedulerTickSummary> {
  const {
    pool, config, executionService, ownerId,
    contextResolver = defaultContextResolver,
  } = input;
  const now = input.now ?? new Date();

  // ── Step 1: Acquire leadership ─────────────────────────────────────────────
  let leadershipState: SchedulerTickSummary["leadershipState"] = "none";

  const leaderResult = await acquireSchedulerLeadership(
    pool, ownerId, config.leadershipTtlMs, now,
  ).catch((err: unknown) => {
    console.error("[SCHEDULER-TICK] leadership acquisition failed:", err instanceof Error ? err.message : String(err));
    return null;
  });

  if (!leaderResult) {
    const summary = makeEmptyTickSummary(ownerId, now, "none");
    summary.tickCompletedAt = new Date();
    return summary;
  }

  if (!leaderResult.acquired) {
    const summary = makeEmptyTickSummary(ownerId, now, "none");
    summary.tickCompletedAt = new Date();
    return summary;
  }

  leadershipState = "acquired";
  const summary = makeEmptyTickSummary(ownerId, now, leadershipState);

  // ── Step 2: Find due schedules ─────────────────────────────────────────────
  let dueSchedules: DiscoverySchedule[];
  try {
    dueSchedules = await findDueSchedules(pool, now, config.maxSchedulesPerTick);
  } catch (err: unknown) {
    console.error("[SCHEDULER-TICK] findDueSchedules failed:", err instanceof Error ? err.message : String(err));
    summary.tickCompletedAt = new Date();
    return summary;
  }

  summary.schedulesFound = dueSchedules.length;

  // ── Step 3–5: Claim and dispatch each schedule ─────────────────────────────
  const dispatcher = new ScheduledDispatcher(pool, executionService);

  for (const schedule of dueSchedules) {
    if (!schedule.nextRunAt) continue;

    // Compute new next_run_at BEFORE atomic claim
    const newNextRunAt = calculateNextRun(schedule.cronExpr, schedule.timezone, now);

    // Atomic advance — only ONE instance wins per schedule per tick
    let claimed: DiscoverySchedule | null;
    try {
      claimed = await atomicAdvanceScheduleNextRun(
        pool, schedule.clientId, schedule.id, schedule.nextRunAt, newNextRunAt,
      );
    } catch (err: unknown) {
      console.error(
        `[SCHEDULER-TICK] atomicAdvance failed for schedule=${schedule.id}:`,
        err instanceof Error ? err.message : String(err),
      );
      continue;
    }

    if (!claimed) {
      continue;
    }

    summary.schedulesClaimed += 1;

    // Determine occurrences to dispatch (catch-up logic)
    const occurrenceDates = resolveOccurrenceDates(schedule, now);

    for (const intendedAt of occurrenceDates) {
      const occurrenceId    = deriveOccurrenceId(schedule.id, intendedAt);
      const idempotencyKey  = deriveOccurrenceIdempotencyKey(
        schedule.id, intendedAt, schedule.executionMode, schedule.version,
      );

      const occurrence: ScheduleOccurrence = {
        id:                    occurrenceId,
        scheduleId:            schedule.id,
        clientId:              schedule.clientId,
        intendedAt,
        status:                "pending",
        runId:                 null,
        idempotencyKey,
        catchUpReason:         occurrenceDates.length > 1 ? schedule.catchUpPolicy : null,
        overlapPolicyApplied:  null,
        skipReason:            null,
        claimedBy:             ownerId,
        claimedAt:             now,
        claimExpiresAt:        new Date(now.getTime() + config.claimTtlMs),
        dispatchCorrelationId: occurrenceId,
        scheduleVersion:       schedule.version,
        createdAt:             now,
        updatedAt:             now,
      };

      // Insert occurrence — UNIQUE(schedule_id, intended_at) prevents duplicates
      let inserted: boolean;
      try {
        const result = await insertOccurrence(pool, occurrence);
        inserted = result.inserted;
      } catch (err: unknown) {
        console.error(
          `[SCHEDULER-TICK] insertOccurrence failed for schedule=${schedule.id}:`,
          err instanceof Error ? err.message : String(err),
        );
        continue;
      }

      if (!inserted) {
        // Another instance already inserted this occurrence — skip
        summary.occurrencesSkipped += 1;
        summary.outcomes.push({
          scheduleId:   schedule.id,
          clientId:     schedule.clientId,
          intendedAt,
          occurrenceId,
          result:       "idempotency_hit",
          runId:        null,
          errorMessage: null,
        });
        continue;
      }

      // Dispatch
      const outcome: SchedulerTickOutcome = {
        scheduleId:   schedule.id,
        clientId:     schedule.clientId,
        intendedAt,
        occurrenceId,
        result:       "dispatched",
        runId:        null,
        errorMessage: null,
      };

      try {
        const dispatchResult = await dispatcher.dispatch({
          schedule,
          occurrence: { ...occurrence, status: "pending" },
          now,
          dryRunOverride: config.dryRunOverride,
          contextResolver,
        });

        switch (dispatchResult.result) {
          case "dispatched":
            outcome.result = "dispatched";
            outcome.runId  = dispatchResult.runId;
            summary.occurrencesDispatched += 1;
            break;
          case "lease_denied":
            outcome.result = "skipped_overlap";
            summary.occurrencesSkipped += 1;
            break;
          case "context_failed":
            outcome.result       = "error";
            outcome.errorMessage = dispatchResult.reason;
            summary.occurrencesError += 1;
            break;
          case "error":
            outcome.result       = "error";
            outcome.errorMessage = dispatchResult.message;
            summary.occurrencesError += 1;
            break;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[SCHEDULER-TICK] dispatch threw for occurrence=${occurrenceId}:`, msg,
        );
        outcome.result       = "error";
        outcome.errorMessage = msg;
        summary.occurrencesError += 1;
      }

      summary.outcomes.push(outcome);
    }
  }

  // ── Step 6: Stale-claim recovery ───────────────────────────────────────────
  await recoverStaleOccurrences(pool, now).catch((err: unknown) => {
    console.error("[SCHEDULER-TICK] stale claim recovery failed:", err instanceof Error ? err.message : String(err));
  });

  summary.tickCompletedAt = new Date();
  return summary;
}

// ── Stale-claim recovery ───────────────────────────────────────────────────────

/**
 * Finds claimed occurrences whose claim_expires_at has passed and releases
 * the claim so they can be re-dispatched on the next tick.
 *
 * Never replays chargeable provider calls — releasing the claim only allows
 * the next tick to re-evaluate; the C6 idempotency boundary prevents duplicate
 * provider execution for the same run.
 *
 * @returns count of stale claims released
 */
export async function recoverStaleOccurrences(
  pool: Pool,
  now:  Date,
): Promise<number> {
  const stale = await findStaleClaimedOccurrences(pool, now);
  let released = 0;

  for (const occ of stale) {
    try {
      await releaseStaleOccurrenceClaim(pool, occ.id);
      released += 1;
    } catch (err: unknown) {
      console.error(
        `[SCHEDULER-TICK] failed to release stale claim for occurrence=${occ.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return released;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Determines the set of occurrence timestamps to dispatch for a claimed schedule.
 *
 * Normal tick (no downtime):
 *   lastRunAt is recent → only one missed occurrence = schedule.nextRunAt → always dispatch it.
 *
 * Catch-up (extended downtime):
 *   Multiple missed occurrences exist → apply schedule.catchUpPolicy:
 *     skip_missed     → dispatch none of the old ones; just advance (returns [])
 *     run_latest      → dispatch only the most recent missed occurrence
 *     run_all_bounded → dispatch up to maxCatchUpCount missed occurrences
 */
function resolveOccurrenceDates(
  schedule: DiscoverySchedule,
  now:      Date,
): Date[] {
  if (!schedule.nextRunAt) return [];

  if (schedule.lastRunAt === null) {
    return [schedule.nextRunAt];
  }

  const missed = enumerateCronOccurrences(
    schedule.cronExpr,
    schedule.timezone,
    schedule.lastRunAt,
    now,
    schedule.maxCatchUpCount + 1,
  );

  if (missed.length <= 1) {
    return missed.length === 1 ? [missed[0]!] : [schedule.nextRunAt];
  }

  const catchUp = resolveCatchUp(schedule, now);
  return catchUp.occurrencesToDispatch;
}

/**
 * Default real-world context resolver — uses the client resolver that queries
 * the DB by clientId. Imported lazily to avoid circular imports at module load.
 */
async function defaultContextResolver(
  clientId: string,
  now: Date,
): Promise<DiscoveryContext | null> {
  const { resolveDiscoveryContextByClientId } = await import(
    "./client-resolver.js"
  );
  return resolveDiscoveryContextByClientId(clientId, now);
}
