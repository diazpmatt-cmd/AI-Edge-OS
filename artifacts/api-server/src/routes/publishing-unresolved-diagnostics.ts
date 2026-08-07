import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { platformDeliveriesTable, socialPostsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

import { parsePublishingPlatformBinding } from "../lib/publishing-platform-binding.js";
import {
  diagnosePublishingLanes,
  summarizePublishingDiagnostics,
} from "../lib/publishing-unresolved-diagnostics.js";
import { applyPublishingDiagnosticsRetryPolicy } from "../lib/publishing-diagnostics-retry-policy.js";

const router = Router();

router.get("/social-posts/:id/publishing-diagnostics", async (req, res) => {
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
      updatedAt: socialPostsTable.updatedAt,
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
    res.status(409).json({
      error: binding.message,
      code: binding.code,
    });
    return;
  }

  const deliveries = await db
    .select({
      id: platformDeliveriesTable.id,
      platform: platformDeliveriesTable.platform,
      status: platformDeliveriesTable.status,
      attemptNumber: platformDeliveriesTable.attemptNumber,
      externalPostId: platformDeliveriesTable.externalPostId,
      externalPostUrl: platformDeliveriesTable.externalPostUrl,
      errorCode: platformDeliveriesTable.errorCode,
      errorMessage: platformDeliveriesTable.errorMessage,
      retryAllowed: platformDeliveriesTable.retryAllowed,
      updatedAt: platformDeliveriesTable.updatedAt,
    })
    .from(platformDeliveriesTable)
    .where(and(
      eq(platformDeliveriesTable.postId, post.id),
      eq(platformDeliveriesTable.userId, userId),
    ));

  const diagnosedLanes = diagnosePublishingLanes({
    expectedPlatforms: binding.platforms,
    deliveries,
  });
  const lanes = applyPublishingDiagnosticsRetryPolicy({
    expectedPlatforms: binding.platforms,
    lanes: diagnosedLanes,
  });

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    postId: post.id,
    postStatus: post.status,
    postUpdatedAt: post.updatedAt,
    verificationRule: "external_post_id_or_url_required",
    summary: summarizePublishingDiagnostics(lanes),
    lanes,
  });
});

export default router;
