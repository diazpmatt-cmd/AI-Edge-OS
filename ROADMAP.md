# AI Edge Solutions — BB&B Growth OS Roadmap

Last updated: 2026-07-14

---

## Development Agent Bridge Status

### DAB-1 — GitHub-Backed Development Task Contract (implemented and verified)

Completed scope:

- Compact root agent guidance that routes to the canonical Engineering Handbook, Roadmap, Changelog, Session Handoff, and ADRs.
- A structured GitHub Issue Form for task identity, specification revision, expected `origin/main` SHA, intended branch, bounded scope, exclusions, acceptance criteria, verification, authorization state, category-specific approval requests, and attributable approval evidence.
- A pull-request handoff template for starting and final Git state, exact files, verification, limitations, documentation, independently recorded authorization categories, and verified factual milestones.
- ADR-008 documenting GitHub as the initial operational coordination surface, Matthew's final authority, proposal/approval separation, stale-state safeguards, one-task/one-branch isolation, and the DAB phase boundaries.
- Explicit prohibition of credentials, tokens, secrets, raw environment values, private customer data, full conversation transcripts, and unbounded shell output.

Verified preservation and operational validation:

- DAB-1 was merged through [PR #9](https://github.com/diazpmatt-cmd/AI-Edge-OS/pull/9) at merge commit `7ba2348e128469df5ae30ba0f6276ca0e4b1d4e7`.
- DAB-1-PILOT-001 completed successfully. [Issue #10](https://github.com/diazpmatt-cmd/AI-Edge-OS/issues/10) is the authoritative proposal, approval, claim, and completion history.
- The pilot verified that DAB-1 is usable as a manual governance contract while exposing concrete enforcement gaps: mutable/free-form specification state, manual remote-SHA and approval matching, non-atomic claims, no independent agent identity, ambiguous coordination-action classification, implementation-oriented milestone assumptions, and durable-document drift.
- The three failed API-server Vercel deployments remain a separate, documented, pre-existing blocker unrelated to DAB-1.

DAB-1 provides contractual governance and reviewable templates. DAB-2A supplies the pure machine-enforcement foundation, DAB-2B1 supplies its tenant-independent PostgreSQL persistence boundary, and DAB-2B2 supplies read-only GitHub evidence reconciliation. No hosted coordination service or direct ChatGPT/Codex communication exists.

### DAB-2A — Pure Coordination Contracts and State Machine (implemented and verified)

Completed scope:

- A separate `lib/development-control` TypeScript package with deterministic specification hashing, immutable revisions, expected-SHA binding, branch/no-branch modes, and bounded task contracts.
- Independent development actor identities and ten non-transitive authorization categories, including pull-request creation as distinct from pushing and merging.
- Structured approval decisions bound to task, revision, hash, SHA, categories, actor, timestamps, expiration, constraints, rationale, and idempotency keys.
- A fail-closed task lifecycle that keeps approval decisions separate from lifecycle state.
- Atomic in-memory claims, bounded renewable leases, explicit recovery after expiration, active-claim protection, task/lease versions, and no automatic stealing.
- Deterministic append-only audit events, idempotent replay, factual Git/deployment milestones, stale-state invalidation, and sensitive-data-safe completion reports.
- Fixture coverage based on DAB-1-PILOT-001 and DAB-1-PILOT-002; 26 focused tests and the package TypeScript check pass.

DAB-2A remains canonical and provider-independent. Its original phase added no persistence or integration; DAB-2B1 adds the separate bounded persistence implementation below.

### DAB-2B1 — Tenant-Independent Durable Coordination Store (implemented and verified)

Completed scope:

- A `DevelopmentCoordinationStore` contract shared by the synchronous in-memory reference implementation and asynchronous durable implementations.
- A separate `lib/development-control-store` PostgreSQL/Drizzle package that never imports `lib/db` or carries customer tenant identity.
- One additive migration defining nine development-control tables for task projections, immutable specification revisions, actor snapshots, authorization decisions, claims, sequenced audit events, milestone history, completion-report history, and operation/task-scoped idempotency.
- Atomic projection + event + idempotency transaction boundaries, row locking/optimistic versions, transaction-scoped idempotency locks, PostgreSQL-clock leases, active-lease protection, deterministic ordering, and fail-closed conflict handling.
- Caller-supplied configuration with no environment access at import time and no sensitive value in errors, fixtures, reports, logs, or committed files.
- Cross-adapter contract tests, schema/migration boundary tests, DAB-2A regression tests, and separate package TypeScript checks without a live database credential.

DAB-2B1 implements code, schema, and an unapplied migration only. It does not provision or connect to a hosted database, execute a live migration, reconcile GitHub, expose an API/UI, run a scheduler/worker/webhook, automate Git or deployment, or establish direct agent communication.

### DAB-2B2 — Read-Only GitHub Reconciliation (implemented and verified)

Completed scope:

- Pure caller-supplied read-only GitHub observation contracts and deterministic bounded normalization.
- Stable numeric repository/actor attribution, exact approval-binding diagnostics, immutable evidence versions, idempotent replay, conditional-read/rate-limit behavior, and atomic evidence/run/cursor persistence.
- One additive unapplied four-table tenant-independent migration with no customer identity, customer database, destructive operation, or existing-table rewrite.
- Fixture-backed ordering, deduplication, conflicts, edited/deleted evidence, impersonation, stale/force-pushed SHA, ETag, rate-limit, rollback, replay, and customer-boundary verification.

DAB-2B2 adds no installed GitHub integration, webhook, App, Action, scheduler, worker, hosted runtime, API, UI, MCP, GitHub write, automatic DAB mutation, database provisioning, or live migration execution.

### DAB-3A — Pure Offline Bridge Contracts and Policy Evaluation (implemented and verified)

Completed scope:

- A pure `@workspace/development-control-bridge` package that imports only the canonical DAB-2A contracts and leaves DAB-2B1 persistence and DAB-2B2 GitHub evidence as untouched future adapter boundaries.
- Bounded already-verified workload principals, deterministic fifteen-minute request envelopes, immutable operation allowlists, and an exported per-operation authorization matrix.
- Pure fail-closed policy evaluation for repository/task/revision/hash/SHA/category/identity/evidence/time/nonce/idempotency bindings, with stable bounded decisions and reason codes.
- Explicit `read_only`, `modeled_write`, and `deferred` operation classifications. Offline `allowed` decisions never represent execution.
- Credential-free fixtures and 66 focused tests; combined DAB-3A/DAB-2A regression coverage is 92/92 with both package TypeScript checks passing.

DAB-3A adds no authenticated runtime, MCP server, API, UI, network, credentials, database, migration, GitHub write, Git operation, deployment, scheduler, worker, Growth Engine behavior, or customer-facing capability.

### DAB-3B — Private Read-Only Remote MCP Foundation (implemented offline; activation deferred)

Completed code scope:

- Isolated OAuth-protected Streamable HTTP MCP resource-server foundation with exactly five schema-bounded read-only operations.
- Strict short-lived JWT-to-DAB-3A workload-principal mapping from explicitly supplied issuer, audience, authorized party, subject, scope, token ID, pinned public key, time, and revocation configuration.
- Canonical read adapters for DAB-2A task/specification/approval/event records and DAB-2B2 verified Git evidence, with DAB-3A policy gating on every tool call.
- One additive unapplied tenant-independent request-ledger migration for cross-instance replay and idempotency hashes; no raw token, request, result, customer identity, or arbitrary JSON.
- Rate-limit and kill-switch boundaries, bounded/redacted output, inactive Vercel-compatible entrypoint, focused offline tests, and ADR-013.

DAB-3B is not operational. No database is provisioned, no migration is executed, no OAuth provider or credential is configured, no server is hosted or deployed, no ChatGPT app/plugin exists or is installed, no workspace approval is recorded, and no runtime is activated.

### DAB-3C — Isolated Private Bridge Activation Composition (implemented and verified; operational activation deferred)

Completed code scope:

- Lazy environment-gated composition of the merged DAB-3B runtime at the isolated request boundary, with no import-time environment read, database pool, or network action.
- Exact reuse of DAB-2A coordination, DAB-2B1 storage, DAB-2B2 Git evidence, DAB-3A policy, and the existing five DAB-3B read-only tools.
- One additive unapplied tenant-independent rate-limit migration and repository for atomic cross-instance counters using hashed principal references only.
- Bounded Node request adaptation, redacted unavailable responses, dynamic kill switch, exact RS256/OAuth claim configuration, focused tests, ADR-014, and an activation runbook.
- New focused tests passed 19/19, directly affected DAB regressions passed 124/124, and all three affected package TypeScript checks passed.

DAB-3C code does not make the bridge operational. No Vercel or Supabase project was changed, no migration was executed, no OAuth or credential was configured, no deployment occurred, and no ChatGPT Work app/plugin was created or installed. The empty control plane cannot provide a positive live proof until canonical DAB records and verified Git evidence are separately populated or reconciled under attributable authorization.

Deferred bounded phases and activation work:

1. **DAB-3C operational activation:** separate approvals for isolated database provisioning, migration execution, canonical-control-data bootstrap/reconciliation, OAuth provider/configuration, credentials, third Vercel project/domain/TLS/deployment, ChatGPT Work app/plugin creation and installation, workspace policy, endpoint proof, and runtime activation.
2. **Later write phases:** separately approved bounded behavior only after the read-only operational boundary is activated and verified. No Git, deployment, credential, paid-provider, or unrestricted external-action tools are implied.

No live task-ledger file, database, migration, schema, API, UI, scheduler, webhook, GitHub Action, MCP server, project MCP configuration, integration, port, credential, runtime, Growth Engine behavior, or customer-facing capability was added in DAB-1.

---

## Growth Engine C8R Status

### C8R-5 — Tenant-Safe AI Visibility Read Model (implemented and verified)

Completed scope:

- Provider-independent normalized read-model contracts and bounded canonical references.
- Separate source adapters for Local Presence, Discovery, backlinks, tenant-safe reviews, Content Autopilot lifecycle, and bounded connected-Google status.
- Pure deterministic composition, deduplication, provenance merging, stable ordering, and pre-prioritization rejection gates.
- Transparent potential-value and attainability scores that remain separate; no generic SEO score.
- Coverage diagnostics for unavailable, unimplemented, unconnected, unsafe, or unobserved sources without manufacturing zero values.
- BB&B fixtures enforcing Baldwin County geography, active services, furniture/item-level bed-bug treatment, active fumigation, no termites, and no whole-home heat positioning.
- Separate content preparation, approval, dispatch, and delivery facets covering generated/not-approved, pending approval, approved/not-queued, queued/not-scheduled, scheduled/not-published, published, and failed states.
- Pure focused coverage: 32 C8R-5 tests; bounded C8R/Discovery regression baseline: 629 passed and 2 skipped; DB TypeScript clean.

This phase does **not** add persistence, API routes, UI, schedulers, providers, live collection, network access, or external execution. Google Business Profile collection, Search Console, GA4, local-rank tracking, tenant-safe review ingestion, Gemini, ChatGPT, Perplexity, and live AI prompt monitoring remain future bounded phases and must not be represented as implemented.

### Completed architecture audit

- **AI Edge Development Agent Bridge Feasibility Audit** — completed read-only after C8R-5 merged. It recommended the staged GitHub contract → durable ledger → bounded bridge architecture recorded above. DAB-1, DAB-2A, DAB-2B1, DAB-2B2, and the pure offline DAB-3A policy foundation are implemented; the direct bridge remains non-operational.

### Preserved Google Local and AI Visibility priority order

1. Reuse canonical Local Presence, Discovery, backlink, review, content, and connected-Google records.
2. Add bounded tenant-safe source adapters only when the underlying canonical integration exists.
3. Add persisted or visible AI Visibility behavior only in separately approved phases.
4. Defer live provider collection, prompt monitoring, rank tracking, and external execution until their security and tenant boundaries are approved.

---

---

## GBP Engine Closeout (July 2026) — COMPLETE

All four target areas verified with runtime behavioral tests. No additional feature changes in scope.

| Area | Status | Test File | Passing |
|------|--------|-----------|---------|
| **Security & Tenant Isolation** | ✅ COMPLETE | `gbp-security.test.ts` | 15/15 |
| **Alert Threshold Fix** | ✅ COMPLETE | `gbp-alert-threshold.test.ts` | 11/11 |
| **Shared Google Token Service** | ✅ COMPLETE | `google-token.test.ts` | 11/11 |
| **GBP → Content Autopilot** | ✅ COMPLETE | `gbp-autopilot-states.test.ts` | 10/10 |

Supporting files: `gbp-finalization.test.ts` (25/25), `gbp-schema-drift.test.ts` (2/2).

Commit: `b660d11a5858b80462099a8106986af66b3dd96d`

Remaining external blocker: Google Business Profile Posts API returns 429 on every attempt. Root cause is GCP project 474786012895 quota/access — **Matthew must verify in GCP Console** before any retry. No live Google post was sent or claimed during closeout.

---

## Current State (v1 Pilot — July 2026)

### Active Platforms (BB&B Pilot v1)

| Platform            | Connected                                         | Content Ready                              | Image Ready       | Queue Ready                | Direct Publish                          | Next Step                                                                |
| ------------------- | ------------------------------------------------- | ------------------------------------------ | ----------------- | -------------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| **Facebook**        | ✅ Matthew Diaz                                   | ✅ Template-based                          | ❌ Not integrated | ✅                         | ✅ Graph API                            | Integrate image upload                                                   |
| **Instagram**       | ✅ Matthew Diaz                                   | ✅ Template-based                          | ❌ Not integrated | ✅                         | ✅ via FB Page                          | Requires public image URL                                                |
| **Google Business** | ✅ diaz.p.matt@gmail.com                          | ✅ Local copy + template                   | ❌ Not integrated | ✅                         | ⚠️ BLOCKED — GCP API access unconfirmed | Verify APIs enabled in GCP Console (project 474786012895)                |
| **YouTube**         | ✅ BedBugsand_Beyond (`UCGCZ49VYvCIff8rM-VU2eqA`) | ✅ Title + description + 13 tags + privacy | ❌                | ✅ Draft `34b0a41b` staged | ⏸ AWAITING MP4 — Phase 2 stop           | Matthew must attach real MP4 to draft `34b0a41b`; upload will be private |

### Deferred Platforms (Not in v1 Pilot)

| Platform      | Registry Status    | Reason Deferred                | Estimated Next Phase |
| ------------- | ------------------ | ------------------------------ | -------------------- |
| **TikTok**    | `pending_approval` | Awaiting TikTok app review     | Phase 2              |
| **LinkedIn**  | `coming_soon`      | No direct publish backend      | Phase 3              |
| **Pinterest** | `coming_soon`      | No OAuth or publish backend    | Phase 3              |
| **Nextdoor**  | `coming_soon`      | No API; manual copy-paste only | Phase 4              |

---

## Phase 1 (Current) — Pilot Baseline

**Scope:** Establish truthful end-to-end baseline for the 4 active platforms.

- [x] Canonical provider registry (`social-providers.ts`)
- [x] OAuth connections for Facebook, Instagram, Google Business, YouTube
- [x] Publishing handlers for all 4 active platforms
- [x] Content Autopilot with template-based caption generation
- [x] Platform selection with localStorage persistence
- [x] BB&B pilot config (`bbb-pilot.ts`) — default = 4 pilot platforms
- [x] Queue All respects selection (deferred platforms excluded by default)
- [x] YouTube corrected to `operational` (not pending approval)
- [x] Nextdoor truthfully modeled as manual-only (no OAuth)
- [x] Zero-selection guard on Generate button
- [ ] Manual acceptance verification by Matthew (authenticated browser)

---

## Phase 2 — Image Generation & Media Engine

**Goal:** Each queued post includes a platform-optimized image.

- [ ] Add `aspectRatio`, `minWidth`, `minHeight` fields to `ContentProfile`
- [ ] Integrate image generation API (DALL-E or Replicate) at queue time
- [ ] Platform-specific ratios: Facebook 1.91:1, Instagram 1:1, Google 4:3
- [ ] Image stored in object storage, URL embedded in draft
- [ ] Publishing Center shows image preview before publish
- [ ] Instagram publish uses generated image URL (required for API)
- [ ] Facebook publish supports image attachment
- [ ] TikTok pilot readiness (pending platform approval resolution)

---

## Phase 3 — Analytics & Performance Tracking

**Goal:** Measure what gets published.

- [ ] Post-publish: fetch engagement (likes, comments, reach) per platform
- [ ] Analytics stored in `social_posts` table (`performance` JSONB column)
- [ ] Dashboard widget: top-performing content per platform
- [ ] LinkedIn and Pinterest OAuth + publish backend

---

## Phase 4 — Scheduling & Automation

**Goal:** Queue content now, publish at optimal time.

- [ ] Scheduled publish for Facebook, Instagram, Google Business
- [ ] Optimal post-time algorithm per platform
- [ ] Nextdoor API assessment (if Nextdoor opens Business API)
- [ ] Recurring content templates (monthly pest prevention calendar)

---

## BB&B Pilot Readiness by Provider

### Facebook

- **Connected**: ✅ Matthew Diaz account, Facebook Page linked
- **Content ready**: ✅ Template-based captions (400–500 chars, photo + text)
- **Image ready**: ❌ No image generation yet (manual attach)
- **Video ready**: ❌ Not implemented
- **Queue ready**: ✅ Drafts created in Publishing Center
- **Direct publish**: ✅ Graph API handler (`/v19.0/{pageId}/photos`, `/feed`)
- **Analytics**: ❌ Not yet
- **Blocker**: Image generation for visual posts
- **Manual action**: Attach image in Publishing Center before publish

### Instagram

- **Connected**: ✅ Matthew Diaz, linked via Facebook Business
- **Content ready**: ✅ Template-based captions (125–220 chars)
- **Image ready**: ❌ Requires public image URL (no generation yet)
- **Video/Reels**: ❌ Not implemented
- **Queue ready**: ✅
- **Direct publish**: ✅ Two-step: create container → publish
- **Analytics**: ❌ Not yet
- **Blocker**: Requires a public image URL — cannot publish text-only to Instagram
- **Manual action**: Supply image URL in Publishing Center

### Google Business Profile

- **Connected**: ✅ diaz.p.matt@gmail.com, Baldwin County location
- **Content ready**: ✅ Local-targeted captions (Foley, Gulf Shores, Orange Beach, Fairhope)
- **Image ready**: ❌ No generation yet
- **Video**: ❌ Not implemented
- **Queue ready**: ✅
- **Direct publish**: ⚠️ **BLOCKED** — GBP Posts API returns 429 on every attempt
- **Analytics**: ❌ Not yet
- **Blocker**: Google Business Profile API returning 429 (Account Management + Business
  Information APIs). Root cause unconfirmed: "Requests per minute" message received on
  first-ever request, persisting 7+ min across retries — inconsistent with transient
  rate limit. Likely: API not enabled or project quota = 0 in GCP Console.
  **Matthew must verify in console.cloud.google.com → project 474786012895.**
- **Manual action**: Check GCP Console before any retry

### YouTube

- **Connected**: ✅ Matthew Diaz, youtube.upload + youtube.readonly scopes
- **Content ready**: ✅ Title + description generation
- **Image/Thumbnail**: ❌ Not implemented
- **Video creation**: ❌ System does NOT produce a video file (text only)
- **Queue ready**: ✅ Drafts saved with title + description
- **Direct publish**: ✅ Resumable upload handler exists — requires actual video file
- **Analytics**: ❌ Not yet
- **Blocker**: YouTube cannot publish without a video file
- **Manual action**: Matthew must attach a video file in Publishing Center, then publish

### Nextdoor

- **Connected**: ❌ No OAuth, no API connection
- **Registry status**: `coming_soon`
- **Implementation**: Manual-only — setup checklist in Local Presence Engine
- **UI**: `NextdoorBusinessCard` in Local Presence page shows 15-step manual guide
- **Content ready**: ✅ Template-based captions (300-char conversational tone)
- **Queue**: ✅ Internal draft only — no API publishing
- **Direct publish**: ❌ Not implemented; no Nextdoor Business API available
- **Blocker**: No public Nextdoor Business API
- **Manual action**: Matthew must copy draft caption → paste into business.nextdoor.com

---

## Manual Acceptance Test Checklist (Matthew — Authenticated Browser)

### Facebook

- [ ] Navigate to `/admin/bbb-autopilot`
- [ ] Select Facebook only
- [ ] Generate weekly content (template-based)
- [ ] Queue Facebook post
- [ ] Navigate to Publishing Center (`/admin/social-publishing`)
- [ ] Attach or skip image
- [ ] Click Publish
- [ ] Confirm live post on Facebook Page
- [ ] Confirm success status stored in Publishing Center

### Instagram

- [ ] Select Instagram only in Content Autopilot
- [ ] Generate and queue Instagram post
- [ ] Navigate to Publishing Center
- [ ] Attach a public image URL (required — Instagram API cannot publish without image)
- [ ] Click Publish
- [ ] Confirm live post on Instagram Business account
- [ ] Confirm success status stored

### Google Business Profile

- [ ] **Matthew: verify GCP Console** — project 474786012895 → APIs & Services → confirm
      "My Business Account Management API" and "My Business Business Information API" are
      enabled with non-zero quotas (or request access if not visible)
- [ ] Confirm token still valid at `/auth/google-business` (re-authorize if expired)
- [ ] Select Google Business only in Content Autopilot
- [ ] Generate and queue GBP post (local copy: Foley/Gulf Shores/Orange Beach)
- [ ] Navigate to Publishing Center
- [ ] Select CTA (Call Now recommended)
- [ ] Click Publish — system will discover + cache location on first success
- [ ] Confirm live post on Google Business listing
- [ ] Confirm success status stored (first `verifiedByApi: true` cache entry)

### YouTube

- [ ] Select YouTube only in Content Autopilot
- [ ] Generate and queue YouTube description
- [ ] Navigate to Publishing Center
- [ ] Attach a valid test video file (MP4 recommended)
- [ ] Click Publish
- [ ] Confirm video uploaded to YouTube channel
- [ ] Confirm success status stored

### Nextdoor

- [ ] Navigate to Local Presence Engine (`/admin/local-presence`)
- [ ] Open Nextdoor Business card
- [ ] Confirm linked business page URL (if any)
- [ ] Note: posting is MANUAL — no API available
- [ ] Copy content from Content Autopilot Nextdoor draft
- [ ] Paste into business.nextdoor.com
- [ ] Document the Nextdoor business page URL for the record
