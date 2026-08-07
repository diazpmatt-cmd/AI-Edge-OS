import { describe, expect, it } from "vitest";

import { buildWeeklyDeliverySummary } from "./apollos-weekly-delivery-status";

describe("Apollos weekly platform isolation", () => {
  it("does not let an unexpected platform receipt satisfy another channel", () => {
    const summary = buildWeeklyDeliverySummary({
      expectedDeliveries: 1,
      jobs: [
        {
          generatorPlatform: "facebook",
          weeklyPlanId: "weekly:facebook",
          count: 1,
        },
      ],
      posts: [
        {
          id: "post-1",
          weeklyPlanId: "weekly:facebook",
          status: "publishing",
          approvalStatus: "approved",
          scheduledAt: "2026-08-10T13:00:00.000Z",
          publishedAt: null,
        },
      ],
      attempts: [
        {
          postId: "post-1",
          platform: "instagram",
          status: "published",
          attemptNumber: 1,
          externalPostId: "ig-1",
          externalPostUrl: "https://instagram.example/p/ig-1",
          errorCode: null,
          errorMessage: null,
          retryAllowed: false,
          publishedAt: "2026-08-10T13:01:00.000Z",
          updatedAt: "2026-08-10T13:01:00.000Z",
        },
      ],
    });

    expect(summary.publishedDeliveries).toBe(0);
    expect(summary.attemptedDeliveries).toBe(0);
    expect(summary.unresolvedDeliveries).toBe(1);
    expect(summary.channels[0]).toMatchObject({
      platform: "facebook",
      expected: 1,
      attempted: 0,
      published: 0,
      unresolved: 1,
    });
    expect(summary.channels[0]?.receipts).toHaveLength(0);
  });

  it("counts only the matching platform when matching and unexpected receipts coexist", () => {
    const summary = buildWeeklyDeliverySummary({
      expectedDeliveries: 1,
      jobs: [
        {
          generatorPlatform: "facebook",
          weeklyPlanId: "weekly:facebook",
          count: 1,
        },
      ],
      posts: [
        {
          id: "post-1",
          weeklyPlanId: "weekly:facebook",
          status: "published_with_warning",
          approvalStatus: "approved",
          scheduledAt: "2026-08-10T13:00:00.000Z",
          publishedAt: "2026-08-10T13:01:00.000Z",
        },
      ],
      attempts: [
        {
          postId: "post-1",
          platform: "instagram",
          status: "published",
          attemptNumber: 1,
          externalPostId: "ig-1",
          externalPostUrl: null,
          errorCode: null,
          errorMessage: null,
          retryAllowed: false,
          publishedAt: "2026-08-10T13:00:45.000Z",
          updatedAt: "2026-08-10T13:00:45.000Z",
        },
        {
          postId: "post-1",
          platform: "facebook",
          status: "published_with_warning",
          attemptNumber: 1,
          externalPostId: "fb-1",
          externalPostUrl: null,
          errorCode: null,
          errorMessage: "Published with degraded metadata.",
          retryAllowed: false,
          publishedAt: "2026-08-10T13:01:00.000Z",
          updatedAt: "2026-08-10T13:01:00.000Z",
        },
      ],
    });

    expect(summary.publishedDeliveries).toBe(1);
    expect(summary.attemptedDeliveries).toBe(1);
    expect(summary.unresolvedDeliveries).toBe(0);
    expect(summary.lifecycle).toBe("published");
    expect(summary.channels[0]?.receipts).toEqual([
      expect.objectContaining({
        platform: "facebook",
        externalPostId: "fb-1",
      }),
    ]);
  });
});
