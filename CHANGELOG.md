# Changelog

All notable changes to the AI Edge Solutions platform.

---

## [Unreleased]

### Referral Growth — Fraud & Abuse Review Controls (RGE-5, 2026-07-25)

#### Added

- Tenant-isolated, explainable referral risk signals for duplicate identities, repeated invitation
  destinations, unusual velocity, self-referrals, and reward stacking.
- A human-only Fraud Review queue with evidence, risk scores, status filters, optimistic
  concurrency, idempotent decisions, and append-only decision history.
- Explicit privacy provenance showing that device/IP fingerprints are unavailable rather than
  fabricated when no lawful retained source exists.

#### Safety

- Clear, hold, and reject are review-queue decisions only. They never alter referrals, rewards,
  invitations, customer records, GorillaDesk/CRM data, or external systems.
- No automatic rejection, raw-IP/device collection, scheduler, payment, message, merge, or
  deployment was added.

### Referral Growth — Reward Ledger & Fulfillment Controls (RGE-4, 2026-07-25)

#### Added

- Tenant-isolated reward ledger with immutable conversion-time reward snapshots.
- Separate human approval and manual-fulfillment evidence actions with transaction locking,
  idempotency, duplicate prevention, and durable actor/timestamp provenance.
- A controlled Rewards interface showing pending review, approved, and externally fulfilled rewards.

#### Safety

- Removed the direct **Mark Paid** path. AI Edge OS cannot issue cash, credits, discounts, or
  payments; fulfillment only records evidence of an action completed outside the platform.
- Added no payment provider, scheduler, automatic fulfillment, production message, merge, or
  deployment.

### Referral Growth — Controlled Invitation Delivery (RGE-3, 2026-07-25)

#### Added

- Tenant-scoped Telnyx SMS and SMTP email adapters behind a fail-closed delivery gate.
- Dry-run-by-default delivery attempts, an exact test-recipient allowlist, a global emergency stop,
  strict per-tenant hourly limits, idempotency, live-delivery duplicate prevention, and durable
  provider receipts/failure codes.
- A second explicit human confirmation for each delivery attempt and a dry-run-only Referral Growth
  interface with visible emergency-stop, rate-limit, and scheduler status.

#### Safety

- No scheduler or automatic follow-up was added. The interface cannot request live delivery.
- Live provider calls require explicit environment enablement, explicit live mode, emergency-stop
  release, exact destination allowlisting, an approved invitation, and current opt-in status.
- No real SMS or email was sent. No production deployment was performed.

### Referral Growth — Invitations & Follow-Up Preparation (RGE-2, 2026-07-24)

#### Added

- Tenant-scoped SMS/email invitation templates with approved merge tokens, optional follow-up copy,
  and a bounded 1–30 day follow-up interval.
- Consent-backed invitation drafts, idempotency keys, 24-hour duplicate protection, human approval,
  cancellation, contact suppression, and immutable invitation snapshots.
- Contact preference records with normalized email/phone destinations, documented consent source
  and time, opt-out status, and transaction-level serialization across draft/suppression races.
- A visible **Invitations** tab in Referral Growth for creating templates and consent-backed drafts,
  approving drafts, cancelling them, and suppressing contacts.

#### Safety and verification

- Delivery is physically absent: RGE-2 imports no Telnyx/email sender, exposes no send route, has no
  scheduler, and constrains every invitation to `delivery_state='not_dispatched'` and
  `sequence_step=0`.
- Approval records human intent for a separately authorized delivery phase and explicitly reports
  that no message was sent. Opt-outs suppress matching draft/approved rows and block approval.
- RGE-2 API contract and database-invariant tests pass 28/28; invitation UI contract tests pass
  6/6; all focused referral API tests pass 53/53. The complete API suite passes 1,321/1,321
  against a disposable test database.
- API/frontend TypeScript and production builds pass. The complete frontend suite passes 52/53
  files and 2,248 tests, with the same three unrelated pre-existing `ContactPage.test.tsx`
  expectation failures.
- Merged through PR #43 and production-accepted on 2026-07-25 using deployed UI, bundle,
  authentication, and no-delivery evidence. See `docs/RGE-2-PRODUCTION-ACCEPTANCE.md`.

### Referral Growth — Customer Enrollment & Attribution (2026-07-24)

#### Added

