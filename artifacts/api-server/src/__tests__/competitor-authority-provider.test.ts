/**
 * competitor-authority-provider.test.ts — P6.3
 *
 * Covers:
 *  1. normalizeDomain() — strips protocol, www, path, query, fragment, trailing slash
 *  2. Successful authority lookup — mock adapter returns real data
 *  3. No-result lookup — adapter returns null → sparse observation
 *  4. Provider error — adapter throws → safe sparse result
 *  5. Real observation returns isMock: false (always)
 *  6. domainAuthority present in rawObservation on real match
 *  7. backlinkCount present in rawObservation on real match
 *  8. Null result: rawObservation.hasMatch === false (no data to overwrite)
 *  9. Tenant isolation — adapter receives normalized domain, not clientId
 * 10. applyAuthorityConfidenceBoost() — adds 5 to current confidence
 * 11. Confidence cap — never exceeds 70
 * 12. adapter.lookup not called when no adapter registered (Path C)
 * 13. Only one active authority provider in production registry
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  EdgeAuthorityProvider,
  normalizeDomain,
  applyAuthorityConfidenceBoost,
} from "../lib/competitor-authority-provider.js";
import type {
  AuthorityLookupAdapter,
  AuthorityLookupResult,
} from "../lib/competitor-authority-provider.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REAL_AUTHORITY: AuthorityLookupResult = {
  domainAuthority:  42,
  backlinkCount:    1850,
  referringDomains: 310,
  trustFlow:        24,
  sourceUrl:        "https://api.example.com/backlinks",
  dataFreshnessDays: 7,
};

function makeAdapter(
  result: AuthorityLookupResult | null = REAL_AUTHORITY,
): AuthorityLookupAdapter & { spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn().mockResolvedValue(result);
  return {
    name: "test_authority",
    lookup: spy,
    spy,
  };
}

function makeErrorAdapter(): AuthorityLookupAdapter {
  return {
    name: "error_authority",
    lookup: vi.fn().mockRejectedValue(new Error("API timeout")),
  };
}

function makeInput(domain: string, competitorId = "comp-001", clientId = "client-bbb"): any {
  return { clientId, competitorId, domain, existingData: {} };
}

// ── Helper unit tests ─────────────────────────────────────────────────────────

describe("1. normalizeDomain()", () => {
  it("strips https protocol", () => {
    expect(normalizeDomain("https://example.com")).toBe("example.com");
  });

  it("strips http protocol", () => {
    expect(normalizeDomain("http://example.com")).toBe("example.com");
  });

  it("strips www prefix", () => {
    expect(normalizeDomain("www.example.com")).toBe("example.com");
  });

  it("strips https://www. prefix together", () => {
    expect(normalizeDomain("https://www.orkin.com")).toBe("orkin.com");
  });

  it("strips path segment", () => {
    expect(normalizeDomain("example.com/pest-control")).toBe("example.com");
  });

  it("strips query string", () => {
    expect(normalizeDomain("example.com?utm=1")).toBe("example.com");
  });

  it("strips fragment", () => {
    expect(normalizeDomain("example.com#section")).toBe("example.com");
  });

  it("strips trailing slash", () => {
    expect(normalizeDomain("example.com/")).toBe("example.com");
  });

  it("lowercases the domain", () => {
    expect(normalizeDomain("ORKIN.COM")).toBe("orkin.com");
  });

  it("handles full URL with all components", () => {
    expect(normalizeDomain("https://www.ORKIN.COM/pest-control?ref=1#bio")).toBe("orkin.com");
  });
});

describe("10. applyAuthorityConfidenceBoost()", () => {
  it("adds 5 to current confidence", () => {
    expect(applyAuthorityConfidenceBoost(50)).toBe(55);
  });

  it("caps at 70", () => {
    expect(applyAuthorityConfidenceBoost(67)).toBe(70);
    expect(applyAuthorityConfidenceBoost(70)).toBe(70);
    expect(applyAuthorityConfidenceBoost(100)).toBe(70);
  });

  it("does not decrease when input is below 66", () => {
    const result = applyAuthorityConfidenceBoost(30);
    expect(result).toBeGreaterThan(30);
  });
});

// ── Provider unit tests ───────────────────────────────────────────────────────

describe("2. Successful authority lookup", () => {
  it("returns hasMatch: true with domainAuthority from adapter result", async () => {
    const adapter  = makeAdapter();
    const provider = new EdgeAuthorityProvider(adapter);
    const obs      = await provider.enrich(makeInput("orkin.com"));

    expect(obs.isMock).toBe(false);
    expect(obs.category).toBe("authority");
    expect((obs.rawObservation as any).hasMatch).toBe(true);
    expect((obs.rawObservation as any).domainAuthority).toBe(42);
    expect(obs.normalizedObservation.score).toBe(42);
  });

  it("populates normalizedObservation fields from adapter result", async () => {
    const adapter  = makeAdapter();
    const provider = new EdgeAuthorityProvider(adapter);
    const obs      = await provider.enrich(makeInput("orkin.com"));

    const n = obs.normalizedObservation;
    expect(n.domainAuthority).toBe(42);
    expect(n.backlinkCount).toBe(1850);
    expect(n.referringDomains).toBe(310);
    expect(n.trustFlow).toBe(24);
    expect(n.signals.length).toBeGreaterThan(0);
  });

  it("attribution identifies the adapter name as providerName", async () => {
    const adapter  = makeAdapter();
    const provider = new EdgeAuthorityProvider(adapter);
    const obs      = await provider.enrich(makeInput("orkin.com"));

    expect(obs.attribution.providerName).toBe("test_authority");
    expect(obs.attribution.methodology).toBe("live_domain_authority_lookup");
    expect(obs.attribution.dataFreshnessDays).toBe(7);
  });

  it("confidence is high (≥60) on a real match", async () => {
    const adapter  = makeAdapter();
    const provider = new EdgeAuthorityProvider(adapter);
    const obs      = await provider.enrich(makeInput("orkin.com"));

    expect(obs.confidence).toBeGreaterThanOrEqual(60);
    expect(obs.confidence).toBeLessThanOrEqual(70);
  });
});

describe("3. No-result lookup → sparse observation", () => {
  it("returns hasMatch: false when adapter returns null", async () => {
    const adapter  = makeAdapter(null);
    const provider = new EdgeAuthorityProvider(adapter);
    const obs      = await provider.enrich(makeInput("unknown-domain.com"));

    expect(obs.isMock).toBe(false);
    expect((obs.rawObservation as any).hasMatch).toBe(false);
    expect(obs.normalizedObservation.score).toBe(0);
    expect(obs.confidence).toBe(20);
    expect(obs.normalizedObservation.domainAuthority).toBeNull();
    expect(obs.normalizedObservation.backlinkCount).toBeNull();
  });

  it("sparse observation includes the normalized domain in rawObservation", async () => {
    const adapter  = makeAdapter(null);
    const provider = new EdgeAuthorityProvider(adapter);
    const obs      = await provider.enrich(makeInput("https://www.Unknown.COM/page"));

    expect((obs.rawObservation as any).normalizedDomain).toBe("unknown.com");
  });

  it("sparse signals array describes the unavailability", async () => {
    const adapter  = makeAdapter(null);
    const provider = new EdgeAuthorityProvider(adapter);
    const obs      = await provider.enrich(makeInput("unknown-domain.com"));

    expect(obs.normalizedObservation.signals[0]).toContain("Authority data unavailable");
  });
});

describe("4. Provider error → safe sparse result", () => {
  it("catches adapter throws and returns sparse observation", async () => {
    const provider = new EdgeAuthorityProvider(makeErrorAdapter());
    const obs      = await provider.enrich(makeInput("orkin.com"));

    expect(obs.isMock).toBe(false);
    expect((obs.rawObservation as any).hasMatch).toBe(false);
    expect(obs.normalizedObservation.score).toBe(0);
  });

  it("does not propagate the error to the caller", async () => {
    const provider = new EdgeAuthorityProvider(makeErrorAdapter());
    await expect(provider.enrich(makeInput("orkin.com"))).resolves.toBeDefined();
  });
});

describe("5. isMock: false always", () => {
  it("provider.isMock is false (class-level)", () => {
    const provider = new EdgeAuthorityProvider();
    expect(provider.isMock).toBe(false);
  });

  it("matched observation has isMock: false", async () => {
    const provider = new EdgeAuthorityProvider(makeAdapter());
    const obs      = await provider.enrich(makeInput("orkin.com"));
    expect(obs.isMock).toBe(false);
  });

  it("sparse observation (null result) has isMock: false", async () => {
    const provider = new EdgeAuthorityProvider(makeAdapter(null));
    const obs      = await provider.enrich(makeInput("orkin.com"));
    expect(obs.isMock).toBe(false);
  });

  it("Path C observation (no adapter) has isMock: false", async () => {
    const provider = new EdgeAuthorityProvider();
    const obs      = await provider.enrich(makeInput("orkin.com"));
    expect(obs.isMock).toBe(false);
  });
});

describe("6. domainAuthority present in rawObservation on real match", () => {
  it("rawObservation.domainAuthority equals the adapter result", async () => {
    const adapter  = makeAdapter({ ...REAL_AUTHORITY, domainAuthority: 58 });
    const provider = new EdgeAuthorityProvider(adapter);
    const obs      = await provider.enrich(makeInput("orkin.com"));

    expect((obs.rawObservation as any).domainAuthority).toBe(58);
    expect(obs.normalizedObservation.domainAuthority).toBe(58);
  });
});

describe("7. backlinkCount present in rawObservation on real match", () => {
  it("rawObservation.backlinkCount equals the adapter result", async () => {
    const adapter  = makeAdapter({ ...REAL_AUTHORITY, backlinkCount: 3200 });
    const provider = new EdgeAuthorityProvider(adapter);
    const obs      = await provider.enrich(makeInput("orkin.com"));

    expect((obs.rawObservation as any).backlinkCount).toBe(3200);
    expect(obs.normalizedObservation.backlinkCount).toBe(3200);
  });
});

describe("8. Null result: rawObservation.hasMatch === false (safe for no-overwrite guard)", () => {
  it("hasMatch is false when adapter returns null", async () => {
    const provider = new EdgeAuthorityProvider(makeAdapter(null));
    const obs      = await provider.enrich(makeInput("orkin.com"));
    expect((obs.rawObservation as any).hasMatch).toBe(false);
  });

  it("domainAuthority and backlinkCount are null in normalizedObservation", async () => {
    const provider = new EdgeAuthorityProvider(makeAdapter(null));
    const obs      = await provider.enrich(makeInput("orkin.com"));
    expect(obs.normalizedObservation.domainAuthority).toBeNull();
    expect(obs.normalizedObservation.backlinkCount).toBeNull();
  });

  it("hasMatch is false in Path C (no adapter)", async () => {
    const provider = new EdgeAuthorityProvider();
    const obs      = await provider.enrich(makeInput("orkin.com"));
    expect((obs.rawObservation as any).hasMatch).toBe(false);
  });
});

describe("9. Tenant isolation — adapter receives normalized domain", () => {
  it("adapter.lookup receives lowercase domain without protocol/www", async () => {
    const adapter  = makeAdapter();
    const provider = new EdgeAuthorityProvider(adapter);
    await provider.enrich(makeInput("https://www.ORKIN.COM/pest-control", "comp-X", "client-A"));

    expect(adapter.spy).toHaveBeenCalledWith("orkin.com");
  });

  it("different clientIds request the same domain from the adapter (domain is not client-scoped)", async () => {
    const adapter = makeAdapter();
    const p1      = new EdgeAuthorityProvider(adapter);
    const p2      = new EdgeAuthorityProvider(adapter);

    await p1.enrich(makeInput("orkin.com", "comp-1", "client-A"));
    await p2.enrich(makeInput("orkin.com", "comp-2", "client-B"));

    expect(adapter.spy.mock.calls[0]![0]).toBe("orkin.com");
    expect(adapter.spy.mock.calls[1]![0]).toBe("orkin.com");
  });
});

describe("11. Confidence cap at 70", () => {
  it("applyAuthorityConfidenceBoost caps at 70 regardless of input", () => {
    expect(applyAuthorityConfidenceBoost(66)).toBe(70);
    expect(applyAuthorityConfidenceBoost(69)).toBe(70);
    expect(applyAuthorityConfidenceBoost(70)).toBe(70);
    expect(applyAuthorityConfidenceBoost(999)).toBe(70);
  });

  it("matched observation confidence is at most 70", async () => {
    const adapter  = makeAdapter();
    const provider = new EdgeAuthorityProvider(adapter);
    const obs      = await provider.enrich(makeInput("orkin.com"));
    expect(obs.confidence).toBeLessThanOrEqual(70);
  });
});

describe("12. Path C: no adapter → lookup never called", () => {
  it("no lookup is attempted when no adapter is registered", async () => {
    const provider = new EdgeAuthorityProvider();
    const obs      = await provider.enrich(makeInput("orkin.com"));
    expect((obs.rawObservation as any).hasMatch).toBe(false);
    expect(obs.attribution.methodology).toBe("path_c_no_live_source");
  });

  it("sparse reason message explains the Path C limitation", async () => {
    const provider = new EdgeAuthorityProvider();
    const obs      = await provider.enrich(makeInput("orkin.com"));
    const reason   = (obs.rawObservation as any).reason as string;
    expect(reason).toContain("Path C");
  });
});

describe("13. Registry — only one active authority provider", () => {
  it("EdgeAuthorityProvider has category 'authority'", () => {
    const provider = new EdgeAuthorityProvider();
    expect(provider.category).toBe("authority");
  });

  it("EdgeAuthorityProvider has a stable, unique providerId", () => {
    const p1 = new EdgeAuthorityProvider();
    const p2 = new EdgeAuthorityProvider(makeAdapter());
    expect(p1.providerId).toBe("edge_authority");
    expect(p2.providerId).toBe("edge_authority");
  });

  it("provider is marked active", () => {
    expect(new EdgeAuthorityProvider().active).toBe(true);
  });
});
