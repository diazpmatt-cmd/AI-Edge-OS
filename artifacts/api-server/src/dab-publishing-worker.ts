import { db, pool } from "@workspace/db";
import { socialPostsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "./lib/logger.js";
import { publishingService } from "./lib/publishing-service.js";
import { readPublishingWorkerConfig, stablePublishPayloadHash, type Dab8aPlatform } from "./lib/dab-publishing-policy.js";
import { SCHEDULER_SECRET } from "./lib/scheduler-secret.js";

const config = readPublishingWorkerConfig();
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

async function processOne() {
  const execution = await claimOne();
  if (!execution) return;
  try {
    const post = await db.select().from(socialPostsTable)
      .where(and(eq(socialPostsTable.id, execution.post_id), eq(socialPostsTable.userId, execution.user_id)))
      .then((rows) => rows[0]);
    if (!post) throw new Error("POST_NOT_FOUND");
    const platforms = JSON.parse(post.platforms || "[]") as string[];
    if (platforms.length !== 1 || platforms[0] !== execution.platform) throw new Error("PLATFORM_BINDING_MISMATCH");
    if (post.approvalStatus !== "approved" || post.approvedBy !== execution.armed_by) throw new Error("APPROVAL_BINDING_MISMATCH");
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

    const port = Number(process.env.PORT ?? 3000);
    const result = await publishingService.publishPost(post.id, execution.user_id, execution.armed_by, `http://127.0.0.1:${port}`, SCHEDULER_SECRET);
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
  logger.info({ runtimeId: config.runtimeId }, "[dab8a-publishing] worker started");
  while (!stopped) {
    try { await processOne(); } catch (error) { logger.error({ error }, "[dab8a-publishing] tick failed closed"); }
    await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { stopped = true; });
main().then(() => pool.end()).catch(async (error) => { logger.error({ error }, "[dab8a-publishing] startup failed closed"); await pool.end().catch(() => undefined); process.exit(1); });
