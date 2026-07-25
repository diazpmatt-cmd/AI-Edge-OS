/**
 * DiscoveryExecutionService — C6 canonical execution path.
 *
 * Owns the complete governed execution sequence:
 *
 *   acquireLease → persistRunResult("running") → audit("live_run_requested") →
 *   cancelPoll → pipeline.run() → finalize(transitions/diagnostics/costs) →
 *   [finally] releaseLease
 *
 * ─── C7 CONTRACT ─────────────────────────────────────────────────────────────
 * The C7 scheduler MUST call execute() on this service — not the HTTP route.
 * Pass actorType="system" and actorId=<scheduleId | "discovery-scheduler">.
 * Never re-implement any part of the sequence above in the scheduler.
 *
 * Both manual HTTP runs (C5/C6) and automated scheduled runs (C7) use one
 * shared execution path. This guarantees the lease-ordering defect cannot
 * reappear in the scheduler without also breaking the manual path.
 *
 * ─── INVARIANTS (must not be violated by refactors) ──────────────────────────
 * I1: No provider fetch can begin before the lease is held.
 *     Providers run inside pipeline.run(). Lease is acquired before that call.
 * I2: Exactly one lease holder can execute a deterministic run.
 *     acquireLease uses a DB-atomic INSERT ON CONFLICT DO NOTHING.
 * I3: A failed lease acquisition leaves no orphaned running snapshot.
 *     persistRunResult is only called after leaseAcquired=true.
 * I4: Cancellation cannot allow any new provider call after the signal fires.
 *     shouldCancel() is checked before every individual provider call.
 *
 * DO NOT reorder the steps inside execute() without re-verifying all four.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { competitorDiscoveryService } from "./competitor-discovery-service.js";

import {
  pool as defaultPool,
  db   as defaultDb,
  DiscoveryPipeline,
  DrizzleDiscoveryRepository,
  parseDataForSEOConfig,
  DataForSEOContextAdapter,
  DATAFORSEO_CAPABILITIES,
  SearchOrchestrator,
  CostLedger,
  saveCostRecords,
  deriveCostRecordId,
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
  CancellationSignal,
  deriveRunId,
} from "@workspace/db";
import type { OrchestrationMode, DiscoveryContext } from "@workspace/db";

// ── Internal type aliases ─────────────────────────────────────────────────────

type Pool    = typeof defaultPool;
type DrizzleDb = typeof defaultDb;

// ── Input / output contracts ──────────────────────────────────────────────────

export interface DiscoveryExecutionInput {
  clientId:         string;
  correlationId:    string;
  mode:             OrchestrationMode;
  costCeilingUSD:   number;
  discoveryContext: DiscoveryContext;
  plan: {
    estimatedCostUSD:  number;
    estimatedApiCalls: number;
  };
  /**
   * Who triggered this run.
   *   "user"   — manual HTTP trigger (discovery-run route)
   *   "system" — automated trigger (C7 scheduler)
   */
  actor: {
    actorType: "user" | "system";
    actorId:   string;
  };
}

interface PipelineSummary {
  status:              string;
  runId:               string;
  weekLabel:           string;
  signals:             { received: number; accepted: number; blocked: number };
  clusters:            { created: number };
  opportunities:       { created: number; highPriority: number };
  topOpportunityScore: number;
  providersAttempted:  string[];
  providersSucceeded:  string[];
  providersFailed:     string[];
  providerFailures:    unknown[];
  topOpportunities:    unknown[];
  allClusters:         unknown[];
  allSignals:          unknown[];
  allOpportunities:    unknown[];
  cancelledAt?:        Date;
}

export type DiscoveryExecutionResult =
  | {
      status:               "complete" | "partial";
      runId:                string;
      elapsedMs:            number;
      summary:              PipelineSummary;
      costReport:           unknown;
      orchestrationRecords: unknown[];
    }
  | { status: "cancelled";    runId: string; elapsedMs: number }
  | { status: "failed";       runId: string; error: string }
  | { status: "lease_denied"; runId: string };

// ── Service class ─────────────────────────────────────────────────────────────

export class DiscoveryExecutionService {
  private readonly pool: Pool;
  private readonly db:   DrizzleDb;

