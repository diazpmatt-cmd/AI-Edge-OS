import { Router } from "express";
import { pool } from "@workspace/db";
import { LEAD_EMAIL_WORKER_KEY } from "../lib/lead-email-persistence";
import { isWorkerStale } from "../lib/lead-email-worker-policy";

const router = Router();

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

router.get("/lead-email/status", async (_req, res) => {
  const checkedAt = new Date();
  const enabled = process.env.LEAD_EMAIL_WORKER_ENABLED === "true";
  const staleAfterMs = positiveInteger(process.env.LEAD_EMAIL_STALE_AFTER_MS, 20 * 60 * 1_000);

  const tables = await pool.query<{ worker_state: string | null }>(`
    SELECT to_regclass('public.lead_email_worker_state')::text AS worker_state
  `);

  if (!tables.rows[0]?.worker_state) {
    res.json({
      status: enabled ? "uninitialized" : "disabled",
      enabled,
      checkedAt: checkedAt.toISOString(),
      staleAfterMs,
      checkpointInternalDateMs: null,
      lastAttemptAt: null,
      lastSuccessfulPollAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
      lastErrorCode: null,
      counts: null,
    });
    return;
  }

  const result = await pool.query<{
    checkpoint_internal_date_ms: string | null;
    last_attempt_at: Date | null;
    last_successful_poll_at: Date | null;
    last_failure_at: Date | null;
    consecutive_failures: number;
    last_error_code: string | null;
    last_listed_count: number;
    last_ingested_count: number;
    last_skipped_count: number;
    last_quarantined_count: number;
    updated_at: Date;
  }>(`SELECT checkpoint_internal_date_ms,last_attempt_at,last_successful_poll_at,last_failure_at,
             consecutive_failures,last_error_code,last_listed_count,last_ingested_count,
             last_skipped_count,last_quarantined_count,updated_at
        FROM lead_email_worker_state WHERE worker_key=$1`, [LEAD_EMAIL_WORKER_KEY]);

  const row = result.rows[0] ?? null;
  const stale = isWorkerStale(row?.last_successful_poll_at ?? null, checkedAt, staleAfterMs);
  const status = !enabled
    ? "disabled"
    : !row
      ? "uninitialized"
      : stale
        ? "stale"
        : row.consecutive_failures > 0
          ? "degraded"
          : "healthy";

  res.json({
    status,
    enabled,
    checkedAt: checkedAt.toISOString(),
    staleAfterMs,
    checkpointInternalDateMs: row?.checkpoint_internal_date_ms == null
      ? null
      : Number(row.checkpoint_internal_date_ms),
    lastAttemptAt: row?.last_attempt_at?.toISOString() ?? null,
    lastSuccessfulPollAt: row?.last_successful_poll_at?.toISOString() ?? null,
    lastFailureAt: row?.last_failure_at?.toISOString() ?? null,
    consecutiveFailures: row?.consecutive_failures ?? 0,
    lastErrorCode: row?.last_error_code ?? null,
    updatedAt: row?.updated_at?.toISOString() ?? null,
    counts: row ? {
      listed: row.last_listed_count,
      ingested: row.last_ingested_count,
      skipped: row.last_skipped_count,
      quarantined: row.last_quarantined_count,
    } : null,
  });
});

export default router;
