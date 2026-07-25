/**
 * backlink-c8r8.test.ts — C8R-8 Production Backlink Provider Readiness
 *
 * Pure-function coverage for the new provider infrastructure:
 *
 *  Group A — parseDataForSEOBacklinkConfig (11 tests)
 *    A01  Returns null when DATAFORSEO_LOGIN is absent
 *    A02  Returns null when DATAFORSEO_PASSWORD is absent
 *    A03  Returns null when both credentials are absent
 *    A04  Returns config object when credentials are present
 *    A05  enabled=false when BACKLINK_DATAFORSEO_ENABLED is absent
 *    A06  enabled=false when BACKLINK_DATAFORSEO_ENABLED is "false"
 *    A07  enabled=true when BACKLINK_DATAFORSEO_ENABLED is "true"
 *    A08  Defaults apply when optional vars are absent
 *    A09  Custom timeout and retry values are respected
 *    A10  maxRequestsPerRun is clamped to [1, 50]
 *    A11  Custom base URL is used when DATAFORSEO_BASE_URL is set
 *
 *  Group B — getDataForSEOBacklinkHealthState (6 tests)
 *    B01  Returns unconfigured when config is null
 *    B02  Returns disabled when config.enabled is false
 *    B03  Returns configured when config.enabled is true
 *    B04  Unconfigured: reason is non-empty, login is null
 *    B05  Disabled: reason is non-empty, login is null
 *    B06  Configured: login matches, reason is null — password is NOT present
 *
 *  Group C — BacklinkProviderError (5 tests)
 *    C01  Kind is set correctly
 *    C02  Message prefix is [backlink_provider:<kind>]
 *    C03  statusCode defaults to null
 *    C04  statusCode set when provided
 *    C05  Name is "BacklinkProviderError"
 *
 *  Group D — BacklinkProviderRegistry — registration (5 tests)
 *    D01  Empty registry: list returns []
 *    D02  Registered provider appears in list
 *    D03  Multiple providers appear in registration order
 *    D04  Duplicate registration throws
 *    D05  size reflects registration count
 *
 *  Group E — BacklinkProviderRegistry — getHealth (4 tests)
 *    E01  getHealth returns null for unknown name
 *    E02  getHealth calls the registered getHealth function
 *    E03  getHealth reflects live state (not cached)
 *    E04  getHealth never exposes credentials
 *
 *  Group F — BacklinkProviderRegistry — resolve (7 tests)
 *    F01  Returns null when no providers registered
 *    F02  Returns null when all providers are disabled
 *    F03  Returns null when all providers are unconfigured
 *    F04  Returns configured provider
 *    F05  Higher-priority provider wins over lower-priority
 *    F06  Falls back to lower-priority when higher is disabled
 *    F07  Skips providers missing required capabilities
 *
 *  Group G — BacklinkProviderRegistry — healthReport (8 tests)
 *    G01  Empty registry: total=0, overallStatus="unavailable"
 *    G02  All configured: overallStatus="ready"
 *    G03  Mix disabled+unconfigured: overallStatus="degraded"
 *    G04  All unconfigured: overallStatus="unavailable"
 *    G05  Counts are accurate
 *    G06  activationInstructions is non-null when no configured provider
 *    G07  activationInstructions is null when ≥1 configured
 *    G08  Report providers list matches registered providers
 */

import { describe, expect, it, vi } from "vitest";
import {
  parseDataForSEOBacklinkConfig,
  getDataForSEOBacklinkHealthState,
  BacklinkProviderError,
  type DataForSEOBacklinkConfig,
  type BacklinkProviderHealthState,
} from "../../../../../lib/db/src/backlink-provider-config";
import {
  BacklinkProviderRegistry,
  type BacklinkProviderRegistration,
} from "../../../../../lib/db/src/backlink-provider-registry";
import type { BacklinkDataProvider, BacklinkDiscoveryInput } from "../../../../../lib/db/src/backlink-providers";
import type { BacklinkCapability } from "../../../../../lib/db/src/backlink-types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CRED_ENV: Record<string, string | undefined> = {
  DATAFORSEO_LOGIN:    "test@example.com",
  DATAFORSEO_PASSWORD: "secret",
};

