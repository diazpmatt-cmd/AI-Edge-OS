export type WeeklyDeliveryLifecycle =
  | "incomplete"
  | "generated"
  | "approved"
  | "scheduled"
  | "attempted"
  | "partial"
  | "published"
  | "failed";

export interface WeeklyDeliveryJobInput {
  readonly generatorPlatform: string;
  readonly weeklyPlanId: string;
  readonly count: number;
}

export interface WeeklyDeliveryPostInput {
  readonly id: string;
  readonly weeklyPlanId: string | null;
  readonly status: string;
  readonly approvalStatus: string | null;
  readonly scheduledAt: Date | string | null;
  readonly publishedAt: Date | string | null;
}

export interface WeeklyDeliveryAttemptInput {
  readonly postId: string;
  readonly platform: string;
  readonly status: string;
  readonly attemptNumber: number;
  readonly externalPostId: string | null;
  readonly externalPostUrl: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly retryAllowed: boolean;
  readonly publishedAt: Date | string | null;
  readonly updatedAt: Date | string | null;
}

export interface WeeklyDeliveryFailureSummary {
  readonly postId: string;
  readonly platform: string;
  readonly status: "failed" | "skipped" | "receipt_missing";
  readonly attemptNumber: number;
  readonly errorCode: string | null;
  readonly message: string;
  readonly retryAllowed: boolean;
}

export interface WeeklyDeliveryReceiptSummary {
  readonly postId: string;
  readonly platform: string;
  readonly attemptNumber: number;
  readonly externalPostId: string | null;
  readonly externalPostUrl: string | null;
  readonly publishedAt: string | null;
}

export interface WeeklyDeliveryChannelSummary {
  readonly platform: string;
  readonly expected: number;
  readonly generated: number;
  readonly approved: number;
  readonly scheduled: number;
  readonly attempted: number;
  readonly published: number;
  readonly failed: number;
  readonly skipped: number;
  readonly receiptMissing: number;
  readonly unresolved: number;
  readonly lifecycle: WeeklyDeliveryLifecycle;
  readonly failures: readonly WeeklyDeliveryFailureSummary[];
  readonly receipts: readonly WeeklyDeliveryReceiptSummary[];
}

export interface WeeklyDeliverySummary {
  readonly expectedDeliveries: number;
  readonly generatedDeliveries: number;
  readonly approvedDeliveries: number;
  readonly scheduledDeliveries: number;
  readonly attemptedDeliveries: number;
  readonly publishedDeliveries: number;
  readonly failedDeliveries: number;
  readonly skippedDeliveries: number;
  readonly receiptMissingDeliveries: number;
  readonly unresolvedDeliveries: number;
  readonly lifecycle: WeeklyDeliveryLifecycle;
  readonly channels: readonly WeeklyDeliveryChannelSummary[];
}

