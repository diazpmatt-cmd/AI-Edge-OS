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
  it("uses serviceAreasJson when present", () => {
    const scope = buildAuthorizedScope(CLIENT_ID, ["bed_bug_treatment"], FOLEY_PROFILE);
    expect(scope.clientId).toBe(CLIENT_ID);
    expect(scope.activeServiceIds).toContain("bed_bug_treatment");
    expect(scope.authorizedGeographies).toContain("Foley, AL");
    expect(scope.authorizedGeographies).toContain("Gulf Shores, AL");
    expect(scope.prohibitedPhrases).toHaveLength(0);
  });

  it("falls back to city/state when serviceAreasJson is absent", () => {
    const profile = { ...FOLEY_PROFILE, serviceAreasJson: null } as unknown as LocalPresenceProfile;
    const scope = buildAuthorizedScope(CLIENT_ID, [], profile);
    expect(scope.authorizedGeographies).toContain("Foley, AL");
  });

  it("uses 'unspecified' when profile has no geographic data", () => {
    const profile = { ...FOLEY_PROFILE, city: null, state: null, serviceAreasJson: null } as unknown as LocalPresenceProfile;
    const scope = buildAuthorizedScope(CLIENT_ID, [], profile);
    expect(scope.authorizedGeographies).toContain("unspecified");
  });

  it("uses 'unspecified' when profile is null", () => {
    const scope = buildAuthorizedScope(CLIENT_ID, [], null);
    expect(scope.authorizedGeographies).toContain("unspecified");
    expect(scope.authorizedGeographies.length).toBeGreaterThan(0);
  });
});

describe("derivePrimaryGeography", () => {
  it("returns first geography from scope", () => {
    const scope = buildAuthorizedScope(CLIENT_ID, [], FOLEY_PROFILE);
    expect(derivePrimaryGeography(scope)).toBe("Foley, AL");
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

  it("emits no_observation / not_connected / not_implemented when client has no data", async () => {
    const model = await svc.execute({ clientId: CLIENT_ID, userId: USER_ID });
    const statuses = model.coverage.map(c => c.status);
    expect(statuses.every(s => s !== "available")).toBe(true);

    // C9R-6: reviews now report not_connected (no GBP social connection in mock),
    // never the legacy not_tenant_safe status.
    const reviewCov = model.coverage.find(c => c.source === "reviews");
    expect(reviewCov?.status).toBe("not_connected");

    const scCov = model.coverage.find(c => c.source === "google_search_console");
    expect(scCov?.status).toBe("not_implemented");
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
    // All pool queries (client_services, backlinks, persist) fail with table-not-found.
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