- Tenant-derived public referral program lookup and customer enrollment routes using secure
  referral codes, bounded public metadata, active-client checks, and transactional program locking.
- Public referral landing page with referrer/referred-customer contact capture, consent copy,
  honeypot protection, client-side validation, and explicit duplicate/self-referral feedback.
- Admin referral-program creation with reward type/value, optional expiration and capacity, secure
  generated codes, and copyable share links.
- Duplicate and self-referral normalization, paused/expired/full-program rejection, and bounded
  per-code/requester submission rate limiting.

#### Security and verification

- Public submissions derive `client_id` only from the locked referral program; request bodies cannot
  select a tenant. Usage increments remain scoped by both program and client.
- No automatic payout, message, CRM write, publication, scheduler, or demo-data insertion was added.
- Focused referral tests pass 25/25; URL helper tests pass 2/2; the complete API suite passes
  1,293/1,293 against a disposable test database. API/frontend TypeScript and production builds pass.
- Full frontend verification has one unrelated existing baseline: three failing
  `ContactPage.test.tsx` expectations. Referral Growth tests and builds are green.
- Merged through PR #42 at merge commit
  `ded48a360dd02edf232ad2672e26d37dab335089`. Not deployed or production-accepted.

### AI Visibility V1 — Production Accepted (GO) (2026-07-21)

#### Release

- **DP-001 live-provider smoke test passed.** Scan ID `d2e7852c-8278-4be3-aa44-5f9af0297a47`, executed `2026-07-21T01:45:06.719Z` UTC, HTTP 201, 16,147 ms. 8/8 queries `success: true`; trigger_source `manual`; 0 errors.
- All queries contained real BBB service names (bed bug inspection, roach control, fumigation, etc.), real Baldwin County geographies, and mixed intent templates. No generic fallback content. 0% citation rate is a valid measured baseline.
- Decision upgraded from **CONDITIONAL GO** → **GO**. All 12 acceptance criteria satisfied. AI Visibility V1 is fully production-accepted.
- Scheduling remains disabled by default. May be enabled with explicit operator approval: `PUT /api/ai-visibility/schedule/bed-bugs-and-beyond { "enabled": true, "frequency": "weekly" }` + `AI_VISIBILITY_SCHEDULER_ENABLED=true`.

#### Query-context corrections (sessions 1–3, 2026-07-20–21, confirmed resolved in production)

- Fixed `queryActiveServiceIds` querying nonexistent `service_id` column → now `queryActiveServiceKeys()` on `service_key`.
- Added `queryClientRow()` UUID-based fallback to `clients.service_areas` when `local_presence_profiles` lookup returns null (legacy `client_id='default'` row).
- Fail-closed query generation: returns `[]` and raises `preflight_failed` (HTTP 422) when services or geographies are empty — no silent "local services" / "my area" fallbacks.
- Service-priority round-robin selection: services iterated in `sort_order ASC` per round; template index keyed on `result.length` for intent diversity; no alpha-sort cap skew.
- `displayServiceName()` map for natural phrasing ("roach control" not "roaches", "rodent control" not "rodents", etc.).
- Idempotent schema repair: `local_presence_profiles.client_id` reassigned from `'default'` to real UUID on server restart.
- 95 tests across `ai-query-generation-canonical.test.ts`, `ai-query-scan-preflight.test.ts`, `ai-visibility-query-provider.test.ts` — all pass.

### DAB-3C — Isolated Private Bridge Activation Composition (2026-07-14)

#### Added

- Lazy request-boundary composition connecting the existing DAB-3B entrypoint to canonical DAB-2A coordination, DAB-2B1 PostgreSQL storage, DAB-2B2 Git evidence, DAB-3A policy, and the unchanged five-tool read-only runtime.
- Exact isolated configuration validation for the control-plane database, HTTPS resource and documentation URLs, OAuth issuer, authorized party, subject, key ID, public RS256 key, revocation generation, numeric repository identity, Matthew's stable actor identity, enable flag, and kill switch.
- One additive unapplied tenant-independent rate-limit table and atomic repository using hashed principal references, bounded counters, fixed windows, and bounded cleanup.
- A bounded Node-to-Web request adapter, focused activation and store tests, ADR-014, and a configuration-name-only activation runbook.

#### Security and architecture

