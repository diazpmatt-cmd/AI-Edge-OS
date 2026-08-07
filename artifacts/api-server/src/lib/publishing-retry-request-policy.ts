import { hasVerifiedExternalReceipt } from "./publishing-ledger-authority.js";

export interface RetryPolicyDelivery {
  readonly status: string;
  readonly attemptNumber: number;
  readonly retryAllowed: boolean;
  readonly externalPostId: string | null;
  readonly externalPostUrl: string | null;
  readonly updatedAt: Date | string | null;
}

export interface PublishingRetryDecision {
  readonly allowed: boolean;
  readonly code: string;
  readonly message: string;
}

function timeValue(value: Date | string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = value instanceof Date ? value : new Date(value);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

export function evaluatePublishingRetryRequest(input: {
  readonly postStatus: string;
  readonly expectedPlatforms: readonly string[];
  readonly deliveries: readonly RetryPolicyDelivery[];
}): PublishingRetryDecision {
  if (input.expectedPlatforms.length !== 1) {
    return {
      allowed: false,
      code: "MULTI_PLATFORM_RETRY_REQUIRES_ISOLATED_BOUNDARY",
      message: "Full-post retry is disabled for multi-platform posts. Retry only an explicitly isolated failed delivery lane.",
    };
  }

  if (input.deliveries.some(hasVerifiedExternalReceipt)) {
    return {
      allowed: false,
      code: "RETRY_BLOCKED_VERIFIED_RECEIPT",
      message: "Retry is blocked because this platform already has a verified external receipt.",
    };
  }

  const latest = [...input.deliveries].sort((a, b) =>
    b.attemptNumber - a.attemptNumber || timeValue(b.updatedAt) - timeValue(a.updatedAt)
  )[0];

  if (!latest) {
    return {
      allowed: false,
      code: "RETRY_DELIVERY_MISSING",
      message: "Retry is blocked because no prior delivery attempt exists for this platform.",
    };
  }

  if (input.postStatus !== "failed") {
    return {
      allowed: false,
      code: "RETRY_POST_STATE_INVALID",
      message: `Retry requires aggregate post status failed; current status is ${input.postStatus}.`,
    };
  }

  if (!["failed", "skipped"].includes(latest.status)) {
    return {
      allowed: false,
      code: "RETRY_LANE_STATE_INVALID",
      message: `Retry requires the latest isolated lane to be failed or skipped; current status is ${latest.status}.`,
    };
  }

  if (!latest.retryAllowed) {
    return {
      allowed: false,
      code: "RETRY_NOT_ALLOWED",
      message: "Retry is disabled for the latest delivery attempt.",
    };
  }

  return {
    allowed: true,
    code: "ISOLATED_RETRY_ALLOWED",
    message: "The isolated failed delivery is eligible for retry.",
  };
}
