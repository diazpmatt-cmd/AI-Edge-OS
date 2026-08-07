import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { platformDeliveriesTable, socialPostsTable } from "@workspace/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

import {
  buildApollosPublishingStatusSummary,
  formatApollosPublishingStatusReply,
  isApollosPublishingStatusQuestion,
} from "../lib/apollos-publishing-status.js";

const router = Router();

router.post("/apollos/chat", async (req, res, next) => {
  if (!isApollosPublishingStatusQuestion(req.body?.message)) {
    next();
    return;
  }

  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const posts = await db
      .select({
        id: socialPostsTable.id,
        status: socialPostsTable.status,
        platforms: socialPostsTable.platforms,
        updatedAt: socialPostsTable.updatedAt,
      })
      .from(socialPostsTable)
      .where(eq(socialPostsTable.userId, userId))
      .orderBy(desc(socialPostsTable.updatedAt))
      .limit(50);

    const postIds = posts.map((post) => post.id);
    const deliveries = postIds.length === 0
      ? []
      : await db
          .select({
            postId: platformDeliveriesTable.postId,
            platform: platformDeliveriesTable.platform,
            status: platformDeliveriesTable.status,
            attemptNumber: platformDeliveriesTable.attemptNumber,
            externalPostId: platformDeliveriesTable.externalPostId,
            externalPostUrl: platformDeliveriesTable.externalPostUrl,
            publishedAt: platformDeliveriesTable.publishedAt,
            updatedAt: platformDeliveriesTable.updatedAt,
          })
          .from(platformDeliveriesTable)
          .where(
            and(
              eq(platformDeliveriesTable.userId, userId),
              inArray(platformDeliveriesTable.postId, postIds),
            ),
          );

    const summary = buildApollosPublishingStatusSummary({ posts, deliveries });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      reply: formatApollosPublishingStatusReply(summary),
      intent: "publishing_status",
      source: "verified_delivery_ledger",
      verificationRule: "external_post_id_or_url_required",
      summary,
    });
  } catch {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      reply:
        "I could not verify publishing status from the delivery ledger right now, so I will not guess from aggregate post status. Open System Diagnostics and retry the check once the ledger is readable.",
      intent: "publishing_status",
      source: "verified_delivery_ledger_unavailable",
      verificationRule: "external_post_id_or_url_required",
    });
  }
});

export default router;
