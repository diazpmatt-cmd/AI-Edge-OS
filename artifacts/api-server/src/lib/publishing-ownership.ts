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

export const PUBLISH_SESSION_OWNERSHIP_CONFLICT_MESSAGE =
  "PUBLISH_SESSION_OWNERSHIP_CONFLICT: Another publish attempt already owns this post; no provider call was made.";

export class PublishSessionOwnershipConflictError extends Error {
  constructor(message = PUBLISH_SESSION_OWNERSHIP_CONFLICT_MESSAGE) {
    super(message);
    this.name = "PublishSessionOwnershipConflictError";
  }
}

interface AdvisoryLockQueryResult {
  rows: Array<{ acquired?: boolean; released?: boolean }>;
}

interface AdvisoryLockClient {
  query(sql: string, params?: unknown[]): Promise<AdvisoryLockQueryResult>;
  release(): void;
}

interface AdvisoryLockPool {
  connect(): Promise<AdvisoryLockClient>;
}

/**
 * Serialize one canonical publish attempt for a tenant + post across the full
 * provider boundary. The non-blocking PostgreSQL session advisory lock closes
 * the remaining race where an external route can reset aggregate status while
 * a provider request is still in flight.
 */
export async function withPostPublishSessionOwnership<T>(
  pool: AdvisoryLockPool,
  userId: string,
  postId: string,
  work: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  const lockKey = `${userId}:${postId}`;
  let acquired = false;

  try {
    const lockResult = await client.query(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
      [lockKey],
    );
    acquired = lockResult.rows[0]?.acquired === true;

    if (!acquired) {
      throw new PublishSessionOwnershipConflictError();
    }

    return await work();
  } finally {
    if (acquired) {
      try {
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released",
          [lockKey],
        );
      } finally {
        client.release();
      }
    } else {
      client.release();
    }
  }
}