- Disabled, killed, missing, malformed, or inconsistent configuration fails closed with a redacted `503` before a database pool is created. Importing the package performs no environment read, connection, network call, or activation.
- The existing five tool names, schemas, policy gates, replay ledger, and read-only semantics are unchanged. No customer database, generic `DATABASE_URL`, private key, token, credential, raw environment value, request/result payload, customer identity, or unrestricted metadata is accepted or persisted.
- The empty isolated control plane fabricates no canonical data. Task/approval/event and Git-evidence population or reconciliation remains a separate future authorization.
- No Vercel or Supabase change, migration execution, OAuth configuration, credential insertion, deployment, ChatGPT Work plugin installation, workspace change, runtime activation, write tool, customer action, or Growth Engine behavior is included.

#### Verification

- New DAB-3C/store tests passed 19/19; directly affected DAB-3B, DAB-3A, coordination-store, and Git-evidence regressions passed 124/124.
- TypeScript passed for the MCP, development-control store, and bridge packages. SQL/Drizzle parity, `git diff --check`, exact sixteen-file review, and security/scope scans passed.
- The full application suite, production build, live database, migration, OAuth flow, network service, deployment, plugin, and paid or rate-limited service remain excluded.

### DAB-3B — Private Read-Only Remote MCP Foundation (2026-07-13)

#### Added

- An isolated `@workspace/development-control-mcp` Streamable HTTP resource-server foundation with OAuth protected-resource metadata and exactly five read-only tools: task, specification revisions, authorization decisions, verified Git evidence, and harmless task progress.
- Strict caller-configured RS256 JWT validation for exact issuer, audience, authorized party, subject, `dab:read` scope, token ID, issue/not-before/expiry times, pinned public key, and revocation generation, mapped to a DAB-3A `read_only_automation` workload principal.
- Canonical adapters over DAB-2A task state, DAB-2B1 storage, DAB-2B2 Git evidence, and DAB-3A request/policy evaluation without competing ownership or write behavior.
- One additive unapplied tenant-independent bridge request ledger storing only bounded hashes, operation/outcome, correlation reference, and timestamps for atomic replay and idempotency protection.
- An inactive Vercel-compatible entrypoint and configuration, focused offline tests, ADR-013, and durable operational boundaries.

#### Security and architecture

- Every tool requires an exact active human Scope approval, verified Git evidence, and an allowed DAB-3A policy decision. Human authority and workload identity remain separate; tool arguments cannot inject identity.
- Missing/stale/edited/deleted/ambiguous evidence, invalid or revoked identity, expiry, nonce replay, idempotency conflict, rate exhaustion, kill switch, or unavailable canonical data fails closed.
- No raw token, credential, nonce, request payload, result, arbitrary JSON, customer identity, customer database, unrestricted metadata, or general database capability is persisted.
- No hosting, deployment, database provisioning, migration execution, OAuth configuration, credential activation, ChatGPT app/plugin installation, workspace-policy change, runtime activation, write tool, Growth Engine behavior, or customer-facing capability is included.

#### Verification

- Focused DAB-3B/store tests passed 31/31, and directly affected DAB-2A/2B1/2B2/3A regressions passed 140/140.
- TypeScript checks passed for the MCP, bridge, and store packages. SQL/Drizzle parity, exact-file review, `git diff --check`, and security/forbidden-capability scans passed.
- The full application suite, production build, live server, network OAuth flow, live GitHub collection, database, migration execution, plugin installation, and deployment remain excluded.

### DAB-3A — Pure Offline Bridge Contracts and Policy Evaluation (2026-07-13)

#### Added

- Pure `@workspace/development-control-bridge` contracts for already-verified workload principals, deterministic request envelopes, immutable operation policy, bounded decisions, and credential-free fixtures.
- An explicit 20-operation catalog and independent authorization matrix covering read-only, modeled-write, and deferred operations without executing any operation.
- Fail-closed validation for repository, task, specification revision/hash, expected SHA, authorization category, human/workload identity, approval, Git evidence, request validity, principal expiry/revocation, nonce state, and idempotency observations.
- ADR-012 and durable guidance distinguishing the offline policy foundation from any future authenticated runtime or direct ChatGPT/Codex communication.

#### Security and architecture

