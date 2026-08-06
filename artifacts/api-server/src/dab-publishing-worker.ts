import { db, pool } from "@workspace/db";
import { socialConnectionsTable, socialPostsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "./lib/logger.js";
import { publishingService } from "./lib/publishing-service.js";
import {
  readPublishingWorkerConfig,
  stablePublishPayloadHash,
  validateBbbCaption,
  type Dab8aPlatform,
} from "./lib/dab-publishing-policy.js";
import { SCHEDULER_SECRET } from "./lib/scheduler-secret.js";

const config = readPublishingWorkerConfig();
const internalBase = process.env.DAB_PUBLISHING_INTERNAL_BASE_URL ?? "http://api:3000";
let stopped = false;

async function bootstrap() {
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
  `);
}

async function claimOne() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      UPDATE dab_first_publish_executions
         SET status='armed', claimed_at=NULL, claimed_by=NULL, updated_at=now()
       WHERE status='publishing' AND claimed_at < now() - ($1::text || ' milliseconds')::interval
    `, [config.leaseMs]);
    const found = await client.query<any>(`
      SELECT * FROM dab_first_publish_executions
       WHERE status='armed' AND scheduled_at <= now()
       ORDER BY scheduled_at ASC
       FOR UPDATE SKIP LOCKED LIMIT 1
    `);
    const row = found.rows[0];
    if (!row) { await client.query("COMMIT"); return null; }
    await client.query(`UPDATE dab_first_publish_executions SET status='publishing', claimed_at=now(), claimed_by=$2, updated_at=now() WHERE execution_id=$1`, [row.execution_id, config.runtimeId]);
    await client.query("COMMIT");
    return row;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

function assertPublishingPreflight(
  post: typeof socialPostsTable.$inferSelect,
  execution: {
    platform: string;
    scheduled_at: Date | string;
    armed_by: string;
  },
): void {
  if (post.status !== "scheduled") {
    throw new Error("PREFLIGHT_POST_NOT_SCHEDULED");
  }
  if (
    post.approvalStatus !== "approved" ||
    post.approvedBy !== execution.armed_by ||
    !post.approvedAt
  ) {
    throw new Error("PREFLIGHT_APPROVAL_BINDING_MISMATCH");
  }
  const caption = validateBbbCaption(post.caption);
  if (!caption.ok) {
    throw new Error(`PREFLIGHT_${caption.code}`);
  }
  if (!post.scheduledAt) {
    throw new Error("PREFLIGHT_SCHEDULE_MISSING");
  }
  const postScheduleMs = new Date(post.scheduledAt).getTime();
  const executionScheduleMs = new Date(execution.scheduled_at).getTime();
  if (
    !Number.isFinite(postScheduleMs) ||
    !Number.isFinite(executionScheduleMs) ||
    postScheduleMs !== executionScheduleMs
  ) {
    throw new Error("PREFLIGHT_SCHEDULE_BINDING_MISMATCH");
  }
  const mediaUrl = post.imageData ?? "";
  if (
    (!mediaUrl.startsWith("/objects/") && !mediaUrl.startsWith("https://")) ||
    !post.mediaMimeType?.startsWith("image/")
  ) {
    throw new Error("PREFLIGHT_MEDIA_NOT_READY");
  }
  let platforms: unknown;
  try {
    platforms = JSON.parse(post.platforms || "[]");
  } catch {
    throw new Error("PREFLIGHT_PLATFORM_BINDING_INVALID");
  }
  if (
    !Array.isArray(platforms) ||
    platforms.length !== 1 ||
    platforms[0] !== execution.platform
  ) {
    throw new Error("PREFLIGHT_PLATFORM_BINDING_MISMATCH");
  }
}

async function assertConnectionPreflight(
  userId: string,
  platform: string,
): Promise<void> {
  const provider = platform === "google" ? "google_business" : platform;
  const connection = await db
    .select({
      id: socialConnectionsTable.id,
      expiresAt: socialConnectionsTable.expiresAt,
    })
    .from(socialConnectionsTable)
    .where(
      and(
        eq(socialConnectionsTable.userId, userId),
        eq(socialConnectionsTable.provider, provider),
      ),
    )
    .then((rows) => rows[0]);
  if (!connection) {
    throw new Error("PREFLIGHT_PLATFORM_NOT_CONNECTED");
  }
  if (connection.expiresAt && connection.expiresAt <= new Date()) {
    throw new Error("PREFLIGHT_PLATFORM_CONNECTION_EXPIRED");
  }
}

async function processOne() {
  const execution = await claimOne();
  if (!execution) return;
  try {
    const post = await db.select().from(socialPostsTable)
      .where(and(eq(socialPostsTable.id, execution.post_id), eq(socialPostsTable.userId, execution.user_id)))
      .then((rows) => rows[0]);
    if (!post) throw new Error("POST_NOT_FOUND");
    assertPublishingPreflight(post, execution);
    await assertConnectionPreflight(execution.user_id, execution.platform);
    const currentHash = stablePublishPayloadHash({
      postId: post.id,
      userId: execution.user_id,
      clientName: post.clientName,
      platform: execution.platform as Dab8aPlatform,
      caption: post.caption,
      imageUrl: post.imageData ?? null,
      ctaType: post.ctaType ?? "none",
      ctaValue: post.ctaValue ?? null,
      scheduledAt: new Date(execution.scheduled_at).toISOString(),
    });
    if (currentHash !== execution.payload_hash) throw new Error("PAYLOAD_HASH_MISMATCH");

    const result = await publishingService.publishPost(post.id, execution.user_id, execution.armed_by, internalBase, SCHEDULER_SECRET);
    const delivery = result.deliveries.find((item) => item.platform === execution.platform);
    if (!delivery || (delivery.status !== "published" && delivery.status !== "published_with_warning" && delivery.status !== "idempotency_hit")) {
      throw new Error(delivery?.errorMessage ? `DELIVERY_FAILED:${delivery.errorMessage}` : "DELIVERY_NOT_VERIFIED");
    }
    if (!delivery.externalPostId && !delivery.externalPostUrl) throw new Error("EXTERNAL_RECEIPT_MISSING");
    const receipt = {
      postStatus: result.postStatus,
      deliveryStatus: delivery.status,
      apiResponseStatus: delivery.apiResponseStatus,
      verifiedBy: "platform_delivery_ledger",
      verifiedAt: new Date().toISOString(),
    };
    await pool.query(`
      UPDATE dab_first_publish_executions
         SET status='verified', completed_at=now(), delivery_id=$2,
             external_post_id=$3, external_post_url=$4, published_at=now(),
             verification_receipt=$5::jsonb, updated_at=now()
       WHERE execution_id=$1
    `, [execution.execution_id, delivery.deliveryId, delivery.externalPostId, delivery.externalPostUrl, JSON.stringify(receipt)]);
    logger.info({ executionId: execution.execution_id, platform: execution.platform }, "[dab8a-publishing] verified");
  } catch (error) {
    const code = error instanceof Error ? error.message.replace(/Bearer\s+\S+/gi, "[REDACTED]").slice(0, 300) : "PUBLISH_FAILED";
    await pool.query(`UPDATE dab_first_publish_executions SET status='failed', failure_code=$2, completed_at=now(), updated_at=now() WHERE execution_id=$1`, [execution.execution_id, code]);
    logger.error({ executionId: execution.execution_id, code }, "[dab8a-publishing] failed closed");
  }
}

async function main() {
  if (!config.enabled || config.killSwitch) { logger.info("[dab8a-publishing] disabled"); return; }
  await bootstrap();
  logger.info({ runtimeId: config.runtimeId, internalBase }, "[dab8a-publishing] worker started");
  while (!stopped) {
    try { await processOne(); } catch (error) { logger.error({ error }, "[dab8a-publishing] tick failed closed"); }
    await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { stopped = true; });
main().then(() => pool.end()).catch(async (error) => { logger.error({ error }, "[dab8a-publishing] startup failed closed"); await pool.end().catch(() => undefined); process.exit(1); });
