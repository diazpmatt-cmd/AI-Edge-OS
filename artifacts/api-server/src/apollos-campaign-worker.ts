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
const pilotPlatformCount = 4;
const taskAttemptCeiling = maxAttempts * pilotPlatformCount;
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
          scheduleDates: job.scheduleDates,
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

async function persistExecutionHeartbeat(
  taskId: string,
  stepKey: string,
): Promise<void> {
  const result = await pool.query(
    `WITH renewed AS (
       UPDATE agent_task_steps
          SET lease_expires_at=now() + ($4::text || ' milliseconds')::interval,
              updated_at=now()
        WHERE task_id=$1
          AND step_key=$2
          AND status='running'
          AND lease_owner=$3
        RETURNING task_id
     )
     UPDATE agent_tasks
        SET updated_at=now()
      WHERE id=$1
        AND status='executing'
        AND EXISTS (SELECT 1 FROM renewed)
      RETURNING id`,
    [taskId, stepKey, runtimeId, leaseMs],
  );
  if (result.rowCount !== 1) {
    throw new Error(`APOLLOS_CHECKPOINT_HEARTBEAT_CONFLICT:${stepKey}`);
  }
}

function startExecutionHeartbeat(
  taskId: string,
  stepKey: string,
): () => void {
  const heartbeatMs = Math.max(
    5_000,
    Math.min(60_000, Math.floor(leaseMs / 3)),
  );
  const timer = setInterval(() => {
    void persistExecutionHeartbeat(taskId, stepKey).catch((error) => {
      logger.error(
        { taskId, stepKey, error },
        "[apollos-campaign] checkpoint heartbeat failed",
      );
    });
  }, heartbeatMs);
  timer.unref();
  return () => clearInterval(timer);
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
      WHERE task_id=$1
        AND step_key=$2
        AND status='running'
        AND lease_owner=$4
      RETURNING id`,
    [taskId, stepKey, JSON.stringify(receipt), runtimeId],
  );
  if (result.rowCount !== 1) {
    throw new Error(`APOLLOS_CHECKPOINT_COMPLETE_CONFLICT:${stepKey}`);
  }
}

async function failCheckpoint(
  taskId: string,
  stepKey: string,
  failureCode: string,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE agent_task_steps
        SET status='failed',
            failure_code=$3,
            lease_owner=NULL,
            lease_expires_at=NULL,
            completed_at=now(),
            updated_at=now()
      WHERE task_id=$1
        AND step_key=$2
        AND status='running'
        AND lease_owner=$4
      RETURNING id, attempt_count, max_attempts`,
    [taskId, stepKey, failureCode.slice(0, 300), runtimeId],
  );
  if (result.rowCount !== 1) {
    throw new Error(`APOLLOS_CHECKPOINT_FAIL_CONFLICT:${stepKey}`);
  }
  const row = result.rows[0] as {
    attempt_count: number;
    max_attempts: number;
  };
  return row.attempt_count >= row.max_attempts;
}

