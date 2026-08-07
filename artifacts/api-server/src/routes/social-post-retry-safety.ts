import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { platformDeliveriesTable, socialPostsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

import { parsePublishingPlatformBinding } from "../lib/publishing-platform-binding.js";
import { evaluatePublishingRetryRequest } from "../lib/publishing-retry-request-policy.js";

const router = Router();

/**
 * Fail-closed guard for the legacy full-post retry route.
 *
 * A request may reach the existing /social-posts/:id/retry handler only when
 * the source post is already isolated to one platform and its latest delivery
 * history is eligible under the canonical retry policy. This prevents the
 * legacy route from becoming a multi-platform replay entry point.
 */
router.post("/social-posts/:id/retry", async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [post] = await db
    .select({
      id: socialPostsTable.id,
      status: socialPostsTable.status,
      platforms: socialPostsTable.platforms,
    })
    .from(socialPostsTable)
    .where(and(
      eq(socialPostsTable.id, req.params.id),
      eq(socialPostsTable.userId, userId),
    ));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const binding = parsePublishingPlatformBinding(post.platforms);
  if (!binding.ok) {
    res.status(409).json({ error: binding.message, code: binding.code });
    return;
  }

  const deliveries = await db
    .select({
      status: platformDeliveriesTable.status,
      attemptNumber: platformDeliveriesTable.attemptNumber,
      retryAllowed: platformDeliveriesTable.retryAllowed,
      externalPostId: platformDeliveriesTable.externalPostId,
      externalPostUrl: platformDeliveriesTable.externalPostUrl,
      updatedAt: platformDeliveriesTable.updatedAt,
    })
    .from(platformDeliveriesTable)
    .where(and(
      eq(platformDeliveriesTable.postId, post.id),
      eq(platformDeliveriesTable.userId, userId),
    ));

  const decision = evaluatePublishingRetryRequest({
    postStatus: post.status,
    expectedPlatforms: binding.platforms,
    deliveries,
  });

  if (!decision.allowed) {
    res.status(409).json({
      ok: false,
      code: decision.code,
      error: decision.message,
    });
    return;
  }

  next();
});

export default router;
