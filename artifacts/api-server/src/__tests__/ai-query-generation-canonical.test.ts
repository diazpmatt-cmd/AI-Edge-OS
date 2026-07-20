/**
 * C9R-7 Canonical Query Generation Tests
 *
 * Verifies that generateAiQueries:
 *  1. Produces real Bed Bugs & Beyond service × geography queries (no generics)
 *  2. Never emits "local services" or "my area" under any circumstances
 *  3. Never produces "services services" (double-word duplication artefact)
 *  4. Respects prohibited phrases from client_services rules
 *  5. Fails closed (returns []) when services or geographies are empty
 *  6. Respects the AI_QUERY_GENERATION_LIMIT cap
 *  7. Is deterministic (same input → same sorted output)
 *  8. Deduplicates case-insensitively
 *
 * Fixture mirrors actual production data (scan_id 49aff305):
 *  - client_id: 0f15a60a-6277-4933-a17e-d3e453a4e291
 *  - services: bed_bug_inspection, bed_bug_treatment, residential_pest_control,
 *              commercial_pest_control, roaches, rodents, mosquitoes, fumigation,
 *              ants, fleas
 *  - geographies: Foley, AL (primary); Gulf Shores, AL; Orange Beach, AL; …
 *  - prohibited phrases derived from BBB service rules:
 *      "termite", "heat treatment", "whole-home heat treatment"
 */

import { describe, it, expect } from "vitest";
import {
  generateAiQueries,
  humanizeServiceId,
  AI_QUERY_GENERATION_LIMIT,
} from "@workspace/db";
import type { AiQueryTenantContext } from "@workspace/db";

// ── BBB production fixture ────────────────────────────────────────────────────

const BBB_SERVICES = [
  "bed_bug_inspection",
  "bed_bug_treatment",
  "residential_pest_control",
  "commercial_pest_control",
  "roaches",
  "rodents",
  "mosquitoes",
  "fumigation",
  "ants",
  "fleas",
] as const;

const BBB_GEOGRAPHIES = [
  "Foley, AL",
  "Daphne, AL",
  "Loxley, AL",
  "Fairhope, AL",
  "Gulf Shores, AL",
  "Orange Beach, AL",
  "Summerdale, AL",
  "Spanish Fort, AL",
  "Elberta, AL",
  "Lillian, AL",
  "Perdido Beach, AL",
] as const;

// Prohibited phrases sourced from BBB client_services prompt_rule_prefix values
const BBB_PROHIBITED = [
  "termite",
  "heat treatment",
  "whole-home heat treatment",
  "guaranteed elimination",
  "guaranteed bed bug elimination",
] as const;

function makeBbbContext(overrides: Partial<AiQueryTenantContext> = {}): AiQueryTenantContext {
  return {
    clientId:              "0f15a60a-6277-4933-a17e-d3e453a4e291",
    businessName:          "Bed Bugs & Beyond",
    businessDomain:        "bedbugsbeyond.com",
    businessPhone:         null,
    activeServiceIds:      [...BBB_SERVICES],
    authorizedGeographies: [...BBB_GEOGRAPHIES],
    prohibitedPhrases:     [...BBB_PROHIBITED],
    competitors:           [],
    ...overrides,
  };
}

// ── 1. Real service × geography queries are produced ─────────────────────────