async function recoverExpiredClaims() {
  const recovered = await pool.query<{
    id: string;
    status: string;
    failure_code: string;
  }>(
    `UPDATE agent_tasks AS task
        SET status = CASE
              WHEN task.execution_attempts >= $1 THEN 'failed'
              ELSE 'generation_queued'
            END,
            execution_completed_at = CASE
              WHEN task.execution_attempts >= $1 THEN now()
              ELSE NULL
            END,
            failure_code = CASE
              WHEN task.execution_attempts >= $1
                THEN 'APOLLOS_WEEKLY_RETRIES_EXHAUSTED'
              ELSE 'APOLLOS_WEEKLY_LEASE_EXPIRED'
            END,
            decision_note = CASE
              WHEN task.execution_attempts >= $1
                THEN 'Execution heartbeat expired after the bounded attempt ceiling'
              ELSE 'Execution heartbeat expired; checkpoint-safe recovery queued'
            END,
            updated_at = now()
      WHERE task.task_type='weekly_campaign'
        AND task.status='executing'
        AND task.updated_at < now() - ($2::text || ' milliseconds')::interval
        AND NOT EXISTS (
          SELECT 1
            FROM agent_task_steps AS step
           WHERE step.task_id=task.id
             AND step.status='running'
             AND step.lease_expires_at > now()
        )
      RETURNING task.id, task.status, task.failure_code`,
    [taskAttemptCeiling, leaseMs],
  );
  for (const task of recovered.rows) {
    logger.warn(
      {
        taskId: task.id,
        recoveredStatus: task.status,
        code: task.failure_code,
      },
      "[apollos-campaign] expired execution recovered",
    );
  }
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
      [taskAttemptCeiling],
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

function chicagoCalendarDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
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
      scheduleDates: job.scheduleDates,
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
    platforms: string;
    status: string;
    scheduled_at: Date;
  }>(
    `SELECT id, ai_topic, ai_city, image_recommendation, platforms, status,
            scheduled_at
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
  for (let index = 0; index < drafts.rows.length; index += 1) {
    const draft = drafts.rows[index]!;
    let boundPlatforms: unknown;
    try {
      boundPlatforms = JSON.parse(draft.platforms);
    } catch {
      throw new Error(
        `APOLLOS_WEEKLY_DRAFT_PLATFORM_INVALID:${job.generatorPlatform}`,
      );
    }
    if (
      !Array.isArray(boundPlatforms) ||
      boundPlatforms.length !== 1 ||
      boundPlatforms[0] !== job.generatorPlatform
    ) {
      throw new Error(
        `APOLLOS_WEEKLY_DRAFT_PLATFORM_MISMATCH:${job.generatorPlatform}`,
      );
    }
    if (draft.status !== "draft") {
      throw new Error(
        `APOLLOS_WEEKLY_DRAFT_STATUS_MISMATCH:${job.generatorPlatform}`,
      );
    }
    if (
      chicagoCalendarDate(new Date(draft.scheduled_at)) !==
      job.scheduleDates[index]
    ) {
      throw new Error(
        `APOLLOS_WEEKLY_DRAFT_SCHEDULE_MISMATCH:${job.generatorPlatform}`,
      );
    }
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


async function verifyDraftMedia(
  userId: string,
  job: GenerationJob,
  draft: GeneratedDraft,
): Promise<void> {
  const result = await pool.query<{
    image_data: string | null;
    video_url: string | null;
    media_mime_type: string | null;
    status: string;
  }>(
    `SELECT image_data, video_url, media_mime_type, status
       FROM social_posts
      WHERE id=$1 AND user_id=$2 AND weekly_plan_id=$3
      LIMIT 1`,
    [draft.id, userId, job.weeklyPlanId],
  );
  const row = result.rows[0];
  if (!row || row.status !== "draft") {
    throw new Error(
      `APOLLOS_WEEKLY_MEDIA_DRAFT_BINDING_MISMATCH:${job.generatorPlatform}`,
    );
  }
  if (job.generatorPlatform === "youtube") {
    if (
      !row.video_url?.startsWith("/objects/") ||
      row.media_mime_type !== "video/mp4"
    ) {
      throw new Error("APOLLOS_WEEKLY_VIDEO_NOT_PERSISTED:youtube");
    }
    return;
  }
  if (
    !row.image_data?.startsWith("/objects/") ||
    row.media_mime_type !== "image/png"
  ) {
    throw new Error(
      `APOLLOS_WEEKLY_IMAGE_NOT_PERSISTED:${job.generatorPlatform}`,
    );
  }
}


async function verifyCompletedCheckpointOutputs(
  userId: string,
  job: GenerationJob,
): Promise<void> {
  const result = await pool.query<{
    id: string;
    platforms: string;
    status: string;
    scheduled_at: Date;
  }>(
    `SELECT id, platforms, status, scheduled_at
       FROM social_posts
      WHERE user_id=$1 AND weekly_plan_id=$2
      ORDER BY scheduled_at ASC, created_at ASC`,
    [userId, job.weeklyPlanId],
  );
  if (result.rows.length !== job.count) {
    throw new Error(
      `APOLLOS_WEEKLY_RESUME_DRAFT_COUNT_MISMATCH:${job.generatorPlatform}`,
    );
  }
  for (let index = 0; index < result.rows.length; index += 1) {
    const row = result.rows[index]!;
    let platforms: unknown;
    try {
      platforms = JSON.parse(row.platforms);
    } catch {
      throw new Error(
        `APOLLOS_WEEKLY_RESUME_PLATFORM_INVALID:${job.generatorPlatform}`,
      );
    }
    if (
      row.status !== "draft" ||
      !Array.isArray(platforms) ||
      platforms.length !== 1 ||
      platforms[0] !== job.generatorPlatform ||
      chicagoCalendarDate(new Date(row.scheduled_at)) !==
        job.scheduleDates[index]
    ) {
      throw new Error(
        `APOLLOS_WEEKLY_RESUME_DRAFT_BINDING_MISMATCH:${job.generatorPlatform}`,
      );
    }
    await verifyDraftMedia(userId, job, {
      id: row.id,
      topic: null,
      city: null,
      imagePrompt: null,
    });
  }
}

async function verifyWeeklyPackageReady(
  taskId: string,
  userId: string,
  jobs: readonly GenerationJob[],
  definitions: readonly ApollosCheckpointDefinition[],
): Promise<void> {
  for (const job of jobs) {
    await verifyCompletedCheckpointOutputs(userId, job);
  }

  const result = await pool.query<{
    step_key: string;
    status: string;
    input_digest: string;
    output_receipt: unknown;
  }>(
    `SELECT step_key, status, input_digest, output_receipt
       FROM agent_task_steps
      WHERE task_id=$1
      ORDER BY position ASC`,
    [taskId],
  );
  if (result.rows.length !== definitions.length) {
    throw new Error("APOLLOS_WEEKLY_FINAL_CHECKPOINT_COUNT_MISMATCH");
  }

  for (let position = 0; position < definitions.length; position += 1) {
    const definition = definitions[position]!;
    const job = jobs[position]!;
    const row = result.rows[position];
    if (
      !row ||
      row.step_key !== definition.stepKey ||
      row.status !== "completed" ||
      row.input_digest !== definition.inputDigest
    ) {
      throw new Error(
        `APOLLOS_WEEKLY_FINAL_CHECKPOINT_BINDING_MISMATCH:${definition.stepKey}`,
      );
    }
    const receipt = row.output_receipt as Record<string, unknown> | null;
    if (
      !receipt ||
      receipt.jobKey !== job.jobKey ||
      receipt.planFingerprint !== job.planFingerprint ||
      receipt.weeklyPlanId !== job.weeklyPlanId ||
      receipt.platform !== job.generatorPlatform ||
      receipt.draftCount !== job.count ||
      typeof receipt.draftIdsDigest !== "string" ||
      !/^[a-f0-9]{64}$/.test(receipt.draftIdsDigest)
    ) {
      throw new Error(
        `APOLLOS_WEEKLY_FINAL_RECEIPT_MISMATCH:${definition.stepKey}`,
      );
    }
  }
}
async function processOne() {
  const task = await claimOne();
  if (!task) return;
  let failedCheckpointExhausted = false;
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
        await verifyCompletedCheckpointOutputs(task.user_id, job);
        logger.info(
          { taskId: task.id, stepKey: checkpoint.stepKey },
          "[apollos-campaign] completed checkpoint reverified and skipped",
        );
        continue;
      }
      const stopHeartbeat = startExecutionHeartbeat(
        task.id,
        checkpoint.stepKey,
      );
      try {
        await persistExecutionHeartbeat(task.id, checkpoint.stepKey);
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
        for (const draft of drafts) {
          await verifyDraftMedia(task.user_id, job, draft);
        }
        await completeCheckpoint(task.id, checkpoint.stepKey, {
          jobKey: job.jobKey,
          planFingerprint: job.planFingerprint,
          weeklyPlanId: job.weeklyPlanId,
          platform: job.generatorPlatform,
          draftCount: drafts.length,
          draftIdsDigest: createHash("sha256")
            .update(JSON.stringify(drafts.map((draft) => draft.id).sort()))
            .digest("hex"),
          mediaStrategy: reusedMetaMedia ? "facebook_reuse" : "generated",
          verifiedAt: new Date().toISOString(),
        });
      } catch (error) {
        const code =
          error instanceof Error
            ? error.message.replace(/Bearer\s+\S+/gi, "[REDACTED]")
            : "APOLLOS_CHECKPOINT_EXECUTION_FAILED";
        failedCheckpointExhausted = await failCheckpoint(
          task.id,
          checkpoint.stepKey,
          code,
        );
        throw error;
      } finally {
        stopHeartbeat();
      }
    }
    await verifyWeeklyPackageReady(
      task.id,
      task.user_id,
      jobs,
      definitions,
    );
    const ready = await pool.query(
      `UPDATE agent_tasks
          SET status='pending_review',
              execution_completed_at=now(),
              failure_code=NULL,
              decision_note='All captions, images, and video verified; package ready for one approval',
              updated_at=now()
        WHERE id=$1 AND status='executing'
        RETURNING id`,
      [task.id],
    );
    if (ready.rowCount !== 1) {
      throw new Error("APOLLOS_WEEKLY_READY_TRANSITION_CONFLICT");
    }
    logger.info({ taskId: task.id }, "[apollos-campaign] weekly package ready for approval");
  } catch (error) {
    const raw = error instanceof Error ? error.message : "APOLLOS_WEEKLY_GENERATION_FAILED";
    const code = raw.replace(/Bearer\s+\S+/gi, "[REDACTED]").slice(0, 300);
    const terminal =
      failedCheckpointExhausted ||
      task.execution_attempts >= taskAttemptCeiling;
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