function makeConfig(overrides: Partial<DataForSEOBacklinkConfig> = {}): DataForSEOBacklinkConfig {
  return {
    login:              "user@example.com",
    password:           "pw",
    baseUrl:            "https://api.dataforseo.com",
    enabled:            true,
    maxRequestsPerRun:  10,
    retry: { maxAttempts: 2, delayMs: 2000, timeoutMs: 30_000 },
    ...overrides,
  };
}

function makeHealthState(overrides: Partial<BacklinkProviderHealthState> = {}): BacklinkProviderHealthState {
  return {
    provider: "test_provider",
    status:   "configured",
    reason:   null,
    login:    "user@example.com",
    ...overrides,
  };
}

function makeProvider(
  name:         string,
  capabilities: BacklinkCapability[] = ["referring_domains"],
): BacklinkDataProvider {
  return {
    name,
    capabilities: new Set(capabilities),
    discover:     vi.fn().mockResolvedValue([]),
  };
}

function makeRegistration(
  provider:  BacklinkDataProvider,
  status:    "configured" | "disabled" | "unconfigured" = "configured",
  priority   = 1,
): BacklinkProviderRegistration {
  return {
    provider,
    getHealth: () => makeHealthState({ provider: provider.name, status,
      reason: status !== "configured" ? "test reason" : null,
      login:  status === "configured"  ? "u@e.com"    : null }),
    priority,
  };
}

// ── Group A — parseDataForSEOBacklinkConfig ───────────────────────────────────

describe("parseDataForSEOBacklinkConfig", () => {
  it("A01: returns null when DATAFORSEO_LOGIN is absent", () => {
    expect(parseDataForSEOBacklinkConfig({ DATAFORSEO_PASSWORD: "pw" })).toBeNull();
  });

  it("A02: returns null when DATAFORSEO_PASSWORD is absent", () => {
    expect(parseDataForSEOBacklinkConfig({ DATAFORSEO_LOGIN: "u@e.com" })).toBeNull();
  });

  it("A03: returns null when both credentials are absent", () => {
    expect(parseDataForSEOBacklinkConfig({})).toBeNull();
  });

  it("A04: returns config when credentials are present", () => {
    const cfg = parseDataForSEOBacklinkConfig(CRED_ENV);
    expect(cfg).not.toBeNull();
    expect(cfg!.login).toBe("test@example.com");
    expect(cfg!.password).toBe("secret");
  });

  it("A05: enabled=false when BACKLINK_DATAFORSEO_ENABLED is absent", () => {
    const cfg = parseDataForSEOBacklinkConfig(CRED_ENV);
    expect(cfg!.enabled).toBe(false);
  });

  it("A06: enabled=false when BACKLINK_DATAFORSEO_ENABLED is 'false'", () => {
    const cfg = parseDataForSEOBacklinkConfig({ ...CRED_ENV, BACKLINK_DATAFORSEO_ENABLED: "false" });
    expect(cfg!.enabled).toBe(false);
  });

  it("A07: enabled=true when BACKLINK_DATAFORSEO_ENABLED is 'true'", () => {
    const cfg = parseDataForSEOBacklinkConfig({ ...CRED_ENV, BACKLINK_DATAFORSEO_ENABLED: "true" });
    expect(cfg!.enabled).toBe(true);
  });

  it("A08: defaults apply when optional vars are absent", () => {
    const cfg = parseDataForSEOBacklinkConfig(CRED_ENV)!;
    expect(cfg.maxRequestsPerRun).toBe(10);
    expect(cfg.retry.timeoutMs).toBe(30_000);
    expect(cfg.retry.delayMs).toBe(2_000);
    expect(cfg.retry.maxAttempts).toBe(2);   // default retryMax=1 → maxAttempts=2
    expect(cfg.baseUrl).toBe("https://api.dataforseo.com");
  });

  it("A09: custom timeout and retry values are respected", () => {
    const cfg = parseDataForSEOBacklinkConfig({
      ...CRED_ENV,
      BACKLINK_PROVIDER_TIMEOUT_MS: "15000",
      BACKLINK_RETRY_MAX:           "2",
      BACKLINK_RETRY_DELAY_MS:      "500",
    })!;
    expect(cfg.retry.timeoutMs).toBe(15_000);
    expect(cfg.retry.maxAttempts).toBe(3);    // retryMax=2 → maxAttempts=3
    expect(cfg.retry.delayMs).toBe(500);
  });

  it("A10: maxRequestsPerRun is clamped to [1, 50]", () => {
    const low = parseDataForSEOBacklinkConfig({ ...CRED_ENV, BACKLINK_MAX_REQUESTS_PER_RUN: "0" })!;
    expect(low.maxRequestsPerRun).toBe(1);

    const high = parseDataForSEOBacklinkConfig({ ...CRED_ENV, BACKLINK_MAX_REQUESTS_PER_RUN: "200" })!;
    expect(high.maxRequestsPerRun).toBe(50);
  });

  it("A11: custom base URL is used when DATAFORSEO_BASE_URL is set", () => {
    const cfg = parseDataForSEOBacklinkConfig({
      ...CRED_ENV,
      DATAFORSEO_BASE_URL: "https://sandbox.dataforseo.com",
    })!;
    expect(cfg.baseUrl).toBe("https://sandbox.dataforseo.com");
  });
});

