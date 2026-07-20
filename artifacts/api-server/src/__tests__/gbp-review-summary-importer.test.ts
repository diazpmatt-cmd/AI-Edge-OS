/**
 * C9R-6 behavioral tests for GbpReviewSummaryImporter.
 *
 * All external I/O is mocked:
 *  - db.select() for social_connections queries
 *  - pool.query() for review_platform_stats queries
 *  - TenantSafeReviewRepository.upsert() via constructor injection
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock handles ───────────────────────────────────────────────────────

const { mockSelectFn, mockPoolQuery } = vi.hoisted(() => {
  function drizzleChain(rows: object[] = []): any {
    const self: any = Object.assign(Promise.resolve(rows), {
      where:   vi.fn(() => Object.assign(Promise.resolve(rows), {
        limit:   vi.fn(() => Promise.resolve(rows)),
        orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve(rows)) })),
      })),
      orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve(rows)) })),
    });
    return self;
  }

  const mockSelectFn  = vi.fn(() => ({ from: vi.fn(() => drizzleChain()) }));
  const mockPoolQuery = vi.fn(() => Promise.resolve({ rows: [] }));
  return { mockSelectFn, mockPoolQuery };
});

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: { select: mockSelectFn },
    pool: { query: mockPoolQuery },
  };
});

import { GbpReviewSummaryImporter } from "../lib/gbp-review-summary-importer.js";
import type { TenantSafeReviewRepository, ReviewImportSummary } from "@workspace/db";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CLIENT_ID = "uuid-test-client-c9r6";
const USER_ID   = "clerk-user-c9r6";
const GEO       = "Foley, AL";
const NOW       = new Date("2026-07-20T10:00:00Z");
const LOCATION_ID = "loc-001";

// Connection with an authorized locationId in metadata — passes the location check.
const MOCK_GBP_CONN_WITH_LOCATION = {
  id: "conn-gbp-001", userId: USER_ID, provider: "google_business",
  accountName: "BBB GBP", accountId: "gbp-001",
  accessToken: null, refreshToken: null, expiresAt: null,
  metadata: JSON.stringify({ locationId: LOCATION_ID, locationName: "accounts/123/locations/loc-001", locationTitle: "Bed Bugs & Beyond" }),
  createdAt: NOW, updatedAt: NOW,
};

// Connection with no locationId — fails the location check with no_observation.
const MOCK_GBP_CONN_NO_LOCATION = {
  id: "conn-gbp-002", userId: USER_ID, provider: "google_business",
  accountName: "BBB GBP", accountId: "gbp-001",
  accessToken: null, refreshToken: null, expiresAt: null, metadata: null,
  createdAt: NOW, updatedAt: NOW,
};

const MOCK_REVIEW_STAT_ROW = {
  id: "rps-001",
  platform: "google",
  review_count: 23,
  average_rating: "4.50",
};

function makeRepoSpy(): TenantSafeReviewRepository {
  return {
    upsert: vi.fn(async (row: ReviewImportSummary) => row),
    findByClientId: vi.fn(async () => []),
  };
}

function makeSelectReturning(rows: object[]) {
  return vi.fn(() => ({
    from: vi.fn(() => {
      const self: any = Object.assign(Promise.resolve(rows), {
        where: vi.fn(() => Object.assign(Promise.resolve(rows), {
          limit:   vi.fn(() => Promise.resolve(rows)),
          orderBy: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve(rows)) })),
        })),
      });
      return self;
    }),
  }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GbpReviewSummaryImporter.importForClient", () => {
  let repo: TenantSafeReviewRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = makeRepoSpy();
    mockPoolQuery.mockResolvedValue({ rows: [] });
  });

  it("returns disconnected when no GBP social connection exists", async () => {
    mockSelectFn.mockImplementation(makeSelectReturning([]));
    const importer = new GbpReviewSummaryImporter(
      { query: mockPoolQuery } as any,
      { select: mockSelectFn } as any,
      repo,
    );

    const result = await importer.importForClient({ clientId: CLIENT_ID, userId: USER_ID, geography: GEO });
    expect(result.kind).toBe("disconnected");
    expect((result as any).reason).toContain("No Google Business Profile connection");
  });

  it("returns no_observation when GBP connection has no authorized locationId in metadata (null metadata)", async () => {
    mockSelectFn.mockImplementation(makeSelectReturning([MOCK_GBP_CONN_NO_LOCATION]));
    const importer = new GbpReviewSummaryImporter(
      { query: mockPoolQuery } as any,
      { select: mockSelectFn } as any,
      repo,
    );

    const result = await importer.importForClient({ clientId: CLIENT_ID, userId: USER_ID, geography: GEO });
    expect(result.kind).toBe("no_observation");
    expect((result as any).reason).toContain("GBP location not yet authorized");
  });

  it("returns no_observation when GBP connection metadata has empty locationId", async () => {
    const connEmptyLoc = {
      ...MOCK_GBP_CONN_NO_LOCATION,
      metadata: JSON.stringify({ locationId: "", locationName: "accounts/123/locations/" }),
    };
    mockSelectFn.mockImplementation(makeSelectReturning([connEmptyLoc]));
    const importer = new GbpReviewSummaryImporter(
      { query: mockPoolQuery } as any,
      { select: mockSelectFn } as any,
      repo,
    );

    const result = await importer.importForClient({ clientId: CLIENT_ID, userId: USER_ID, geography: GEO });
    expect(result.kind).toBe("no_observation");
    expect((result as any).reason).toContain("GBP location not yet authorized");
  });

  it("returns no_observation when GBP connection has an authorized location but no review stats", async () => {
    mockSelectFn.mockImplementation(makeSelectReturning([MOCK_GBP_CONN_WITH_LOCATION]));
    mockPoolQuery.mockResolvedValue({ rows: [] });

    const importer = new GbpReviewSummaryImporter(
      { query: mockPoolQuery } as any,
      { select: mockSelectFn } as any,
      repo,
    );

    const result = await importer.importForClient({ clientId: CLIENT_ID, userId: USER_ID, geography: GEO });
    expect(result.kind).toBe("no_observation");
    expect((result as any).reason).toContain("no review platform stats");
  });

  it("returns available with summaries when GBP connection, location, and stats all exist", async () => {
    mockSelectFn.mockImplementation(makeSelectReturning([MOCK_GBP_CONN_WITH_LOCATION]));
    mockPoolQuery.mockResolvedValue({ rows: [MOCK_REVIEW_STAT_ROW] });

    const importer = new GbpReviewSummaryImporter(
      { query: mockPoolQuery } as any,
      { select: mockSelectFn } as any,
      repo,
    );

    const result = await importer.importForClient({ clientId: CLIENT_ID, userId: USER_ID, geography: GEO });
    expect(result.kind).toBe("available");
    if (result.kind !== "available") return;
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0].platform).toBe("google");
    expect(result.summaries[0].reviewCount).toBe(23);
    expect(result.summaries[0].averageRating).toBe(4.5);
    expect(result.summaries[0].targetReviewCount).toBeNull();
    expect(result.summaries[0].geography).toBe(GEO);
    expect(result.summaries[0].clientId).toBe(CLIENT_ID);
  });

  it("stores conn.id as sourceConnectionId in each persisted summary", async () => {
    mockSelectFn.mockImplementation(makeSelectReturning([MOCK_GBP_CONN_WITH_LOCATION]));
    mockPoolQuery.mockResolvedValue({ rows: [MOCK_REVIEW_STAT_ROW] });

    const importer = new GbpReviewSummaryImporter(
      { query: mockPoolQuery } as any,
      { select: mockSelectFn } as any,
      repo,
    );

    await importer.importForClient({ clientId: CLIENT_ID, userId: USER_ID, geography: GEO });
    const upsertCalls = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls;
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0][0].sourceConnectionId).toBe(MOCK_GBP_CONN_WITH_LOCATION.id);
  });

  it("sets targetReviewCount to null (V1 policy: no universal benchmark)", async () => {
    mockSelectFn.mockImplementation(makeSelectReturning([MOCK_GBP_CONN_WITH_LOCATION]));
    mockPoolQuery.mockResolvedValue({ rows: [MOCK_REVIEW_STAT_ROW] });

    const importer = new GbpReviewSummaryImporter(
      { query: mockPoolQuery } as any,
      { select: mockSelectFn } as any,
      repo,
    );

    const result = await importer.importForClient({ clientId: CLIENT_ID, userId: USER_ID, geography: GEO });
    if (result.kind !== "available") throw new Error("expected available");
    expect(result.summaries[0].targetReviewCount).toBeNull();
  });

  it("calls upsert once per review stat row", async () => {
    const multiRows = [
      { id: "rps-001", platform: "google",  review_count: 23, average_rating: "4.50" },
      { id: "rps-002", platform: "facebook", review_count: 11, average_rating: "4.20" },
    ];
    mockSelectFn.mockImplementation(makeSelectReturning([MOCK_GBP_CONN_WITH_LOCATION]));
    mockPoolQuery.mockResolvedValue({ rows: multiRows });

    const importer = new GbpReviewSummaryImporter(
      { query: mockPoolQuery } as any,
      { select: mockSelectFn } as any,
      repo,
    );

    const result = await importer.importForClient({ clientId: CLIENT_ID, userId: USER_ID, geography: GEO });
    expect(result.kind).toBe("available");
    expect((repo.upsert as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it("returns provider_error when pool.query throws an unexpected error", async () => {
    mockSelectFn.mockImplementation(makeSelectReturning([MOCK_GBP_CONN_WITH_LOCATION]));
    mockPoolQuery.mockRejectedValue(Object.assign(new Error("deadlock"), { code: "40P01" }));

    const importer = new GbpReviewSummaryImporter(
      { query: mockPoolQuery } as any,
      { select: mockSelectFn } as any,
      repo,
    );

    const result = await importer.importForClient({ clientId: CLIENT_ID, userId: USER_ID, geography: GEO });
    expect(result.kind).toBe("provider_error");
  });

  it("returns no_observation (not throws) when table does not exist (42P01)", async () => {
    mockSelectFn.mockImplementation(makeSelectReturning([MOCK_GBP_CONN_WITH_LOCATION]));
    mockPoolQuery.mockRejectedValue(Object.assign(new Error("no relation"), { code: "42P01" }));

    const importer = new GbpReviewSummaryImporter(
      { query: mockPoolQuery } as any,
      { select: mockSelectFn } as any,
      repo,
    );

    const result = await importer.importForClient({ clientId: CLIENT_ID, userId: USER_ID, geography: GEO });
    expect(result.kind).toBe("no_observation");
  });

  it("enforces clientId != default in review_platform_stats query", async () => {
    mockSelectFn.mockImplementation(makeSelectReturning([MOCK_GBP_CONN_WITH_LOCATION]));
    mockPoolQuery.mockResolvedValue({ rows: [] });

    const importer = new GbpReviewSummaryImporter(
      { query: mockPoolQuery } as any,
      { select: mockSelectFn } as any,
      repo,
    );

    await importer.importForClient({ clientId: CLIENT_ID, userId: USER_ID, geography: GEO });

    const reviewCall = (mockPoolQuery as ReturnType<typeof vi.fn>).mock.calls.find(
      ([sql]: [string]) => typeof sql === "string" && sql.includes("review_platform_stats"),
    );
    expect(reviewCall).toBeDefined();
    const [sql]: [string] = reviewCall!;
    expect(sql).toContain("client_id <> 'default'");
  });

  it("returns provider_error when db.select() throws during connection lookup", async () => {
    mockSelectFn.mockImplementation(() => ({
      from: vi.fn(() => { throw new Error("connection_lost"); }),
    }));

    const importer = new GbpReviewSummaryImporter(
      { query: mockPoolQuery } as any,
      { select: mockSelectFn } as any,
      repo,
    );

    const result = await importer.importForClient({ clientId: CLIENT_ID, userId: USER_ID, geography: GEO });
    expect(result.kind).toBe("provider_error");
  });
});
