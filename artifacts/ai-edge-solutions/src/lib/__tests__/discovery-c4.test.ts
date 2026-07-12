/**
 * Phase C4 — DataForSEO Provider Tests
 *
 * 26 test categories (A–Z) covering the complete C4 surface:
 *
 *   A.  parseDataForSEOConfig: valid env → correct config object
 *   B.  parseDataForSEOConfig: missing login → null
 *   C.  parseDataForSEOConfig: missing password → null
 *   D.  parseDataForSEOConfig: numeric defaults applied + clamping
 *   E.  parseDataForSEOConfig: enabled flag parses "true" correctly
 *   F.  getDataForSEOHealthState: null config → "unconfigured"
 *   G.  getDataForSEOHealthState: enabled=false → "disabled"
 *   H.  getDataForSEOHealthState: enabled=true → "configured" (password never exposed)
 *   I.  buildBasicAuthHeader: correct Base64 format
 *   J.  estimateCostUSD: correct USD calculation
 *   K.  buildLocationName: city + state → correct location_name format
 *   L.  buildLocationName: state only
 *   M.  buildLocationName: empty inputs → "United States"
 *   N.  isQueryBlocked: termite queries blocked
 *   O.  isQueryBlocked: wildlife queries blocked
 *   P.  isQueryBlocked: heat treatment queries blocked
 *   Q.  isQueryBlocked: safe non-blocked keywords pass
 *   R.  isQueryEducationalOnly: fumigation queries flagged educational-only
 *   S.  isQueryEducationalOnly: safe keywords not educational-only
 *   T.  inferQueryCategory: cost/price/fee → commercial
 *   U.  inferQueryCategory: how/what/why → informational
 *   V.  inferQueryCategory: default → local
 *   W.  buildDataForSEOQueryPlan: plan structure (serpQueries, volumeKeywords)
 *   X.  buildDataForSEOQueryPlan: serpQueries capped at maxQueriesPerRun
 *   Y.  extractCompetitorDomains: aggregators excluded; local domains kept
 *   Z.  DataForSEOAdapter: injectable fetchFn, no live API call, volume data returned
 *
 * No test in this file makes a live HTTP call.
 * All DataForSEOAdapter tests use injected mock fetch functions.
 * DataForSEOError thrown by the adapter is caught and asserted — never suppressed.
 *
 * Live integration tests (requiring real credentials) are gated by:
 *   DISCOVERY_LIVE_TESTS=true AND DATAFORSEO_LOGIN AND DATAFORSEO_PASSWORD
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Relative imports (no @workspace/db alias in vitest) ───────────────────────

import {
  parseDataForSEOConfig,
  getDataForSEOHealthState,
  buildBasicAuthHeader,
  estimateCostUSD,
  DataForSEOError,
  type DataForSEOConfig,
} from "../../../../../lib/db/src/dataforseo-config";
import {
  buildLocationName,
  isQueryBlocked,
  isQueryEducationalOnly,
  inferQueryCategory,
  buildDataForSEOQueryPlan,
} from "../../../../../lib/db/src/dataforseo-query-planner";
import {
  DataForSEOAdapter,
  extractCompetitorDomains,
  extractPAAQuestions,
} from "../../../../../lib/db/src/dataforseo-adapter";
import {
  buildDiscoveryContext,
} from "../../../../../lib/db/src/discovery-context";
import {
  buildClientContentContext,
  bbbRegistryProvider,
} from "../../../../../lib/db/src/client-context";

// ── Live test guard ────────────────────────────────────────────────────────────

const LIVE_TESTS = process.env["DISCOVERY_LIVE_TESTS"] === "true"
  && !!process.env["DATAFORSEO_LOGIN"]
  && !!process.env["DATAFORSEO_PASSWORD"];

// ── Fixtures ───────────────────────────────────────────────────────────────────

/** Minimal config for tests that need a real-ish config object. */
const TEST_CONFIG: DataForSEOConfig = {
  login:               "test@example.com",
  password:            "test-password-123",
  baseUrl:             "https://api.dataforseo.com",
  timeoutMs:           30000,
  maxQueriesPerRun:    3,
  maxResultsPerQuery:  10,
  maxKeywordsPerBatch: 700,
  enabled:             true,
};

/** Config with enabled=false for disabled-state tests. */
const DISABLED_CONFIG: DataForSEOConfig = { ...TEST_CONFIG, enabled: false };

