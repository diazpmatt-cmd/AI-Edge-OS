import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, pool } from "@workspace/db";
import { socialPostsTable } from "@workspace/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { validatePreFlight } from "../lib/publishing-service.js";
import { isDab8aPlatform, stablePublishPayloadHash, validateBbbCaption, validateSchedule, type Dab8aPlatform, type PublishPayload } from "../lib/dab-publishing-policy.js";

const router = Router();

async function bootstrap(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dab_first_publish_executions (
      execution_id text PRIMARY KEY,
      post_id uuid NOT NULL,
      user_id text NOT NULL,
      platform text NOT NULL CHECK (platform IN ('facebook','google')),
      payload_hash text NOT NULL,
      scheduled_at timestamptz NOT NULL,
      status text NOT NULL CHECK (status IN ('armed','publishing','verified','failed','blocked','cancelled')),
      armed_by text NOT NULL,
      armed_at timestamptz NOT NULL,
      claimed_at timestamptz,
      claimed_by text,
      completed_at timestamptz,
      delivery_id text,
      external_post_id text,
      external_post_url text,
      published_at timestamptz,
      verification_receipt jsonb,
      failure_code text,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      UNIQUE(post_id, platform, payload_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_dab_first_publish_queue
      ON dab_first_publish_executions(status, scheduled_at);
  `);
}

async function getPost(postId: string, userId: string) {
  return db.select().from(socialPostsTable)
    .where(and(eq(socialPostsTable.id, postId), eq(socialPostsTable.userId, userId)))
    .then((rows) => rows[0]);
}

function buildPayload(post: typeof socialPostsTable.$inferSelect, userId: string, platform: Dab8aPlatform, scheduledAt: Date): PublishPayload {
  return {
    postId: post.id,
    userId,
    clientName: post.clientName,
    platform,
    caption: post.caption,
    imageUrl: post.imageData ?? null,
    ctaType: post.ctaType ?? "none",
    ctaValue: post.ctaValue ?? null,
    scheduledAt: scheduledAt.toISOString(),
  };
}

async function assess(postId: string, userId: string, platformValue: unknown, scheduleValue: unknown) {
  if (!isDab8aPlatform(platformValue)) return { ok: false as const, status: 400, code: "PLATFORM_NOT_ALLOWLISTED" };
  const schedule = validateSchedule(scheduleValue);
  if (!schedule.ok) return { ok: false as const, status: 400, code: schedule.code };
  const post = await getPost(postId, userId);
  if (!post) return { ok: false as const, status: 404, code: "POST_NOT_FOUND" };
  if (post.clientName.trim().toLowerCase() !== "bed bugs & beyond") return { ok: false as const, status: 409, code: "CLIENT_NOT_ALLOWLISTED" };
  const caption = validateBbbCaption(post.caption);
  if (!caption.ok) return { ok: false as const, status: 409, code: caption.code };

  // Preflight evaluates the selected platform without mutating the post.
  const originalPlatforms = post.platforms;
  const originalApproval = post.approvalStatus;
  await db.update(socialPostsTable).set({
    platforms: JSON.stringify([platformValue]),
    approvalStatus: "approved",
  }).where(and(eq(socialPostsTable.id, post.id), eq(socialPostsTable.userId, userId)));
  const preflight = await validatePreFlight(post.id, userId);
  await db.update(socialPostsTable).set({
    platforms: originalPlatforms,
    approvalStatus: originalApproval,
  }).where(and(eq(socialPostsTable.id, post.id), eq(socialPostsTable.userId, userId)));

  const platform = platformValue as Dab8aPlatform;
  const payload = buildPayload(post, userId, platform, schedule.value);
  return { ok: true as const, post, platform, scheduledAt: schedule.value, payload, payloadHash: stablePublishPayloadHash(payload), preflight };
}

router.get("/dab/first-publish", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  await bootstrap();
  const result = await pool.query(`
    SELECT execution_id, post_id, platform, payload_hash, scheduled_at, status,
           armed_by, armed_at, claimed_at, completed_at, delivery_id,
           external_post_id, external_post_url, published_at,
           verification_receipt, failure_code, created_at, updated_at
      FROM dab_first_publish_executions
     WHERE user_id=$1
     ORDER BY created_at DESC LIMIT 20
  `, [userId]);
  return res.json({
    executionAuthority: "one-post-one-platform",
    livePublishingRequiresArm: true,
    executions: result.rows.map((row: any) => ({
      executionId: row.execution_id,
      postId: row.post_id,
      platform: row.platform,
      payloadHash: row.payload_hash,
      scheduledAt: row.scheduled_at.toISOString(),
      status: row.status,
      armedBy: row.armed_by,
      armedAt: row.armed_at.toISOString(),
      claimedAt: row.claimed_at?.toISOString() ?? null,
      completedAt: row.completed_at?.toISOString() ?? null,
      deliveryId: row.delivery_id,
      externalPostId: row.external_post_id,
      externalPostUrl: row.external_post_url,
      publishedAt: row.published_at?.toISOString() ?? null,
      verificationReceipt: row.verification_receipt,
      failureCode: row.failure_code,
    })),
  });
});

router.post("/dab/first-publish/preflight", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  await bootstrap();
  const postId = typeof req.body?.postId === "string" ? req.body.postId : "";
  const result = await assess(postId, userId, req.body?.platform, req.body?.scheduledAt);
  if (!result.ok) return res.status(result.status).json({ error: result.code });
  const selected = result.preflight.platforms.find((item) => item.platform === result.platform);
  return res.json({
    canArm: result.preflight.canProceed && selected?.canPublish === true,
    payloadHash: result.payloadHash,
    payload: result.payload,
    platformReadiness: selected ?? null,
    blockers: result.preflight.blockers,
    confirmationText: `ARM ${result.payloadHash.slice(0, 12)}`,
  });
});

router.post("/dab/first-publish/arm", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  await bootstrap();
  const postId = typeof req.body?.postId === "string" ? req.body.postId : "";
  const result = await assess(postId, userId, req.body?.platform, req.body?.scheduledAt);
  if (!result.ok) return res.status(result.status).json({ error: result.code });
  const selected = result.preflight.platforms.find((item) => item.platform === result.platform);
  if (!result.preflight.canProceed || selected?.canPublish !== true) return res.status(409).json({ error: "PREFLIGHT_BLOCKED", blockers: result.preflight.blockers, platformReadiness: selected ?? null });
  if (req.body?.payloadHash !== result.payloadHash) return res.status(409).json({ error: "PAYLOAD_HASH_MISMATCH" });
  if (req.body?.confirmation !== `ARM ${result.payloadHash.slice(0, 12)}`) return res.status(400).json({ error: "CONFIRMATION_MISMATCH" });

  const active = await pool.query(`SELECT execution_id FROM dab_first_publish_executions WHERE status IN ('armed','publishing') LIMIT 1`);
  if (active.rows[0]) return res.status(409).json({ error: "GLOBAL_SINGLE_EXECUTION_LIMIT", executionId: active.rows[0].execution_id });

  await db.update(socialPostsTable).set({
    platforms: JSON.stringify([result.platform]),
    scheduledAt: result.scheduledAt,
    approvalStatus: "approved",
    approvedAt: new Date(),
    approvedBy: userId,
    status: "scheduled",
    updatedAt: new Date(),
  }).where(and(eq(socialPostsTable.id, result.post.id), eq(socialPostsTable.userId, userId)));

  const executionId = `dpx_${result.payloadHash.slice(0, 24)}`;
  await pool.query(`
    INSERT INTO dab_first_publish_executions(
      execution_id, post_id, user_id, platform, payload_hash, scheduled_at,
      status, armed_by, armed_at, created_at, updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,'armed',$3,now(),now(),now())
    ON CONFLICT(post_id,platform,payload_hash) DO NOTHING
  `, [executionId, result.post.id, userId, result.platform, result.payloadHash, result.scheduledAt]);
  return res.status(201).json({ executionId, status: "armed", payloadHash: result.payloadHash, scheduledAt: result.scheduledAt.toISOString(), platform: result.platform });
});

export default router;
