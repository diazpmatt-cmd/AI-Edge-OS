import { Router } from "express";
import { getAuth } from "@clerk/express";
import { pool } from "@workspace/db";
import { classifyDabRuntimeStatus } from "../lib/dab-runtime-status";
import { buildApollosCapabilities } from "../lib/apollos-capabilities";
import { decideApollosCommand, routeApollosCommand } from "../lib/apollos-command-router";
import {
  APOLLOS_REPAIR_INSPECTION_ADAPTER_KEYS,
  buildApollosRepairAdapterStatus,
} from "../lib/apollos-repair-adapters";
import { readApollosRepairWorkerConfig } from "../lib/apollos-repair-worker-config";

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
    SELECT to_regclass('public.dab_runner_heartbeats')::text AS heartbeats,
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

function contextCoverage(context: unknown) {
  if (!context || typeof context !== "object") return null;
  const trustedProject = (context as { trustedProject?: unknown }).trustedProject;
  if (!trustedProject || typeof trustedProject !== "object") return null;
  const project = trustedProject as { totalContentBytes?: unknown; coverageDigest?: unknown; sources?: unknown };
  const sources = Array.isArray(project.sources) ? project.sources : [];
  return {
    totalContentBytes: typeof project.totalContentBytes === "number" ? project.totalContentBytes : 0,
    coverageDigest: typeof project.coverageDigest === "string" ? project.coverageDigest : null,
    sources: sources.map((source) => {
      const item = source && typeof source === "object" ? source as Record<string, unknown> : {};
      return {
        id: typeof item.id === "string" ? item.id : "unknown",
        relativePath: typeof item.relativePath === "string" ? item.relativePath : "unknown",
        available: item.available === true,
        required: item.required === true,
        bytes: typeof item.bytes === "number" ? item.bytes : 0,
        digest: typeof item.digest === "string" ? item.digest : null,
        truncated: item.truncated === true,
        provenance: item.provenance === "packaged_repository_document" ? item.provenance : "unknown",
        errorCode: typeof item.errorCode === "string" ? item.errorCode : null,
      };
    }),
  };
}

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
      contextCoverage: null,
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
  const latestRequest = await pool.query<{ context: unknown }>(`SELECT context FROM dab_agent_requests ORDER BY created_at DESC LIMIT 1`);

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
    contextCoverage: contextCoverage(latestRequest.rows[0]?.context),
  });
});


function currentApollosCapabilities() {
  return buildApollosCapabilities({
    agentWorkerEnabled: process.env.DAB_AGENT_WORKER_ENABLED === "true",
    agentProviderEnabled: process.env.DAB_AGENT_PROVIDER_ENABLED === "true",
    agentKillSwitch: process.env.DAB_AGENT_KILL_SWITCH !== "false",
    aiCredentialPresent: Boolean(
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    ),
    preparationWorkerEnabled:
      process.env.DAB_PREPARATION_WORKER_ENABLED === "true",
    preparationKillSwitch:
      process.env.DAB_PREPARATION_KILL_SWITCH !== "false",
    publishingWorkerEnabled:
      process.env.DAB_PUBLISHING_WORKER_ENABLED === "true",
    publishingKillSwitch:
      process.env.DAB_PUBLISHING_KILL_SWITCH !== "false",
    schedulerSecretPresent: Boolean(process.env.SCHEDULER_SECRET),
  });
}

