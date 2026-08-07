import { describe, expect, it } from "vitest";

import { buildWeeklyDeliverySummary } from "./apollos-weekly-delivery-status";

function post(id: string) {
  return {
    id,
    weeklyPlanId: "weekly:facebook",
    status: "published_with_warning",
    approvalStatus: "approved",
    scheduledAt: "2026-08-10T13:00:00.000Z",
    publishedAt: "2026-08-10T13:01:00.000Z",
  };
}

function attempt(
  postId: string,
  status: string,
  externalPostId: string | null,
) {
  return {
    postId,
    platform: "facebook",
    status,
    attemptNumber: 1,
    externalPostId,
    externalPostUrl: null,
    errorCode: null,
    errorMessage: null,
    retryAllowed: false,
    publishedAt: "2026-08-10T13:01:00.000Z",
    updatedAt: "2026-08-10T13:01:00.000Z",
  };
}

describe("Apollos weekly delivery ledger authority", () => {
  it.each(["published", "published_with_warning", "idempotency_hit"])(
    "counts %s as verified only with an external receipt",
    (status) => {
      const summary = buildWeeklyDeliverySummary({
        expectedDeliveries: 1,
        jobs: [
          {
            generatorPlatform: "facebook",
            weeklyPlanId: "weekly:facebook",
            count: 1,
          },
        ],
        posts: [post("post-1")],
        attempts: [attempt("post-1", status, "external-1")],
      });

      expect(summary.publishedDeliveries).toBe(1);
      expect(summary.receiptMissingDeliveries).toBe(0);
      expect(summary.unresolvedDeliveries).toBe(0);
      expect(summary.lifecycle).toBe("published");
      expect(summary.channels[0]?.receipts).toHaveLength(1);
    },
  );

  it.each(["published", "published_with_warning", "idempotency_hit"])(
    "fails receipt integrity for receipt-classified %s without external evidence",
    (status) => {
      const summary = buildWeeklyDeliverySummary({
        expectedDeliveries: 1,
        jobs: [
          {
            generatorPlatform: "facebook",
            weeklyPlanId: "weekly:facebook",
            count: 1,
          },
        ],
        posts: [post("post-1")],
        attempts: [attempt("post-1", status, null)],
      });

      expect(summary.publishedDeliveries).toBe(0);
      expect(summary.receiptMissingDeliveries).toBe(1);
      expect(summary.unresolvedDeliveries).toBe(0);
      expect(summary.lifecycle).toBe("failed");
      expect(summary.channels[0]?.failures[0]).toMatchObject({
        status: "receipt_missing",
        errorCode: "PROVIDER_RECEIPT_MISSING",
      });
    },
  );

  it("uses the latest attempt when an earlier failure is followed by an idempotency receipt", () => {
    const summary = buildWeeklyDeliverySummary({
      expectedDeliveries: 1,
      jobs: [
        {
          generatorPlatform: "facebook",
          weeklyPlanId: "weekly:facebook",
          count: 1,
        },
      ],
      posts: [post("post-1")],
      attempts: [
        {
          ...attempt("post-1", "failed", null),
          attemptNumber: 1,
          errorCode: "TEMPORARY_PROVIDER_ERROR",
          retryAllowed: true,
          publishedAt: null,
          updatedAt: "2026-08-10T13:00:30.000Z",
        },
        {
          ...attempt("post-1", "idempotency_hit", "external-existing"),
          attemptNumber: 2,
          updatedAt: "2026-08-10T13:01:00.000Z",
        },
      ],
    });

    expect(summary.publishedDeliveries).toBe(1);
    expect(summary.failedDeliveries).toBe(0);
    expect(summary.lifecycle).toBe("published");
    expect(summary.channels[0]?.receipts[0]).toMatchObject({
      attemptNumber: 2,
      externalPostId: "external-existing",
    });
  });
});