- DAB-2A remains canonical for task and authorization semantics; DAB-2B1 and DAB-2B2 remain untouched persistence and GitHub-evidence adapter boundaries.
- Human approval and workload identity remain distinct. A workload cannot self-approve, and Scope, Editing, Git, deployment, credential, paid-provider, and external-action categories are never inferred from one another.
- Policy output is deterministic, bounded, credential-safe, and stably ordered. Missing, stale, ambiguous, edited, deleted, expired, revoked, replayed, or conflicting evidence fails closed.
- An `allowed` decision means only that offline policy evidence passed. No repository, GitHub, Git, deployment, network, database, credential, or external action executes.
- No live MCP server, authentication transport, API, UI, hosted runtime, network, credential access, database, schema, migration, integration, scheduler, worker, Growth Engine behavior, or customer-facing capability was added.

#### Verification

- Focused DAB-3A tests: 66/66 passed.
- Combined DAB-3A and directly affected DAB-2A tests: 92/92 passed across two files.
- TypeScript checks passed for `lib/development-control-bridge` and `lib/development-control`.
- Exact-file, diff-formatting, credential/environment, network, database/migration, customer-identity, GitHub-write, Git/deployment, live-MCP/runtime, and forbidden-scope scans passed.
- The full application suite and production build were intentionally excluded.

### DAB-2B2 — Read-Only GitHub Reconciliation (2026-07-13)

#### Added

- Pure `@workspace/development-control-github` contracts for caller-supplied read-only observations, stable normalization, immutable evidence versions, attribution, diagnostics, rate limits, and deterministic reconciliation.
- Exact approval binding to task, revision, specification hash, full expected SHA, independently authorized categories, numeric repository identity, and numeric approving-actor identity.
- Four-table tenant-independent Drizzle/SQL persistence boundary for bounded identities, evidence, cursors, and reconciliation runs, with atomic cursor/evidence/run writes and idempotent replay.
- Deterministic fixture client and focused coverage for ordering, deduplication, edited/deleted evidence, actor rename/impersonation, mutable-field rejection, stale/force-pushed refs, ETags, rate limits, rollback, replay conflicts, and customer-identity rejection.

#### Security and architecture

- DAB-2A remains the canonical pure model and DAB-2B1 its canonical durable store. GitHub is authoritative only for GitHub-owned observations.
- Raw GitHub bodies, payloads, headers, transcripts, credentials, environment values, stack traces, arbitrary errors, unrestricted metadata, and customer identity are excluded from persistence.
- DAB-2B2 exposes no GitHub mutation surface and adds no installed integration, webhook, App, Action, scheduler, worker, API, UI, hosted runtime, MCP, or automated approval/execution.
- No live GitHub credential, database credential, database provisioning, or migration execution is required. DAB-3 remains deferred.

#### Verification

- Focused DAB-2A, DAB-2B1, and DAB-2B2 tests: 74/74 passed across five files; 35 tests specifically cover the new reconciliation and storage boundary.
- TypeScript checks passed for `lib/development-control`, `lib/development-control-github`, and `lib/development-control-store`.
- SQL/Drizzle parity, additive migration scope, exact-file boundary, diff formatting, credential, customer identity, network/import, GitHub write-surface, and forbidden-runtime scans passed.
- No live GitHub call, database connection, credential access, migration execution, full application suite, or production build was used.

### DAB-2B1 — Tenant-Independent Durable Coordination Store (2026-07-13)

#### Added

- Canonical `DevelopmentCoordinationStore` interface covering all DAB-2A mutations and deterministic history reads while preserving the synchronous in-memory reference behavior.
- Immutable in-memory specification-revision and completion-report histories plus operation/task-scoped idempotency.
- Separate `@workspace/development-control-store` PostgreSQL/Drizzle package with explicit caller-supplied configuration and no environment access at import time.
- Nine-table tenant-independent schema for current task projections, immutable specifications, actor snapshots, append-only authorization decisions, current leases, sequenced audit events, milestone history, completion-report history, and idempotency results.
- One additive unapplied migration with bounded checks, foreign keys, unique current projections, history indexes, lease chronology, and no destructive operation or global delete blocker.
- PostgreSQL transaction boundaries that atomically persist projection changes, audit events, and operation/task-scoped idempotency results; transaction-scoped advisory locks serialize duplicate keys.
- Row locking, optimistic task/lease versions, PostgreSQL-clock claims and recovery, active-lease protection, deterministic history ordering, and bounded fail-closed errors.
- Cross-adapter contract tests, schema/migration boundary tests, configuration-redaction tests, and PostgreSQL store surface tests.

