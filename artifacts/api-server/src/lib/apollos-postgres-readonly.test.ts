import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  return {
    query,
    release,
    connect,
    pool: {
      connect,
      totalCount: 4,
      idleCount: 2,
      waitingCount: 0,
    },
  };
});

vi.mock("@workspace/db", () => ({ pool: mocks.pool }));

import { getApollosPostgresHealth } from "./apollos-postgres-readonly.js";

const originalEnv = { ...process.env };

describe("getApollosPostgresHealth", () => {
  beforeEach(() => {
    process.env.APOLLOS_ADMIN_USER_IDS = "clerk-admin";
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.connect.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("fails closed for a non-admin before borrowing a database connection", async () => {
    await expect(getApollosPostgresHealth("not-admin"))
      .rejects.toThrow("APOLLOS_MCP_POSTGRES_ADMIN_REQUIRED");
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("returns operational statistics inside a transaction-local read-only inspection", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          database_name: "ai_edge",
          server_version: "16.4",
          database_size_bytes: "104857600",
          in_recovery: false,
          observed_at: new Date("2026-08-12T01:00:00Z"),
        }],
      })
      .mockResolvedValueOnce({
        rows: [
          { state: "active", count: "3" },
          { state: "idle", count: "7" },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{
          numbackends: "10",
          xact_commit: "990",
          xact_rollback: "10",
          blks_read: "100",
          blks_hit: "9900",
          temp_files: "2",
          deadlocks: "0",
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await getApollosPostgresHealth("clerk-admin");

    expect(result).toMatchObject({
      database: {
        name: "ai_edge",
        serverVersion: "16.4",
        sizeBytes: 104857600,
        inRecovery: false,
        observedAt: "2026-08-12T01:00:00.000Z",
      },
      connections: {
        numBackends: 10,
        activityByState: { active: 3, idle: 7 },
        applicationPool: { total: 4, idle: 2, waiting: 0 },
      },
      workload: {
        commits: 990,
        rollbacks: 10,
        rollbackRatioPercent: 1,
        blocksRead: 100,
        blocksHit: 9900,
        cacheHitRatioPercent: 99,
        tempFiles: 2,
        deadlocks: 0,
      },
      safety: {
        readOnlyInspection: true,
        transactionReadOnly: true,
        transactionLocalTimeout: true,
        customerRowsRead: false,
        queryTextReturned: false,
        credentialsReturned: false,
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/"(?:password|secret|token|queryText)"\s*:/i);
    expect(mocks.query.mock.calls[0]?.[0]).toBe("BEGIN READ ONLY");
    expect(mocks.query.mock.calls[1]?.[0]).toBe("SET LOCAL statement_timeout = '5s'");
    expect(mocks.query.mock.calls[5]?.[0]).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledTimes(6);
  });

  it("rolls back, releases the connection, and returns a bounded error when a health query fails", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("password=must-not-leak"))
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(getApollosPostgresHealth("clerk-admin"))
      .rejects.toThrow("APOLLOS_MCP_POSTGRES_UNAVAILABLE");
    expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("fails boundedly when the pool cannot provide a connection", async () => {
    mocks.connect.mockRejectedValueOnce(new Error("connection secret"));
    await expect(getApollosPostgresHealth("clerk-admin"))
      .rejects.toThrow("APOLLOS_MCP_POSTGRES_UNAVAILABLE");
  });
});
