export const PUBLISH_OWNERSHIP_SOURCE_STATUSES = [
  "approved",
  "queued",
  "scheduled",
  "failed",
] as const;

export type PublishOwnershipSourceStatus =
  (typeof PUBLISH_OWNERSHIP_SOURCE_STATUSES)[number];

export function canClaimPublishingOwnership(input: {
  readonly status: string;
  readonly approvalStatus: string | null;
}): input is {
  readonly status: PublishOwnershipSourceStatus;
  readonly approvalStatus: "approved";
} {
  return (
    input.approvalStatus === "approved" &&
    PUBLISH_OWNERSHIP_SOURCE_STATUSES.includes(
      input.status as PublishOwnershipSourceStatus,
    )
  );
}

export const PUBLISH_OWNERSHIP_CONFLICT_MESSAGE =
  "PUBLISH_OWNERSHIP_CONFLICT: Another publish attempt or post update won ownership; refresh before retrying.";

export const PUBLISH_SOURCE_STATE_INVALID_MESSAGE =
  "PUBLISH_SOURCE_STATE_INVALID: Post must be approved, queued, scheduled, or failed before publishing.";
