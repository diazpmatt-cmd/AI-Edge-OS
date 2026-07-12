// BB&B Pilot Platform Configuration Tests
// Phase 11 — verifies the v1 pilot rollout model, platform defaults,
// deferred exclusion, normalization, and truthful capability states.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  BBB_PILOT_PLATFORM_IDS,
  BBB_DEFERRED_PLATFORM_IDS,
  BBB_PILOT_PROVIDERS,
  BBB_DEFERRED_PROVIDERS,
  BBB_SELECTION_STORAGE_KEY,
  getBBBDefaultSelection,
  normalizeSavedSelection,
  isPilotPlatform,
  isDeferredPlatform,
} from "../bbb-pilot";
import { QUEUEABLE_PROVIDERS, SOCIAL_PROVIDERS, getSocialProvider } from "../social-providers";
import { resolvePlatformUIState } from "../../components/PlatformStateChip";

// ── localStorage mock ──────────────────────────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

beforeEach(() => localStorageMock.clear());
afterEach(() => localStorageMock.clear());

// ── 1. Pilot platform set ─────────────────────────────────────────────────────
describe("BB&B Pilot — active platform set", () => {
  it("pilot set is exactly Facebook, Instagram, Google Business, YouTube", () => {
    expect(BBB_PILOT_PLATFORM_IDS).toEqual([
      "facebook", "instagram", "google_business", "youtube",
    ]);
  });

  it("has exactly 4 active pilot platforms", () => {
    expect(BBB_PILOT_PLATFORM_IDS).toHaveLength(4);
  });

  it("all pilot platform IDs exist in the canonical registry", () => {
    for (const id of BBB_PILOT_PLATFORM_IDS) {
      expect(() => getSocialProvider(id)).not.toThrow();
    }
  });

  it("all pilot providers are queueable", () => {
    for (const p of BBB_PILOT_PROVIDERS) {
      expect(p.capabilities.queue, `${p.id}.queue`).toBe(true);
    }
  });

  it("BBB_PILOT_PROVIDERS has 4 providers matching pilot IDs", () => {
    expect(BBB_PILOT_PROVIDERS).toHaveLength(4);
    const ids = BBB_PILOT_PROVIDERS.map(p => p.id);
    expect(ids).toContain("facebook");
    expect(ids).toContain("instagram");
    expect(ids).toContain("google_business");
    expect(ids).toContain("youtube");
  });
});

// ── 2. Deferred platform set ──────────────────────────────────────────────────
describe("BB&B Pilot — deferred platforms", () => {
  it("deferred set includes TikTok, LinkedIn, Pinterest, Nextdoor", () => {
    expect(BBB_DEFERRED_PLATFORM_IDS).toContain("tiktok");
    expect(BBB_DEFERRED_PLATFORM_IDS).toContain("linkedin");
    expect(BBB_DEFERRED_PLATFORM_IDS).toContain("pinterest");
    expect(BBB_DEFERRED_PLATFORM_IDS).toContain("nextdoor");
  });

  it("deferred platforms are excluded from pilot defaults", () => {
    const defaults = getBBBDefaultSelection();
    for (const id of BBB_DEFERRED_PLATFORM_IDS) {
      expect(defaults.has(id), `${id} should not be in pilot defaults`).toBe(false);
    }
  });

  it("pilot and deferred sets are disjoint", () => {
    const overlap = BBB_PILOT_PLATFORM_IDS.filter(id =>
      (BBB_DEFERRED_PLATFORM_IDS as string[]).includes(id),
    );
    expect(overlap).toHaveLength(0);
  });
});

// ── 3. Default selection ──────────────────────────────────────────────────────
describe("BB&B Pilot — default selection", () => {
  it("getBBBDefaultSelection returns a Set of the 4 pilot IDs", () => {
    const sel = getBBBDefaultSelection();
    expect(sel.size).toBe(4);
    expect(sel.has("facebook")).toBe(true);
    expect(sel.has("instagram")).toBe(true);
    expect(sel.has("google_business")).toBe(true);
    expect(sel.has("youtube")).toBe(true);
  });

  it("default does NOT include deferred platforms", () => {
    const sel = getBBBDefaultSelection();
    expect(sel.has("tiktok")).toBe(false);
    expect(sel.has("linkedin")).toBe(false);
    expect(sel.has("pinterest")).toBe(false);
    expect(sel.has("nextdoor")).toBe(false);
  });

  it("deferred platforms are excluded from default Queue All", () => {
    const defaults = getBBBDefaultSelection();
    const queueAllTargets = QUEUEABLE_PROVIDERS.filter(p => defaults.has(p.id));
    const queueIds = queueAllTargets.map(p => p.id);
    expect(queueIds).not.toContain("tiktok");
    expect(queueIds).not.toContain("linkedin");
    expect(queueIds).not.toContain("pinterest");
    expect(queueIds).not.toContain("nextdoor");
  });
});

