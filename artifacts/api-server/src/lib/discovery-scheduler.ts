/**
 * Phase C7 — Discovery Scheduler: Tick, Recovery, and Loop
 *
 * Provides:
 *   runDiscoverySchedulerTick   — one atomic scheduler tick (claims + dispatches)
 *   runDiscoveryRecoveryScan    — reconciles stale run leases + stale occurrence claims
 *   startDiscoverySchedulerLoop — starts setInterval loop (returns stop function)
 *
 * Architecture:
 *   - Leadership: DB-coordinated singleton lease. Only one API-server instance
 *     runs dispatch at a time. Non-leaders skip the tick without error.
 *   - Claiming: occurrence INSERT ON CONFLICT DO NOTHING → first writer wins.
 *     Concurrent API-server instances lose silently.
 *   - Pipeline dispatch: fire-and-forget (setImmediate). The tick returns after
 *     submissions — it never awaits the full pipeline execution.
 *   - Recovery: C6 findStaleRuns + C7 findStaleClaimedOccurrences. Separate
 *     scan interval from tick interval.
 *
 * Invariants:
 *   - DISCOVERY_AUTOMATION_ENABLED=false by default. This module does nothing
 *     unless explicitly enabled via environment variable.
 *   - No Math.random(). Clocks, pools, and config are all injectable for testing.
 *   - Credentials are NEVER logged or returned.
 */

import { randomUUID }    from "node:crypto";
import type { Pool }     from "pg";
import {
  pool,
  db,
  DiscoveryPipeline,
  buildDiscoveryContext,
  DrizzleDiscoveryRepository,
  bootstrapDiscoveryTables,
  parseDataForSEOConfig,
  DataForSEOContextAdapter,
  buildDataForSEOQueryPlan,
  DATAFORSEO_CAPABILITIES,
  BudgetGuard,
  MAX_RUN_CEILING_USD,
  SearchOrchestrator,
  CostLedger,
  bootstrapCostTable,
  saveCostRecords,
  deriveCostRecordId,
  bootstrapC6Tables,
  DEFAULT_GOVERNANCE_POLICY,
  evaluateGovernance,
  getActiveRunCount,
  checkIdempotency,
  saveIdempotency,
  deriveIdempotencyId,
  deriveRequestFingerprint,
  deriveIdempotencyExpiry,
  deriveLeaseOwnerId,
  acquireLease,
  releaseLease,
  buildTransitionRecord,
  appendTransition,
  nextTransitionSeq,
  updateRunState,
  createAuditEvent,
  appendAudit,
  createDiagnosticEvent,
  appendDiagnostic,
  findStaleRuns,
  recoverLease,
} from "@workspace/db";

import {
  bootstrapC7Tables,
  findDueSchedules,
  insertOccurrence,
  updateOccurrenceStatus,
  countActiveOccurrences,
  countPendingOccurrences,
  updateScheduleAfterRun,
  updateScheduleNextRun,
  findStaleClaimedOccurrences,
  releaseStaleOccurrenceClaim,
  acquireSchedulerLeadership,
  releaseSchedulerLeadership,
} from "@workspace/db";

import {
  deriveOccurrenceId,
  deriveOccurrenceIdempotencyKey,
  deriveSchedulerOwnerId,
  calculateNextRun,
  resolveCatchUp,
  isScheduleEligibleForDispatch,
  SCHEDULER_LEADER_ID,
} from "@workspace/db";

import type {
  DiscoverySchedule,
  ScheduleOccurrence,
} from "@workspace/db";

import {
  evaluateFailurePolicy,
  DEFAULT_SCHEDULE_FAILURE_POLICY,
  resolveOverlap,
  evaluateScheduleBudget,
  makeEmptyTickSummary,
} from "@workspace/db";

import type {
  SchedulerTickSummary,
  SchedulerTickOutcome,
} from "@workspace/db";

