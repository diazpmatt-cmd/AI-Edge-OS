import { describe, expect, it, vi } from "vitest";

import {
  PUBLISH_OWNERSHIP_CONFLICT_MESSAGE,
  PUBLISH_OWNERSHIP_SOURCE_STATUSES,
  PUBLISH_SESSION_OWNERSHIP_CONFLICT_MESSAGE,
  PUBLISH_SOURCE_STATE_INVALID_MESSAGE,
  PublishSessionOwnershipConflictError,
  canClaimPublishingOwnership,
  withPostPublishSessionOwnership,
} from "./publishing-ownership";

describe("publishing ownership source policy", () => {
  it("allows only approved lifecycle states that can legitimately begin delivery", () => {
    expect(PUBLISH_OWNERSHIP_SOURCE_STATUSES).toEqual([
      "approved",
      "queued",
      "scheduled",
      "failed",
    ]);

    for (const status of PUBLISH_OWNERSHIP_SOURCE_STATUSES) {
      expect(
        canClaimPublishingOwnership({ status, approvalStatus: "approved" }),
      ).toBe(true);
    }
  });

  it.each([
    "draft",
    "generated",
    "awaiting_approval",
    "publishing",
    "published",
    "published_with_warning",
    "cancelled",
  ])("rejects non-claimable lifecycle state: %s", (status) => {
    expect(
      canClaimPublishingOwnership({ status, approvalStatus: "approved" }),
    ).toBe(false);
  });

  it.each([null, "pending_review", "rejected", "auto_approved"])(
    "requires explicit approved status: %s",
    (approvalStatus) => {
      expect(
        canClaimPublishingOwnership({
          status: "scheduled",
          approvalStatus,
        }),
      ).toBe(false);
    },
  );

  it("provides stable operator conflict diagnostics", () => {
    expect(PUBLISH_OWNERSHIP_CONFLICT_MESSAGE).toContain(
      "PUBLISH_OWNERSHIP_CONFLICT",
    );
    expect(PUBLISH_SOURCE_STATE_INVALID_MESSAGE).toContain(
      "PUBLISH_SOURCE_STATE_INVALID",
    );
    expect(PUBLISH_SESSION_OWNERSHIP_CONFLICT_MESSAGE).toContain(
      "PUBLISH_SESSION_OWNERSHIP_CONFLICT",
    );
  });
});

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
  return { pool, queries, release };
}

describe("withPostPublishSessionOwnership", () => {
  it("holds one tenant/post lock through publish work", async () => {
    const { pool, queries, release } = makePool(true);
    const work = vi.fn(async () => "done");

    await expect(
      withPostPublishSessionOwnership(pool, "tenant-1", "post-1", work),
    ).resolves.toBe("done");

    expect(work).toHaveBeenCalledTimes(1);
    expect(queries).toHaveLength(2);
    expect(queries[0].params).toEqual(["tenant-1:post-1"]);
    expect(queries[1].params).toEqual(["tenant-1:post-1"]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("fails closed before work when another publish owns the post", async () => {
    const { pool, queries, release } = makePool(false);
    const work = vi.fn(async () => "should-not-run");

    await expect(
      withPostPublishSessionOwnership(pool, "tenant-1", "post-1", work),
    ).rejects.toBeInstanceOf(PublishSessionOwnershipConflictError);

    expect(work).not.toHaveBeenCalled();
    expect(queries).toHaveLength(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases the advisory lock when publish work throws", async () => {
    const { pool, queries, release } = makePool(true);

    await expect(
      withPostPublishSessionOwnership(pool, "tenant-2", "post-9", async () => {
        throw new Error("delivery update failed");
      }),
    ).rejects.toThrow("delivery update failed");

    expect(queries.some(q => q.sql.includes("pg_advisory_unlock"))).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