const SECRET_PATTERNS = [
  /access_token=[^&\s"']*/gi,
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /eyJ[A-Za-z0-9._\-]+/g,
  /\b[A-Za-z0-9]{40,}\b/g,
];

export function sanitizeDeliveryDiagnostic(
  value: string | null | undefined,
): string {
  let sanitized = value?.trim() || "No provider diagnostic was recorded.";
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized.slice(0, 240);
}

function sanitizeDeliveryCode(value: string | null): string | null {
  if (!value) return null;
  return sanitizeDeliveryDiagnostic(value).slice(0, 80);
}

function isoOrNull(value: Date | string | null): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function latestAttempts(
  attempts: readonly WeeklyDeliveryAttemptInput[],
): ReadonlyMap<string, WeeklyDeliveryAttemptInput> {
  const latest = new Map<string, WeeklyDeliveryAttemptInput>();
  for (const attempt of attempts) {
    const key = `${attempt.postId}:${attempt.platform}`;
    const current = latest.get(key);
    if (!current) {
      latest.set(key, attempt);
      continue;
    }
    const currentUpdated = isoOrNull(current.updatedAt) ?? "";
    const attemptUpdated = isoOrNull(attempt.updatedAt) ?? "";
    if (
      attempt.attemptNumber > current.attemptNumber ||
      (attempt.attemptNumber === current.attemptNumber &&
        attemptUpdated > currentUpdated)
    ) {
      latest.set(key, attempt);
    }
  }
  return latest;
}

function lifecycleFor(input: {
  expected: number;
  generated: number;
  approved: number;
  scheduled: number;
  attempted: number;
  published: number;
  failed: number;
  skipped: number;
  receiptMissing: number;
}): WeeklyDeliveryLifecycle {
  if (input.expected > 0 && input.published === input.expected) {
    return "published";
  }
  if (
    input.expected > 0 &&
    input.published === 0 &&
    input.failed + input.skipped + input.receiptMissing >= input.expected
  ) {
    return "failed";
  }
  if (input.published > 0 && input.published < input.expected) {
    return "partial";
  }
  if (input.attempted > 0) return "attempted";
  if (input.expected > 0 && input.scheduled === input.expected) {
    return "scheduled";
  }
  if (input.expected > 0 && input.approved === input.expected) {
    return "approved";
  }
  if (input.expected > 0 && input.generated === input.expected) {
    return "generated";
  }
  return "incomplete";
}

export function buildWeeklyDeliverySummary(input: {
  readonly expectedDeliveries: number;
  readonly jobs: readonly WeeklyDeliveryJobInput[];
  readonly posts: readonly WeeklyDeliveryPostInput[];
  readonly attempts: readonly WeeklyDeliveryAttemptInput[];
}): WeeklyDeliverySummary {
  const latest = latestAttempts(input.attempts);

  const channels = input.jobs.map((job) => {
    const posts = input.posts.filter(
      (post) => post.weeklyPlanId === job.weeklyPlanId,
    );
    const postIds = new Set(posts.map((post) => post.id));
    const attempts = [...latest.values()].filter((attempt) =>
      postIds.has(attempt.postId),
    );

    const receipts = attempts
      .filter(
        (attempt) =>
          attempt.status === "published" &&
          Boolean(attempt.externalPostId || attempt.externalPostUrl),
      )
      .map((attempt) =>
        Object.freeze({
          postId: attempt.postId,
          platform: attempt.platform,
          attemptNumber: attempt.attemptNumber,
          externalPostId: attempt.externalPostId,
          externalPostUrl: attempt.externalPostUrl,
          publishedAt: isoOrNull(attempt.publishedAt),
        }),
      );

    const receiptMissingAttempts = attempts.filter(
      (attempt) =>
        attempt.status === "published" &&
        !attempt.externalPostId &&
        !attempt.externalPostUrl,
    );
    const failedAttempts = attempts.filter(
      (attempt) => attempt.status === "failed",
    );
    const skippedAttempts = attempts.filter(
      (attempt) => attempt.status === "skipped",
    );

    const failures: WeeklyDeliveryFailureSummary[] = [
      ...failedAttempts.map((attempt) => ({
        postId: attempt.postId,
        platform: attempt.platform,
        status: "failed" as const,
        attemptNumber: attempt.attemptNumber,
        errorCode: sanitizeDeliveryCode(attempt.errorCode),
        message: sanitizeDeliveryDiagnostic(attempt.errorMessage),
        retryAllowed: attempt.retryAllowed,
      })),
      ...skippedAttempts.map((attempt) => ({
        postId: attempt.postId,
        platform: attempt.platform,
        status: "skipped" as const,
        attemptNumber: attempt.attemptNumber,
        errorCode: sanitizeDeliveryCode(attempt.errorCode),
        message: sanitizeDeliveryDiagnostic(attempt.errorMessage),
        retryAllowed: attempt.retryAllowed,
      })),
      ...receiptMissingAttempts.map((attempt) => ({
        postId: attempt.postId,
        platform: attempt.platform,
        status: "receipt_missing" as const,
        attemptNumber: attempt.attemptNumber,
        errorCode: "PROVIDER_RECEIPT_MISSING",
        message:
          "Provider status was published, but no external post ID or URL was recorded.",
        retryAllowed: attempt.retryAllowed,
      })),
    ];

    const generated = posts.length;
    const approved = posts.filter((post) =>
      ["approved", "auto_approved"].includes(post.approvalStatus ?? ""),
    ).length;
    const scheduled = posts.filter((post) =>
      [
        "scheduled",
        "publishing",
        "published",
        "published_with_warning",
        "failed",
      ].includes(post.status),
    ).length;
    const attempted = attempts.length;
    const published = receipts.length;
    const failed = failedAttempts.length;
    const skipped = skippedAttempts.length;
    const receiptMissing = receiptMissingAttempts.length;
    const unresolved = Math.max(
      0,
      job.count - published - failed - skipped - receiptMissing,
    );

    return Object.freeze({
      platform: job.generatorPlatform,
      expected: job.count,
      generated,
      approved,
      scheduled,
      attempted,
      published,
      failed,
      skipped,
      receiptMissing,
      unresolved,
      lifecycle: lifecycleFor({
        expected: job.count,
        generated,
        approved,
        scheduled,
        attempted,
        published,
        failed,
        skipped,
        receiptMissing,
      }),
      failures: Object.freeze(failures),
      receipts: Object.freeze(receipts),
    });
  });

  const total = (field: keyof Omit<
    WeeklyDeliveryChannelSummary,
    "platform" | "expected" | "lifecycle" | "failures" | "receipts"
  >) =>
    channels.reduce((sum, channel) => sum + (channel[field] as number), 0);

  const generatedDeliveries = total("generated");
  const approvedDeliveries = total("approved");
  const scheduledDeliveries = total("scheduled");
  const attemptedDeliveries = total("attempted");
  const publishedDeliveries = total("published");
  const failedDeliveries = total("failed");
  const skippedDeliveries = total("skipped");
  const receiptMissingDeliveries = total("receiptMissing");
  const unresolvedDeliveries = Math.max(
    0,
    input.expectedDeliveries -
      publishedDeliveries -
      failedDeliveries -
      skippedDeliveries -
      receiptMissingDeliveries,
  );

  return Object.freeze({
    expectedDeliveries: input.expectedDeliveries,
    generatedDeliveries,
    approvedDeliveries,
    scheduledDeliveries,
    attemptedDeliveries,
    publishedDeliveries,
    failedDeliveries,
    skippedDeliveries,
    receiptMissingDeliveries,
    unresolvedDeliveries,
    lifecycle: lifecycleFor({
      expected: input.expectedDeliveries,
      generated: generatedDeliveries,
      approved: approvedDeliveries,
      scheduled: scheduledDeliveries,
      attempted: attemptedDeliveries,
      published: publishedDeliveries,
      failed: failedDeliveries,
      skipped: skippedDeliveries,
      receiptMissing: receiptMissingDeliveries,
    }),
    channels: Object.freeze(channels),
  });
}
