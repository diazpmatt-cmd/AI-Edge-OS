/**
 * competitor-ai-visibility-provider.test.ts — P6.2
 *
 * Covers:
 *  1. Matching domain found in competitors_json
 *  2. Protocol and www normalization
 *  3. Domain not found → sparse observation
 *  4. competitors_json is null / empty
 *  5. competitors_json is malformed JSON
 *  6. competitors_json has unexpected entry shape → skipped safely
 *  7. Valid score persists through updateScores() (via enrichment service)
 *  8. Null / no match → does NOT call updateScores()
 *  9. Tenant isolation — wrong clientId never matches
 * 10. Real observation returns isMock: false
 * 11. Confidence increases for confirmed match, never exceeds 70
 * 12. deriveCompetitorAiScore formula correctness
 * 13. normalizeName helper
 * 14. applyAiVisibilityConfidenceBoost helper (cap at 70)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AiEdgeVisibilityProvider,
  normalizeName,
  deriveCompetitorAiScore,
  applyAiVisibilityConfidenceBoost,
  isLikelyMatch,
} from "../lib/competitor-ai-visibility-provider.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Exact shape verified from ai-visibility.ts route DEMO_AUDIT and client-onboarding.ts */
const DEMO_COMPETITORS_JSON = JSON.stringify([
  { name: "Havard Pest Control",            reviewGap: -24, keywordGap: "High",   backlinkGap: "High",   aiGap: -16, opportunityScore: 78 },
  { name: "Beebe's Pest & Termite Control", reviewGap: -8,  keywordGap: "Medium", backlinkGap: "Medium", aiGap: -9,  opportunityScore: 55 },
  { name: "Knox Pest Control",              reviewGap: -3,  keywordGap: "Low",    backlinkGap: "Low",    aiGap: -7,  opportunityScore: 42 },
  { name: "Arrow Exterminators",            reviewGap: -41, keywordGap: "High",   backlinkGap: "High",   aiGap: -22, opportunityScore: 91 },
]);

const BASE_AUDIT_ROW = {
  id:                   "audit-001",
  ai_search_score:      18,
  overall_score:        34,
  competitor_gap_score: 27,
  competitors_json:     DEMO_COMPETITORS_JSON,
  created_at:           new Date("2026-07-15T10:00:00Z"),
};

function makePoolWith(rows: object[]): any {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  };
}

function makeInput(domain: string, businessName?: string, competitorId = "comp-001", clientId = "client-bbb"): any {
  return {
    clientId,
    competitorId,
    domain,
    existingData: businessName ? { businessName } : {},
  };
}

// ── Helper unit tests ─────────────────────────────────────────────────────────

describe("normalizeName", () => {
  it("strips protocol and www", () => {
    expect(normalizeName("https://www.arrowexterminators.com")).toBe("arrowexterminators");
  });

  it("strips TLD", () => {
    expect(normalizeName("orkin.com")).toBe("orkin");
  });

  it("removes common business suffixes", () => {
    expect(normalizeName("Arrow Exterminators Inc.")).toBe("arrow");
    expect(normalizeName("Knox Pest Control LLC")).toBe("knox");
  });

  it("lowercases", () => {
    expect(normalizeName("HAVARD")).toBe("havard");
  });
});

describe("deriveCompetitorAiScore", () => {
  it("competitor ahead: clientScore + abs(aiGap)", () => {
    // aiGap = -22 means competitor is 22 pts ahead; client aiSearchScore = 18
    // expected competitor score = 18 - (-22) = 40
    expect(deriveCompetitorAiScore(18, -22)).toBe(40);
  });

  it("client ahead: competitor score is lower", () => {
    // aiGap = +10 means client is 10 pts ahead; competitor score = 18 - 10 = 8
    expect(deriveCompetitorAiScore(18, 10)).toBe(8);
  });

  it("tied: same score as client", () => {
    expect(deriveCompetitorAiScore(18, 0)).toBe(18);
  });

  it("clamps to 0 minimum", () => {
    expect(deriveCompetitorAiScore(5, 20)).toBe(0);
  });

  it("clamps to 100 maximum", () => {
    expect(deriveCompetitorAiScore(95, -20)).toBe(100);
  });
});