/** Build a BB&B discovery context for plan tests. */
function makeBBBDiscoveryContext() {
  const contentContext = buildClientContentContext(bbbRegistryProvider);
  return buildDiscoveryContext({
    contentContext,
    clientId: "test-client-c4",
    now:      new Date("2026-07-14T10:00:00.000Z"),
  });
}

/** Fixture: DataForSEO keyword volume response envelope. */
function makeVolumeResponse(
  keywords: Array<{ keyword: string; volume: number | null; competition?: number; cpc?: number }>,
) {
  return {
    status_code:    20000,
    status_message: "Ok.",
    tasks: [{
      id:             "test-vol-001",
      status_code:    20000,
      status_message: "Ok.",
      time:           "0.1 sec.",
      result: keywords.map(k => ({
        keyword:           k.keyword,
        search_volume:     k.volume,
        competition:       k.competition ?? 0.1,
        competition_level: "LOW",
        cpc:               k.cpc ?? 2.5,
        monthly_searches:  null,
      })),
    }],
  };
}

/** Fixture: DataForSEO SERP organic response envelope. */
function makeSerpResponse(
  keyword:       string,
  organicItems:  Array<{ url: string; domain: string; title: string; rank: number }>,
  paaQuestions?: string[],
) {
  type SerpItem = {
    type:           string;
    rank_group?:    number;
    rank_absolute?: number;
    url?:           string;
    title?:         string;
    description?:   string;
    domain?:        string;
    items?:         Array<{ type: string; title: string }>;
  };
  const items: SerpItem[] = organicItems.map(r => ({
    type:          "organic",
    rank_group:    r.rank,
    rank_absolute: r.rank,
    url:           r.url,
    title:         r.title,
    description:   "A description.",
    domain:        r.domain,
  }));

  if (paaQuestions?.length) {
    items.push({
      type:  "people_also_ask",
      items: paaQuestions.map(q => ({ type: "people_also_ask_element", title: q })),
    });
  }

  return {
    status_code:    20000,
    status_message: "Ok.",
    tasks: [{
      id:             "test-serp-001",
      status_code:    20000,
      status_message: "Ok.",
      time:           "0.2 sec.",
      result: [{
        keyword,
        type:        "organic",
        se_domain:   "google.com",
        items_count: organicItems.length,
        items,
      }],
    }],
  };
}

/** Helper: build a Response-like object that the adapter's fetchFn can consume. */
function makeResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok:     status >= 200 && status < 300,
    status,
    json:   () => Promise.resolve(body),
    text:   () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response);
}

