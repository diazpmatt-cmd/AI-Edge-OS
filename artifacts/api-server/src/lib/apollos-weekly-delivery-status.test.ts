import { describe, expect, it } from "vitest";

import {
  buildWeeklyDeliverySummary,
  sanitizeDeliveryDiagnostic,
} from "./apollos-weekly-delivery-status";

describe("buildWeeklyDeliverySummary", () => {
  it("reports the latest receipt-verified lifecycle per platform", () => {
    const summary = buildWeeklyDeliverySummary({
      expectedDeliveries: 3,
      jobs: [
        { generatorPlatform: "facebook", weeklyPlanId: "weekly:facebook", count: 2 },
        { generatorPlatform: "google", weeklyPlanId: "weekly:google", count: 1 },
      ],
      posts: [
        {
          id: "post-fb-1",
          weeklyPlanId: "weekly:facebook",
          status: "published",
          approvalStatus: "approved",
          scheduledAt: "2026-08-10T13:00:00.000Z",
          publishedAt: "2026-08-10T13:01:00.000Z",
        },
        {
          id: "post-fb-2",
          weeklyPlanId: "weekly:facebook",
          status: "failed",
          approvalStatus: "approved",
          scheduledAt: "2026-08-11T13:00:00.000Z",
          publishedAt: null,
        },
        {
          id: "post-google-1",
          weeklyPlanId: "weekly:google",
          status: "scheduled",
          approvalStatus: "approved",
          scheduledAt: "2026-08-11T15:00:00.000Z",
          publishedAt: null,
        },
      ],
      attempts: [
        {
          postId: "post-fb-1",
          platform: "facebook",
          status: "failed",
          attemptNumber: 1,
          externalPostId: null,
          externalPostUrl: null,
          errorCode: "TEMPORARY_PROVIDER_ERROR",
          errorMessage: "temporary failure",
          retryAllowed: true,
          publishedAt: null,
          updatedAt: "2026-08-10T13:00:30.000Z",
        },
        {
          postId: "post-fb-1",
          platform: "facebook",
          status: "published",
          attemptNumber: 2,
          externalPostId: "fb_123",
          externalPostUrl: "https://facebook.example/posts/fb_123",
          errorCode: null,
          errorMessage: null,
          retryAllowed: false,
          publishedAt: "2026-08-10T13:01:00.000Z",
          updatedAt: "2026-08-10T13:01:00.000Z",
        },
        {
          postId: "post-fb-2",
          platform: "facebook",
          status: "failed",
          attemptNumber: 1,
          externalPostId: null,
          externalPostUrl: null,
          errorCode: "PROVIDER_REJECTED",
          errorMessage: "Bearer secret-token provider rejected the post",
          retryAllowed: true,
          publishedAt: null,
          updatedAt: "2026-08-11T13:01:00.000Z",
        },
      ],
    });

    expect(summary.lifecycle).toBe("partial");
    expect(summary.publishedDeliveries).toBe(1);
    expect(summary.failedDeliveries).toBe(1);
    expect(summary.unresolvedDeliveries).toBe(1);
    expect(summary.channels[0]).toMatchObject({
      platform: "facebook",
      expected: 2,
      attempted: 2,
      published: 1,
      failed: 1,
      lifecycle: "partial",
    });
    expect(summary.channels[0]!.receipts).toHaveLength(1);
    expect(summary.channels[0]!.failures[0]!.message).toContain("[REDACTED]");
    expect(summary.channels[1]).toMatchObject({
      platform: "google",
      expected: 1,
      scheduled: 1,
      attempted: 0,
      unresolved: 1,
      lifecycle: "scheduled",
    });
  });

  it("does not count receipt-less published states as verified delivery", () => {
    const summary = buildWeeklyDeliverySummary({
      expectedDeliveries: 1,
      jobs: [
        { generatorPlatform: "facebook", weeklyPlanId: "weekly:facebook", count: 1 },
      ],
      posts: [
        {
          id: "post-fb-1",
          weeklyPlanId: "weekly:facebook",
          status: "published",
          approvalStatus: "approved",
          scheduledAt: "2026-08-10T13:00:00.000Z",
          publishedAt: "2026-08-10T13:01:00.000Z",
        },
      ],
      attempts: [
        {
          postId: "post-fb-1",
          platform: "facebook",
          status: "published",
          attemptNumber: 1,
          externalPostId: null,
          externalPostUrl: null,
          errorCode: null,
          errorMessage: null,
          retryAllowed: true,
          publishedAt: "2026-08-10T13:01:00.000Z",
          updatedAt: "2026-08-10T13:01:00.000Z",
        },
      ],
    });

    expect(summary.publishedDeliveries).toBe(0);
    expect(summary.receiptMissingDeliveries).toBe(1);
    expect(summary.lifecycle).toBe("failed");
    expect(summary.channels[0]!.failures[0]).toMatchObject({
      status: "receipt_missing",
      errorCode: "PROVIDER_RECEIPT_MISSING",
    });
  });
});

describe("sanitizeDeliveryDiagnostic", () => {
  it("redacts tokens and bounds operator-visible diagnostics", () => {
    const diagnostic = sanitizeDeliveryDiagnostic(
      `access_token=secret Bearer abc.def.ghi ${"a".repeat(80)} ${"x".repeat(300)}`,
    );

    expect(diagnostic).not.toContain("secret");
    expect(diagnostic).toContain("[REDACTED]");
    expect(diagnostic.length).toBeLessThanOrEqual(240);
  });
});