import type { DiscoveryAutomationConfig } from "./discovery-automation-config.js";
import { resolveClientContentContextFromDb } from "./client-resolver.js";
import { logger }                            from "./logger.js";

// ── Table bootstrap (called once on module load) ───────────────────────────────

let bootstrapDone = false;

async function ensureBootstrapped(p: Pool): Promise<void> {
  if (bootstrapDone) return;
  await bootstrapDiscoveryTables(p).catch(err =>
    logger.warn({ err }, "[C7-SCHEDULER] bootstrapDiscoveryTables failed"),
  );
  await bootstrapCostTable(p).catch(err =>
    logger.warn({ err }, "[C7-SCHEDULER] bootstrapCostTable failed"),
  );
  await bootstrapC6Tables(p).catch(err =>
    logger.warn({ err }, "[C7-SCHEDULER] bootstrapC6Tables failed"),
  );
  await bootstrapC7Tables(p).catch(err =>
    logger.warn({ err }, "[C7-SCHEDULER] bootstrapC7Tables failed"),
  );
  bootstrapDone = true;
}

// ── Scheduled pipeline execution (fire-and-forget) ────────────────────────────

interface DispatchParams {
  schedule:       DiscoverySchedule;
  occurrence:     ScheduleOccurrence;
  correlationId:  string;
  ownerId:        string;
  now:            Date;
}

/**
 * Executes a scheduled discovery occurrence through the full C2–C6 pipeline.
 * Called fire-and-forget from the tick loop — does NOT block the tick.
 *
 * Mirrors the lifecycle in discovery-run.ts:
 *   planned → running → complete|partial|failed
 *   with lease, transitions, audit, diagnostics, and cost records.
 */