router.get("/dab/apollos-readiness", async (_req, res) => {
  const checkedAt = new Date().toISOString();
  const capabilities = currentApollosCapabilities();
  const capabilityCounts = capabilities.reduce(
    (summary, item) => {
      summary[item.state] += 1;
      return summary;
    },
    { ready: 0, degraded: 0, blocked: 0, disabled: 0 },
  );
  const adapters = buildApollosRepairAdapterStatus(
    process.env,
    APOLLOS_REPAIR_INSPECTION_ADAPTER_KEYS,
  );
  const adapterCounts = adapters.reduce(
    (summary, item) => {
      summary[item.state] += 1;
      return summary;
    },
    { ready: 0, disabled: 0, blocked: 0 },
  );

  let repairConfig: ReturnType<typeof readApollosRepairWorkerConfig> | null = null;
  let repairConfigReason: string | null = null;
  try {
    repairConfig = readApollosRepairWorkerConfig(process.env);
  } catch (error) {
    repairConfigReason =
      error instanceof Error
        ? error.message
        : "APOLLOS_REPAIR_CONFIG_INVALID";
  }

  let heartbeat: { observed_at: Date; state: string; reason_code: string } | null =
    null;
  if (repairConfig) {
    const table = await pool.query<{ heartbeats: string | null }>(
      `SELECT to_regclass(
        'public.apollos_repair_worker_heartbeats'
      )::text AS heartbeats`,
    );
    if (table.rows[0]?.heartbeats) {
      heartbeat = (
        await pool.query<{
          observed_at: Date;
          state: string;
          reason_code: string;
        }>(
          `SELECT observed_at,state,reason_code
             FROM apollos_repair_worker_heartbeats
            WHERE runtime_id=$1
            LIMIT 1`,
          [repairConfig.runtimeId],
        )
      ).rows[0] ?? null;
    }
  }
  const heartbeatStaleAfterMs = repairConfig
    ? Math.min(Math.max(repairConfig.intervalMs * 3, 60_000), 86_400_000)
    : null;
  const heartbeatAgeMs = heartbeat
    ? Math.max(0, Date.now() - heartbeat.observed_at.getTime())
    : null;

  const checks = [
    {
      id: "command-routing",
      status: "pass" as const,
      reasonCode: "APOLLOS_COMMAND_ROUTER_READY",
    },
    {
      id: "capabilities",
      status:
        capabilityCounts.blocked > 0
          ? ("warn" as const)
          : ("pass" as const),
      reasonCode:
        capabilityCounts.blocked > 0
          ? "APOLLOS_CAPABILITIES_BLOCKED"
          : "APOLLOS_CAPABILITIES_READY",
    },
    {
      id: "repair-config",
      status: repairConfig ? ("pass" as const) : ("fail" as const),
      reasonCode:
        repairConfigReason ??
        (repairConfig?.enabled
          ? "APOLLOS_REPAIR_CONFIG_READY"
          : "APOLLOS_REPAIR_WORKER_DISABLED"),
    },
    {
      id: "repair-safety",
      status:
        !repairConfig
          ? ("fail" as const)
          : !repairConfig.enabled
            ? ("warn" as const)
            : repairConfig.killSwitch
              ? ("fail" as const)
              : ("pass" as const),
      reasonCode:
        !repairConfig
          ? "APOLLOS_REPAIR_CONFIG_INVALID"
          : !repairConfig.enabled
            ? "APOLLOS_REPAIR_WORKER_DISABLED"
            : repairConfig.killSwitch
              ? "APOLLOS_REPAIR_KILL_SWITCH"
              : "APOLLOS_REPAIR_SAFETY_READY",
    },
    {
      id: "repair-heartbeat",
      status:
        !repairConfig?.enabled
          ? ("warn" as const)
          : !heartbeat ||
              heartbeatAgeMs === null ||
              heartbeatStaleAfterMs === null ||
              heartbeatAgeMs > heartbeatStaleAfterMs ||
              heartbeat.state !== "ready"
            ? ("fail" as const)
            : ("pass" as const),
      reasonCode:
        !repairConfig?.enabled
          ? "APOLLOS_REPAIR_WORKER_DISABLED"
          : !heartbeat
            ? "APOLLOS_REPAIR_HEARTBEAT_MISSING"
            : heartbeatAgeMs !== null &&
                heartbeatStaleAfterMs !== null &&
                heartbeatAgeMs > heartbeatStaleAfterMs
              ? "APOLLOS_REPAIR_HEARTBEAT_STALE"
              : heartbeat.reason_code,
    },
    {
      id: "repair-adapters",
      status:
        adapterCounts.blocked > 0
          ? ("fail" as const)
          : adapterCounts.ready > 0
            ? ("pass" as const)
            : ("warn" as const),
      reasonCode:
        adapterCounts.blocked > 0
          ? "APOLLOS_REPAIR_ADAPTERS_BLOCKED"
          : adapterCounts.ready > 0
            ? "APOLLOS_REPAIR_ADAPTERS_READY"
            : "APOLLOS_REPAIR_ADAPTERS_DISABLED",
    },
  ];
  const overallStatus = checks.some((check) => check.status === "fail")
    ? "blocked"
    : checks.some((check) => check.status === "warn")
      ? "degraded"
      : "ready";

  res.json({
    operator: "Apollos",
    checkedAt,
    overallStatus,
    checks,
    capabilityCounts,
    adapterCounts,
    repairWorker: repairConfig
      ? {
          enabled: repairConfig.enabled,
          killSwitch: repairConfig.killSwitch,
          intervalMs: repairConfig.intervalMs,
          leaseMs: repairConfig.leaseMs,
          maxAttempts: repairConfig.maxAttempts,
          heartbeatAgeMs,
          heartbeatStaleAfterMs,
        }
      : null,
  });
});

