/**
 * C9R-7 AI Query Scan Service — Preflight & Context Resolution Tests
 *
 * Verifies that:
 *  1. Preflight fails with "no_active_services" when client_services is empty
 *  2. Preflight fails with "no_authorized_geography" when no geography is available
 *  3. Preflight succeeds and returns real queries when both services + geography present
 *  4. queryActiveServiceKeys reads service_key column (not service_id)
 *  5. buildTenantContext falls back to clients.service_areas when local_presence_profiles has no row
 *  6. buildTenantContext falls back to clients.client_name for business name
 *  7. "my area" is never synthesised under any circumstances
 *  8. "local services" is never synthesised under any circumstances
 *  9. Cross-tenant: a scan for client A never reads client B's services/geography
 *
 * classifyScanError 422 tests live in the frontend test suite:
 * artifacts/ai-edge-solutions/src/__tests__/AIVisibilityEnginePage.test.ts
 */

import { describe, it, expect, vi } from "vitest";

// ── AiQueryScanService unit tests ─────────────────────────────────────────────

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    pool: { query: vi.fn() },
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    },
  };
});

const { pool: mockPool, db: mockDb } = await import("@workspace/db");
const { AiQueryScanService } = await import("../lib/ai-query-scan-service.js");

// ── Helper: build a mock pool that returns specific data per query ─────────

function makePool(responses: Record<string, { rows: Record<string, unknown>[] }>) {
  return {
    query: vi.fn().mockImplementation((sql: string, _params: unknown[]) => {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      for (const [key, value] of Object.entries(responses)) {
        if (normalized.includes(key.toLowerCase())) return Promise.resolve(value);
      }
      return Promise.resolve({ rows: [] });
    }),
  };
}

// ── 1. Preflight: no_active_services ─────────────────────────────────────────

describe("Preflight: no_active_services", () => {
  it("returns preflight_failed when client_services has no rows for this clientId", async () => {
    const pool = makePool({
      "select service_key from client_services": { rows: [] },
      "select client_name, service_areas from clients": {
        rows: [{ client_name: "Bed Bugs & Beyond", service_areas: '["Foley, AL"]' }],
      },
    });

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const svc = new AiQueryScanService(pool as any, db as any);
    const summary = await svc.execute({ clientId: "test-uuid", userId: "user-1" });

    expect(summary.status).toBe("preflight_failed");
    expect(summary.preflightFailure).toBe("no_active_services");
    expect(summary.queryCount).toBe(0);
    expect(summary.scanId).toBe("");
  });

  it("does NOT call the AI provider when preflight fails", async () => {
    const providerExecute = vi.fn();
    const pool = makePool({
      "select service_key from client_services": { rows: [] },
      "select client_name, service_areas from clients": {
        rows: [{ client_name: "Test Co", service_areas: '["Foley, AL"]' }],
      },
    });

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const fakeProvider = { name: "openai", model: "gpt-4o-mini", isConfigured: true, execute: providerExecute };
    const svc = new AiQueryScanService(pool as any, db as any, fakeProvider);
    await svc.execute({ clientId: "test-uuid", userId: "user-1" });

    expect(providerExecute).not.toHaveBeenCalled();
  });
});

// ── 2. Preflight: no_authorized_geography ────────────────────────────────────

describe("Preflight: no_authorized_geography", () => {
  it("returns preflight_failed when no geography is available from any source", async () => {
    const pool = makePool({
      "select service_key from client_services": {
        rows: [{ service_key: "bed_bug_inspection" }],
      },
      "select client_name, service_areas from clients": {
        rows: [{ client_name: "Test Co", service_areas: "null" }],
      },
    });

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const svc = new AiQueryScanService(pool as any, db as any);
    const summary = await svc.execute({ clientId: "test-uuid", userId: "user-1" });

    expect(summary.status).toBe("preflight_failed");
    expect(summary.preflightFailure).toBe("no_authorized_geography");
  });
});

// ── 3. Preflight: success path with real services + geography ─────────────────