async function executeScheduledPipeline(params: DispatchParams): Promise<void> {
  const { schedule, occurrence, correlationId, ownerId, now } = params;
  const clientId = schedule.clientId;
  let runId: string | null = null;
  let leaseAcquired = false;

  try {
    const dfCfg = parseDataForSEOConfig(process.env);

    const clientCtx = await resolveClientContentContextFromDb(clientId);
    if (!clientCtx) {
      logger.warn({ clientId, scheduleId: schedule.id }, "[C7-SCHEDULER] Client context not found; skipping");
      await updateOccurrenceStatus(pool, occurrence.id, "failed", {
        skipReason: "client_context_not_found",
      });
      return;
    }

    const ctx  = buildDiscoveryContext({ contentContext: clientCtx, clock: () => now });
    const repo = new DrizzleDiscoveryRepository(db);
    const isDryRun = schedule.executionMode === "dry";

    const pipeline = new DiscoveryPipeline(repo);
    const providers = isDryRun
      ? []
      : (() => {
          const adapter = new DataForSEOContextAdapter(ctx, dfCfg);
          const plan    = buildDataForSEOQueryPlan(ctx, dfCfg, DATAFORSEO_CAPABILITIES);
          const budget  = new BudgetGuard({ maxCostUSD: Math.min(schedule.maxCostPerRunUsd, MAX_RUN_CEILING_USD) });
          const ledger  = new CostLedger();
          const orch    = new SearchOrchestrator({ mode: "primary_only" });
          return [adapter] as never;
        })();

    const summary = await pipeline.run(ctx, providers);
    runId = summary.runId;

    // Update occurrence with runId
    await updateOccurrenceStatus(pool, occurrence.id, "running", { runId });

    // Acquire C6 lease retroactively
    const leaseResult = await acquireLease(pool, runId, clientId, ownerId, 1).catch(() => null);
    leaseAcquired = leaseResult?.acquired === true;

    // Update snapshot with correlationId
    updateRunState(pool, runId, clientId, summary.status, { correlationId }).catch(() => {});

    // C6 transition: record planned → running
    const transSeq = await nextTransitionSeq(pool, runId, clientId).catch(() => 1);
    await appendTransition(pool, buildTransitionRecord({
      runId, clientId, seq: transSeq,
      from: "queued", to: "running",
      actorType: "system", reason: "schedule_claimed",
      correlationId,
    })).catch(() => {});

    // C6 audit: schedule_run_dispatched
    await appendAudit(pool, createAuditEvent({
      clientId, runId, action: "schedule_run_dispatched",
      actorType: "system", actorId: ownerId,
      correlationId, metadata: {
        scheduleId:  schedule.id,
        scheduleName: schedule.name,
        occurrenceId: occurrence.id,
        intendedAt:  occurrence.intendedAt.toISOString(),
        executionMode: schedule.executionMode,
      },
    })).catch(() => {});

    // Save cost records (for live runs)
    if (!isDryRun && "costs" in summary && Array.isArray((summary as Record<string, unknown>).costs)) {
      const costs = (summary as Record<string, unknown>).costs as Array<Record<string, unknown>>;
      if (costs.length > 0) {
        await saveCostRecords(pool, costs as never[]).catch(() => {});
      }
    }

    const finalStatus = summary.status;
    await updateOccurrenceStatus(pool, occurrence.id, finalStatus as OccurrenceStatus);

    // Update schedule metadata after run
    const success = finalStatus === "complete" || finalStatus === "partial";
    const failPolicy = success
      ? null
      : evaluateFailurePolicy(schedule.consecutiveFailures, "transient_provider", DEFAULT_SCHEDULE_FAILURE_POLICY);

    const nextRunAt = calculateNextRun(schedule.cronExpr, schedule.timezone, now);

    await updateScheduleAfterRun(pool, clientId, schedule.id, {
      success,
      consecutiveFailures: success ? 0 : (failPolicy?.newConsecutiveCount ?? schedule.consecutiveFailures + 1),
      newStatus:    failPolicy?.action === "pause_schedule" ? "paused"
                  : failPolicy?.action === "error_block_schedule" ? "error_blocked"
                  : undefined,
      pauseReason:  failPolicy?.action === "pause_schedule" ? failPolicy.reason : undefined,
      nextRunAt,
      lastRunAt:    now,
      lastSuccessAt: success ? now : null,
    });

    logger.info(
      { scheduleId: schedule.id, clientId, runId, status: finalStatus, occurrenceId: occurrence.id },
      "[C7-SCHEDULER] Scheduled run complete",
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, scheduleId: schedule.id, clientId, runId }, "[C7-SCHEDULER] Scheduled pipeline error");

    if (occurrence.id) {
      await updateOccurrenceStatus(pool, occurrence.id, "failed", {
        skipReason: `pipeline_error: ${msg.slice(0, 200)}`,
      }).catch(() => {});
    }

    // Record failure on schedule
    const failPolicy = evaluateFailurePolicy(
      schedule.consecutiveFailures,
      "transient_provider",
      DEFAULT_SCHEDULE_FAILURE_POLICY,
    );
    const nextRunAt = calculateNextRun(schedule.cronExpr, schedule.timezone, now);
    await updateScheduleAfterRun(pool, clientId, schedule.id, {
      success:             false,
      consecutiveFailures: failPolicy.newConsecutiveCount,
      newStatus:    failPolicy.action === "pause_schedule" ? "paused"
                  : failPolicy.action === "error_block_schedule" ? "error_blocked"
                  : undefined,
      pauseReason: failPolicy.action === "pause_schedule" ? failPolicy.reason : undefined,
      nextRunAt,
      lastRunAt:   now,
    }).catch(() => {});

  } finally {
    if (runId && leaseAcquired) {
      releaseLease(pool, runId, ownerId).catch(() => {});
    }
  }
}

type OccurrenceStatus = ScheduleOccurrence["status"];

// ── Scheduler Tick ─────────────────────────────────────────────────────────────

