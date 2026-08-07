import { describe, expect, it } from "vitest";

import {
  buildApollosPublishingStatusSummary,
  formatApollosPublishingStatusReply,
  isApollosPublishingStatusQuestion,
} from "./apollos-publishing-status";

const post = (overrides: Partial<{
  id: string;
  status: string;
  platforms: string | null;
  updatedAt: string | null;
}> = {}) => ({
  id: "post-1",
  status: "published",
  platforms: '["facebook"]',
  updatedAt: "2026-08-10T13:00:00.000Z",
  ...overrides,
});

const delivery = (overrides: Partial<{
  postId: string;
  platform: string;
  status: string;
  attemptNumber: number;
  externalPostId: string | null;
  externalPostUrl: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
}> = {}) => ({
  postId: "post-1",
  platform: "facebook",
  status: "published",
  attemptNumber: 1,
  externalPostId: "fb-1",
  externalPostUrl: null,
  publishedAt: "2026-08-10T13:01:00.000Z",
  updatedAt: "2026-08-10T13:01:00.000Z",
  ...overrides,
});

describe("isApollosPublishingStatusQuestion", () => {
  it("matches publishing-status questions without swallowing unrelated chat", () => {
    expect(isApollosPublishingStatusQuestion("Did the post publish?" )).toBe(true);
    expect(isApollosPublishingStatusQuestion("What failed with the posts?" )).toBe(true);
    expect(isApollosPublishingStatusQuestion("How are my leads doing?" )).toBe(false);
  });
});

describe("buildApollosPublishingStatusSummary", () => {
  it("uses canonical receipt authority including idempotency hits", () => {
    const summary = buildApollosPublishingStatusSummary({
      posts: [post()],
      deliveries: [delivery({ status: "idempotency_hit" })],
    });

    expect(summary).toMatchObject({
      verifiedDeliveries: 1,
      failedDeliveries: 0,
      receiptMissingDeliveries: 0,
      unresolvedDeliveries: 0,
      allExpectedDeliveriesVerified: true,
      lastVerifiedPlatform: "facebook",
    });
  });

  it("counts receipt-classified success without external evidence as an integrity issue", () => {
    const summary = buildApollosPublishingStatusSummary({
      posts: [post()],
      deliveries: [delivery({
        status: "published_with_warning",
        externalPostId: null,
        externalPostUrl: null,
      })],
    });

    expect(summary).toMatchObject({
      verifiedDeliveries: 0,
      receiptMissingDeliveries: 1,
      allExpectedDeliveriesVerified: false,
    });
  });

  it("uses only the latest attempt for an expected post/platform lane", () => {
    const summary = buildApollosPublishingStatusSummary({
      posts: [post()],
      deliveries: [
        delivery({
          status: "failed",
          attemptNumber: 1,
          externalPostId: null,
          updatedAt: "2026-08-10T13:00:00.000Z",
        }),
        delivery({
          status: "idempotency_hit",
          attemptNumber: 2,
          externalPostId: "fb-existing",
          updatedAt: "2026-08-10T13:02:00.000Z",
        }),
      ],
    });

    expect(summary.verifiedDeliveries).toBe(1);
    expect(summary.failedDeliveries).toBe(0);
  });

  it("ignores unexpected platform receipts and marks the expected lane unresolved", () => {
    const summary = buildApollosPublishingStatusSummary({
      posts: [post()],
      deliveries: [delivery({ platform: "instagram", externalPostId: "ig-1" })],
    });

    expect(summary).toMatchObject({
      verifiedDeliveries: 0,
      unresolvedDeliveries: 1,
      allExpectedDeliveriesVerified: false,
    });
    expect(summary.platforms).toEqual([
      { platform: "facebook", verified: 0, failed: 0, receiptMissing: 0, unresolved: 1 },
    ]);
  });

  it("fails closed on malformed platform bindings", () => {
    const summary = buildApollosPublishingStatusSummary({
      posts: [post({ platforms: "not-json" })],
      deliveries: [delivery()],
    });

    expect(summary.invalidPlatformBindings).toBe(1);
    expect(summary.allExpectedDeliveriesVerified).toBe(false);
  });
});

describe("formatApollosPublishingStatusReply", () => {
  it("states clearly when every expected lane is verified", () => {
    const summary = buildApollosPublishingStatusSummary({
      posts: [post()],
      deliveries: [delivery()],
    });

    const reply = formatApollosPublishingStatusReply(summary);
    expect(reply).toContain("every expected delivery");
    expect(reply).toContain("1 verified external delivery");
    expect(reply).toContain("facebook");
  });

  it("directs unresolved cases to operator diagnostics without claiming publication", () => {
    const summary = buildApollosPublishingStatusSummary({
      posts: [post({ status: "publishing" })],
      deliveries: [],
    });

    const reply = formatApollosPublishingStatusReply(summary);
    expect(reply).toContain("not every expected delivery is verified");
    expect(reply).toContain("System Diagnostics");
    expect(reply).toContain("will not treat a delivery as published without an external receipt");
  });
});
