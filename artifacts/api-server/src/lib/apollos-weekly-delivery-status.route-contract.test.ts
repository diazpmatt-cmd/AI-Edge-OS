import { describe, expect, it } from "vitest";

import { buildWeeklyDeliverySummary } from "./apollos-weekly-delivery-status";

describe("weekly delivery operator contract", () => {
  it("keeps platform lanes isolated while aggregating the campaign", () => {
    const summary = buildWeeklyDeliverySummary({
      expectedDeliveries: 2,
      jobs: [
        { generatorPlatform: "facebook", weeklyPlanId: "weekly:facebook", count: 1 },
        { generatorPlatform: "google", weeklyPlanId: "weekly:google", count: 1 },
      ],
      posts: [
        {
          id: "facebook-post",
          weeklyPlanId: "weekly:facebook",
          status: "published",
          approvalStatus: "approved",
          scheduledAt: "2026-08-10T13:00:00.000Z",
          publishedAt: "2026-08-10T13:01:00.000Z",
        },
        {
          id: "google-post",
          weeklyPlanId: "weekly:google",
          status: "failed",
          approvalStatus: "approved",
          scheduledAt: "2026-08-11T15:00:00.000Z",
          publishedAt: null,
        },
      ],
      attempts: [
        {
          postId: "facebook-post",
          platform: "facebook",
          status: "published",
          attemptNumber: 1,
          externalPostId: "facebook-receipt",
          externalPostUrl: null,
          errorCode: null,
          errorMessage: null,
          retryAllowed: false,
          publishedAt: "2026-08-10T13:01:00.000Z",
          updatedAt: "2026-08-10T13:01:00.000Z",
        },
        {
          postId: "google-post",
          platform: "google",
          status: "failed",
          attemptNumber: 1,
          externalPostId: null,
          externalPostUrl: null,
          errorCode: "GBP_PROVIDER_ERROR",
          errorMessage: "Google Business Profile rejected the request",
          retryAllowed: true,
          publishedAt: null,
          updatedAt: "2026-08-11T15:01:00.000Z",
        },
      ],
    });

    expect(summary.lifecycle).toBe("partial");
    expect(summary.channels).toEqual([
      expect.objectContaining({
        platform: "facebook",
        lifecycle: "published",
        published: 1,
        failed: 0,
      }),
      expect.objectContaining({
        platform: "google",
        lifecycle: "failed",
        published: 0,
        failed: 1,
      }),
    ]);
  });
});