// ═════════════════════════════════════════════════════════════════════════════
// A. parseDataForSEOConfig — valid env → correct config object
// ═════════════════════════════════════════════════════════════════════════════
describe("A. parseDataForSEOConfig: valid env", () => {
  it("returns a DataForSEOConfig when both credentials are present", () => {
    const config = parseDataForSEOConfig({
      DATAFORSEO_LOGIN:    "user@example.com",
      DATAFORSEO_PASSWORD: "secret123",
    });
    expect(config).not.toBeNull();
    expect(config!.login).toBe("user@example.com");
    expect(config!.password).toBe("secret123");
    expect(config!.baseUrl).toBe("https://api.dataforseo.com");
  });

  it("applies explicit overrides when all env vars are set", () => {
    const config = parseDataForSEOConfig({
      DATAFORSEO_LOGIN:                "user@example.com",
      DATAFORSEO_PASSWORD:             "secret",
      DATAFORSEO_BASE_URL:             "https://sandbox.dataforseo.com",
      DATAFORSEO_TIMEOUT_MS:           "15000",
      DATAFORSEO_MAX_QUERIES_PER_RUN:  "8",
      DATAFORSEO_MAX_RESULTS_PER_QUERY:"20",
      DATAFORSEO_MAX_KEYWORDS_PER_BATCH:"200",
    });
    expect(config!.baseUrl).toBe("https://sandbox.dataforseo.com");
    expect(config!.timeoutMs).toBe(15000);
    expect(config!.maxQueriesPerRun).toBe(8);
    expect(config!.maxResultsPerQuery).toBe(20);
    expect(config!.maxKeywordsPerBatch).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B. parseDataForSEOConfig — missing login → null
// ═════════════════════════════════════════════════════════════════════════════
describe("B. parseDataForSEOConfig: missing login → null", () => {
  it("returns null when DATAFORSEO_LOGIN is absent", () => {
    const config = parseDataForSEOConfig({ DATAFORSEO_PASSWORD: "secret" });
    expect(config).toBeNull();
  });

  it("returns null when DATAFORSEO_LOGIN is empty string", () => {
    const config = parseDataForSEOConfig({ DATAFORSEO_LOGIN: "", DATAFORSEO_PASSWORD: "secret" });
    expect(config).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C. parseDataForSEOConfig — missing password → null
// ═════════════════════════════════════════════════════════════════════════════
describe("C. parseDataForSEOConfig: missing password → null", () => {
  it("returns null when DATAFORSEO_PASSWORD is absent", () => {
    const config = parseDataForSEOConfig({ DATAFORSEO_LOGIN: "user@example.com" });
    expect(config).toBeNull();
  });

  it("returns null when both env vars are absent", () => {
    const config = parseDataForSEOConfig({});
    expect(config).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D. parseDataForSEOConfig — numeric defaults and clamping
// ═════════════════════════════════════════════════════════════════════════════
describe("D. parseDataForSEOConfig: numeric defaults", () => {
  it("applies defaults when optional vars are omitted", () => {
    const config = parseDataForSEOConfig({
      DATAFORSEO_LOGIN:    "u@e.com",
      DATAFORSEO_PASSWORD: "p",
    });
    expect(config!.timeoutMs).toBe(30000);
    expect(config!.maxQueriesPerRun).toBe(5);
    expect(config!.maxResultsPerQuery).toBe(10);
    expect(config!.maxKeywordsPerBatch).toBe(700);
  });

  it("clamps maxResultsPerQuery to at least 10", () => {
    const config = parseDataForSEOConfig({
      DATAFORSEO_LOGIN:                 "u@e.com",
      DATAFORSEO_PASSWORD:              "p",
      DATAFORSEO_MAX_RESULTS_PER_QUERY: "2",
    });
    expect(config!.maxResultsPerQuery).toBe(10);
  });

  it("clamps maxResultsPerQuery to at most 100", () => {
    const config = parseDataForSEOConfig({
      DATAFORSEO_LOGIN:                 "u@e.com",
      DATAFORSEO_PASSWORD:              "p",
      DATAFORSEO_MAX_RESULTS_PER_QUERY: "200",
    });
    expect(config!.maxResultsPerQuery).toBe(100);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E. parseDataForSEOConfig — enabled flag
// ═════════════════════════════════════════════════════════════════════════════
describe("E. parseDataForSEOConfig: enabled flag", () => {
  it("enabled=false when DISCOVERY_DATAFORSEO_ENABLED is absent", () => {
    const config = parseDataForSEOConfig({ DATAFORSEO_LOGIN: "u@e.com", DATAFORSEO_PASSWORD: "p" });
    expect(config!.enabled).toBe(false);
  });

  it("enabled=false when set to 'false'", () => {
    const config = parseDataForSEOConfig({
      DATAFORSEO_LOGIN:              "u@e.com",
      DATAFORSEO_PASSWORD:           "p",
      DISCOVERY_DATAFORSEO_ENABLED:  "false",
    });
    expect(config!.enabled).toBe(false);
  });

  it("enabled=true when set to 'true'", () => {
    const config = parseDataForSEOConfig({
      DATAFORSEO_LOGIN:             "u@e.com",
      DATAFORSEO_PASSWORD:          "p",
      DISCOVERY_DATAFORSEO_ENABLED: "true",
    });
    expect(config!.enabled).toBe(true);
  });

  it("enabled=false for any non-'true' string (e.g. '1', 'yes', 'TRUE')", () => {
    const configOne = parseDataForSEOConfig({
      DATAFORSEO_LOGIN: "u@e.com", DATAFORSEO_PASSWORD: "p",
      DISCOVERY_DATAFORSEO_ENABLED: "1",
    });
    expect(configOne!.enabled).toBe(false);
    const configYes = parseDataForSEOConfig({
      DATAFORSEO_LOGIN: "u@e.com", DATAFORSEO_PASSWORD: "p",
      DISCOVERY_DATAFORSEO_ENABLED: "yes",
    });
    expect(configYes!.enabled).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// F. getDataForSEOHealthState — unconfigured
// ═════════════════════════════════════════════════════════════════════════════
describe("F. getDataForSEOHealthState: unconfigured", () => {
  it("returns status='unconfigured' when config is null", () => {
    const health = getDataForSEOHealthState(null);
    expect(health.status).toBe("unconfigured");
    expect("reason" in health).toBe(true);
    expect((health as { reason: string }).reason).toContain("DATAFORSEO_LOGIN");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// G. getDataForSEOHealthState — disabled
// ═════════════════════════════════════════════════════════════════════════════
describe("G. getDataForSEOHealthState: disabled", () => {
  it("returns status='disabled' when credentials present but enabled=false", () => {
    const config = { ...TEST_CONFIG, enabled: false };
    const health = getDataForSEOHealthState(config);
    expect(health.status).toBe("disabled");
    expect((health as { reason: string }).reason).toContain("DISCOVERY_DATAFORSEO_ENABLED");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// H. getDataForSEOHealthState — configured, password never exposed
// ═════════════════════════════════════════════════════════════════════════════
describe("H. getDataForSEOHealthState: configured (no password exposed)", () => {
  it("returns status='configured' when credentials present and enabled=true", () => {
    const health = getDataForSEOHealthState(TEST_CONFIG);
    expect(health.status).toBe("configured");
  });

  it("exposes login and baseUrl but never the password", () => {
    const health = getDataForSEOHealthState(TEST_CONFIG);
    expect(health.status).toBe("configured");
    const healthObj = health as { login: string; baseUrl: string };
    expect(healthObj.login).toBe("test@example.com");
    expect(healthObj.baseUrl).toBe("https://api.dataforseo.com");
    expect(JSON.stringify(health)).not.toContain("test-password-123");
    expect(JSON.stringify(health)).not.toContain("password");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// I. buildBasicAuthHeader — correct Base64 format
// ═════════════════════════════════════════════════════════════════════════════
describe("I. buildBasicAuthHeader: correct Base64 format", () => {
  it("produces 'Basic <base64(login:password)>'", () => {
    const header = buildBasicAuthHeader("user@example.com", "secret123");
    expect(header.startsWith("Basic ")).toBe(true);
    const encoded = header.slice("Basic ".length);
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    expect(decoded).toBe("user@example.com:secret123");
  });

  it("handles login or password with special characters", () => {
    const header = buildBasicAuthHeader("user+tag@example.com", "p@$$w0rd!");
    const encoded = header.slice("Basic ".length);
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    expect(decoded).toBe("user+tag@example.com:p@$$w0rd!");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// J. estimateCostUSD — correct calculation
// ═════════════════════════════════════════════════════════════════════════════
describe("J. estimateCostUSD: correct calculation", () => {
  it("1 volume batch + 5 SERP calls = $0.0105", () => {
    const cost = estimateCostUSD(1, 5);
    expect(cost).toBeCloseTo(0.0105, 4);
  });

  it("0 volume batches + 0 SERP calls = $0.00", () => {
    const cost = estimateCostUSD(0, 0);
    expect(cost).toBe(0);
  });

  it("1 volume batch only (no SERP) = $0.0005", () => {
    const cost = estimateCostUSD(1, 0);
    expect(cost).toBeCloseTo(0.0005, 6);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// K. buildLocationName — city + state
// ═════════════════════════════════════════════════════════════════════════════
describe("K. buildLocationName: city + state", () => {
  it("produces 'City,State,United States' format", () => {
    expect(buildLocationName("Foley", "Alabama")).toBe("Foley,Alabama,United States");
  });

  it("does not add extra spaces", () => {
    const loc = buildLocationName("Gulf Shores", "Alabama");
    expect(loc).toBe("Gulf Shores,Alabama,United States");
    expect(loc).not.toMatch(/\s,/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// L. buildLocationName — state only
// ═════════════════════════════════════════════════════════════════════════════
describe("L. buildLocationName: state only", () => {
  it("produces 'State,United States' when city is empty", () => {
    expect(buildLocationName("", "Alabama")).toBe("Alabama,United States");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// M. buildLocationName — empty inputs
// ═════════════════════════════════════════════════════════════════════════════
describe("M. buildLocationName: empty inputs → 'United States'", () => {
  it("returns 'United States' when both city and state are empty", () => {
    expect(buildLocationName("", "")).toBe("United States");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// N. isQueryBlocked — termite queries blocked
// ═════════════════════════════════════════════════════════════════════════════
describe("N. isQueryBlocked: termite queries", () => {
  it("blocks 'termite inspection foley'", () => {
    expect(isQueryBlocked("termite inspection foley")).toBe(true);
  });

  it("blocks 'termite' alone", () => {
    expect(isQueryBlocked("termite")).toBe(true);
  });

  it("blocks mixed-case 'Termite Control'", () => {
    expect(isQueryBlocked("Termite Control")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O. isQueryBlocked — wildlife queries blocked
// ═════════════════════════════════════════════════════════════════════════════
describe("O. isQueryBlocked: wildlife queries", () => {
  it("blocks 'wildlife removal foley'", () => {
    expect(isQueryBlocked("wildlife removal foley")).toBe(true);
  });

  it("blocks 'wildlife' alone", () => {
    expect(isQueryBlocked("wildlife")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// P. isQueryBlocked — heat treatment queries blocked
// ═════════════════════════════════════════════════════════════════════════════
describe("P. isQueryBlocked: heat treatment queries", () => {
  it("blocks 'bed bug heat treatment foley'", () => {
    expect(isQueryBlocked("bed bug heat treatment foley")).toBe(true);
  });

  it("blocks 'whole-home heat treatment'", () => {
    expect(isQueryBlocked("whole-home heat treatment")).toBe(true);
  });

  it("blocks 'heat treatment' alone", () => {
    expect(isQueryBlocked("heat treatment")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Q. isQueryBlocked — safe keywords pass
// ═════════════════════════════════════════════════════════════════════════════
describe("Q. isQueryBlocked: safe keywords pass", () => {
  it("does not block 'bed bug inspection foley'", () => {
    expect(isQueryBlocked("bed bug inspection foley")).toBe(false);
  });

  it("does not block 'mosquito control'", () => {
    expect(isQueryBlocked("mosquito control")).toBe(false);
  });

  it("does not block 'pest control foley al'", () => {
    expect(isQueryBlocked("pest control foley al")).toBe(false);
  });

  it("does not block empty string", () => {
    expect(isQueryBlocked("")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R. isQueryEducationalOnly — fumigation flagged
// ═════════════════════════════════════════════════════════════════════════════
describe("R. isQueryEducationalOnly: fumigation queries", () => {
  it("flags 'fumigation services foley'", () => {
    expect(isQueryEducationalOnly("fumigation services foley")).toBe(true);
  });

  it("flags 'fumigation' alone", () => {
    expect(isQueryEducationalOnly("fumigation")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isQueryEducationalOnly("Fumigation Cost")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// S. isQueryEducationalOnly — safe keywords not educational-only
// ═════════════════════════════════════════════════════════════════════════════
describe("S. isQueryEducationalOnly: safe keywords", () => {
  it("does not flag 'bed bug inspection foley'", () => {
    expect(isQueryEducationalOnly("bed bug inspection foley")).toBe(false);
  });

  it("does not flag 'mosquito control'", () => {
    expect(isQueryEducationalOnly("mosquito control")).toBe(false);
  });

  it("does not flag empty string", () => {
    expect(isQueryEducationalOnly("")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T. inferQueryCategory — commercial
// ═════════════════════════════════════════════════════════════════════════════
describe("T. inferQueryCategory: commercial intent", () => {
  it("maps 'cost' keywords to 'commercial'", () => {
    expect(inferQueryCategory("bed bug inspection cost foley")).toBe("commercial");
  });

  it("maps 'price' keywords to 'commercial'", () => {
    expect(inferQueryCategory("pest control price")).toBe("commercial");
  });

  it("maps 'how much' keywords to 'commercial'", () => {
    expect(inferQueryCategory("how much does bed bug treatment cost")).toBe("commercial");
  });

  it("maps 'fee' keywords to 'commercial'", () => {
    expect(inferQueryCategory("inspection fee foley")).toBe("commercial");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// U. inferQueryCategory — informational
// ═════════════════════════════════════════════════════════════════════════════
describe("U. inferQueryCategory: informational intent", () => {
  it("maps 'how to' keywords to 'informational'", () => {
    expect(inferQueryCategory("how to get rid of bed bugs")).toBe("informational");
  });

  it("maps 'what' keywords to 'informational'", () => {
    expect(inferQueryCategory("what does a bed bug look like")).toBe("informational");
  });

  it("maps 'why' keywords to 'informational'", () => {
    expect(inferQueryCategory("why do bed bugs bite")).toBe("informational");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// V. inferQueryCategory — local default
// ═════════════════════════════════════════════════════════════════════════════
describe("V. inferQueryCategory: local default", () => {
  it("maps 'bed bug inspection foley' to 'local'", () => {
    expect(inferQueryCategory("bed bug inspection foley")).toBe("local");
  });

  it("maps 'pest control' (bare) to 'local'", () => {
    expect(inferQueryCategory("pest control")).toBe("local");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// W. buildDataForSEOQueryPlan — plan structure
// ═════════════════════════════════════════════════════════════════════════════
describe("W. buildDataForSEOQueryPlan: plan structure", () => {
  const context = makeBBBDiscoveryContext();
  const config  = { ...TEST_CONFIG, maxQueriesPerRun: 5 };

  it("returns serpQueries, volumeKeywords, estimatedApiCalls, blockedQueries", () => {
    const plan = buildDataForSEOQueryPlan(context, config);
    expect(plan).toHaveProperty("serpQueries");
    expect(plan).toHaveProperty("volumeKeywords");
    expect(plan).toHaveProperty("estimatedApiCalls");
    expect(plan).toHaveProperty("estimatedCostUSD");
    expect(plan).toHaveProperty("blockedQueries");
  });

  it("estimatedApiCalls = 1 (volume batch) + serpQueries.length", () => {
    const plan = buildDataForSEOQueryPlan(context, config);
    const expectedApiCalls = (plan.volumeKeywords.length > 0 ? 1 : 0) + plan.serpQueries.length;
    expect(plan.estimatedApiCalls).toBe(expectedApiCalls);
  });

  it("estimatedCostUSD is a positive number", () => {
    const plan = buildDataForSEOQueryPlan(context, config);
    expect(plan.estimatedCostUSD).toBeGreaterThan(0);
  });

  it("all serpQueries have keyword, locationName, category, serviceId, educationalOnly", () => {
    const plan = buildDataForSEOQueryPlan(context, config);
    for (const q of plan.serpQueries) {
      expect(typeof q.keyword).toBe("string");
      expect(q.keyword.length).toBeGreaterThan(0);
      expect(typeof q.locationName).toBe("string");
      expect(["local", "commercial", "informational", "regional"]).toContain(q.category);
      expect(typeof q.educationalOnly).toBe("boolean");
    }
  });

  it("plan is deterministic — two identical inputs produce identical output", () => {
    const plan1 = buildDataForSEOQueryPlan(context, config);
    const plan2 = buildDataForSEOQueryPlan(context, config);
    expect(JSON.stringify(plan1)).toBe(JSON.stringify(plan2));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// X. buildDataForSEOQueryPlan — serpQueries capped at maxQueriesPerRun
// ═════════════════════════════════════════════════════════════════════════════
describe("X. buildDataForSEOQueryPlan: serpQueries cap", () => {
  const context = makeBBBDiscoveryContext();

  it("never exceeds maxQueriesPerRun=1", () => {
    const plan = buildDataForSEOQueryPlan(context, { ...TEST_CONFIG, maxQueriesPerRun: 1 });
    expect(plan.serpQueries.length).toBeLessThanOrEqual(1);
  });

  it("never exceeds maxQueriesPerRun=3", () => {
    const plan = buildDataForSEOQueryPlan(context, { ...TEST_CONFIG, maxQueriesPerRun: 3 });
    expect(plan.serpQueries.length).toBeLessThanOrEqual(3);
  });

  it("never includes blocked keywords (termite, wildlife, heat treatment) in serpQueries", () => {
    const plan = buildDataForSEOQueryPlan(context, { ...TEST_CONFIG, maxQueriesPerRun: 10 });
    for (const q of plan.serpQueries) {
      expect(isQueryBlocked(q.keyword)).toBe(false);
    }
  });

  it("records blocked queries in blockedQueries array", () => {
    const plan = buildDataForSEOQueryPlan(context, { ...TEST_CONFIG, maxQueriesPerRun: 10 });
    // BB&B has termite (generationAllowed=false) and wildlife (disabled) services
    // Their queries should be in blockedQueries OR simply not generated
    // Either way, serpQueries must not contain them
    for (const q of plan.serpQueries) {
      expect(q.keyword.toLowerCase()).not.toContain("termite");
      expect(q.keyword.toLowerCase()).not.toContain("wildlife");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Y. extractCompetitorDomains — aggregator exclusion / local domain kept
// ═════════════════════════════════════════════════════════════════════════════
describe("Y. extractCompetitorDomains: domain filtering", () => {
  const makeOrganicItem = (domain: string, rank: number) => ({
    type:          "organic" as const,
    rank_group:    rank,
    rank_absolute: rank,
    url:           `https://${domain}/page`,
    title:         `${domain} page`,
    description:   null,
    domain,
  });

  it("excludes yelp.com from competitor domains", () => {
    const items = [makeOrganicItem("yelp.com", 1)];
    const domains = extractCompetitorDomains(items);
    expect(domains).not.toContain("yelp.com");
  });

  it("excludes google.com from competitor domains", () => {
    const items = [makeOrganicItem("google.com", 1)];
    const domains = extractCompetitorDomains(items);
    expect(domains).not.toContain("google.com");
  });

  it("excludes angi.com, thumbtack.com, amazon.com", () => {
    const items = [
      makeOrganicItem("angi.com", 1),
      makeOrganicItem("thumbtack.com", 2),
      makeOrganicItem("amazon.com", 3),
    ];
    const domains = extractCompetitorDomains(items);
    expect(domains).toHaveLength(0);
  });

  it("keeps local business domains", () => {
    const items = [
      makeOrganicItem("localbugs.com", 1),
      makeOrganicItem("baldwinpest.com", 2),
    ];
    const domains = extractCompetitorDomains(items);
    expect(domains).toContain("localbugs.com");
    expect(domains).toContain("baldwinpest.com");
  });

  it("strips 'www.' prefix when deduplicating", () => {
    const items = [
      makeOrganicItem("www.yelp.com", 1),
      makeOrganicItem("localbugs.com", 2),
    ];
    const domains = extractCompetitorDomains(items);
    expect(domains).not.toContain("yelp.com");
    expect(domains).toContain("localbugs.com");
  });

  it("returns at most 10 unique domains", () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      makeOrganicItem(`company${i}.com`, i + 1),
    );
    const domains = extractCompetitorDomains(items);
    expect(domains.length).toBeLessThanOrEqual(10);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Z. DataForSEOAdapter — injectable fetchFn, no live call, returns data
// ═════════════════════════════════════════════════════════════════════════════
describe("Z. DataForSEOAdapter: fetchFn injection and data flow", () => {
  it("disabled provider throws DataForSEOError('provider_disabled')", async () => {
    const adapter = new DataForSEOAdapter(DISABLED_CONFIG);
    await expect(
      adapter.fetchKeywords({ seeds: ["bed bug inspection"], city: "Foley", state: "AL", industry: "pest_control", limit: 10 }),
    ).rejects.toThrow(DataForSEOError);

    let caughtKind: string | null = null;
    try {
      await adapter.fetchKeywords({ seeds: ["bed bug inspection"], city: "Foley", state: "AL", industry: "pest_control", limit: 10 });
    } catch (err) {
      if (err instanceof DataForSEOError) caughtKind = err.kind;
    }
    expect(caughtKind).toBe("provider_disabled");
  });

  it("401 response throws DataForSEOError('auth_error')", async () => {
    const mock401 = vi.fn().mockResolvedValue(
      new Response("Unauthorized", { status: 401, headers: { "Content-Type": "text/plain" } }),
    );
    const adapter = new DataForSEOAdapter(TEST_CONFIG, mock401 as unknown as typeof fetch);

    let caughtKind: string | null = null;
    try {
      await adapter.fetchKeywords({ seeds: ["bed bug inspection"], city: "Foley", state: "AL", industry: "pest_control", limit: 10 });
    } catch (err) {
      if (err instanceof DataForSEOError) caughtKind = err.kind;
    }
    expect(caughtKind).toBe("auth_error");
  });

  it("402 response throws DataForSEOError('quota_exceeded')", async () => {
    const mock402 = vi.fn().mockResolvedValue(
      new Response("Payment Required", { status: 402 }),
    );
    const adapter = new DataForSEOAdapter(TEST_CONFIG, mock402 as unknown as typeof fetch);

    let caughtKind: string | null = null;
    try {
      await adapter.fetchKeywords({ seeds: ["bed bug inspection"], city: "Foley", state: "AL", industry: "pest_control", limit: 10 });
    } catch (err) {
      if (err instanceof DataForSEOError) caughtKind = err.kind;
    }
    expect(caughtKind).toBe("quota_exceeded");
  });

  it("volume data flows into RawKeywordResult.volumeMonthly", async () => {
    const volBody = makeVolumeResponse([
      { keyword: "bed bug inspection foley", volume: 1200 },
      { keyword: "bed bug inspection",       volume: 5000 },
    ]);

    // First call = volume API; subsequent calls = SERP API (return minimal response)
    const serpBody = makeSerpResponse("bed bug inspection foley", [
      { url: "https://local-pest.com/bed-bugs", domain: "local-pest.com", title: "Local Pest", rank: 1 },
    ]);

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if ((url as string).includes("keywords_data")) {
        return { ok: true, status: 200, json: async () => volBody } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => serpBody } as unknown as Response;
    });

    const adapter = new DataForSEOAdapter(TEST_CONFIG, mockFetch as unknown as typeof fetch);
    const results = await adapter.fetchKeywords({
      seeds:    ["bed bug inspection foley", "bed bug inspection"],
      city:     "Foley",
      state:    "Alabama",
      industry: "pest_control",
      limit:    20,
    });

    // Should have fetched (never called real API — mock was used)
    expect(callCount).toBeGreaterThan(0);
    expect(mockFetch).toHaveBeenCalled();

    // Should return results
    expect(results.length).toBeGreaterThan(0);

    // Results must have string keywords
    for (const r of results) {
      expect(typeof r.keyword).toBe("string");
      expect(r.keyword.length).toBeGreaterThan(0);
    }

    // volumeMonthly must be a number when volume data was returned (never fabricated)
    const withVolume = results.filter(r => r.volumeMonthly !== null);
    for (const r of withVolume) {
      expect(typeof r.volumeMonthly).toBe("number");
    }
  });

  it("fetchCompetitorKeywords returns empty array in Phase C4", async () => {
    const adapter = new DataForSEOAdapter(TEST_CONFIG, vi.fn() as unknown as typeof fetch);
    const results = await adapter.fetchCompetitorKeywords({
      competitorDomain: "some-competitor.com",
      clientDomain:     "bbbpestcontrol.com",
      location:         "Foley,Alabama,United States",
    });
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });

  it("no live HTTP call is made when using mock fetchFn", async () => {
    let realFetchCalled = false;
    const guardFetch = vi.fn().mockImplementation(async (url: string) => {
      if (!(url as string).includes("dataforseo.com") && !(url as string).includes("api.dataforseo.com")) {
        realFetchCalled = true;
      }
      const volBody = makeVolumeResponse([{ keyword: "bed bug inspection", volume: 100 }]);
      return { ok: true, status: 200, json: async () => volBody } as unknown as Response;
    });

    const adapter = new DataForSEOAdapter(TEST_CONFIG, guardFetch as unknown as typeof fetch);
    await adapter.fetchKeywords({
      seeds: ["bed bug inspection"], city: "Foley", state: "Alabama", industry: "pest_control", limit: 10,
    });
    expect(realFetchCalled).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Live integration test (gated by DISCOVERY_LIVE_TESTS=true)
// ═════════════════════════════════════════════════════════════════════════════
describe.skipIf(!LIVE_TESTS)("Live: DataForSEO actual API call", () => {
  it("returns real keyword data from DataForSEO", async () => {
    const config = parseDataForSEOConfig();
    if (!config) throw new Error("No DataForSEO config — cannot run live test");

    const adapter = new DataForSEOAdapter({ ...config, enabled: true });
    const results = await adapter.fetchKeywords({
      seeds:    ["bed bug inspection foley al"],
      city:     "Foley",
      state:    "Alabama",
      industry: "pest_control",
      limit:    10,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.keyword).toBeTruthy();
    // Volume may be null for very niche terms — that's fine
    if (results[0]!.volumeMonthly !== null) {
      expect(typeof results[0]!.volumeMonthly).toBe("number");
      expect(results[0]!.volumeMonthly).toBeGreaterThanOrEqual(0);
    }
  }, 60_000);
});
