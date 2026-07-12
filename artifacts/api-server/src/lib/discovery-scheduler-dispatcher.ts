/**
 * C7 Discovery Scheduler — Scheduled Dispatcher
 *
 * Responsible for resolving a single occurrence and invoking the C6
 * DiscoveryExecutionService. Does NOT re-implement lease, audit,
 * pipeline, or finalization logic — those are owned by the service.
 *
 * Dependencies are injected (pool, executionService, contextResolver)
 * so that every code path is unit-testable without a real DB or provider.
 *
 * ── C6 contract (DO NOT VIOLATE) ──────────────────────────────────────────────
 * The dispatcher calls service.execute() exactly once per occurrence.
 * It never reimplements acquireLease, releaseLease, pipeline.run(), or audit.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  pool as defaultPool,
  updateOccurrenceStatus,
  updateScheduleAfterRun,
  evaluateFailurePolicy,
} from "@workspace/db";
import type {
  DiscoverySchedule,
  ScheduleOccurrence,
  DiscoveryContext,
  FailureCategory,
  OrchestrationMode,
} from "@workspace/db";
import type {
  DiscoveryExecutionService,
  DiscoveryExecutionResult,
} from "./discovery-execution-service.js";

type Pool = typeof defaultPool;

// ── Dispatch input / output ────────────────────────────────────────────────────

export interface DispatchInput {
  schedule:           DiscoverySchedule;
  occurrence:         ScheduleOccurrence;
  now:                Date;
  /**
   * When true OR when schedule.executionMode === "dry":
   * the dispatcher skips execute() entirely and records a dry_run_simulated outcome.
   * This mirrors how the HTTP route handles dryRun=true before calling execute().
   */
  dryRunOverride:     boolean;
  /**
   * Which orchestration mode to pass to execute() on a live run.
   * Defaults to "primary_only" (the standard operational mode).
   */
  orchestrationMode?: OrchestrationMode;
  /**
   * Injectable context resolver. In production: resolveDiscoveryContextByClientId.
   * In tests: any function returning a mock DiscoveryContext.
   */
  contextResolver: (clientId: string, now: Date) => Promise<DiscoveryContext | null>;
}

export type DispatchOutcome =
  | { result: "dispatched";     runId: string; executionStatus: string }
  | { result: "context_failed"; reason: string }
  | { result: "lease_denied" }
  | { result: "error";          message: string };

// ── Dispatcher ─────────────────────────────────────────────────────────────────

export class ScheduledDispatcher {
  private readonly pool:             Pool;
  private readonly executionService: DiscoveryExecutionService;

  constructor(pool?: Pool, executionService?: DiscoveryExecutionService) {
    this.pool             = pool             ?? defaultPool;
    this.executionService = executionService ?? (() => { throw new Error("executionService required"); })() as never;
  }

