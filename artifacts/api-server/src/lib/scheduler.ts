import { db } from "@workspace/db";
import { socialPostsTable, leadsTable } from "@workspace/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { logger } from "./logger";
import { SCHEDULER_SECRET } from "./scheduler-secret";
import { sendSms } from "./sms";

const POLL_INTERVAL_MS = 60_000;

// Tracks posts currently being published — prevents duplicate publishes if a
// tick fires while a previous publish is still in flight (e.g. slow GBP upload).
const inFlight = new Set<string>();

async function publishDuePosts(): Promise<void> {
  // Query for posts whose scheduled time has passed and are still "scheduled"
  const duePosts = await db
    .select({
      id:     socialPostsTable.id,
      userId: socialPostsTable.userId,
    })
    .from(socialPostsTable)
    .where(
      and(
        eq(socialPostsTable.status, "scheduled"),
        sql`${socialPostsTable.scheduledAt} IS NOT NULL AND ${socialPostsTable.scheduledAt} <= now()`,
      )
    );

  if (!duePosts.length) return;

  logger.info(
    { count: duePosts.length, at: new Date().toISOString() },
    "[scheduler] due posts found",
  );

  const port = parseInt(process.env.PORT ?? "8080", 10);
  const base = `http://127.0.0.1:${port}`;

  for (const { id, userId } of duePosts) {
    if (inFlight.has(id)) {
      logger.info({ postId: id }, "[scheduler] skipping — already in flight");
      continue;
    }

    inFlight.add(id);

    try {
      logger.info({ postId: id, userId }, "[scheduler] publishing post");

      const res = await fetch(`${base}/api/social-posts/${id}/publish`, {
        method:  "POST",
        headers: {
          "Content-Type":       "application/json",
          "x-scheduler-secret": SCHEDULER_SECRET,
        },
      });

      const body = await res.json() as Record<string, unknown>;

      if (res.ok && body.ok) {
        logger.info(
          { postId: id, publishStatus: body.status },
          "[scheduler] post published successfully",
        );
      } else {
        logger.error(
          { postId: id, httpStatus: res.status, body },
          "[scheduler] post publish failed — route handled status update",
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ postId: id, err: msg }, "[scheduler] publish request error");

      // Network/runtime failure before the route could update status — do it here
      await db
        .update(socialPostsTable)
        .set({
          status:       "failed",
          errorMessage: `Scheduler network error: ${msg}`,
          updatedAt:    new Date(),
        })
        .where(eq(socialPostsTable.id, id));
    } finally {
      inFlight.delete(id);
    }
  }
}

// ── Missed-call recovery ──────────────────────────────────────────────────────

const RECOVERY_LOOKBACK_MS = 2 * 60 * 60 * 1000;  // scan last 2 hours for missed calls
const RECOVERY_DEDUP_MS    = 3 * 60 * 60 * 1000;  // textback dedup window

async function recoverMissedCalls(): Promise<void> {
  const missedSince   = new Date(Date.now() - RECOVERY_LOOKBACK_MS);
  const textbackSince = new Date(Date.now() - RECOVERY_DEDUP_MS);

  // Phones with unrecovered missed calls in the last 2 hours
  const missedRows = await db
    .selectDistinct({ phone: leadsTable.phone })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.eventType, "missed_call"),
        gte(leadsTable.createdAt, missedSince),
        sql`${leadsTable.phone} IS NOT NULL AND ${leadsTable.phone} != ''`,
      )
    );

  if (!missedRows.length) return;

  // Phones that already received a textback (webhook may have already handled it)
  const textedRows = await db
    .selectDistinct({ phone: leadsTable.phone })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.eventType, "telnyx_textback_sent"),
        gte(leadsTable.createdAt, textbackSince),
        sql`${leadsTable.phone} IS NOT NULL`,
      )
    );
  const alreadyTexted = new Set(textedRows.map(r => r.phone));

  const unrecovered = missedRows.filter(r => r.phone && !alreadyTexted.has(r.phone));
  if (!unrecovered.length) return;

  logger.info({ count: unrecovered.length }, "[scheduler] missed-call recovery — sending textbacks");

  const msg =
    process.env.TELNYX_TEXTBACK_MESSAGE ??
    "Hi, this is Bed Bugs & Beyond. Sorry we missed your call! " +
    "We'd love to help with your pest control needs. " +
    "Reply to this text or call us back anytime. — BB&B Team";

  for (const { phone } of unrecovered) {
    if (!phone) continue;
    const result = await sendSms(phone, msg);
    await db.insert(leadsTable).values({
      clientName: "Bed Bugs & Beyond",
      source:     "telnyx_textback",
      phone,
      message:    `Recovery scheduler textback ${result.ok ? "sent" : "failed"}${result.error ? ": " + result.error : ""}`,
      eventType:  result.ok ? "telnyx_textback_sent" : "telnyx_textback_failed",
      status:     "new",
    }).catch(e => logger.error({ phone, err: String(e) }, "[scheduler] recovery lead insert error"));
    logger.info({ phone, ok: result.ok }, "[scheduler] recovery textback");
  }
}

// ── Exports ────────────────────────────────────────────────────────────────────

export function startScheduler(): void {
  logger.info("[scheduler] started — posts every 60s · missed-call recovery every 5m");

  // ── Post publishing ──
  publishDuePosts().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "[scheduler] startup post-publish error");
  });

  setInterval(() => {
    publishDuePosts().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[scheduler] tick error");
    });
  }, POLL_INTERVAL_MS);

  // ── Missed-call recovery ──
  recoverMissedCalls().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "[scheduler] startup recovery error");
  });

  setInterval(() => {
    recoverMissedCalls().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[scheduler] recovery tick error");
    });
  }, 5 * 60_000);
}
