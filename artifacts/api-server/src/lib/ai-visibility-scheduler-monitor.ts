/**
 * C9R-5 — AI Visibility Scheduler Monitor
 *
 * Tick function that drives scheduled AI query scans for all eligible tenants.
 * Called by startScheduler() in scheduler.ts when AI_VISIBILITY_SCHEDULER_ENABLED=true.
 *
 * Lifecycle (per schedule row):
 *   1. Query ai_visibility_schedule for rows where enabled=true, next_run_at <= NOW().
 *   2. POST /api/ai-visibility/query-scan/:clientId with x-scheduler-secret + x-scheduler-client-id.
 *      The route records triggerSource='scheduled' in the scan record.
 *   3. On success:  reset consecutive_failures, update last_success_at, advance next_run_at.
 *   4. On failure:  increment consecutive_failures, apply exponential backoff.
 *   5. If consecutive_failures >= max_retries:  auto-disable the schedule row.
 *
 * Security:
 *   - Uses x-scheduler-secret for internal trust boundary.
 *   - Client identity is x-scheduler-client-id (slug), verified in the route.
 *   - No credentials stored here.
 *
 * Disabled by default: no rows have enabled=true until an admin calls
 *   PUT /api/ai-visibility/schedule/:clientId  { enabled: true, frequency: "weekly" }
 */

import {
  pool,
  calcAiVisibilityNextRunAt,
  parseAiScheduleFrequency,
  aiVisibilityBackoffMs,
  aiVisibilityShouldAutoDisable,
  parseAiVisibilitySchedulerEnvConfig,
} from "@workspace/db";
import { SCHEDULER_SECRET } from "./scheduler-secret.js";
import { logger } from "./logger.js";

// ── In-flight guard — prevents duplicate runs per client within a single tick ─

const inFlightClients = new Set<string>();

// ── Internal row shape ────────────────────────────────────────────────────────

interface ScheduleRow {
  id:                   string;
  client_id:            string;
  frequency:            string;
  max_retries:          number;
  consecutive_failures: number;
}

// ── Scheduler tick ────────────────────────────────────────────────────────────

export async function runAiVisibilitySchedulerMonitor(): Promise<void> {
  const envConfig = parseAiVisibilitySchedulerEnvConfig();
  let rows: ScheduleRow[];

  try {
    const result = await pool.query<ScheduleRow>(
      `SELECT id, client_id, frequency, max_retries, consecutive_failures
       FROM ai_visibility_schedule
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
  logger.info({ count: rows.length }, "[ai-visibility-scheduler] scheduled scans due");

  const port = parseInt(process.env.PORT ?? "8080", 10);
  const base  = `http://127.0.0.1:${port}`;

  for (const row of rows) {
    if (inFlightClients.has(row.client_id)) {
      logger.info({ clientId: row.client_id }, "[ai-visibility-scheduler] skipping — already in flight");
      continue;
    }

    inFlightClients.add(row.client_id);
    const logCtx = { clientId: row.client_id, frequency: row.frequency };

    try {
      const res = await fetch(`${base}/api/ai-visibility/query-scan/${row.client_id}`, {
        method:  "POST",
        headers: {
          "Content-Type":          "application/json",
          "x-scheduler-secret":    SCHEDULER_SECRET,
          "x-scheduler-client-id": row.client_id,
        },
        body: JSON.stringify({ triggerSource: "scheduled" }),
      });

      let body: Record<string, unknown> = {};
      try { body = (await res.json()) as Record<string, unknown>; } catch { /* ignore */ }

      if (res.ok) {
        const now    = new Date();
        const nextAt = calcAiVisibilityNextRunAt(
          parseAiScheduleFrequency(row.frequency),
          now,
        );

        await pool.query(
          `UPDATE ai_visibility_schedule
           SET last_run_at          = NOW(),
               last_success_at      = NOW(),
               consecutive_failures = 0,
               next_run_at          = $1,
               updated_at           = NOW()
           WHERE id = $2`,
          [nextAt, row.id],
        );
        logger.info({ ...logCtx, nextAt }, "[ai-visibility-scheduler] scan succeeded — schedule advanced");

      } else {
        const newFails    = row.consecutive_failures + 1;
        const autoDisable = aiVisibilityShouldAutoDisable(newFails, row.max_retries);
        const delayMs     = aiVisibilityBackoffMs(newFails);
        const nextAt      = autoDisable ? null : new Date(Date.now() + delayMs);

        await pool.query(
          `UPDATE ai_visibility_schedule
           SET last_run_at          = NOW(),
               consecutive_failures = $1,
               enabled              = $2,
               next_run_at          = $3,
               updated_at           = NOW()
           WHERE id = $4`,
          [newFails, !autoDisable, nextAt, row.id],
        );

        if (autoDisable) {
          logger.warn({ ...logCtx, newFails, httpStatus: res.status, body },
            "[ai-visibility-scheduler] auto-disabled after max failures");
        } else {
          logger.warn({ ...logCtx, newFails, nextAt, httpStatus: res.status, body },
            "[ai-visibility-scheduler] scan failed — backoff applied");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ ...logCtx, err: msg }, "[ai-visibility-scheduler] tick error");

      // Still advance the failure counter so transient errors don't loop forever
      try {
        const newFails    = row.consecutive_failures + 1;
        const autoDisable = aiVisibilityShouldAutoDisable(newFails, row.max_retries);
        const delayMs     = aiVisibilityBackoffMs(newFails);
        const nextAt      = autoDisable ? null : new Date(Date.now() + delayMs);
        await pool.query(
          `UPDATE ai_visibility_schedule
           SET last_run_at = NOW(), consecutive_failures = $1, enabled = $2, next_run_at = $3, updated_at = NOW()
           WHERE id = $4`,
          [newFails, !autoDisable, nextAt, row.id],
        );
      } catch { /* best-effort */ }
    } finally {
      inFlightClients.delete(row.client_id);
    }
  }
}
