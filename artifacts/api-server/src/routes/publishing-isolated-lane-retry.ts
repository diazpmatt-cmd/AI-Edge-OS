import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { platformDeliveriesTable, socialPostsTable } from "@workspace/db/schema";
import { and, desc, eq } from "drizzle-orm";

import {
  deriveAttemptId,
  sanitizeError,
  validatePreFlight,
} from "../lib/publishing-service.js";
import { parsePublishingPlatformBinding } from "../lib/publishing-platform-binding.js";
import { evaluateIsolatedLaneRetry } from "../lib/publishing-isolated-lane-retry-policy.js";
import { INTERNAL_PUBLISH_PLATFORM_HEADER } from "../lib/publishing-platform-override.js";
import { SCHEDULER_SECRET } from "../lib/scheduler-secret.js";

const router = Router();

const TERMINAL_MEDIA_ERRORS = ["requires video", "requires image", "Skipped"];

function adapterResultToStatus(result: {
  ok: boolean;
  error?: string;
  postId?: string;
  postUrl?: string;
} | undefined): {
  status: "published" | "failed" | "skipped";
  externalPostId: string | null;
  externalPostUrl: string | null;
  errorMessage: string | null;
} {
  if (!result) {
    return {
      status: "failed",
      externalPostId: null,
      externalPostUrl: null,
      errorMessage: "Platform adapter did not return a result",
    };
  }

  if (result.ok && (result.postId || result.postUrl)) {
    return {
      status: "published",
      externalPostId: result.postId ?? null,
      externalPostUrl: result.postUrl ?? null,
      errorMessage: null,
    };
  }

  if (result.ok) {
    return {
      status: "failed",
      externalPostId: null,
      externalPostUrl: null,
      errorMessage: "Provider reported success without an external post receipt",
    };
  }

  const errorMessage = sanitizeError(result.error ?? "Unknown platform error");
  const skipped = TERMINAL_MEDIA_ERRORS.some(fragment => errorMessage.includes(fragment));
  return {
    status: skipped ? "skipped" : "failed",
    externalPostId: null,
    externalPostUrl: null,
    errorMessage,
  };
}