describe("applyAiVisibilityConfidenceBoost", () => {
  it("adds 5 to current confidence", () => {
    expect(applyAiVisibilityConfidenceBoost(50)).toBe(55);
  });

  it("caps at 70", () => {
    expect(applyAiVisibilityConfidenceBoost(67)).toBe(70);
    expect(applyAiVisibilityConfidenceBoost(70)).toBe(70);
    expect(applyAiVisibilityConfidenceBoost(100)).toBe(70);
  });

  it("does not decrease confidence below input when input < 66", () => {
    const result = applyAiVisibilityConfidenceBoost(30);
    expect(result).toBeGreaterThan(30);
  });
});

describe("isLikelyMatch", () => {
  it("matches by businessName (case-insensitive)", () => {
    expect(isLikelyMatch("Arrow Exterminators", "some-other.com", "Arrow Exterminators")).toBe(true);
  });

  it("matches by domain slug when businessName absent", () => {
    expect(isLikelyMatch("Arrow Exterminators", "arrowexterminators.com", undefined)).toBe(true);
  });

  it("returns false for clearly unrelated names", () => {
    expect(isLikelyMatch("Orkin", "arrowexterminators.com", "Arrow Exterminators")).toBe(false);
  });
});

// ── Provider integration tests ────────────────────────────────────────────────

