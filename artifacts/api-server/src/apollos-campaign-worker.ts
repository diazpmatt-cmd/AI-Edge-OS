import { pool } from "@workspace/db";
import { logger } from "./lib/logger.js";
import { SCHEDULER_SECRET } from "./lib/scheduler-secret.js";

const enabled = process.env.APOLLOS_CAMPAIGN_WORKER_ENABLED === "true";
const killSwitch = process.env.APOLLOS_CAMPAIGN_KILL_SWITCH !== "false";
const runtimeId =
  process.env.APOLLOS_CAMPAIGN_RUNTIME_ID ?? "apollos-campaign-production-1";
const internalBase =
  process.env.APOLLOS_CAMPAIGN_INTERNAL_BASE_URL ?? "http://api:3000";
const intervalMs = Number(process.env.APOLLOS_CAMPAIGN_INTERVAL_MS ?? 15_000);
const timeoutMs = Number(process.env.APOLLOS_CAMPAIGN_TIMEOUT_MS ?? 900_000);
const maxAttempts = Number(process.env.APOLLOS_CAMPAIGN_MAX_ATTEMPTS ?? 3);
const leaseMs = Number(process.env.APOLLOS_CAMPAIGN_LEASE_MS ?? 1_200_000);
let stopped = false;

interface GenerationJob {
  jobKey: string;
  generatorPlatform: "facebook" | "instagram" | "google" | "youtube";
  count: number;
  weeklyPlanId: string;
  schedulerMode: "weekly_plan";
  approvalMode: "approval_required";
}

function validateJobs(payloadText: string): GenerationJob[] {
  const payload = JSON.parse(payloadText) as {
    generationJobs?: unknown;
  };
  if (!Array.isArray(payload.generationJobs) || payload.generationJobs.length < 1) {
    throw new Error("APOLLOS_WEEKLY_GENERATION_JOBS_MISSING");
  }
  return payload.generationJobs.map((raw) => {
    const job = raw as Partial<GenerationJob>;
    if (
      typeof job.jobKey !== "string" ||
      !["facebook", "instagram", "google", "youtube"].includes(
        String(job.generatorPlatform),
      ) ||
      !Number.isInteger(job.count) ||
      Number(job.count) < 1 ||
      Number(job.count) > 7 ||
      typeof job.weeklyPlanId !== "string" ||
      job.schedulerMode !== "weekly_plan" ||
      job.approvalMode !== "approval_required"
    ) {
      throw new Error("APOLLOS_WEEKLY_GENERATION_JOB_INVALID");
    }
    return job as GenerationJob;
  });
}

async function recoverExpiredClaims() {
  await pool.query(
    `UPDATE agent_tasks
        SET status = CASE
              WHEN execution_attempts >= $1 THEN 'failed'
              ELSE 'approved'
            END,
            failure_code = CASE
              WHEN execution_attempts >= $1
                THEN 'APOLLOS_WEEKLY_RETRIES_EXHAUSTED'
              ELSE 'APOLLOS_WEEKLY_LEASE_EXPIRED'
            END,
            updated_at = now()
      WHERE task_type='weekly_campaign'
        AND status='executing'
        AND execution_started_at < now() - ($2::text || ' milliseconds')::interval`,
    [maxAttempts, leaseMs],
  );
}

