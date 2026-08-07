export type SchedulerRecoveryStatus =
  | "published"
  | "published_with_warning"
  | "failed";

export const SCHEDULER_RECOVERY_OWNED_POST_STATUSES = [
  "scheduled",
  "publishing",
] as const;

export type SchedulerRecoveryOwnedPostStatus =
  (typeof SCHEDULER_RECOVERY_OWNED_POST_STATUSES)[number];

export function isSchedulerRecoveryOwnedPostStatus(
  status: string,
): status is SchedulerRecoveryOwnedPostStatus {
  return SCHEDULER_RECOVERY_OWNED_POST_STATUSES.includes(
    status as SchedulerRecoveryOwnedPostStatus,
  );
}

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

const SECRET_PATTERNS = [
  /access_token=[^&\s"']*/gi,
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /eyJ[A-Za-z0-9._\-]+/g,
  /\b[A-Za-z0-9]{40,}\b/g,
];
const RECEIPT_STATUSES = new Set([
  "published",
  "published_with_warning",
  "idempotency_hit",
]);

function sanitizeSchedulerError(value: string): string {
  let sanitized = value || "Unknown scheduler error";
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized.slice(0, 500);
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
    if (!delivery.platform) continue;
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
    RECEIPT_STATUSES.has(delivery.status) &&
    Boolean(delivery.externalPostId || delivery.externalPostUrl)
  );
}

function isTerminalFailure(delivery: SchedulerDeliveryEvidence): boolean {
  return (
    ["failed", "skipped", "cancelled"].includes(delivery.status) ||
    (RECEIPT_STATUSES.has(delivery.status) &&
      !delivery.externalPostId &&
      !delivery.externalPostUrl)
  );
}

export function reconcileSchedulerPublishException(input: {
  readonly expectedPlatforms: unknown;
  readonly deliveries: readonly SchedulerDeliveryEvidence[];
  readonly error: string;
}): SchedulerPublishRecovery {
  const expectedInput = Array.isArray(input.expectedPlatforms)
    ? input.expectedPlatforms
    : [];
  const expected = [
    ...new Set(
      expectedInput.filter(
        (platform): platform is string =>
          typeof platform === "string" && platform.length > 0,
      ),
    ),
  ];
  const expectedKnown = expected.length > 0;
  const latest = latestByPlatform(input.deliveries);
  const platforms = expectedKnown ? expected : [...latest.keys()];
  const evidence = platforms
    .map((platform) => latest.get(platform))
    .filter((delivery): delivery is SchedulerDeliveryEvidence => Boolean(delivery));

  const verified = evidence.filter(hasVerifiedReceipt);
  const warningReceipts = verified.filter(
    (delivery) => delivery.status === "published_with_warning",
  ).length;
  const terminalFailures = evidence.filter(isTerminalFailure).length;
  const unresolved = expectedKnown
    ? Math.max(0, platforms.length - verified.length - terminalFailures)
    : 0;
  const publishedAtMs = verified.reduce(
    (latestTime, delivery) =>
      Math.max(
        latestTime,
        dateMs(delivery.publishedAt) > Number.NEGATIVE_INFINITY
          ? dateMs(delivery.publishedAt)
          : dateMs(delivery.updatedAt),
      ),
    Number.NEGATIVE_INFINITY,
  );
  const publishedAt = Number.isFinite(publishedAtMs)
    ? new Date(publishedAtMs)
    : null;
  const sanitized = sanitizeSchedulerError(
    input.error || "Unknown scheduler error",
  );

  if (
    expectedKnown &&
    platforms.length > 0 &&
    verified.length === platforms.length &&
    warningReceipts === 0
  ) {
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
      expectedPlatforms: expectedKnown ? platforms.length : 0,
      publishedAt,
      errorMessage:
        expectedKnown
          ? `Scheduler error after ${verified.length}/${platforms.length} verified external deliveries; successful platform receipts were preserved. ${sanitized}`
          : `Scheduler error after ${verified.length} verified external deliveries, but the expected platform scope was unavailable; successful receipts were preserved without claiming complete publication. ${sanitized}`,
    });
  }

  return Object.freeze({
    status: "failed" as const,
    verifiedPublished: 0,
    terminalFailures,
    unresolved,
    expectedPlatforms: expectedKnown ? platforms.length : 0,
    publishedAt: null,
    errorMessage: `Scheduler publish error before any verified external receipt: ${sanitized}`,
  });
}
