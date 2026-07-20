/**
 * C9R-5 — Unit tests for AiQueryScanService.listHistory()
 *
 * Uses constructor injection to pass a mock pool — no module-level mocking needed.
 * No paid AI provider calls are made in these tests.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { AiQueryScanService } from "../lib/ai-query-scan-service.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now     = new Date("2026-07-19T10:00:00Z");
  const twoMin  = new Date("2026-07-19T10:02:00Z");
  return {
    id:                       "scan-uuid-001",
    client_id:                "client-uuid-001",
    trigger_source:           "manual",
    provider:                 "openai",
    model:                    "gpt-4o-mini",
    status:                   "completed",
    query_count:              10,
    completed_count:          9,
    mention_count:            3,
    competitor_mention_count: 2,
    citation_count:           5,
    error:                    null,
    started_at:               now,
    completed_at:             twoMin,
    ...overrides,
  };
}

function makePool(
  countRows: Array<{ cnt: string }>,
  dataRows: Record<string, unknown>[],
): Record<string, unknown> {
  let callCount = 0;
  return {
    query: vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return { rows: countRows };
      return { rows: dataRows };
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AiQueryScanService.listHistory()", () => {
  test("returns empty page when no scans exist", async () => {
    const pool = makePool([{ cnt: "0" }], []) as any;
    const svc  = new AiQueryScanService(pool, {} as any);
    const page = await svc.listHistory("client-001");

    expect(page.scans).toHaveLength(0);
    expect(page.total).toBe(0);
    expect(page.hasMore).toBe(false);
    expect(page.page).toBe(1);
  });

  test("gracefully returns empty page when table does not exist (42P01)", async () => {
    const pool = { query: vi.fn().mockRejectedValue({ code: "42P01" }) } as any;
    const svc  = new AiQueryScanService(pool, {} as any);
    const page = await svc.listHistory("client-001");

    expect(page.scans).toHaveLength(0);
    expect(page.total).toBe(0);
  });

  test("maps all fields correctly for a completed scan", async () => {
    const pool = makePool([{ cnt: "1" }], [makeRow()]) as any;
    const svc  = new AiQueryScanService(pool, {} as any);
    const page = await svc.listHistory("client-001");

    const scan = page.scans[0];
    expect(scan.scanId).toBe("scan-uuid-001");
    expect(scan.clientId).toBe("client-uuid-001");
    expect(scan.triggerSource).toBe("manual");
    expect(scan.provider).toBe("openai");
    expect(scan.model).toBe("gpt-4o-mini");
    expect(scan.status).toBe("completed");
    expect(scan.queryCount).toBe(10);
    expect(scan.completedCount).toBe(9);
    expect(scan.failedCount).toBe(1);
    expect(scan.mentionCount).toBe(3);
    expect(scan.mentionRate).toBeCloseTo(3 / 9, 3);
    expect(scan.competitorMentionCount).toBe(2);
    expect(scan.citationCount).toBe(5);
    expect(scan.startedAt).toBe("2026-07-19T10:00:00.000Z");
    expect(scan.completedAt).toBe("2026-07-19T10:02:00.000Z");
    expect(scan.durationMs).toBe(2 * 60 * 1000);
    expect(scan.errorMessage).toBeNull();
    expect(scan.evidenceHref).toContain("scan-uuid-001");
  });

  test("triggerSource defaults to 'manual' when column is null/undefined", async () => {
    const pool = makePool([{ cnt: "1" }], [makeRow({ trigger_source: null })]) as any;
    const svc  = new AiQueryScanService(pool, {} as any);
    const page = await svc.listHistory("client-001");
    expect(page.scans[0].triggerSource).toBe("manual");
  });

  test("maps 'scheduled' triggerSource", async () => {
    const pool = makePool([{ cnt: "1" }], [makeRow({ trigger_source: "scheduled" })]) as any;
    const svc  = new AiQueryScanService(pool, {} as any);
    const page = await svc.listHistory("client-001");
    expect(page.scans[0].triggerSource).toBe("scheduled");
  });

  test("durationMs is null when completedAt is null", async () => {
    const pool = makePool([{ cnt: "1" }], [makeRow({ completed_at: null })]) as any;
    const svc  = new AiQueryScanService(pool, {} as any);
    const page = await svc.listHistory("client-001");
    expect(page.scans[0].durationMs).toBeNull();
  });

  test("competitor_mention_count null is preserved as null", async () => {
    const pool = makePool([{ cnt: "1" }], [makeRow({ competitor_mention_count: null })]) as any;
    const svc  = new AiQueryScanService(pool, {} as any);
    const page = await svc.listHistory("client-001");
    expect(page.scans[0].competitorMentionCount).toBeNull();
  });

  test("mentionRate is 0 when completedCount is 0", async () => {
    const pool = makePool([{ cnt: "1" }], [makeRow({ completed_count: 0, mention_count: 0 })]) as any;
    const svc  = new AiQueryScanService(pool, {} as any);
    const page = await svc.listHistory("client-001");
    expect(page.scans[0].mentionRate).toBe(0);
  });

  test("pagination: hasMore is true when more rows remain", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeRow({ id: `scan-${i}` }));
    const pool = makePool([{ cnt: "20" }], rows) as any;
    const svc  = new AiQueryScanService(pool, {} as any);
    const page = await svc.listHistory("client-001", { page: 1, pageSize: 5 });

    expect(page.total).toBe(20);
    expect(page.hasMore).toBe(true);
    expect(page.scans).toHaveLength(5);
  });

  test("pagination: hasMore is false on last page", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => makeRow({ id: `scan-${i}` }));
    const pool = makePool([{ cnt: "3" }], rows) as any;
    const svc  = new AiQueryScanService(pool, {} as any);
    const page = await svc.listHistory("client-001", { page: 1, pageSize: 10 });

    expect(page.hasMore).toBe(false);
  });

  test("pageSize is capped at 50", async () => {
    const pool = makePool([{ cnt: "0" }], []) as any;
    const svc  = new AiQueryScanService(pool, {} as any);
    const page = await svc.listHistory("client-001", { pageSize: 999 });
    expect(page.pageSize).toBe(50);
  });

  test("pageSize minimum is 1", async () => {
    const pool = makePool([{ cnt: "0" }], []) as any;
    const svc  = new AiQueryScanService(pool, {} as any);
    const page = await svc.listHistory("client-001", { pageSize: 0 });
    expect(page.pageSize).toBe(1);
  });

  test("status filter is passed through to the SQL query", async () => {
    const pool = makePool([{ cnt: "0" }], []) as any;
    const svc  = new AiQueryScanService(pool, {} as any);
    await svc.listHistory("client-001", { status: "completed" });

    const countCallArgs = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(countCallArgs[0]).toContain("status");
    expect(countCallArgs[1]).toContain("completed");
  });

  test("no status filter omits the status WHERE clause", async () => {
    const pool = makePool([{ cnt: "0" }], []) as any;
    const svc  = new AiQueryScanService(pool, {} as any);
    await svc.listHistory("client-001");

    const countCallArgs = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(countCallArgs[1]).not.toContain("completed");
    expect(countCallArgs[1]).not.toContain("failed");
  });

  test("throws non-42P01 DB errors", async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error("connection refused")) } as any;
    const svc  = new AiQueryScanService(pool, {} as any);
    await expect(svc.listHistory("client-001")).rejects.toThrow("connection refused");
  });
});
