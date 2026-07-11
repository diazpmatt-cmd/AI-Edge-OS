# Changelog

All notable changes to the AI Edge Solutions platform.

---

## [Unreleased]

### Added (2026-07-11 — BB&B Pilot Baseline)
- **`src/lib/bbb-pilot.ts`** — versioned BB&B pilot config module:
  - `BBB_PILOT_PLATFORM_IDS`: `["facebook","instagram","google_business","youtube"]`
  - `BBB_DEFERRED_PLATFORM_IDS`: `["tiktok","linkedin","pinterest","nextdoor"]`
  - `BBB_PILOT_PROVIDERS` / `BBB_DEFERRED_PROVIDERS`: derived SocialProvider objects
  - `BBB_SELECTION_STORAGE_KEY`: versioned localStorage key (`ai-edge:autopilot-selection:v1`)
  - `getBBBDefaultSelection()`: returns Set of 4 pilot IDs (not all queueable providers)
  - `normalizeSavedSelection()`: reads + validates localStorage, falls back to pilot defaults
  - `isPilotPlatform()` / `isDeferredPlatform()`: capability helpers
- **`src/lib/__tests__/bbb-pilot.test.ts`** — 44 Phase 11 tests across 10 describe blocks:
  - Active pilot set (5 assertions)
  - Deferred set disjointness (3)
  - Default selection (3)
  - Saved selection normalization (7)
  - Nextdoor truthful status: no OAuth, no API, `coming_soon`, manual only (6)
  - YouTube operational: connects, queues, publishes (requires video file) (4)
  - Per-provider capability states for all 4 active platforms (6)
  - Helper functions `isPilotPlatform` / `isDeferredPlatform` (4)
  - Unknown provider safety (2)
  - No-duplicate invariants (4)
- **`ROADMAP.md`** — pilot readiness table (Phases 1–4), per-provider blockers,
  manual acceptance test checklist for Matthew

### Changed (2026-07-11 — BB&B Pilot Baseline)
- **`BBBContentAutopilotPage.tsx`** — default platform selection:
  - Previously: ALL queueable providers (8 platforms including deferred ones)
  - Now: 4 active pilot platforms only (Facebook, Instagram, Google Business, YouTube)
  - Deferred platforms appear below a "Deferred — not in pilot default" divider
  - Storage key and normalizer sourced from `bbb-pilot.ts` (versioned)
  - Platform count label updated to show pilot selected vs pilot total
- **`BBBContentAutopilotPage.tsx`** — `CONTENT_PROFILES`: added `x_twitter` entry
  (fixes pre-existing TypeScript `Record<SocialProviderId, ContentProfile>` error)

### Fixed (previous session)
- **Content Autopilot YouTube status** (`/admin/bbb-autopilot`): YouTube platform note
  now accurately states a video file is required; the previous note incorrectly implied
  an OAuth scope-approval gate.
- **Zero-selection guard**: Generate button disabled when no platforms are selected.

### Changed (previous session)
- `BBBContentAutopilotPage.tsx` Generate button shows live `{N} platforms` badge.
- `BBBContentAutopilotPage.tsx` uses "template library" terminology (not AI generation).

### Added (previous session)
- `src/lib/__tests__/autopilot-selection.test.ts`: 4 describe blocks — YouTube/TikTok
  canonical audit, media profile invariant, zero-selection behavior.

---

## Previous sessions (summary)

### Command Center drag-and-drop
`DashboardPage.tsx` + `app-shell.tsx`: Framer Motion Reorder `axis="y"` failed
inside CSS 2-column grid because items in the same row share identical
y-coordinates. Fix: edit mode switches to `flex-direction: column` for unique
y-offsets. Auto-saves on every reorder event. Sidebar nav edit mode fixed with
same pattern. Storage key renamed to `ai-edge:command-center-layout:v1`.

### Content Autopilot registry refactor
`BBBContentAutopilotPage.tsx` now derives all platform metadata from
`social-providers.ts` canonical registry. Removed `QueueablePlatform`,
`AllPlatformId`, `QUEUE_PLATFORM_META`, `ALL_PLATFORM_TABS`, `INFO_PLATFORMS`,
`QUEUEABLE_PLATFORMS` local constants.

### Social publishing & Meta OAuth
Facebook + Instagram publishing pipeline, OAuth flow, draft queue, Publishing
Center, Meta status checks.

### Call Intelligence
`/admin/call-intelligence` — calls + sms_conversations tables, Telnyx
analytics, live call log.

### GorillaDesk analytics
`/admin/dashboard` GorillaDesk sync widget with live customer/revenue data.
