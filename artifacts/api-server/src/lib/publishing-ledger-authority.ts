export type LedgerAggregateStatus =
  | "published"
  | "published_with_warning"
  | "failed";

export interface DeliveryReceiptShape {
  readonly status: string;
  readonly externalPostId: string | null;
  readonly externalPostUrl: string | null;
}

export function hasVerifiedExternalReceipt(
  delivery: DeliveryReceiptShape,
): boolean {
  return (
    ["published", "published_with_warning"].includes(delivery.status) &&
    Boolean(delivery.externalPostId || delivery.externalPostUrl)
  );
}

export function deriveCompleteLedgerAggregateStatus(input: {
  readonly expectedPlatforms: number;
  readonly latestDeliveries: number;
  readonly verifiedPublished: number;
  readonly warningReceipts: number;
  readonly terminalFailures: number;
  readonly unresolved: number;
}): LedgerAggregateStatus | null {
  const complete =
    input.expectedPlatforms > 0 &&
    input.latestDeliveries === input.expectedPlatforms &&
    input.unresolved === 0 &&
    input.verifiedPublished + input.terminalFailures ===
      input.expectedPlatforms;
  if (!complete) return null;

  if (
    input.verifiedPublished === input.expectedPlatforms &&
    input.warningReceipts === 0
  ) {
    return "published";
  }

  return input.verifiedPublished > 0
    ? "published_with_warning"
    : "failed";
}