// ── Group B — getDataForSEOBacklinkHealthState ────────────────────────────────

describe("getDataForSEOBacklinkHealthState", () => {
  it("B01: returns unconfigured when config is null", () => {
    const h = getDataForSEOBacklinkHealthState(null);
    expect(h.status).toBe("unconfigured");
    expect(h.provider).toBe("dataforseo_backlinks");
  });

  it("B02: returns disabled when config.enabled is false", () => {
    const h = getDataForSEOBacklinkHealthState(makeConfig({ enabled: false }));
    expect(h.status).toBe("disabled");
  });

  it("B03: returns configured when config.enabled is true", () => {
    const h = getDataForSEOBacklinkHealthState(makeConfig({ enabled: true }));
    expect(h.status).toBe("configured");
  });

  it("B04: unconfigured state has non-empty reason and null login", () => {
    const h = getDataForSEOBacklinkHealthState(null);
    expect(h.reason).toBeTruthy();
    expect(h.login).toBeNull();
  });

  it("B05: disabled state has non-empty reason and null login", () => {
    const h = getDataForSEOBacklinkHealthState(makeConfig({ enabled: false }));
    expect(h.reason).toBeTruthy();
    expect(h.login).toBeNull();
  });

  it("B06: configured state has login set and reason null — password absent", () => {
    const h = getDataForSEOBacklinkHealthState(makeConfig({ login: "admin@co.com", enabled: true }));
    expect(h.status).toBe("configured");
    expect(h.login).toBe("admin@co.com");
    expect(h.reason).toBeNull();
    // Health state must never expose the password
    expect(JSON.stringify(h)).not.toContain("pw");
    expect(JSON.stringify(h)).not.toContain("password");
  });
});

// ── Group C — BacklinkProviderError ──────────────────────────────────────────

describe("BacklinkProviderError", () => {
  it("C01: kind is set correctly", () => {
    const e = new BacklinkProviderError("auth_error", "bad creds");
    expect(e.kind).toBe("auth_error");
  });

  it("C02: message has [backlink_provider:<kind>] prefix", () => {
    const e = new BacklinkProviderError("timeout", "too slow");
    expect(e.message).toMatch(/^\[backlink_provider:timeout\]/);
    expect(e.message).toContain("too slow");
  });

  it("C03: statusCode defaults to null", () => {
    const e = new BacklinkProviderError("provider_error", "oops");
    expect(e.statusCode).toBeNull();
  });

  it("C04: statusCode is set when provided", () => {
    const e = new BacklinkProviderError("quota_exceeded", "out of quota", 402);
    expect(e.statusCode).toBe(402);
  });

  it("C05: name is BacklinkProviderError", () => {
    const e = new BacklinkProviderError("rate_limited", "slow down");
    expect(e.name).toBe("BacklinkProviderError");
    expect(e).toBeInstanceOf(Error);
  });
});

// ── Group D — BacklinkProviderRegistry — registration ────────────────────────

