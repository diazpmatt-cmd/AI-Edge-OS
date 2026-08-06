import { pool } from "@workspace/db";
import { createHash } from "node:crypto";
import { logger } from "./lib/logger.js";
import { SCHEDULER_SECRET } from "./lib/scheduler-secret.js";
import {
  decideCheckpointAction,
  validateCheckpointDefinitions,
  type ApollosCheckpointDefinition,
} from "./lib/apollos-checkpoints.js";
import {
  assertWeeklyGenerationContract,
  type WeeklyCampaignPlan,
  type WeeklyGenerationJob,
} from "./lib/apollos-weekly-campaign.js";

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

type GenerationJob = WeeklyGenerationJob;

function validateJobs(payloadText: string): GenerationJob[] {
  const payload = JSON.parse(payloadText) as {
    batchKey?: unknown;
    plan?: unknown;
    generationJobs?: unknown;
  };
  if (
    typeof payload.batchKey !== "string" ||
    !payload.plan ||
    !Array.isArray(payload.generationJobs) ||
    payload.generationJobs.length < 1
  ) {
    throw new Error("APOLLOS_WEEKLY_GENERATION_JOBS_MISSING");
  }
  const plan = payload.plan as WeeklyCampaignPlan;
  const jobs = payload.generationJobs as GenerationJob[];
  assertWeeklyGenerationContract(payload.batchKey, plan, jobs);
  return jobs;
}

interface CheckpointRow {
  step_key: string;
  position: number;
  capability: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  attempt_count: number;
  max_attempts: number;
  input_digest: string;
  lease_expires_at: Date | null;
}

function checkpointDefinitions(
  jobs: readonly GenerationJob[],
): readonly ApollosCheckpointDefinition[] {
  return validateCheckpointDefinitions(
    jobs.map((job, position) => ({
      stepKey: `generate:${job.generatorPlatform}`,
      position,
      capability: "prepare",
      inputDigest: createHash("sha256")
        .update(JSON.stringify({
          jobKey: job.jobKey,
          planFingerprint: job.planFingerprint,
          platform: job.platform,
          generatorPlatform: job.generatorPlatform,
          count: job.count,
          weeklyPlanId: job.weeklyPlanId,
          schedulerMode: job.schedulerMode,
          approvalMode: job.approvalMode,
        }))
        .digest("hex"),
      maxAttempts,
    })),
  );
}

async function ensureCheckpoints(
  taskId: string,
  definitions: readonly ApollosCheckpointDefinition[],
): Promise<void> {
  for (const step of definitions) {
    await pool.query(
      `INSERT INTO agent_task_steps
        (task_id, step_key, position, capability, status, max_attempts, input_digest)
       VALUES ($1,$2,$3,$4,'pending',$5,$6)
       ON CONFLICT (task_id, step_key) DO NOTHING`,
      [
        taskId,
        step.stepKey,
        step.position,
        step.capability,
        step.maxAttempts,
        step.inputDigest,
      ],
    );
  }
  const existing = await pool.query<CheckpointRow>(
    `SELECT step_key, position, capability, status, attempt_count,
            max_attempts, input_digest, lease_expires_at
       FROM agent_task_steps
      WHERE task_id=$1
      ORDER BY position ASC`,
    [taskId],
  );
  if (existing.rows.length !== definitions.length) {
    throw new Error("APOLLOS_CHECKPOINT_COUNT_MISMATCH");
  }
  for (const definition of definitions) {
    const row = existing.rows.find((item) => item.step_key === definition.stepKey);
    if (
      !row ||
      row.position !== definition.position ||
      row.capability !== definition.capability ||
      row.input_digest !== definition.inputDigest
    ) {
      throw new Error(
        `APOLLOS_CHECKPOINT_BINDING_MISMATCH:${definition.stepKey}`,
      );
    }
  }
}

