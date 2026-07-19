/**
 * Phase 5: Provider Intelligence Foundation — focused tests
 *
 * Test scope:
 *  A. Provider output shape — each mock provider returns a correctly-shaped
 *     ProviderObservation<T> with all required fields and valid values.
 *  B. Determinism — same domain always returns the same score/signals.
 *  C. seededInt bounds — helper stays within [min, max].
 *  D. Registry — duplicate registration throws; getByCategory filters correctly.
 *  E. Enrichment service — orchestrates 5 providers, returns 5 summaries.
 *  F. ProviderObservationSummary shape — every summary has score, signals,
 *     isMock, category, observedAt, and attribution.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "@workspace/db";
import { EnrichmentProviderRegistry } from "@workspace/db";
import type {
  ProviderObservationSummary,
  ObservationCategory,
} from "@workspace/db";
import {
  MockWebsiteIntelProvider,
  MockLocalPresenceProvider,
  MockReviewsProvider,
  MockAuthorityProvider,
  MockAiVisibilityProvider,
  ALL_MOCK_PROVIDERS,
  seededInt,
  seededBool,
} from "../lib/competitor-mock-providers.js";
import {
  CompetitorEnrichmentService,
  createEnrichmentService,
  ENRICHMENT_CATEGORIES,
} from "../lib/competitor-enrichment-service.js";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const TEST_CLIENT  = "obs-test-client";
const TEST_COMP_ID = "00000000-0000-0000-0000-000000000099";
const TEST_DOMAIN  = "pestpro.example.com";

const baseInput = {
  clientId:     TEST_CLIENT,
  competitorId: TEST_COMP_ID,
  domain:       TEST_DOMAIN,
  existingData: {},
};

// ── A: Provider output shape ──────────────────────────────────────────────────

describe("Mock provider — output shape", () => {
  const providers = [
    new MockWebsiteIntelProvider(),
    new MockLocalPresenceProvider(),
    new MockReviewsProvider(),
    new MockAuthorityProvider(),
    new MockAiVisibilityProvider(),
  ];

  for (const provider of providers) {
    it(`${provider.providerId} returns a valid ProviderObservation`, async () => {
      const obs = await provider.enrich(baseInput);

      // Top-level required fields
      expect(typeof obs.id).toBe("string");
      expect(obs.id.length).toBeGreaterThan(0);
      expect(obs.clientId).toBe(TEST_CLIENT);
      expect(obs.competitorId).toBe(TEST_COMP_ID);
      expect(obs.domain).toBe(TEST_DOMAIN);
      expect(obs.category).toBe(provider.category);
      expect(obs.providerId).toBe(provider.providerId);
      expect(obs.observedAt).toBeInstanceOf(Date);
      expect(obs.confidence).toBeGreaterThanOrEqual(0);
      expect(obs.confidence).toBeLessThanOrEqual(100);
      expect(obs.isMock).toBe(true);

      // Normalized payload always has score + signals
      const norm = obs.normalizedObservation as { score: number; signals: string[] };
      expect(typeof norm.score).toBe("number");
      expect(norm.score).toBeGreaterThanOrEqual(0);
      expect(norm.score).toBeLessThanOrEqual(100);
      expect(Array.isArray(norm.signals)).toBe(true);
      expect(norm.signals.length).toBeGreaterThan(0);
      norm.signals.forEach(s => expect(typeof s).toBe("string"));

      // Attribution
      expect(typeof obs.attribution.providerName).toBe("string");
      expect(typeof obs.attribution.providerVersion).toBe("string");
      expect(typeof obs.attribution.methodology).toBe("string");
    });
  }
});

// ── B: Determinism ────────────────────────────────────────────────────────────

describe("Mock provider — determinism", () => {
  it("same domain returns identical score across calls", async () => {
    const p = new MockWebsiteIntelProvider();
    const a = await p.enrich(baseInput);
    const b = await p.enrich(baseInput);
    const normA = a.normalizedObservation as { score: number };
    const normB = b.normalizedObservation as { score: number };
    expect(normA.score).toBe(normB.score);
  });

  it("different domains return different scores (high probability)", async () => {
    const p = new MockWebsiteIntelProvider();
    const domains = [
      "alpha.example.com", "beta.example.com", "gamma.example.com",
      "delta.example.com", "epsilon.example.com",
    ];
    const scores = await Promise.all(
      domains.map(d => p.enrich({ ...baseInput, domain: d })
        .then(o => (o.normalizedObservation as { score: number }).score)),
    );
    const unique = new Set(scores);
    // Expect at least 3 distinct scores out of 5 domains
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });
});

// ── C: seededInt bounds ───────────────────────────────────────────────────────

describe("seededInt helper", () => {
  it("stays within [min, max] for many domains", () => {
    const domains = Array.from({ length: 50 }, (_, i) => `domain${i}.com`);
    for (const d of domains) {
      for (let salt = 0; salt < 5; salt++) {
        const v = seededInt(d, salt, 10, 90);
        expect(v).toBeGreaterThanOrEqual(10);
        expect(v).toBeLessThanOrEqual(90);
      }
    }
  });

  it("seededBool returns only true or false", () => {
    const domains = Array.from({ length: 20 }, (_, i) => `test${i}.com`);
    for (const d of domains) {
      expect(typeof seededBool(d, 1)).toBe("boolean");
    }
  });
});

// ── D: Provider registry ──────────────────────────────────────────────────────

describe("EnrichmentProviderRegistry", () => {
  it("registers and retrieves providers by category", () => {
    const reg = new EnrichmentProviderRegistry();
    for (const p of ALL_MOCK_PROVIDERS) reg.register(p);

    expect(reg.size).toBe(5);

    const webProviders = reg.getByCategory("website_intel");
    expect(webProviders).toHaveLength(1);
    expect(webProviders[0].providerId).toBe("mock_website_intel");

    const allCats: ObservationCategory[] = [
      "website_intel", "local_presence", "reviews", "authority", "ai_visibility",
    ];
    for (const cat of allCats) {
      expect(reg.getByCategory(cat)).toHaveLength(1);
    }
  });

  it("throws on duplicate registration", () => {
    const reg = new EnrichmentProviderRegistry();
    reg.register(new MockWebsiteIntelProvider());
    expect(() => reg.register(new MockWebsiteIntelProvider())).toThrow(
      /already registered/,
    );
  });

  it("getAll returns only active providers", () => {
    const reg = new EnrichmentProviderRegistry();
    for (const p of ALL_MOCK_PROVIDERS) reg.register(p);
    const active = reg.getAll();
    expect(active.length).toBe(5);
    active.forEach(p => expect(p.active).toBe(true));
  });
});

// ── E + F: Enrichment service ─────────────────────────────────────────────────

describe("CompetitorEnrichmentService", () => {
  let service: CompetitorEnrichmentService;

  beforeAll(() => {
    service = createEnrichmentService();
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM competitor_observations WHERE client_id = $1`,
      [TEST_CLIENT],
    );
  });

  it("returns one summary per enrichment category", async () => {
    const summaries = await service.enrichCompetitor(
      TEST_CLIENT, TEST_COMP_ID, TEST_DOMAIN,
    );

    expect(summaries).toHaveLength(ENRICHMENT_CATEGORIES.length);

    const returnedCats = summaries.map(s => s.category).sort();
    const expectedCats = [...ENRICHMENT_CATEGORIES].sort();
    expect(returnedCats).toEqual(expectedCats);
  });

  it("every summary has required ProviderObservationSummary shape", async () => {
    const summaries = await service.enrichCompetitor(
      TEST_CLIENT, TEST_COMP_ID, TEST_DOMAIN,
    );

    for (const s of summaries) {
      expect(typeof s.category).toBe("string");
      expect(typeof s.providerId).toBe("string");
      expect(typeof s.providerName).toBe("string");
      expect(typeof s.observedAt).toBe("string");
      expect(new Date(s.observedAt).getTime()).not.toBeNaN();
      expect(typeof s.confidence).toBe("number");
      expect(typeof s.score).toBe("number");
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
      expect(Array.isArray(s.signals)).toBe(true);
      expect(s.signals.length).toBeGreaterThan(0);
      expect(s.isMock).toBe(true);
      expect(typeof s.attribution.providerName).toBe("string");
      expect(typeof s.attribution.methodology).toBe("string");
      expect(typeof s.normalized).toBe("object");
    }
  });

  it("second call returns cached summaries (isMock still true)", async () => {
    const first  = await service.enrichCompetitor(TEST_CLIENT, TEST_COMP_ID, TEST_DOMAIN);
    const second = await service.enrichCompetitor(TEST_CLIENT, TEST_COMP_ID, TEST_DOMAIN);

    expect(second).toHaveLength(first.length);
    for (const s of second) {
      expect(s.isMock).toBe(true);
    }
    // Scores should be identical (deterministic mock)
    const firstScores  = first.map(s => s.score).sort((a, b) => a - b);
    const secondScores = second.map(s => s.score).sort((a, b) => a - b);
    expect(firstScores).toEqual(secondScores);
  });
});
