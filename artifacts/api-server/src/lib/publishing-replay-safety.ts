export interface ExistingDeliveryReceiptEvidence {
  readonly platform: string;
  readonly status: string;
  readonly externalPostId: string | null;
  readonly externalPostUrl: string | null;
  readonly publishedAt: Date | string | null;
  readonly updatedAt: Date | string | null;
}

export interface FullReplayReceiptGuard {
  readonly blocked: boolean;
  readonly postStatus: "published" | "published_with_warning" | null;
  readonly verifiedPlatforms: readonly string[];
  readonly verifiedCount: number;
  readonly totalPlatforms: number;
  readonly publishedAt: Date | null;
  readonly message: string | null;
}

const RECEIPT_STATUSES = new Set(["published", "published_with_warning"]);

function timeValue(value: Date | string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = value instanceof Date ? value : new Date(value);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function hasVerifiedReceipt(delivery: ExistingDeliveryReceiptEvidence): boolean {
  return (
    RECEIPT_STATUSES.has(delivery.status) &&
    Boolean(delivery.externalPostId || delivery.externalPostUrl)
  );
}

export function evaluateFullReplayReceiptGuard(input: {
  readonly platforms: readonly string[];
  readonly deliveries: readonly ExistingDeliveryReceiptEvidence[];
}): FullReplayReceiptGuard {
  const platforms = [...new Set(input.platforms.filter(Boolean))];
  const expected = new Set(platforms);
  const verifiedByPlatform = new Map<string, ExistingDeliveryReceiptEvidence>();

  for (const delivery of input.deliveries) {
    if (!expected.has(delivery.platform) || !hasVerifiedReceipt(delivery)) continue;
    const existing = verifiedByPlatform.get(delivery.platform);
    const deliveryTime = Math.max(
      timeValue(delivery.publishedAt),
      timeValue(delivery.updatedAt),
    );
    const existingTime = existing
      ? Math.max(timeValue(existing.publishedAt), timeValue(existing.updatedAt))
      : Number.NEGATIVE_INFINITY;
    if (!existing || deliveryTime > existingTime) {
      verifiedByPlatform.set(delivery.platform, delivery);
    }
  }

  const verifiedPlatforms = platforms.filter((platform) =>
    verifiedByPlatform.has(platform),
  );
  const verifiedCount = verifiedPlatforms.length;
  if (verifiedCount === 0) {
    return Object.freeze({
      blocked: false,
      postStatus: null,
      verifiedPlatforms: Object.freeze([]),
      verifiedCount: 0,
      totalPlatforms: platforms.length,
      publishedAt: null,
      message: null,
    });
  }

  const latestPublishedAt = verifiedPlatforms.reduce((latest, platform) => {
    const receipt = verifiedByPlatform.get(platform)!;
    return Math.max(
      latest,
      timeValue(receipt.publishedAt),
      timeValue(receipt.updatedAt),
    );
  }, Number.NEGATIVE_INFINITY);
  const publishedAt = Number.isFinite(latestPublishedAt)
    ? new Date(latestPublishedAt)
    : null;
  const postStatus =
    verifiedCount === platforms.length ? "published" : "published_with_warning";
  const message =
    `FULL_REPUBLISH_BLOCKED_VERIFIED_RECEIPT: ${verifiedCount}/${platforms.length} ` +
    `platform lane${platforms.length === 1 ? "" : "s"} already have verified external content. ` +
    "Retry only the isolated failed delivery so successful platforms are not replayed.";

  return Object.freeze({
    blocked: true,
    postStatus,
    verifiedPlatforms: Object.freeze(verifiedPlatforms),
    verifiedCount,
    totalPlatforms: platforms.length,
    publishedAt,
    message,
  });
}