  async dispatch(input: DispatchInput): Promise<DispatchOutcome> {
    const { schedule, occurrence, now, dryRunOverride, contextResolver } = input;

    // ── Step 1: Resolve DiscoveryContext ────────────────────────────────────
    let discoveryContext: DiscoveryContext | null;
    try {
      discoveryContext = await contextResolver(schedule.clientId, now);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[SCHEDULER-DISPATCHER] context resolution failed for client=${schedule.clientId}:`, msg);
      await updateOccurrenceStatus(
        this.pool, occurrence.id, schedule.clientId, "failed",
        { skipReason: "context_resolution_error" },
      ).catch((e: unknown) => {
        console.error("[SCHEDULER-DISPATCHER] failed to mark occurrence as failed after context error:", e instanceof Error ? e.message : String(e));
      });
      return { result: "context_failed", reason: `context_resolution_error: ${msg}` };
    }

    if (!discoveryContext) {
      await updateOccurrenceStatus(
        this.pool, occurrence.id, schedule.clientId, "failed",
        { skipReason: "context_not_found" },
      ).catch((e: unknown) => {
        console.error("[SCHEDULER-DISPATCHER] failed to mark occurrence as failed after context_not_found:", e instanceof Error ? e.message : String(e));
      });
      return { result: "context_failed", reason: "context_not_found" };
    }

    // ── Step 2: Dry-run short-circuit ──────────────────────────────────────
    // schedule.executionMode === "dry" OR dryRunOverride → skip execute().
    // This mirrors how the HTTP route handles dryRun=true before calling the service.
    const isDryRun = dryRunOverride || schedule.executionMode === "dry";
    if (isDryRun) {
      const dryRunId = `dry::${occurrence.id}`;
      await updateOccurrenceStatus(
        this.pool, occurrence.id, schedule.clientId, "skipped",
        { skipReason: "dry_run_simulated" },
      ).catch((e: unknown) => {
        console.error("[SCHEDULER-DISPATCHER] failed to mark dry-run occurrence as skipped:", e instanceof Error ? e.message : String(e));
      });
      return { result: "dispatched", runId: dryRunId, executionStatus: "dry_run_simulated" };
    }

    // ── Step 3: Mark occurrence as dispatched (live run) ────────────────────
    await updateOccurrenceStatus(
      this.pool, occurrence.id, schedule.clientId, "dispatched",
    ).catch((e: unknown) => {
      console.error("[SCHEDULER-DISPATCHER] failed to mark occurrence as dispatched:", e instanceof Error ? e.message : String(e));
    });

    // ── Step 4: Execute via C6 service ──────────────────────────────────────
    const orchestMode: OrchestrationMode = input.orchestrationMode ?? "primary_only";

    let execResult: DiscoveryExecutionResult;
    try {
      execResult = await this.executionService.execute({
        clientId:         schedule.clientId,
        correlationId:    occurrence.id,
        mode:             orchestMode,
        costCeilingUSD:   schedule.maxCostPerRunUsd,
        discoveryContext,
        plan:             { estimatedCostUSD: 0, estimatedApiCalls: 0 },
        actor:            { actorType: "system", actorId: schedule.id },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[SCHEDULER-DISPATCHER] execute() threw for occurrence=${occurrence.id}:`, msg);
      await updateOccurrenceStatus(
        this.pool, occurrence.id, schedule.clientId, "failed",
        { skipReason: `execute_threw: ${msg.slice(0, 200)}` },
      ).catch((e: unknown) => {
        console.error("[SCHEDULER-DISPATCHER] failed to mark occurrence as failed after execute error:", e instanceof Error ? e.message : String(e));
      });
      return { result: "error", message: msg };
    }

    // ── Step 5: Map execution result → occurrence status ────────────────────
    const occStatus: ScheduleOccurrence["status"] =
      execResult.status === "complete" || execResult.status === "partial" ? "complete"  :
      execResult.status === "cancelled"                                   ? "cancelled" :
      execResult.status === "lease_denied"                                ? "skipped"   :
                                                                            "failed";

    await updateOccurrenceStatus(
      this.pool, occurrence.id, schedule.clientId, occStatus,
      { runId: execResult.runId },
    ).catch((e: unknown) => {
      console.error("[SCHEDULER-DISPATCHER] failed to update occurrence status after execution:", e instanceof Error ? e.message : String(e));
    });

    // ── Step 6: Evaluate failure policy + update schedule after run ──────────
    const success = occStatus === "complete";

    let newConsecutiveFailures = success ? 0 : schedule.consecutiveFailures;
    let newStatus: DiscoverySchedule["status"] | undefined;
    let pauseReason: string | undefined;

    if (!success && occStatus !== "skipped") {
      const failureCategory = classifyExecutionFailure(execResult);
      const policyResult = evaluateFailurePolicy(
        schedule.consecutiveFailures, failureCategory, {
          pauseThreshold:      3,
          errorBlockThreshold: 10,
          baseDelayMs:         5 * 60 * 1000,
          maxDelayMs:          4 * 60 * 60 * 1000,
        },
      );
      newConsecutiveFailures = policyResult.newConsecutiveCount;
      if (policyResult.action === "pause_schedule") {
        newStatus   = "paused";
        pauseReason = policyResult.reason;
      } else if (policyResult.action === "error_block_schedule") {
        newStatus   = "error_blocked";
        pauseReason = policyResult.reason;
      }
    }

    await updateScheduleAfterRun(this.pool, schedule.clientId, schedule.id, {
      success,
      consecutiveFailures: newConsecutiveFailures,
      newStatus,
      pauseReason:         pauseReason ?? null,
      lastRunAt:           now,
      lastSuccessAt:       success ? now : null,
      nextRunAt:           schedule.nextRunAt,
    }).catch((e: unknown) => {
      console.error("[SCHEDULER-DISPATCHER] failed to update schedule after run:", e instanceof Error ? e.message : String(e));
    });

    if (execResult.status === "lease_denied") {
      return { result: "lease_denied" };
    }

    return {
      result:          "dispatched",
      runId:           execResult.runId,
      executionStatus: execResult.status,
    };
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function classifyExecutionFailure(result: DiscoveryExecutionResult): FailureCategory {
  switch (result.status) {
    case "cancelled":    return "cancelled";
    case "lease_denied": return "governance_denied";
    case "failed":       return "transient_provider";
    default:             return "transient_provider";
  }
}
