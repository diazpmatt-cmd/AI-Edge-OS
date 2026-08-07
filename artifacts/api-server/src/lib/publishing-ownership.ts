export const PUBLISH_OWNERSHIP_CONFLICT =
  "PUBLISH_OWNERSHIP_CONFLICT: Another publish attempt already owns this post; no provider call was made.";

export class PublishOwnershipConflictError extends Error {
  constructor(message = PUBLISH_OWNERSHIP_CONFLICT) {
    super(message);
    this.name = "PublishOwnershipConflictError";
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
 * Run one canonical publish attempt while holding a PostgreSQL session advisory
 * lock for the tenant + post pair.
 *
 * The lock is deliberately non-blocking. A concurrent caller fails closed
 * before delivery rows or provider calls can be created. Because the lock is
 * session-scoped and the same checked-out client is retained for the entire
 * callback, process/connection loss releases ownership automatically.
 */
export async function withPostPublishOwnership<T>(
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
      throw new PublishOwnershipConflictError();
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
