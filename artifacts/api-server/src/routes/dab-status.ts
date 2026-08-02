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
    const decision = classifyDabRuntimeStatus({ enabled, now, intervalMs, staleAfterMs, heartbeatObservedAt: null, readinessStatus: null });
    res.json({ status: decision.status, enabled, checkedAt: now, intervalMs, staleAfterMs, latestHeartbeat: null, latestCycle: null });
    return;
  }

  const heartbeatResult = await pool.query<{
    runtime_id: string; evaluated_at: Date; readiness_status: "ready" | "blocked"; readiness_blockers: unknown;
    reason_code: string; attempted_cycle_key: string | null; due_slot: string | null; next_eligible_at: Date | null; consecutive_failures: number;
  }>(`SELECT runtime_id, evaluated_at, readiness_status, readiness_blockers, reason_code, attempted_cycle_key, due_slot, next_eligible_at, consecutive_failures
      FROM dab_runner_heartbeats ORDER BY evaluated_at DESC, heartbeat_id DESC LIMIT 1`);
  const heartbeat = heartbeatResult.rows[0] ?? null;

  const cycleResult = tables.rows[0]?.cycles ? await pool.query<{
    cycle_key: string; completed_at: Date; task_id: string | null; operation: string; stop_code: string | null; outcome: string; plan_fingerprint: string;
  }>(`SELECT cycle_key, completed_at, task_id, operation, stop_code, outcome, plan_fingerprint
      FROM dab_runner_cycles ORDER BY completed_at DESC, cycle_key DESC LIMIT 1`) : null;
  const cycle = cycleResult?.rows[0] ?? null;

  const decision = classifyDabRuntimeStatus({
    enabled, now, intervalMs, staleAfterMs,
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
    latestHeartbeat: heartbeat ? {
      runtimeId: heartbeat.runtime_id,
      observedAt: heartbeat.evaluated_at.toISOString(),
      readinessStatus: heartbeat.readiness_status,
      blockers: Array.isArray(heartbeat.readiness_blockers) ? heartbeat.readiness_blockers : [],
      reasonCode: heartbeat.reason_code,
      attemptedCycleKey: heartbeat.attempted_cycle_key,
      dueSlot: heartbeat.due_slot == null ? null : Number(heartbeat.due_slot),
      nextEligibleAt: heartbeat.next_eligible_at?.toISOString() ?? null,
      consecutiveFailures: heartbeat.consecutive_failures,
    } : null,
    latestCycle: cycle ? {
      cycleKey: cycle.cycle_key,
      completedAt: cycle.completed_at.toISOString(),
      taskId: cycle.task_id,
      operation: cycle.operation,
      stopCode: cycle.stop_code,
      outcome: cycle.outcome,
      planFingerprint: cycle.plan_fingerprint,
    } : null,
  });
});