router.get("/dab/repair-runtime", async (_req, res) => {
  const checkedAt = new Date().toISOString();
  let config;
  try {
    config = readApollosRepairWorkerConfig(process.env);
  } catch (error) {
    res.status(503).json({
      operator: "Apollos",
      checkedAt,
      status: "misconfigured",
      reasonCode:
        error instanceof Error
          ? error.message
          : "APOLLOS_REPAIR_CONFIG_INVALID",
    });
    return;
  }

  const tables = await pool.query<{
    tasks: string | null;
    steps: string | null;
    heartbeats: string | null;
  }>(
    `SELECT to_regclass('public.agent_tasks')::text AS tasks,
            to_regclass('public.agent_task_steps')::text AS steps,
            to_regclass('public.apollos_repair_worker_heartbeats')::text AS heartbeats`,
  );
  if (!tables.rows[0]?.tasks || !tables.rows[0]?.steps) {
    res.json({
      operator: "Apollos",
      checkedAt,
      status: config.enabled ? "uninitialized" : "disabled",
      enabled: config.enabled,
      killSwitch: config.killSwitch,
      runtimeId: config.runtimeId,
      limits: {
        intervalMs: config.intervalMs,
        leaseMs: config.leaseMs,
        maxAttempts: config.maxAttempts,
      },
      queue: null,
      latestActivityAt: null,
    });
    return;
  }

  const queue = await pool.query<{
    queued: string;
    running: string;
    completed: string;
    failed: string;
    expired: string;
    oldest_queued_at: Date | null;
    latest_activity_at: Date | null;
  }>(
    `SELECT
       count(*) FILTER (
         WHERE task_type='execute_repair_plan'
           AND status='approved'
           AND resolution='approved'
       )::text AS queued,
       count(*) FILTER (
         WHERE task_type='execute_repair_plan'
           AND status='executing'
       )::text AS running,
       count(*) FILTER (
         WHERE task_type='execute_repair_plan'
           AND status='executed'
       )::text AS completed,
       count(*) FILTER (
         WHERE task_type='execute_repair_plan'
           AND status='failed'
       )::text AS failed,
       count(*) FILTER (
         WHERE task_type='execute_repair_plan'
           AND status='executing'
           AND execution_started_at IS NOT NULL
           AND execution_started_at < now() - ($1::text || ' milliseconds')::interval
       )::text AS expired,
       min(created_at) FILTER (
         WHERE task_type='execute_repair_plan'
           AND status='approved'
           AND resolution='approved'
       ) AS oldest_queued_at,
       max(updated_at) FILTER (
         WHERE task_type='execute_repair_plan'
       ) AS latest_activity_at
     FROM agent_tasks`,
    [config.leaseMs],
  );
  const counts = queue.rows[0];
  const expiredClaims = Number(counts?.expired ?? 0);
  const oldestQueuedAgeMs = counts?.oldest_queued_at
    ? Math.max(0, Date.now() - counts.oldest_queued_at.getTime())
    : null;
  const backlogAfterMs = Math.min(
    Math.max(config.intervalMs * 8, 300_000),
    86_400_000,
  );
  const backlogStalled =
    oldestQueuedAgeMs !== null && oldestQueuedAgeMs > backlogAfterMs;
  const staleAfterMs = Math.min(
    Math.max(config.intervalMs * 3, 60_000),
    86_400_000,
  );
  const heartbeat = tables.rows[0]?.heartbeats
    ? (
        await pool.query<{
          runtime_id: string;
          observed_at: Date;
          state: "ready" | "degraded" | "blocked" | "disabled";
          reason_code: string;
        }>(
          `SELECT runtime_id,observed_at,state,reason_code
             FROM apollos_repair_worker_heartbeats
            WHERE runtime_id=$1
            LIMIT 1`,
          [config.runtimeId],
        )
      ).rows[0] ?? null
    : null;
  const heartbeatAgeMs = heartbeat
    ? Math.max(0, Date.now() - heartbeat.observed_at.getTime())
    : null;
  const status = !config.enabled
    ? "disabled"
    : config.killSwitch
      ? "blocked"
      : !heartbeat
        ? "uninitialized"
        : heartbeatAgeMs !== null && heartbeatAgeMs > staleAfterMs
          ? "degraded"
          : expiredClaims > 0 || backlogStalled
            ? "degraded"
          : heartbeat.state === "ready"
            ? "ready"
            : "degraded";
  const reasonCode =
    status === "disabled"
      ? "APOLLOS_REPAIR_WORKER_DISABLED"
      : status === "blocked"
        ? "APOLLOS_REPAIR_KILL_SWITCH"
        : status === "uninitialized"
          ? "APOLLOS_REPAIR_HEARTBEAT_MISSING"
          : status === "degraded"
            ? heartbeatAgeMs !== null && heartbeatAgeMs > staleAfterMs
              ? "APOLLOS_REPAIR_HEARTBEAT_STALE"
              : expiredClaims > 0
                ? "APOLLOS_REPAIR_EXPIRED_CLAIM"
                : backlogStalled
                  ? "APOLLOS_REPAIR_BACKLOG_STALLED"
                  : heartbeat?.reason_code ?? "APOLLOS_REPAIR_WORKER_DEGRADED"
            : "APOLLOS_REPAIR_WORKER_READY";
  const remediationByReason: Record<
    string,
    { owner: string; nextStep: string }
  > = {
    APOLLOS_REPAIR_WORKER_DISABLED: {
      owner: "deployment",
      nextStep: "Enable APOLLOS_REPAIR_WORKER_ENABLED and redeploy.",
    },
    APOLLOS_REPAIR_KILL_SWITCH: {
      owner: "operator",
      nextStep: "Review the incident, then explicitly release APOLLOS_REPAIR_KILL_SWITCH.",
    },
    APOLLOS_REPAIR_HEARTBEAT_MISSING: {
      owner: "deployment",
      nextStep: "Confirm the repair-worker container is running and inspect its startup log.",
    },
    APOLLOS_REPAIR_HEARTBEAT_STALE: {
      owner: "deployment",
      nextStep: "Restart or redeploy the repair worker, then verify a fresh heartbeat.",
    },
    APOLLOS_REPAIR_EXPIRED_CLAIM: {
      owner: "apollos",
      nextStep: "Allow one worker cycle to recover the expired claim; inspect again if it remains.",
    },
    APOLLOS_REPAIR_BACKLOG_STALLED: {
      owner: "apollos",
      nextStep: "Verify worker heartbeat and kill switch, then inspect the oldest approved repair.",
    },
    APOLLOS_REPAIR_WORKER_TICK_FAILED: {
      owner: "engineering",
      nextStep: "Inspect the repair-worker tick error and the earliest failed checkpoint.",
    },
    APOLLOS_REPAIR_WORKER_READY: {
      owner: "apollos",
      nextStep: "No action required.",
    },
  };
  const remediation = remediationByReason[reasonCode] ?? {
    owner: "engineering",
    nextStep: "Inspect the stable reason code and the latest tenant-scoped repair receipt.",
  };

  res.json({
    operator: "Apollos",
    checkedAt,
    status,
    reasonCode,
    enabled: config.enabled,
    killSwitch: config.killSwitch,
    runtimeId: config.runtimeId,
    limits: {
      intervalMs: config.intervalMs,
      leaseMs: config.leaseMs,
      maxAttempts: config.maxAttempts,
    },
    queue: {
      queued: Number(counts?.queued ?? 0),
      running: Number(counts?.running ?? 0),
      completed: Number(counts?.completed ?? 0),
      failed: Number(counts?.failed ?? 0),
      expired: expiredClaims,
      oldestQueuedAgeMs,
      backlogAfterMs,
    },
    latestActivityAt: counts?.latest_activity_at?.toISOString() ?? null,
    remediation,
    staleAfterMs,
    heartbeatAgeMs,
    latestHeartbeat: heartbeat
      ? {
          runtimeId: heartbeat.runtime_id,
          observedAt: heartbeat.observed_at.toISOString(),
          state: heartbeat.state,
          reasonCode: heartbeat.reason_code,
        }
      : null,
  });
});