async function claimCheckpoint(
  taskId: string,
  definition: ApollosCheckpointDefinition,
): Promise<"run" | "skip"> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<CheckpointRow>(
      `SELECT step_key, position, capability, status, attempt_count,
              max_attempts, input_digest, lease_expires_at
         FROM agent_task_steps
        WHERE task_id=$1 AND step_key=$2
        FOR UPDATE`,
      [taskId, definition.stepKey],
    );
    const row = result.rows[0];
    if (!row || row.input_digest !== definition.inputDigest) {
      throw new Error(
        `APOLLOS_CHECKPOINT_BINDING_MISMATCH:${definition.stepKey}`,
      );
    }
    const decision = decideCheckpointAction(
      {
        status: row.status,
        attemptCount: row.attempt_count,
        maxAttempts: row.max_attempts,
        leaseExpiresAt: row.lease_expires_at?.toISOString() ?? null,
      },
      new Date().toISOString(),
    );
    if (decision.action === "skip_completed") {
      await client.query("COMMIT");
      return "skip";
    }
    if (decision.action === "skip_cancelled") {
      throw new Error(`APOLLOS_CHECKPOINT_CANCELLED:${definition.stepKey}`);
    }
    if (decision.action === "wait_for_lease") {
      throw new Error(`APOLLOS_CHECKPOINT_LEASE_ACTIVE:${definition.stepKey}`);
    }
    if (decision.action === "fail_exhausted") {
      throw new Error(
        `APOLLOS_CHECKPOINT_RETRIES_EXHAUSTED:${definition.stepKey}`,
      );
    }
    await client.query(
      `UPDATE agent_task_steps
          SET status='running',
              attempt_count=$3,
              lease_owner=$4,
              lease_expires_at=now() + ($5::text || ' milliseconds')::interval,
              started_at=COALESCE(started_at, now()),
              completed_at=NULL,
              failure_code=NULL,
              updated_at=now()
        WHERE task_id=$1 AND step_key=$2`,
      [
        taskId,
        definition.stepKey,
        decision.nextAttemptCount,
        runtimeId,
        leaseMs,
      ],
    );
    await client.query("COMMIT");
    return "run";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function completeCheckpoint(
  taskId: string,
  stepKey: string,
  receipt: Record<string, unknown>,
): Promise<void> {
  const result = await pool.query(
    `UPDATE agent_task_steps
        SET status='completed',
            output_receipt=$3::jsonb,
            failure_code=NULL,
            lease_owner=NULL,
            lease_expires_at=NULL,
            completed_at=now(),
            updated_at=now()
      WHERE task_id=$1 AND step_key=$2 AND status='running'
      RETURNING id`,
    [taskId, stepKey, JSON.stringify(receipt)],
  );
  if (result.rowCount !== 1) {
    throw new Error(`APOLLOS_CHECKPOINT_COMPLETE_CONFLICT:${stepKey}`);
  }
}

async function failCheckpoint(
  taskId: string,
  stepKey: string,
  failureCode: string,
): Promise<void> {
  const result = await pool.query(
    `UPDATE agent_task_steps
        SET status='failed',
            failure_code=$3,
            lease_owner=NULL,
            lease_expires_at=NULL,
            completed_at=now(),
            updated_at=now()
      WHERE task_id=$1 AND step_key=$2 AND status='running'
      RETURNING id`,
    [taskId, stepKey, failureCode.slice(0, 300)],
  );
  if (result.rowCount !== 1) {
    throw new Error(`APOLLOS_CHECKPOINT_FAIL_CONFLICT:${stepKey}`);
  }
}

