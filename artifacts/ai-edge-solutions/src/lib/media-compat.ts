// ── Platform Media Compatibility ─────────────────────────────────────────────
// Derived from the implemented publish handlers in api-server/src/routes/social-posts.ts
// as of 2026-07-11.  "Supported" means the handler can PUBLISH it.
// "source_only" / "thumbnail_only" means the file is stored but not published as-is.
// Do not claim support unless the handler implements it.

import type { SocialProviderId } from "./social-providers";
import type { MediaKind } from "./media-config";

export type ImageCompat  = "required" | "optional" | "thumbnail_only" | "not_supported";
export type VideoCompat  = "required" | "optional" | "not_supported";
export type AudioCompat  = "source_only" | "not_supported";

export interface PlatformMediaCompat {
  image: ImageCompat;
  video: VideoCompat;
  audio: AudioCompat;
  note?: string;
}

export const PLATFORM_MEDIA_COMPAT: Record<SocialProviderId, PlatformMediaCompat> = {
  facebook: {
    image: "optional",
    video: "not_supported",
    audio: "not_supported",
    note: "Images post to Facebook Page photos. Text-only also supported.",
  },
  instagram: {
    image: "required",
    video: "not_supported",
    audio: "not_supported",
    note: "Instagram API requires an image URL. Text-only posts will fail.",
  },
  google_business: {
    image: "optional",
    video: "not_supported",
    audio: "not_supported",
    note: "GBP Posts API blocked while GCP quota is zero.",
  },
  youtube: {
    image: "thumbnail_only",
    video: "required",
    audio: "source_only",
    note: "YouTube requires an MP4. MP3 is stored as an audio source asset only.",
  },
  tiktok: {
    image: "not_supported",
    video: "not_supported",
    audio: "not_supported",
    note: "TikTok pending platform approval.",
  },
  linkedin: {
    image: "not_supported",
    video: "not_supported",
    audio: "not_supported",
    note: "LinkedIn publish handler not yet implemented.",
  },
  pinterest: {
    image: "not_supported",
    video: "not_supported",
    audio: "not_supported",
    note: "Pinterest publish handler not yet implemented.",
  },
  nextdoor: {
    image: "not_supported",
    video: "not_supported",
    audio: "not_supported",
    note: "Nextdoor is manual copy-paste only.",
  },
  x_twitter: {
    image: "not_supported",
    video: "not_supported",
    audio: "not_supported",
    note: "X/Twitter publish not implemented.",
  },
};

// ── Readiness derivation ──────────────────────────────────────────────────────

export interface MediaReadiness {
  imageReady:       boolean;
  videoReady:       boolean;
  audioSourceReady: boolean;
  publishReady:     boolean;
  warnings: Array<{ platform: SocialProviderId; message: string }>;
  blockers: Array<{ platform: SocialProviderId; message: string }>;
}

export function deriveMediaReadiness(
  platforms:  SocialProviderId[],
  mediaKind:  MediaKind | null,
  hasVideoUrl: boolean,
): MediaReadiness {
  const warnings: Array<{ platform: SocialProviderId; message: string }> = [];
  const blockers:  Array<{ platform: SocialProviderId; message: string }> = [];

  const imageReady       = mediaKind === "image";
  const videoReady       = mediaKind === "video" && hasVideoUrl;
  const audioSourceReady = mediaKind === "audio";

  for (const platform of platforms) {
    const compat = PLATFORM_MEDIA_COMPAT[platform];

    if (platform === "youtube") {
      if (!videoReady) {
        if (audioSourceReady) {
          blockers.push({ platform, message: "Audio source attached — a finished MP4 is required for YouTube. Video assembly needed." });
        } else {
          blockers.push({ platform, message: "YouTube requires an MP4 video. Attach an MP4 to publish." });
        }
      }
    }

    if (platform === "instagram" && !imageReady) {
      blockers.push({ platform, message: "Instagram requires an image (JPG, PNG, WEBP, or GIF)." });
    }

    if (mediaKind === "audio" && compat.audio === "not_supported") {
      warnings.push({ platform, message: `${platform} cannot publish audio. MP3 is stored as a source asset only.` });
    }

    if (mediaKind === "video" && compat.video === "not_supported" && platform !== "youtube") {
      warnings.push({ platform, message: `${platform}: video publishing not yet implemented — post will use text only.` });
    }
  }

  return {
    imageReady,
    videoReady,
    audioSourceReady,
    publishReady: blockers.length === 0 && platforms.length > 0,
    warnings,
    blockers,
  };
}

// ── Quick helper ──────────────────────────────────────────────────────────────

export function platformAcceptsKind(provider: SocialProviderId, kind: MediaKind): boolean {
  const c = PLATFORM_MEDIA_COMPAT[provider];
  if (kind === "image") return c.image !== "not_supported";
  if (kind === "video") return c.video !== "not_supported";
  return c.audio !== "not_supported";
}
