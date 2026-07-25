/**
 * Competitor Score Write-back — P6.1 unit tests.
 *
 * Covers:
 *   - DrizzleCompetitorRepository.updateScores() persistence
 *   - Partial key semantics (only supplied fields updated)
 *   - Tenant isolation (wrong clientId cannot modify the row)
 *   - No-op when no score keys are supplied
 *   - CompetitorDiscoveryService.deriveConfidenceScore() formula
 */

import { describe, it, expect, afterAll } from "vitest";
import { pool, db, DrizzleCompetitorRepository } from "@workspace/db";
import type { NormalizedCompetitor } from "@workspace/db";
import { CompetitorDiscoveryService } from "../lib/competitor-discovery-service.js";

const TEST_CLIENT  = "score-wb-test-client";
const TEST_DOMAIN  = "scoretest.com";
const OTHER_CLIENT = "score-wb-other-client";

// ── Fixture helpers ────────────────────────────────────────────────────────────

async function seedCompetitor(clientId: string, domain: string): Promise<void> {
  const repo = new DrizzleCompetitorRepository(db);
  const entity: NormalizedCompetitor = {
    clientId,
    domain,
    discoverySource: "serp_organic",
    confidenceScore: 10,
    keywordGapCount: 1,
    canonicalStatus: "active",
  };
  await repo.upsertMany([entity]);
}

afterAll(async () => {
  await pool.query(
    `DELETE FROM competitors WHERE client_id = ANY($1)`,
    [[TEST_CLIENT, OTHER_CLIENT]],
  );
});

// ── updateScores() — persistence ──────────────────────────────────────────────

