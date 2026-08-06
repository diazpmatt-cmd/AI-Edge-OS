import { sanitizeError } from "./publishing-service.js";

export type SchedulerRecoveryStatus =
  | "published"
  | "published_with_warning"
  | "failed";

export interface SchedulerDeliveryEvidence {
  readonly platform: string;
  readonly status: string;
  readonly attemptNumber: number;
  readonly externalPostId: string | null;
  readonly externalPostUrl: string | null;
  readonly publishedAt: Date | string | null;
  readonly updatedAt: Date | string | null;
}

export interface SchedulerPublishRecovery {
  readonly status: SchedulerRecoveryStatus;
  readonly verifiedPublished: number;
  readonly terminalFailures: number;
  readonly unresolved: number;
  readonly expectedPlatforms: number;
  readonly publishedAt: Date | null;
  readonly errorMessage: string;
}

function dateMs(value: Date | string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = value instanceof Date ? value : new Date(value);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function latestByPlatform(
  deliveries: readonly SchedulerDeliveryEvidence[],
): ReadonlyMap<string, SchedulerDeliveryEvidence> {
  const latest = new Map<string, SchedulerDeliveryEvidence>();
  for (const delivery of deliveries) {
    const current = latest.get(delivery.platform);
    if (
      !current ||
      delivery.attemptNumber > current.attemptNumber ||
      (delivery.attemptNumber === current.attemptNumber &&
        dateMs(delivery.updatedAt) > dateMs(current.updatedAt))
    ) {
      latest.set(delivery.platform, delivery);
    }
  }
  return latest;
}

function hasVerifiedReceipt(delivery: SchedulerDeliveryEvidence): boolean {
  return (
    delivery.status === "published" &&
    Boolean(delivery.externalPostId || delivery.externalPostUrl)
  );
}

function isTerminalFailure(delivery: SchedulerDeliveryEvidence): boolean {
  return (
    ["failed", "skipped", "cancelled"].includes(delivery.status) ||
    (delivery.status === "published" &&
      !delivery.externalPostId &&
      !delivery.externalPostUrl)
  );
}

export function reconcileSchedulerPublishException(input: {
  readonly expectedPlatforms: readonly string[];
  readonly deliveries: readonly SchedulerDeliveryEvidence[];
  readonly error: string;
}): SchedulerPublishRecovery {
  const expected = [...new Set(input.expectedPlatforms.filter(Boolean))];
  const latest = latestByPlatform(input.deliveries);
  const platforms = expected.length > 0 ? expected : [...latest.keys()];
  const evidence = platforms
    .map((platform) => latest.get(platform))
    .filter((delivery): delivery is SchedulerDeliveryEvidence => Boolean(delivery));

  const verified = evidence.filter(hasVerifiedReceipt);
  const terminalFailures = evidence.filter(isTerminalFailure).length;
  const unresolved = Math.max(
    0,
    platforms.length - verified.length - terminalFailures,
  );
  const publishedAtMs = verified.reduce(
    (latestTime, delivery) => Math.max(latestTime, dateMs(delivery.publishedAt)),
    Number.NEGATIVE_INFINITY,
  );
  const publishedAt = Number.isFinite(publishedAtMs)
    ? new Date(publishedAtMs)
    : null;
  const sanitized = sanitizeError(input.error || "Unknown scheduler error");

  if (platforms.length > 0 && verified.length === platforms.length) {
    return Object.freeze({
      status: "published" as const,
      verifiedPublished: verified.length,
      terminalFailures,
      unresolved,
      expectedPlatforms: platforms.length,
      publishedAt,
      errorMessage:
        `Scheduler recovered aggregate state from ${verified.length} verified ` +
        `external delivery receipt${verified.length === 1 ? "" : "s"} after a runtime error.`,
    });
  }

  if (verified.length > 0) {
    return Object.freeze({
      status: "published_with_warning" as const,
      verifiedPublished: verified.length,
      terminalFailures,
      unresolved,
      expectedPlatforms: platforms.length,
      publishedAt,
      errorMessage:
        `Scheduler error after ${verified.length}/${platforms.length || "unknown"} ` +
        `verified external deliveries; successful platform receipts were preserved. ${sanitized}`,
    });
  }

  return Object.freeze({
    status: "failed" as const,
    verifiedPublished: 0,
    terminalFailures,
    unresolved,
    expectedPlatforms: platforms.length,
    publishedAt: null,
    errorMessage: `Scheduler publish error before any verified external receipt: ${sanitized}`,
  });
}