router.post("/social-posts/:postId/deliveries/:deliveryId/retry", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [post] = await db
    .select({
      id: socialPostsTable.id,
      userId: socialPostsTable.userId,
      status: socialPostsTable.status,
      approvalStatus: socialPostsTable.approvalStatus,
      platforms: socialPostsTable.platforms,
      updatedAt: socialPostsTable.updatedAt,
    })
    .from(socialPostsTable)
    .where(and(
      eq(socialPostsTable.id, req.params.postId),
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

  const [requestedDelivery] = await db
    .select()
    .from(platformDeliveriesTable)
    .where(and(
      eq(platformDeliveriesTable.id, req.params.deliveryId),
      eq(platformDeliveriesTable.postId, post.id),
      eq(platformDeliveriesTable.userId, userId),
    ));
  if (!requestedDelivery) {
    res.status(404).json({ error: "Delivery not found" });
    return;
  }

  const laneDeliveries = await db
    .select()
    .from(platformDeliveriesTable)
    .where(and(
      eq(platformDeliveriesTable.postId, post.id),
      eq(platformDeliveriesTable.userId, userId),
      eq(platformDeliveriesTable.platform, requestedDelivery.platform),
    ))
    .orderBy(desc(platformDeliveriesTable.attemptNumber), desc(platformDeliveriesTable.updatedAt));

  const retryDecision = evaluateIsolatedLaneRetry({
    postStatus: post.status,
    approvalStatus: post.approvalStatus,
    expectedPlatforms: binding.platforms,
    platform: requestedDelivery.platform,
    requestedDeliveryId: requestedDelivery.id,
    deliveries: laneDeliveries,
  });
  if (!retryDecision.allowed) {
    res.status(409).json({
      error: retryDecision.message,
      code: retryDecision.code,
      latestDeliveryId: retryDecision.latestDeliveryId ?? null,
    });
    return;
  }

  const preflight = await validatePreFlight(post.id, userId);
  const targetValidation = preflight.platforms.find(
    item => item.platform === requestedDelivery.platform,
  );
  if (!preflight.approved || !targetValidation?.canPublish) {
    res.status(409).json({
      error: targetValidation?.reason ?? "Post is no longer eligible for publishing.",
      code: "RETRY_PREFLIGHT_BLOCKED",
    });
    return;
  }

  const nextAttemptNumber = requestedDelivery.attemptNumber + 1;
  const nextAttemptId = deriveAttemptId(
    post.id,
    requestedDelivery.platform,
    nextAttemptNumber,
  );

  const claimedDelivery = await db.transaction(async tx => {
    const claimAt = new Date();
    const claimedPost = await tx
      .update(socialPostsTable)
      .set({
        status: "publishing",
        publishedBy: userId,
        updatedAt: claimAt,
      })
      .where(and(
        eq(socialPostsTable.id, post.id),
        eq(socialPostsTable.userId, userId),
        eq(socialPostsTable.status, post.status),
        eq(socialPostsTable.approvalStatus, "approved"),
        eq(socialPostsTable.platforms, post.platforms),
        eq(socialPostsTable.updatedAt, post.updatedAt),
      ))
      .returning({ id: socialPostsTable.id });

    if (claimedPost.length !== 1) return null;

    const [delivery] = await tx
      .insert(platformDeliveriesTable)
      .values({
        postId: post.id,
        userId,
        platform: requestedDelivery.platform,
        status: "publishing",
        attemptNumber: nextAttemptNumber,
        attemptId: nextAttemptId,
        retryAllowed: true,
        retryCount: (requestedDelivery.retryCount ?? 0) + 1,
        approvedBy: userId,
        publishedBy: userId,
        metadata: JSON.stringify({ retryOfDeliveryId: requestedDelivery.id }),
      })
      .returning();

    return delivery;
  });

  if (!claimedDelivery) {
    res.status(409).json({
      error: "Post or delivery state changed before retry ownership could be claimed. Refresh diagnostics before retrying.",
      code: "ISOLATED_RETRY_OWNERSHIP_CONFLICT",
    });
    return;
  }

  const port = parseInt(process.env.PORT ?? "8080", 10);
  const internalBase = `http://127.0.0.1:${port}`;

  let adapterHttpStatus: number | null = null;
  let adapterResult: {
    ok: boolean;
    error?: string;
    postId?: string;
    postUrl?: string;
  } | undefined;

  try {
    const adapterResponse = await fetch(`${internalBase}/api/social-posts/${post.id}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scheduler-secret": SCHEDULER_SECRET,
        [INTERNAL_PUBLISH_PLATFORM_HEADER]: requestedDelivery.platform,
      },
    });
    adapterHttpStatus = adapterResponse.status;
    const text = await adapterResponse.text();
    try {
      const parsed = JSON.parse(text) as {
        results?: Record<string, {
          ok: boolean;
          error?: string;
          postId?: string;
          postUrl?: string;
        }>;
      };
      adapterResult = parsed.results?.[requestedDelivery.platform];
    } catch {
      adapterResult = undefined;
    }
  } catch (error) {
    adapterResult = {
      ok: false,
      error: sanitizeError(error instanceof Error ? error.message : String(error)),
    };
  }

  const terminal = adapterResultToStatus(adapterResult);
  const now = new Date();

  try {
    await db
      .update(platformDeliveriesTable)
      .set({
        status: terminal.status,
        externalPostId: terminal.externalPostId,
        externalPostUrl: terminal.externalPostUrl,
        apiResponseStatus: adapterHttpStatus,
        errorMessage: terminal.errorMessage,
        publishedAt: terminal.status === "published" ? now : undefined,
        failedAt: terminal.status === "failed" ? now : undefined,
        updatedAt: now,
      })
      .where(and(
        eq(platformDeliveriesTable.id, claimedDelivery.id),
        eq(platformDeliveriesTable.userId, userId),
      ));
  } catch (error) {
    console.error(
      `[ISOLATED-LANE-RETRY] receipt persistence failed post=${post.id} delivery=${claimedDelivery.id}`,
      sanitizeError(error instanceof Error ? error.message : String(error)),
    );
    res.status(500).json({
      error: "Provider result could not be durably persisted. The lane remains protected from automatic replay and requires manual review.",
      code: "ISOLATED_RETRY_RECEIPT_PERSISTENCE_FAILED",
      deliveryId: claimedDelivery.id,
    });
    return;
  }

  const [finalPost] = await db
    .update(socialPostsTable)
    .set({
      status: "failed",
      errorMessage: terminal.errorMessage,
      updatedAt: new Date(),
    })
    .where(and(
      eq(socialPostsTable.id, post.id),
      eq(socialPostsTable.userId, userId),
      eq(socialPostsTable.status, "publishing"),
    ))
    .returning({
      status: socialPostsTable.status,
      publishedAt: socialPostsTable.publishedAt,
      errorMessage: socialPostsTable.errorMessage,
    });

  if (!finalPost) {
    res.status(409).json({
      error: "Delivery result is durable, but aggregate post state changed before final reconciliation. Refresh diagnostics; stale recovery can reconcile from the ledger without replaying the provider.",
      code: "ISOLATED_RETRY_AGGREGATE_CONFLICT",
      deliveryId: claimedDelivery.id,
      deliveryStatus: terminal.status,
    });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: terminal.status === "published",
    postId: post.id,
    platform: requestedDelivery.platform,
    retriedDeliveryId: requestedDelivery.id,
    delivery: {
      id: claimedDelivery.id,
      attemptNumber: claimedDelivery.attemptNumber,
      status: terminal.status,
      externalPostId: terminal.externalPostId,
      externalPostUrl: terminal.externalPostUrl,
      errorMessage: terminal.errorMessage,
      apiResponseStatus: adapterHttpStatus,
    },
    post: finalPost,
  });
});

export default router;
