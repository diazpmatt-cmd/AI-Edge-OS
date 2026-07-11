# Changelog

All notable changes to the AI Edge Solutions platform.

---

## [Unreleased]

### Changed (2026-07-11 — YouTube Pilot — Security Cleanup + Phase 8 Tests)
- **Security cleanup (Phase 1):** Removed scheduler-secret bypass from
  `GET /social-connections/youtube/channel-info`. The bypass was added solely for the
  one-time staging audit (2026-07-11) and is now removed. Route is back to Clerk-only
  authentication. `SCHEDULER_SECRET` import removed from `social-connections.ts`.
- **`youtube_tags` column added** — `social_posts.youtube_tags TEXT` (JSON array string).
  `rowToDto` parses as `string[]`; `POST`/`PATCH` serialize back; YouTube publisher
  includes tags in `snippet.tags` if present.
- **BB&B YouTube pilot staged** — Draft `34b0a41b-e08b-43b3-8167-c73655854ab5` created
  with approved title, description, 13 tags, `privacy=private`, `videoUrl=null`,
  `status=draft`. Awaiting real MP4.
- **Channel confirmed live** — Channel-info called before cleanup: `BedBugsand_Beyond`,
  ID `UCGCZ49VYvCIff8rM-VU2eqA`, 11 videos, 1,325 views.
- **Phase 8 tests (12 new)** — `youtube.test.ts` expanded from 30 → 42 tests covering:
  MP4-only MIME validation, empty-file rejection, private object-path retrieval,
  publish-readiness contract (videoUrl required), channel ID verification
  (`UCGCZ49VYvCIff8rM-VU2eqA`), privacy defaults to private for BB&B draft,
  one-provider-attempt-only, youtubeVideoId persistence, failed upload stays unpublished,
  no duplicate draft/upload, channel-info bypass absent, secrets not committed.
- **133 total tests passing** across 3 test files (0 failures).

### Added (2026-07-11 — YouTube Live Pilot — Phases 1–6)
- **`social_posts` DB columns** — `youtube_title TEXT`, `youtube_privacy TEXT`, `youtube_video_id TEXT`
  added via raw SQL migration; Drizzle schema updated to match
- **`youtubeTitle` / `youtubePrivacy` / `youtubeVideoId` fields** throughout the backend stack:
  - `rowToDto` maps all three to the API response
  - `POST /social-posts` and `PATCH /social-posts/:id` accept and persist new fields
  - YouTube publish handler reads `post.youtubeTitle` (falls back to `caption[0..100]`) and
    `post.youtubePrivacy` (falls back to `"public"`) instead of hardcoded values
  - `capturedYoutubeVideoId` variable captures provider video ID and persists it to DB in
    the final `UPDATE` after a successful upload
- **Publishing Center YouTube UI** — three new fields appear when YouTube is toggled:
  Video URL (existing, restructured), YouTube Title (max 100, with character counter),
  Privacy selector (`private` / `unlisted` / `public`) with guidance; form defaults to `private`
- **`artifacts/api-server/src/__tests__/youtube.test.ts`** — 30 tests covering: canonical
  provider ID, title derivation, privacy resolution, URL validation, video ID persistence,
  token refresh gate, draft-to-queue state machine, duplicate-upload prevention, Shorts vs
  standard classification, no-provider-call-before-approval

### Added (2026-07-11 — GBP Pilot Audit & Cleanup)
- **`artifacts/api-server/src/lib/gbp-cooldown.ts`** — pure, exportable GBP cooldown
  helpers (no DB dependency, fully testable):
  - `GbpCooldown` interface: `startedAt / expiresAt / reason / endpoint / service /
    attemptCount / retryAfterSec / errorType`
  - `GbpErrorType`: `rate_limit | daily_quota | project_quota_zero | access_denied |
    api_disabled | unknown`
  - `GBP_COOLDOWN_DEFAULTS` map (per errorType, in seconds)
  - `readGbpCooldown(metadata)` — reads structured or legacy flat fields; returns
    null for expired records (auto-clears on read)
  - `classifyGbpError(body, status)` — conservative classification from response text
  - `buildGbpCooldownRecord(opts)` — pure builder; honors Retry-After; does NOT push
    deadline forward when an active cooldown exists; increments `attemptCount`
  - `stripLegacyCooldownFields(metadata)` — migration helper removes old flat keys
- **`artifacts/api-server/src/__tests__/gbp-cooldown.test.ts`** — 24 tests covering:
  expired cooldown auto-clear, legacy migration, Retry-After, deadline preservation,
  attemptCount increment, all error classifications, `verifiedByApi` guard semantics,
  discovery-gate logic, admin endpoint absence

### Removed (2026-07-11 — GBP Pilot Audit & Cleanup)
- **`artifacts/api-server/scripts/publish-gbp-pilot.ts`** — one-time pilot publish
  script (disposable, never used successfully)
- **`artifacts/api-server/scripts/publish-gbp-pilot.mjs`** — same
- **`POST /api/social-posts/admin/bbb-gbp-pilot`** — one-time admin bypass endpoint
  removed from `social-posts.ts`
- **`fetchWithRetry429`** internal function removed — silently masked 429 errors with
  a 15-second blind retry; replaced by per-call structured cooldown handling
- **`tsx`** removed from `@workspace/api-server` devDependencies (was only added for
  the temp scripts; catalog entry retained for other workspace packages)

### Changed (2026-07-11 — GBP Pilot Audit & Cleanup)
- **`publishToGBP`** in `social-posts.ts` rewritten:
  - Cooldown: flat `cooldownUntil` → structured `gbpCooldown` object (via new helpers)
  - All 429 responses now log full response body before setting cooldown
  - Account/location cache now requires `verifiedByApi: true`; manually seeded values
    are rejected and force safe rediscovery
  - `saveCooldownAndThrow` helper inline; reads `Retry-After` header from every 429
  - 404 on Local Posts API correctly invalidates full location cache (unchanged behavior,
    now also clears `verifiedByApi`)
  - `metadata` typed `Record<string, unknown>` (was `any`)
- **DB** `social_connections.metadata` for `google_business` cleared to `{}` —
  incorrectly seeded `accountName: accounts/112955071079091449064` removed
  (that ID is the Google OAuth user ID, not a GBP business account resource ID)

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
