// ── Local Presence — Provider Abstraction Layer ────────────────────────────
// Canonical registry of all supported local listing providers.
//
// Adding a new provider for Phase 2+:
//   1. Add an entry to LOCAL_PRESENCE_PROVIDERS below.
//   2. Add a corresponding seed row in DEFAULT_CHANNELS in
//      artifacts/api-server/src/routes/local-presence.ts.
//   3. Implement a sync adapter in Phase 2 and set syncSupported: true.
//
// No other structural changes are required by design.

export type LocalPresenceProviderId =
  | "google_business_profile"
  | "apple_business_connect"
  | "bing_places"
  | "facebook_business"
  | "yelp"
  | "nextdoor";

export type LocalPresenceProviderCategory = "search" | "social" | "community" | "directory";
export type LocalPresenceProviderTier = 1 | 2;

export interface LocalPresenceProviderDef {
  id: LocalPresenceProviderId;
  channelName: string;
  displayName: string;
  shortName: string;
  category: LocalPresenceProviderCategory;
  tier: LocalPresenceProviderTier;
  manualSetupUrl: string;
  syncSupported: boolean;
  iconEmoji: string;
  scoreWeight: number;
  description: string;
}

export const LOCAL_PRESENCE_PROVIDERS: readonly LocalPresenceProviderDef[] = [
  {
    id: "google_business_profile",
    channelName: "google_business",
    displayName: "Google Business Profile",
    shortName: "Google",
    category: "search",
    tier: 1,
    manualSetupUrl: "https://business.google.com",
    syncSupported: false,
    iconEmoji: "🌐",
    scoreWeight: 40,
    description: "The most important local listing — powers Google Search, Maps, and AI Overviews.",
  },
  {
    id: "apple_business_connect",
    channelName: "apple_business",
    displayName: "Apple Business Connect",
    shortName: "Apple Maps",
    category: "search",
    tier: 1,
    manualSetupUrl: "https://business.apple.com",
    syncSupported: false,
    iconEmoji: "🍎",
    scoreWeight: 20,
    description: "Powers Apple Maps and Siri — critical for iPhone users.",
  },
  {
    id: "bing_places",
    channelName: "bing_places",
    displayName: "Bing Places for Business",
    shortName: "Bing",
    category: "search",
    tier: 1,
    manualSetupUrl: "https://www.bingplaces.com",
    syncSupported: false,
    iconEmoji: "🔍",
    scoreWeight: 15,
    description: "Powers Bing Search and Microsoft AI assistants.",
  },
  {
    id: "facebook_business",
    channelName: "facebook",
    displayName: "Facebook Business",
    shortName: "Facebook",
    category: "social",
    tier: 1,
    manualSetupUrl: "https://www.facebook.com/pages/create",
    syncSupported: false,
    iconEmoji: "📘",
    scoreWeight: 10,
    description: "Facebook Pages power local discovery and reviews on Meta's network.",
  },
  {
    id: "yelp",
    channelName: "yelp",
    displayName: "Yelp Business",
    shortName: "Yelp",
    category: "directory",
    tier: 2,
    manualSetupUrl: "https://biz.yelp.com",
    syncSupported: false,
    iconEmoji: "⭐",
    scoreWeight: 10,
    description: "High-intent directory — consumers actively search Yelp for local services.",
  },
  {
    id: "nextdoor",
    channelName: "nextdoor",
    displayName: "Nextdoor Business",
    shortName: "Nextdoor",
    category: "community",
    tier: 2,
    manualSetupUrl: "https://business.nextdoor.com",
    syncSupported: false,
    iconEmoji: "🏘️",
    scoreWeight: 5,
    description: "Neighborhood network — strong for hyper-local service-area businesses.",
  },
] as const;

export const PROVIDER_BY_CHANNEL: Readonly<Record<string, LocalPresenceProviderDef>> =
  Object.fromEntries(LOCAL_PRESENCE_PROVIDERS.map(p => [p.channelName, p]));

export function getProviderDef(channelName: string): LocalPresenceProviderDef | undefined {
  return PROVIDER_BY_CHANNEL[channelName];
}
