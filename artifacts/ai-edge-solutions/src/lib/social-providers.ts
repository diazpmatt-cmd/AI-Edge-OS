// ── Canonical Social Platform Registry ───────────────────────────────────────
// Single source of truth for all social provider metadata.
// Imported by: ConnectionsPage, SocialPublishingPage, AutoContentEnginePage,
//              SystemDiagnosticsPage, BBBContentAutopilotPage.
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
  | "tiktok"
  | "pinterest"
  | "nextdoor"
  | "x_twitter";

export type ProviderStatus =
  | "operational"      // live and publish-ready; backend + OAuth fully approved
  | "pending_approval" // full backend pipeline implemented; awaiting platform app review
  | "coming_soon";     // OAuth connect exists; publish pipeline not yet implemented

export type ProviderCapabilities = {
  connect: boolean;      // OAuth connect flow is implemented and working
  generateText: boolean; // AI text content generation is implemented for this provider
  generateImage: boolean;// AI image generation is routed to this provider
  generateVideo: boolean;// AI video generation is routed to this provider
  queue: boolean;        // Content Autopilot can queue drafts for this provider
  publish: boolean;      // /social-posts/:id/publish handler is implemented for this provider
  schedule: boolean;     // scheduled publishing is supported for this provider
  analytics: boolean;    // engagement metrics are fetched and stored for this provider
};

export interface SocialProvider {
  id: SocialProviderId;
  label: string;        // full display name, e.g. "Facebook Pages"
  shortLabel: string;   // compact name for buttons/tabs, e.g. "Facebook"
  description: string;
  abbreviation: string; // 1-3 char chip avatar, e.g. "IG", "f", "G"
  icon: string;         // single glyph for inline display
  color: string;        // primary hex color — brand-accurate, readable on dark bg
  gradient: string;     // CSS linear-gradient for card/chip backgrounds
  connectionPath: string;
  status: ProviderStatus;
  capabilities: ProviderCapabilities;
}

export const SOCIAL_PROVIDERS: SocialProvider[] = [
  // ── Operational ────────────────────────────────────────────────────────────
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
      connect: true, generateText: true, generateImage: false, generateVideo: false,
      queue: true, publish: true, schedule: true, analytics: false,
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
      connect: true, generateText: true, generateImage: false, generateVideo: false,
      queue: true, publish: true, schedule: true, analytics: false,
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
      connect: true, generateText: true, generateImage: false, generateVideo: false,
      queue: true, publish: true, schedule: true, analytics: false,
    },
  },
  // ── Queue-ready (drafts queued in system; publishing pending platform approval) ──
  {
    id: "youtube",
    label: "YouTube",
    shortLabel: "YouTube",
    description: "Generate video descriptions and titles for your YouTube channel.",
    abbreviation: "▶",
    icon: "▶",
    color: "#FF0000",
    gradient: "linear-gradient(135deg, #FF0000, #CC0000)",
    connectionPath: "/admin/connections",
    // OAuth + publish handler fully implemented; connection gate controls publish
    status: "operational",
    capabilities: {
      connect: true, generateText: true, generateImage: false, generateVideo: false,
      queue: true,   // content drafts are queued; auto-publish pending scope approval
      publish: true, schedule: false, analytics: false,
    },
  },
  {
    id: "tiktok",
    label: "TikTok Business",
    shortLabel: "TikTok",
    description: "Generate captions for TikTok videos.",
    abbreviation: "TT",
    icon: "♪",
    color: "#69C9D0",
    gradient: "linear-gradient(135deg, #010101, #25F4EE)",
    connectionPath: "/admin/connections",
    // full pipeline implemented; connected read-only pending TikTok app review
    status: "pending_approval",
    capabilities: {
      connect: true, generateText: true, generateImage: false, generateVideo: false,
      queue: true,   // content drafts are queued; auto-publish pending TikTok approval
      publish: true, schedule: false, analytics: false,
    },
  },
  {
    id: "linkedin",
    label: "LinkedIn Company Pages",
    shortLabel: "LinkedIn",
    description: "Publish professional updates to your LinkedIn company page.",
    abbreviation: "in",
    icon: "in",
    color: "#0A66C2",
    gradient: "linear-gradient(135deg, #0A66C2, #004182)",
    connectionPath: "/admin/connections",
    status: "coming_soon",   // no publish backend yet; content drafts queued for manual posting
    capabilities: {
      connect: true, generateText: true, generateImage: false, generateVideo: false,
      queue: true,   // content drafts queued; OAuth publish handler in progress
      publish: false, schedule: false, analytics: false,
    },
  },
  {
    id: "pinterest",
    label: "Pinterest Business",
    shortLabel: "Pinterest",
    description: "Generate pin descriptions and board content for Pinterest.",
    abbreviation: "P",
    icon: "📌",
    color: "#E60023",
    gradient: "linear-gradient(135deg, #E60023, #AD081B)",
    connectionPath: "/admin/connections",
    status: "coming_soon",   // no publish backend; content drafts queued for manual posting
    capabilities: {
      connect: false, generateText: true, generateImage: false, generateVideo: false,
      queue: true,   // content drafts queued; copy & post manually until API ships
      publish: false, schedule: false, analytics: false,
    },
  },
  {
    id: "nextdoor",
    label: "Nextdoor Business",
    shortLabel: "Nextdoor",
    description: "Generate neighborhood posts for Nextdoor Business.",
    abbreviation: "ND",
    icon: "🏘",
    color: "#00B246",
    gradient: "linear-gradient(135deg, #00B246, #008A34)",
    connectionPath: "/admin/connections",
    status: "coming_soon",   // no publish backend; content drafts queued for manual posting
    capabilities: {
      connect: false, generateText: true, generateImage: false, generateVideo: false,
      queue: true,   // content drafts queued; copy & post manually until API ships
      publish: false, schedule: false, analytics: false,
    },
  },
  // ── Coming soon (connect only; no content pipeline yet) ─────────────────────
  {
    id: "x_twitter",
    label: "X (Twitter)",
    shortLabel: "X",
    description: "Post updates to your X (Twitter) Business account.",
    abbreviation: "X",
    icon: "𝕏",
    color: "#000000",
    gradient: "linear-gradient(135deg, #000000, #333333)",
    connectionPath: "/admin/connections",
    status: "coming_soon",
    capabilities: {
      connect: false, generateText: false, generateImage: false, generateVideo: false,
      queue: false, publish: false, schedule: false, analytics: false,
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

// ── Runtime-derived platform sets ─────────────────────────────────────────────────────────────────────────────────
// All providers with queue:true appear here regardless of status.
// Operational → auto-publishes from queue. Pending/coming_soon → draft saved, manual publish.
export const QUEUEABLE_PROVIDERS: SocialProvider[] = SOCIAL_PROVIDERS.filter(
  p => p.capabilities.queue,
);