  /**
   * @param p  pg Pool — defaults to the singleton from @workspace/db.
   *           Override in tests to inject a mock/test pool.
   * @param d  Drizzle db — defaults to the singleton from @workspace/db.
   *           Override in tests to inject a mock/test db.
   */
  constructor(p?: Pool, d?: DrizzleDb) {
    this.pool = p ?? defaultPool;
    this.db   = d ?? defaultDb;
  }

  /**
   * Execute a single discovery run under full C6 governance.
   *
   * The caller is responsible for:
   *   - Rate limiting
   *   - Idempotency check / replay
   *   - Governance policy check (active run count)
   *   - Budget check
   *   - Provider health check
   *   - Building the discoveryContext
   *   - Formatting and returning the HTTP (or scheduler) response
   *
   * This service owns everything from lease acquisition through lease release.
   *
   * ─── INVARIANT ORDER — DO NOT REORDER ────────────────────────────────────
   * Step 1: acquireLease  — DB-atomic; single winner per (runId, clientId)
   * Step 2: persistRunResult("running") — ONLY after lease secured (I3)
   * Step 3: pipeline.run()  — providers called ONLY after steps 1+2 (I1)
   * ─────────────────────────────────────────────────────────────────────────
   */
  async execute(input: DiscoveryExecutionInput): Promise<DiscoveryExecutionResult> {
    const {
      clientId, correlationId, mode, costCeilingUSD,
      discoveryContext, plan, actor,
    } = input;

    const runId       = deriveRunId(clientId, discoveryContext.currentWeek);
    const ownerId     = deriveLeaseOwnerId(correlationId);
    let   leaseAcquired = false;

    // ── Step 1: Acquire execution lease (Invariants 1, 2, 3) ─────────────────
    //
    // ORDER IS LOAD-BEARING — do NOT reorder steps 1→2→3:
    //   1. acquireLease  — DB-atomic; only one winner for (runId, clientId).
    //   2. persistRunResult — written ONLY after lease is secured (I3).
    //   3. pipeline.run  — providers called ONLY after both above (I1).
    //
    // If acquireLease returns false or throws, we return "lease_denied" here.
    // No persistRunResult has been called → no orphaned "running" snapshot (I3).
    const leaseResult = await acquireLease(
      this.pool, runId, clientId, ownerId, 1,
    ).catch(() => null);

    if (!leaseResult?.acquired) {
      appendAudit(this.pool, createAuditEvent({
        clientId, runId, action: "execution_denied_concurrency",
        actorType: "system", actorId: "discovery-execution-service", correlationId,
        metadata: { reason: "lease_held", runId },
      })).catch((err: unknown) => {
        console.error("[DiscoveryExecutionService] Audit write failed:",
          err instanceof Error ? err.message : String(err));
      });
      return { status: "lease_denied", runId };
    }
    leaseAcquired = true;

    // ── Step 2: Pre-initialize snapshot under the lease ───────────────────────
    // Called AFTER lease acquisition (I3). persistRunResult is INSERT ON CONFLICT
    // DO UPDATE — idempotent if called twice (e.g. retry path).
    const repository = new DrizzleDiscoveryRepository(this.db);
    await repository.persistRunResult({
      runId, clientId,
      weekLabel:           discoveryContext.currentWeek,
      status:              "running",
      providersAttempted:  [],
      providersSucceeded:  [],
      providersFailed:     [],
      providerFailures:    [],
      signals:             { received: 0, accepted: 0, blocked: 0 },
      clusters:            { created: 0 },
      opportunities:       { created: 0, highPriority: 0 },
      topOpportunityScore: 0,
      runDurationMs:       0,
      topOpportunities:    [],
      allClusters:         [],
      allSignals:          [],
      allOpportunities:    [],
    }).catch((err: unknown) => {
      console.error("[DiscoveryExecutionService] Snapshot pre-init failed:",
        err instanceof Error ? err.message : String(err));
    });

    // ── Audit: run requested ───────────────────────────────────────────────────
    appendAudit(this.pool, createAuditEvent({
      clientId, runId, action: "live_run_requested",
      actorType: actor.actorType, actorId: actor.actorId, correlationId,
      metadata: { mode, costCeilingUSD, estimatedCostUSD: plan.estimatedCostUSD },
    })).catch((err: unknown) => {
      console.error("[DiscoveryExecutionService] Audit write failed:",
        err instanceof Error ? err.message : String(err));
    });

    // ── Cooperative cancellation signal ───────────────────────────────────────
    const cancelSignal = new CancellationSignal();
    let   cancelPollInterval: NodeJS.Timeout | null = null;

    try {
      // Poll DB every 2 s for cancel_requested set by the cancel route.
      // (I4) Once the signal fires, shouldCancel() blocks every new provider call.
      cancelPollInterval = setInterval(() => {
        this.pool.query(
          "SELECT status FROM discovery_snapshots WHERE id=$1 AND client_id=$2 LIMIT 1",
          [runId, clientId],
        ).then((snap: { rows: Array<{ status: string }> }) => {
          if (snap.rows[0]?.status === "cancel_requested") {
            cancelSignal.request("Cancellation requested via API", "user_requested");
          }
        }).catch(() => { /* ignore transient poll errors */ });
      }, 2000);

      // ── Step 3: Build orchestrator and execute pipeline (I1) ──────────────
      // Providers are only reachable inside pipeline.run().
      // The lease is already held (step 1). Steps are strictly sequential.
      const config = parseDataForSEOConfig();
      if (!config) {
        throw new Error("DataForSEO config unavailable — cannot start pipeline.");
      }

      const adapter      = new DataForSEOContextAdapter(config, discoveryContext);
      const orchestrator = new SearchOrchestrator({
        mode,
        providers: [{ provider: adapter, capabilities: DATAFORSEO_CAPABILITIES, priority: 1 }],
      });
      const pipeline = new DiscoveryPipeline({ search: orchestrator }, repository);

      const startAt   = Date.now();
      const summary   = await pipeline.run(discoveryContext, cancelSignal) as unknown as PipelineSummary;
      const elapsedMs = Date.now() - startAt;

      // ── Handle cooperative cancellation ───────────────────────────────────
      if (summary.status === "cancelled") {
        updateRunState(this.pool, runId, clientId, "cancelled", { correlationId }).catch((err: unknown) => {
          console.error("[DiscoveryExecutionService] State update failed:",
            err instanceof Error ? err.message : String(err));
        });
        const cancelSeq = await nextTransitionSeq(this.pool, runId, clientId).catch(() => 1);
        appendTransition(this.pool, buildTransitionRecord({
          runId, clientId, seq: cancelSeq,
          fromState:  "cancel_requested",
          toState:    "cancelled",
          reasonCode: "cancellation_honored",
          message:    `Pipeline honoured cancellation after ${elapsedMs}ms.`,
          actorType:  "system",
          actorId:    "discovery-pipeline",
          correlationId,
          metadata:   { elapsedMs },
        })).catch((err: unknown) => {
          console.error("[DiscoveryExecutionService] Transition write failed:",
            err instanceof Error ? err.message : String(err));
        });
        appendAudit(this.pool, createAuditEvent({
          clientId, runId, action: "run_cancelled_requested",
          actorType: "system", actorId: "discovery-pipeline", correlationId,
          metadata: { elapsedMs, cancelledAt: cancelSignal.cancelledAt?.toISOString() },
        })).catch((err: unknown) => {
          console.error("[DiscoveryExecutionService] Audit write failed:",
            err instanceof Error ? err.message : String(err));
        });
        return { status: "cancelled", runId, elapsedMs };
      }

      // ── Finalization ───────────────────────────────────────────────────────
      updateRunState(this.pool, runId, clientId, summary.status, { correlationId }).catch((err: unknown) => {
        console.error("[DiscoveryExecutionService] State update failed:",
          err instanceof Error ? err.message : String(err));
      });

      const transSeq = await nextTransitionSeq(this.pool, runId, clientId).catch(() => 1);
      appendTransition(this.pool, buildTransitionRecord({
        runId, clientId, seq: transSeq,
        fromState:  "running",
        toState:    summary.status as "complete" | "partial" | "failed",
        reasonCode: summary.status === "complete" ? "execution_complete"
                  : summary.status === "partial"  ? "provider_partial_failure"
                  :                                 "execution_failed",
        message:    `Run ${summary.status} in ${elapsedMs}ms. ` +
                    `Signals: ${summary.signals.accepted}/${summary.signals.received}.`,
        actorType:  "system",
        actorId:    "discovery-pipeline",
        correlationId,
        metadata: {
          elapsedMs,
          signalsAccepted:      summary.signals.accepted,
          clustersCreated:      summary.clusters.created,
          opportunitiesCreated: summary.opportunities.created,
        },
      })).catch((err: unknown) => {
        console.error("[DiscoveryExecutionService] Transition write failed:",
          err instanceof Error ? err.message : String(err));
      });

      // Diagnostic event
      const diagSeqRes = await this.pool.query<{ max: string | null }>(
        `SELECT MAX(seq) AS max FROM discovery_diagnostics WHERE run_id=$1 AND client_id=$2`,
        [runId, clientId],
      ).catch(() => ({ rows: [{ max: null }] }));
      const diagSeq  = diagSeqRes.rows[0]?.max == null ? 1 : parseInt(diagSeqRes.rows[0].max, 10) + 1;
      const diagCode = summary.status === "complete" ? "run_complete"
                     : summary.status === "partial"  ? "run_partial"
                     :                                 "run_failed";
      appendDiagnostic(this.pool, createDiagnosticEvent({
        runId, clientId, seq: diagSeq,
        severity:     summary.status === "failed" ? "error" : "info",
        code:         diagCode,
        message:      `Run ${summary.status} in ${elapsedMs}ms.`,
        retryable:    false,
        correlationId,
        metadata: { elapsedMs, status: summary.status },
      })).catch((err: unknown) => {
        console.error("[DiscoveryExecutionService] Diagnostic write failed:",
          err instanceof Error ? err.message : String(err));
      });

      // Cost ledger
      const ledger = new CostLedger();
      ledger.record({
        id:               deriveCostRecordId(summary.runId, "dataforseo", "serp_results", 1),
        runId:            summary.runId,
        clientId,
        provider:         "dataforseo",
        capability:       "serp_results",
        endpoint:         "serp/google/organic/live/regular",
        estimatedCostUSD: plan.estimatedCostUSD,
        actualCostUSD:    null,
        requestCount:     plan.estimatedApiCalls,
        retryCount:       0,
        success:          summary.status !== "failed",
        errorKind:        summary.status === "failed" ? "provider_error" : null,
        recordedAt:       new Date(),
      });
      saveCostRecords(ledger.getRecords(), this.pool).catch((err: unknown) => {
        console.error("[DiscoveryExecutionService] Cost record persistence failed:",
          err instanceof Error ? err.message : String(err));
      });

      // ── Phase 3B: Fire-and-forget competitor entity extraction ──────────────
      // Runs AFTER the discovery run is fully finalized (transitions, costs, audit).
      // Never blocks the discovery lifecycle. Never throws into the caller.
      competitorDiscoveryService.extractCompetitorsFromLatestRun(clientId).then(r => {
        console.log(
          `[CompetitorDiscovery] Extraction complete for client ${clientId}: ` +
          `extracted=${r.extracted} inserted=${r.inserted} updated=${r.updated} ` +
          `skipped=${r.skipped} duplicateGroups=${r.duplicateGroups} ` +
          `time=${r.processingTimeMs}ms`,
        );
      }).catch((err: unknown) => {
        console.error(
          `[CompetitorDiscovery] Extraction failed for client ${clientId}:`,
          err instanceof Error ? err.message : String(err),
        );
      });

      return {
        status:               summary.status as "complete" | "partial",
        runId,
        elapsedMs,
        summary,
        costReport:           ledger.toReport(),
        orchestrationRecords: orchestrator.getExecutionRecords() as unknown[],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[DiscoveryExecutionService] Live run failed for client ${clientId}: ${message}`);

      appendAudit(this.pool, createAuditEvent({
        clientId, runId, action: "execution_failed",
        actorType: "system", actorId: "discovery-execution-service", correlationId,
        metadata: { error: message.slice(0, 200) },
      })).catch((errInner: unknown) => {
        console.error("[DiscoveryExecutionService] Audit write failed:",
          errInner instanceof Error ? errInner.message : String(errInner));
      });

      return { status: "failed", runId, error: message };
    } finally {
      if (cancelPollInterval) clearInterval(cancelPollInterval);
      if (leaseAcquired) {
        releaseLease(this.pool, runId, ownerId).catch((err: unknown) => {
          console.error("[DiscoveryExecutionService] Lease release failed:",
            err instanceof Error ? err.message : String(err));
        });
      }
    }
  }
}
