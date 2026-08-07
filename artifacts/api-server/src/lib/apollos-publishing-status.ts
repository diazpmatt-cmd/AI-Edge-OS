import { hasVerifiedExternalReceipt } from "./publishing-ledger-authority.js";
import { parsePublishingPlatformBinding } from "./publishing-platform-binding.js";

export interface ApollosPublishingPostInput {
  readonly id: string;
  readonly status: string;
  readonly platforms: string | null;
  readonly updatedAt: Date | string | null;
}

export interface ApollosPublishingDeliveryInput {
  readonly postId: string;
  readonly platform: string;
  readonly status: string;
  readonly attemptNumber: number;
  readonly externalPostId: string | null;
  readonly externalPostUrl: string | null;
  readonly publishedAt: Date | string | null;
  readonly updatedAt: Date | string | null;
}

export interface ApollosPublishingPlatformSummary {
  readonly platform: string;
  readonly verified: number;
  readonly failed: number;
  readonly receiptMissing: number;
  readonly unresolved: number;
}

export interface ApollosPublishingStatusSummary {
  readonly deliveryStagePosts: number;
  readonly draftPosts: number;
  readonly verifiedDeliveries: number;
  readonly failedDeliveries: number;
  readonly receiptMissingDeliveries: number;
  readonly unresolvedDeliveries: number;
  readonly invalidPlatformBindings: number;
  readonly allExpectedDeliveriesVerified: boolean;
  readonly lastVerifiedAt: string | null;
  readonly lastVerifiedPlatform: string | null;
  readonly platforms: readonly ApollosPublishingPlatformSummary[];
}

const DELIVERY_STAGE_POST_STATUSES = new Set([
  "scheduled",
  "publishing",
  "published",
  "published_with_warning",
  "failed",
]);

const RECEIPT_CLASSIFIED_STATUSES = new Set([
  "published",
  "published_with_warning",
  "idempotency_hit",
]);

const TERMINAL_FAILURE_STATUSES = new Set([
  "failed",
  "skipped",
  "cancelled",
]);