router.get("/dab/agent-status", async (_req, res) => {
  const checkedAt = new Date().toISOString();
  const workerEnabled = process.env.DAB_AGENT_WORKER_ENABLED === "true";
  const providerEnabled = process.env.DAB_AGENT_PROVIDER_ENABLED === "true";
  const killSwitch = process.env.DAB_AGENT_KILL_SWITCH !== "false";
  const credentialPresent = Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
  const dailyRequestLimit = parsePositiveInt(process.env.DAB_AGENT_DAILY_REQUEST_LIMIT, 12);
  const dailyTokenLimit = parsePositiveInt(process.env.DAB_AGENT_DAILY_TOKEN_LIMIT, 24_000);

  const tables = await pool.query<{ requests: string | null; runs: string | null; results: string | null }>(`
    SELECT to_regclass('public.dab_agent_requests')::text AS requests,
           to_regclass('public.dab_agent_runs')::text AS runs,
           to_regclass('public.dab_agent_results')::text AS results
  `);
  if (!tables.rows[0]?.requests || !tables.rows[0]?.runs) {
    res.json({
      status: workerEnabled ? "uninitialized" : "disabled",
      checkedAt,
      workerEnabled,
      providerEnabled,
      killSwitch,
      providerReady: providerEnabled && !killSwitch && credentialPresent,
      queue: null,
      budget: { dailyRequestLimit, dailyTokenLimit, requestsUsed: 0, tokensUsed: 0 },
      latestRun: null,
      latestResult: null,
    });
    return;
  }

  const queue = await pool.query<{ queued: string; running: string; failed: string; succeeded: string }>(`
    SELECT count(*) FILTER (WHERE status='queued')::text AS queued,
           count(*) FILTER (WHERE status='running')::text AS running,
           count(*) FILTER (WHERE status='failed')::text AS failed,
           count(*) FILTER (WHERE status='succeeded')::text AS succeeded
      FROM dab_agent_requests`);
  const budget = await pool.query<{ requests_used: string; tokens_used: string }>(`
    SELECT count(*)::text AS requests_used,
           COALESCE(sum(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)),0)::text AS tokens_used
      FROM dab_agent_runs WHERE started_at >= date_trunc('day', now())`);
  const latestRun = await pool.query<{
    run_id: string; request_id: string; runtime_id: string; model: string; started_at: Date; completed_at: Date | null;
    status: string; input_tokens: number | null; output_tokens: number | null; failure_code: string | null;
  }>(`SELECT run_id, request_id, runtime_id, model, started_at, completed_at, status, input_tokens, output_tokens, failure_code
      FROM dab_agent_runs ORDER BY started_at DESC LIMIT 1`);
  const latestResult = tables.rows[0]?.results ? await pool.query<{
    request_id: string; run_id: string; created_at: Date; recommendation: unknown;
  }>(`SELECT request_id, run_id, created_at, recommendation FROM dab_agent_results ORDER BY created_at DESC LIMIT 1`) : null;

  const requestsUsed = Number(budget.rows[0]?.requests_used ?? 0);
  const tokensUsed = Number(budget.rows[0]?.tokens_used ?? 0);
  const providerReady = providerEnabled && !killSwitch && credentialPresent;
  const budgetExhausted = requestsUsed >= dailyRequestLimit || tokensUsed >= dailyTokenLimit;
  const status = !workerEnabled ? "disabled" : !providerReady ? "blocked" : budgetExhausted ? "budget_exhausted" : "ready";

  res.json({
    status,
    checkedAt,
    workerEnabled,
    providerEnabled,
    killSwitch,
    providerReady,
    queue: {
      queued: Number(queue.rows[0]?.queued ?? 0),
      running: Number(queue.rows[0]?.running ?? 0),
      failed: Number(queue.rows[0]?.failed ?? 0),
      succeeded: Number(queue.rows[0]?.succeeded ?? 0),
    },
    budget: { dailyRequestLimit, dailyTokenLimit, requestsUsed, tokensUsed, exhausted: budgetExhausted },
    latestRun: latestRun.rows[0] ? {
      runId: latestRun.rows[0].run_id,
      requestId: latestRun.rows[0].request_id,
      runtimeId: latestRun.rows[0].runtime_id,
      model: latestRun.rows[0].model,
      startedAt: latestRun.rows[0].started_at.toISOString(),
      completedAt: latestRun.rows[0].completed_at?.toISOString() ?? null,
      status: latestRun.rows[0].status,
      inputTokens: latestRun.rows[0].input_tokens,
      outputTokens: latestRun.rows[0].output_tokens,
      failureCode: latestRun.rows[0].failure_code,
    } : null,
    latestResult: latestResult?.rows[0] ? {
      requestId: latestResult.rows[0].request_id,
      runId: latestResult.rows[0].run_id,
      createdAt: latestResult.rows[0].created_at.toISOString(),
      recommendation: latestResult.rows[0].recommendation,
    } : null,
  });
});

export default router;
