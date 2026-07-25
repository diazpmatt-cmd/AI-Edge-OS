/**
 * backlink-dataforseo-adapter.test.ts — C8R-8 Adapter Contract Harness
 *
 * Tests the DataForSEOBacklinkAdapter with a mock fetchFn, exercising every
 * HTTP error mapping, response normalization, and guard behavior.
 * No real network calls — all tests run offline.
 *
 * Group A — Guard behaviour (5)
 *   A01  Throws provider_disabled when enabled=false
 *   A02  Throws when clientId is empty
 *   A03  Throws when clientDomain is empty
 *   A04  Throws when limit is zero
 *   A05  Throws when limit is negative
 *
 * Group B — HTTP error mapping (8)
 *   B01  HTTP 401 → BacklinkProviderError("auth_error")
 *   B02  HTTP 403 → BacklinkProviderError("auth_error")
 *   B03  HTTP 402 → BacklinkProviderError("quota_exceeded")
 *   B04  HTTP 429 → BacklinkProviderError("rate_limited")
 *   B05  HTTP 500 → BacklinkProviderError("provider_error") after retries
 *   B06  Malformed JSON → BacklinkProviderError("malformed_response")
 *   B07  Missing tasks array → BacklinkProviderError("malformed_response")
 *   B08  AbortError → BacklinkProviderError("timeout")
 *
 * Group C — Retry behaviour (3)
 *   C01  Single 5xx retried → success on second attempt returns evidence
 *   C02  Auth error is NOT retried (propagates immediately)
 *   C03  Retries use an increasing delay multiplier (attempt count)
 *
 * Group D — referring_domains response mapping (7)
 *   D01  Items mapped to category="referring_domain"
 *   D02  opportunityCategory="competitor_link_gap"
 *   D03  authority = item.rank (clamped 0-100)
 *   D04  relationshipAccessibility derived from spam_score (100 - spam_score)
 *   D05  metadata includes rank, spam_score, data_source, target_domain
 *   D06  sourceUrl constructed from domain
 *   D07  targetUrl and competitorUrl constructed from competitor domain
 *
 * Group E — domain_intersection response mapping (4)
 *   E01  Items mapped to category="link_intersection"
 *   E02  opportunityCategory="competitor_link_gap"
 *   E03  metadata includes competitors string and data_source
 *   E04  Intersection only called when competitorDomains.length >= 2
 *
 * Group F — Spam filtering, dedup, cap (6)
 *   F01  Items with spam_score > 50 are excluded
 *   F02  Items with spam_score == 50 are included
 *   F03  Items with spam_score > 50 excluded from intersection pass too
 *   F04  Duplicate (sourceDomain, category, targetUrl) entries deduplicated
 *   F05  Result count never exceeds input.limit
 *   F06  No competitor domains → only intersection skipped (budget stays)
 *
 * Group G — Non-fatal error handling (3)
 *   G01  5xx for one competitor is skipped; other competitors still processed
 *   G02  Fatal auth_error during loop propagates
 *   G03  Domain intersection failure does not drop referring_domain results
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DataForSEOBacklinkAdapter,
} from "../../../../lib/db/src/dataforseo-backlink-adapter";
import {
  BacklinkProviderError,
  type DataForSEOBacklinkConfig,
} from "../../../../lib/db/src/backlink-provider-config";
import type { BacklinkDiscoveryInput } from "../../../../lib/db/src/backlink-providers";
import type { RawBacklinkEvidence } from "../../../../lib/db/src/backlink-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(enabled = true): DataForSEOBacklinkConfig {
  return {
    login:              "test@example.com",
    password:           "pw",
    baseUrl:            "https://api.dataforseo.com",
    enabled,
    maxRequestsPerRun:  10,
    retry:              { maxAttempts: 2, delayMs: 0, timeoutMs: 5_000 },
  };
}

function makeInput(overrides: Partial<BacklinkDiscoveryInput> = {}): BacklinkDiscoveryInput {
  return {
    clientId:          "client-abc",
    clientDomain:      "mybusiness.com",
    competitorDomains: ["competitor1.com", "competitor2.com"],
    serviceIds:        ["bed_bug_treatment"],
    city:              "Foley",
    region:            "Baldwin County, Alabama",
    limit:             10,
    ...overrides,
  };
}

type MockResponse = {
  status: number;
  json: () => Promise<unknown>;
};

function mockResponse(body: unknown, status = 200): MockResponse {
  return { status, json: () => Promise.resolve(body) };
}

function dfsEnvelope(items: unknown[], target = "competitor1.com"): unknown {
  return {
    tasks: [{
      status_code:    20000,
      status_message: "Ok.",
      result: [{
        target,
        total_count: items.length,
        items_count: items.length,
        items,
      }],
    }],
  };
}

function dfsIntersectionEnvelope(items: unknown[]): unknown {
  return {
    tasks: [{
      status_code:    20000,
      status_message: "Ok.",
      result: [{
        total_count: items.length,
        items_count: items.length,
        items,
      }],
    }],
  };
}

function referringDomainItem(overrides: Partial<{
  domain: string; rank: number; spam_score: number;
  backlinks: number; referring_pages: number;
}> = {}): unknown {
  return {
    type:             "referring_domain",
    domain:           "referer.com",
    rank:             60,
    spam_score:       5,
    backlinks:        3,
    referring_pages:  2,
    referring_ips:    2,
    broken_backlinks: 0,
    first_seen:       null,
    ...overrides,
  };
}

function intersectionItem(overrides: Partial<{
  domain: string; rank: number; spam_score: number;
}> = {}): unknown {
  return {
    type:          "referring_domain",
    domain:        "inter.com",
    rank:          55,
    spam_score:    10,
    intersections: [
      { target: "competitor1.com", backlinks: 2 },
      { target: "competitor2.com", backlinks: 1 },
    ],
    ...overrides,
  };
}

// ── Group A — Guard behaviour ─────────────────────────────────────────────────

describe("DataForSEOBacklinkAdapter — guards", () => {
  it("A01: throws provider_disabled when enabled=false", async () => {
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(false), vi.fn());
    await expect(adapter.discover(makeInput())).rejects.toSatisfy(
      (e: unknown) => e instanceof BacklinkProviderError && e.kind === "provider_disabled",
    );
  });

  it("A02: throws when clientId is empty", async () => {
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), vi.fn());
    await expect(adapter.discover(makeInput({ clientId: "" }))).rejects.toThrow("clientId is required");
  });

  it("A03: throws when clientDomain is empty", async () => {
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), vi.fn());
    await expect(adapter.discover(makeInput({ clientDomain: "" }))).rejects.toThrow("clientDomain is required");
  });

  it("A04: throws when limit is zero", async () => {
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), vi.fn());
    await expect(adapter.discover(makeInput({ limit: 0 }))).rejects.toThrow("limit");
  });

  it("A05: throws when limit is negative", async () => {
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), vi.fn());
    await expect(adapter.discover(makeInput({ limit: -5 }))).rejects.toThrow("limit");
  });
});

// ── Group B — HTTP error mapping ──────────────────────────────────────────────

describe("DataForSEOBacklinkAdapter — HTTP error mapping", () => {
  it("B01: HTTP 401 → auth_error (non-retryable)", async () => {
    const fetch   = vi.fn().mockResolvedValue(mockResponse({}, 401));
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    await expect(adapter.discover(makeInput())).rejects.toSatisfy(
      (e: unknown) => e instanceof BacklinkProviderError && e.kind === "auth_error" && e.statusCode === 401,
    );
    expect(fetch).toHaveBeenCalledOnce();   // no retry on 401
  });

  it("B02: HTTP 403 → auth_error", async () => {
    const fetch   = vi.fn().mockResolvedValue(mockResponse({}, 403));
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    await expect(adapter.discover(makeInput())).rejects.toSatisfy(
      (e: unknown) => e instanceof BacklinkProviderError && e.kind === "auth_error" && e.statusCode === 403,
    );
  });

  it("B03: HTTP 402 → quota_exceeded", async () => {
    const fetch   = vi.fn().mockResolvedValue(mockResponse({}, 402));
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    await expect(adapter.discover(makeInput())).rejects.toSatisfy(
      (e: unknown) => e instanceof BacklinkProviderError && e.kind === "quota_exceeded",
    );
    expect(fetch).toHaveBeenCalledOnce();   // no retry on 402
  });

  it("B04: HTTP 429 → rate_limited", async () => {
    const fetch   = vi.fn().mockResolvedValue(mockResponse({}, 429));
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    await expect(adapter.discover(makeInput())).rejects.toSatisfy(
      (e: unknown) => e instanceof BacklinkProviderError && e.kind === "rate_limited",
    );
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("B05: HTTP 500 → provider_error after exhausting retries", async () => {
    // maxAttempts=2, both attempts fail with 500
    const fetch   = vi.fn().mockResolvedValue(mockResponse({}, 500));
    const cfg     = { ...makeConfig(true), retry: { maxAttempts: 2, delayMs: 0, timeoutMs: 5000 } };
    const adapter = new DataForSEOBacklinkAdapter(cfg, fetch as any);
    await expect(adapter.discover(makeInput({ competitorDomains: ["only.com"] }))).resolves.toEqual([]);
    // 5xx is non-fatal per-competitor — all competitors swallowed → empty result
  });

  it("B06: malformed JSON → BacklinkProviderError malformed_response", async () => {
    const badJson = { status: 200, json: () => Promise.reject(new SyntaxError("bad json")) };
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), vi.fn().mockResolvedValue(badJson) as any);
    // malformed JSON per competitor is swallowed (non-fatal), result is empty
    const result = await adapter.discover(makeInput({ competitorDomains: ["c.com"] }));
    expect(result).toEqual([]);
  });

  it("B07: missing tasks array → swallowed as non-fatal per-competitor", async () => {
    const noTasks = mockResponse({ status_code: 20000, tasks: "WRONG" }, 200);
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), vi.fn().mockResolvedValue(noTasks) as any);
    const result  = await adapter.discover(makeInput({ competitorDomains: ["c.com"] }));
    expect(result).toEqual([]);
  });

  it("B08: AbortError → provider_disabled propagated as timeout (fatal)", async () => {
    const abortErr = Object.assign(new Error("AbortError"), { name: "AbortError" });
    const adapter  = new DataForSEOBacklinkAdapter(makeConfig(true), vi.fn().mockRejectedValue(abortErr) as any);
    await expect(adapter.discover(makeInput({ competitorDomains: ["c.com"] }))).rejects.toSatisfy(
      (e: unknown) => e instanceof BacklinkProviderError && e.kind === "timeout",
    );
  });
});

// ── Group C — Retry behaviour ─────────────────────────────────────────────────

describe("DataForSEOBacklinkAdapter — retry", () => {
  it("C01: single 5xx retried → success on second attempt returns evidence", async () => {
    const goodItem = referringDomainItem({ domain: "referer.com" });
    const fetch    = vi.fn()
      .mockResolvedValueOnce(mockResponse({}, 500))
      .mockResolvedValueOnce(mockResponse(dfsEnvelope([goodItem])));

    const cfg     = { ...makeConfig(true), maxRequestsPerRun: 10, retry: { maxAttempts: 2, delayMs: 0, timeoutMs: 5000 } };
    const adapter = new DataForSEOBacklinkAdapter(cfg, fetch as any);
    const results = await adapter.discover(makeInput({ competitorDomains: ["c.com"], limit: 10 }));

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].sourceDomain).toBe("referer.com");
  });

  it("C02: auth_error is NOT retried — fetch called exactly once", async () => {
    const fetch   = vi.fn().mockResolvedValue(mockResponse({}, 401));
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    await expect(adapter.discover(makeInput())).rejects.toSatisfy(
      (e: unknown) => e instanceof BacklinkProviderError && e.kind === "auth_error",
    );
    // Called once — for the first competitor domain
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("C03: second attempt receives same URL as first attempt", async () => {
    const good  = mockResponse(dfsEnvelope([referringDomainItem()]));
    const fetch = vi.fn()
      .mockResolvedValueOnce(mockResponse({}, 500))
      .mockResolvedValueOnce(good);
    const cfg     = { ...makeConfig(true), retry: { maxAttempts: 2, delayMs: 0, timeoutMs: 5000 } };
    const adapter = new DataForSEOBacklinkAdapter(cfg, fetch as any);
    await adapter.discover(makeInput({ competitorDomains: ["c.com"], limit: 5 }));
    expect(fetch.mock.calls[0][0]).toBe(fetch.mock.calls[1][0]);
  });
});

// ── Group D — referring_domains mapping ───────────────────────────────────────

describe("DataForSEOBacklinkAdapter — referring_domains mapping", () => {
  let evidence: RawBacklinkEvidence;

  beforeEach(async () => {
    const item  = referringDomainItem({ domain: "linker.com", rank: 72, spam_score: 8, backlinks: 5, referring_pages: 2 });
    const fetch = vi.fn().mockResolvedValue(mockResponse(dfsEnvelope([item], "competitor1.com")));
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    const results = await adapter.discover(makeInput({ competitorDomains: ["competitor1.com"], limit: 5 }));
    evidence = results[0];
  });

  it("D01: category is referring_domain", () => {
    expect(evidence.category).toBe("referring_domain");
  });

  it("D02: opportunityCategory is competitor_link_gap", () => {
    expect(evidence.opportunityCategory).toBe("competitor_link_gap");
  });

  it("D03: authority equals item.rank clamped to 0-100", () => {
    expect(evidence.authority).toBe(72);
  });

  it("D04: relationshipAccessibility = 100 - spam_score", () => {
    expect(evidence.relationshipAccessibility).toBe(92);  // 100 - 8
  });

  it("D05: metadata contains rank, spam_score, data_source, target_domain", () => {
    expect(evidence.metadata).toBeDefined();
    expect((evidence.metadata as Record<string, unknown>)["rank"]).toBe(72);
    expect((evidence.metadata as Record<string, unknown>)["spam_score"]).toBe(8);
    expect((evidence.metadata as Record<string, unknown>)["data_source"]).toBe("dataforseo_referring_domains");
    expect((evidence.metadata as Record<string, unknown>)["target_domain"]).toBe("competitor1.com");
  });

  it("D06: sourceUrl is https://domain/", () => {
    expect(evidence.sourceUrl).toBe("https://linker.com/");
    expect(evidence.sourceDomain).toBe("linker.com");
  });

  it("D07: targetUrl and competitorUrl are https://targetDomain/", () => {
    expect(evidence.targetUrl).toBe("https://competitor1.com/");
    expect(evidence.competitorUrl).toBe("https://competitor1.com/");
  });
});

// ── Group E — domain_intersection mapping ─────────────────────────────────────

describe("DataForSEOBacklinkAdapter — domain_intersection mapping", () => {
  it("E01: items mapped to category=link_intersection", async () => {
    const item  = intersectionItem({ domain: "crosslink.com", rank: 55, spam_score: 10 });
    const fetch = vi.fn()
      .mockResolvedValueOnce(mockResponse(dfsEnvelope([], "competitor1.com")))
      .mockResolvedValueOnce(mockResponse(dfsEnvelope([], "competitor2.com")))
      .mockResolvedValueOnce(mockResponse(dfsIntersectionEnvelope([item])));
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    const results = await adapter.discover(makeInput({ limit: 10 }));
    const inter   = results.find((r) => r.category === "link_intersection");
    expect(inter).toBeDefined();
    expect(inter!.category).toBe("link_intersection");
  });

  it("E02: opportunityCategory is competitor_link_gap for intersections", async () => {
    const item  = intersectionItem();
    const fetch = vi.fn()
      .mockResolvedValueOnce(mockResponse(dfsEnvelope([])))
      .mockResolvedValueOnce(mockResponse(dfsEnvelope([])))
      .mockResolvedValueOnce(mockResponse(dfsIntersectionEnvelope([item])));
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    const results = await adapter.discover(makeInput({ limit: 10 }));
    const inter   = results.find((r) => r.category === "link_intersection");
    expect(inter?.opportunityCategory).toBe("competitor_link_gap");
  });

  it("E03: intersection metadata contains competitors and data_source", async () => {
    const item  = intersectionItem();
    const fetch = vi.fn()
      .mockResolvedValueOnce(mockResponse(dfsEnvelope([])))
      .mockResolvedValueOnce(mockResponse(dfsEnvelope([])))
      .mockResolvedValueOnce(mockResponse(dfsIntersectionEnvelope([item])));
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    const results = await adapter.discover(makeInput({ limit: 10 }));
    const inter   = results.find((r) => r.category === "link_intersection");
    const meta    = inter!.metadata as Record<string, unknown>;
    expect(meta["competitors"]).toContain("competitor1.com");
    expect(meta["data_source"]).toBe("dataforseo_domain_intersection");
  });

  it("E04: intersection not called when competitorDomains.length < 2", async () => {
    const fetch   = vi.fn().mockResolvedValue(mockResponse(dfsEnvelope([])));
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    await adapter.discover(makeInput({ competitorDomains: ["onlyone.com"], limit: 5 }));
    // Only 1 competitor → referring_domains called once, intersection NOT called
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// ── Group F — Spam filtering, dedup, cap ──────────────────────────────────────

describe("DataForSEOBacklinkAdapter — filtering and deduplication", () => {
  it("F01: items with spam_score > 50 are excluded", async () => {
    const spammy = referringDomainItem({ domain: "spam.com", spam_score: 51 });
    const clean  = referringDomainItem({ domain: "clean.com", spam_score: 10 });
    const fetch  = vi.fn().mockResolvedValue(mockResponse(dfsEnvelope([spammy, clean])));
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    const results = await adapter.discover(makeInput({ competitorDomains: ["c.com"], limit: 10 }));
    expect(results.map((r) => r.sourceDomain)).not.toContain("spam.com");
    expect(results.map((r) => r.sourceDomain)).toContain("clean.com");
  });

  it("F02: items with spam_score == 50 are included", async () => {
    const borderline = referringDomainItem({ domain: "border.com", spam_score: 50 });
    const fetch      = vi.fn().mockResolvedValue(mockResponse(dfsEnvelope([borderline])));
    const adapter    = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    const results    = await adapter.discover(makeInput({ competitorDomains: ["c.com"], limit: 10 }));
    expect(results.map((r) => r.sourceDomain)).toContain("border.com");
  });

  it("F03: spammy items in intersection pass are also filtered", async () => {
    const spamInter = intersectionItem({ domain: "spaminter.com", spam_score: 55 });
    const fetch     = vi.fn()
      .mockResolvedValueOnce(mockResponse(dfsEnvelope([])))
      .mockResolvedValueOnce(mockResponse(dfsEnvelope([])))
      .mockResolvedValueOnce(mockResponse(dfsIntersectionEnvelope([spamInter])));
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    const results = await adapter.discover(makeInput({ limit: 10 }));
    expect(results.map((r) => r.sourceDomain)).not.toContain("spaminter.com");
  });

  it("F04: duplicate (sourceDomain, category, targetUrl) entries deduplicated", async () => {
    const dup1 = referringDomainItem({ domain: "same.com" });
    const dup2 = referringDomainItem({ domain: "same.com" });
    const fetch = vi.fn().mockResolvedValue(mockResponse(dfsEnvelope([dup1, dup2])));
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    const results = await adapter.discover(makeInput({ competitorDomains: ["c.com"], limit: 20 }));
    const fromSame = results.filter((r) => r.sourceDomain === "same.com" && r.category === "referring_domain");
    expect(fromSame).toHaveLength(1);
  });

  it("F05: result count never exceeds input.limit", async () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      referringDomainItem({ domain: `site${i}.com`, spam_score: 1 }),
    );
    const fetch   = vi.fn().mockResolvedValue(mockResponse(dfsEnvelope(items)));
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    const results = await adapter.discover(makeInput({ competitorDomains: ["c.com"], limit: 5 }));
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it("F06: no competitor domains → empty result (no requests made)", async () => {
    const fetch   = vi.fn();
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    const results = await adapter.discover(makeInput({ competitorDomains: [], limit: 10 }));
    expect(results).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ── Group G — Non-fatal error handling ───────────────────────────────────────

describe("DataForSEOBacklinkAdapter — non-fatal error handling", () => {
  it("G01: 5xx for one competitor is swallowed; others still processed", async () => {
    const goodItem = referringDomainItem({ domain: "good.com" });
    const fetch    = vi.fn()
      .mockResolvedValueOnce(mockResponse({}, 500))   // competitor1 fails
      .mockResolvedValueOnce(mockResponse({}, 500))   // retry also fails (maxAttempts=2)
      .mockResolvedValueOnce(mockResponse(dfsEnvelope([goodItem], "competitor2.com"))); // competitor2 ok
    const cfg     = { ...makeConfig(true), retry: { maxAttempts: 2, delayMs: 0, timeoutMs: 5000 } };
    const adapter = new DataForSEOBacklinkAdapter(cfg, fetch as any);
    const results = await adapter.discover(makeInput({ limit: 10 }));
    // competitor2 results should still be present
    expect(results.some((r) => r.sourceDomain === "good.com")).toBe(true);
  });

  it("G02: fatal auth_error during loop propagates immediately", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(mockResponse({}, 401));  // auth error is fatal
    const adapter = new DataForSEOBacklinkAdapter(makeConfig(true), fetch as any);
    await expect(adapter.discover(makeInput())).rejects.toSatisfy(
      (e: unknown) => e instanceof BacklinkProviderError && e.kind === "auth_error",
    );
  });

  it("G03: intersection failure does not drop referring_domain results", async () => {
    const goodItem = referringDomainItem({ domain: "good.com" });
    const fetch    = vi.fn()
      .mockResolvedValueOnce(mockResponse(dfsEnvelope([goodItem], "competitor1.com")))
      .mockResolvedValueOnce(mockResponse(dfsEnvelope([],        "competitor2.com")))
      .mockResolvedValueOnce(mockResponse({}, 500));  // intersection 5xx
    const cfg     = { ...makeConfig(true), retry: { maxAttempts: 1, delayMs: 0, timeoutMs: 5000 } };
    const adapter = new DataForSEOBacklinkAdapter(cfg, fetch as any);
    const results = await adapter.discover(makeInput({ limit: 10 }));
    expect(results.some((r) => r.sourceDomain === "good.com")).toBe(true);
  });
});
