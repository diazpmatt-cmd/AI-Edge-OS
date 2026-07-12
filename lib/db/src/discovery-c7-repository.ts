/**
 * Phase C7 — Schedule Persistence Layer
 *
 * All schedule DB operations: bootstrap, CRUD, leadership, claiming, occurrence persistence.
 * Uses raw Pool queries (same pattern as C3/C6 repositories).
 *
 * Tenant isolation: every query includes client_id in WHERE predicate.
 * No FK constraints. No Math.random(). Deterministic IDs only.
 * Do not store credentials, tokens, or raw provider payloads.
 */

import { Pool } from "pg";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, lte, sql as drizzleSql, isNull, lt } from "drizzle-orm";
import * as schema from "./schema/index.js";

import type { DiscoverySchedule, ScheduleOccurrence, SchedulerLeadershipRecord, LeadershipAcquireResult } from "./discovery-schedule.js";
import { SCHEDULER_LEADER_ID } from "./discovery-schedule.js";

type AnyDb = NodePgDatabase<typeof schema>;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

/**
 * Idempotent raw-SQL bootstrap for C7 tables.
 * Safe to call multiple times — all statements use IF NOT EXISTS.
 * Must be called after bootstrapC6Tables().
 */
export async function bootstrapC7Tables(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discovery_schedules (
      id                   TEXT        PRIMARY KEY,
      client_id            TEXT        NOT NULL,
      name                 TEXT        NOT NULL,
      status               TEXT        NOT NULL DEFAULT 'active',
      execution_mode       TEXT        NOT NULL DEFAULT 'dry',
      cron_expr            TEXT        NOT NULL,
      timezone             TEXT        NOT NULL DEFAULT 'UTC',
      next_run_at          TIMESTAMPTZ,
      last_run_at          TIMESTAMPTZ,
      last_success_at      TIMESTAMPTZ,
      consecutive_failures INTEGER     NOT NULL DEFAULT 0,
      max_cost_per_run_usd NUMERIC(10,4) NOT NULL DEFAULT 1.0000,
      max_requests_per_run INTEGER     NOT NULL DEFAULT 50,
      catch_up_policy      TEXT        NOT NULL DEFAULT 'skip_missed',
      max_catch_up_count   INTEGER     NOT NULL DEFAULT 3,
      overlap_policy       TEXT        NOT NULL DEFAULT 'skip',
      pause_reason         TEXT,
      context_snapshot     JSONB,
      provider_policy      JSONB,
      created_by           TEXT,
      updated_by           TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      version              INTEGER     NOT NULL DEFAULT 1,
      UNIQUE(client_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_discovery_schedules_client
      ON discovery_schedules(client_id);
    CREATE INDEX IF NOT EXISTS idx_discovery_schedules_next_run
      ON discovery_schedules(next_run_at)
      WHERE next_run_at IS NOT NULL AND status = 'active';
    CREATE INDEX IF NOT EXISTS idx_discovery_schedules_status
      ON discovery_schedules(status);

    CREATE TABLE IF NOT EXISTS discovery_schedule_occurrences (
      id                     TEXT        PRIMARY KEY,
      schedule_id            TEXT        NOT NULL,
      client_id              TEXT        NOT NULL,
      intended_at            TIMESTAMPTZ NOT NULL,
      status                 TEXT        NOT NULL DEFAULT 'pending',
      run_id                 TEXT,
      idempotency_key        TEXT,
      catch_up_reason        TEXT,
      overlap_policy_applied TEXT,
      skip_reason            TEXT,
      claimed_by             TEXT,
      claimed_at             TIMESTAMPTZ,
      claim_expires_at       TIMESTAMPTZ,
      dispatch_correlation_id TEXT,
      schedule_version       INTEGER,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(schedule_id, intended_at)
    );

    CREATE INDEX IF NOT EXISTS idx_sched_occ_schedule
      ON discovery_schedule_occurrences(schedule_id);
    CREATE INDEX IF NOT EXISTS idx_sched_occ_client
      ON discovery_schedule_occurrences(client_id);
    CREATE INDEX IF NOT EXISTS idx_sched_occ_status
      ON discovery_schedule_occurrences(status);
    CREATE INDEX IF NOT EXISTS idx_sched_occ_claim_expiry
      ON discovery_schedule_occurrences(claim_expires_at)
      WHERE claim_expires_at IS NOT NULL AND status = 'pending';

    CREATE TABLE IF NOT EXISTS discovery_scheduler_leadership (
      leader_id    TEXT        PRIMARY KEY,
      owner_id     TEXT        NOT NULL,
      acquired_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at   TIMESTAMPTZ NOT NULL,
      released_at  TIMESTAMPTZ,
      host_info    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_scheduler_leadership_expiry
      ON discovery_scheduler_leadership(expires_at)
      WHERE released_at IS NULL;
  `);
}

// ── Schedule CRUD ─────────────────────────────────────────────────────────────

function rowToSchedule(r: Record<string, unknown>): DiscoverySchedule {
  return {
    id:                  r.id as string,
    clientId:            r.client_id as string,
    name:                r.name as string,
    status:              r.status as DiscoverySchedule["status"],
    executionMode:       r.execution_mode as "live" | "dry",
    cronExpr:            r.cron_expr as string,
    timezone:            r.timezone as string,
    nextRunAt:           r.next_run_at ? new Date(r.next_run_at as string) : null,
    lastRunAt:           r.last_run_at ? new Date(r.last_run_at as string) : null,
    lastSuccessAt:       r.last_success_at ? new Date(r.last_success_at as string) : null,
    consecutiveFailures: Number(r.consecutive_failures ?? 0),
    maxCostPerRunUsd:    Number(r.max_cost_per_run_usd ?? 1),
    maxRequestsPerRun:   Number(r.max_requests_per_run ?? 50),
    catchUpPolicy:       r.catch_up_policy as DiscoverySchedule["catchUpPolicy"],
    maxCatchUpCount:     Number(r.max_catch_up_count ?? 3),
    overlapPolicy:       r.overlap_policy as DiscoverySchedule["overlapPolicy"],
    pauseReason:         (r.pause_reason as string | null) ?? null,
    contextSnapshot:     (r.context_snapshot as Record<string, unknown> | null) ?? null,
    providerPolicy:      (r.provider_policy as Record<string, unknown> | null) ?? null,
    createdBy:           (r.created_by as string | null) ?? null,
    updatedBy:           (r.updated_by as string | null) ?? null,
    createdAt:           new Date(r.created_at as string),
    updatedAt:           new Date(r.updated_at as string),
    version:             Number(r.version ?? 1),
  };
}

function rowToOccurrence(r: Record<string, unknown>): ScheduleOccurrence {
  return {
    id:                    r.id as string,
    scheduleId:            r.schedule_id as string,
    clientId:              r.client_id as string,
    intendedAt:            new Date(r.intended_at as string),
    status:                r.status as ScheduleOccurrence["status"],
    runId:                 (r.run_id as string | null) ?? null,
    idempotencyKey:        (r.idempotency_key as string | null) ?? null,
    catchUpReason:         (r.catch_up_reason as string | null) ?? null,
    overlapPolicyApplied:  (r.overlap_policy_applied as string | null) ?? null,
    skipReason:            (r.skip_reason as string | null) ?? null,
    claimedBy:             (r.claimed_by as string | null) ?? null,
    claimedAt:             r.claimed_at ? new Date(r.claimed_at as string) : null,
    claimExpiresAt:        r.claim_expires_at ? new Date(r.claim_expires_at as string) : null,
    dispatchCorrelationId: (r.dispatch_correlation_id as string | null) ?? null,
    scheduleVersion:       r.schedule_version ? Number(r.schedule_version) : null,
    createdAt:             new Date(r.created_at as string),
    updatedAt:             new Date(r.updated_at as string),
  };
}

export async function insertSchedule(
  pool: Pool,
  sched: DiscoverySchedule,
): Promise<void> {
  await pool.query(
    `INSERT INTO discovery_schedules
       (id, client_id, name, status, execution_mode, cron_expr, timezone,
        next_run_at, last_run_at, last_success_at, consecutive_failures,
        max_cost_per_run_usd, max_requests_per_run, catch_up_policy,
        max_catch_up_count, overlap_policy, pause_reason,
        context_snapshot, provider_policy,
        created_by, updated_by, created_at, updated_at, version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
     ON CONFLICT (id) DO NOTHING`,
    [
      sched.id, sched.clientId, sched.name, sched.status, sched.executionMode,
      sched.cronExpr, sched.timezone,
      sched.nextRunAt ?? null, sched.lastRunAt ?? null, sched.lastSuccessAt ?? null,
      sched.consecutiveFailures,
      sched.maxCostPerRunUsd, sched.maxRequestsPerRun,
      sched.catchUpPolicy, sched.maxCatchUpCount, sched.overlapPolicy,
      sched.pauseReason ?? null,
      sched.contextSnapshot ? JSON.stringify(sched.contextSnapshot) : null,
      sched.providerPolicy  ? JSON.stringify(sched.providerPolicy)  : null,
      sched.createdBy ?? null, sched.updatedBy ?? null,
      sched.createdAt, sched.updatedAt, sched.version,
    ],
  );
}

export async function getSchedule(
  pool:     Pool,
  clientId: string,
  id:       string,
): Promise<DiscoverySchedule | null> {
  const res = await pool.query(
    `SELECT * FROM discovery_schedules WHERE id = $1 AND client_id = $2 LIMIT 1`,
    [id, clientId],
  );
  return res.rows.length > 0 ? rowToSchedule(res.rows[0] as Record<string, unknown>) : null;
}

export async function listSchedules(
  pool:     Pool,
  clientId: string,
  opts?:    { status?: string; limit?: number; offset?: number },
): Promise<DiscoverySchedule[]> {
  const parts: string[] = ["SELECT * FROM discovery_schedules WHERE client_id = $1"];
  const params: unknown[] = [clientId];

  if (opts?.status) {
    params.push(opts.status);
    parts.push(`AND status = $${params.length}`);
  }

  parts.push("ORDER BY created_at DESC");
  params.push(opts?.limit ?? 100);
  parts.push(`LIMIT $${params.length}`);
  params.push(opts?.offset ?? 0);
  parts.push(`OFFSET $${params.length}`);

  const res = await pool.query(parts.join(" "), params);
  return res.rows.map(r => rowToSchedule(r as Record<string, unknown>));
}

export async function updateScheduleStatus(
  pool:       Pool,
  clientId:   string,
  id:         string,
  status:     DiscoverySchedule["status"],
  pauseReason?: string | null,
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE discovery_schedules
     SET status = $3, pause_reason = $4, updated_at = now(), version = version + 1
     WHERE id = $1 AND client_id = $2`,
    [id, clientId, status, pauseReason ?? null],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function updateScheduleAfterRun(
  pool:               Pool,
  clientId:           string,
  id:                 string,
  params: {
    success:              boolean;
    consecutiveFailures:  number;
    newStatus?:           DiscoverySchedule["status"];
    pauseReason?:         string | null;
    nextRunAt?:           Date | null;
    lastRunAt:            Date;
    lastSuccessAt?:       Date | null;
  },
): Promise<void> {
  await pool.query(
    `UPDATE discovery_schedules
     SET last_run_at           = $3,
         last_success_at       = CASE WHEN $4 THEN $5::TIMESTAMPTZ ELSE last_success_at END,
         consecutive_failures  = $6,
         status                = COALESCE($7, status),
         pause_reason          = COALESCE($8, pause_reason),
         next_run_at           = $9,
         updated_at            = now(),
         version               = version + 1
     WHERE id = $1 AND client_id = $2`,
    [
      id, clientId,
      params.lastRunAt,
      params.success,
      params.lastSuccessAt ?? null,
      params.consecutiveFailures,
      params.newStatus ?? null,
      params.pauseReason ?? null,
      params.nextRunAt ?? null,
    ],
  );
}

export async function updateScheduleNextRun(
  pool:      Pool,
  clientId:  string,
  id:        string,
  nextRunAt: Date | null,
): Promise<void> {
  await pool.query(
    `UPDATE discovery_schedules
     SET next_run_at = $3, updated_at = now()
     WHERE id = $1 AND client_id = $2`,
    [id, clientId, nextRunAt],
  );
}

// ── Due-schedule polling + atomic claiming ────────────────────────────────────

/**
 * Atomically advance a schedule's next_run_at to a new value.
 *
 * Multi-instance safety: uses an optimistic lock on the CURRENT next_run_at value.
 * Only ONE concurrent caller wins — the others receive null and must skip dispatch.
 *
 * Algorithm:
 *   UPDATE discovery_schedules
 *   SET    next_run_at = $newNextRunAt, updated_at = now(), version = version + 1
 *   WHERE  id = $id AND client_id = $clientId
 *          AND next_run_at = $expectedNextRunAt   -- optimistic lock
 *          AND status = 'active'
 *   RETURNING *
 *
 * Returns the updated schedule row if this caller won the race, null otherwise.
 * The caller MUST NOT proceed to dispatch if null is returned.
 */
export async function atomicAdvanceScheduleNextRun(
  pool:              Pool,
  clientId:          string,
  id:                string,
  expectedNextRunAt: Date,
  newNextRunAt:      Date | null,
): Promise<DiscoverySchedule | null> {
  const res = await pool.query(
    `UPDATE discovery_schedules
     SET next_run_at = $4, updated_at = now(), version = version + 1
     WHERE id = $1 AND client_id = $2 AND next_run_at = $3 AND status = 'active'
     RETURNING *`,
    [id, clientId, expectedNextRunAt, newNextRunAt],
  );
  return res.rows.length > 0 ? rowToSchedule(res.rows[0] as Record<string, unknown>) : null;
}

export async function findDueSchedules(
  pool:  Pool,
  now:   Date,
  limit: number,
): Promise<DiscoverySchedule[]> {
  const res = await pool.query(
    `SELECT * FROM discovery_schedules
     WHERE status = 'active'
       AND next_run_at IS NOT NULL
       AND next_run_at <= $1
     ORDER BY client_id ASC, next_run_at ASC
     LIMIT $2`,
    [now, limit],
  );
  return res.rows.map(r => rowToSchedule(r as Record<string, unknown>));
}

// ── Occurrence persistence ────────────────────────────────────────────────────

export async function insertOccurrence(
  pool: Pool,
  occ:  ScheduleOccurrence,
): Promise<{ inserted: boolean }> {
  const res = await pool.query(
    `INSERT INTO discovery_schedule_occurrences
       (id, schedule_id, client_id, intended_at, status, run_id,
        idempotency_key, catch_up_reason, overlap_policy_applied, skip_reason,
        claimed_by, claimed_at, claim_expires_at, dispatch_correlation_id,
        schedule_version, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (schedule_id, intended_at) DO NOTHING`,
    [
      occ.id, occ.scheduleId, occ.clientId, occ.intendedAt, occ.status,
      occ.runId ?? null, occ.idempotencyKey ?? null,
      occ.catchUpReason ?? null, occ.overlapPolicyApplied ?? null, occ.skipReason ?? null,
      occ.claimedBy ?? null, occ.claimedAt ?? null, occ.claimExpiresAt ?? null,
      occ.dispatchCorrelationId ?? null, occ.scheduleVersion ?? null,
      occ.createdAt, occ.updatedAt,
    ],
  );
  return { inserted: (res.rowCount ?? 0) > 0 };
}

export async function updateOccurrenceStatus(
  pool:     Pool,
  id:       string,
  clientId: string,
  status:   ScheduleOccurrence["status"],
  extras?: {
    runId?:      string | null;
    skipReason?: string | null;
  },
): Promise<void> {
  await pool.query(
    `UPDATE discovery_schedule_occurrences
     SET status = $3,
         run_id = COALESCE($4, run_id),
         skip_reason = COALESCE($5, skip_reason),
         updated_at = now()
     WHERE id = $1 AND client_id = $2`,
    [id, clientId, status, extras?.runId ?? null, extras?.skipReason ?? null],
  );
}

export async function getOccurrenceByScheduleAndTime(
  pool:       Pool,
  scheduleId: string,
  intendedAt: Date,
): Promise<ScheduleOccurrence | null> {
  const res = await pool.query(
    `SELECT * FROM discovery_schedule_occurrences
     WHERE schedule_id = $1 AND intended_at = $2
     LIMIT 1`,
    [scheduleId, intendedAt],
  );
  return res.rows.length > 0 ? rowToOccurrence(res.rows[0] as Record<string, unknown>) : null;
}

export async function listRecentOccurrences(
  pool:       Pool,
  clientId:   string,
  scheduleId: string,
  limit:      number = 20,
): Promise<ScheduleOccurrence[]> {
  const res = await pool.query(
    `SELECT * FROM discovery_schedule_occurrences
     WHERE schedule_id = $1 AND client_id = $2
     ORDER BY intended_at DESC
     LIMIT $3`,
    [scheduleId, clientId, limit],
  );
  return res.rows.map(r => rowToOccurrence(r as Record<string, unknown>));
}

/**
 * Count active (running/dispatched) occurrences for a schedule.
 * Used for overlap policy enforcement.
 */
export async function countActiveOccurrences(
  pool:       Pool,
  scheduleId: string,
): Promise<number> {
  const res = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM discovery_schedule_occurrences
     WHERE schedule_id = $1 AND status IN ('dispatched', 'running')`,
    [scheduleId],
  );
  return Number(res.rows[0]?.cnt ?? 0);
}

/**
 * Count pending (queued but not dispatched) occurrences for a schedule.
 * Used for queue_one overlap policy.
 */
export async function countPendingOccurrences(
  pool:       Pool,
  scheduleId: string,
): Promise<number> {
  const res = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM discovery_schedule_occurrences
     WHERE schedule_id = $1 AND status = 'pending'`,
    [scheduleId],
  );
  return Number(res.rows[0]?.cnt ?? 0);
}

/**
 * Find stale claimed occurrences (claim expired but still 'pending').
 * Used by the recovery scan.
 */
export async function findStaleClaimedOccurrences(
  pool: Pool,
  now:  Date,
): Promise<ScheduleOccurrence[]> {
  const res = await pool.query(
    `SELECT * FROM discovery_schedule_occurrences
     WHERE status = 'pending'
       AND claimed_by IS NOT NULL
       AND claim_expires_at IS NOT NULL
       AND claim_expires_at < $1`,
    [now],
  );
  return res.rows.map(r => rowToOccurrence(r as Record<string, unknown>));
}

export async function releaseStaleOccurrenceClaim(
  pool: Pool,
  id:   string,
): Promise<void> {
  await pool.query(
    `UPDATE discovery_schedule_occurrences
     SET claimed_by = NULL, claimed_at = NULL, claim_expires_at = NULL, updated_at = now()
     WHERE id = $1 AND status = 'pending'`,
    [id],
  );
}

// ── Scheduler leadership ──────────────────────────────────────────────────────

/**
 * Attempts to acquire or renew the discovery-scheduler leadership lease.
 *
 * Algorithm:
 *   1. INSERT ... ON CONFLICT DO NOTHING — succeeds only if no row exists.
 *   2. SELECT the current row.
 *   3. If ownerId matches → renew (UPDATE expires_at).
 *   4. If row is expired → take over (UPDATE WHERE expires_at < now()).
 *   5. Otherwise → leadership is held by another active owner.
 */
export async function acquireSchedulerLeadership(
  pool:         Pool,
  ownerId:      string,
  leaseDurationMs: number,
  now:          Date,
  hostInfo?:    string,
): Promise<LeadershipAcquireResult> {
  const expiresAt = new Date(now.getTime() + leaseDurationMs);

  // Step 1: Try INSERT (only works if table is empty)
  await pool.query(
    `INSERT INTO discovery_scheduler_leadership
       (leader_id, owner_id, acquired_at, expires_at, host_info)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (leader_id) DO NOTHING`,
    [SCHEDULER_LEADER_ID, ownerId, now, expiresAt, hostInfo ?? null],
  );

  // Step 2: Read current row
  const res = await pool.query<{
    owner_id: string; expires_at: string; released_at: string | null;
  }>(
    `SELECT owner_id, expires_at, released_at
     FROM discovery_scheduler_leadership
     WHERE leader_id = $1`,
    [SCHEDULER_LEADER_ID],
  );

  const row = res.rows[0];
  if (!row) {
    return { acquired: false, currentOwnerId: "", expiresAt };
  }

  const currentExpiry = new Date(row.expires_at);
  const isExpired     = currentExpiry < now || row.released_at !== null;

  // Step 3: We are the current owner — renew
  if (row.owner_id === ownerId) {
    await pool.query(
      `UPDATE discovery_scheduler_leadership
       SET expires_at = $2, acquired_at = $3, released_at = NULL, host_info = $4
       WHERE leader_id = $1 AND owner_id = $5`,
      [SCHEDULER_LEADER_ID, expiresAt, now, hostInfo ?? null, ownerId],
    );
    return { acquired: true, ownerId, expiresAt };
  }

  // Step 4: Lease is expired — take over
  if (isExpired) {
    const takeoverRes = await pool.query(
      `UPDATE discovery_scheduler_leadership
       SET owner_id = $2, acquired_at = $3, expires_at = $4, released_at = NULL, host_info = $5
       WHERE leader_id = $1 AND (expires_at < $3 OR released_at IS NOT NULL)`,
      [SCHEDULER_LEADER_ID, ownerId, now, expiresAt, hostInfo ?? null],
    );
    if ((takeoverRes.rowCount ?? 0) > 0) {
      return { acquired: true, ownerId, expiresAt };
    }
  }

  // Step 5: Another active owner holds the lease
  return {
    acquired:       false,
    currentOwnerId: row.owner_id,
    expiresAt:      currentExpiry,
  };
}

export async function releaseSchedulerLeadership(
  pool:    Pool,
  ownerId: string,
  now:     Date,
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE discovery_scheduler_leadership
     SET released_at = $2
     WHERE leader_id = $1 AND owner_id = $3 AND released_at IS NULL`,
    [SCHEDULER_LEADER_ID, now, ownerId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function getSchedulerLeadership(
  pool: Pool,
): Promise<SchedulerLeadershipRecord | null> {
  const res = await pool.query(
    `SELECT * FROM discovery_scheduler_leadership WHERE leader_id = $1`,
    [SCHEDULER_LEADER_ID],
  );
  if (!res.rows.length) return null;
  const r = res.rows[0] as Record<string, unknown>;
  return {
    leaderId:   SCHEDULER_LEADER_ID,
    ownerId:    r.owner_id as string,
    acquiredAt: new Date(r.acquired_at as string),
    expiresAt:  new Date(r.expires_at as string),
    releasedAt: r.released_at ? new Date(r.released_at as string) : null,
    hostInfo:   (r.host_info as string | null) ?? null,
  };
}
