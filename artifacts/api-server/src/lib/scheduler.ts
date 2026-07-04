import { db } from "@workspace/db";
import { socialPostsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger";
import { SCHEDULER_SECRET } from "./scheduler-secret";

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

export function startScheduler(): void {
  logger.info("[scheduler] started — polling every 60s for due scheduled posts");

  // Fire immediately on startup to catch posts that were due during downtime
  publishDuePosts().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, "[scheduler] startup run error");
  });

  setInterval(() => {
    publishDuePosts().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[scheduler] tick error");
    });
  }, POLL_INTERVAL_MS);
}