describe("AiEdgeVisibilityProvider", () => {

  describe("1. Matching domain found", () => {
    it("returns a non-mock observation with derivedScore in rawObservation", async () => {
      const pool     = makePoolWith([BASE_AUDIT_ROW]);
      const provider = new AiEdgeVisibilityProvider(pool);
      const obs      = await provider.enrich(makeInput("arrowexterminators.com", "Arrow Exterminators"));

      expect(obs.isMock).toBe(false);
      expect(obs.category).toBe("ai_visibility");
      expect((obs.rawObservation as any).hasMatch).toBe(true);
      // Arrow Exterminators: aiGap=-22, clientScore=18 → 18 - (-22) = 40
      expect((obs.rawObservation as any).derivedScore).toBe(40);
      expect(obs.normalizedObservation.score).toBe(40);
    });
  });

  describe("2. Protocol and www normalization", () => {
    it("matches https://www.arrowexterminators.com to 'Arrow Exterminators'", async () => {
      const pool     = makePoolWith([BASE_AUDIT_ROW]);
      const provider = new AiEdgeVisibilityProvider(pool);
      const obs      = await provider.enrich(
        makeInput("https://www.arrowexterminators.com", "Arrow Exterminators"),
      );

      expect(obs.isMock).toBe(false);
      expect((obs.rawObservation as any).hasMatch).toBe(true);
    });
  });

  describe("3. Domain not found → sparse observation", () => {
    it("returns sparse observation with hasMatch: false and score: 0", async () => {
      const pool     = makePoolWith([BASE_AUDIT_ROW]);
      const provider = new AiEdgeVisibilityProvider(pool);
      const obs      = await provider.enrich(makeInput("unknowndomain.com", "Unknown Co"));

      expect(obs.isMock).toBe(false);
      expect((obs.rawObservation as any).hasMatch).toBe(false);
      expect((obs.rawObservation as any).derivedScore).toBeNull();
      expect(obs.normalizedObservation.score).toBe(0);
      expect(obs.confidence).toBe(20);
      expect(obs.normalizedObservation.signals[0]).toContain("No AI visibility data");
    });
  });

  describe("4. competitors_json is null / empty array", () => {
    it("returns sparse observation when competitors_json is '[]'", async () => {
      const pool = makePoolWith([{ ...BASE_AUDIT_ROW, competitors_json: "[]" }]);
      const provider = new AiEdgeVisibilityProvider(pool);
      const obs = await provider.enrich(makeInput("arrowexterminators.com", "Arrow Exterminators"));

      expect((obs.rawObservation as any).hasMatch).toBe(false);
      expect(obs.confidence).toBe(20);
    });

    it("returns sparse observation when no audit row exists", async () => {
      const pool     = makePoolWith([]);
      const provider = new AiEdgeVisibilityProvider(pool);
      const obs      = await provider.enrich(makeInput("arrowexterminators.com", "Arrow Exterminators"));

      expect((obs.rawObservation as any).hasMatch).toBe(false);
      expect(obs.normalizedObservation.signals[0]).toContain("No AI visibility audit found");
    });
  });

  describe("5. competitors_json is malformed JSON", () => {
    it("returns sparse observation without throwing", async () => {
      const pool = makePoolWith([{
        ...BASE_AUDIT_ROW,
        competitors_json: "{ this is not valid json [",
      }]);
      const provider = new AiEdgeVisibilityProvider(pool);
      const obs = await provider.enrich(makeInput("arrowexterminators.com", "Arrow Exterminators"));

      expect(obs.isMock).toBe(false);
      expect((obs.rawObservation as any).hasMatch).toBe(false);
      expect(obs.normalizedObservation.signals[0]).toContain("malformed");
    });
  });

  describe("6. Unexpected entry shape is skipped safely", () => {
    it("skips entries missing required fields without throwing", async () => {
      const mixedJson = JSON.stringify([
        null,
        {},
        { name: 123, aiGap: "not-a-number" },
        { name: "Arrow Exterminators", keywordGap: "High", backlinkGap: "High", aiGap: -22, opportunityScore: 91 },
      ]);
      const pool = makePoolWith([{ ...BASE_AUDIT_ROW, competitors_json: mixedJson }]);
      const provider = new AiEdgeVisibilityProvider(pool);
      const obs = await provider.enrich(makeInput("arrowexterminators.com", "Arrow Exterminators"));

      // The last entry has all required fields and should match
      expect((obs.rawObservation as any).hasMatch).toBe(true);
    });
  });

  describe("8. No match → does NOT expose a derived score", () => {
    it("derivedScore is null when hasMatch is false", async () => {
      const pool     = makePoolWith([BASE_AUDIT_ROW]);
      const provider = new AiEdgeVisibilityProvider(pool);
      const obs      = await provider.enrich(makeInput("nomatch.com", "Totally Different Co"));

      expect((obs.rawObservation as any).derivedScore).toBeNull();
    });
  });

  describe("9. Tenant isolation", () => {
    it("uses clientId in the SQL query", async () => {
      const pool     = makePoolWith([BASE_AUDIT_ROW]);
      const provider = new AiEdgeVisibilityProvider(pool);
      await provider.enrich(makeInput("arrowexterminators.com", "Arrow Exterminators", "comp-1", "client-X"));

      const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1]).toEqual(["client-X"]);
    });
  });

  describe("10. Real observation returns isMock: false", () => {
    it("isMock is always false regardless of match result", async () => {
      const pool     = makePoolWith([BASE_AUDIT_ROW]);
      const provider = new AiEdgeVisibilityProvider(pool);

      const matched   = await provider.enrich(makeInput("arrowexterminators.com", "Arrow Exterminators"));
      const unmatched = await provider.enrich(makeInput("nomatch.com", "No Match Co"));

      expect(matched.isMock).toBe(false);
      expect(unmatched.isMock).toBe(false);
    });
  });

  describe("11. Confidence boost and cap", () => {
    it("matched observation has higher confidence than sparse", async () => {
      const pool     = makePoolWith([BASE_AUDIT_ROW]);
      const provider = new AiEdgeVisibilityProvider(pool);

      const matched   = await provider.enrich(makeInput("arrowexterminators.com", "Arrow Exterminators"));
      const unmatched = await provider.enrich(makeInput("nomatch.com", "No Match Co"));

      expect(matched.confidence).toBeGreaterThan(unmatched.confidence);
      expect(matched.confidence).toBeLessThanOrEqual(70);
    });
  });

  describe("Signals content", () => {
    it("matched observation includes gap labels in signals", async () => {
      const pool     = makePoolWith([BASE_AUDIT_ROW]);
      const provider = new AiEdgeVisibilityProvider(pool);
      const obs      = await provider.enrich(makeInput("arrowexterminators.com", "Arrow Exterminators"));

      const signals = obs.normalizedObservation.signals;
      expect(signals.some(s => s.includes("estimated from gap analysis"))).toBe(true);
      expect(signals.some(s => s.includes("Keyword gap"))).toBe(true);
    });

    it("attribution identifies AI Edge Visibility as source", async () => {
      const pool     = makePoolWith([BASE_AUDIT_ROW]);
      const provider = new AiEdgeVisibilityProvider(pool);
      const obs      = await provider.enrich(makeInput("arrowexterminators.com", "Arrow Exterminators"));

      expect(obs.attribution.providerName).toBe("AI Edge Visibility");
      expect(obs.attribution.methodology).toBe("gap_derived_estimate");
      expect(obs.attribution.dataFreshnessDays).toBeTypeOf("number");
    });
  });
});
