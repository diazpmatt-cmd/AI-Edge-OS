import { hasVerifiedExternalReceipt } from "./publishing-ledger-authority.js";

export interface IsolatedLaneRetryDelivery {
  readonly id: string;
  readonly platform: string;
  readonly status: string;
  readonly attemptNumber: number;
  readonly retryAllowed: boolean;
  readonly externalPostId: string | null;
  readonly externalPostUrl: string | null;
  readonly updatedAt: Date | string | null;
}

export interface IsolatedLaneRetryDecision {
  readonly allowed: boolean;
  readonly code: string;
  readonly message: string;
  readonly latestDeliveryId?: string;
}

function timeValue(value: Date | string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = value instanceof Date ? value : new Date(value);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

export function evaluateIsolatedLaneRetry(input: {
  readonly postStatus: string;
  readonly approvalStatus: string | null;
  readonly expectedPlatforms: readonly string[];
  readonly platform: string;
  readonly requestedDeliveryId: string;
  readonly deliveries: readonly IsolatedLaneRetryDelivery[];
}): IsolatedLaneRetryDecision {
  if (!input.expectedPlatforms.includes(input.platform)) {
    return {
      allowed: false,
      code: "RETRY_PLATFORM_NOT_BOUND",
      message: "Retry is blocked because the requested platform is not bound to this post.",
    };
  }

  if (!["failed", "published_with_warning"].includes(input.postStatus)) {
    return {
      allowed: false,
      code: "RETRY_POST_STATE_INVALID",
      message: `Retry requires aggregate post status failed or published_with_warning; current status is ${input.postStatus}.`,
    };
  }

  if (input.approvalStatus !== "approved") {
    return {
      allowed: false,
      code: "RETRY_APPROVAL_REQUIRED",
      message: "Retry is blocked because the source post is not approved.",
    };
  }

  const laneDeliveries = input.deliveries.filter(d => d.platform === input.platform);
  if (laneDeliveries.some(hasVerifiedExternalReceipt)) {
    return {
      allowed: false,
      code: "RETRY_BLOCKED_VERIFIED_RECEIPT",
      message: "Retry is blocked because this platform already has a verified external receipt.",
    };
  }

  const latest = [...laneDeliveries].sort((a, b) =>
    b.attemptNumber - a.attemptNumber || timeValue(b.updatedAt) - timeValue(a.updatedAt)
  )[0];

  if (!latest) {
    return {
      allowed: false,
      code: "RETRY_DELIVERY_MISSING",
      message: "Retry is blocked because no prior delivery attempt exists for this platform.",
    };
  }

  if (latest.id !== input.requestedDeliveryId) {
    return {
      allowed: false,
      code: "RETRY_NOT_LATEST_ATTEMPT",
      message: "Retry is blocked because a newer delivery attempt exists for this platform.",
      latestDeliveryId: latest.id,
    };
  }

  if (!["failed", "skipped"].includes(latest.status)) {
    return {
      allowed: false,
      code: "RETRY_LANE_STATE_INVALID",
      message: `Retry requires the latest lane attempt to be failed or skipped; current status is ${latest.status}.`,
      latestDeliveryId: latest.id,
    };
  }

  if (!latest.retryAllowed) {
    return {
      allowed: false,
      code: "RETRY_NOT_ALLOWED",
      message: "Retry is disabled for the latest delivery attempt.",
      latestDeliveryId: latest.id,
    };
  }

  return {
    allowed: true,
    code: "ISOLATED_LANE_RETRY_ALLOWED",
    message: "The failed platform lane is eligible for isolated retry.",
    latestDeliveryId: latest.id,
  };
}
