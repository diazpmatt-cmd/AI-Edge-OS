import { describe, expect, it } from "vitest";

import { evaluatePublishingRetryRequest } from "./publishing-retry-request-policy.js";

const failedDelivery = {
  status: "failed",
  attemptNumber: 1,
  retryAllowed: true,
  externalPostId: null,
  externalPostUrl: null,
  updatedAt: "2026-08-07T00:00:00.000Z",
};

describe("evaluatePublishingRetryRequest", () => {
  it("allows an isolated retryable failed lane", () => {
    const decision = evaluatePublishingRetryRequest({
      postStatus: "failed",
      expectedPlatforms: ["facebook"],
      deliveries: [failedDelivery],
    });
    expect(decision).toMatchObject({ allowed: true, code: "ISOLATED_RETRY_ALLOWED" });
  });

  it("blocks multi-platform full-post retry", () => {
    const decision = evaluatePublishingRetryRequest({
      postStatus: "failed",
      expectedPlatforms: ["facebook", "instagram"],
      deliveries: [failedDelivery],
    });
    expect(decision).toMatchObject({ allowed: false, code: "MULTI_PLATFORM_RETRY_REQUIRES_ISOLATED_BOUNDARY" });
  });

  it("blocks any historical verified external receipt", () => {
    const decision = evaluatePublishingRetryRequest({
      postStatus: "failed",
      expectedPlatforms: ["facebook"],
      deliveries: [
        { ...failedDelivery, status: "published", externalPostId: "provider-123" },
        { ...failedDelivery, attemptNumber: 2 },
      ],
    });
    expect(decision).toMatchObject({ allowed: false, code: "RETRY_BLOCKED_VERIFIED_RECEIPT" });
  });

  it("blocks missing delivery history", () => {
    const decision = evaluatePublishingRetryRequest({
      postStatus: "failed",
      expectedPlatforms: ["facebook"],
      deliveries: [],
    });
    expect(decision).toMatchObject({ allowed: false, code: "RETRY_DELIVERY_MISSING" });
  });

  it("uses the latest attempt when deciding lane state", () => {
    const decision = evaluatePublishingRetryRequest({
      postStatus: "failed",
      expectedPlatforms: ["facebook"],
      deliveries: [
        failedDelivery,
        { ...failedDelivery, attemptNumber: 2, status: "publishing" },
      ],
    });
    expect(decision).toMatchObject({ allowed: false, code: "RETRY_LANE_STATE_INVALID" });
  });

  it("blocks a retry-disabled latest delivery", () => {
    const decision = evaluatePublishingRetryRequest({
      postStatus: "failed",
      expectedPlatforms: ["facebook"],
      deliveries: [{ ...failedDelivery, retryAllowed: false }],
    });
    expect(decision).toMatchObject({ allowed: false, code: "RETRY_NOT_ALLOWED" });
  });

  it("blocks aggregate states other than failed", () => {
    const decision = evaluatePublishingRetryRequest({
      postStatus: "published_with_warning",
      expectedPlatforms: ["facebook"],
      deliveries: [failedDelivery],
    });
    expect(decision).toMatchObject({ allowed: false, code: "RETRY_POST_STATE_INVALID" });
  });
});