async function recoverExpiredClaims() {
  await pool.query(
    `UPDATE agent_tasks
        SET status = CASE
              WHEN execution_attempts >= $1 THEN 'failed'
              ELSE 'generation_queued'
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
          AND status='generation_queued'
          AND decision='requires_review'
          AND resolution IS NULL
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

interface GeneratedDraft {
  id: string;
  topic: string | null;
  city: string | null;
  imagePrompt: string | null;
}

async function runGenerationJob(
  taskId: string,
  userId: string,
  job: GenerationJob,
): Promise<GeneratedDraft[]> {
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

  const drafts = await pool.query<{
    id: string;
    ai_topic: string | null;
    ai_city: string | null;
    image_recommendation: string | null;
  }>(
    `SELECT id, ai_topic, ai_city, image_recommendation
       FROM social_posts
      WHERE user_id=$1 AND weekly_plan_id=$2
      ORDER BY scheduled_at ASC, created_at ASC`,
    [userId, job.weeklyPlanId],
  );
  if (drafts.rows.length !== job.count) {
    throw new Error(
      `APOLLOS_WEEKLY_DRAFT_COUNT_MISMATCH:${job.generatorPlatform}:${drafts.rows.length}:${job.count}`,
    );
  }

  logger.info(
    {
      taskId,
      platform: job.generatorPlatform,
      created: result.created ?? 0,
      drafts: drafts.rows.length,
      idempotency: result.reason ?? null,
    },
    "[apollos-campaign] generation job verified",
  );
  return drafts.rows.map((draft) => ({
    id: draft.id,
    topic: draft.ai_topic,
    city: draft.ai_city,
    imagePrompt: draft.image_recommendation,
  }));
}

async function copyFacebookMediaToInstagram(
  userId: string,
  facebookJob: GenerationJob,
  instagramDrafts: GeneratedDraft[],
): Promise<boolean> {
  const facebook = await pool.query<{
    image_data: string | null;
    matched_image_url: string | null;
    matched_image_score: string | null;
    media_filename: string | null;
    media_mime_type: string | null;
  }>(
    `SELECT image_data, matched_image_url, matched_image_score,
            media_filename, media_mime_type
       FROM social_posts
      WHERE user_id=$1 AND weekly_plan_id=$2
      ORDER BY scheduled_at ASC, created_at ASC`,
    [userId, facebookJob.weeklyPlanId],
  );
  if (
    facebook.rows.length !== instagramDrafts.length ||
    facebook.rows.some((row) => !row.image_data)
  ) {
    return false;
  }
  for (let index = 0; index < instagramDrafts.length; index += 1) {
    const source = facebook.rows[index]!;
    await pool.query(
      `UPDATE social_posts
          SET image_data=$1,
              matched_image_url=$2,
              matched_image_score=$3,
              media_filename=$4,
              media_mime_type=$5,
              updated_at=now()
        WHERE id=$6 AND user_id=$7`,
      [
        source.image_data,
        source.matched_image_url,
        source.matched_image_score,
        source.media_filename,
        source.media_mime_type,
        instagramDrafts[index]!.id,
        userId,
      ],
    );
  }
  return true;
}

async function generateDraftMedia(
  taskId: string,
  job: GenerationJob,
  draft: GeneratedDraft,
) {
  const imagePrompt =
    draft.imagePrompt ??
    `Professional branded ${draft.topic ?? "local service"} campaign artwork for ${draft.city ?? "the local service area"}`;
  const imageResponse = await fetch(
    `${internalBase}/api/auto-content/generate-image`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-scheduler-secret": SCHEDULER_SECRET,
        "x-apollos-task-id": taskId,
      },
      body: JSON.stringify({
        postId: draft.id,
        prompt: imagePrompt,
        size: job.generatorPlatform === "youtube" ? "1536x1024" : "1024x1024",
        idempotencyKey: `${job.jobKey}:${draft.id}:image-v1`,
        city: draft.city,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const imageText = await imageResponse.text();
  if (!imageResponse.ok || imageResponse.status === 202) {
    throw new Error(
      `APOLLOS_WEEKLY_IMAGE_FAILED:${job.generatorPlatform}:${imageResponse.status}:${imageText.slice(0, 240)}`,
    );
  }
  const imageResult = JSON.parse(imageText) as { ok?: boolean };
  if (imageResult.ok !== true) {
    throw new Error(
      `APOLLOS_WEEKLY_IMAGE_UNVERIFIED:${job.generatorPlatform}`,
    );
  }

  if (job.generatorPlatform !== "youtube") return;

  const videoResponse = await fetch(
    `${internalBase}/api/auto-content/generate-video`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-scheduler-secret": SCHEDULER_SECRET,
        "x-apollos-task-id": taskId,
      },
      body: JSON.stringify({
        postId: draft.id,
        idempotencyKey: `${job.jobKey}:${draft.id}:video-v2`,
        videoMode: "professional",
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const videoText = await videoResponse.text();
  if (!videoResponse.ok || videoResponse.status === 202) {
    throw new Error(
      `APOLLOS_WEEKLY_VIDEO_FAILED:youtube:${videoResponse.status}:${videoText.slice(0, 240)}`,
    );
  }
  const videoResult = JSON.parse(videoText) as { ok?: boolean };
  if (videoResult.ok !== true) {
    throw new Error("APOLLOS_WEEKLY_VIDEO_UNVERIFIED:youtube");
  }
}


async function processOne() {
  const task = await claimOne();
  if (!task) return;
  try {
    const jobs = validateJobs(task.payload);
    const definitions = checkpointDefinitions(jobs);
    await ensureCheckpoints(task.id, definitions);
    const facebookJob = jobs.find(
      (job) => job.generatorPlatform === "facebook",
    );
    for (let position = 0; position < jobs.length; position += 1) {
      const job = jobs[position]!;
      const checkpoint = definitions[position]!;
      const action = await claimCheckpoint(task.id, checkpoint);
      if (action === "skip") {
        logger.info(
          { taskId: task.id, stepKey: checkpoint.stepKey },
          "[apollos-campaign] completed checkpoint skipped",
        );
        continue;
      }
      try {
        const drafts = await runGenerationJob(task.id, task.user_id, job);
        const reusedMetaMedia =
          job.generatorPlatform === "instagram" && facebookJob
            ? await copyFacebookMediaToInstagram(
                task.user_id,
                facebookJob,
                drafts,
              )
            : false;
        if (!reusedMetaMedia) {
          for (const draft of drafts) {
            await generateDraftMedia(task.id, job, draft);
          }
        } else {
          logger.info(
            { taskId: task.id, drafts: drafts.length },
            "[apollos-campaign] Facebook media reused for Instagram",
          );
        }
        await completeCheckpoint(task.id, checkpoint.stepKey, {
          platform: job.generatorPlatform,
          draftCount: drafts.length,
          mediaStrategy: reusedMetaMedia ? "facebook_reuse" : "generated",
          verifiedAt: new Date().toISOString(),
        });
      } catch (error) {
        const code =
          error instanceof Error
            ? error.message.replace(/Bearer\s+\S+/gi, "[REDACTED]")
            : "APOLLOS_CHECKPOINT_EXECUTION_FAILED";
        await failCheckpoint(task.id, checkpoint.stepKey, code);
        throw error;
      }
    }
    await pool.query(
      `UPDATE agent_tasks
          SET status='pending_review',
              execution_completed_at=now(),
              failure_code=NULL,
              decision_note='All captions, images, and video verified; package ready for one approval',
              updated_at=now()
        WHERE id=$1 AND status='executing'`,
      [task.id],
    );
    logger.info({ taskId: task.id }, "[apollos-campaign] weekly package ready for approval");
  } catch (error) {
    const raw = error instanceof Error ? error.message : "APOLLOS_WEEKLY_GENERATION_FAILED";
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
        terminal ? "failed" : "generation_queued",
        terminal ? "APOLLOS_WEEKLY_RETRIES_EXHAUSTED" : code,
        terminal ? code : `Generation retry queued after: ${code}`,
      ],
    );
    logger.error(
      { taskId: task.id, code, terminal },
      "[apollos-campaign] weekly generation failed closed",
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