#### Security and architecture

- DAB-2A remains the pure canonical model; the durable store persists it without creating competing task, authorization, lifecycle, event, milestone, or report semantics.
- Development-control storage is separate from `lib/db`, customer `DATABASE_URL`, `clientId`, customer schemas, customer credentials, Growth Engine data, and customer retention rules.
- Connection configuration is caller-supplied. Importing the package never opens a connection, and bounded errors do not echo supplied values.
- Sensitive values, customer identity, unrestricted payloads, raw environment values, stack traces, transcripts, and unbounded output remain prohibited.
- DAB-2B1 does not provision a database, execute a live migration, host a service, reconcile GitHub, expose API/UI/scheduler/webhook behavior, automate Git/deployment, or establish direct agent communication.
- GitHub reconciliation remains DAB-2B2; direct ChatGPT/Codex communication remains DAB-3.

#### Verification

- Focused DAB-2A and DAB-2B1 tests: 39/39 passed.
- `lib/development-control` and `lib/development-control-store` TypeScript checks passed without a live database credential.
- PostgreSQL-backed integration execution remains an accepted environment-only limitation pending a separately authorized disposable test database; no credential was requested, guessed, or accessed.
- Full application suite and production build were intentionally excluded from this bounded control-plane phase.

### DAB-2A — Pure Development Coordination Contracts and State Machine (2026-07-13)

#### Added

- Separate `@workspace/development-control` pure TypeScript package with bounded task, actor, authorization, lifecycle, claim, event, milestone, and completion-report contracts.
- Deterministic canonical specification hashes and immutable revisions; changed revisions or hashes invalidate existing approvals.
- Ten independent authorization categories: scope, editing, committing, pushing, pull-request creation, merging, deployment, credentials, paid providers, and external actions.
- Structured approval records bound to exact task ID, revision, hash, expected Git SHA, categories, actor, decision, timestamps, optional expiration, constraints, rationale, and idempotency key.
- Test-only in-memory coordination store with fail-closed transitions, task and lease versions, atomic claims, bounded renewal, explicit expiration recovery, and no automatic claim stealing.
- Deterministic append-only events with idempotent replay, bounded metadata, expected/observed Git state, and immutable actor/specification provenance.
- Verified/not-verified/not-applicable Git and deployment milestones, including correct read-only and no-branch behavior.
- Bounded completion reports that reject sensitive fields, credential-shaped values, raw environment values, conversation transcripts, raw shell output, unauthorized files, and customer tenant identity.
- DAB-1-PILOT-001 and DAB-1-PILOT-002 fixtures plus 26 focused pure tests.

#### Security and architecture

- Development-control actors are operationally separate from customer tenant identity and customer-facing AI Edge schemas.
- Matthew Diaz is the only human authority allowed to grant material-action approval in DAB-2A fixtures and policy.
- Approval state remains separate from task lifecycle state; one authorization category never implies another.
- Wrong SHA, stale revision/hash, expired/revoked/rejected approval, unauthorized actor, foreign active claim, and stale task/lease versions fail closed.
- DAB-2A is only the pure machine-enforcement foundation. It does not complete DAB-2 and adds no persistence, database, migration, API, UI, GitHub integration, webhook, GitHub Action, MCP, network/environment access, credential use, shell/filesystem execution, automated Git/deployment behavior, live agent messaging, Growth Engine behavior, or customer-facing functionality.

#### Verification

- Focused DAB-2A tests: 26/26 passed.
- `lib/development-control` TypeScript check passed.
- Full application suite and production build were intentionally excluded from this bounded phase.

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

| #   | Invariant                                        | Result                                                  |
| --- | ------------------------------------------------ | ------------------------------------------------------- |
| I1  | No provider fetch before lease is held           | ✓ Enforced by service step ordering                     |
| I2  | Exactly one lease holder per deterministic run   | ✓ DB-atomic `INSERT ON CONFLICT DO NOTHING`             |
| I3  | Failed lease leaves no orphaned running snapshot | ✓ Fixed — `persistRunResult` moved after `acquireLease` |
| I4  | No new provider call after cancellation observed | ✓ 10 `shouldCancel()` checkpoints in pipeline           |

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
