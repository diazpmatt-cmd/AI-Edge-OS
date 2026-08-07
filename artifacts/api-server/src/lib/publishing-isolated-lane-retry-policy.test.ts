import { describe, expect, it } from "vitest";

import { evaluateIsolatedLaneRetry } from "./publishing-isolated-lane-retry-policy.js";

const baseDelivery = {
  id: "delivery-2",
  platform: "instagram",
  status: "failed",
  attemptNumber: 2,
  retryAllowed: true,
  externalPostId: null,
  externalPostUrl: null,
  updatedAt: "2026-08-06T20:00:00.000Z",
};

function decide(overrides: Record<string, unknown> = {}) {
  return evaluateIsolatedLaneRetry({
    postStatus: "published_with_warning",
    approvalStatus: "approved",
    expectedPlatforms: ["facebook", "instagram"],
    platform: "instagram",
    requestedDeliveryId: "delivery-2",
    deliveries: [baseDelivery],
    ...overrides,
  } as any);
}

describe("evaluateIsolatedLaneRetry", () => {
  it("allows the latest failed lane on a multi-platform partial publish", () => {
    expect(decide()).toMatchObject({
      allowed: true,
      code: "ISOLATED_LANE_RETRY_ALLOWED",
      latestDeliveryId: "delivery-2",
    });
  });

  it("also allows retry when the aggregate post fully failed", () => {
    expect(decide({ postStatus: "failed" }).allowed).toBe(true);
  });

  it("blocks a platform outside the immutable source binding", () => {
    expect(decide({ platform: "google" }).code).toBe("RETRY_PLATFORM_NOT_BOUND");
  });

  it("blocks any lane with a historical verified receipt", () => {
    const deliveries = [
      {
        ...baseDelivery,
        id: "delivery-1",
        status: "published",
        attemptNumber: 1,
        externalPostId: "provider-123",
      },
      baseDelivery,
    ];
    expect(decide({ deliveries }).code).toBe("RETRY_BLOCKED_VERIFIED_RECEIPT");
  });

  it("blocks retry of a stale delivery id when a newer attempt exists", () => {
    const deliveries = [
      { ...baseDelivery, id: "delivery-1", attemptNumber: 1 },
      baseDelivery,
    ];
    expect(decide({ requestedDeliveryId: "delivery-1", deliveries })).toMatchObject({
      allowed: false,
      code: "RETRY_NOT_LATEST_ATTEMPT",
      latestDeliveryId: "delivery-2",
    });
  });

  it("blocks in-flight and successful latest attempts", () => {
    expect(decide({ deliveries: [{ ...baseDelivery, status: "publishing" }] }).code)
      .toBe("RETRY_LANE_STATE_INVALID");
    expect(decide({ deliveries: [{ ...baseDelivery, status: "published", externalPostId: null }] }).code)
      .toBe("RETRY_LANE_STATE_INVALID");
  });

  it("blocks explicitly non-retryable lanes", () => {
    expect(decide({ deliveries: [{ ...baseDelivery, retryAllowed: false }] }).code)
      .toBe("RETRY_NOT_ALLOWED");
  });

  it("requires the original human approval to remain intact", () => {
    expect(decide({ approvalStatus: "pending_review" }).code)
      .toBe("RETRY_APPROVAL_REQUIRED");
  });
});
