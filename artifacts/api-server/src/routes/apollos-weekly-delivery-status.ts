import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  agentTasksTable,
  platformDeliveriesTable,
  socialPostsTable,
} from "@workspace/db/schema";
import { and, eq, inArray } from "drizzle-orm";

import {
  assertWeeklyGenerationContract,
  type WeeklyCampaignPlan,
  type WeeklyGenerationJob,
} from "../lib/apollos-weekly-campaign.js";
import {
  buildWeeklyDeliverySummary,
  type WeeklyDeliveryAttemptInput,
} from "../lib/apollos-weekly-delivery-status.js";

const router = Router();

router.get("/agent-tasks/:id/weekly-delivery-status", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [task] = await db
    .select()
    .from(agentTasksTable)
    .where(
      and(
        eq(agentTasksTable.id, req.params.id),
        eq(agentTasksTable.userId, userId),
      ),
    );
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (task.taskType !== "weekly_campaign") {
    res.status(422).json({
      error: "This task is not a weekly campaign.",
      code: "APOLLOS_WEEKLY_DELIVERY_TASK_TYPE_INVALID",
    });
    return;
  }

  try {
    const payload =
      typeof task.payload === "string" ? JSON.parse(task.payload) : task.payload;
    const batchKey = payload?.batchKey;
    const plan = payload?.plan as WeeklyCampaignPlan;
    const generationJobs =
      payload?.generationJobs as readonly WeeklyGenerationJob[];
    if (
      typeof batchKey !== "string" ||
      !plan ||
      !Array.isArray(generationJobs)
    ) {
      throw new Error("APOLLOS_WEEKLY_DELIVERY_PAYLOAD_INVALID");
    }
    assertWeeklyGenerationContract(batchKey, plan, generationJobs);

    const weeklyPlanIds = generationJobs.map((job) => job.weeklyPlanId);
    const posts = await db
      .select({
        id: socialPostsTable.id,
        weeklyPlanId: socialPostsTable.weeklyPlanId,
        status: socialPostsTable.status,
        approvalStatus: socialPostsTable.approvalStatus,
        scheduledAt: socialPostsTable.scheduledAt,
        publishedAt: socialPostsTable.publishedAt,
      })
      .from(socialPostsTable)
      .where(
        and(
          eq(socialPostsTable.userId, userId),
          inArray(socialPostsTable.weeklyPlanId, weeklyPlanIds),
        ),
      );

    const postIds = posts.map((post) => post.id);
    let attempts: WeeklyDeliveryAttemptInput[] = [];
    if (postIds.length > 0) {
      attempts = await db
        .select({
          postId: platformDeliveriesTable.postId,
          platform: platformDeliveriesTable.platform,
          status: platformDeliveriesTable.status,
          attemptNumber: platformDeliveriesTable.attemptNumber,
          externalPostId: platformDeliveriesTable.externalPostId,
          externalPostUrl: platformDeliveriesTable.externalPostUrl,
          errorCode: platformDeliveriesTable.errorCode,
          errorMessage: platformDeliveriesTable.errorMessage,
          retryAllowed: platformDeliveriesTable.retryAllowed,
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
    }

    const summary = buildWeeklyDeliverySummary({
      expectedDeliveries: plan.deliveryCount,
      jobs: generationJobs,
      posts,
      attempts,
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      taskId: task.id,
      taskStatus: task.status,
      planStartDate: plan.startDate,
      planEndDate: plan.endDate,
      verificationRule: "external_post_id_or_url_required",
      ...summary,
    });
  } catch (error) {
    const code =
      error instanceof Error && error.message.startsWith("APOLLOS_WEEKLY_")
        ? error.message
        : "APOLLOS_WEEKLY_DELIVERY_STATUS_FAILED";
    const status = code === "APOLLOS_WEEKLY_DELIVERY_STATUS_FAILED" ? 500 : 409;
    res.status(status).json({
      error:
        status === 500
          ? "The delivery ledger could not be read safely."
          : "The stored weekly campaign contract could not be verified.",
      code,
    });
  }
});

export default router;
