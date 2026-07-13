# Changelog

All notable changes to the AI Edge Solutions platform.

---

## [Unreleased]

### DAB-1 — GitHub-Backed Development Task Contract (2026-07-13)

#### Added

- Compact root `AGENTS.md` routing agents to canonical project documents and defining clean/stale Git-state checks, one-task/one-branch isolation, bounded scope, category-specific authorization, verified factual milestones, focused verification, and sensitive-data exclusions.
- GitHub Issue Form requiring task ID, specification revision, expected `origin/main` SHA, intended branch, status, priority, dependencies, origin, proposed agent, scope/files, exclusions, acceptance criteria, verification, authorization state, requested approval categories, attributable decision evidence, documentation, and related links.
- Pull-request handoff template covering starting/final Git state, exact files, exclusions, verification, limitations, canonical documentation, separate authorization categories, and factual commit/push/PR/merge/deployment milestones.
- ADR-008 defining GitHub Issues and pull requests as the initial operational coordination surface while existing repository documents remain the durable architecture and project-history surface.

#### Security and architecture

- Issue selections, assignments, proposals, plans, and agent statements are explicitly not approval evidence. Approval must be an attributable decision from Matthew Diaz's verified identity tied to the exact specification revision, expected SHA, and named categories.
- Scope, editing, committing, pushing, merging, deployment, credentials, paid providers, and external actions remain independent authorization categories.
- Credentials, tokens, secrets, raw environment values, private customer data, full conversation transcripts, and unbounded shell output are prohibited from tasks and handoffs.
- DAB-1 is contractual governance only. DAB-2 machine enforcement and a DAB-3 bounded MCP interface remain deferred and unimplemented.
- No live task-ledger file, persistence, database, migration, schema, API, UI, scheduler, webhook, GitHub Action, MCP server, project MCP configuration, integration, port, credential, runtime, Growth Engine, or customer-facing behavior was added.

#### Verification

- GitHub Issue Form YAML parsed successfully and required structure was validated locally.
- Markdown structure and all required task, handoff, Git-state, authorization, and phase-boundary language were validated locally.
- `git diff --check`, sensitive-data scan, forbidden-scope scan, and complete diff review passed.

#### Post-merge reconciliation and operational validation

