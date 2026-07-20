/**
 * C9R-4 behavioral tests for pure AI query functions.
 * No external dependencies — all pure functions under test.
 */

import { describe, it, expect } from "vitest";
import {
  generateAiQueries,
  humanizeServiceId,
  AI_QUERY_GENERATION_LIMIT,
} from "@workspace/db";
import {
  detectBusinessMention,
  detectCompetitorMentions,
  extractCitations,
} from "@workspace/db";
import { adaptAiQuerySources } from "@workspace/db";
import type { AiQueryTenantContext } from "@workspace/db";
import type { AiQueryAdapterInput } from "@workspace/db";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BBB_CONTEXT: AiQueryTenantContext = {
  clientId: "client-bbb-001",
  businessName: "Bed Bugs & Beyond",
  businessDomain: "bedbugsbeyond.com",
  businessPhone: "(251) 555-0100",
  activeServiceIds: ["bed-bug-treatment", "pest-control"],
  authorizedGeographies: ["Foley, AL", "Mobile, AL"],
  competitors: [
    { name: "Havard Pest Control", domain: "havardpest.com" },
    { name: "Knox Pest Control", domain: null },
  ],
  prohibitedPhrases: ["termite", "whole-home heat treatment"],
};

// ── generateAiQueries ─────────────────────────────────────────────────────────

describe("generateAiQueries", () => {
  it("returns a frozen array", () => {
    const queries = generateAiQueries(BBB_CONTEXT);
    expect(Object.isFrozen(queries)).toBe(true);
  });

  it("caps at AI_QUERY_GENERATION_LIMIT", () => {
    const ctx: AiQueryTenantContext = {
      ...BBB_CONTEXT,
      activeServiceIds: ["s1", "s2", "s3", "s4", "s5"],
      authorizedGeographies: ["City A", "City B", "City C"],
    };
    const queries = generateAiQueries(ctx);
    expect(queries.length).toBeLessThanOrEqual(AI_QUERY_GENERATION_LIMIT);
  });

  it("filters prohibited phrases (case-insensitive)", () => {
    const queries = generateAiQueries(BBB_CONTEXT);
    for (const q of queries) {
      expect(q.toLowerCase()).not.toContain("termite");
      expect(q.toLowerCase()).not.toContain("whole-home heat treatment");
    }
  });

  it("produces deterministic output", () => {
    const a = generateAiQueries(BBB_CONTEXT);
    const b = generateAiQueries(BBB_CONTEXT);
    expect([...a]).toEqual([...b]);
  });

  it("output is sorted lexicographically", () => {
    const queries = generateAiQueries(BBB_CONTEXT);
    const sorted = [...queries].sort();
    expect([...queries]).toEqual(sorted);
  });

  it("returns [] (not 'local services') when no services configured — fail-closed (C9R-7 correction)", () => {
    const ctx: AiQueryTenantContext = { ...BBB_CONTEXT, activeServiceIds: [] };
    const queries = generateAiQueries(ctx);
    expect(queries).toHaveLength(0);
    expect(queries.some(q => q.includes("local services"))).toBe(false);
  });

  it("returns [] (not 'my area') when no geographies configured — fail-closed (C9R-7 correction)", () => {
    const ctx: AiQueryTenantContext = { ...BBB_CONTEXT, authorizedGeographies: [] };
    const queries = generateAiQueries(ctx);
    expect(queries).toHaveLength(0);
    expect(queries.some(q => q.includes("my area"))).toBe(false);
  });

  it("deduplicates identical queries", () => {
    const ctx: AiQueryTenantContext = {
      ...BBB_CONTEXT,
      activeServiceIds: ["pest-control", "pest-control"],
      authorizedGeographies: ["Foley, AL"],
    };
    const queries = generateAiQueries(ctx);
    const unique = new Set(queries.map(q => q.toLowerCase()));
    expect(queries.length).toBe(unique.size);
  });
});

// ── humanizeServiceId ─────────────────────────────────────────────────────────

describe("humanizeServiceId", () => {
  it("converts hyphens to spaces", () => {
    expect(humanizeServiceId("bed-bug-treatment")).toBe("bed bug treatment");
  });

  it("converts underscores to spaces", () => {
    expect(humanizeServiceId("pest_control")).toBe("pest control");
  });

  it("lowercases the result", () => {
    expect(humanizeServiceId("Pest-Control")).toBe("pest control");
  });
});

// ── detectBusinessMention ─────────────────────────────────────────────────────

