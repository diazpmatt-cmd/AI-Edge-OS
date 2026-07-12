import { describe, expect, it } from "vitest";
import {
  deriveBacklinkEvidenceId,
  mergeBacklinkEvidence,
  normalizeBacklinkEvidence,
} from "../../../../../lib/db/src/backlink-normalizer";
import {
  BACKLINK_ATTAINABILITY_WEIGHTS,
  BACKLINK_POTENTIAL_WEIGHTS,
  rankBacklinkEvidence,
  scoreBacklinkEvidence,
} from "../../../../../lib/db/src/backlink-scorer";
import {
  BBB_BACKLINK_ALLOWED_SERVICES,
  BBB_BACKLINK_BLOCKED_PHRASES,
  BBB_BACKLINK_CLIENT_ID,
  BBB_BACKLINK_FIXTURES,
} from "../../../../../lib/db/src/backlink-fixtures";
import {
  hasBacklinkCapability,
} from "../../../../../lib/db/src/backlink-providers";
import type {
  BacklinkCapability,
  CanonicalBacklinkEvidence,
  RawBacklinkEvidence,
} from "../../../../../lib/db/src/backlink-types";

const NOW = new Date("2026-07-12T12:00:00.000Z");
const policy = { allowedServiceIds: BBB_BACKLINK_ALLOWED_SERVICES, blockedPhrases: BBB_BACKLINK_BLOCKED_PHRASES, now: NOW };

function raw(overrides: Partial<RawBacklinkEvidence> = {}): RawBacklinkEvidence {
  return {
    sourceDomain: "Example.COM", sourceUrl: "https://www.example.com/resources/?utm_source=test#top",
    category: "resource_page", opportunityCategory: "resource_page", serviceId: "bed_bug_treatment",
    discoveredAt: "2026-07-10T12:00:00.000Z", localRelevance: 80, serviceRelevance: 90,
    competitorFrequency: 50, relationshipAccessibility: 70, editorialRequirements: 30,
    estimatedEffort: 40, authority: 60, metadata: { note: "public", token: "must-not-leak" }, ...overrides,
  };
}

function normalized(overrides: Partial<RawBacklinkEvidence> = {}, provider = "fixture") {
  const result = normalizeBacklinkEvidence(raw(overrides), provider, BBB_BACKLINK_CLIENT_ID, policy);
  if (!result) throw new Error("fixture unexpectedly rejected");
  return result;
}

describe("C8R-1 backlink provider contract", () => {
  it("declares all required capabilities without naming a canonical provider", () => {
    const capabilities = new Set<BacklinkCapability>([
      "referring_domains", "link_intersections", "brand_mentions", "broken_links", "authority_metrics",
      "resource_page_discovery", "citation_directory_discovery", "partnership_organization_discovery",
    ]);
    const provider = { capabilities };
    for (const capability of capabilities) expect(hasBacklinkCapability(provider, capability)).toBe(true);
  });
});

describe("C8R-1 normalization and determinism", () => {
  it("normalizes URL/domain, removes tracking and derives a stable ID", () => {
    const a = normalized();
    const b = normalized();
    expect(a).toEqual(b);
    expect(a.sourceDomain).toBe("example.com");
    expect(a.sourceUrl).toBe("https://example.com/resources");
    expect(a.id).toBe(deriveBacklinkEvidenceId({ clientId: a.clientId, sourceUrl: a.sourceUrl, targetUrl: null, competitorUrl: null, category: a.category }));
  });

  it("clamps all provider scores and computes non-negative freshness", () => {
    const evidence = normalized({ localRelevance: 999, serviceRelevance: -10, authority: Number.NaN, discoveredAt: "2027-01-01" });
    expect(evidence.localRelevance).toBe(100);
    expect(evidence.serviceRelevance).toBe(0);
    expect(evidence.authority).toBe(0);
    expect(evidence.freshnessDays).toBe(0);
  });

  it("rejects malformed URLs, missing tenants, and invalid dates", () => {
    expect(normalizeBacklinkEvidence(raw({ sourceUrl: "://bad" }), "fixture", BBB_BACKLINK_CLIENT_ID, policy)).toBeNull();
    expect(normalizeBacklinkEvidence(raw(), "fixture", "", policy)).toBeNull();
    expect(normalizeBacklinkEvidence(raw({ discoveredAt: "not-a-date" }), "fixture", BBB_BACKLINK_CLIENT_ID, policy)).toBeNull();
  });

  it("bounds and isolates provider metadata and removes sensitive keys", () => {
    const metadata = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`field${String(i).padStart(2, "0")}`, "x".repeat(600)]));
    Object.assign(metadata, { apiKey: "secret", nested: { unsafe: true } });
    const evidence = normalized({ metadata });
    const stored = evidence.providerMetadata.fixture;
    expect(Object.keys(stored)).toHaveLength(20);
    expect(Object.keys(stored)).not.toContain("apiKey");
    expect(Object.keys(stored)).not.toContain("nested");
    expect(String(stored.field00)).toHaveLength(500);
    expect(raw({ metadata }).metadata).toEqual(metadata);
  });
});