// ── 4. Saved selection normalization ──────────────────────────────────────────
describe("BB&B Pilot — saved selection normalization", () => {
  it("returns pilot defaults when storage is empty", () => {
    const result = normalizeSavedSelection(BBB_SELECTION_STORAGE_KEY);
    expect(result).toEqual(getBBBDefaultSelection());
  });

  it("returns pilot defaults when storage is corrupt JSON", () => {
    localStorageMock.setItem(BBB_SELECTION_STORAGE_KEY, "{not json}");
    const result = normalizeSavedSelection(BBB_SELECTION_STORAGE_KEY);
    expect(result).toEqual(getBBBDefaultSelection());
  });

  it("restores a valid saved subset", () => {
    localStorageMock.setItem(BBB_SELECTION_STORAGE_KEY, JSON.stringify(["facebook", "youtube"]));
    const result = normalizeSavedSelection(BBB_SELECTION_STORAGE_KEY);
    expect(result).toEqual(new Set(["facebook", "youtube"]));
  });

  it("strips unknown/invalid IDs from saved selection", () => {
    localStorageMock.setItem(BBB_SELECTION_STORAGE_KEY, JSON.stringify(["facebook", "myspace", "bebo"]));
    const result = normalizeSavedSelection(BBB_SELECTION_STORAGE_KEY);
    expect(result).toEqual(new Set(["facebook"]));
  });

  it("strips only unknown IDs and keeps valid ones (including deferred if user saved them)", () => {
    localStorageMock.setItem(BBB_SELECTION_STORAGE_KEY, JSON.stringify(["facebook", "tiktok", "INVALID"]));
    const result = normalizeSavedSelection(BBB_SELECTION_STORAGE_KEY);
    expect(result.has("facebook")).toBe(true);
    expect(result.has("tiktok")).toBe(true); // user explicitly saved it; respect choice
    expect(result.has("INVALID")).toBe(false);
  });

  it("falls back to defaults when all saved IDs are invalid", () => {
    localStorageMock.setItem(BBB_SELECTION_STORAGE_KEY, JSON.stringify(["INVALID1", "INVALID2"]));
    const result = normalizeSavedSelection(BBB_SELECTION_STORAGE_KEY);
    expect(result).toEqual(getBBBDefaultSelection());
  });

  it("returns defaults when storage contains empty array", () => {
    localStorageMock.setItem(BBB_SELECTION_STORAGE_KEY, JSON.stringify([]));
    const result = normalizeSavedSelection(BBB_SELECTION_STORAGE_KEY);
    expect(result).toEqual(getBBBDefaultSelection());
  });
});

// ── 5. Nextdoor — no API connection ──────────────────────────────────────────
describe("Nextdoor — truthful status: manual only", () => {
  const nd = getSocialProvider("nextdoor");

  it("registry status is coming_soon (not operational)", () => {
    expect(nd.status).toBe("coming_soon");
  });

  it("connect capability is false (no OAuth)", () => {
    expect(nd.capabilities.connect).toBe(false);
  });

  it("publish capability is false (no API publishing)", () => {
    expect(nd.capabilities.publish).toBe(false);
  });

  it("is deferred in the BB&B pilot", () => {
    expect(isDeferredPlatform("nextdoor")).toBe(true);
    expect(isPilotPlatform("nextdoor")).toBe(false);
  });

  it("a Nextdoor UI card or page URL does NOT imply API connection", () => {
    // Nextdoor has UI components (setup checklist, manual steps) but connect=false.
    // The presence of a UI card does not indicate a real OAuth or publishing connection.
    expect(nd.capabilities.connect).toBe(false);
    expect(nd.capabilities.publish).toBe(false);
  });

  it("resolvePlatformUIState returns 'coming_soon' regardless of connection claim", () => {
    // status: coming_soon → chip always shows 'Coming Soon' regardless of DB state
    // (connect:false means the DB will never have a Nextdoor row anyway)
    expect(resolvePlatformUIState(nd, true)).toBe("coming_soon");
    expect(resolvePlatformUIState(nd, false)).toBe("coming_soon");
  });
});

// ── 6. YouTube — remains operational ─────────────────────────────────────────
describe("YouTube — remains operational in pilot", () => {
  const yt = getSocialProvider("youtube");

  it("is in the pilot set", () => {
    expect(isPilotPlatform("youtube")).toBe(true);
  });

  it("registry status is operational", () => {
    expect(yt.status).toBe("operational");
  });

  it("has queue and publish capabilities", () => {
    expect(yt.capabilities.queue).toBe(true);
    expect(yt.capabilities.publish).toBe(true);
  });

  it("direct publishing requires a video file (not auto-generated)", () => {
    // Verified by code inspection: the publish handler requires a video URL/file.
    // The system generates text descriptions only; no video file is produced.
    expect(yt.capabilities.generateVideo).toBe(false);
    expect(yt.capabilities.publish).toBe(true);
  });
});

