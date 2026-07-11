// Phase 2 — Content Autopilot Platform Selection Tests
// Tests the CONTENT_PROFILES registry + QUEUEABLE_PROVIDERS alignment.

import { describe, it, expect } from "vitest";
import { QUEUEABLE_PROVIDERS, SOCIAL_PROVIDERS } from "../social-providers";
import type { SocialProviderId } from "../social-providers";

// Mirror of the page constants (re-declared here for test isolation)
const MEDIA_TYPES = ["image", "video", "carousel", "text", "pin", "article"] as const;
type MediaType = typeof MEDIA_TYPES[number];

interface ContentProfile {
  mediaType: MediaType;
  maxLength: string;
  bestFormat: string;
  frequency: string;
  ctaTip: string;
  hashtagCount: string;
  note: string;
}

// Import from page file via direct copy (page is the source of truth)
// We re-declare here to avoid importing React components in a unit test.
const CONTENT_PROFILES: Record<SocialProviderId, ContentProfile> = {
  facebook: {
    mediaType: "image", maxLength: "400–500 chars", bestFormat: "Photo + text post",
    frequency: "3–5x/week", ctaTip: "Include a direct phone number or link every time",
    hashtagCount: "3–5", note: "Photos outperform text-only. Respond to comments within 24h.",
  },
  instagram: {
    mediaType: "image", maxLength: "125–220 chars", bestFormat: "Square photo + caption",
    frequency: "3–5x/week", ctaTip: "Use 5–15 local hashtags and tag your city",
    hashtagCount: "5–15", note: "Before/after photos perform best. Post Stories daily for reach.",
  },
  google_business: {
    mediaType: "image", maxLength: "1,500 chars", bestFormat: "Photo + update post",
    frequency: "1–2x/week", ctaTip: "Include service-area cities in every post",
    hashtagCount: "0–2", note: "Add a photo to every post. Use keywords like 'bed bug treatment Baldwin County'.",
  },
  youtube: {
    mediaType: "video", maxLength: "4,000 chars", bestFormat: "Video + description",
    frequency: "1–2x/month", ctaTip: "End every video with a clear phone number CTA",
    hashtagCount: "5–8", note: "Use as full video description. Add timestamps and local keywords for SEO.",
  },
  tiktok: {
    mediaType: "video", maxLength: "100–150 chars", bestFormat: "Short-form video + caption",
    frequency: "3–7x/week", ctaTip: "Hook viewers in the first second; keep CTAs short",
    hashtagCount: "3–5 trending", note: "Keep captions punchy. Use trending + niche hashtags.",
  },
  linkedin: {
    mediaType: "article", maxLength: "1,500 chars", bestFormat: "Text post or article",
    frequency: "2–3x/week", ctaTip: "Target property managers and vacation rental hosts",
    hashtagCount: "3–5", note: "Professional tone. Data-driven content performs best. Connect with rental networks.",
  },
  pinterest: {
    mediaType: "pin", maxLength: "500 chars", bestFormat: "Vertical image (2:3) + description",
    frequency: "5–10 pins/week", ctaTip: "Keyword-rich descriptions; link pins to your website",
    hashtagCount: "3–5", note: "Vertical images (2:3 ratio) perform best. Create a 'Pest Prevention Tips' board.",
  },
  nextdoor: {
    mediaType: "text", maxLength: "300 chars", bestFormat: "Conversational update",
    frequency: "1–2x/week", ctaTip: "Neighbor-to-neighbor tone; no hard sell",
    hashtagCount: "0", note: "Avoid hard-sell language. Share seasonal alerts & local tips. Respond quickly.",
  },
};

// ──────────────────────────────────────────────────────────────
describe("Content Profiles — every queueable platform has a profile", () => {
  it("has a content profile for every queueable provider", () => {
    const queueableIds = QUEUEABLE_PROVIDERS.map(p => p.id);
    const profileIds = Object.keys(CONTENT_PROFILES);
    expect(new Set(profileIds)).toEqual(new Set(queueableIds));
  });

  it("has no profiles for non-queueable providers", () => {
    const nonQueueable = SOCIAL_PROVIDERS.filter(
      p => !QUEUEABLE_PROVIDERS.some(q => q.id === p.id),
    );
    for (const p of nonQueueable) {
      expect(CONTENT_PROFILES[p.id]).toBeUndefined();
    }
  });
});

describe("Content Profiles — all fields populated", () => {
  for (const id of Object.keys(CONTENT_PROFILES) as SocialProviderId[]) {
    const prof = CONTENT_PROFILES[id];
    it(`${id}: mediaType is valid`, () => {
      expect(MEDIA_TYPES).toContain(prof.mediaType);
    });
    it(`${id}: maxLength is non-empty`, () => {
      expect(prof.maxLength.length).toBeGreaterThan(0);
    });
    it(`${id}: bestFormat is non-empty`, () => {
      expect(prof.bestFormat.length).toBeGreaterThan(0);
    });
    it(`${id}: frequency is non-empty`, () => {
      expect(prof.frequency.length).toBeGreaterThan(0);
    });
    it(`${id}: ctaTip is non-empty`, () => {
      expect(prof.ctaTip.length).toBeGreaterThan(0);
    });
    it(`${id}: hashtagCount is non-empty`, () => {
      expect(prof.hashtagCount.length).toBeGreaterThan(0);
    });
    it(`${id}: note is non-empty`, () => {
      expect(prof.note.length).toBeGreaterThan(0);
    });
  }
});

describe("Content Profiles — media types match platform expectations", () => {
  it("video platforms use video mediaType", () => {
    expect(CONTENT_PROFILES.youtube.mediaType).toBe("video");
    expect(CONTENT_PROFILES.tiktok.mediaType).toBe("video");
  });

  it("image platforms use image mediaType", () => {
    expect(CONTENT_PROFILES.facebook.mediaType).toBe("image");
    expect(CONTENT_PROFILES.instagram.mediaType).toBe("image");
    expect(CONTENT_PROFILES.google_business.mediaType).toBe("image");
  });

  it("Pinterest uses pin mediaType", () => {
    expect(CONTENT_PROFILES.pinterest.mediaType).toBe("pin");
  });

  it("LinkedIn uses article mediaType", () => {
    expect(CONTENT_PROFILES.linkedin.mediaType).toBe("article");
  });

  it("Nextdoor uses text mediaType", () => {
    expect(CONTENT_PROFILES.nextdoor.mediaType).toBe("text");
  });
});

describe("Queueable providers — capabilities alignment", () => {
  it("every queueable provider also has queue=true", () => {
    for (const p of QUEUEABLE_PROVIDERS) {
      expect(p.capabilities.queue, `${p.id}.queue`).toBe(true);
    }
  });

  it("queueable set equals all providers with queue=true regardless of status", () => {
    const expected = SOCIAL_PROVIDERS.filter(p => p.capabilities.queue);
    expect(QUEUEABLE_PROVIDERS.map(p => p.id).sort()).toEqual(expected.map(p => p.id).sort());
  });
});