- Recorded DAB-1 as merged through [PR #9](https://github.com/diazpmatt-cmd/AI-Edge-OS/pull/9) at merge commit `7ba2348e128469df5ae30ba0f6276ca0e4b1d4e7`.
- Recorded DAB-1-PILOT-001 as completed, with [Issue #10](https://github.com/diazpmatt-cmd/AI-Edge-OS/issues/10) serving as the authoritative proposal, approval, claim, and completion history.
- Preserved the pilot's observed operational friction: mutable/free-form specification state, manual SHA and approval matching, non-atomic claims, absent independent agent identity, ambiguous coordination-action classification, read-only milestone gaps, and durable-document drift.
- Documented the resulting DAB-2 requirements as recommended future enforcement only. DAB-2 remains unimplemented and unapproved; DAB-3 direct ChatGPT/Codex communication remains deferred and non-operational.
- Preserved the three unrelated API-server Vercel deployment failures as a separate, pre-existing blocker; no API-server or runtime repair is included.
- This reconciliation changes canonical documentation only and adds no task ledger, persistence, API, UI, runtime, automation, credential access, Growth Engine behavior, or customer-facing capability.

### C8R-5 — Tenant-Safe AI Visibility Read Model (2026-07-13)

#### Added

- Provider-independent AI Visibility contracts with bounded normalized evidence, canonical source references, coverage diagnostics, workflow destinations, rejection reasons, and separate lifecycle facets.
- Pure source adapters for Local Presence, canonical Discovery opportunities, canonical backlink opportunities/workflows/evidence, Content Autopilot records, bounded tenant-safe review summaries, and bounded connected-Google status.
- Deterministic composer with tenant and reference validation, geography normalization, stable IDs and ordering, deduplication, bounded provenance merging, and canonical workflow precedence.
- Transparent prioritizer with separate potential-value and attainability outputs. Potential value weights business impact (30%), evidence strength (25%), local impact (20%), service priority (15%), and urgency (10%). Attainability weights relationship access (25%), workflow readiness (20%), effort ease (20%), freshness (15%), local relevance (10%), and service relevance (10%).
- Fixture-backed Bed Bugs & Beyond examples covering Baldwin County, Alabama; phone `251-324-9090`; furniture/item-level bed-bug treatment; active fumigation; and rejection of termite, whole-home heat-treatment, unsupported-service, out-of-area, malformed, and mixed-tenant inputs.
- Independent lifecycle projections and assertions for generated/not-approved, pending approval, approved/not-queued, queued/not-scheduled, scheduled/not-published, published, and failed content.

#### Corrected

- Generated content with no approval record now maps to `not_approved`, not `not_required`. Preparation, approval, dispatch, and delivery remain separate, and no pre-publication state is interpreted as actually published.

#### Security and architecture

- Local Presence, Discovery, backlinks, and Content Autopilot retain ownership of their canonical records and workflow state; AI Visibility is read-only composition over those sources.
- Legacy `ai_visibility_audits` is explicitly noncanonical and is excluded from all C8R-5 contracts and adapters.
- Invalid services, prohibited claims, unauthorized geography, tenant mismatches, unsupported evidence, and malformed inputs are rejected before scoring.
- Missing sources use explicit coverage diagnostics and never reduce a score through fabricated zero values.
- No credentials, secrets, tokens, persistence, migrations, schemas, API routes, UI, scheduler, provider, Similarweb adapter, network collection, OAuth access, live prompt monitoring, or external execution was added.

#### Verification

- Focused C8R-5 tests: 32/32 passed.
- Bounded C8R-1 through C8R-5 and Discovery regression set: 629 passed, 2 skipped.
- DB TypeScript check passed.
- `git diff --check`, credential scan, network/environment scan, tenant-safety scan, lifecycle-collapse scan, legacy-AI-Visibility scan, and forbidden-file scan passed.

### C6 Discovery Lifecycle Governance — Production Baseline (2026-07-12)

**Baseline locked:** 191 tests passing, 0 failures. Both TypeScript builds clean.

#### Architecture — DiscoveryExecutionService (canonical execution path)

- **Extracted `DiscoveryExecutionService`** from `discovery-run.ts` into `artifacts/api-server/src/lib/discovery-execution-service.ts`. The complete governed execution sequence now lives in exactly one place:
  `acquireLease → persistRunResult("running") → audit → cancelPoll → pipeline.run() → finalization → releaseLease`
- **C7 contract established**: the upcoming scheduler must call `service.execute({ actorType: "system", ... })` — never re-implement the sequence.
- The HTTP route (`discovery-run.ts`) is now a thin layer that handles only HTTP concerns: auth, rate limiting, idempotency, governance check, budget, dry-run, response formatting.

#### Four execution invariants — verified and permanent

| # | Invariant | Result |
|---|-----------|--------|
| I1 | No provider fetch before lease is held | ✓ Enforced by service step ordering |
| I2 | Exactly one lease holder per deterministic run | ✓ DB-atomic `INSERT ON CONFLICT DO NOTHING` |
| I3 | Failed lease leaves no orphaned running snapshot | ✓ Fixed — `persistRunResult` moved after `acquireLease` |
| I4 | No new provider call after cancellation observed | ✓ 10 `shouldCancel()` checkpoints in pipeline |

**I3 was violated in the previous implementation** (`persistRunResult` ran before `acquireLease`). Fixed by enforcing `acquireLease → persistRunResult → pipeline.run()` order inside the service. Two new tests demonstrate the invariant at the function level.

#### C7 partial files removed

Three prematurely committed C7 files are permanently deleted: `discovery-scheduler.ts`, `discovery-automation-config.ts`, `discovery-schedules.ts`.

#### Documentation

- `docs/adr/ADR-006-c6-lifecycle-governance.md` — architecture decision record with invariant table, execution order diagram, alternatives considered.
- `docs/DISCOVERY-C6-HANDOFF.md` — session handoff: test baseline, key files, C7 scope and call pattern.

---

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

### Added (2026-07-11 — BB&B Content Autopilot Foundation — Phases 1–12)

#### Phase 1: Status Colors
- **Termites panel**: Fixed from gold/yellow → silver/neutral (`#94A3B8`) matching PENDING canonical state
- **Approval Required chip**: Fixed from blue → yellow/amber (`#F59E0B`) matching ACTION_REQUIRED canonical state
- All status-bearing elements now derive colors from `PLATFORM_STATUS_COLORS` map only — never from brand/service colors

#### Phase 3: DB Schema
- `social_posts`: Added `generation_run_id TEXT`, `revenue_weight TEXT`, `urgency TEXT`
- `auto_content_settings`: Added `autopilot_enabled TEXT DEFAULT 'false'`, `generation_day TEXT`, `generation_time TEXT`
- All migrations ran via raw SQL (drizzle push blocked by pre-existing constraint conflicts)
- Drizzle schema files updated: `lib/db/src/schema/social-posts.ts`, `lib/db/src/schema/auto-content.ts`

#### Phase 4: Autonomous Scheduler
- Added `runAutonomousContentGeneration()` to `scheduler.ts` — runs every 30 minutes
- Queries `WHERE autopilot_enabled='true' AND engine_paused IS DISTINCT FROM 'true' AND next_generation_at <= now()`
- Full idempotency: `createWeeklyPlanId(userId)` is deterministic per ISO week — duplicate ticks produce no duplicate plan
- Calls `POST /api/auto-content/generate` via internal HTTP with scheduler auth bypass headers
- Advances `nextGenerationAt` by 7 days after successful generation
- BB&B pilot: `autopilot_enabled='false'` by default — scheduler exists but fires for zero tenants during pilot

#### Phase 5: Revenue-First Plan Logic
- Added `selectWeeklyServices(count, recentTopics?)` to `bbb-services.ts`
  - 60/25/15 revenue/education/trust bucket split using `BBB_DEFAULT_CAMPAIGN_MIX`
  - Weighted random selection: `revenueWeight × contentFrequencyWeight`
  - Service diversity rotation (avoids repeating same service consecutively)
  - Moles remain low-frequency (contentFrequencyWeight=1, lowest of all services)
  - Shuffles final slots so revenue/education/trust don't cluster on sequential days
- Added `createWeeklyPlanId(userId, date?)` — ISO-week-deterministic idempotency key
- Added `serviceStatusToOperationalState(status)` — maps ServiceStatus → OperationalState (4-state canonical system)
- Added `WeeklyServiceSlot` interface for type-safe slot data

#### Phase 6: Campaign Goals on Every Post
- `POST /api/auto-content/generate` now stores on every post:
  - `weeklyPlanId` (body-provided or auto-generated via `createWeeklyPlanId`)
  - `generationRunId` (fresh UUID per invocation — distinguishes multiple runs in same week)
  - `campaignGoal` (assigned by 60/25/15 position: first 60%=revenue, next 25%=education, last 15%=trust)
  - `audienceId` (from service's `supportedAudiences` or fallback `homeowners`)
  - `revenueWeight` (registry value at generation time)
  - `urgency` (registry value at generation time)
- Fixed `approvalMode` default in settings upsert: `"auto_schedule"` → `BBB_DEFAULT_APPROVAL_MODE` (`"approval_required"`)
- Added scheduler auth bypass to generate route: `x-scheduler-secret` + `x-scheduler-user-id` headers

#### Phase 7: Platform Behavior Rules (documented in code)
- Google Business Profile: manual publish only during pilot (not in autonomous schedule)
- YouTube: requires real MP4 (`videoUrl`) before publish — draft created, awaiting video
- Facebook + Instagram: approval_required → pending_review → approve → scheduled → published
- No platform uses auto_schedule during BB&B pilot

#### Phase 8: First Proposed July Weekly Plan
- Added static "First Proposed Weekly Plan" section to `BBBContentAutopilotPage`
- Shows week of July 14–20, 2026 with 7 daily slots
- Displays service, campaign goal, audience, bucket (revenue/education/trust), area, and editorial note
- Mix: 4 revenue + 2 education + 1 trust = 60/25/15 split verified
- Yellow pilot warning banner: approval required, autopilot off until Matthew enables it

#### Phase 11: Tests (52 new tests, 404 total)
- New file: `src/lib/__tests__/bbb-autopilot-engine.test.ts`
- Coverage:
  - Status colors 1–8: PLATFORM_STATUS_COLORS canonical map, serviceStatusToOperationalState adapter
  - Weekly plan idempotency 12–13: same userId+week = same planId, different weeks = different planIds
  - Campaign mix 14–22: 60/25/15 verified, service weights verified, moles low-frequency verified
  - Service enforcement 23–26: termites/wildlife/heat-treatment blocked, fumigation safety rules enforced
  - Approval workflow 29: approval_required default, never auto_schedule
  - Pilot safety 9–10, 30: autopilot_enabled='false' default, no blind tenant migration
