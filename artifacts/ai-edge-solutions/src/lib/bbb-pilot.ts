// ── BB&B Pilot Platform Configuration ────────────────────────────────────────
// Versioned rollout model for the Bed Bugs & Beyond pilot platform set.
// This is the single source of truth for which platforms are active, deferred,
// or excluded from the BB&B pilot.
//
// Do NOT hard-code pilot IDs directly into page components.
// Do NOT create a second provider registry — this file filters the canonical one.
//
// v1 — 2026-07-11:
//   Active:   Facebook, Instagram, Google Business Profile, YouTube
//   Deferred: TikTok (pending app review), LinkedIn (no publish backend),
//             Pinterest (no publish backend), Nextdoor (manual only, no OAuth)

import { QUEUEABLE_PROVIDERS, type SocialProvider, type SocialProviderId } from "./social-providers";

// ── Pilot Version ─────────────────────────────────────────────────────────────
// Bumping this version resets user localStorage to the new pilot defaults.
export const BBB_PILOT_VERSION = "v1" as const;

// ── Active pilot platforms ─────────────────────────────────────────────────────
// These four platforms are connected and publish-ready for Bed Bugs & Beyond
// as of the v1 pilot. Ordered by priority.
export const BBB_PILOT_PLATFORM_IDS: SocialProviderId[] = [
  "facebook",
  "instagram",
  "google_business",
  "youtube",
];

// ── Deferred platforms ────────────────────────────────────────────────────────
// Not included in the BB&B v1 pilot defaults. Will be enabled in future phases.
export const BBB_DEFERRED_PLATFORM_IDS: SocialProviderId[] = [
  "tiktok",    // pending TikTok app review; full backend exists
  "linkedin",  // coming soon — no direct publish backend yet
  "pinterest", // coming soon — no OAuth or publish backend
  "nextdoor",  // manual only — no Nextdoor API or OAuth; copy-and-paste workflow
];

// ── Derived pilot provider objects ────────────────────────────────────────────
// Active pilot providers intersected with QUEUEABLE_PROVIDERS (queue:true).
export const BBB_PILOT_PROVIDERS: SocialProvider[] = QUEUEABLE_PROVIDERS.filter(p =>
  (BBB_PILOT_PLATFORM_IDS as string[]).includes(p.id),
);

// ── Deferred provider objects ─────────────────────────────────────────────────
export const BBB_DEFERRED_PROVIDERS: SocialProvider[] = QUEUEABLE_PROVIDERS.filter(p =>
  (BBB_DEFERRED_PLATFORM_IDS as string[]).includes(p.id),
);

// ── Storage key (versioned) ───────────────────────────────────────────────────
// Versioned so that a pilot version bump resets localStorage to new defaults.
// Previous key: "ai-edge:autopilot-selection:v1" (no pilot config; defaulted to all)
export const BBB_SELECTION_STORAGE_KEY = `ai-edge:autopilot-selection:${BBB_PILOT_VERSION}`;

// ── Default selection ─────────────────────────────────────────────────────────
// The default is the four active pilot platforms — not all queueable providers.
// Users may deselect any or manually add deferred platforms after selecting them.
export function getBBBDefaultSelection(): Set<SocialProviderId> {
  return new Set(BBB_PILOT_PLATFORM_IDS);
}

// ── Selection normalizer ──────────────────────────────────────────────────────
// Reads localStorage and returns a valid Set<SocialProviderId>.
// - Accepts any queueable provider ID (pilot or deferred) — user may have
//   manually selected a deferred platform; respect that choice.
// - Discards unknown IDs and IDs not in QUEUEABLE_PROVIDERS.
// - Falls back to pilot defaults if nothing valid is stored.
export function normalizeSavedSelection(storageKey: string): Set<SocialProviderId> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      const valid = parsed.filter((id): id is SocialProviderId =>
        QUEUEABLE_PROVIDERS.some(p => p.id === id),
      );
      if (valid.length > 0) return new Set(valid);
    }
  } catch { /* ignore corrupt storage */ }
  return getBBBDefaultSelection();
}

// ── Capability helpers ────────────────────────────────────────────────────────

/** True if this provider is in the active v1 pilot set */
export function isPilotPlatform(id: SocialProviderId): boolean {
  return (BBB_PILOT_PLATFORM_IDS as string[]).includes(id);
}

/** True if this provider is explicitly deferred from the v1 pilot */
export function isDeferredPlatform(id: SocialProviderId): boolean {
  return (BBB_DEFERRED_PLATFORM_IDS as string[]).includes(id);
}
