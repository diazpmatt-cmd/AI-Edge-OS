/**
 * Competitor Discovery Service — Phase 3 integration smoke test.
 *
 * Exercises the full extraction pipeline against the live dev DB:
 *   discovery_signals (seeded by beforeAll fixture) →
 *   extractCompetitorsFromSignals() →
 *   DrizzleCompetitorRepository.upsertMany() →
 *   competitors table
 *
 * Phase 3E: verifies www-dedup (10 signals → 6 unique competitors).
 * Phase 3D: verifies provenance fields on upserted rows.
 *
 * Fixture layout (10 signals → 6 unique domains after normalization):
 *   arrowexterminators.com  ×3  (includes 1 www. prefix variant) → rank 1, gaps 3 → critical
 *   orkin.com               ×2                                    → rank 1, gaps 2 → high
 *   terminix.com            ×1                                    → rank 3, gaps 1 → high
 *   massey.com              ×1                                    → rank 5, gaps 1 → high
 *   bugbusters.com          ×1                                    → rank 7, gaps 1 → high
 *   pestmaster.com          ×2                                    → rank 4, gaps 2 → high
 *
 * beforeAll seeds the snapshot + signals; afterAll cleans up everything.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "@workspace/db";
import { CompetitorDiscoveryService } from "../lib/competitor-discovery-service.js";

const TEST_CLIENT   = "test-client";
const TEST_SNAPSHOT = "run::test-client::2026-w29";

// ── Fixture helpers ────────────────────────────────────────────────────────────

async function seedSnapshot(): Promise<void> {
  await pool.query(
    `INSERT INTO discovery_snapshots
       (id, client_id, week_label, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_SNAPSHOT, TEST_CLIENT, "2026-w29", "complete"],
  );
}

async function seedSignal(
  id: string,
  keyword: string,
  competitorDomain: string,
  rank: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO discovery_signals
       (id, snapshot_id, client_id, signal_type, source,
        raw_value, normalized_value, intent,
        competitor_rank, raw_provider_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      TEST_SNAPSHOT,
      TEST_CLIENT,
      "keyword_gap",
      "dataforseo_serp",
      keyword,
      keyword,
      "transactional",
      rank,
      JSON.stringify({ topCompetitorDomain: competitorDomain }),
    ],
  );
}

beforeAll(async () => {
  await seedSnapshot();

  // 10 signals that produce 6 unique competitors after domain normalization:
  //   www.arrowexterminators.com (sig-2) collapses into arrowexterminators.com
  await seedSignal("sig::tc::1", "pest control atlanta",   "arrowexterminators.com",      1);
  await seedSignal("sig::tc::2", "exterminator near me",   "www.arrowexterminators.com",  2);
  await seedSignal("sig::tc::3", "termite treatment",      "arrowexterminators.com",      1);
  await seedSignal("sig::tc::4", "ant control service",    "orkin.com",                   1);
  await seedSignal("sig::tc::5", "rodent removal service", "orkin.com",                   3);
  await seedSignal("sig::tc::6", "termite inspection",     "terminix.com",                3);
  await seedSignal("sig::tc::7", "flea treatment",         "massey.com",                  5);
  await seedSignal("sig::tc::8", "bed bug treatment",      "bugbusters.com",              7);
  await seedSignal("sig::tc::9", "mosquito control",       "pestmaster.com",              4);
  await seedSignal("sig::tc::10","wasp removal service",   "pestmaster.com",              6);
});

afterAll(async () => {
  await pool.query(`DELETE FROM competitors        WHERE client_id = $1`, [TEST_CLIENT]);
  await pool.query(`DELETE FROM discovery_signals  WHERE client_id = $1`, [TEST_CLIENT]);
  await pool.query(`DELETE FROM discovery_snapshots WHERE client_id = $1`, [TEST_CLIENT]);
});

describe("CompetitorDiscoveryService.extractCompetitorsFromLatestRun()", () => {
  it("returns empty result when no snapshot exists for client", async () => {
    const svc = new CompetitorDiscoveryService();
    const result = await svc.extractCompetitorsFromLatestRun("no-such-client");

    expect(result.clientId).toBe("no-such-client");
    expect(result.snapshotId).toBeNull();
    expect(result.extracted).toBe(0);
    expect(result.inserted).toBe(0);
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("extracts competitors from the latest snapshot, deduplicates by domain (Phase 3E)", async () => {
    const svc = new CompetitorDiscoveryService();
    const result = await svc.extractCompetitorsFromLatestRun(TEST_CLIENT);

    expect(result.clientId).toBe(TEST_CLIENT);
    expect(result.snapshotId).toBe("run::test-client::2026-w29");

    // 10 signals in the snapshot
    expect(result.extracted).toBe(10);

    // www.arrowexterminators.com collapses into arrowexterminators.com → 6 unique
    const totalCompetitors = result.inserted + result.updated;
    expect(totalCompetitors).toBe(6);

    // At least 1 entry had > 1 signal (arrowexterminators.com appeared 3x)
    expect(result.duplicateGroups).toBeGreaterThanOrEqual(1);

    expect(result.processingTimeMs).toBeGreaterThan(0);
  });

  it("upserts canonical competitor rows into the DB", async () => {
    const res = await pool.query<{
      domain: string;
      keyword_gap_count: number;
      top_keyword_rank: number | null;
      threat_level: string | null;
      opportunity_score: number;
      discovery_source: string;
      confidence_score: number;
      canonical_status: string;
    }>(
      `SELECT domain, keyword_gap_count, top_keyword_rank,
              threat_level, opportunity_score, discovery_source,
              confidence_score, canonical_status
       FROM competitors
       WHERE client_id = $1
       ORDER BY keyword_gap_count DESC, domain ASC`,
      [TEST_CLIENT],
    );

    expect(res.rows.length).toBe(6);

    // arrowexterminators.com: 3 gap signals merged, best rank = 1
    const arrow = res.rows.find(r => r.domain === "arrowexterminators.com");
    expect(arrow).toBeDefined();
    expect(arrow!.keyword_gap_count).toBe(3);
    expect(arrow!.top_keyword_rank).toBe(1);
    expect(arrow!.threat_level).toBe("critical"); // rank≤3 AND gaps≥3
    expect(arrow!.discovery_source).toBe("serp_organic");
    expect(arrow!.confidence_score).toBe(10);
    expect(arrow!.canonical_status).toBe("active");

    // orkin.com: 2 gap signals, best rank = 1
    const orkin = res.rows.find(r => r.domain === "orkin.com");
    expect(orkin).toBeDefined();
    expect(orkin!.keyword_gap_count).toBe(2);
    expect(orkin!.top_keyword_rank).toBe(1);
    expect(orkin!.threat_level).toBe("high"); // rank≤10 OR gaps≥5

    // terminix.com: 1 gap signal, rank 3
    const terminix = res.rows.find(r => r.domain === "terminix.com");
    expect(terminix).toBeDefined();
    expect(terminix!.keyword_gap_count).toBe(1);
    expect(terminix!.top_keyword_rank).toBe(3);
    expect(["medium", "high"]).toContain(terminix!.threat_level);
  });

  it("provenance: every row has discovery_source and positive opportunity_score (Phase 3D)", async () => {
    const res = await pool.query<{
      domain: string;
      discovery_source: string;
      opportunity_score: number;
      first_seen_at: Date;
      last_seen_at: Date;
    }>(
      `SELECT domain, discovery_source, opportunity_score, first_seen_at, last_seen_at
       FROM competitors WHERE client_id = $1`,
      [TEST_CLIENT],
    );

    for (const row of res.rows) {
      expect(row.discovery_source).toBe("serp_organic");
      expect(row.opportunity_score).toBeGreaterThan(0);
      expect(row.first_seen_at).toBeDefined();
      expect(row.last_seen_at).toBeDefined();
    }
  });

  it("is idempotent: re-running extraction does not create duplicates", async () => {
    const svc = new CompetitorDiscoveryService();
    await svc.extractCompetitorsFromLatestRun(TEST_CLIENT);

    const res = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM competitors WHERE client_id = $1`,
      [TEST_CLIENT],
    );
    // Still exactly 6 — no duplicates created by second run
    expect(parseInt(res.rows[0]!.cnt, 10)).toBe(6);
  });
});
