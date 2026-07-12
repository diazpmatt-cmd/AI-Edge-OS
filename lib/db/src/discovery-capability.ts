/**
 * Phase C5 — Provider Capability Registry
 *
 * Canonical description of what capabilities each discovery provider supports.
 * Used for deterministic capability checks before provider execution.
 * Unsupported capabilities are skipped without making a provider call.
 *
 * Rules:
 *   - hasCapability() is the ONLY place capability checks should occur.
 *   - DATAFORSEO_CAPABILITIES is the authoritative set for the DataForSEO provider.
 *   - Capability checks are deterministic: same provider → same result.
 *   - The pipeline reasons from capabilities, not from provider names.
 *   - No Math.random(). No hardcoded BB&B values. No live API calls.
 */

// ── Capability taxonomy ────────────────────────────────────────────────────────

/**
 * Canonical capability identifiers for discovery providers.
 * Each capability maps to a specific data type the provider can reliably return.
 */
export type ProviderCapability =
  | "search_volume"        // Monthly keyword search volume (real SERP/Ads data)
  | "keyword_difficulty"   // Keyword competition/difficulty score (0–100 proxy)
  | "serp_results"         // Organic ranking URLs, domains, titles, snippets
  | "paa"                  // People Also Ask questions from SERP results
  | "related_searches"     // Related search query suggestions
  | "competitor_domains"   // Domains found in SERP organic results (filtered)
  | "competitor_keywords"  // Keywords a competitor ranks for (Domain Rank Overview)
  | "trend_history"        // Historical relative search interest over time
  | "social_signals"       // Social post/thread engagement signals
  | "local_pack"           // Local pack / map pack SERP results
  | "device_targeting"     // Separate desktop vs mobile SERP queries
  | "geo_targeting"        // Location-specific queries (city, state, country)
  | "language_targeting";  // Language-specific queries

export type ProviderCapabilitySet = ReadonlySet<ProviderCapability>;

// ── DataForSEO capabilities (C5-validated) ─────────────────────────────────────

/**
 * Capabilities definitively supported by the DataForSEO adapter in Phase C5.
 *
 * Supported (via Keywords Data API + SERP Organic API):
 *   search_volume       — Google Ads search volume (monthly, real data)
 *   keyword_difficulty  — competition field 0.0–1.0 (adwords competition proxy)
 *   serp_results        — Organic positions, URLs, domains, titles, snippets
 *   paa                 — People Also Ask items in SERP Organic response
 *   competitor_domains  — Derived from organic items, directories filtered out
 *   geo_targeting       — location_name in both APIs (city, state, country)
 *   language_targeting  — language_name in both APIs
 *   device_targeting    — device parameter in SERP API (desktop/mobile)
 *
 * Honestly unsupported in Phase C5:
 *   competitor_keywords — Domain Rank Overview endpoint not wired (Stage 5 inactive)
 *   related_searches    — Not extracted from SERP responses in C5
 *   trend_history       — Requires Google Trends provider (Phase C8)
 *   social_signals      — Requires Reddit provider (Phase C9)
 *   local_pack          — Local pack SERP items not yet extracted (Phase C6)
 */
export const DATAFORSEO_CAPABILITIES: ProviderCapabilitySet = new Set<ProviderCapability>([
  "search_volume",
  "keyword_difficulty",
  "serp_results",
  "paa",
  "competitor_domains",
  "geo_targeting",
  "language_targeting",
  "device_targeting",
]);

// ── Ordered list for stable reporting ─────────────────────────────────────────

export const ALL_CAPABILITIES: readonly ProviderCapability[] = [
  "search_volume",
  "keyword_difficulty",
  "serp_results",
  "paa",
  "related_searches",
  "competitor_domains",
  "competitor_keywords",
  "trend_history",
  "social_signals",
  "local_pack",
  "device_targeting",
  "geo_targeting",
  "language_targeting",
];

// ── Check functions ────────────────────────────────────────────────────────────

/**
 * Returns true when the given capability is in the provider's capability set.
 * Use this before every provider call to skip unsupported operations deterministically.
 * No nondeterminism: same (capabilities, capability) pair always returns the same result.
 */
export function hasCapability(
  capabilities: ProviderCapabilitySet,
  capability:   ProviderCapability,
): boolean {
  return capabilities.has(capability);
}

// ── Capability description (for health + diagnostics) ─────────────────────────

export interface CapabilityDescription {
  provider:    string;
  supported:   ProviderCapability[];
  unsupported: ProviderCapability[];
}

/**
 * Build a human-readable capability description for a provider.
 * Used in GET /api/discovery/health and diagnostics endpoints.
 * Never includes sensitive data (credentials, auth headers).
 */
export function describeCapabilities(
  providerName: string,
  capabilities: ProviderCapabilitySet,
): CapabilityDescription {
  return {
    provider:    providerName,
    supported:   ALL_CAPABILITIES.filter(c => capabilities.has(c)),
    unsupported: ALL_CAPABILITIES.filter(c => !capabilities.has(c)),
  };
}