router.get("/dab/repair-history", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const tasks = await pool.query<{
    id: string;
    status: string;
    failure_code: string | null;
    decision_note: string | null;
    decision_at: Date | null;
    execution_started_at: Date | null;
    execution_completed_at: Date | null;
    execution_attempts: number;
    created_at: Date;
    updated_at: Date;
    payload: string;
  }>(
    `SELECT id,status,failure_code,decision_note,decision_at,
            execution_started_at,execution_completed_at,execution_attempts,
            created_at,updated_at,payload
       FROM agent_tasks
      WHERE user_id=$1 AND task_type='execute_repair_plan'
      ORDER BY created_at DESC
      LIMIT 25`,
    [userId],
  );

  const taskIds = tasks.rows.map((task) => task.id);
  const steps = taskIds.length === 0
    ? { rows: [] as {
        task_id: string;
        step_key: string;
        position: number;
        capability: string;
        status: string;
        failure_code: string | null;
        attempt_count: number;
        max_attempts: number;
        output_receipt: unknown;
        completed_at: Date | null;
        updated_at: Date;
      }[] }
    : await pool.query<{
        task_id: string;
        step_key: string;
        position: number;
        capability: string;
        status: string;
        failure_code: string | null;
        attempt_count: number;
        max_attempts: number;
        output_receipt: unknown;
        completed_at: Date | null;
        updated_at: Date;
      }>(
        `SELECT task_id,step_key,position,capability,status,failure_code,
                attempt_count,max_attempts,output_receipt,completed_at,updated_at
           FROM agent_task_steps
          WHERE task_id = ANY($1::text[])
          ORDER BY task_id,position ASC`,
        [taskIds],
      );

  const history = tasks.rows.map((task) => {
    let binding: {
      sourceTaskId: string | null;
      planId: string | null;
      diagnosisId: string | null;
    } = { sourceTaskId: null, planId: null, diagnosisId: null };
    try {
      const payload = JSON.parse(task.payload) as Record<string, unknown>;
      binding = {
        sourceTaskId:
          typeof payload.sourceTaskId === "string" ? payload.sourceTaskId : null,
        planId: typeof payload.planId === "string" ? payload.planId : null,
        diagnosisId:
          typeof payload.diagnosisId === "string" ? payload.diagnosisId : null,
      };
    } catch {
      // Keep the task visible with an empty binding; never expose raw payload.
    }
    return {
      taskId: task.id,
      ...binding,
      status: task.status,
      failureCode: task.failure_code,
      failureDetail: task.decision_note,
      createdAt: task.created_at.toISOString(),
      approvedAt: task.decision_at?.toISOString() ?? null,
      executionStartedAt: task.execution_started_at?.toISOString() ?? null,
      executionCompletedAt: task.execution_completed_at?.toISOString() ?? null,
      executionAttempts: task.execution_attempts,
      updatedAt: task.updated_at.toISOString(),
      steps: steps.rows
        .filter((step) => step.task_id === task.id)
        .map((step) => ({
          stepKey: step.step_key,
          position: step.position,
          capability: step.capability,
          status: step.status,
          failureCode: step.failure_code,
          attempts: step.attempt_count,
          maxAttempts: step.max_attempts,
          receipt:
            step.output_receipt && typeof step.output_receipt === "object"
              ? (() => {
                  const receipt = step.output_receipt as Record<string, unknown>;
                  return {
                    bindingVerified:
                      binding.planId !== null &&
                      binding.diagnosisId !== null &&
                      receipt.planId === binding.planId &&
                      receipt.diagnosisId === binding.diagnosisId &&
                      receipt.stepKey === step.step_key,
                    planId:
                      typeof receipt.planId === "string" ? receipt.planId : null,
                    diagnosisId:
                      typeof receipt.diagnosisId === "string"
                        ? receipt.diagnosisId
                        : null,
                    stepKey:
                      typeof receipt.stepKey === "string"
                        ? receipt.stepKey
                        : step.step_key,
                    status:
                      receipt.status === "verified" || receipt.status === "failed"
                        ? receipt.status
                        : null,
                    effect:
                      typeof receipt.effect === "string" ? receipt.effect : null,
                    verification:
                      typeof receipt.verification === "string"
                        ? receipt.verification
                        : null,
                    evidenceDigest:
                      typeof receipt.evidenceDigest === "string" &&
                      /^[a-f0-9]{64}$/.test(receipt.evidenceDigest)
                        ? receipt.evidenceDigest
                        : null,
                    completedAt:
                      typeof receipt.completedAt === "string"
                        ? receipt.completedAt
                        : null,
                  };
                })()
              : null,
          completedAt: step.completed_at?.toISOString() ?? null,
          updatedAt: step.updated_at.toISOString(),
        })),
    };
  });

  const receiptIntegrity = history.reduce(
    (summary, task) => {
      for (const step of task.steps) {
        if (!step.receipt) continue;
        summary.receipts += 1;
        if (step.receipt.bindingVerified) summary.bound += 1;
        else summary.mismatched += 1;
      }
      return summary;
    },
    { receipts: 0, bound: 0, mismatched: 0 },
  );

  res.json({
    operator: "Apollos",
    checkedAt: new Date().toISOString(),
    count: history.length,
    receiptIntegrity,
    history,
  });
});

