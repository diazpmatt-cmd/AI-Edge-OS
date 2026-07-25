/**
 * C8R-9 — Backlink Scheduler Monitor
 *
 * Tick function that drives scheduled backlink discovery runs for all eligible
 * tenants.  Called by startScheduler() at a configurable interval.
 *
 * Scheduling lifecycle (per row):
 *   1. Query backlink_discovery_schedule for rows where enabled=true, next_run_at <= NOW().
 *   2. POST /api/backlinks/ingest/scheduled with x-scheduler-secret + x-scheduler-client-id.
 *      The route selects the best available provider (live > fixture).
 *   3. On success:  reset consecutive_failures, update last_success_at, advance next_run_at.
 *   4. On provider_unavailable:  log + advance schedule by 1 day (no failure counter bump).
 *   5. On failure:  increment consecutive_failures, apply exponential backoff.
 *   6. If consecutive_failures ≥ max_retries:  auto-disable the schedule row.
 *
 * Security:
 *   - Uses x-scheduler-secret for internal trust boundary (never exposes credentials).
 *   - Client identity is x-scheduler-client-id, verified in the route handler.
 *   - No secrets or credentials stored in this file.
 */

import { pool } from "@workspace/db";
import {
  backoffMs,
  shouldAutoDisable,
  calcNextRunAt,
  parseBacklinkScheduleFrequency,
  parseBacklinkSchedulerEnvConfig,
} from "@workspace/db";
import { SCHEDULER_SECRET } from "./scheduler-secret.js";
import { logger } from "./logger.js";

interface ScheduleRow {
  id:                   string;
  client_id:            string;
  frequency:            string;
  max_retries:          number;
  consecutive_failures: number;
}

interface ScheduledIngestResponse {
  ok:              boolean;
  providerStatus?: string;
  [key: string]:   unknown;
}

export async function runBacklinkSchedulerMonitor(): Promise<void> {
  const envConfig = parseBacklinkSchedulerEnvConfig();
  let rows: ScheduleRow[];

  try {
    const result = await pool.query<ScheduleRow>(
      `SELECT id, client_id, frequency, max_retries, consecutive_failures
       FROM backlink_discovery_schedule
       WHERE enabled = TRUE
         AND next_run_at IS NOT NULL
         AND next_run_at <= NOW()
       ORDER BY next_run_at ASC
       LIMIT $1`,
      [envConfig.maxPerTick],
    );
    rows = result.rows;
  } catch {
    return; // table may not yet exist on first startup — ignore gracefully
  }

  if (!rows.length) return;
  logger.info({ count: rows.length }, "[backlink-scheduler] scheduled runs due");

  const port = parseInt(process.env.PORT ?? "8080", 10);
  const base  = `http://127.0.0.1:${port}`;

  for (const row of rows) {
    const logCtx = { clientId: row.client_id, frequency: row.frequency };

    try {
      const res = await fetch(`${base}/api/backlinks/ingest/scheduled`, {
        method:  "POST",
        headers: {
          "Content-Type":          "application/json",
          "x-scheduler-secret":    SCHEDULER_SECRET,
          "x-scheduler-client-id": row.client_id,
        },
        body: JSON.stringify({}),
      });

      let body: ScheduledIngestResponse = { ok: false };
      try { body = (await res.json()) as ScheduledIngestResponse; } catch { /* ignore parse failures */ }

      if (res.ok && body.ok) {
        const now    = new Date();
        const nextAt = calcNextRunAt(parseBacklinkScheduleFrequency(row.frequency), now);

        await pool.query(
          `UPDATE backlink_discovery_schedule
           SET last_run_at           = NOW(),
               last_success_at       = NOW(),
               last_run_status       = 'succeeded',
               consecutive_failures  = 0,
               next_run_at           = $1,
               updated_at            = NOW()
           WHERE id = $2`,
          [nextAt, row.id],
        );
        logger.info({ ...logCtx, nextAt }, "[backlink-scheduler] run succeeded — schedule advanced");

      } else if (body.providerStatus === "provider_unavailable") {
        // No configured provider — advance by 1 day without bumping failure counter
        const nextAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await pool.query(
          `UPDATE backlink_discovery_schedule
           SET last_run_at      = NOW(),
               last_run_status  = 'provider_unavailable',
               next_run_at      = $1,
               updated_at       = NOW()
           WHERE id = $2`,
          [nextAt, row.id],
        );
        logger.info({ ...logCtx }, "[backlink-scheduler] provider unavailable — advancing schedule by 1 day");

      } else {
        // Genuine failure — apply backoff or auto-disable
        const newFails    = row.consecutive_failures + 1;
        const autoDisable = shouldAutoDisable(newFails, row.max_retries);
        const delayMs     = backoffMs(newFails);
        const nextAt      = autoDisable ? null : new Date(Date.now() + delayMs);

        await pool.query(
          `UPDATE backlink_discovery_schedule
           SET last_run_at           = NOW(),
               last_run_status       = 'failed',
               consecutive_failures  = $1,
               enabled               = $2,
               next_run_at           = $3,
               updated_at            = NOW()
           WHERE id = $4`,
          [newFails, !autoDisable, nextAt, row.id],
        );

        if (autoDisable) {
          logger.warn({ ...logCtx, newFails }, "[backlink-scheduler] auto-disabled after max failures");
        } else {
          logger.warn({ ...logCtx, newFails, nextAt }, "[backlink-scheduler] run failed — backoff applied");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ ...logCtx, err: msg }, "[backlink-scheduler] tick error");
    }
  }
}