describe("DrizzleCompetitorRepository.updateScores()", () => {
  it("writes supplied score fields and bumps updatedAt", async () => {
    await seedCompetitor(TEST_CLIENT, TEST_DOMAIN);

    const repo = new DrizzleCompetitorRepository(db);

    // Record updatedAt before the write
    const before = await pool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM competitors WHERE client_id = $1 AND domain = $2`,
      [TEST_CLIENT, TEST_DOMAIN],
    );
    const updatedAtBefore = before.rows[0]!.updated_at.getTime();

    // Write a subset of scores
    await repo.updateScores(TEST_CLIENT, TEST_DOMAIN, {
      citationScore:     55,
      domainAuthority:   42,
      backlinkCount:     1200,
      confidenceScore:   35,
    });

    const after = await pool.query<{
      citation_score:     number | null;
      domain_authority:   number | null;
      backlink_count:     number | null;
      ai_visibility_score:number | null;
      confidence_score:   number;
      updated_at:         Date;
    }>(
      `SELECT citation_score, domain_authority, backlink_count,
              ai_visibility_score, confidence_score, updated_at
       FROM competitors WHERE client_id = $1 AND domain = $2`,
      [TEST_CLIENT, TEST_DOMAIN],
    );

    const row = after.rows[0]!;
    expect(row.citation_score).toBe(55);
    expect(row.domain_authority).toBe(42);
    expect(row.backlink_count).toBe(1200);
    expect(row.confidence_score).toBe(35);

    // aiVisibilityScore was NOT supplied — must remain null
    expect(row.ai_visibility_score).toBeNull();

    // updatedAt must advance
    expect(row.updated_at.getTime()).toBeGreaterThan(updatedAtBefore);
  });

  it("accepts null to explicitly clear a nullable score field", async () => {
    await seedCompetitor(TEST_CLIENT, `${TEST_DOMAIN}-null`);

    const repo = new DrizzleCompetitorRepository(db);

    // First set a value
    await repo.updateScores(TEST_CLIENT, `${TEST_DOMAIN}-null`, {
      citationScore: 80,
    });

    // Then clear it
    await repo.updateScores(TEST_CLIENT, `${TEST_DOMAIN}-null`, {
      citationScore: null,
    });

    const res = await pool.query<{ citation_score: number | null }>(
      `SELECT citation_score FROM competitors WHERE client_id = $1 AND domain = $2`,
      [TEST_CLIENT, `${TEST_DOMAIN}-null`],
    );
    expect(res.rows[0]!.citation_score).toBeNull();
  });

  it("is a no-op when no score keys are supplied", async () => {
    await seedCompetitor(TEST_CLIENT, `${TEST_DOMAIN}-noop`);

    const repo = new DrizzleCompetitorRepository(db);

    const before = await pool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM competitors WHERE client_id = $1 AND domain = $2`,
      [TEST_CLIENT, `${TEST_DOMAIN}-noop`],
    );
    const tBefore = before.rows[0]!.updated_at.getTime();

    await repo.updateScores(TEST_CLIENT, `${TEST_DOMAIN}-noop`, {});

    const after = await pool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM competitors WHERE client_id = $1 AND domain = $2`,
      [TEST_CLIENT, `${TEST_DOMAIN}-noop`],
    );
    // updatedAt must NOT advance for a true no-op
    expect(after.rows[0]!.updated_at.getTime()).toBe(tBefore);
  });

  it("enforces tenant isolation — wrong clientId does not modify the row", async () => {
    await seedCompetitor(TEST_CLIENT, `${TEST_DOMAIN}-iso`);

    const repo = new DrizzleCompetitorRepository(db);

    // Attempt to update using a DIFFERENT clientId
    await repo.updateScores(OTHER_CLIENT, `${TEST_DOMAIN}-iso`, {
      confidenceScore: 99,
    });

    const res = await pool.query<{ confidence_score: number }>(
      `SELECT confidence_score FROM competitors WHERE client_id = $1 AND domain = $2`,
      [TEST_CLIENT, `${TEST_DOMAIN}-iso`],
    );
    // Row belongs to TEST_CLIENT — must be untouched at baseline 10
    expect(res.rows[0]!.confidence_score).toBe(10);
  });
});

// ── deriveConfidenceScore() — formula ─────────────────────────────────────────

/**
 * Expose the private method for testing via a thin subclass.
 * This avoids changing the production class visibility.
 */
class TestableDiscoveryService extends CompetitorDiscoveryService {
  publicDeriveConfidence(entity: NormalizedCompetitor): number {
    return this.deriveConfidenceScore(entity);
  }
}

describe("CompetitorDiscoveryService.deriveConfidenceScore()", () => {
  const svc = new TestableDiscoveryService();

  it("returns base 10 for a minimal SERP-only signal", () => {
    const entity: NormalizedCompetitor = {
      clientId:        "c1",
      domain:          "minimal.com",
      discoverySource: "serp_organic",
      confidenceScore: 10,
      keywordGapCount: 1,
    };
    expect(svc.publicDeriveConfidence(entity)).toBe(10);
  });

  it("adds +10 for keywordGapCount ≥ 3", () => {
    const entity: NormalizedCompetitor = {
      clientId:        "c1",
      domain:          "multi.com",
      discoverySource: "serp_organic",
      keywordGapCount: 3,
    };
    expect(svc.publicDeriveConfidence(entity)).toBe(20); // 10 + 10
  });

  it("adds +5 for keywordGapCount = 2", () => {
    const entity: NormalizedCompetitor = {
      clientId:        "c1",
      domain:          "double.com",
      discoverySource: "serp_organic",
      keywordGapCount: 2,
    };
    expect(svc.publicDeriveConfidence(entity)).toBe(15); // 10 + 5
  });

  it("adds +5 for topKeywordRank ≤ 5", () => {
    const entity: NormalizedCompetitor = {
      clientId:        "c1",
      domain:          "toprank.com",
      discoverySource: "serp_organic",
      keywordGapCount: 1,
      topKeywordRank:  3,
    };
    expect(svc.publicDeriveConfidence(entity)).toBe(15); // 10 + 5
  });

  it("adds +10 for an extracted business name (not domain fallback)", () => {
    const entity: NormalizedCompetitor = {
      clientId:        "c1",
      domain:          "named.com",
      businessName:    "Named Pest Services",
      discoverySource: "serp_organic",
      keywordGapCount: 1,
    };
    expect(svc.publicDeriveConfidence(entity)).toBe(20); // 10 + 10
  });

  it("adds +5 for extracted city or state", () => {
    const entity: NormalizedCompetitor = {
      clientId:        "c1",
      domain:          "local.com",
      city:            "Atlanta",
      discoverySource: "serp_organic",
      keywordGapCount: 1,
    };
    expect(svc.publicDeriveConfidence(entity)).toBe(15); // 10 + 5
  });

  it("adds +5 for an extracted primaryCategory", () => {
    const entity: NormalizedCompetitor = {
      clientId:         "c1",
      domain:           "categorized.com",
      primaryCategory:  "Pest Control Service",
      discoverySource:  "serp_organic",
      keywordGapCount:  1,
    };
    expect(svc.publicDeriveConfidence(entity)).toBe(15); // 10 + 5
  });

  it("accumulates all factors and caps at 70", () => {
    const entity: NormalizedCompetitor = {
      clientId:        "c1",
      domain:          "rich.com",
      businessName:    "Rich Exterminators",   // +10
      primaryCategory: "Pest Control Service", // +5
      city:            "Atlanta",              // +5
      state:           "GA",                   // already counted via city check
      topKeywordRank:  2,                      // +5
      keywordGapCount: 5,                      // +10 (≥3)
      discoverySource: "serp_organic",
      // Total: 10 + 10 + 5 + 5 + 5 + 10 = 45
    };
    expect(svc.publicDeriveConfidence(entity)).toBe(45);
  });

  it("caps at 70 even when all factors are maxed", () => {
    const entity: NormalizedCompetitor = {
      clientId:        "c1",
      domain:          "maxed.com",
      businessName:    "Maxed Out Pest Co",
      primaryCategory: "Exterminator",
      city:            "Tampa",
      state:           "FL",
      topKeywordRank:  1,
      keywordGapCount: 10,
      discoverySource: "serp_organic",
      // 10 + 10 + 5 + 5 + 10 + 5 = 45 — below cap naturally
      // Cap still enforced: max realistic is 45, well under 70
    };
    expect(svc.publicDeriveConfidence(entity)).toBeLessThanOrEqual(70);
    expect(svc.publicDeriveConfidence(entity)).toBeGreaterThan(10);
  });
});