router.get("/dab/repair-adapters", (_req, res) => {
  const adapters = buildApollosRepairAdapterStatus(
    process.env,
    APOLLOS_REPAIR_INSPECTION_ADAPTER_KEYS,
  );
  const counts = adapters.reduce(
    (summary, adapter) => {
      summary[adapter.state] += 1;
      return summary;
    },
    { ready: 0, disabled: 0, blocked: 0 },
  );
  res.json({
    operator: "Apollos",
    checkedAt: new Date().toISOString(),
    overallStatus:
      counts.blocked > 0 ? "blocked" : counts.ready > 0 ? "ready" : "disabled",
    counts,
    adapters,
  });
});

router.get("/dab/capabilities", (_req, res) => {
  const capabilities = currentApollosCapabilities();
  const counts = capabilities.reduce(
    (summary, item) => {
      summary[item.state] += 1;
      return summary;
    },
    { ready: 0, degraded: 0, blocked: 0, disabled: 0 },
  );

  res.json({
    operator: "Apollos",
    role: "AI Edge engineering and operations",
    checkedAt: new Date().toISOString(),
    overallStatus:
      counts.blocked > 0
        ? "blocked"
        : counts.degraded > 0
          ? "degraded"
          : counts.ready > 0
            ? "ready"
            : "disabled",
    counts,
    capabilities,
  });
});

router.post("/dab/capabilities/resolve", (req, res) => {
  const command =
    typeof req.body?.command === "string" ? req.body.command.trim() : "";
  if (!command) {
    res.status(400).json({
      error: "APOLLOS_COMMAND_REQUIRED",
      message: "A non-empty command is required.",
    });
    return;
  }

  const route = routeApollosCommand(command);
  const decision = decideApollosCommand(route, currentApollosCapabilities());
  res.status(
    decision.disposition === "clarification_required" ? 422 : 200,
  ).json({
    operator: "Apollos",
    checkedAt: new Date().toISOString(),
    command,
    decision,
  });
});

export default router;
