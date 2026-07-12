/**
 * Phase C6 — Run Inspection and Cancellation API
 *
 * Routes:
 *   GET  /api/discovery/runs                  — List runs for this client
 *   GET  /api/discovery/runs/:runId           — Full run inspection
 *   POST /api/discovery/runs/:runId/cancel    — Request cancellation
 *
 * Security:
 *   - All routes require valid Clerk session (userId).
 *   - runId is always scoped by clientId — cross-tenant reads are impossible.
 *   - Diagnostic metadata is stored pre-sanitized (no credentials at rest).
 *   - Lease ownerId is not exposed in API responses (internal identifier).
 *
 * Governance:
 *   - Cancellation is subject to rate limiting (cancel: 5/min).
 *   - Inspection is rate limited (inspect: 60/min).
 *   - Cancel is cooperative — sets run to cancel_requested, does not forcibly stop in-flight work.
 *   - Cancel is rejected for terminal runs (complete, failed, cancelled).
 */

import { Router }    from "express";
import { getAuth }   from "@clerk/express";
import { randomUUID } from "node:crypto";
import {
  pool,
} from "@workspace/db";
import {
  // C6 repository
  getRunInspection,
  getAuditEvents,
  appendAudit,
  appendTransition,
  nextTransitionSeq,
  updateRunState,
  getActiveRunCount,
  // C6 pure
  isCancellable,
  normalizeRunState,
  buildTransitionRecord,
  createAuditEvent,
  createDiagnosticEvent,
  appendDiagnostic,
} from "@workspace/db";
import { resolveClientContentContextFromDb } from "../lib/client-resolver.js";
import { discoveryRateLimiter }               from "../lib/discovery-rate-limiter.js";

const router = Router();

// ── GET /api/discovery/runs ────────────────────────────────────────────────────

