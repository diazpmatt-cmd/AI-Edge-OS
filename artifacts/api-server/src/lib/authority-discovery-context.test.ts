import { describe, expect, it } from "vitest";

import { buildAuthorityDiscoveryContext } from "./authority-discovery-context.js";
import type { StoredAuthorityProfile } from "./authority-profile-store.js";

const profile = (overrides: Partial<StoredAuthorityProfile> = {}): StoredAuthorityProfile => ({
  id: "profile-1",
  clientId: "client-1",
  primaryDomain: "example.com",
  primaryWebsite: "https://example.com/",
  primaryCity: "Foley",
  primaryRegion: "Baldwin County, Alabama",
  geography: ["Foley, AL", "Daphne, AL"],
  serviceIds: ["bed_bug_treatment", "roaches"],
  discoveryEnabled: true,
  source: "manual",
  createdAt: new Date("2026-08-07T00:00:00.000Z"),
  updatedAt: new Date("2026-08-07T00:00:00.000Z"),
  ...overrides,
});

describe("buildAuthorityDiscoveryContext", () => {
  it("builds provider input only from tenant-owned profile and canonical competitors", () => {
    const result = buildAuthorityDiscoveryContext({
      profile: profile(),
      competitorDomains: ["www.competitor.com", "example.com", "competitor.com"],
      activeServiceIds: ["bed_bug_treatment", "roaches", "ants"],
    });
    expect(result).toMatchObject({
      ok: true,
      discovery: {
        clientId: "client-1",
        clientDomain: "example.com",
        competitorDomains: ["competitor.com"],
        serviceIds: ["bed_bug_treatment", "roaches"],
        city: "Foley",
        region: "Baldwin County, Alabama",
        limit: 50,
      },
    });
  });

  it("fails closed when discovery is disabled", () => {
    expect(buildAuthorityDiscoveryContext({
      profile: profile({ discoveryEnabled: false }),
      competitorDomains: [],
      activeServiceIds: ["bed_bug_treatment", "roaches"],
    })).toMatchObject({ ok: false, code: "AUTHORITY_DISCOVERY_DISABLED" });
  });

  it("fails closed when canonical service scope becomes stale", () => {
    expect(buildAuthorityDiscoveryContext({
      profile: profile(),
      competitorDomains: [],
      activeServiceIds: ["bed_bug_treatment"],
    })).toMatchObject({ ok: false, code: "AUTHORITY_PROFILE_SERVICE_SCOPE_STALE" });
  });

  it("fails closed without explicit city or region", () => {
    expect(buildAuthorityDiscoveryContext({
      profile: profile({ primaryCity: null }),
      competitorDomains: [],
      activeServiceIds: ["bed_bug_treatment", "roaches"],
    })).toMatchObject({ ok: false, code: "AUTHORITY_PROFILE_SCOPE_INCOMPLETE" });
  });
});
