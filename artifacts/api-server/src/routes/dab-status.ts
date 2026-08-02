import { Router } from "express";
import { pool } from "@workspace/db";
import { classifyDabRuntimeStatus } from "../lib/dab-runtime-status";

const router = Router();

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

router.get("/dab/status", async (_req, res) => {
  const enabled = process.env.DAB_PLANNER_WORKER_ENABLED === "true";
  const intervalMs = parsePositiveInt(process.env.DAB_PLANNER_INTERVAL_MS, 60_000);
  const staleAfterMs = Math.min(Math.max(intervalMs * 3, 180_000), 86_400_000);
  const now = new Date().toISOString();

  const tables = await pool.query<{ heartbeats: string | null; cycles: string | null }>(`
    SELECT
      to_regclass('public.dab_runner_heartbeats')::text AS heartbeats,
      to_regclass('public.dab_runner_cycles')::text AS cycles
  `);

  if (!tables.rows[0]?.heartbeats) {
    const decision = classifyDabRuntimeStatus({
      enabled,
      now,
      intervalMs,
      staleAfterMs,
      heartbeatObservedAt: null,
      readinessStatus: null,
    });
    res.json({
      status: decision.status,
      enabled,
      checkedAt: now,
      intervalMs,
      staleAfterMs,
      latestHeartbeat: null,
      latestCycle: null,
    });
    return;
  }

  const heartbeatResult = await pool.query<{
    runtime_id: string;
    evaluated_at: Date;
    readiness_status: "ready" | "blocked";
    readiness_blockers: unknown;
    reason_code: string;
    attempted_cycle_key: string | null;
    due_slot: string | null;
    next_eligible_at: Date | null;
    consecutive_failures: number;
  }>(`
    SELECT runtime_id, evaluated_at, readiness_status, readiness_blockers,
           reason_code, attempted_cycle_key, due_slot, next_eligible_at,
           consecutive_failures
      FROM dab_runner_heartbeats
     ORDER BY evaluated_at DESC, heartbeat_id DESC
     LIMIT 1
  `);
  const heartbeat = heartbeatResult.rows[0] ?? null;

  const cycleResult = tables.rows[0]?.cycles
    ? await pool.query<{
        cycle_key: string;
        completed_at: Date;
        task_id: string | null;
        operation: string;
        stop_code: string | null;
        outcome: string;
        plan_fingerprint: string;
      }>(`
        SELECT cycle_key, completed_at, task_id, operation, stop_code,
               outcome, plan_fingerprint
          FROM dab_runner_cycles
         ORDER BY completed_at DESC, cycle_key DESC
         LIMIT 1
      `)
    : null;
  const cycle = cycleResult?.rows[0] ?? null;

  const decision = classifyDabRuntimeStatus({
    enabled,
    now,
    intervalMs,
    staleAfterMs,
    heartbeatObservedAt: heartbeat?.evaluated_at.toISOString() ?? null,
    readinessStatus: heartbeat?.readiness_status ?? null,
  });

  res.json({
    status: decision.status,
    enabled,
    checkedAt: now,
    intervalMs,
    staleAfterMs: decision.staleAfterMs,
    heartbeatAgeMs: decision.ageMs,
    latestHeartbeat: heartbeat
      ? {
          runtimeId: heartbeat.runtime_id,
          observedAt: heartbeat.evaluated_at.toISOString(),
          readinessStatus: heartbeat.readiness_status,
          blockers: Array.isArray(heartbeat.readiness_blockers)
            ? heartbeat.readiness_blockers
            : [],
          reasonCode: heartbeat.reason_code,
          attemptedCycleKey: heartbeat.attempted_cycle_key,
          dueSlot: heartbeat.due_slot == null ? null : Number(heartbeat.due_slot),
          nextEligibleAt: heartbeat.next_eligible_at?.toISOString() ?? null,
          consecutiveFailures: heartbeat.consecutive_failures,
        }
      : null,
    latestCycle: cycle
      ? {
          cycleKey: cycle.cycle_key,
          completedAt: cycle.completed_at.toISOString(),
          taskId: cycle.task_id,
          operation: cycle.operation,
          stopCode: cycle.stop_code,
          outcome: cycle.outcome,
          planFingerprint: cycle.plan_fingerprint,
        }
      : null,
  });
});

export default router;