function timeMs(value: Date | string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = value instanceof Date ? value : new Date(value);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function isoOrNull(value: Date | string | null): string | null {
  const time = timeMs(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function latestDeliveryMap(
  deliveries: readonly ApollosPublishingDeliveryInput[],
): ReadonlyMap<string, ApollosPublishingDeliveryInput> {
  const latest = new Map<string, ApollosPublishingDeliveryInput>();
  for (const delivery of deliveries) {
    if (!delivery.postId || !delivery.platform) continue;
    const key = `${delivery.postId}:${delivery.platform}`;
    const current = latest.get(key);
    if (
      !current ||
      delivery.attemptNumber > current.attemptNumber ||
      (delivery.attemptNumber === current.attemptNumber &&
        timeMs(delivery.updatedAt) > timeMs(current.updatedAt))
    ) {
      latest.set(key, delivery);
    }
  }
  return latest;
}

export function isApollosPublishingStatusQuestion(message: unknown): boolean {
  if (typeof message !== "string") return false;
  const normalized = message.toLowerCase();
  return /did (the |any )?post|what (published|went out|posted)|did (anything|it) fail|post(s| go| went) out|publish(ing|ed)|content (fail|go out|went out)|fail.*post|post.*fail/.test(
    normalized,
  );
}

export function buildApollosPublishingStatusSummary(input: {
  readonly posts: readonly ApollosPublishingPostInput[];
  readonly deliveries: readonly ApollosPublishingDeliveryInput[];
}): ApollosPublishingStatusSummary {
  const latest = latestDeliveryMap(input.deliveries);
  const draftPosts = input.posts.filter((post) => post.status === "draft").length;
  const deliveryStagePosts = input.posts.filter((post) =>
    DELIVERY_STAGE_POST_STATUSES.has(post.status),
  );

  const platformCounts = new Map<string, {
    verified: number;
    failed: number;
    receiptMissing: number;
    unresolved: number;
  }>();

  let verifiedDeliveries = 0;
  let failedDeliveries = 0;
  let receiptMissingDeliveries = 0;
  let unresolvedDeliveries = 0;
  let invalidPlatformBindings = 0;
  let lastVerifiedAtMs = Number.NEGATIVE_INFINITY;
  let lastVerifiedAt: string | null = null;
  let lastVerifiedPlatform: string | null = null;

  const increment = (
    platform: string,
    field: "verified" | "failed" | "receiptMissing" | "unresolved",
  ) => {
    const counts = platformCounts.get(platform) ?? {
      verified: 0,
      failed: 0,
      receiptMissing: 0,
      unresolved: 0,
    };
    counts[field] += 1;
    platformCounts.set(platform, counts);
  };

  for (const post of deliveryStagePosts) {
    const binding = parsePublishingPlatformBinding(post.platforms);
    if (!binding.ok || binding.platforms.length === 0) {
      invalidPlatformBindings += 1;
      continue;
    }

    for (const platform of binding.platforms) {
      const delivery = latest.get(`${post.id}:${platform}`);
      if (!delivery) {
        unresolvedDeliveries += 1;
        increment(platform, "unresolved");
        continue;
      }

      if (hasVerifiedExternalReceipt(delivery)) {
        verifiedDeliveries += 1;
        increment(platform, "verified");
        const verifiedAtMs = Math.max(
          timeMs(delivery.publishedAt),
          timeMs(delivery.updatedAt),
        );
        if (verifiedAtMs > lastVerifiedAtMs) {
          lastVerifiedAtMs = verifiedAtMs;
          lastVerifiedAt = Number.isFinite(verifiedAtMs)
            ? new Date(verifiedAtMs).toISOString()
            : isoOrNull(delivery.publishedAt) ?? isoOrNull(delivery.updatedAt);
          lastVerifiedPlatform = platform;
        }
        continue;
      }

      if (
        RECEIPT_CLASSIFIED_STATUSES.has(delivery.status) &&
        !delivery.externalPostId &&
        !delivery.externalPostUrl
      ) {
        receiptMissingDeliveries += 1;
        increment(platform, "receiptMissing");
        continue;
      }

      if (TERMINAL_FAILURE_STATUSES.has(delivery.status)) {
        failedDeliveries += 1;
        increment(platform, "failed");
        continue;
      }

      unresolvedDeliveries += 1;
      increment(platform, "unresolved");
    }
  }

  const expectedDeliveries =
    verifiedDeliveries +
    failedDeliveries +
    receiptMissingDeliveries +
    unresolvedDeliveries;

  return Object.freeze({
    deliveryStagePosts: deliveryStagePosts.length,
    draftPosts,
    verifiedDeliveries,
    failedDeliveries,
    receiptMissingDeliveries,
    unresolvedDeliveries,
    invalidPlatformBindings,
    allExpectedDeliveriesVerified:
      expectedDeliveries > 0 &&
      verifiedDeliveries === expectedDeliveries &&
      invalidPlatformBindings === 0,
    lastVerifiedAt,
    lastVerifiedPlatform,
    platforms: Object.freeze(
      [...platformCounts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([platform, counts]) => Object.freeze({ platform, ...counts })),
    ),
  });
}

export function formatApollosPublishingStatusReply(
  summary: ApollosPublishingStatusSummary,
): string {
  const lines: string[] = [];

  if (summary.deliveryStagePosts === 0) {
    lines.push("There are no posts currently in the scheduled or delivery lifecycle.");
  } else if (summary.allExpectedDeliveriesVerified) {
    lines.push("Yes — every expected delivery in the current publishing set has a verified external receipt.");
  } else {
    lines.push("No — not every expected delivery is verified yet.");
  }

  lines.push(
    `${summary.verifiedDeliveries} verified external deliver${summary.verifiedDeliveries === 1 ? "y" : "ies"}` +
      ` · ${summary.failedDeliveries} failed` +
      ` · ${summary.receiptMissingDeliveries} receipt-integrity issue${summary.receiptMissingDeliveries === 1 ? "" : "s"}` +
      ` · ${summary.unresolvedDeliveries} unresolved` +
      ` · ${summary.draftPosts} draft${summary.draftPosts === 1 ? "" : "s"}`,
  );

  if (summary.platforms.length > 0) {
    lines.push("By platform:");
    for (const platform of summary.platforms) {
      lines.push(
        `- ${platform}: ${platform.verified} verified, ${platform.failed} failed, ${platform.receiptMissing} receipt issue${platform.receiptMissing === 1 ? "" : "s"}, ${platform.unresolved} unresolved`,
      );
    }
  }

  if (summary.lastVerifiedAt && summary.lastVerifiedPlatform) {
    lines.push(
      `Last verified delivery: ${new Date(summary.lastVerifiedAt).toLocaleString("en-US")} via ${summary.lastVerifiedPlatform}.`,
    );
  }

  if (summary.invalidPlatformBindings > 0) {
    lines.push(
      `${summary.invalidPlatformBindings} post${summary.invalidPlatformBindings === 1 ? " has" : "s have"} an invalid platform binding and cannot be claimed as complete.`,
    );
  }

  if (
    summary.failedDeliveries > 0 ||
    summary.receiptMissingDeliveries > 0 ||
    summary.unresolvedDeliveries > 0 ||
    summary.invalidPlatformBindings > 0
  ) {
    lines.push(
      "Open Publishing Center for the affected post, or System Diagnostics for the exact platform lane. I will not treat a delivery as published without an external receipt.",
    );
  }

  return lines.join("\n");
}