describe("detectBusinessMention", () => {
  it("detects exact business name match", () => {
    const result = detectBusinessMention(
      "We recommend Bed Bugs & Beyond for bed bug treatment in Foley.",
      BBB_CONTEXT,
    );
    expect(result.mentioned).toBe(true);
    expect(result.mentionType).toBe("exact");
    expect(result.position).toBeGreaterThanOrEqual(0);
  });

  it("detects case-insensitive exact match", () => {
    const result = detectBusinessMention(
      "bed bugs & beyond is a great option.",
      BBB_CONTEXT,
    );
    expect(result.mentioned).toBe(true);
    expect(result.mentionType).toBe("exact");
  });

  it("detects normalised name match (ampersand → and)", () => {
    const result = detectBusinessMention(
      "Bed Bugs and Beyond is well-reviewed.",
      BBB_CONTEXT,
    );
    expect(result.mentioned).toBe(true);
    expect(result.mentionType).toMatch(/^(exact|normalized)$/);
  });

  it("detects domain match", () => {
    const result = detectBusinessMention(
      "Visit bedbugsbeyond.com for a free quote.",
      BBB_CONTEXT,
    );
    expect(result.mentioned).toBe(true);
    expect(result.mentionType).toBe("domain");
  });

  it("detects phone match — formatted (251) style", () => {
    const result = detectBusinessMention(
      "Call (251) 555-0100 to book.",
      BBB_CONTEXT,
    );
    expect(result.mentioned).toBe(true);
    expect(result.mentionType).toBe("phone");
  });

  it("returns not mentioned when business absent", () => {
    const result = detectBusinessMention(
      "Havard Pest Control is the top option in Foley.",
      BBB_CONTEXT,
    );
    expect(result.mentioned).toBe(false);
    expect(result.mentionType).toBe("none");
    expect(result.position).toBeNull();
  });

  it("returns not mentioned for empty response", () => {
    const result = detectBusinessMention("", BBB_CONTEXT);
    expect(result.mentioned).toBe(false);
  });

  it("prioritises exact over domain match", () => {
    const result = detectBusinessMention(
      "Bed Bugs & Beyond (bedbugsbeyond.com) is the top pick.",
      BBB_CONTEXT,
    );
    expect(result.mentionType).toBe("exact");
  });

  it("returns not mentioned when domain is null and no name found", () => {
    const ctx: AiQueryTenantContext = { ...BBB_CONTEXT, businessDomain: null, businessPhone: null };
    const result = detectBusinessMention("Some other business is here.", ctx);
    expect(result.mentioned).toBe(false);
  });
});

// ── detectCompetitorMentions ──────────────────────────────────────────────────

describe("detectCompetitorMentions", () => {
  it("detects competitor by exact name", () => {
    const result = detectCompetitorMentions(
      "In Foley, Havard Pest Control is often recommended.",
      BBB_CONTEXT,
    );
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Havard Pest Control");
    expect(result[0].mentionType).toBe("exact");
  });

  it("detects competitor by domain", () => {
    const result = detectCompetitorMentions(
      "Check havardpest.com for quotes.",
      BBB_CONTEXT,
    );
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Havard Pest Control");
    expect(result[0].mentionType).toBe("domain");
  });

  it("detects multiple competitors", () => {
    const result = detectCompetitorMentions(
      "Both Havard Pest Control and Knox Pest Control operate in Foley.",
      BBB_CONTEXT,
    );
    expect(result.length).toBe(2);
  });

  it("returns empty array when no competitors found", () => {
    const result = detectCompetitorMentions(
      "We recommend local professionals for any service.",
      BBB_CONTEXT,
    );
    expect(result.length).toBe(0);
  });

  it("returns frozen array", () => {
    const result = detectCompetitorMentions("no match", BBB_CONTEXT);
    expect(Object.isFrozen(result)).toBe(true);
  });
});

// ── extractCitations ──────────────────────────────────────────────────────────

describe("extractCitations", () => {
  it("extracts a single HTTPS URL", () => {
    const result = extractCitations("Visit https://havardpest.com for more info.");
    expect(result.length).toBe(1);
    expect(result[0].url).toBe("https://havardpest.com");
    expect(result[0].domain).toBe("havardpest.com");
  });

  it("extracts multiple URLs", () => {
    const result = extractCitations("See https://a.com and https://b.org for details.");
    expect(result.length).toBe(2);
    expect(result.map(c => c.domain)).toContain("a.com");
    expect(result.map(c => c.domain)).toContain("b.org");
  });

  it("strips www from domain", () => {
    const result = extractCitations("Go to https://www.havardpest.com for info.");
    expect(result[0].domain).toBe("havardpest.com");
  });

  it("deduplicates repeated URLs", () => {
    const result = extractCitations("https://a.com and https://a.com again.");
    expect(result.length).toBe(1);
  });

  it("includes position in responseText", () => {
    const text = "   https://example.com is here.";
    const result = extractCitations(text);
    expect(result[0].position).toBe(3);
  });

  it("returns empty array for text with no URLs", () => {
    const result = extractCitations("No links here.");
    expect(result.length).toBe(0);
  });

  it("returns frozen array", () => {
    const result = extractCitations("https://a.com");
    expect(Object.isFrozen(result)).toBe(true);
  });
});

// ── adaptAiQuerySources ───────────────────────────────────────────────────────

const BASE_SCAN = {
  id: "scan-001",
  clientId: "client-bbb-001",
  status: "completed",
  provider: "openai",
  model: "gpt-4o-mini",
  queryCount: 3,
  completedCount: 3,
  mentionCount: 0,
  error: null,
  startedAt: "2026-07-19T12:00:00Z",
  completedAt: "2026-07-19T12:01:00Z",
};

