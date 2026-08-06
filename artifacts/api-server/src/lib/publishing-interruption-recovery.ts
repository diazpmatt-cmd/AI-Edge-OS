import { platformDeliveriesTable, socialPostsTable } from "@workspace/db/schema";
import { and, eq, lte } from "drizzle-orm";

import { logger } from "./logger.js";
import { parsePublishingPlatformBinding } from "./publishing-platform-binding.js";
import {
  reconcileSchedulerPublishException,
  type SchedulerPublishRecovery,
} from "./scheduler-publish-recovery.js";

export const PUBLISHING_INTERRUPTION_STALE_MS = 5 * 60_000;
export const PUBLISHING_INTERRUPTION_POLL_MS = 60_000;
export const PUBLISHING_INTERRUPTION_BATCH_SIZE = 50;

export function isCompleteInterruptedPublishingRecovery(
  recovery: SchedulerPublishRecovery,
): boolean {
  return (
    recovery.expectedPlatforms > 0 &&
    recovery.unresolved === 0 &&
    recovery.verifiedPublished + recovery.terminalFailures ===
      recovery.expectedPlatforms
  );
}

export function shouldRecoverInterruptedPublishing(input: {
  readonly now: Date;
  readonly updatedAt: Date | string | null;
  readonly recovery: SchedulerPublishRecovery;
  readonly staleMs?: number;
}): boolean {
  if (!isCompleteInterruptedPublishingRecovery(input.recovery)) return false;
  if (!input.updatedAt) return false;
  const updatedAt =
    input.updatedAt instanceof Date
      ? input.updatedAt
      : new Date(input.updatedAt);
  const updatedTime = updatedAt.getTime();
  return (
    Number.isFinite(updatedTime) &&
    input.now.getTime() - updatedTime >=
      (input.staleMs ?? PUBLISHING_INTERRUPTION_STALE_MS)
  );
}

export async function reconcileInterruptedPublishingPosts(
  now = new Date(),
): Promise<{ evaluated: number; recovered: number; unresolved: number }> {
  const { db } = await import("@workspace/db");
  const cutoff = new Date(now.getTime() - PUBLISHING_INTERRUPTION_STALE_MS);
  const candidates = await db
    .select({
      id: socialPostsTable.id,
      userId: socialPostsTable.userId,
      platforms: socialPostsTable.platforms,
      updatedAt: socialPostsTable.updatedAt,
    })
    .from(socialPostsTable)
    .where(and(
      eq(socialPostsTable.status, "publishing"),
      lte(socialPostsTable.updatedAt, cutoff),
    ))
    .limit(PUBLISHING_INTERRUPTION_BATCH_SIZE);

  let recovered = 0;
  let unresolved = 0;

  for (const post of candidates) {
    const binding = parsePublishingPlatformBinding(post.platforms);
    if (!binding.ok || binding.platforms.length === 0) {
      unresolved++;
      logger.error(
        { postId: post.id },
        "[publishing-recovery] stale post has invalid platform binding",
      );
      continue;
    }

    const deliveries = await db
      .select({
        platform: platformDeliveriesTable.platform,
        status: platformDeliveriesTable.status,
        attemptNumber: platformDeliveriesTable.attemptNumber,
        externalPostId: platformDeliveriesTable.externalPostId,
        externalPostUrl: platformDeliveriesTable.externalPostUrl,
        publishedAt: platformDeliveriesTable.publishedAt,
        updatedAt: platformDeliveriesTable.updatedAt,
      })
      .from(platformDeliveriesTable)
      .where(and(
        eq(platformDeliveriesTable.postId, post.id),
        eq(platformDeliveriesTable.userId, post.userId),
      ));

    const recovery = reconcileSchedulerPublishException({
      expectedPlatforms: [...binding.platforms],
      deliveries,
      error: "interrupted canonical aggregate finalization",
    });

    if (!shouldRecoverInterruptedPublishing({
      now,
      updatedAt: post.updatedAt,
      recovery,
    })) {
      unresolved++;
      continue;
    }

    const transitioned = await db
      .update(socialPostsTable)
      .set({
        status: recovery.status,
        publishedAt: recovery.publishedAt ?? undefined,
        errorMessage: recovery.errorMessage,
        updatedAt: new Date(),
      })
      .where(and(
        eq(socialPostsTable.id, post.id),
        eq(socialPostsTable.userId, post.userId),
        eq(socialPostsTable.status, "publishing"),
        eq(socialPostsTable.updatedAt, post.updatedAt),
      ))
      .returning({ id: socialPostsTable.id });

    if (transitioned.length === 1) {
      recovered++;
      logger.error(
        {
          postId: post.id,
          status: recovery.status,
          verifiedPublished: recovery.verifiedPublished,
          terminalFailures: recovery.terminalFailures,
          expectedPlatforms: recovery.expectedPlatforms,
        },
        "[publishing-recovery] stale aggregate finalized from durable receipts",
      );
    } else {
      unresolved++;
      logger.info(
        { postId: post.id, proposedStatus: recovery.status },
        "[publishing-recovery] aggregate state changed before recovery write",
      );
    }
  }

  return { evaluated: candidates.length, recovered, unresolved };
}

let recoveryRunning = false;

export function startPublishingInterruptionRecoveryMonitor(): void {
  const run = async () => {
    if (recoveryRunning) return;
    recoveryRunning = true;
    try {
      await reconcileInterruptedPublishingPosts();
    } catch (error: unknown) {
      logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        "[publishing-recovery] monitor cycle failed",
      );
    } finally {
      recoveryRunning = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), PUBLISHING_INTERRUPTION_POLL_MS);
  timer.unref?.();
}