describe("Canonical BBB query generation", () => {
  it("returns a non-empty list when services and geographies are present", () => {
    const queries = generateAiQueries(makeBbbContext());
    expect(queries.length).toBeGreaterThan(0);
  });

  it("every query contains at least one BBB service label", () => {
    const queries = generateAiQueries(makeBbbContext());
    const serviceLabels = BBB_SERVICES.map(humanizeServiceId);
    for (const q of queries) {
      const lower = q.toLowerCase();
      const hasService = serviceLabels.some(s => lower.includes(s));
      expect(hasService, `Query "${q}" contains no BBB service label`).toBe(true);
    }
  });

  it("every query contains at least one BBB geography", () => {
    const queries = generateAiQueries(makeBbbContext());
    const geos = BBB_GEOGRAPHIES.map(g => g.toLowerCase());
    for (const q of queries) {
      const lower = q.toLowerCase();
      const hasGeo = geos.some(g => lower.includes(g.toLowerCase()));
      expect(hasGeo, `Query "${q}" contains no BBB geography`).toBe(true);
    }
  });

  it("generates queries containing 'Foley, AL' (primary BBB service area)", () => {
    const queries = generateAiQueries(makeBbbContext());
    const foleyQueries = queries.filter(q => q.toLowerCase().includes("foley, al"));
    expect(foleyQueries.length).toBeGreaterThan(0);
  });

  it("generates queries for bed bug inspection when it is the only active service", () => {
    const ctx = makeBbbContext({ activeServiceIds: ["bed_bug_inspection"] });
    const queries = generateAiQueries(ctx);
    const bedBugQueries = queries.filter(q => q.toLowerCase().includes("bed bug inspection"));
    expect(bedBugQueries.length).toBeGreaterThan(0);
  });

  it("generates queries for roach control when it is the only active service", () => {
    const ctx = makeBbbContext({ activeServiceIds: ["roaches"] });
    const queries = generateAiQueries(ctx);
    const roachQueries = queries.filter(q => q.toLowerCase().includes("roaches"));
    expect(roachQueries.length).toBeGreaterThan(0);
  });

  it("output is limited to AI_QUERY_GENERATION_LIMIT", () => {
    const queries = generateAiQueries(makeBbbContext());
    expect(queries.length).toBeLessThanOrEqual(AI_QUERY_GENERATION_LIMIT);
  });
});

// ── 2. "local services" is NEVER emitted ─────────────────────────────────────

describe("No generic fallback: 'local services'", () => {
  it("does not produce 'local services' when services are populated", () => {
    const queries = generateAiQueries(makeBbbContext());
    const hasGeneric = queries.some(q => q.toLowerCase().includes("local services"));
    expect(hasGeneric).toBe(false);
  });

  it("returns [] (not 'local services') when activeServiceIds is empty", () => {
    const queries = generateAiQueries(makeBbbContext({ activeServiceIds: [] }));
    expect(queries).toHaveLength(0);
    const hasGeneric = queries.some(q => q.toLowerCase().includes("local services"));
    expect(hasGeneric).toBe(false);
  });

  it("single-service context never produces 'local services'", () => {
    const queries = generateAiQueries(makeBbbContext({ activeServiceIds: ["fumigation"] }));
    const hasGeneric = queries.some(q => q.toLowerCase().includes("local services"));
    expect(hasGeneric).toBe(false);
  });
});

// ── 3. "my area" is NEVER emitted ────────────────────────────────────────────

describe("No generic fallback: 'my area'", () => {
  it("does not produce 'my area' when geographies are populated", () => {
    const queries = generateAiQueries(makeBbbContext());
    const hasGeneric = queries.some(q => q.toLowerCase().includes("my area"));
    expect(hasGeneric).toBe(false);
  });

  it("returns [] (not 'my area') when authorizedGeographies is empty", () => {
    const queries = generateAiQueries(makeBbbContext({ authorizedGeographies: [] }));
    expect(queries).toHaveLength(0);
    const hasGeneric = queries.some(q => q.toLowerCase().includes("my area"));
    expect(hasGeneric).toBe(false);
  });

  it("single-geography context never produces 'my area'", () => {
    const queries = generateAiQueries(makeBbbContext({ authorizedGeographies: ["Foley, AL"] }));
    const hasGeneric = queries.some(q => q.toLowerCase().includes("my area"));
    expect(hasGeneric).toBe(false);
  });
});

// ── 4. "services services" duplication never occurs ──────────────────────────