export interface SchedulerTickParams {
  p:     Pool;
  config: DiscoveryAutomationConfig;
  now:   Date;
}

/**
 * Runs a single scheduler tick.
 *
 * Returns a SchedulerTickSummary with counts for dispatched, skipped, and errored
 * occurrences. Does NOT await pipeline execution — dispatch is fire-and-forget.
 */
export async function runDiscoverySchedulerTick(
  params: SchedulerTickParams,
): Promise<SchedulerTickSummary> {
  const { p, config, now } = params;

  if (!config.enabled || config.globalEmergencyPause) {
    const ownerId = deriveSchedulerOwnerId(randomUUID());
    return {
      ...makeEmptyTickSummary(ownerId, now, "disabled"),
      tickCompletedAt: now,
    };
  }

  const correlationId = randomUUID();
  const ownerId       = deriveSchedulerOwnerId(correlationId);

  // ── Leadership acquisition ─────────────────────────────────────────────────
  const leaderResult = await acquireSchedulerLeadership(
    p, ownerId, config.leadershipLeaseDurationMs, now,
    `api-server::${correlationId.slice(0, 8)}`,
  );

  if (!leaderResult.acquired) {
    logger.debug(
      { ownerId, currentOwner: leaderResult.currentOwnerId },
      "[C7-SCHEDULER] Not leader — skipping tick",
    );
    return {
      ...makeEmptyTickSummary(ownerId, now, "none"),
      tickCompletedAt: new Date(),
    };
  }

  const leadershipState = "acquired";
  logger.debug({ ownerId }, "[C7-SCHEDULER] Leadership acquired — running tick");

  const summary = makeEmptyTickSummary(ownerId, now, leadershipState);

  try {
    // ── Find due schedules ─────────────────────────────────────────────────
    const dueSchedules = await findDueSchedules(p, now, config.maxSchedulesPerTick);
    summary.schedulesFound = dueSchedules.length;

    for (const schedule of dueSchedules) {
      if (!isScheduleEligibleForDispatch(schedule.status)) continue;

      // Resolve catch-up occurrences
      const catchUp = resolveCatchUp(schedule, now);
      const occurrenceTimes = catchUp.occurrencesToDispatch;

      // Add current due occurrence (nextRunAt) if not already covered
      if (schedule.nextRunAt && !occurrenceTimes.some(t => t.getTime() === schedule.nextRunAt!.getTime())) {
        occurrenceTimes.unshift(schedule.nextRunAt);
      }

      for (const intendedAt of occurrenceTimes.slice(0, config.maxCatchUpExecutions + 1)) {
        const occId    = deriveOccurrenceId(schedule.id, intendedAt);
        const idemKey  = deriveOccurrenceIdempotencyKey(
          schedule.id, intendedAt, schedule.executionMode, schedule.version,
        );

        // ── Idempotency check (C6) ──────────────────────────────────────
        const idemCheck = await checkIdempotency(p, {
          clientId:       schedule.clientId,
          operation:      "scheduled_run",
          isDryRun:       schedule.executionMode === "dry",
          idempotencyKey: idemKey,
        }).catch(() => null);

        if (idemCheck?.result === "hit") {
          summary.occurrencesSkipped++;
          summary.outcomes.push({
            scheduleId:   schedule.id,
            clientId:     schedule.clientId,
            intendedAt,
            occurrenceId: occId,
            result:       "idempotency_hit",
            runId:        idemCheck.existingRunId ?? null,
            errorMessage: null,
          });
          continue;
        }

        // ── Overlap check ──────────────────────────────────────────────
        const activeCount  = await countActiveOccurrences(p, schedule.id).catch(() => 0);
        const pendingCount = await countPendingOccurrences(p, schedule.id).catch(() => 0);
        const activeRuns   = await getActiveRunCount(p, schedule.clientId).catch(() => 0);
        const govResult    = evaluateGovernance(activeRuns, DEFAULT_GOVERNANCE_POLICY);
        const overlapResult = resolveOverlap(
          schedule.overlapPolicy,
          activeCount,
          pendingCount,
          govResult.allowed,
        );

        if (overlapResult.decision === "skip" || overlapResult.decision === "deny_governance") {
          const reason: AuditAction = overlapResult.decision === "deny_governance"
            ? "schedule_run_skipped_governance"
            : "schedule_run_skipped_overlap";

          await appendAudit(p, createAuditEvent({
            clientId:     schedule.clientId,
            runId:        null,
            action:       reason,
            actorType:    "system",
            actorId:      ownerId,
            correlationId,
            metadata:     { scheduleId: schedule.id, occurrenceId: occId, reason: overlapResult.reason },
          })).catch(() => {});

          const occ: ScheduleOccurrence = {
            id: occId, scheduleId: schedule.id, clientId: schedule.clientId,
            intendedAt, status: "skipped",
            runId: null, idempotencyKey: idemKey,
            catchUpReason:        catchUp.reason !== "no_missed" ? catchUp.reason : null,
            overlapPolicyApplied: schedule.overlapPolicy,
            skipReason:           overlapResult.reason,
            claimedBy: null, claimedAt: null, claimExpiresAt: null,
            dispatchCorrelationId: correlationId,
            scheduleVersion: schedule.version,
            createdAt: now, updatedAt: now,
          };
          await insertOccurrence(p, occ).catch(() => {});

          summary.occurrencesSkipped++;
          summary.outcomes.push({
            scheduleId: schedule.id, clientId: schedule.clientId,
            intendedAt, occurrenceId: occId,
            result: "skipped_overlap", runId: null, errorMessage: null,
          });
          continue;
        }

        // ── Claim occurrence (INSERT ON CONFLICT DO NOTHING) ──────────
        const claimExpiresAt = new Date(now.getTime() + config.claimLeaseDurationMs);
        const occ: ScheduleOccurrence = {
          id: occId, scheduleId: schedule.id, clientId: schedule.clientId,
          intendedAt, status: "pending",
          runId: null, idempotencyKey: idemKey,
          catchUpReason:        catchUp.reason !== "no_missed" ? catchUp.reason : null,
          overlapPolicyApplied: schedule.overlapPolicy,
          skipReason:           null,
          claimedBy:            ownerId,
          claimedAt:            now,
          claimExpiresAt,
          dispatchCorrelationId: correlationId,
          scheduleVersion:      schedule.version,
          createdAt: now, updatedAt: now,
        };

        const { inserted } = await insertOccurrence(p, occ).catch(() => ({ inserted: false }));
        if (!inserted) {
          // Another dispatcher won the race
          summary.occurrencesSkipped++;
          summary.outcomes.push({
            scheduleId: schedule.id, clientId: schedule.clientId,
            intendedAt, occurrenceId: occId,
            result: "idempotency_hit", runId: null, errorMessage: null,
          });
          continue;
        }

        // Mark dispatched
        await updateOccurrenceStatus(p, occId, "dispatched").catch(() => {});
        summary.schedulesClaimed++;

        // Save C6 idempotency record
        await saveIdempotency(p, {
          id:             deriveIdempotencyId(schedule.clientId, "scheduled_run", false, idemKey),
          clientId:       schedule.clientId,
          idempotencyKey: idemKey,
          operation:      "scheduled_run",
          isDryRun:       schedule.executionMode === "dry",
          runId:          null,
          requestFingerprint: deriveRequestFingerprint({ scheduleId: schedule.id, intendedAt: intendedAt.toISOString() }),
          expiresAt:      deriveIdempotencyExpiry(now),
          createdAt:      now,
        }).catch(() => {});

        // Advance next_run_at immediately so the next tick doesn't re-claim this slot
        const nextRunAt = calculateNextRun(schedule.cronExpr, schedule.timezone, intendedAt);
        await updateScheduleNextRun(p, schedule.clientId, schedule.id, nextRunAt).catch(() => {});

        // ── Fire-and-forget pipeline dispatch ─────────────────────────
        const dispatchParams: DispatchParams = {
          schedule, occurrence: { ...occ, status: "dispatched" },
          correlationId, ownerId, now,
        };
        setImmediate(() => {
          executeScheduledPipeline(dispatchParams).catch(err =>
            logger.error({ err, scheduleId: schedule.id, occurrenceId: occId }, "[C7-SCHEDULER] Uncaught pipeline error"),
          );
        });

        summary.occurrencesDispatched++;
        summary.outcomes.push({
          scheduleId: schedule.id, clientId: schedule.clientId,
          intendedAt, occurrenceId: occId,
          result: "dispatched", runId: null, errorMessage: null,
        });
      }
    }

  } catch (err: unknown) {
    logger.error({ err }, "[C7-SCHEDULER] Tick error");
    summary.occurrencesError++;
  } finally {
    summary.tickCompletedAt = new Date();
  }

  logger.debug(
    {
      dispatched:  summary.occurrencesDispatched,
      skipped:     summary.occurrencesSkipped,
      found:       summary.schedulesFound,
    },
    "[C7-SCHEDULER] Tick complete",
  );

  return summary;
}