describe("BacklinkProviderRegistry — registration", () => {
  it("D01: empty registry returns empty list", () => {
    const r = new BacklinkProviderRegistry();
    expect(r.list()).toEqual([]);
  });

  it("D02: registered provider appears in list", () => {
    const r = new BacklinkProviderRegistry();
    r.register(makeRegistration(makeProvider("provA")));
    expect(r.list()).toContain("provA");
  });

  it("D03: multiple providers appear in registration order", () => {
    const r = new BacklinkProviderRegistry();
    r.register(makeRegistration(makeProvider("first")));
    r.register(makeRegistration(makeProvider("second")));
    expect(r.list()).toEqual(["first", "second"]);
  });

  it("D04: duplicate registration throws", () => {
    const r = new BacklinkProviderRegistry();
    r.register(makeRegistration(makeProvider("dup")));
    expect(() => r.register(makeRegistration(makeProvider("dup")))).toThrow();
  });

  it("D05: size reflects registration count", () => {
    const r = new BacklinkProviderRegistry();
    expect(r.size).toBe(0);
    r.register(makeRegistration(makeProvider("a")));
    expect(r.size).toBe(1);
    r.register(makeRegistration(makeProvider("b")));
    expect(r.size).toBe(2);
  });
});

// ── Group E — BacklinkProviderRegistry — getHealth ───────────────────────────

describe("BacklinkProviderRegistry — getHealth", () => {
  it("E01: getHealth returns null for unknown name", () => {
    const r = new BacklinkProviderRegistry();
    expect(r.getHealth("unknown")).toBeNull();
  });

  it("E02: getHealth calls the registered function and returns its result", () => {
    const r = new BacklinkProviderRegistry();
    const getHealth = vi.fn().mockReturnValue(makeHealthState({ provider: "live" }));
    r.register({ provider: makeProvider("live"), getHealth, priority: 1 });
    const h = r.getHealth("live");
    expect(h).not.toBeNull();
    expect(h!.provider).toBe("live");
    expect(getHealth).toHaveBeenCalledOnce();
  });

  it("E03: getHealth reflects live state (called fresh each time)", () => {
    const r     = new BacklinkProviderRegistry();
    let   calls = 0;
    const getHealth = () => {
      calls++;
      return makeHealthState({ status: calls === 1 ? "disabled" : "configured" });
    };
    r.register({ provider: makeProvider("dynamic"), getHealth, priority: 1 });
    expect(r.getHealth("dynamic")!.status).toBe("disabled");
    expect(r.getHealth("dynamic")!.status).toBe("configured");
  });

  it("E04: getHealth result never exposes the password field", () => {
    const r    = new BacklinkProviderRegistry();
    const priv = { login: "u@e.com", password: "SECRET" };
    r.register({
      provider:  makeProvider("private"),
      getHealth: () => ({ provider: "private", status: "configured", reason: null, login: priv.login }),
      priority:  1,
    });
    const h = r.getHealth("private")!;
    expect(JSON.stringify(h)).not.toContain("SECRET");
    expect(JSON.stringify(h)).not.toContain("password");
  });
});

// ── Group F — BacklinkProviderRegistry — resolve ──────────────────────────────

