/**
 * C9R-2 behavioral tests for AiVisibilityExecutionService.
 *
 * Uses vi.mock("@workspace/db") to intercept all DB calls.
 * The real composeAiVisibilityReadModel / adapters run untouched.
 *
 * Drizzle query builders are both a fluent chain AND a Promise.
 * drizzleChain() creates a mock that satisfies both: it resolves to
 * `rows` when awaited and also exposes .where() / .orderBy() / .limit().
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock handles ───────────────────────────────────────────────────────

const { mockSelectFn, mockPoolQuery, setNextRows } = vi.hoisted(() => {
  // Queue of row-sets: each call to from() dequeues the next entry.
  const rowQueue: object[][] = [];

  function setNextRows(...rowSets: object[][]): void {
    rowQueue.push(...rowSets);
  }

  function dequeue(): object[] {
    return rowQueue.length ? rowQueue.shift()! : [];
  }

  // Build a thenable chain that behaves like a Drizzle SelectQueryBuilder.
  // It resolves to `rows` when awaited and exposes .where() / .limit() / .orderBy().
  function drizzleChain(rows: object[] = []): any {
    const self: any = Object.assign(Promise.resolve(rows), {
      where:   vi.fn(() => drizzleChain(rows)),
      limit:   vi.fn(() => Promise.resolve(rows)),
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(rows)),
      })),
    });
    return self;
  }

  const mockFromFn = vi.fn(() => drizzleChain(dequeue()));
  const mockSelectFn = vi.fn(() => ({ from: mockFromFn }));
  const mockPoolQuery = vi.fn(() => Promise.resolve({ rows: [] }));

  // Expose setNextRows so tests can seed the queue
  (setNextRows as any)._fromFn = mockFromFn;
  (setNextRows as any)._selectFn = mockSelectFn;

  return { mockSelectFn, mockPoolQuery, setNextRows };
});

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: {
      select: mockSelectFn,
      insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
    },
    pool: { query: mockPoolQuery },
  };
});

// ── Imports after mock is registered ─────────────────────────────────────────

import {
  AiVisibilityExecutionService,
  buildAuthorizedScope,
  derivePrimaryGeography,
} from "../lib/ai-visibility-execution-service.js";
import type { LocalPresenceProfile } from "@workspace/db";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CLIENT_ID = "uuid-test-client-001";
const USER_ID   = "clerk-user-001";
const NOW       = new Date("2026-07-19T12:00:00Z");

const FOLEY_PROFILE: LocalPresenceProfile = {
  id: "prof-001", clientId: CLIENT_ID,
  businessName: "Test Pest Co", city: "Foley", state: "AL", zip: "36535",
  phone: null, website: null, address: null, napJson: null,
  description: null, categoriesJson: null, hoursJson: null,
  serviceAreasJson: '["Foley, AL","Gulf Shores, AL"]',
  attributesJson: null, photosJson: null,
  createdAt: NOW, updatedAt: NOW,
} as unknown as LocalPresenceProfile;

const MOCK_CHANNEL = {
  id: "ch-001", clientId: CLIENT_ID, channelName: "yelp",
  status: "setup_in_progress", score: 2, verificationStatus: "pending",
  recommendedAction: "Claim and verify at biz.yelp.com",
  completenessScore: 10, lastSyncAt: null, providerId: null,
  nextSyncAt: null, healthScore: 0, issuesJson: null,
  createdAt: NOW, updatedAt: NOW,
};

const MOCK_GOOGLE_CONN = {
  id: "conn-001", userId: USER_ID, provider: "google_business",
  accountName: "BBB GBP", accountId: "gbp-001",
  accessToken: null, refreshToken: null, expiresAt: null, metadata: null,
  createdAt: NOW, updatedAt: NOW,
};

// ── Unit tests: pure helpers ──────────────────────────────────────────────────

describe("buildAuthorizedScope", () => {
  it("uses Local Presence serviceAreasJson when present", () => {
    const scope = buildAuthorizedScope(CLIENT_ID, ["bed_bug_treatment"], FOLEY_PROFILE, '["Mobile, AL"]');
    expect(scope.clientId).toBe(CLIENT_ID);
    expect(scope.activeServiceIds).toContain("bed_bug_treatment");
    expect(scope.authorizedGeographies).toEqual(["Foley, AL", "Gulf Shores, AL"]);
    expect(scope.prohibitedPhrases).toHaveLength(0);
  });

  it("falls back only to canonical clients.service_areas", () => {
    const profile = { ...FOLEY_PROFILE, serviceAreasJson: null } as unknown as LocalPresenceProfile;
    const scope = buildAuthorizedScope(CLIENT_ID, [], profile, '["Mobile, AL","Daphne, AL"]');
    expect(scope.authorizedGeographies).toEqual(["Mobile, AL", "Daphne, AL"]);
    expect(scope.authorizedGeographies).not.toContain("Foley, AL");
  });

  it("does not authorize HQ city/state when explicit service areas are absent", () => {
    const profile = { ...FOLEY_PROFILE, serviceAreasJson: null } as unknown as LocalPresenceProfile;
    const scope = buildAuthorizedScope(CLIENT_ID, [], profile, null);
    expect(scope.authorizedGeographies).toEqual([]);
  });

  it("does not synthesize unspecified when profile and client service areas are absent", () => {
    const scope = buildAuthorizedScope(CLIENT_ID, [], null, null);
    expect(scope.authorizedGeographies).toEqual([]);
    expect(scope.authorizedGeographies).not.toContain("unspecified");
  });

  it("ignores malformed service-area JSON rather than authorizing a fallback geography", () => {
    const profile = { ...FOLEY_PROFILE, serviceAreasJson: "not-json" } as unknown as LocalPresenceProfile;
    const scope = buildAuthorizedScope(CLIENT_ID, [], profile, "also-not-json");
    expect(scope.authorizedGeographies).toEqual([]);
  });
});

describe("derivePrimaryGeography", () => {
  it("returns first canonical geography from scope", () => {
    const scope = buildAuthorizedScope(CLIENT_ID, [], FOLEY_PROFILE);
    expect(derivePrimaryGeography(scope)).toBe("Foley, AL");
  });

  it("returns null when no authorized geography exists", () => {
    const scope = buildAuthorizedScope(CLIENT_ID, [], null, null);
    expect(derivePrimaryGeography(scope)).toBeNull();
  });
});

// ── Behavioral tests: execute() ───────────────────────────────────────────────

describe("AiVisibilityExecutionService.execute", () => {
  let svc: AiVisibilityExecutionService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new AiVisibilityExecutionService();
    // Default: all pool queries return empty rows
    mockPoolQuery.mockResolvedValue({ rows: [] });
    // Restore the from chain to dequeue (cleared by clearAllMocks)
    // Re-mock select to use a simple empty chain
    mockSelectFn.mockImplementation(() => ({
      from: vi.fn(() => {
        const rows: object[] = [];
        const chain: any = Object.assign(Promise.resolve(rows), {
          where:   vi.fn(() => Object.assign(Promise.resolve(rows), {
            limit:   vi.fn(() => Promise.resolve(rows)),
            orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve(rows)) })),
          })),
        });
        return chain;
      }),
    }));
  });

  it("returns a valid AiVisibilityReadModel shape with no canonical data", async () => {
    const model = await svc.execute({ clientId: CLIENT_ID, userId: USER_ID });
    expect(model).toHaveProperty("recommendations");
    expect(model).toHaveProperty("rejected");
    expect(model).toHaveProperty("coverage");
    expect(model).toHaveProperty("summary");
    expect(Array.isArray(model.recommendations)).toBe(true);
    expect(Array.isArray(model.coverage)).toBe(true);
  });

  it("fails closed with explicit unavailable coverage when canonical geography is missing", async () => {
    const model = await svc.execute({ clientId: CLIENT_ID, userId: USER_ID });
    expect(model.recommendations).toEqual([]);
    expect(model.rejected).toEqual([]);
    expect(model.coverage).toHaveLength(9);
    expect(model.coverage.every(item => item.status === "no_observation")).toBe(true);
    expect(model.coverage.every(item => item.detail.includes("no canonical authorized service geography"))).toBe(true);
    expect(model.summary.availableSourceCount).toBe(0);
  });

  it("does not invoke downstream geography-scoped data sources when geography is absent", async () => {
    await svc.execute({ clientId: CLIENT_ID, userId: USER_ID });
    expect(mockSelectFn).toHaveBeenCalledTimes(2); // profile + channels only
    const sqlCalls = mockPoolQuery.mock.calls.map(([sql]: [string]) => String(sql));
    expect(sqlCalls.some(sql => sql.includes("ai_query_scans"))).toBe(false);
    expect(sqlCalls.some(sql => sql.includes("platform_deliveries"))).toBe(false);
    expect(sqlCalls.some(sql => sql.includes("backlink_opportunities"))).toBe(false);
  });

  it("emits available local_presence coverage and a recommendation when channel exists", async () => {
    // The execution service makes these db.select() calls in order:
    //   1) profile  → .where().limit(1)
    //   2) channels → .where()   (awaited directly)
    //   3) discovery → .where().orderBy().limit()
    //   4) social posts → .where().orderBy().limit()
    //   5) google conn → .where().limit(1)

    let callIdx = 0;
    mockSelectFn.mockImplementation(() => ({
      from: vi.fn(() => {
        callIdx++;
        if (callIdx === 1) {
          // Profile
          return {
            where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([FOLEY_PROFILE])) })),
          };
        }
        if (callIdx === 2) {
          // Channels: awaited directly after .where()
          return {
            where: vi.fn(() => Promise.resolve([MOCK_CHANNEL])),
          };
        }
        // All others: empty
        const empty: object[] = [];
        return {
          where: vi.fn(() => Object.assign(Promise.resolve(empty), {
            limit:   vi.fn(() => Promise.resolve(empty)),
            orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve(empty)) })),
          })),
        };
      }),
    }));

    const model = await svc.execute({ clientId: CLIENT_ID, userId: USER_ID });

    const lpCoverage = model.coverage.find(c => c.source === "local_presence");
    expect(lpCoverage?.status).toBe("available");

    // Yelp channel → title "Complete yelp local listing"
    const yelpRec = model.recommendations.find(r => r.title.toLowerCase().includes("yelp"));
    expect(yelpRec).toBeDefined();
  });

  it("marks google_business as available when a social connection exists", async () => {
    let callIdx = 0;
    mockSelectFn.mockImplementation(() => ({
      from: vi.fn(() => {
        callIdx++;
        if (callIdx === 1) {
          return {
            where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([FOLEY_PROFILE])) })),
          };
        }
        const empty: object[] = [];
        const google = callIdx === 5 ? [MOCK_GOOGLE_CONN] : empty;
        return {
          where: vi.fn(() => Object.assign(Promise.resolve(google), {
            limit:   vi.fn(() => Promise.resolve(google)),
            orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve(google)) })),
          })),
        };
      }),
    }));

    const model = await svc.execute({ clientId: CLIENT_ID, userId: USER_ID });
    const gbpCov = model.coverage.find(c => c.source === "google_business");
    expect(gbpCov?.status).toBe("available");
  });

  it("persists the result to ai_visibility_run_results via pool.query", async () => {
    await svc.execute({ clientId: CLIENT_ID, userId: USER_ID });
    // Allow the fire-and-forget persist to settle
    await new Promise(r => setTimeout(r, 30));

    const insertCall = mockPoolQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === "string" && sql.includes("ai_visibility_run_results"),
    );
    expect(insertCall).toBeDefined();
    const [, params] = insertCall!;
    expect(params[0]).toBe(CLIENT_ID);
    expect(typeof params[2]).toBe("string"); // result_json
    expect(typeof params[3]).toBe("number"); // recommendation_count
  });

  it("resolves without throwing when pool queries fail with 42P01", async () => {
    // All pool queries (client_services, clients service areas, persist) fail with table-not-found.
    // The service must not crash — it degrades gracefully and still returns a valid model.
    const pgError = Object.assign(new Error("relation missing"), { code: "42P01" });
    mockPoolQuery.mockRejectedValue(pgError);
    const model = await svc.execute({ clientId: CLIENT_ID, userId: USER_ID });
    expect(model).toBeDefined();
    expect(model).toHaveProperty("recommendations");
    expect(model).toHaveProperty("coverage");
    expect(model).toHaveProperty("summary");
  });
});

// ── Behavioral tests: listHistory() ──────────────────────────────────────────

describe("AiVisibilityExecutionService.listHistory", () => {
  let svc: AiVisibilityExecutionService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new AiVisibilityExecutionService();
  });

  it("returns empty array when table does not exist (42P01)", async () => {
    const pgError = Object.assign(new Error("relation missing"), { code: "42P01" });
    mockPoolQuery.mockRejectedValue(pgError);
    const result = await svc.listHistory(CLIENT_ID);
    expect(result).toEqual([]);
  });

  it("returns mapped run records from pool query rows", async () => {
    mockPoolQuery.mockResolvedValue({
      rows: [{
        id: "run-001", client_id: CLIENT_ID,
        generated_at: new Date("2026-07-19T10:00:00Z"),
        recommendation_count: 5, rejected_count: 1, available_source_count: 3,
      }],
    });

    const records = await svc.listHistory(CLIENT_ID);
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("run-001");
    expect(records[0].recommendationCount).toBe(5);
    expect(records[0].rejectedCount).toBe(1);
    expect(records[0].availableSourceCount).toBe(3);
    expect(records[0].generatedAt).toBe("2026-07-19T10:00:00.000Z");
  });

  it("caps limit at 100", async () => {
    mockPoolQuery.mockResolvedValue({ rows: [] });
    await svc.listHistory(CLIENT_ID, 9999);
    const [, params] = mockPoolQuery.mock.calls[0];
    expect(Number(params[1])).toBe(100);
  });
});

// ── C9R-7 regression: service_key column fix ──────────────────────────────────
//
// AiVisibilityExecutionService.queryActiveServiceKeys() must query
// client_services.service_key (not the non-existent service_id column).
//
// This test is the regression guard for the production bug diagnosed in C9R-7
// session 3: the original method queried service_id, which does not exist in
// the client_services table, causing PostgreSQL 42703, empty service list, and
// ultimately generic "local services"/"my area" AI queries.

describe("AiVisibilityExecutionService — service_key column regression (C9R-7)", () => {
  let svc: AiVisibilityExecutionService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new AiVisibilityExecutionService();
    // Default: all pool queries return empty rows (no table-not-found error)
    mockPoolQuery.mockResolvedValue({ rows: [] });
    // Default: all drizzle queries return empty rows
    mockSelectFn.mockImplementation(() => ({
      from: vi.fn(() => {
        const empty: object[] = [];
        return {
          where: vi.fn(() => Object.assign(Promise.resolve(empty), {
            limit:   vi.fn(() => Promise.resolve(empty)),
            orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve(empty)) })),
          })),
        };
      }),
    }));
  });

  it("queries service_key column — never service_id", async () => {
    await svc.execute({ clientId: CLIENT_ID, userId: USER_ID });

    // Find the pool.query call that reads from client_services
    const serviceCall = mockPoolQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === "string" && sql.includes("client_services"),
    );
    expect(serviceCall, "no pool.query call targeting client_services").toBeDefined();
    const [sql] = serviceCall!;
    expect(sql).toContain("service_key");
    expect(sql).not.toContain("service_id");
  });

  it("queries with ORDER BY sort_order ASC for priority-ordered service list", async () => {
    await svc.execute({ clientId: CLIENT_ID, userId: USER_ID });

    const serviceCall = mockPoolQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === "string" && sql.includes("client_services"),
    );
    expect(serviceCall).toBeDefined();
    const [sql] = serviceCall!;
    expect(sql).toContain("sort_order");
  });

  it("includes is_active filter to exclude inactive services", async () => {
    await svc.execute({ clientId: CLIENT_ID, userId: USER_ID });

    const serviceCall = mockPoolQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === "string" && sql.includes("client_services"),
    );
    expect(serviceCall).toBeDefined();
    const [sql] = serviceCall!;
    expect(sql.toLowerCase()).toContain("is_active");
  });

  it("passes clientId as the query parameter", async () => {
    await svc.execute({ clientId: CLIENT_ID, userId: USER_ID });

    const serviceCall = mockPoolQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === "string" && sql.includes("client_services"),
    );
    expect(serviceCall).toBeDefined();
    const [, params] = serviceCall!;
    expect(params[0]).toBe(CLIENT_ID);
  });

  it("returns a valid model when service_key rows are present", async () => {
    // First pool.query call (client_services) returns two service keys
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [
        { service_key: "bed_bug_inspection" },
        { service_key: "roaches" },
      ] })
      .mockResolvedValue({ rows: [] }); // all subsequent calls (client service areas, persist, etc.)

    const model = await svc.execute({ clientId: CLIENT_ID, userId: USER_ID });
    expect(model).toHaveProperty("recommendations");
    expect(model).toHaveProperty("coverage");
  });

  it("does not emit the legacy 'service ID query warning' log message", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await svc.execute({ clientId: CLIENT_ID, userId: USER_ID });
    await new Promise(r => setTimeout(r, 30));

    const legacyWarning = warnSpy.mock.calls.find(
      args => typeof args[0] === "string" && args[0].includes("service ID query warning"),
    );
    expect(legacyWarning, "legacy service ID warning must not fire").toBeUndefined();
    warnSpy.mockRestore();
  });
});