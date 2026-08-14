import { describe, expect, it, vi } from "vitest";

import { buildWeeklyCampaignPlan } from "./apollos-weekly-campaign";
import { buildWeeklyDeliverySummary } from "./apollos-weekly-delivery-status";
import {
  APOLLOS_WEEKLY_PUBLISHING_HEALTH_MCP_TOOL,
  classifyWeeklyPublishingHealth,
  executeApollosWeeklyPublishingHealthMcpTool,
  type WeeklyPublishingHealthData,
} from "./apollos-weekly-publishing-health";

const plan = buildWeeklyCampaignPlan({
  startDate: "2026-08-10",
  platforms: ["facebook", "instagram", "google_business", "youtube"],
});

const jobs = [
  { generatorPlatform: "facebook", weeklyPlanId: "fb", count: 5 },
  { generatorPlatform: "instagram", weeklyPlanId: "ig", count: 5 },
  { generatorPlatform: "google", weeklyPlanId: "gbp", count: 2 },
  { generatorPlatform: "youtube", weeklyPlanId: "yt", count: 1 },
] as const;

function posts() {
  return jobs.flatMap((job) =>
    Array.from({ length: job.count }, (_, index) => ({
      id: `${job.weeklyPlanId}-${index}`,
      weeklyPlanId: job.weeklyPlanId,
      status: "published",
      approvalStatus: "approved",
      scheduledAt: "2026-08-10T15:00:00.000Z",
      publishedAt: "2026-08-10T15:01:00.000Z",
    })),
  );
}

function attempts(options: { receiptMissing?: boolean; failed?: boolean } = {}) {
  return jobs.flatMap((job) =>
    Array.from({ length: job.count }, (_, index) => ({
      postId: `${job.weeklyPlanId}-${index}`,
      platform: job.generatorPlatform,
      status: options.failed && job.generatorPlatform === "instagram" && index === 0
        ? "failed"
        : "published",
      attemptNumber: 1,
      externalPostId:
        options.receiptMissing && job.generatorPlatform === "google" && index === 0
          ? null
          : `provider-${job.weeklyPlanId}-${index}`,
      externalPostUrl: null,
      errorCode: null,
      errorMessage: null,
      retryAllowed: true,
      publishedAt: "2026-08-10T15:01:00.000Z",
      updatedAt: "2026-08-10T15:01:00.000Z",
    })),
  );
}

function summary(options: { receiptMissing?: boolean; failed?: boolean } = {}) {
  return buildWeeklyDeliverySummary({
    expectedDeliveries: plan.deliveryCount,
    jobs,
    posts: posts(),
    attempts: attempts(options),
  });
}

const target = Object.freeze({
  clientId: "client-bbb",
  ownerUserId: "clerk-bbb-owner",
  slug: "bed-bugs-and-beyond",
  clientName: "Bed Bugs & Beyond",
  industry: "pest_control",
  industryLabel: "Pest Control",
  region: "Baldwin County",
  accessLevel: "operator" as const,
  ownership: "delegated" as const,
});

function verifiedData(): WeeklyPublishingHealthData {
  const delivery = summary();
  const classified = classifyWeeklyPublishingHealth({ plan, summary: delivery });
  return Object.freeze({
    ...classified,
    verificationRule: "external_post_id_or_url_required",
    taskId: "task-weekly",
    taskStatus: "approved",
    planStartDate: plan.startDate,
    planEndDate: plan.endDate,
    summary: delivery,
  });
}

describe("weekly publishing health", () => {
  it("publishes a read-only MCP descriptor", () => {
    expect(APOLLOS_WEEKLY_PUBLISHING_HEALTH_MCP_TOOL.name).toBe(
      "apollos_get_weekly_publishing_health",
    );
    expect(APOLLOS_WEEKLY_PUBLISHING_HEALTH_MCP_TOOL.annotations.readOnlyHint).toBe(true);
  });

  it("is verified only when every planned lane has a provider receipt", () => {
    const result = classifyWeeklyPublishingHealth({ plan, summary: summary() });
    expect(result).toMatchObject({
      status: "verified",
      reason: "all_expected_deliveries_receipt_verified",
      expectedPlatforms: ["facebook", "instagram", "google_business", "youtube"],
    });
    expect(result.channels.map((channel) => channel.platform)).toEqual([
      "facebook",
      "instagram",
      "google_business",
      "youtube",
    ]);
  });

  it("needs attention for receipt-missing or failed deliveries", () => {
    expect(classifyWeeklyPublishingHealth({
      plan,
      summary: summary({ receiptMissing: true }),
    }).status).toBe("needs_attention");
    expect(classifyWeeklyPublishingHealth({
      plan,
      summary: summary({ failed: true }),
    }).status).toBe("needs_attention");
  });

  it("is unverified when a planned platform lane is absent", () => {
    const delivery = summary();
    const withoutYouTube = {
      ...delivery,
      channels: delivery.channels.filter((channel) => channel.platform !== "youtube"),
    };
    expect(classifyWeeklyPublishingHealth({ plan, summary: withoutYouTube })).toMatchObject({
      status: "unverified",
      reason: "missing_platform_lane_evidence",
    });
  });

  it("uses server-authorized tenant ownership and never trusts clientId as an owner id", async () => {
    const resolveTarget = vi.fn(async () => ({ ok: true as const, target }));
    const readHealth = vi.fn(async () => verifiedData());

    const result = await executeApollosWeeklyPublishingHealthMcpTool({
      actorUserId: "clerk-matt",
      actorReference: "chatgpt-matt",
      arguments: { clientId: "client-bbb" },
      resolveTarget,
      readHealth,
    });

    expect(resolveTarget).toHaveBeenCalledWith("clerk-matt", "client-bbb");
    expect(readHealth).toHaveBeenCalledWith("clerk-bbb-owner");
    expect(result).toMatchObject({
      clientId: "client-bbb",
      sideEffects: false,
      data: { status: "verified" },
    });
  });

  it("fails closed for unauthorized tenants", async () => {
    await expect(executeApollosWeeklyPublishingHealthMcpTool({
      actorUserId: "clerk-matt",
      actorReference: "chatgpt-matt",
      arguments: { clientId: "client-other" },
      resolveTarget: async () => ({ ok: false, reason: "unauthorized" }),
      readHealth: async () => verifiedData(),
    })).rejects.toThrow("APOLLOS_MCP_CLIENT_UNAUTHORIZED");
  });

  it("returns unverified instead of inventing health when the ledger read fails", async () => {
    const result = await executeApollosWeeklyPublishingHealthMcpTool({
      actorUserId: "clerk-matt",
      actorReference: "chatgpt-matt",
      arguments: { clientId: "client-bbb" },
      resolveTarget: async () => ({ ok: true, target }),
      readHealth: async () => { throw new Error("database unavailable"); },
    });
    expect(result).toMatchObject({
      sideEffects: false,
      data: {
        status: "unverified",
        reason: "delivery_ledger_unavailable",
      },
    });
  });
});