const UNMENTIONED_RESULT = {
  id: "result-001",
  scanId: "scan-001",
  clientId: "client-bbb-001",
  query: "best bed bug treatment in foley al",
  provider: "openai",
  model: "gpt-4o-mini",
  responseText: "Havard Pest Control is a good option.",
  latencyMs: 1200,
  generatedAt: "2026-07-19T12:00:30Z",
  success: true,
  failureReason: null,
  businessMentioned: false,
  mentionType: "none",
  mentionPosition: null,
  competitorMentions: [{ name: "Havard Pest Control", domain: null, mentionType: "exact", position: 0 }],
  citations: [],
  createdAt: "2026-07-19T12:00:30Z",
};

const MENTIONED_RESULT = {
  ...UNMENTIONED_RESULT,
  id: "result-002",
  businessMentioned: true,
  mentionType: "exact",
  mentionPosition: 5,
  competitorMentions: [],
};

describe("adaptAiQuerySources", () => {
  it("returns not_connected coverage when scan is null", () => {
    const input: AiQueryAdapterInput = {
      scan: null, results: [], geography: "Foley, AL",
      clientId: "client-bbb-001", observedAt: new Date("2026-07-19T12:00:00Z"),
    };
    const result = adaptAiQuerySources(input);
    expect(result.observations).toHaveLength(0);
    expect(result.coverage).toHaveLength(1);
    expect(result.coverage[0].source).toBe("ai_query");
    expect(result.coverage[0].status).toBe("not_connected");
  });

  it("returns available coverage when business was mentioned", () => {
    const input: AiQueryAdapterInput = {
      scan: { ...BASE_SCAN, mentionCount: 1 },
      results: [MENTIONED_RESULT],
      geography: "Foley, AL",
      clientId: "client-bbb-001",
      observedAt: new Date("2026-07-19T12:00:00Z"),
    };
    const result = adaptAiQuerySources(input);
    expect(result.coverage[0].status).toBe("available");
    expect(result.observations).toHaveLength(0); // No observations for positive outcome
  });

  it("returns no_observation coverage when no mentions", () => {
    const input: AiQueryAdapterInput = {
      scan: BASE_SCAN,
      results: [UNMENTIONED_RESULT],
      geography: "Foley, AL",
      clientId: "client-bbb-001",
      observedAt: new Date("2026-07-19T12:00:00Z"),
    };
    const result = adaptAiQuerySources(input);
    expect(result.coverage[0].status).toBe("no_observation");
  });

  it("creates one observation per unmentioned successful result", () => {
    const input: AiQueryAdapterInput = {
      scan: BASE_SCAN,
      results: [UNMENTIONED_RESULT, { ...UNMENTIONED_RESULT, id: "result-003", query: "pest control in foley" }],
      geography: "Foley, AL",
      clientId: "client-bbb-001",
      observedAt: new Date("2026-07-19T12:00:00Z"),
    };
    const result = adaptAiQuerySources(input);
    expect(result.observations).toHaveLength(2);
  });

  it("does NOT create observations for failed results", () => {
    const failedResult = {
      ...UNMENTIONED_RESULT,
      id: "result-fail",
      success: false,
      failureReason: "provider_error",
    };
    const input: AiQueryAdapterInput = {
      scan: BASE_SCAN,
      results: [failedResult],
      geography: "Foley, AL",
      clientId: "client-bbb-001",
      observedAt: new Date("2026-07-19T12:00:00Z"),
    };
    const result = adaptAiQuerySources(input);
    expect(result.observations).toHaveLength(0);
  });

  it("observations use 'ai_query' as reference source", () => {
    const input: AiQueryAdapterInput = {
      scan: BASE_SCAN,
      results: [UNMENTIONED_RESULT],
      geography: "Foley, AL",
      clientId: "client-bbb-001",
      observedAt: new Date("2026-07-19T12:00:00Z"),
    };
    const result = adaptAiQuerySources(input);
    expect(result.observations[0].references[0].source).toBe("ai_query");
  });

  it("observations use 'measurement' category", () => {
    const input: AiQueryAdapterInput = {
      scan: BASE_SCAN,
      results: [UNMENTIONED_RESULT],
      geography: "Foley, AL",
      clientId: "client-bbb-001",
      observedAt: new Date("2026-07-19T12:00:00Z"),
    };
    const result = adaptAiQuerySources(input);
    expect(result.observations[0].category).toBe("measurement");
  });

  it("dedupeKey is deterministic from query text", () => {
    const input: AiQueryAdapterInput = {
      scan: BASE_SCAN,
      results: [UNMENTIONED_RESULT],
      geography: "Foley, AL",
      clientId: "client-bbb-001",
      observedAt: new Date("2026-07-19T12:00:00Z"),
    };
    const r1 = adaptAiQuerySources(input);
    const r2 = adaptAiQuerySources(input);
    expect(r1.observations[0].dedupeKey).toBe(r2.observations[0].dedupeKey);
  });
});