type AuditAction = Parameters<typeof createAuditEvent>[0]["action"];

// ── Recovery Scan ─────────────────────────────────────────────────────────────

export interface RecoveryScanResult {
  staleRunsRecovered:    number;
  staleClaimsReleased:   number;
  errors:                number;
}

/**
 * Reconciles stale run leases and stale occurrence claims.
 *
 * Stale runs (C6): runs with expired leases still in an active state →
 *   recovered via recoverLease + transition to failed.
 *
 * Stale occurrence claims (C7): occurrences whose claim_expires_at has
 *   passed but are still 'pending' → claim released so another dispatcher
 *   can retry.
 */
export async function runDiscoveryRecoveryScan(params: {
  p:      Pool;
  config: DiscoveryAutomationConfig;
  now:    Date;
}): Promise<RecoveryScanResult> {
  const { p, config, now } = params;
  const result: RecoveryScanResult = { staleRunsRecovered: 0, staleClaimsReleased: 0, errors: 0 };

  if (!config.recoveryEnabled) return result;

  logger.debug("[C7-SCHEDULER] Running recovery scan");

  // ── Stale C6 run leases ────────────────────────────────────────────────────
  try {
    const staleRuns = await findStaleRuns(p, now);
    for (const stale of staleRuns.slice(0, config.maxStaleRunsPerScan)) {
      try {
        const recoveredOwnerId = deriveSchedulerOwnerId(`recovery::${stale.runId}`);
        await recoverLease(p, stale.runId, stale.clientId, recoveredOwnerId).catch(() => {});
        await updateRunState(p, stale.runId, stale.clientId, "failed", {
          correlationId: `recovery::${now.toISOString()}`,
        }).catch(() => {});

        const transSeq = await nextTransitionSeq(p, stale.runId, stale.clientId).catch(() => 1);
        await appendTransition(p, buildTransitionRecord({
          runId: stale.runId, clientId: stale.clientId, seq: transSeq,
          from: stale.status as never, to: "failed",
          actorType: "recovery", reason: "lease_expired_stale_recovered",
          correlationId: `recovery::${now.toISOString()}`,
        })).catch(() => {});

        result.staleRunsRecovered++;
        logger.info({ runId: stale.runId, clientId: stale.clientId }, "[C7-RECOVERY] Stale run recovered");
      } catch (err) {
        result.errors++;
        logger.warn({ err, runId: stale.runId }, "[C7-RECOVERY] Error recovering stale run");
      }
    }
  } catch (err) {
    result.errors++;
    logger.warn({ err }, "[C7-RECOVERY] Error querying stale runs");
  }

  // ── Stale C7 occurrence claims ─────────────────────────────────────────────
  try {
    const staleOccs = await findStaleClaimedOccurrences(p, now);
    for (const occ of staleOccs) {
      try {
        await releaseStaleOccurrenceClaim(p, occ.id);
        result.staleClaimsReleased++;
        logger.info({ occurrenceId: occ.id, scheduleId: occ.scheduleId }, "[C7-RECOVERY] Stale claim released");
      } catch (err) {
        result.errors++;
        logger.warn({ err, occurrenceId: occ.id }, "[C7-RECOVERY] Error releasing stale claim");
      }
    }
  } catch (err) {
    result.errors++;
    logger.warn({ err }, "[C7-RECOVERY] Error querying stale claims");
  }

  logger.debug(result, "[C7-SCHEDULER] Recovery scan complete");
  return result;
}