router.get("/api/discovery/runs", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Rate limit: inspect
  const rlKey = userId;
  const rl    = discoveryRateLimiter.check("inspect", userId, "list", Date.now());
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterS));
    res.status(429).json({ error: "rate_limit_exceeded", retryAfterS: rl.retryAfterS });
    return;
  }

  let resolved;
  try {
    resolved = await resolveClientContentContextFromDb(userId);
  } catch {
    res.status(500).json({ error: "db_error", message: "Failed to resolve client." });
    return;
  }
  if (!resolved.found) {
    res.status(404).json({ error: "client_not_found", reason: resolved.reason });
    return;
  }

  const { client } = resolved;
  const clientId   = client.id;
  const limit      = Math.min(parseInt(String(req.query["limit"] ?? "20"), 10) || 20, 100);

  try {
    const rows = await pool.query<{
      id: string; week_label: string; status: string; correlation_id: string | null;
      signals_received: number; cluster_count: number; opportunity_count: number;
      created_at: Date; completed_at: Date | null; cancelled_at: Date | null;
    }>(
      `SELECT id, week_label, status, correlation_id, signals_received, cluster_count,
              opportunity_count, created_at, completed_at, cancelled_at
       FROM discovery_snapshots
       WHERE client_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [clientId, limit],
    );

    res.json({
      clientId,
      runs: rows.rows.map(r => ({
        runId:               r.id,
        weekLabel:           r.week_label,
        status:              r.status,
        correlationId:       r.correlation_id,
        signalsReceived:     r.signals_received,
        clusterCount:        r.cluster_count,
        opportunityCount:    r.opportunity_count,
        createdAt:           r.created_at,
        completedAt:         r.completed_at,
        cancelledAt:         r.cancelled_at,
      })),
      count: rows.rows.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "db_error", message: msg });
  }
});

// ── GET /api/discovery/runs/:runId ─────────────────────────────────────────────

router.get("/api/discovery/runs/:runId", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rl = discoveryRateLimiter.check("inspect", userId, "single", Date.now());
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterS));
    res.status(429).json({ error: "rate_limit_exceeded", retryAfterS: rl.retryAfterS });
    return;
  }

  const runId = req.params["runId"];
  if (!runId || typeof runId !== "string") {
    res.status(400).json({ error: "invalid_run_id" });
    return;
  }

  let resolved;
  try {
    resolved = await resolveClientContentContextFromDb(userId);
  } catch {
    res.status(500).json({ error: "db_error", message: "Failed to resolve client." });
    return;
  }
  if (!resolved.found) {
    res.status(404).json({ error: "client_not_found", reason: resolved.reason });
    return;
  }

  const clientId = resolved.client.id;

  try {
    const inspection = await getRunInspection(pool, runId, clientId);
    if (!inspection) {
      res.status(404).json({ error: "run_not_found" });
      return;
    }

    // Redact lease ownerId — internal identifier; expose only status/expiry
    const leaseStatus = inspection.lease
      ? {
          held:       inspection.lease.releasedAt === null,
          expiresAt:  inspection.lease.expiresAt,
          releasedAt: inspection.lease.releasedAt,
        }
      : null;

    const auditEvents = await getAuditEvents(pool, clientId, runId, 20);

    res.json({
      runId:         inspection.runId,
      clientId:      inspection.clientId,
      weekLabel:     inspection.weekLabel,
      status:        inspection.status,
      correlationId: inspection.correlationId,
      cancelledAt:   inspection.cancelledAt,
      progress:      inspection.progress,
      createdAt:     inspection.createdAt,
      completedAt:   inspection.completedAt,
      transitions:   inspection.transitions.map(t => ({
        seq:           t.seq,
        fromState:     t.fromState,
        toState:       t.toState,
        reasonCode:    t.reasonCode,
        message:       t.message,
        actorType:     t.actorType,
        actorId:       t.actorId,
        correlationId: t.correlationId,
        createdAt:     t.createdAt,
      })),
      diagnostics: inspection.diagnostics.map(d => ({
        seq:           d.seq,
        severity:      d.severity,
        code:          d.code,
        message:       d.message,
        stage:         d.stage,
        provider:      d.provider,
        capability:    d.capability,
        retryable:     d.retryable,
        createdAt:     d.createdAt,
      })),
      lease:   leaseStatus,
      audit:   auditEvents.map(a => ({
        action:    a.action,
        actorType: a.actorType,
        actorId:   a.actorId,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "db_error", message: msg });
  }
});

// ── POST /api/discovery/runs/:runId/cancel ─────────────────────────────────────

router.post("/api/discovery/runs/:runId/cancel", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rl = discoveryRateLimiter.check("cancel", userId, "cancel", Date.now());
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterS));
    res.status(429).json({ error: "rate_limit_exceeded", retryAfterS: rl.retryAfterS });
    return;
  }

  const runId = req.params["runId"];
  if (!runId || typeof runId !== "string") {
    res.status(400).json({ error: "invalid_run_id" });
    return;
  }

  let resolved;
  try {
    resolved = await resolveClientContentContextFromDb(userId);
  } catch {
    res.status(500).json({ error: "db_error", message: "Failed to resolve client." });
    return;
  }
  if (!resolved.found) {
    res.status(404).json({ error: "client_not_found", reason: resolved.reason });
    return;
  }

  const clientId       = resolved.client.id;
  const correlationId  = randomUUID();

  try {
    // Load current run state
    const snapRes = await pool.query<{ status: string }>(
      `SELECT status FROM discovery_snapshots WHERE id=$1 AND client_id=$2`,
      [runId, clientId],
    );
    if (snapRes.rows.length === 0) {
      res.status(404).json({ error: "run_not_found" });
      return;
    }

    const currentState = normalizeRunState(snapRes.rows[0].status);

    // Reject if not cancellable
    if (!isCancellable(currentState)) {
      res.status(409).json({
        error:        "not_cancellable",
        currentState,
        message:      `Run is in state "${currentState}" and cannot be cancelled.`,
      });

      // Audit: cancellation rejected
      const rejAudit = createAuditEvent({
        clientId, runId, action: "run_cancelled_requested",
        actorType: "user", actorId: userId, correlationId,
        metadata: { rejected: true, reason: "not_cancellable", currentState },
      });
      appendAudit(pool, rejAudit).catch(() => {});
      return;
    }

    // Transition: currentState → cancel_requested
    const seq = await nextTransitionSeq(pool, runId, clientId);
    const record = buildTransitionRecord({
      runId, clientId, seq,
      fromState:  currentState,
      toState:    "cancel_requested",
      reasonCode: "cancellation_requested",
      message:    `Cancellation requested by user ${userId} via API.`,
      actorType:  "user",
      actorId:    userId,
      correlationId,
      metadata:   {},
    });

    await appendTransition(pool, record);
    await updateRunState(pool, runId, clientId, "cancel_requested", { correlationId });

    // Diagnostic event
    const diagSeqRes = await pool.query<{ max: string | null }>(
      `SELECT MAX(seq) AS max FROM discovery_diagnostics WHERE run_id=$1 AND client_id=$2`,
      [runId, clientId],
    );
    const diagSeq = diagSeqRes.rows[0]?.max == null ? 1 : parseInt(diagSeqRes.rows[0].max, 10) + 1;
    const diagEvent = createDiagnosticEvent({
      runId, clientId, seq: diagSeq,
      severity:      "info",
      code:          "cancellation_requested",
      message:       `Cancellation requested by user ${userId}.`,
      retryable:     false,
      correlationId,
    });
    appendDiagnostic(pool, diagEvent).catch(() => {});  // fire-and-forget

    // Audit event
    const auditEvent = createAuditEvent({
      clientId, runId, action: "run_cancelled_requested",
      actorType: "user", actorId: userId, correlationId,
      metadata: { fromState: currentState },
    });
    appendAudit(pool, auditEvent).catch(() => {});  // fire-and-forget

    res.status(202).json({
      accepted:       true,
      runId,
      correlationId,
      previousState:  currentState,
      currentState:   "cancel_requested",
      message:        "Cancellation request accepted. In-flight work will complete before the run is marked cancelled.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[discovery-inspect] cancel failed for run ${runId}: ${msg}`);
    res.status(500).json({ error: "internal_error", message: msg });
  }
});

export default router;
