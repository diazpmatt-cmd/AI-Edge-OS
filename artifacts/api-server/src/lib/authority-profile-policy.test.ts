import { describe, expect, it } from "vitest";

import {
  normalizeAuthorityDomain,
  validateAuthorityProfileInput,
} from "./authority-profile-policy.js";

describe("authority profile policy", () => {
  it("normalizes owned domains", () => {
    expect(normalizeAuthorityDomain("https://WWW.Example.com/path?q=1")).toBe("example.com");
    expect(normalizeAuthorityDomain("example.com")).toBe("example.com");
  });

  it("dedupes explicit tenant scope", () => {
    const result = validateAuthorityProfileInput({
      primaryDomain: "Example.com",
      primaryWebsite: "https://example.com/",
      primaryCity: "Foley",
      primaryRegion: "Baldwin County, Alabama",
      geography: ["Foley", " Foley ", "Baldwin County"],
      serviceIds: ["bed_bugs", "bed_bugs", "roaches"],
      discoveryEnabled: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primaryDomain).toBe("example.com");
      expect(result.value.primaryCity).toBe("Foley");
      expect(result.value.primaryRegion).toBe("Baldwin County, Alabama");
      expect(result.value.geography).toEqual(["Foley", "Baldwin County"]);
      expect(result.value.serviceIds).toEqual(["bed_bugs", "roaches"]);
    }
  });

  it("refuses to enable discovery without explicit city, region, geography, and services", () => {
    const result = validateAuthorityProfileInput({
      primaryDomain: "example.com",
      primaryCity: null,
      primaryRegion: null,
      geography: [],
      serviceIds: [],
      discoveryEnabled: true,
    });
    expect(result).toMatchObject({
      ok: false,
      code: "AUTHORITY_PROFILE_SCOPE_INCOMPLETE",
    });
  });

  it("rejects a website on another domain", () => {
    const result = validateAuthorityProfileInput({
      primaryDomain: "example.com",
      primaryWebsite: "https://other.example.org/",
      primaryCity: "Foley",
      primaryRegion: "Baldwin County, Alabama",
      geography: ["Foley"],
      serviceIds: ["bed_bugs"],
      discoveryEnabled: false,
    });
    expect(result).toMatchObject({
      ok: false,
      code: "AUTHORITY_PROFILE_WEBSITE_INVALID",
    });
  });

  it("allows an incomplete profile to be saved while discovery stays disabled", () => {
    const result = validateAuthorityProfileInput({
      primaryDomain: "example.com",
      geography: [],
      serviceIds: [],
      discoveryEnabled: false,
    });
    expect(result.ok).toBe(true);
  });
});
