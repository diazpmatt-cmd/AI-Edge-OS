export const IMMEDIATE_PUBLISH_APPROVAL_SOURCE_STATUSES = [
  "draft",
  "generated",
  "awaiting_approval",
  "approved",
  "queued",
  "scheduled",
  "failed",
] as const;

export const MANUAL_APPROVAL_SOURCE_STATUSES = [
  "draft",
  "generated",
  "awaiting_approval",
  "approved",
  "failed",
] as const;

export const FULL_RETRY_SOURCE_STATUSES = ["failed"] as const;

export const CANCELLABLE_PRE_DELIVERY_STATUSES = [
  "draft",
  "generated",
  "awaiting_approval",
  "approved",
  "queued",
  "scheduled",
  "failed",
] as const;

export const PUBLISH_FINALIZATION_OWNED_STATUS = "publishing" as const;

export function canApproveForImmediatePublish(status: string): boolean {
  return IMMEDIATE_PUBLISH_APPROVAL_SOURCE_STATUSES.includes(
    status as (typeof IMMEDIATE_PUBLISH_APPROVAL_SOURCE_STATUSES)[number],
  );
}

export function canManuallyApprovePost(status: string): boolean {
  return MANUAL_APPROVAL_SOURCE_STATUSES.includes(
    status as (typeof MANUAL_APPROVAL_SOURCE_STATUSES)[number],
  );
}

export function canRetryFullPost(status: string): boolean {
  return FULL_RETRY_SOURCE_STATUSES.includes(
    status as (typeof FULL_RETRY_SOURCE_STATUSES)[number],
  );
}

export function canCancelBeforeDelivery(status: string): boolean {
  return CANCELLABLE_PRE_DELIVERY_STATUSES.includes(
    status as (typeof CANCELLABLE_PRE_DELIVERY_STATUSES)[number],
  );
}

export function canFinalizePublishingAggregate(status: string): boolean {
  return status === PUBLISH_FINALIZATION_OWNED_STATUS;
}

export function buildPublishFinalizationConflictSummary(input: {
  deliverySummary: string;
  currentStatus: string | null;
}): string {
  const deliverySummary = input.deliverySummary.trim() || "Provider delivery completed.";
  const currentStatus = input.currentStatus?.trim() || "unknown";
  return `${deliverySummary} PUBLISH_FINALIZATION_STATE_CONFLICT: aggregate state is ${currentStatus}; newer lifecycle state was preserved.`.slice(0, 500);
}
