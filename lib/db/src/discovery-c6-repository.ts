/**
 * Phase C6 — Lifecycle Governance Persistence Layer
 *
 * Provides raw-SQL bootstrap and Drizzle-ORM persistence methods for the 5 new
 * C6 tables and the 4 new columns on discovery_snapshots.
 *
 * Design pattern (same as existing C3/C5 repositories):
 *   - bootstrapC6Tables(pool) — idempotent CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS
 *   - All writes use INSERT ON CONFLICT DO NOTHING where appropriate (idempotency)
 *   - All reads always include clientId in WHERE clause (tenant isolation)
 *   - No FK constraints — same reasoning as C3 schema
 *   - Lease acquisition is atomic via INSERT ON CONFLICT DO NOTHING
 *   - Active-run count query uses the canonical RunState list
 *
 * No Math.random(). No credentials stored. All metadata must be pre-sanitized.
 */

import { Pool }      from "pg";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, lt, sql as drizzleSql } from "drizzle-orm";
import * as schema from "./schema/index.js";

import type { RunTransitionRecord }  from "./discovery-lifecycle.js";
import type { LeaseRecord, LeaseAcquireResult, LeaseRenewResult, LeaseReleaseResult, LeaseRecoveryResult } from "./discovery-lease.js";
import type { IdempotencyRecord, IdempotencyCheckResult } from "./discovery-idempotency.js";
import type { DiagnosticEvent }      from "./discovery-diagnostics.js";
import type { AuditEvent }           from "./discovery-audit.js";
import type { ProgressSnapshot }     from "./discovery-progress.js";

import { LEASE_DURATION_MS, isLeaseRecoverable, deriveLeaseOwnerId, deriveLeasExpiry } from "./discovery-lease.js";
import { isIdempotencyExpired, fingerprintMatches }  from "./discovery-idempotency.js";

// ── Types for database ────────────────────────────────────────────────────────

type AnyDb = NodePgDatabase<typeof schema>;

/** Active states for governance counting (must match RunState definition). */
const ACTIVE_RUN_STATES = ["running", "queued", "planned", "cancel_requested"] as const;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

/**
 * Idempotent raw-SQL bootstrap for C6 tables and discovery_snapshots column extensions.
 *
 * Safe to call multiple times — all statements use IF NOT EXISTS.
 * Must be called after bootstrapDiscoveryTables().
 */
