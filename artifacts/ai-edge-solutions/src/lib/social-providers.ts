// ── Canonical Social Platform Registry ───────────────────────────────────────
// Single source of truth for all social provider metadata.
// Imported by: ConnectionsPage, SocialPublishingPage, AutoContentEnginePage,
//              SystemDiagnosticsPage, BBBContentAutopilotPage (Phase 2).
//
// Rules:
//  - capabilities reflect what AI Edge has implemented, not what the platform supports.
//  - status reflects current production readiness, not eventual roadmap state.
//  - Do not rename provider IDs — they must match database `provider` column values.

export type SocialProviderId =
  | "google_business"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "youtube"
  | "tiktok";

export type ProviderStatus =
  | "operational"      // live and publish-ready; backend + OAuth fully approved
  | "pending_approval" // full backend pipeline implemented; awaiting platform app review
  | "coming_soon";     // OAuth connect exists; publish pipeline not yet implemented

export type ProviderCapabilities = {
  connect: boolean;      // OAuth connect flow is implemented and working
  generateText: boolean; // AI text content generation is implemented for this provider
  generateImage: boolean;// AI image generation is routed to this provider
  generateVideo: boolean;// AI video generation is routed to this provider
  queue: boolean;        // /social-posts queue supports this provider
  publish: boolean;      // /social-posts/:id/publish handler is implemented for this provider
  schedule: boolean;     // scheduled publishing is supported for this provider
  analytics: boolean;    // engagement metrics are fetched and stored for this provider
};

export interface SocialProvider {
  id: SocialProviderId;
  label: string;        // full display name, e.g. "Facebook Pages"
  shortLabel: string;   // compact name for buttons/tabs, e.g. "Facebook"
  description: string;
  abbreviation: string; // 1-2 char chip avatar, e.g. "IG", "f", "G"
  icon: string;         // single-char glyph for inline display, e.g. "f", "✦", "▶"
  color: string;        // primary hex color — brand-accurate, readable on dark bg
  gradient: string;     // CSS linear-gradient for card/chip backgrounds
  connectionPath: string;
  status: ProviderStatus;
  capabilities: ProviderCapabilities;
}

export const SOCIAL_PROVIDERS: SocialProvider[] = [
  {
    id: "facebook",
    label: "Facebook Pages",
    shortLabel: "Facebook",
    description: "Publish posts directly to your Facebook Business Page.",
    abbreviation: "f",
    icon: "f",
    color: "#1877F2",
    gradient: "linear-gradient(135deg, #1877F2, #0C5BC4)",
    connectionPath: "/admin/connections",
    status: "operational",
    capabilities: {
      connect: true,
      generateText: true,
      generateImage: false,
      generateVideo: false,
      queue: true,
      publish: true,
      schedule: true,
      analytics: false,
    },
  },
  {
    id: "instagram",
    label: "Instagram Business",
    shortLabel: "Instagram",
    description: "Publish captions and media to your Instagram Business account.",
    abbreviation: "IG",
    icon: "✦",
    color: "#E1306C",
    gradient: "linear-gradient(135deg, #833AB4, #E1306C, #F77737)",
    connectionPath: "/admin/connections",
    status: "operational",
    capabilities: {
      connect: true,
      generateText: true,
      generateImage: false,
      generateVideo: false,
      queue: true,
      publish: true,
      schedule: true,
      analytics: false,
    },
  },
  {
    id: "google_business",
    label: "Google Business Profile",
    shortLabel: "Google",
    description: "Publish posts and updates to your Google Business listing.",
    abbreviation: "G",
    icon: "G",
    color: "#4285F4",
    gradient: "linear-gradient(135deg, #4285F4, #34A853)",
    connectionPath: "/admin/connections",
    status: "operational",
    capabilities: {
      connect: true,
      generateText: true,
      generateImage: false,
      generateVideo: false,
      queue: true,
      publish: true,
      schedule: true,
      analytics: false,
    },
  },
  {
    id: "youtube",
    label: "YouTube",
    shortLabel: "YouTube",
    description: "Upload Shorts and videos to your YouTube channel.",
    abbreviation: "▶",
    icon: "▶",
    color: "#FF0000",
    gradient: "linear-gradient(135deg, #FF0000, #CC0000)",
    connectionPath: "/admin/connections",
    // publish handler exists; google.com OAuth sensitive scope requires app verification
    status: "pending_approval",
    capabilities: {
      connect: true,
      generateText: true,
      generateImage: false,
      generateVideo: false,
      queue: true,
      publish: true,   // handler in social-posts.ts; requires youtube.upload scope approval
      schedule: false,
      analytics: false,
    },
  },
  {
    id: "tiktok",
    label: "TikTok Business",
    shortLabel: "TikTok",
    description: "Publish videos to your TikTok Business account.",
    abbreviation: "T",
    icon: "♪",
    color: "#69C9D0",
    gradient: "linear-gradient(135deg, #010101, #25F4EE)",
    connectionPath: "/admin/connections",
    // full publish pipeline implemented; connected as read-only pending TikTok app review
    status: "pending_approval",
    capabilities: {
      connect: true,
      generateText: true,
      generateImage: false,
      generateVideo: false,
      queue: true,
      publish: true,   // handler in social-posts.ts; pending TikTok Business app approval
      schedule: false,
      analytics: false,
    },
  },
  {
    id: "linkedin",
    label: "LinkedIn Company Pages",
    shortLabel: "LinkedIn",
    description: "Publish updates to your LinkedIn company page.",
    abbreviation: "in",
    icon: "in",
    color: "#0A66C2",
    gradient: "linear-gradient(135deg, #0A66C2, #004182)",
    connectionPath: "/admin/connections",
    status: "coming_soon",
    capabilities: {
      connect: true,   // OAuth flow exists in social-connections.ts
      generateText: true,
      generateImage: false,
      generateVideo: false,
      queue: false,    // no publish handler implemented yet
      publish: false,
      schedule: false,
      analytics: false,
    },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getSocialProvider(id: SocialProviderId): SocialProvider {
  const p = SOCIAL_PROVIDERS.find(p => p.id === id);
  if (!p) throw new Error(`Unknown social provider: "${id}"`);
  return p;
}

export function getPublishingProviders(): SocialProvider[] {
  return SOCIAL_PROVIDERS.filter(p => p.capabilities.publish);
}

export function getConnectedAccountProviders(): SocialProvider[] {
  return SOCIAL_PROVIDERS.filter(p => p.capabilities.connect);
}

export function providerSupports(id: SocialProviderId, capability: keyof ProviderCapabilities): boolean {
  return getSocialProvider(id).capabilities[capability];
}