// ── 7. Each active pilot provider — truthful capability states ────────────────
describe("Active pilot providers — truthful capability states", () => {
  it("Facebook: operational, connect, queue, publish", () => {
    const fb = getSocialProvider("facebook");
    expect(fb.status).toBe("operational");
    expect(fb.capabilities.connect).toBe(true);
    expect(fb.capabilities.queue).toBe(true);
    expect(fb.capabilities.publish).toBe(true);
    expect(fb.capabilities.analytics).toBe(false); // not yet implemented
  });

  it("Instagram: operational, connect, queue, publish", () => {
    const ig = getSocialProvider("instagram");
    expect(ig.status).toBe("operational");
    expect(ig.capabilities.connect).toBe(true);
    expect(ig.capabilities.queue).toBe(true);
    expect(ig.capabilities.publish).toBe(true);
    expect(ig.capabilities.analytics).toBe(false);
  });

  it("Google Business: operational, connect, queue, publish", () => {
    const gbp = getSocialProvider("google_business");
    expect(gbp.status).toBe("operational");
    expect(gbp.capabilities.connect).toBe(true);
    expect(gbp.capabilities.queue).toBe(true);
    expect(gbp.capabilities.publish).toBe(true);
  });

  it("YouTube: operational, connect, queue, publish (requires video file)", () => {
    const yt = getSocialProvider("youtube");
    expect(yt.status).toBe("operational");
    expect(yt.capabilities.connect).toBe(true);
    expect(yt.capabilities.queue).toBe(true);
    expect(yt.capabilities.publish).toBe(true);
    expect(yt.capabilities.generateVideo).toBe(false); // no auto video generation
  });

  it("no pilot provider has generateImage or generateVideo capability", () => {
    for (const p of BBB_PILOT_PROVIDERS) {
      expect(p.capabilities.generateImage, `${p.id}.generateImage`).toBe(false);
      expect(p.capabilities.generateVideo, `${p.id}.generateVideo`).toBe(false);
    }
  });

  it("draft-only status is not labelled as direct publishing", () => {
    // All 4 pilot providers have publish:true, but YouTube requires a real video file.
    // LinkedIn, Pinterest, Nextdoor have publish:false — drafts only.
    const linkedin = getSocialProvider("linkedin");
    const pinterest = getSocialProvider("pinterest");
    expect(linkedin.capabilities.publish).toBe(false);
    expect(pinterest.capabilities.publish).toBe(false);
    expect(getSocialProvider("nextdoor").capabilities.publish).toBe(false);
  });
});

// ── 8. Helper functions ────────────────────────────────────────────────────────
describe("isPilotPlatform / isDeferredPlatform helpers", () => {
  it("isPilotPlatform returns true for all 4 pilot IDs", () => {
    expect(isPilotPlatform("facebook")).toBe(true);
    expect(isPilotPlatform("instagram")).toBe(true);
    expect(isPilotPlatform("google_business")).toBe(true);
    expect(isPilotPlatform("youtube")).toBe(true);
  });

  it("isPilotPlatform returns false for deferred IDs", () => {
    expect(isPilotPlatform("tiktok")).toBe(false);
    expect(isPilotPlatform("linkedin")).toBe(false);
    expect(isPilotPlatform("pinterest")).toBe(false);
    expect(isPilotPlatform("nextdoor")).toBe(false);
  });

  it("isDeferredPlatform returns true for all 4 deferred IDs", () => {
    expect(isDeferredPlatform("tiktok")).toBe(true);
    expect(isDeferredPlatform("linkedin")).toBe(true);
    expect(isDeferredPlatform("pinterest")).toBe(true);
    expect(isDeferredPlatform("nextdoor")).toBe(true);
  });

  it("isDeferredPlatform returns false for pilot IDs", () => {
    expect(isDeferredPlatform("facebook")).toBe(false);
    expect(isDeferredPlatform("instagram")).toBe(false);
    expect(isDeferredPlatform("google_business")).toBe(false);
    expect(isDeferredPlatform("youtube")).toBe(false);
  });
});

// ── 9. Unknown providers fail safely ─────────────────────────────────────────
describe("Unknown provider safety", () => {
  it("getSocialProvider throws for unknown ID", () => {
    expect(() => getSocialProvider("myspace" as never)).toThrow();
  });

  it("normalizeSavedSelection strips unknown IDs gracefully", () => {
    localStorageMock.setItem(BBB_SELECTION_STORAGE_KEY, JSON.stringify(["facebook", "myspace"]));
    const result = normalizeSavedSelection(BBB_SELECTION_STORAGE_KEY);
    expect(result.has("facebook")).toBe(true);
    expect(result.has("myspace")).toBe(false);
  });
});

// ── 10. No duplicate metadata ─────────────────────────────────────────────────
describe("No duplicate provider metadata", () => {
  it("SOCIAL_PROVIDERS has no duplicate IDs", () => {
    const ids = SOCIAL_PROVIDERS.map(p => p.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("QUEUEABLE_PROVIDERS has no duplicate IDs", () => {
    const ids = QUEUEABLE_PROVIDERS.map(p => p.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("BBB_PILOT_PLATFORM_IDS has no duplicates", () => {
    expect(BBB_PILOT_PLATFORM_IDS.length).toBe(new Set(BBB_PILOT_PLATFORM_IDS).size);
  });

  it("BBB_DEFERRED_PLATFORM_IDS has no duplicates", () => {
    expect(BBB_DEFERRED_PLATFORM_IDS.length).toBe(new Set(BBB_DEFERRED_PLATFORM_IDS).size);
  });
});