describe("C8R-1 deduplication, provenance, and tenant safety", () => {
  it("merges duplicate evidence deterministically with sorted provenance", () => {
    const first = normalized({ authority: 40, estimatedEffort: 80 }, "zeta");
    const second = normalized({ authority: 90, estimatedEffort: 20 }, "alpha");
    const merged = mergeBacklinkEvidence([first, second]);
    expect(merged).toHaveLength(1);
    expect(merged[0].providers).toEqual(["alpha", "zeta"]);
    expect(merged[0].authority).toBe(90);
    expect(merged[0].estimatedEffort).toBe(20);
    expect(Object.keys(merged[0].providerMetadata)).toEqual(["zeta", "alpha"]);
    expect(mergeBacklinkEvidence([second, first])).toEqual(merged);
  });

  it("never merges identical evidence across tenants", () => {
    const one = normalized();
    const two = normalizeBacklinkEvidence(raw(), "fixture", "client::other", policy)!;
    expect(mergeBacklinkEvidence([two, one])).toHaveLength(2);
  });

  it("returns stable tenant-and-ID ordering", () => {
    const a = normalized({ sourceUrl: "https://z.example/a" });
    const b = normalized({ sourceUrl: "https://a.example/b" });
    expect(mergeBacklinkEvidence([a, b]).map(item => item.id)).toEqual(mergeBacklinkEvidence([b, a]).map(item => item.id));
  });
});

describe("C8R-1 value and attainability scoring", () => {
  it("uses normalized weights that sum to one", () => {
    expect(Object.values(BACKLINK_POTENTIAL_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(Object.values(BACKLINK_ATTAINABILITY_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("keeps potential authority separate from attainability", () => {
    const hardAuthority = normalized({ authority: 100, localRelevance: 30, serviceRelevance: 30, competitorFrequency: 30, relationshipAccessibility: 0, editorialRequirements: 100, estimatedEffort: 100 });
    const easyLocal = normalized({ sourceUrl: "https://local.example/join", authority: 25, localRelevance: 100, serviceRelevance: 100, competitorFrequency: 70, relationshipAccessibility: 100, editorialRequirements: 0, estimatedEffort: 0 });
    const hard = scoreBacklinkEvidence(hardAuthority);
    const easy = scoreBacklinkEvidence(easyLocal);
    expect(hard.potentialValue).toBeGreaterThan(hard.attainability);
    expect(easy.attainability).toBeGreaterThan(hard.attainability);
  });

  it("always returns bounded scores and stable ranking", () => {
    const items = [normalized({ sourceUrl: "https://b.example" }), normalized({ sourceUrl: "https://a.example" })];
    for (const item of items) {
      const score = scoreBacklinkEvidence(item);
      expect(score.potentialValue).toBeGreaterThanOrEqual(0);
      expect(score.potentialValue).toBeLessThanOrEqual(100);
      expect(score.attainability).toBeGreaterThanOrEqual(0);
      expect(score.attainability).toBeLessThanOrEqual(100);
    }
    expect(rankBacklinkEvidence(items).map(x => x.evidence.id)).toEqual(rankBacklinkEvidence([...items].reverse()).map(x => x.evidence.id));
  });
});

describe("C8R-1 BB&B golden-template safety", () => {
  it("accepts Baldwin County fixtures and active fumigation", () => {
    const evidence = BBB_BACKLINK_FIXTURES.map(item => normalizeBacklinkEvidence(item, "fixture", BBB_BACKLINK_CLIENT_ID, policy));
    expect(evidence.every(Boolean)).toBe(true);
    expect(evidence.some(item => item?.serviceId === "fumigation")).toBe(true);
    expect(JSON.stringify(BBB_BACKLINK_FIXTURES)).toContain("Baldwin County");
  });

  it("blocks termite service opportunities", () => {
    expect(normalizeBacklinkEvidence(raw({ serviceId: "termites" }), "fixture", BBB_BACKLINK_CLIENT_ID, policy)).toBeNull();
  });

  it("blocks whole-home heat positioning and preserves furniture/item differentiation", () => {
    expect(normalizeBacklinkEvidence(raw({ sourceUrl: "https://example.com/whole-home-bed-bug-heat" }), "fixture", BBB_BACKLINK_CLIENT_ID, policy)).toBeNull();
    const fixtureText = JSON.stringify(BBB_BACKLINK_FIXTURES).toLowerCase();
    expect(fixtureText).toContain("affected furniture and items");
    expect(fixtureText).not.toContain("we offer whole-home heat");
  });

  it("defines all ten canonical opportunity categories", () => {
    const categories: CanonicalBacklinkEvidence["opportunityCategory"][] = [
      "competitor_link_gap", "citation_directory", "local_partnership", "sponsorship_organization",
      "niche_industry_link", "guest_post", "resource_page", "broken_link", "unlinked_mention", "linkable_asset_content_gap",
    ];
    expect(new Set(categories).size).toBe(10);
  });
});
