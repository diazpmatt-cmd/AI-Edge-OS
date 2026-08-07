import { describe, expect, it, vi } from "vitest";

import {
  PUBLISH_OWNERSHIP_CONFLICT,
  PublishOwnershipConflictError,
  withPostPublishOwnership,
} from "./publishing-ownership";

function makePool(acquired: boolean) {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const release = vi.fn();
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes("pg_try_advisory_lock")) {
        return { rows: [{ acquired }] };
      }
      return { rows: [{ released: true }] };
    }),
    release,
  };
  const pool = { connect: vi.fn(async () => client) };
  return { pool, client, queries, release };
}

describe("withPostPublishOwnership", () => {
  it("runs work while one tenant/post advisory lock is owned", async () => {
    const { pool, queries, release } = makePool(true);
    const work = vi.fn(async () => "done");

    await expect(
      withPostPublishOwnership(pool, "tenant-1", "post-1", work),
    ).resolves.toBe("done");

    expect(work).toHaveBeenCalledTimes(1);
    expect(queries).toHaveLength(2);
    expect(queries[0].params).toEqual(["tenant-1:post-1"]);
    expect(queries[1].params).toEqual(["tenant-1:post-1"]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("fails closed before work when another caller owns the post", async () => {
    const { pool, queries, release } = makePool(false);
    const work = vi.fn(async () => "should-not-run");

    await expect(
      withPostPublishOwnership(pool, "tenant-1", "post-1", work),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "PublishOwnershipConflictError",
        message: PUBLISH_OWNERSHIP_CONFLICT,
      }),
    );

    expect(work).not.toHaveBeenCalled();
    expect(queries).toHaveLength(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases ownership even when publish work throws", async () => {
    const { pool, queries, release } = makePool(true);

    await expect(
      withPostPublishOwnership(pool, "tenant-2", "post-9", async () => {
        throw new Error("delivery insert failed");
      }),
    ).rejects.toThrow("delivery insert failed");

    expect(queries.some(q => q.sql.includes("pg_advisory_unlock"))).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("uses a dedicated conflict error type", () => {
    const error = new PublishOwnershipConflictError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PublishOwnershipConflictError");
  });
});
