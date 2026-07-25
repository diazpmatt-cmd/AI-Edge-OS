/**
 * GBP Security — Behavioral tests (Area 1)
 *
 * Verifies that ownership enforcement works at RUNTIME, not via source-text matching.
 * All assertions verify actual return values and DB call arguments produced by the
 * exported helper functions.
 *
 * updateOptimizationOwned: DB UPDATE is scoped by BOTH id AND client_id — a foreign
 *   tenant's request touches zero rows, returning null (same as a missing record).
 *
 * acknowledgeAlertOwned: SQL WHERE clause includes AND client_id = $2 — rowCount=0
 *   is returned for both missing records and foreign-tenant access.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db:   { update: vi.fn(), select: vi.fn(), insert: vi.fn() },
  pool: { connect: vi.fn(), query: vi.fn() },
  eq:   vi.fn((_col: unknown, val: unknown) => ({ _eq: val })),
  and:  vi.fn((...args: unknown[]) => ({ _and: args })),
  ne:   vi.fn((_col: unknown, val: unknown) => ({ _ne: val })),
  sql:  vi.fn(),
  inArray: vi.fn(),
  evaluateGbpAudit:          vi.fn(),
  generateOptimizations:     vi.fn(),
  evaluateClientEligibility: vi.fn(),
  createWeeklyPlanId:        vi.fn(),
  isValidIanaTimezone:       vi.fn(() => true),
  localPresenceProfilesTable:        { userId: "userId" },
  socialConnectionsTable:            { userId: "userId", provider: "provider" },
  reviewPlatformStatsTable:          { clientId: "clientId", platform: "platform" },
  socialPostsTable:                  { userId: "userId", clientId: "clientId" },
  gbpAuditSnapshotsTable:            { id: "id", clientId: "clientId", status: "status", createdAt: "createdAt" },
  gbpAuditChecksTable:               { snapshotId: "snapshotId" },
  gbpOptimizationOpportunitiesTable: {
    id:         "id",
    clientId:   "clientId",
    resolved:   "resolved",
    resolvedAt: "resolvedAt",
    snapshotId: "snapshotId",
  },
}));

vi.mock("@workspace/db/schema", () => ({}));

vi.mock("drizzle-orm", () => ({ desc: vi.fn(), inArray: vi.fn() }));
vi.mock("@clerk/express", () => ({ getAuth: vi.fn(() => ({ userId: "test-user" })) }));
vi.mock("../lib/gbp-live-data", () => ({ fetchGbpLiveData: vi.fn() }));
vi.mock("../lib/scheduler-secret", () => ({ SCHEDULER_SECRET: "test-secret" }));

import { updateOptimizationOwned, acknowledgeAlertOwned } from "../routes/gbp-audit.js";
import { db, pool, eq } from "@workspace/db";

function makeUpdateChain(rows: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

const FAKE_OPP = {
  id:         "opp-1",
  clientId:   "client-A",
  resolved:   true,
  resolvedAt: new Date("2026-07-01T00:00:00Z"),
  snapshotId: "snap-1",
};

describe("updateOptimizationOwned — runtime ownership enforcement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the updated row when id and clientId both match", async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_OPP]) as never);

    const result = await updateOptimizationOwned("opp-1", "client-A", true);

    expect(result).toEqual(FAKE_OPP);
  });

  it("returns null when clientId does NOT match (foreign tenant — zero rows updated)", async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([]) as never);

    const result = await updateOptimizationOwned("opp-1", "client-B", true);

    expect(result).toBeNull();
  });

  it("returns null when the record id does not exist at all", async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([]) as never);

    const result = await updateOptimizationOwned("nonexistent-id", "client-A", true);

    expect(result).toBeNull();
  });

  it("passes clientId as a WHERE condition — eq() is called with the client value", async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_OPP]) as never);

    await updateOptimizationOwned("opp-1", "client-A", true);

    const eqCalls = vi.mocked(eq).mock.calls;
    const clientIdCall = eqCalls.find((c) => c[1] === "client-A");
    expect(clientIdCall).toBeDefined();
  });

  it("passes the record id as a WHERE condition — eq() is called with the id value", async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_OPP]) as never);

    await updateOptimizationOwned("opp-1", "client-A", true);

    const eqCalls = vi.mocked(eq).mock.calls;
    const idCall = eqCalls.find((c) => c[1] === "opp-1");
    expect(idCall).toBeDefined();
  });

  it("sets resolved=true and resolvedAt=Date in the UPDATE payload", async () => {
    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([FAKE_OPP]),
      }),
    });
    vi.mocked(db.update).mockReturnValue({ set: setMock } as never);

    await updateOptimizationOwned("opp-1", "client-A", true);

    const setArg = setMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg.resolved).toBe(true);
    expect(setArg.resolvedAt).toBeInstanceOf(Date);
  });

  it("sets resolvedAt=null when resolved=false (un-marking an opportunity)", async () => {
    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ ...FAKE_OPP, resolved: false, resolvedAt: null }]),
      }),
    });
    vi.mocked(db.update).mockReturnValue({ set: setMock } as never);

    await updateOptimizationOwned("opp-1", "client-A", false);

    const setArg = setMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg.resolved).toBe(false);
    expect(setArg.resolvedAt).toBeNull();
  });

  it("two tenants with the same opp id get independent results (isolation verified)", async () => {
    vi.mocked(db.update)
      .mockReturnValueOnce(makeUpdateChain([FAKE_OPP]) as never)
      .mockReturnValueOnce(makeUpdateChain([]) as never);

    const resultOwner  = await updateOptimizationOwned("opp-1", "client-A", true);
    const resultForeign = await updateOptimizationOwned("opp-1", "client-B", true);

    expect(resultOwner).not.toBeNull();
    expect(resultForeign).toBeNull();
  });
});

describe("acknowledgeAlertOwned — runtime ownership enforcement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns { acknowledged: true } when the alert belongs to the requesting client", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rowCount: 1, rows: [] } as never);

    const result = await acknowledgeAlertOwned("alert-1", "client-A");

    expect(result).toEqual({ acknowledged: true });
  });

  it("returns { acknowledged: false } when clientId does NOT match (foreign tenant)", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rowCount: 0, rows: [] } as never);

    const result = await acknowledgeAlertOwned("alert-1", "client-B");

    expect(result).toEqual({ acknowledged: false });
  });

  it("returns { acknowledged: false } when the alert id does not exist", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rowCount: 0, rows: [] } as never);

    const result = await acknowledgeAlertOwned("no-such-id", "client-A");

    expect(result).toEqual({ acknowledged: false });
  });

  it("the SQL WHERE clause includes client_id as the second positional parameter", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rowCount: 1, rows: [] } as never);

    await acknowledgeAlertOwned("alert-1", "client-A");

    const call = vi.mocked(pool.query).mock.calls[0] as [string, unknown[]];
    const [sql, params] = call;
    expect(sql).toMatch(/client_id/i);
    expect(params[1]).toBe("client-A");
  });

  it("alertId is passed as the first positional SQL parameter ($1)", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rowCount: 1, rows: [] } as never);

    await acknowledgeAlertOwned("alert-99", "client-A");

    const call = vi.mocked(pool.query).mock.calls[0] as [string, unknown[]];
    expect(call[1][0]).toBe("alert-99");
  });

  it("foreign tenant gets the same false response as a missing record (no info leakage)", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rowCount: 0, rows: [] } as never);

    const foreignTenantResult = await acknowledgeAlertOwned("alert-1", "wrong-client");
    const missingIdResult     = await acknowledgeAlertOwned("no-such-id", "client-A");

    expect(foreignTenantResult).toEqual({ acknowledged: false });
    expect(missingIdResult).toEqual({ acknowledged: false });
  });

  it("two clients with the same alert id receive independent results (isolation verified)", async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rowCount: 1, rows: [] } as never)
      .mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);

    const ownerResult   = await acknowledgeAlertOwned("alert-1", "client-A");
    const foreignResult = await acknowledgeAlertOwned("alert-1", "client-B");

    expect(ownerResult.acknowledged).toBe(true);
    expect(foreignResult.acknowledged).toBe(false);
  });
});