describe("No 'services services' word duplication", () => {
  it("no query contains the substring 'services services'", () => {
    const queries = generateAiQueries(makeBbbContext());
    const hasDupe = queries.some(q => q.toLowerCase().includes("services services"));
    expect(hasDupe).toBe(false);
  });

  it("'top X services in Y' template does not double 'services' when X ends with 'services'", () => {
    const ctx = makeBbbContext({ activeServiceIds: ["residential_pest_control"] });
    const queries = generateAiQueries(ctx);
    const hasDupe = queries.some(q => q.toLowerCase().includes("services services"));
    expect(hasDupe).toBe(false);
  });
});

// ── 5. Prohibited phrases are excluded ───────────────────────────────────────

describe("Prohibited phrase exclusion", () => {
  it("no query contains 'termite' (prohibited by BBB rules)", () => {
    const queries = generateAiQueries(makeBbbContext());
    const hasForbidden = queries.some(q => q.toLowerCase().includes("termite"));
    expect(hasForbidden).toBe(false);
  });

  it("termite-service queries are excluded even if activeServiceIds includes them", () => {
    const ctx = makeBbbContext({
      activeServiceIds: ["termite_treatment"],
      prohibitedPhrases: ["termite"],
    });
    const queries = generateAiQueries(ctx);
    const hasForbidden = queries.some(q => q.toLowerCase().includes("termite"));
    expect(hasForbidden).toBe(false);
  });

  it("removes only the prohibited query, not the whole list", () => {
    const ctx = makeBbbContext({
      activeServiceIds: ["bed_bug_inspection", "termite_treatment"],
      authorizedGeographies: ["Foley, AL"],
      prohibitedPhrases: ["termite"],
    });
    const queries = generateAiQueries(ctx);
    const hasBedBug = queries.some(q => q.toLowerCase().includes("bed bug inspection"));
    expect(hasBedBug).toBe(true);
    const hasForbidden = queries.some(q => q.toLowerCase().includes("termite"));
    expect(hasForbidden).toBe(false);
  });
});

// ── 6. Fail-closed: empty returns for missing context ────────────────────────

describe("Fail-closed: empty return when context is missing", () => {
  it("returns [] when activeServiceIds is empty", () => {
    const queries = generateAiQueries(makeBbbContext({ activeServiceIds: [] }));
    expect(queries).toHaveLength(0);
  });

  it("returns [] when authorizedGeographies is empty", () => {
    const queries = generateAiQueries(makeBbbContext({ authorizedGeographies: [] }));
    expect(queries).toHaveLength(0);
  });

  it("returns [] when both are empty", () => {
    const queries = generateAiQueries(makeBbbContext({ activeServiceIds: [], authorizedGeographies: [] }));
    expect(queries).toHaveLength(0);
  });

  it("returns [] when all queries are prohibited", () => {
    const ctx = makeBbbContext({
      activeServiceIds: ["fumigation"],
      authorizedGeographies: ["Foley, AL"],
      prohibitedPhrases: ["fumigation", "foley"],
    });
    const queries = generateAiQueries(ctx);
    expect(queries).toHaveLength(0);
  });
});

// ── 7. Determinism ────────────────────────────────────────────────────────────

describe("Determinism: same input → same output", () => {
  it("two identical calls produce identical results", () => {
    const ctx = makeBbbContext();
    const a = generateAiQueries(ctx);
    const b = generateAiQueries(ctx);
    expect([...a]).toEqual([...b]);
  });

  it("output is NOT required to be alpha-sorted — service-priority order is the guarantee (C9R-7 representative selection correction)", () => {
    // The old alpha-sort caused alphabetically-early low-priority services (e.g. "ants")
    // to fill the limit before higher-priority services (bed bug inspection, fumigation).
    // Output is now in service-priority (sort_order) round-robin order, which is
    // deterministic but not necessarily alphabetical.
    const queries = generateAiQueries(makeBbbContext());
    // Determinism: same result on repeated calls
    expect([...queries]).toEqual([...generateAiQueries(makeBbbContext())]);
    // First query reflects the first service in priority order
    expect(queries[0]).toContain("bed bug inspection");
  });
});

