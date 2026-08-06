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
      typeof job.count !== "number" ||
      !Number.isInteger(job.count) ||
      job.count < 1 ||
      job.count > 7 ||
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
    const facebookJob = jobs.find(
      (job) => job.generatorPlatform === "facebook",
    );
    for (const job of jobs) {
      const drafts = await runGenerationJob(task.id, task.user_id, job);
      const reusedMetaMedia =
        job.generatorPlatform === "instagram" && facebookJob
          ? await copyFacebookMediaToInstagram(
              task.user_id,
              facebookJob,
              drafts,
            )
          : false;
      if (reusedMetaMedia) {
        logger.info(
          { taskId: task.id, drafts: drafts.length },
          "[apollos-campaign] Facebook media reused for Instagram",
        );
        continue;
      }
      for (const draft of drafts) {
        await generateDraftMedia(task.id, job, draft);
      }
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