async function claimOne() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{
      id: string;
      user_id: string;
      payload: string;
      execution_attempts: number;
    }>(
      `SELECT id, user_id, payload, execution_attempts
         FROM agent_tasks
        WHERE task_type='weekly_campaign'
          AND status='approved'
          AND resolution='approved'
          AND execution_attempts < $1
        ORDER BY decision_at ASC NULLS LAST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
      [maxAttempts],
    );
    const task = found.rows[0];
    if (!task) {
      await client.query("COMMIT");
      return null;
    }
    const claimed = await client.query(
      `UPDATE agent_tasks
          SET status='executing',
              execution_attempts=execution_attempts+1,
              execution_started_at=now(),
              execution_completed_at=NULL,
              failure_code=NULL,
              decision_note=$2,
              updated_at=now()
        WHERE id=$1
        RETURNING id,user_id,payload,execution_attempts`,
      [task.id, `Claimed by ${runtimeId}`],
    );
    await client.query("COMMIT");
    return claimed.rows[0] as {
      id: string;
      user_id: string;
      payload: string;
      execution_attempts: number;
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function runGenerationJob(taskId: string, job: GenerationJob) {
  const response = await fetch(`${internalBase}/api/auto-content/generate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-scheduler-secret": SCHEDULER_SECRET,
      "x-apollos-task-id": taskId,
    },
    body: JSON.stringify({
      platforms: [job.generatorPlatform],
      count: job.count,
      weeklyPlanId: job.weeklyPlanId,
      schedulerMode: job.schedulerMode,
      approvalMode: job.approvalMode,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `APOLLOS_WEEKLY_GENERATION_FAILED:${job.generatorPlatform}:${response.status}:${text.slice(0, 240)}`,
    );
  }
  const result = JSON.parse(text) as {
    ok?: boolean;
    created?: number;
    reason?: string;
  };
  if (result.ok !== true) {
    throw new Error(
      `APOLLOS_WEEKLY_GENERATION_UNVERIFIED:${job.generatorPlatform}`,
    );
  }
  logger.info(
    {
      taskId,
      platform: job.generatorPlatform,
      created: result.created ?? 0,
      idempotency: result.reason ?? null,
    },
    "[apollos-campaign] generation job verified",
  );
}

async function processOne() {
  const task = await claimOne();
  if (!task) return;
  try {
    const jobs = validateJobs(task.payload);
    for (const job of jobs) {
      await runGenerationJob(task.id, job);
    }
    await pool.query(
      `UPDATE agent_tasks
          SET status='executed',
              execution_completed_at=now(),
              failure_code=NULL,
              decision_note='All platform generation jobs verified',
              updated_at=now()
        WHERE id=$1 AND status='executing'`,
      [task.id],
    );
    logger.info({ taskId: task.id }, "[apollos-campaign] weekly batch executed");
  } catch (error) {
    const raw = error instanceof Error ? error.message : "APOLLOS_WEEKLY_EXECUTION_FAILED";
    const code = raw.replace(/Bearer\s+\S+/gi, "[REDACTED]").slice(0, 300);
    const terminal = task.execution_attempts >= maxAttempts;
    await pool.query(
      `UPDATE agent_tasks
          SET status=$2,
              execution_completed_at=CASE WHEN $2='failed' THEN now() ELSE NULL END,
              failure_code=$3,
              decision_note=$4,
              updated_at=now()
        WHERE id=$1 AND status='executing'`,
      [
        task.id,
        terminal ? "failed" : "approved",
        terminal ? "APOLLOS_WEEKLY_RETRIES_EXHAUSTED" : code,
        terminal ? code : `Retry queued after: ${code}`,
      ],
    );
    logger.error(
      { taskId: task.id, code, terminal },
      "[apollos-campaign] weekly batch failed closed",
    );
  }
}

async function main() {
  if (!enabled || killSwitch) {
    logger.info({ enabled, killSwitch }, "[apollos-campaign] disabled");
    return;
  }
  if (
    !Number.isInteger(intervalMs) ||
    intervalMs < 1_000 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 30_000 ||
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > 5
  ) {
    throw new Error("APOLLOS_CAMPAIGN_CONFIG_INVALID");
  }
  logger.info({ runtimeId, internalBase }, "[apollos-campaign] worker started");
  while (!stopped) {
    try {
      await recoverExpiredClaims();
      await processOne();
    } catch (error) {
      logger.error({ error }, "[apollos-campaign] tick failed closed");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopped = true;
  });
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    logger.error({ error }, "[apollos-campaign] startup failed closed");
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