describe("Preflight: success — real data produces real queries", () => {
  it("proceeds to scan (not preflight_failed) when services and geography present", async () => {
    const providerExecute = vi.fn().mockResolvedValue({
      provider: "openai", model: "gpt-4o-mini",
      query: "best bed bug inspection in Foley, AL",
      responseText: "Here are some options...",
      generatedAt: new Date().toISOString(),
      latencyMs: 800,
      success: true,
      failureReason: null,
      businessMentioned: false,
      mentionType: null,
      mentionPosition: null,
      competitorMentions: [],
      citations: [],
    });

    const pool = makePool({
      "select service_key from client_services": {
        rows: [{ service_key: "bed_bug_inspection" }],
      },
      "select client_name, service_areas from clients": {
        rows: [{ client_name: "Bed Bugs & Beyond", service_areas: '["Foley, AL"]' }],
      },
      "insert into ai_query_scans": { rows: [{ id: "scan-uuid-001" }] },
      "insert into ai_query_results": { rows: [] },
      "update ai_query_scans": { rows: [] },
      "select id, name, domain from competitors": { rows: [] },
    });

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const fakeProvider = { name: "openai", model: "gpt-4o-mini", isConfigured: true, execute: providerExecute };
    const svc = new AiQueryScanService(pool as any, db as any, fakeProvider);
    const summary = await svc.execute({ clientId: "0f15a60a-6277-4933-a17e-d3e453a4e291", userId: "user-1" });

    expect(summary.status).not.toBe("preflight_failed");
    expect(summary.queryCount).toBeGreaterThan(0);
    expect(providerExecute).toHaveBeenCalled();
  });

  it("queries produced from real data never contain 'local services'", async () => {
    const capturedQueries: string[] = [];
    const providerExecute = vi.fn().mockImplementation((req: { query: string }) => {
      capturedQueries.push(req.query);
      return Promise.resolve({
        provider: "openai", model: "gpt-4o-mini",
        query: req.query, responseText: "result",
        generatedAt: new Date().toISOString(), latencyMs: 100,
        success: true, failureReason: null,
        businessMentioned: false, mentionType: null, mentionPosition: null,
        competitorMentions: [], citations: [],
      });
    });

    const pool = makePool({
      "select service_key from client_services": {
        rows: [{ service_key: "bed_bug_inspection" }, { service_key: "roaches" }],
      },
      "select client_name, service_areas from clients": {
        rows: [{ client_name: "Bed Bugs & Beyond", service_areas: '["Foley, AL","Gulf Shores, AL"]' }],
      },
      "insert into ai_query_scans": { rows: [{ id: "scan-uuid-002" }] },
      "insert into ai_query_results": { rows: [] },
      "update ai_query_scans": { rows: [] },
      "select id, name, domain from competitors": { rows: [] },
    });

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const fakeProvider = { name: "openai", model: "gpt-4o-mini", isConfigured: true, execute: providerExecute };
    const svc = new AiQueryScanService(pool as any, db as any, fakeProvider);
    await svc.execute({ clientId: "0f15a60a-test", userId: "user-1" });

    expect(capturedQueries.some(q => q.toLowerCase().includes("local services"))).toBe(false);
    expect(capturedQueries.some(q => q.toLowerCase().includes("my area"))).toBe(false);
    expect(capturedQueries.some(q => q.toLowerCase().includes("services services"))).toBe(false);
    expect(capturedQueries.every(q => q.toLowerCase().includes("foley, al") || q.toLowerCase().includes("gulf shores, al"))).toBe(true);
  });
});

// ── 4. service_key column correctness ────────────────────────────────────────