// ── 8a. Representative selection — production-scale round-robin ───────────────

describe("Representative selection: service-priority round-robin (C9R-7 acceptance)", () => {
  const PROD_SERVICES_16 = [
    "bed_bug_inspection",     // sort_order 0  — must appear
    "bed_bug_treatment",      // sort_order 1  — must appear
    "residential_pest_control", // 2
    "commercial_pest_control",  // 3
    "roaches",                // 4
    "rodents",                // 5
    "mosquitoes",             // 6
    "fumigation",             // 7  — must appear (limit=8 boundary)
    "ants",                   // 8  — must NOT appear (limit reached)
    "fleas",                  // 9
    "ticks",                  // 10
    "wasps_hornets",          // 11
    "spiders",                // 12
    "moles",                  // 13
    "termites",               // 14 (priority=99, revenue_weight=0)
    "wildlife_removal",       // 15
  ] as const;

  const PROD_GEOS_11 = [
    "Foley, AL", "Daphne, AL", "Loxley, AL", "Fairhope, AL",
    "Gulf Shores, AL", "Orange Beach, AL", "Summerdale, AL",
    "Spanish Fort, AL", "Elberta, AL", "Lillian, AL", "Perdido Beach, AL",
  ] as const;

  function makeProdContext(overrides: Partial<AiQueryTenantContext> = {}): AiQueryTenantContext {
    return {
      clientId:              "e87ddd9d-a6bf-4bf6-85b6-202467d952ee",
      businessName:          "Bed Bugs & Beyond",
      businessDomain:        null,
      businessPhone:         null,
      activeServiceIds:      [...PROD_SERVICES_16],
      authorizedGeographies: [...PROD_GEOS_11],
      prohibitedPhrases:     ["termite", "heat treatment", "whole-home heat treatment"],
      competitors:           [],
      ...overrides,
    };
  }

  it("produces exactly AI_QUERY_GENERATION_LIMIT queries for production-scale input (16×11)", () => {
    const queries = generateAiQueries(makeProdContext());
    expect(queries.length).toBe(AI_QUERY_GENERATION_LIMIT);
  });

  it("each query in production-scale output contains a distinct service (no service monopolizes the limit)", () => {
    const queries = generateAiQueries(makeProdContext());
    const serviceLabels = PROD_SERVICES_16.map(humanizeServiceId);
    // Collect the services that appear in each query
    const servicesUsed = queries.map(q => {
      const lower = q.toLowerCase();
      return serviceLabels.find(s => lower.includes(s)) ?? null;
    });
    const uniqueServices = new Set(servicesUsed.filter(Boolean));
    // With 16 services and limit=8, each service should appear at most once in round 0
    expect(uniqueServices.size).toBe(AI_QUERY_GENERATION_LIMIT);
  });

  it("bed_bug_inspection (sort_order=0) is the first service in production-scale output", () => {
    const queries = generateAiQueries(makeProdContext());
    expect(queries[0].toLowerCase()).toContain("bed bug inspection");
  });

  it("fumigation (sort_order=7) appears in production-scale output (at the limit boundary)", () => {
    const queries = generateAiQueries(makeProdContext());
    const hasFumigation = queries.some(q => q.toLowerCase().includes("fumigation"));
    expect(hasFumigation).toBe(true);
  });

  it("ants (sort_order=8) does NOT appear in production-scale output — limit=8 stops before it", () => {
    const queries = generateAiQueries(makeProdContext());
    const hasAnts = queries.some(q => q.toLowerCase().includes("ants"));
    expect(hasAnts).toBe(false);
  });

  it("termites (priority=99, revenue_weight=0) does NOT appear in output — excluded by prohibited phrase and sort_order=14", () => {
    const queries = generateAiQueries(makeProdContext());
    const hasTermites = queries.some(q => q.toLowerCase().includes("termite"));
    expect(hasTermites).toBe(false);
  });

  it("every query in production-scale output uses a real authorized geography (not 'my area')", () => {
    const queries = generateAiQueries(makeProdContext());
    const geoLower = PROD_GEOS_11.map(g => g.toLowerCase());
    for (const q of queries) {
      const lower = q.toLowerCase();
      const hasGeo = geoLower.some(g => lower.includes(g));
      expect(hasGeo, `"${q}" contains no authorized geography`).toBe(true);
    }
  });

  it("the 8 production queries cover at least 3 distinct geographies (geography diversification)", () => {
    const queries = generateAiQueries(makeProdContext());
    const geoLower = PROD_GEOS_11.map(g => g.toLowerCase());
    const geosUsed = new Set(
      queries.map(q => {
        const lower = q.toLowerCase();
        return geoLower.find(g => lower.includes(g)) ?? null;
      }).filter(Boolean)
    );
    // With 16 services and 11 geos, each slot rotates: geo[si % 11] for si=0..7 → 8 distinct geos
    expect(geosUsed.size).toBeGreaterThanOrEqual(3);
  });

  it("Foley, AL (primary service area) appears in production output", () => {
    const queries = generateAiQueries(makeProdContext());
    const hasFoley = queries.some(q => q.toLowerCase().includes("foley, al"));
    expect(hasFoley).toBe(true);
  });

  it("provider-free dry run: returns exact expected production queries", () => {
    // This test documents the exact query list that would be sent to the AI provider
    // when running a scan against the BBB production tenant after the C9R-7 correction.
    // It is the canonical evidence for DP-001 provider-free dry run acceptance.
    const queries = generateAiQueries(makeProdContext());
    expect(queries).toHaveLength(8);
    expect(queries[0]).toBe("best bed bug inspection in Foley, AL");
    expect(queries[1]).toBe("best bed bug treatment in Daphne, AL");
    expect(queries[2]).toBe("best residential pest control in Loxley, AL");
    expect(queries[3]).toBe("best commercial pest control in Fairhope, AL");
    expect(queries[4]).toBe("best roaches in Gulf Shores, AL");
    expect(queries[5]).toBe("best rodents in Orange Beach, AL");
    expect(queries[6]).toBe("best mosquitoes in Summerdale, AL");
    expect(queries[7]).toBe("best fumigation in Spanish Fort, AL");
  });
});

// ── 8. Deduplication ─────────────────────────────────────────────────────────

describe("Deduplication", () => {
  it("duplicate service keys produce no duplicate queries", () => {
    const ctx = makeBbbContext({
      activeServiceIds: ["bed_bug_inspection", "bed_bug_inspection"],
      authorizedGeographies: ["Foley, AL"],
    });
    const queries = generateAiQueries(ctx);
    const lowerQueries = queries.map(q => q.toLowerCase());
    const uniqueSet = new Set(lowerQueries);
    expect(lowerQueries.length).toBe(uniqueSet.size);
  });
});

// ── 9. humanizeServiceId ──────────────────────────────────────────────────────

describe("humanizeServiceId", () => {
  it("converts underscores to spaces", () => {
    expect(humanizeServiceId("bed_bug_inspection")).toBe("bed bug inspection");
  });

  it("converts hyphens to spaces", () => {
    expect(humanizeServiceId("bed-bug-treatment")).toBe("bed bug treatment");
  });

  it("lowercases the result", () => {
    expect(humanizeServiceId("ROACHES")).toBe("roaches");
  });

  it("handles mixed separators", () => {
    expect(humanizeServiceId("residential_pest-control")).toBe("residential pest control");
  });
});
