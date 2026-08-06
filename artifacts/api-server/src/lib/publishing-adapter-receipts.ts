import { platformDeliveriesTable, socialPostsTable } from "@workspace/db/schema";
import { and, eq, inArray } from "drizzle-orm";

import {
  isAdapterResultsEnvelope,
  mapAdapterResultToDelivery,
  type AdapterPlatformResult,
} from "./publishing-adapter-result.js";
import { parsePublishingPlatformBinding } from "./publishing-platform-binding.js";

export interface AdapterReceiptDeliveryRow {
  readonly id: string;
  readonly platform: string;
  readonly status: string;
  readonly attemptNumber: number;
  readonly updatedAt: Date | string | null;
}

function timeValue(value: Date | string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = value instanceof Date ? value : new Date(value);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

export function selectLatestAdapterDeliveryAttempts(
  rows: readonly AdapterReceiptDeliveryRow[],
): ReadonlyMap<string, AdapterReceiptDeliveryRow> {
  const latest = new Map<string, AdapterReceiptDeliveryRow>();
  for (const row of rows) {
    const current = latest.get(row.platform);
    if (
      !current ||
      row.attemptNumber > current.attemptNumber ||
      (row.attemptNumber === current.attemptNumber &&
        timeValue(row.updatedAt) > timeValue(current.updatedAt))
    ) {
      latest.set(row.platform, row);
    }
  }
  return latest;
}

export async function persistAdapterReceiptEnvelope(input: {
  readonly postId: string;
  readonly body: unknown;
}): Promise<{ persisted: number; expected: number }> {
  if (!isAdapterResultsEnvelope(input.body)) {
    return { persisted: 0, expected: 0 };
  }

  const { db } = await import("@workspace/db");
  const [post] = await db
    .select({
      userId: socialPostsTable.userId,
      platforms: socialPostsTable.platforms,
    })
    .from(socialPostsTable)
    .where(eq(socialPostsTable.id, input.postId));
  if (!post) return { persisted: 0, expected: 0 };

  const binding = parsePublishingPlatformBinding(post.platforms);
  if (!binding.ok || binding.platforms.length === 0) {
    return { persisted: 0, expected: 0 };
  }
  const platforms = [...binding.platforms];

  const deliveryRows = await db
    .select({
      id: platformDeliveriesTable.id,
      platform: platformDeliveriesTable.platform,
      status: platformDeliveriesTable.status,
      attemptNumber: platformDeliveriesTable.attemptNumber,
      updatedAt: platformDeliveriesTable.updatedAt,
    })
    .from(platformDeliveriesTable)
    .where(and(
      eq(platformDeliveriesTable.postId, input.postId),
      eq(platformDeliveriesTable.userId, post.userId),
      inArray(platformDeliveriesTable.platform, platforms),
    ));
  const latest = selectLatestAdapterDeliveryAttempts(deliveryRows);
  const results = input.body.results as Record<string, AdapterPlatformResult>;

  const persisted = await db.transaction(async (tx) => {
    let count = 0;
    for (const platform of platforms) {
      const delivery = latest.get(platform);
      if (!delivery) continue;
      const decision = mapAdapterResultToDelivery(results[platform]);
      const now = new Date();
      const updated = await tx
        .update(platformDeliveriesTable)
        .set({
          status: decision.status,
          externalPostId: decision.externalPostId,
          externalPostUrl: decision.externalPostUrl,
          errorMessage: decision.errorMessage,
          publishedAt: decision.isPublished ? now : undefined,
          failedAt: decision.isFailed ? now : undefined,
          updatedAt: now,
        })
        .where(and(
          eq(platformDeliveriesTable.id, delivery.id),
          eq(platformDeliveriesTable.userId, post.userId),
          eq(platformDeliveriesTable.status, "publishing"),
        ))
        .returning({ id: platformDeliveriesTable.id });
      if (updated.length === 1) count++;
    }
    return count;
  });

  return { persisted, expected: platforms.length };
}
