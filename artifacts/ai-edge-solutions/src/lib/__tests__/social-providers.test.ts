import { describe, it, expect } from "vitest";
import {
  SOCIAL_PROVIDERS,
  getSocialProvider,
  getPublishingProviders,
  getConnectedAccountProviders,
  providerSupports,
  type SocialProviderId,
  type ProviderCapabilities,
} from "../social-providers";

// Expected canonical provider IDs — must stay in sync with DB `provider` column values
const EXPECTED_IDS: SocialProviderId[] = [
  "facebook",
  "instagram",
  "google_business",
  "youtube",
  "tiktok",
  "linkedin",
  "pinterest",
  "nextdoor",
  "x_twitter",
];

const CAPABILITY_KEYS: (keyof ProviderCapabilities)[] = [
  "connect",
  "generateText",
  "generateImage",
  "generateVideo",
  "queue",
  "publish",
  "schedule",
  "analytics",
];

// Providers with a confirmed backend publish handler in social-posts.ts
const BACKEND_PUBLISH_IMPLEMENTED: SocialProviderId[] = [
  "facebook",
  "instagram",
  "google_business",
  "youtube",
  "tiktok",
];

describe("SOCIAL_PROVIDERS registry", () => {
  it("contains exactly the expected provider IDs", () => {
    const ids = SOCIAL_PROVIDERS.map(p => p.id).sort();
    expect(ids).toEqual([...EXPECTED_IDS].sort());
  });

  it("has unique provider IDs", () => {
    const ids = SOCIAL_PROVIDERS.map(p => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every provider has required display metadata", () => {
    for (const p of SOCIAL_PROVIDERS) {
      expect(p.label, `${p.id}.label`).toBeTruthy();
      expect(p.shortLabel, `${p.id}.shortLabel`).toBeTruthy();
      expect(p.description, `${p.id}.description`).toBeTruthy();
      expect(p.abbreviation, `${p.id}.abbreviation`).toBeTruthy();
      expect(p.icon, `${p.id}.icon`).toBeTruthy();
      expect(p.color, `${p.id}.color`).toMatch(/^#[0-9A-Fa-f]{3,6}$/);
      expect(p.gradient, `${p.id}.gradient`).toContain("linear-gradient");
      expect(p.connectionPath, `${p.id}.connectionPath`).toMatch(/^\/admin\//);
      expect(["operational", "pending_approval", "coming_soon"]).toContain(p.status);
    }
  });

  it("every provider has a complete capabilities object with only boolean values", () => {
    for (const p of SOCIAL_PROVIDERS) {
      for (const key of CAPABILITY_KEYS) {
        expect(typeof p.capabilities[key], `${p.id}.capabilities.${key}`).toBe("boolean");
      }
    }
  });

  it("no provider marked publish-capable without a confirmed backend implementation", () => {
    const publishCapable = SOCIAL_PROVIDERS.filter(p => p.capabilities.publish).map(p => p.id);
    for (const id of publishCapable) {
      expect(BACKEND_PUBLISH_IMPLEMENTED, `${id} marked publish=true but no backend handler`).toContain(id);
    }
  });

  it("linkedin is not marked publish-capable (no backend handler exists)", () => {
    const linkedin = getSocialProvider("linkedin");
    expect(linkedin.capabilities.publish).toBe(false);
    // queue:true is correct — linkedin drafts are saved for manual posting
    expect(linkedin.capabilities.queue).toBe(true);
  });
});

describe("getSocialProvider", () => {
  it("returns the correct provider for each canonical ID", () => {
    for (const id of EXPECTED_IDS) {
      const p = getSocialProvider(id);
      expect(p.id).toBe(id);
    }
  });

  it("throws for an unknown provider ID", () => {
    expect(() => getSocialProvider("twitter" as SocialProviderId)).toThrow(/Unknown social provider/);
  });
});

describe("getPublishingProviders", () => {
  it("returns only providers with publish capability", () => {
    const providers = getPublishingProviders();
    for (const p of providers) {
      expect(p.capabilities.publish).toBe(true);
    }
  });

  it("includes facebook, instagram, google_business, youtube, tiktok", () => {
    const ids = getPublishingProviders().map(p => p.id);
    expect(ids).toContain("facebook");
    expect(ids).toContain("instagram");
    expect(ids).toContain("google_business");
    expect(ids).toContain("youtube");
    expect(ids).toContain("tiktok");
  });

  it("excludes linkedin (no backend publish handler)", () => {
    const ids = getPublishingProviders().map(p => p.id);
    expect(ids).not.toContain("linkedin");
  });
});

describe("getConnectedAccountProviders", () => {
  it("returns only providers with connect capability", () => {
    const providers = getConnectedAccountProviders();
    for (const p of providers) {
      expect(p.capabilities.connect).toBe(true);
    }
  });

  it("includes providers with OAuth connect flows (facebook/instagram/gbp/youtube/tiktok/linkedin)", () => {
    const ids = getConnectedAccountProviders().map(p => p.id);
    expect(ids).toContain("facebook");
    expect(ids).toContain("instagram");
    expect(ids).toContain("google_business");
    expect(ids).toContain("youtube");
    expect(ids).toContain("tiktok");
    expect(ids).toContain("linkedin");
    // pinterest/nextdoor/x_twitter have connect:false (no OAuth flow yet)
    expect(ids).not.toContain("pinterest");
    expect(ids).not.toContain("nextdoor");
    expect(ids).not.toContain("x_twitter");
  });
});

describe("providerSupports", () => {
  it("returns true for facebook.publish", () => {
    expect(providerSupports("facebook", "publish")).toBe(true);
  });

  it("returns false for linkedin.publish", () => {
    expect(providerSupports("linkedin", "publish")).toBe(false);
  });

  it("returns false for any provider.generateImage (not implemented)", () => {
    for (const id of EXPECTED_IDS) {
      expect(providerSupports(id, "generateImage"), `${id}.generateImage`).toBe(false);
    }
  });
});

describe("pending_approval vs coming_soon distinction", () => {
  it("youtube and tiktok are pending_approval (backend exists, awaiting platform review)", () => {
    expect(getSocialProvider("youtube").status).toBe("pending_approval");
    expect(getSocialProvider("tiktok").status).toBe("pending_approval");
  });

  it("linkedin is coming_soon (no publish backend implemented)", () => {
    expect(getSocialProvider("linkedin").status).toBe("coming_soon");
  });

  it("facebook, instagram, google_business are operational", () => {
    expect(getSocialProvider("facebook").status).toBe("operational");
    expect(getSocialProvider("instagram").status).toBe("operational");
    expect(getSocialProvider("google_business").status).toBe("operational");
  });

  it("pending_approval providers still have publish capability (backend is ready)", () => {
    const pending = SOCIAL_PROVIDERS.filter(p => p.status === "pending_approval");
    for (const p of pending) {
      expect(p.capabilities.publish, `${p.id} pending_approval should still have publish=true`).toBe(true);
    }
  });

  it("coming_soon providers do not have publish capability", () => {
    const comingSoon = SOCIAL_PROVIDERS.filter(p => p.status === "coming_soon");
    for (const p of comingSoon) {
      expect(p.capabilities.publish, `${p.id} coming_soon should have publish=false`).toBe(false);
    }
  });
});