describe("BacklinkProviderRegistry — resolve", () => {
  it("F01: returns null when no providers registered", () => {
    const r = new BacklinkProviderRegistry();
    expect(r.resolve()).toBeNull();
  });

  it("F02: returns null when all providers are disabled", () => {
    const r = new BacklinkProviderRegistry();
    r.register(makeRegistration(makeProvider("a"), "disabled"));
    expect(r.resolve()).toBeNull();
  });

  it("F03: returns null when all providers are unconfigured", () => {
    const r = new BacklinkProviderRegistry();
    r.register(makeRegistration(makeProvider("a"), "unconfigured"));
    expect(r.resolve()).toBeNull();
  });

  it("F04: returns a configured provider", () => {
    const r   = new BacklinkProviderRegistry();
    const prov = makeProvider("live");
    r.register(makeRegistration(prov, "configured"));
    expect(r.resolve()).toBe(prov);
  });

  it("F05: higher-priority configured provider wins", () => {
    const r    = new BacklinkProviderRegistry();
    const low  = makeProvider("low");
    const high = makeProvider("high");
    r.register(makeRegistration(low,  "configured", 1));
    r.register(makeRegistration(high, "configured", 10));
    expect(r.resolve()).toBe(high);
  });

  it("F06: falls back to lower-priority when higher-priority is disabled", () => {
    const r    = new BacklinkProviderRegistry();
    const low  = makeProvider("fixture");
    const high = makeProvider("live");
    r.register(makeRegistration(low,  "configured", 1));
    r.register(makeRegistration(high, "disabled",   10));
    expect(r.resolve()).toBe(low);
  });

  it("F07: skips providers that lack required capabilities", () => {
    const r         = new BacklinkProviderRegistry();
    const noLinks   = makeProvider("partial", ["referring_domains"]);
    const allCaps   = makeProvider("full",    ["referring_domains", "link_intersections"]);
    r.register(makeRegistration(noLinks, "configured", 10));
    r.register(makeRegistration(allCaps, "configured",  1));
    const required  = new Set<BacklinkCapability>(["referring_domains", "link_intersections"]);
    expect(r.resolve(required)).toBe(allCaps);
  });
});

// ── Group G — BacklinkProviderRegistry — healthReport ────────────────────────

describe("BacklinkProviderRegistry — healthReport", () => {
  it("G01: empty registry produces unavailable report with total=0", () => {
    const r      = new BacklinkProviderRegistry();
    const report = r.healthReport();
    expect(report.total).toBe(0);
    expect(report.overallStatus).toBe("unavailable");
    expect(report.configured).toBe(0);
    expect(report.disabled).toBe(0);
    expect(report.unconfigured).toBe(0);
  });

  it("G02: all configured => overallStatus=ready", () => {
    const r = new BacklinkProviderRegistry();
    r.register(makeRegistration(makeProvider("a"), "configured"));
    r.register(makeRegistration(makeProvider("b"), "configured"));
    expect(r.healthReport().overallStatus).toBe("ready");
  });

  it("G03: mix disabled+unconfigured (none configured) => overallStatus=degraded", () => {
    const r = new BacklinkProviderRegistry();
    r.register(makeRegistration(makeProvider("x"), "disabled"));
    r.register(makeRegistration(makeProvider("y"), "unconfigured"));
    expect(r.healthReport().overallStatus).toBe("degraded");
  });

  it("G04: all unconfigured => overallStatus=unavailable", () => {
    const r = new BacklinkProviderRegistry();
    r.register(makeRegistration(makeProvider("x"), "unconfigured"));
    expect(r.healthReport().overallStatus).toBe("unavailable");
  });

  it("G05: counts are accurate for a mixed registry", () => {
    const r = new BacklinkProviderRegistry();
    r.register(makeRegistration(makeProvider("c"), "configured"));
    r.register(makeRegistration(makeProvider("d"), "disabled"));
    r.register(makeRegistration(makeProvider("u"), "unconfigured"));
    const report = r.healthReport();
    expect(report.total).toBe(3);
    expect(report.configured).toBe(1);
    expect(report.disabled).toBe(1);
    expect(report.unconfigured).toBe(1);
  });

  it("G06: activationInstructions is non-null when no configured provider", () => {
    const r = new BacklinkProviderRegistry();
    r.register(makeRegistration(makeProvider("d"), "disabled"));
    expect(r.healthReport().activationInstructions).toBeTruthy();
  });

  it("G07: activationInstructions is null when at least one provider is configured", () => {
    const r = new BacklinkProviderRegistry();
    r.register(makeRegistration(makeProvider("c"), "configured"));
    r.register(makeRegistration(makeProvider("d"), "disabled"));
    expect(r.healthReport().activationInstructions).toBeNull();
  });

  it("G08: providers list in report matches all registered providers", () => {
    const r = new BacklinkProviderRegistry();
    r.register(makeRegistration(makeProvider("pA"), "configured"));
    r.register(makeRegistration(makeProvider("pB"), "disabled"));
    const report = r.healthReport();
    expect(report.providers).toHaveLength(2);
    const names = report.providers.map((p) => p.provider);
    expect(names).toContain("pA");
    expect(names).toContain("pB");
  });
});