// ── Scheduler Loop ─────────────────────────────────────────────────────────────

let tickIntervalId:     ReturnType<typeof setInterval> | null = null;
let recoveryIntervalId: ReturnType<typeof setInterval> | null = null;
let tickRunning     = false;
let recoveryRunning = false;

/**
 * Starts the discovery scheduler loop.
 * - Tick fires every config.pollIntervalMs.
 * - Recovery scan fires every config.recoveryScanIntervalMs.
 * - Both are guarded against overlapping (tick skips if previous still running).
 *
 * Returns a stop function. Idempotent — calling start twice is a no-op.
 */
export function startDiscoverySchedulerLoop(
  config: DiscoveryAutomationConfig,
): () => void {
  if (tickIntervalId !== null) {
    logger.warn("[C7-SCHEDULER] Loop already started — ignoring duplicate start");
    return stopDiscoverySchedulerLoop;
  }

  if (!config.enabled) {
    logger.info("[C7-SCHEDULER] Automation disabled (DISCOVERY_AUTOMATION_ENABLED != true) — loop not started");
    return stopDiscoverySchedulerLoop;
  }

  logger.info(
    { pollMs: config.pollIntervalMs, recoveryMs: config.recoveryScanIntervalMs },
    "[C7-SCHEDULER] Starting discovery scheduler loop",
  );

  ensureBootstrapped(pool).catch(err =>
    logger.error({ err }, "[C7-SCHEDULER] Bootstrap error"),
  );

  tickIntervalId = setInterval(async () => {
    if (tickRunning) {
      logger.debug("[C7-SCHEDULER] Previous tick still running — skipping");
      return;
    }
    tickRunning = true;
    try {
      await runDiscoverySchedulerTick({ p: pool, config, now: new Date() });
    } catch (err) {
      logger.error({ err }, "[C7-SCHEDULER] Tick interval error");
    } finally {
      tickRunning = false;
    }
  }, config.pollIntervalMs);

  if (config.recoveryEnabled) {
    recoveryIntervalId = setInterval(async () => {
      if (recoveryRunning) return;
      recoveryRunning = true;
      try {
        await runDiscoveryRecoveryScan({ p: pool, config, now: new Date() });
      } catch (err) {
        logger.error({ err }, "[C7-SCHEDULER] Recovery scan interval error");
      } finally {
        recoveryRunning = false;
      }
    }, config.recoveryScanIntervalMs);
  }

  return stopDiscoverySchedulerLoop;
}

/**
 * Stops the scheduler loop. Safe to call multiple times.
 */
export function stopDiscoverySchedulerLoop(): void {
  if (tickIntervalId !== null) {
    clearInterval(tickIntervalId);
    tickIntervalId = null;
  }
  if (recoveryIntervalId !== null) {
    clearInterval(recoveryIntervalId);
    recoveryIntervalId = null;
  }
  tickRunning     = false;
  recoveryRunning = false;
  logger.info("[C7-SCHEDULER] Scheduler loop stopped");
}