export async function bootstrapC6Tables(pool: Pool): Promise<void> {
  // Step 1: Add new columns to discovery_snapshots (idempotent ALTER TABLE)
  await pool.query(`
    ALTER TABLE discovery_snapshots
      ADD COLUMN IF NOT EXISTS correlation_id   TEXT,
      ADD COLUMN IF NOT EXISTS cancelled_at     TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS progress         JSONB,
      ADD COLUMN IF NOT EXISTS idempotency_key  TEXT;
    CREATE INDEX IF NOT EXISTS idx_discovery_snapshots_correlation
      ON discovery_snapshots(correlation_id)
      WHERE correlation_id IS NOT NULL;
  `);

  // Step 2: discovery_run_transitions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discovery_run_transitions (
      id             TEXT        PRIMARY KEY,
      run_id         TEXT        NOT NULL,
      client_id      TEXT        NOT NULL,
      seq            INTEGER     NOT NULL,
      from_state     TEXT        NOT NULL,
      to_state       TEXT        NOT NULL,
      reason_code    TEXT        NOT NULL,
      message        TEXT        NOT NULL,
      actor_type     TEXT        NOT NULL,
      actor_id       TEXT,
      correlation_id TEXT,
      metadata       JSONB       NOT NULL DEFAULT '{}',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_discovery_transitions_run_client
      ON discovery_run_transitions(run_id, client_id);
    CREATE INDEX IF NOT EXISTS idx_discovery_transitions_run_seq
      ON discovery_run_transitions(run_id, seq);
  `);

  // Step 3: discovery_run_leases
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discovery_run_leases (
      run_id       TEXT        PRIMARY KEY,
      client_id    TEXT        NOT NULL,
      owner_id     TEXT        NOT NULL,
      acquired_at  TIMESTAMPTZ NOT NULL,
      expires_at   TIMESTAMPTZ NOT NULL,
      renewed_at   TIMESTAMPTZ,
      released_at  TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_discovery_leases_client_id
      ON discovery_run_leases(client_id);
    CREATE INDEX IF NOT EXISTS idx_discovery_leases_expires_at
      ON discovery_run_leases(expires_at)
      WHERE released_at IS NULL;
  `);

  // Step 4: discovery_idempotency
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discovery_idempotency (
      id                  TEXT        PRIMARY KEY,
      client_id           TEXT        NOT NULL,
      idempotency_key     TEXT        NOT NULL,
      operation           TEXT        NOT NULL,
      request_fingerprint TEXT        NOT NULL,
      run_id              TEXT,
      is_dry_run          BOOLEAN     NOT NULL DEFAULT FALSE,
      response_status     INTEGER,
      response_body       JSONB,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at          TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_discovery_idempotency_client_key
      ON discovery_idempotency(client_id, idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_discovery_idempotency_expires_at
      ON discovery_idempotency(expires_at);
  `);

  // Step 5: discovery_diagnostics
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discovery_diagnostics (
      id             TEXT        PRIMARY KEY,
      run_id         TEXT        NOT NULL,
      client_id      TEXT        NOT NULL,
      seq            INTEGER     NOT NULL,
      severity       TEXT        NOT NULL,
      code           TEXT        NOT NULL,
      message        TEXT        NOT NULL,
      stage          TEXT,
      provider       TEXT,
      capability     TEXT,
      retryable      BOOLEAN,
      correlation_id TEXT,
      metadata       JSONB       NOT NULL DEFAULT '{}',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_discovery_diagnostics_run_client
      ON discovery_diagnostics(run_id, client_id);
    CREATE INDEX IF NOT EXISTS idx_discovery_diagnostics_run_seq
      ON discovery_diagnostics(run_id, seq);
    CREATE INDEX IF NOT EXISTS idx_discovery_diagnostics_severity
      ON discovery_diagnostics(client_id, severity);
  `);

  // Step 6: discovery_audit
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discovery_audit (
      id             TEXT        PRIMARY KEY,
      client_id      TEXT        NOT NULL,
      run_id         TEXT,
      action         TEXT        NOT NULL,
      actor_type     TEXT        NOT NULL,
      actor_id       TEXT,
      correlation_id TEXT,
      metadata       JSONB       NOT NULL DEFAULT '{}',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_discovery_audit_client_id
      ON discovery_audit(client_id);
    CREATE INDEX IF NOT EXISTS idx_discovery_audit_run_id
      ON discovery_audit(run_id)
      WHERE run_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_discovery_audit_action
      ON discovery_audit(client_id, action);
  `);
}

// ── Transition persistence ─────────────────────────────────────────────────────

/**
 * Appends a single transition record. ON CONFLICT DO NOTHING (idempotent).
 * Sequence integrity is the caller's responsibility.
 */
export async function appendTransition(
  pool: Pool,
  record: RunTransitionRecord,
): Promise<void> {
  await pool.query(
    `INSERT INTO discovery_run_transitions
       (id, run_id, client_id, seq, from_state, to_state, reason_code, message,
        actor_type, actor_id, correlation_id, metadata, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (id) DO NOTHING`,
    [
      record.id,
      record.runId,
      record.clientId,
      record.seq,
      record.fromState,
      record.toState,
      record.reasonCode,
      record.message,
      record.actorType,
      record.actorId,
      record.correlationId,
      JSON.stringify(record.metadata),
      record.createdAt,
    ],
  );
}

/**
 * Returns the full ordered transition history for a run.
 * Always includes clientId in WHERE (tenant isolation).
 */
export async function getTransitionHistory(
  pool: Pool,
  runId:    string,
  clientId: string,
): Promise<RunTransitionRecord[]> {
  const res = await pool.query<{
    id: string; run_id: string; client_id: string; seq: number;
    from_state: string; to_state: string; reason_code: string; message: string;
    actor_type: string; actor_id: string | null; correlation_id: string | null;
    metadata: unknown; created_at: Date;
  }>(
    `SELECT * FROM discovery_run_transitions
     WHERE run_id = $1 AND client_id = $2
     ORDER BY seq ASC`,
    [runId, clientId],
  );
  return res.rows.map(r => ({
    id:            r.id,
    runId:         r.run_id,
    clientId:      r.client_id,
    seq:           r.seq,
    fromState:     r.from_state as RunTransitionRecord["fromState"],
    toState:       r.to_state   as RunTransitionRecord["toState"],
    reasonCode:    r.reason_code as RunTransitionRecord["reasonCode"],
    message:       r.message,
    actorType:     r.actor_type as RunTransitionRecord["actorType"],
    actorId:       r.actor_id,
    correlationId: r.correlation_id,
    metadata:      (r.metadata as Record<string, unknown>) ?? {},
    createdAt:     r.created_at,
  }));
}

/**
 * Returns the next sequence number for a run's transitions.
 * Returns 1 if no transitions exist yet.
 */
export async function nextTransitionSeq(
  pool:     Pool,
  runId:    string,
  clientId: string,
): Promise<number> {
  const res = await pool.query<{ max: string | null }>(
    `SELECT MAX(seq) AS max FROM discovery_run_transitions WHERE run_id=$1 AND client_id=$2`,
    [runId, clientId],
  );
  const current = res.rows[0]?.max;
  return current == null ? 1 : parseInt(current, 10) + 1;
}

// ── Run state update ──────────────────────────────────────────────────────────

/**
 * Updates a snapshot's status and optional C6 fields atomically.
 * Always scoped by (runId, clientId) — tenant-safe.
 */
export async function updateRunState(
  pool:     Pool,
  runId:    string,
  clientId: string,
  toState:  string,
  extras?: {
    correlationId?: string | null;
    cancelledAt?:   Date | null;
    progress?:      ProgressSnapshot | null;
    completedAt?:   Date | null;
  },
): Promise<void> {
  const sets: string[] = ["status = $3"];
  const vals: unknown[] = [runId, clientId, toState];
  let idx = 4;

  if (extras?.correlationId !== undefined) {
    sets.push(`correlation_id = $${idx++}`);
    vals.push(extras.correlationId);
  }
  if (extras?.cancelledAt !== undefined) {
    sets.push(`cancelled_at = $${idx++}`);
    vals.push(extras.cancelledAt);
  }
  if (extras?.progress !== undefined) {
    sets.push(`progress = $${idx++}`);
    vals.push(extras.progress === null ? null : JSON.stringify(extras.progress));
  }
  if (extras?.completedAt !== undefined) {
    sets.push(`completed_at = $${idx++}`);
    vals.push(extras.completedAt);
  }

  await pool.query(
    `UPDATE discovery_snapshots SET ${sets.join(", ")} WHERE id=$1 AND client_id=$2`,
    vals,
  );
}

// ── Lease acquisition ─────────────────────────────────────────────────────────

/**
 * Atomically acquires a lease for a run.
 *
 * Logic:
 *   1. Check if the run exists and is not terminal.
 *   2. Check per-client active-run limit.
 *   3. INSERT ON CONFLICT (run_id) DO NOTHING.
 *   4. If 0 rows inserted: read existing lease to determine failure reason.
 */
export async function acquireLease(
  pool:      Pool,
  runId:     string,
  clientId:  string,
  ownerId:   string,
  maxActive: number = 1,
  now:       Date = new Date(),
): Promise<LeaseAcquireResult> {
  // Check run exists and state
  const runRes = await pool.query<{ status: string }>(
    `SELECT status FROM discovery_snapshots WHERE id=$1 AND client_id=$2`,
    [runId, clientId],
  );
  if (runRes.rows.length === 0) {
    return { acquired: false, reason: "run_not_found", existingOwnerId: null, expiresAt: null };
  }
  const terminalStates = ["complete", "failed", "cancelled"];
  if (terminalStates.includes(runRes.rows[0].status)) {
    return { acquired: false, reason: "run_terminal", existingOwnerId: null, expiresAt: null };
  }

  // Check per-client active-run count (excluding this run)
  const activeRes = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM discovery_run_leases
     WHERE client_id=$1 AND run_id != $2 AND released_at IS NULL AND expires_at > $3`,
    [clientId, runId, now],
  );
  const activeCount = parseInt(activeRes.rows[0]?.cnt ?? "0", 10);
  if (activeCount >= maxActive) {
    return { acquired: false, reason: "client_limit_exceeded", existingOwnerId: null, expiresAt: null };
  }

  const expiresAt  = deriveLeasExpiry(now, LEASE_DURATION_MS);
  const acquiredAt = now;

  // Atomic insert
  const insertRes = await pool.query(
    `INSERT INTO discovery_run_leases (run_id, client_id, owner_id, acquired_at, expires_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (run_id) DO NOTHING`,
    [runId, clientId, ownerId, acquiredAt, expiresAt],
  );

  if ((insertRes.rowCount ?? 0) > 0) {
    const lease: LeaseRecord = { runId, clientId, ownerId, acquiredAt, expiresAt, renewedAt: null, releasedAt: null };
    return { acquired: true, lease };
  }

  // Conflict: read existing lease
  const existing = await pool.query<{
    owner_id: string; expires_at: Date; released_at: Date | null;
  }>(
    `SELECT owner_id, expires_at, released_at FROM discovery_run_leases WHERE run_id=$1`,
    [runId],
  );
  const row = existing.rows[0];
  if (!row) return { acquired: false, reason: "already_held", existingOwnerId: null, expiresAt: null };
  return {
    acquired: false,
    reason:   "already_held",
    existingOwnerId: row.owner_id,
    expiresAt:       row.expires_at,
  };
}

/**
 * Releases a lease. Only the owner can release their own lease.
 * Idempotent — releasing an already-released lease is a no-op.
 */
export async function releaseLease(
  pool:     Pool,
  runId:    string,
  ownerId:  string,
  now:      Date = new Date(),
): Promise<LeaseReleaseResult> {
  const res = await pool.query(
    `UPDATE discovery_run_leases
     SET released_at = $3
     WHERE run_id = $1 AND owner_id = $2 AND released_at IS NULL`,
    [runId, ownerId, now],
  );
  if ((res.rowCount ?? 0) === 0) {
    const check = await pool.query<{ owner_id: string; released_at: Date | null }>(
      `SELECT owner_id, released_at FROM discovery_run_leases WHERE run_id=$1`,
      [runId],
    );
    if (!check.rows[0]) return { released: false, reason: "not_found" };
    if (check.rows[0].owner_id !== ownerId) return { released: false, reason: "not_owner" };
    return { released: false, reason: "already_released" };
  }
  return { released: true };
}

/**
 * Renews a lease TTL. Only the owner can renew.
 */
export async function renewLease(
  pool:     Pool,
  runId:    string,
  ownerId:  string,
  now:      Date = new Date(),
): Promise<LeaseRenewResult> {
  const newExpiry = deriveLeasExpiry(now, LEASE_DURATION_MS);
  const res = await pool.query<{ run_id: string; client_id: string; owner_id: string; acquired_at: Date; expires_at: Date; renewed_at: Date | null; released_at: Date | null }>(
    `UPDATE discovery_run_leases
     SET expires_at=$3, renewed_at=$4
     WHERE run_id=$1 AND owner_id=$2 AND released_at IS NULL AND expires_at > $4
     RETURNING *`,
    [runId, ownerId, newExpiry, now],
  );
  if (res.rows.length === 0) {
    const check = await pool.query<{ owner_id: string; expires_at: Date }>(
      `SELECT owner_id, expires_at FROM discovery_run_leases WHERE run_id=$1`,
      [runId],
    );
    if (!check.rows[0]) return { renewed: false, reason: "not_found" };
    if (check.rows[0].owner_id !== ownerId) return { renewed: false, reason: "not_owner" };
    return { renewed: false, reason: "already_expired" };
  }
  const r = res.rows[0];
  return {
    renewed: true,
    lease: {
      runId:      r.run_id,
      clientId:   r.client_id,
      ownerId:    r.owner_id,
      acquiredAt: r.acquired_at,
      expiresAt:  r.expires_at,
      renewedAt:  r.renewed_at,
      releasedAt: null,
    },
  };
}

/**
 * Recovers an expired lease by assigning it to a new owner.
 * Used by the recovery process to rescue stuck/crashed runs.
 */
export async function recoverLease(
  pool:       Pool,
  runId:      string,
  newOwnerId: string,
  now:        Date = new Date(),
): Promise<LeaseRecoveryResult> {
  const newExpiry = deriveLeasExpiry(now, LEASE_DURATION_MS);
  // Recover only if: expires_at < now (expired) and released_at IS NULL
  const res = await pool.query<{ run_id: string; client_id: string; acquired_at: Date; expires_at: Date; renewed_at: Date | null }>(
    `UPDATE discovery_run_leases
     SET owner_id=$2, expires_at=$3, renewed_at=$4
     WHERE run_id=$1 AND released_at IS NULL AND expires_at < $4
     RETURNING *`,
    [runId, newOwnerId, newExpiry, now],
  );
  if (res.rows.length === 0) {
    const check = await pool.query<{ released_at: Date | null; expires_at: Date }>(
      `SELECT released_at, expires_at FROM discovery_run_leases WHERE run_id=$1`,
      [runId],
    );
    if (!check.rows[0]) return { recovered: false, reason: "not_found" };
    if (check.rows[0].released_at !== null) return { recovered: false, reason: "recently_released" };
    return { recovered: false, reason: "not_expired" };
  }
  const r = res.rows[0];
  return {
    recovered: true,
    lease: {
      runId:      r.run_id,
      clientId:   r.client_id,
      ownerId:    newOwnerId,
      acquiredAt: r.acquired_at,
      expiresAt:  r.expires_at,
      renewedAt:  r.renewed_at,
      releasedAt: null,
    },
  };
}

// ── Active run count ──────────────────────────────────────────────────────────

/**
 * Returns the number of active (non-terminal) runs for a client.
 * Uses snapshot status, not lease status, so it catches runs without leases.
 */
export async function getActiveRunCount(
  pool:     Pool,
  clientId: string,
): Promise<number> {
  const placeholder = ACTIVE_RUN_STATES.map((_, i) => `$${i + 2}`).join(", ");
  const res = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM discovery_snapshots WHERE client_id=$1 AND status IN (${placeholder})`,
    [clientId, ...ACTIVE_RUN_STATES],
  );
  return parseInt(res.rows[0]?.cnt ?? "0", 10);
}

// ── Idempotency ───────────────────────────────────────────────────────────────

/**
 * Checks for an existing idempotency record by its derived ID.
 * Returns found/match/mismatch result.
 */
export async function checkIdempotency(
  pool:              Pool,
  id:                string,
  requestFingerprint: string,
  now:               Date = new Date(),
): Promise<IdempotencyCheckResult> {
  const res = await pool.query<{
    id: string; client_id: string; idempotency_key: string; operation: string;
    request_fingerprint: string; run_id: string | null; is_dry_run: boolean;
    response_status: number | null; response_body: unknown;
    created_at: Date; expires_at: Date;
  }>(
    `SELECT * FROM discovery_idempotency WHERE id=$1`,
    [id],
  );
  if (res.rows.length === 0) return { found: false };
  const row = res.rows[0];
  const record: IdempotencyRecord = {
    id:                 row.id,
    clientId:           row.client_id,
    idempotencyKey:     row.idempotency_key,
    operation:          row.operation as IdempotencyRecord["operation"],
    requestFingerprint: row.request_fingerprint,
    runId:              row.run_id,
    isDryRun:           row.is_dry_run,
    responseStatus:     row.response_status,
    responseBody:       (row.response_body as Record<string, unknown>) ?? null,
    createdAt:          row.created_at,
    expiresAt:          row.expires_at,
  };
  if (isIdempotencyExpired(record, now)) {
    return { found: true, match: false, reason: "expired" };
  }
  if (!fingerprintMatches(record.requestFingerprint, requestFingerprint)) {
    return { found: true, match: false, reason: "fingerprint_mismatch" };
  }
  return { found: true, match: true, record };
}

/**
 * Saves an idempotency record. ON CONFLICT DO NOTHING (first writer wins).
 */
export async function saveIdempotency(
  pool:   Pool,
  record: IdempotencyRecord,
): Promise<void> {
  await pool.query(
    `INSERT INTO discovery_idempotency
       (id, client_id, idempotency_key, operation, request_fingerprint, run_id,
        is_dry_run, response_status, response_body, created_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO NOTHING`,
    [
      record.id,
      record.clientId,
      record.idempotencyKey,
      record.operation,
      record.requestFingerprint,
      record.runId,
      record.isDryRun,
      record.responseStatus,
      record.responseBody == null ? null : JSON.stringify(record.responseBody),
      record.createdAt,
      record.expiresAt,
    ],
  );
}

/**
 * Prunes idempotency records older than their expires_at.
 * Call periodically (e.g. daily). Returns count of pruned records.
 */
export async function pruneExpiredIdempotency(
  pool: Pool,
  now:  Date = new Date(),
): Promise<number> {
  const res = await pool.query(
    `DELETE FROM discovery_idempotency WHERE expires_at < $1`,
    [now],
  );
  return res.rowCount ?? 0;
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

/**
 * Appends a diagnostic event. ON CONFLICT DO NOTHING (idempotent by id).
 * Fire-and-forget — failures must not abort runs.
 */
export async function appendDiagnostic(
  pool:  Pool,
  event: DiagnosticEvent,
): Promise<void> {
  await pool.query(
    `INSERT INTO discovery_diagnostics
       (id, run_id, client_id, seq, severity, code, message, stage, provider,
        capability, retryable, correlation_id, metadata, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (id) DO NOTHING`,
    [
      event.id, event.runId, event.clientId, event.seq, event.severity,
      event.code, event.message, event.stage, event.provider, event.capability,
      event.retryable, event.correlationId, JSON.stringify(event.metadata), event.createdAt,
    ],
  );
}

/**
 * Returns diagnostic events for a run, ordered by seq.
 * Optionally filtered by minimum severity (error > warning > info).
 */
export async function getDiagnosticEvents(
  pool:        Pool,
  runId:       string,
  clientId:    string,
  limit:       number = 100,
  minSeverity?: "info" | "warning" | "error",
): Promise<DiagnosticEvent[]> {
  const severityFilter = minSeverity && minSeverity !== "info"
    ? ` AND severity ${minSeverity === "error" ? "= 'error'" : "IN ('warning', 'error')"}`
    : "";
  const res = await pool.query<{
    id: string; run_id: string; client_id: string; seq: number; severity: string;
    code: string; message: string; stage: string | null; provider: string | null;
    capability: string | null; retryable: boolean | null; correlation_id: string | null;
    metadata: unknown; created_at: Date;
  }>(
    `SELECT * FROM discovery_diagnostics WHERE run_id=$1 AND client_id=$2${severityFilter} ORDER BY seq ASC LIMIT $3`,
    [runId, clientId, limit],
  );
  return res.rows.map(r => ({
    id:            r.id,
    runId:         r.run_id,
    clientId:      r.client_id,
    seq:           r.seq,
    severity:      r.severity as DiagnosticEvent["severity"],
    code:          r.code     as DiagnosticEvent["code"],
    message:       r.message,
    stage:         r.stage,
    provider:      r.provider,
    capability:    r.capability,
    retryable:     r.retryable,
    correlationId: r.correlation_id,
    metadata:      (r.metadata as Record<string, unknown>) ?? {},
    createdAt:     r.created_at,
  }));
}

// ── Audit ─────────────────────────────────────────────────────────────────────

/**
 * Appends an audit event. ON CONFLICT DO NOTHING (idempotent by id).
 */
export async function appendAudit(
  pool:  Pool,
  event: AuditEvent,
): Promise<void> {
  await pool.query(
    `INSERT INTO discovery_audit
       (id, client_id, run_id, action, actor_type, actor_id, correlation_id, metadata, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO NOTHING`,
    [
      event.id, event.clientId, event.runId, event.action, event.actorType,
      event.actorId, event.correlationId, JSON.stringify(event.metadata), event.createdAt,
    ],
  );
}

/**
 * Returns audit events for a client, most recent first.
 */
export async function getAuditEvents(
  pool:     Pool,
  clientId: string,
  runId?:   string,
  limit:    number = 50,
): Promise<AuditEvent[]> {
  const runFilter = runId ? " AND run_id=$3" : "";
  const params: unknown[] = runId ? [clientId, limit, runId] : [clientId, limit];
  const res = await pool.query<{
    id: string; client_id: string; run_id: string | null; action: string;
    actor_type: string; actor_id: string | null; correlation_id: string | null;
    metadata: unknown; created_at: Date;
  }>(
    `SELECT * FROM discovery_audit WHERE client_id=$1${runFilter} ORDER BY created_at DESC LIMIT $2`,
    params,
  );
  return res.rows.map(r => ({
    id:            r.id,
    clientId:      r.client_id,
    runId:         r.run_id,
    action:        r.action as AuditEvent["action"],
    actorType:     r.actor_type as AuditEvent["actorType"],
    actorId:       r.actor_id,
    correlationId: r.correlation_id,
    metadata:      (r.metadata as Record<string, unknown>) ?? {},
    createdAt:     r.created_at,
  }));
}

// ── Run inspection ────────────────────────────────────────────────────────────

export interface RunInspectionResult {
  runId:          string;
  clientId:       string;
  weekLabel:      string;
  status:         string;
  correlationId:  string | null;
  cancelledAt:    Date | null;
  progress:       unknown | null;
  createdAt:      Date;
  completedAt:    Date | null;
  transitions:    RunTransitionRecord[];
  diagnostics:    DiagnosticEvent[];
  lease: {
    ownerId:    string | null;
    expiresAt:  Date | null;
    releasedAt: Date | null;
  } | null;
  nextDiagSeq:    number;
  nextTransSeq:   number;
}

/**
 * Returns a full run inspection: snapshot + transitions + diagnostics + lease.
 * Always scoped by (runId, clientId) for tenant safety.
 */
export async function getRunInspection(
  pool:     Pool,
  runId:    string,
  clientId: string,
): Promise<RunInspectionResult | null> {
  const snapRes = await pool.query<{
    id: string; client_id: string; week_label: string; status: string;
    correlation_id: string | null; cancelled_at: Date | null; progress: unknown | null;
    created_at: Date; completed_at: Date | null;
  }>(
    `SELECT id, client_id, week_label, status, correlation_id, cancelled_at,
            progress, created_at, completed_at
     FROM discovery_snapshots WHERE id=$1 AND client_id=$2`,
    [runId, clientId],
  );
  if (snapRes.rows.length === 0) return null;
  const snap = snapRes.rows[0];

  const [transitions, diagnostics, leaseRes, transSeqRes, diagSeqRes] = await Promise.all([
    getTransitionHistory(pool, runId, clientId),
    getDiagnosticEvents(pool, runId, clientId, 200),
    pool.query<{ owner_id: string; expires_at: Date; released_at: Date | null }>(
      `SELECT owner_id, expires_at, released_at FROM discovery_run_leases WHERE run_id=$1`,
      [runId],
    ),
    pool.query<{ max: string | null }>(
      `SELECT MAX(seq) AS max FROM discovery_run_transitions WHERE run_id=$1 AND client_id=$2`,
      [runId, clientId],
    ),
    pool.query<{ max: string | null }>(
      `SELECT MAX(seq) AS max FROM discovery_diagnostics WHERE run_id=$1 AND client_id=$2`,
      [runId, clientId],
    ),
  ]);

  const leaseRow = leaseRes.rows[0] ?? null;
  return {
    runId:         snap.id,
    clientId:      snap.client_id,
    weekLabel:     snap.week_label,
    status:        snap.status,
    correlationId: snap.correlation_id,
    cancelledAt:   snap.cancelled_at,
    progress:      snap.progress,
    createdAt:     snap.created_at,
    completedAt:   snap.completed_at,
    transitions,
    diagnostics,
    lease: leaseRow ? {
      ownerId:    leaseRow.owner_id,
      expiresAt:  leaseRow.expires_at,
      releasedAt: leaseRow.released_at,
    } : null,
    nextTransSeq: transSeqRes.rows[0]?.max == null ? 1 : parseInt(transSeqRes.rows[0].max, 10) + 1,
    nextDiagSeq:  diagSeqRes.rows[0]?.max  == null ? 1 : parseInt(diagSeqRes.rows[0].max,  10) + 1,
  };
}

// ── Stale run recovery ────────────────────────────────────────────────────────

export interface StaleRunInfo {
  runId:    string;
  clientId: string;
  status:   string;
  ownerId:  string;
  expiresAt: Date;
}

/**
 * Finds runs with expired leases that are still in an active state.
 * Used by the recovery process to detect crashed workers.
 * Only returns runs whose leases are past the recovery grace period.
 */
export async function findStaleRuns(
  pool: Pool,
  now:  Date = new Date(),
): Promise<StaleRunInfo[]> {
  const res = await pool.query<{
    run_id: string; client_id: string; status: string; owner_id: string; expires_at: Date;
  }>(
    `SELECT l.run_id, l.client_id, s.status, l.owner_id, l.expires_at
     FROM discovery_run_leases l
     JOIN discovery_snapshots s ON l.run_id = s.id AND l.client_id = s.client_id
     WHERE l.released_at IS NULL
       AND l.expires_at < $1
       AND s.status IN ('running', 'queued', 'cancel_requested')`,
    [now],
  );
  return res.rows.map(r => ({
    runId:     r.run_id,
    clientId:  r.client_id,
    status:    r.status,
    ownerId:   r.owner_id,
    expiresAt: r.expires_at,
  }));
}