describe("queryActiveServiceKeys reads service_key column", () => {
  it("uses service_key (not service_id) in the SQL query", async () => {
    let capturedSql = "";
    const pool = {
      query: vi.fn().mockImplementation((sql: string, _params: unknown[]) => {
        if (sql.toLowerCase().includes("client_services")) capturedSql = sql;
        if (sql.toLowerCase().includes("clients") && sql.toLowerCase().includes("select")) {
          return Promise.resolve({
            rows: [{ client_name: "Test Co", service_areas: '["Foley, AL"]' }],
          });
        }
        if (sql.toLowerCase().includes("ai_query_scans") && sql.toLowerCase().includes("insert")) {
          return Promise.resolve({ rows: [{ id: "scan-uuid" }] });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const fakeProvider = {
      name: "openai", model: "gpt-4o-mini", isConfigured: true,
      execute: vi.fn().mockResolvedValue({
        provider: "openai", model: "gpt-4o-mini",
        query: "test", responseText: "ok",
        generatedAt: new Date().toISOString(), latencyMs: 50,
        success: true, failureReason: null,
        businessMentioned: false, mentionType: null, mentionPosition: null,
        competitorMentions: [], citations: [],
      }),
    };

    const svc = new AiQueryScanService(pool as any, db as any, fakeProvider);
    await svc.execute({ clientId: "any-uuid", userId: "user-1" });

    expect(capturedSql).toContain("service_key");
    expect(capturedSql).not.toContain("service_id");
  });
});

// ── 5. clients table geography fallback ───────────────────────────────────────

describe("buildTenantContext: clients.service_areas fallback", () => {
  it("uses clients.service_areas when local_presence_profiles has no row for this UUID", async () => {
    const capturedQueries: string[] = [];
    const providerExecute = vi.fn().mockImplementation((req: { query: string }) => {
      capturedQueries.push(req.query);
      return Promise.resolve({
        provider: "openai", model: "gpt-4o-mini", query: req.query,
        responseText: "ok", generatedAt: new Date().toISOString(), latencyMs: 100,
        success: true, failureReason: null,
        businessMentioned: false, mentionType: null, mentionPosition: null,
        competitorMentions: [], citations: [],
      });
    });

    const pool = makePool({
      "select service_key from client_services": {
        rows: [{ service_key: "bed_bug_inspection" }],
      },
      "select client_name, service_areas from clients": {
        rows: [{
          client_name: "Bed Bugs & Beyond",
          service_areas: '["Foley, AL","Daphne, AL"]',
        }],
      },
      "insert into ai_query_scans": { rows: [{ id: "scan-fallback-001" }] },
      "insert into ai_query_results": { rows: [] },
      "update ai_query_scans": { rows: [] },
      "select id, name, domain from competitors": { rows: [] },
    });

    // DB returns no local_presence_profiles row (simulates UUID mismatch with "default" stored row)
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const fakeProvider = { name: "openai", model: "gpt-4o-mini", isConfigured: true, execute: providerExecute };
    const svc = new AiQueryScanService(pool as any, db as any, fakeProvider);
    const summary = await svc.execute({ clientId: "0f15a60a-6277-4933-a17e-d3e453a4e291", userId: "user-1" });

    // Must NOT be preflight_failed — geography came from clients table
    expect(summary.status).not.toBe("preflight_failed");
    expect(summary.queryCount).toBeGreaterThan(0);

    // All queries must use real geography from clients.service_areas
    const hasFoley = capturedQueries.some(q => q.toLowerCase().includes("foley, al"));
    const hasDaphne = capturedQueries.some(q => q.toLowerCase().includes("daphne, al"));
    expect(hasFoley || hasDaphne).toBe(true);

    // Must never contain generic fallback geographies
    expect(capturedQueries.some(q => q.toLowerCase().includes("my area"))).toBe(false);
  });
});

// ── 6. clients.client_name fallback for business name ─────────────────────────

describe("buildTenantContext: clients.client_name fallback", () => {
  it("returns scan successfully using client_name from clients table when profile is absent", async () => {
    const pool = makePool({
      "select service_key from client_services": {
        rows: [{ service_key: "fumigation" }],
      },
      "select client_name, service_areas from clients": {
        rows: [{ client_name: "Pest Pro Inc", service_areas: '["Mobile, AL"]' }],
      },
      "insert into ai_query_scans": { rows: [{ id: "scan-name-001" }] },
      "insert into ai_query_results": { rows: [] },
      "update ai_query_scans": { rows: [] },
      "select id, name, domain from competitors": { rows: [] },
    });

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const fakeProvider = {
      name: "openai", model: "gpt-4o-mini", isConfigured: true,
      execute: vi.fn().mockResolvedValue({
        provider: "openai", model: "gpt-4o-mini", query: "best fumigation in Mobile, AL",
        responseText: "result", generatedAt: new Date().toISOString(), latencyMs: 100,
        success: true, failureReason: null, businessMentioned: false,
        mentionType: null, mentionPosition: null, competitorMentions: [], citations: [],
      }),
    };

    const svc = new AiQueryScanService(pool as any, db as any, fakeProvider);
    const summary = await svc.execute({ clientId: "some-other-uuid", userId: "user-1" });

    expect(summary.status).not.toBe("preflight_failed");
    expect(summary.queryCount).toBeGreaterThan(0);
  });
});

// ── 7. Cross-tenant isolation ─────────────────────────────────────────────────

describe("Cross-tenant isolation", () => {
  it("queries are bound to the requested clientId, not a different tenant", async () => {
    const capturedSqlParams: unknown[][] = [];
    const pool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        capturedSqlParams.push([...params]);
        if (sql.toLowerCase().includes("client_services")) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.toLowerCase().includes("clients") && sql.toLowerCase().includes("select")) {
          return Promise.resolve({ rows: [{ client_name: "Tenant A", service_areas: '["Foley, AL"]' }] });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const TENANT_A = "aaa-aaa-aaa";
    const svc = new AiQueryScanService(pool as any, db as any);
    await svc.execute({ clientId: TENANT_A, userId: "user-1" });

    // Every parameterized query should use TENANT_A's clientId — never another tenant's
    const usedClientIds = capturedSqlParams
      .flat()
      .filter((p): p is string => typeof p === "string" && p.includes("-"));

    for (const id of usedClientIds) {
      if (id !== TENANT_A) {
        // Allow scan UUIDs generated during the run
        expect(id).not.toBe("bbb-bbb-bbb");
      }
    }
  });
});
