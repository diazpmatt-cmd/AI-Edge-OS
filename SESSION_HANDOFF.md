# Session Handoff

## Latest session: DAB-1 GitHub-Backed Development Task Contract (2026-07-13)

**Status:** Implemented and verified on `feature/dab1-github-task-contract`; not committed or pushed.

### Starting Git state

- Branch created from: `main`
- Starting commit: `6235cf0b33e850c3bfec76b78d77253021e710d1`
- Verified local `main` and `origin/main` both matched the starting commit.
- Starting working tree was clean.
- Feature branch: `feature/dab1-github-task-contract`

### Implemented files

- `AGENTS.md` — compact canonical-document routing and mandatory repository, authorization, verification, sensitive-data, and DAB phase safeguards.
- `.github/ISSUE_TEMPLATE/development-agent-task.yml` — structured proposed-task and attributable-approval contract.
- `.github/pull_request_template.md` — implementation, verification, authorization, factual-milestone, and completion handoff contract.
- `docs/adr/ADR-008-development-agent-bridge.md` — staged GitHub → DAB-2 ledger → DAB-3 MCP architecture decision.
- `replit.md`, `ROADMAP.md`, `CHANGELOG.md`, and `SESSION_HANDOFF.md` — canonical durable guidance and project-history updates.

### Architecture decisions

- GitHub Issues and pull requests are the initial operational coordination surface. No mutable live task-ledger file is stored in the repository.
- Existing canonical repository documents retain durable engineering guidance, priorities, history, handoff, and architecture decisions.
- An issue field, assignment, proposal, plan, or agent statement is not approval. Only an attributable decision from Matthew Diaz's verified identity is evidence.
- Approval is bound to the exact task specification revision, expected `origin/main` SHA, and named authorization categories.
- Scope, editing, committing, pushing, merging, deployment, credentials, paid providers, and external actions are separate categories.
- Committed, pushed, pull-request-opened, merged, and deployed are factual milestones recorded only after verification.
- DAB-1 is contractual governance, not technical enforcement or direct agent communication. See `docs/adr/ADR-008-development-agent-bridge.md`.

### Verification

- GitHub Issue Form YAML parsed successfully and required form structure was validated using existing local tooling.
- Markdown structure and required task, handoff, Git-state, authorization, sensitive-data, and DAB-boundary language were validated.
- `git diff --check` passed.
- Sensitive-data, credential, environment, runtime, network, schema, migration, database, API, UI, scheduler, webhook, GitHub Action, MCP, Growth Engine, customer-facing, and forbidden-file scans passed.
- Complete diff review confirmed only the eight approved DAB-1 files changed.
- Full application tests and production build were intentionally not run because DAB-1 changes documentation and GitHub templates only.

### Deferred work

- DAB-2 may add a separately approved durable internal ledger with machine-enforced revisions, SHA checks, claims, transitions, approvals, idempotency, and append-only events.
- DAB-3 may add a separately approved authenticated, allowlisted MCP interface for bounded ChatGPT/Codex coordination.
- Neither DAB-2 nor DAB-3 is implemented, approved for implementation, or operational.
- No autonomous commit, push, merge, deployment, credential use, paid-provider call, or external action was introduced.

### Next action

Review the complete DAB-1 diff and verification report. Commit, push, pull-request creation, DAB-2, and DAB-3 require separate explicit authorization.

---

## Previous session: C8R-5 Tenant-Safe AI Visibility Read Model (2026-07-13)

**Status:** Implemented, accepted, verified, and ready for preservation on `feature/c8r-ai-visibility-read-model`.

### Starting Git state

- Branch created from: `main`
- Starting commit: `d528fa0d3ac8f47783560221ebcdd2744d6ad6f0`
- Feature branch: `feature/c8r-ai-visibility-read-model`

### Implemented files

- `lib/db/src/ai-visibility-read-model-types.ts` — bounded contracts, coverage diagnostics, canonical references, lifecycle facets, rejection reasons, and read-model outputs.
- `lib/db/src/ai-visibility-prioritizer.ts` — deterministic potential-value and attainability scoring with exported weights and thresholds.
- `lib/db/src/ai-visibility-read-model.ts` — pure validation, rejection, composition, deduplication, provenance merge, IDs, and stable ordering.
- `lib/db/src/ai-visibility-read-model-adapters.ts` — separate canonical-source adapters with no database, route, environment, OAuth, network, or provider-client access.
- `lib/db/src/ai-visibility-fixtures.ts` — bounded BB&B examples and all seven content lifecycle conditions.
- `lib/db/src/index.ts` — C8R-5 exports.
- `artifacts/ai-edge-solutions/src/lib/__tests__/ai-visibility-c8r5.test.ts` — 32 pure focused tests.

### Architecture decisions

- AI Visibility is a tenant-safe read model, not a source of truth. Local Presence, Discovery, backlinks, and Content Autopilot retain ownership.
- Legacy `ai_visibility_audits` is noncanonical and cannot supply evidence.
- Adapters translate canonical records into bounded inputs; the composer remains pure and provider-independent.
- Potential value and attainability remain separate. Missing sources produce coverage diagnostics, not zero-valued evidence.
- Preparation, approval, dispatch, and delivery remain distinct. Generated content without an approval record is `not_approved`; queued or scheduled content is not published.
- Invalid BB&B services, prohibited claims, unauthorized geography, mixed tenants, unsupported evidence, and malformed records are rejected before prioritization.
- See `docs/adr/ADR-007-c8r5-ai-visibility-read-model.md`.

### BB&B invariants

- Primary geography: Baldwin County, Alabama.
- Main phone: `251-324-9090`.
- No active termite service or termite opportunities.
- No whole-home bed-bug heat-treatment positioning.
- Furniture/item-level bed-bug treatment is the differentiator.
- Fumigation is active.

### Verification baseline

- C8R-5: 32/32 passed.
- Bounded C8R/Discovery regressions: 629 passed, 2 skipped.
- DB TypeScript: passed without `DATABASE_URL`.
- `git diff --check`: passed.
- Credential, network/environment, tenant-safety, lifecycle-collapse, legacy-AI-Visibility, and forbidden-file scans: passed.
- Full application suite and production build were intentionally not run for this bounded phase.

### Explicit exclusions and deferred work

- No persistence, migration, schema, API, UI, scheduler, provider, Similarweb integration, network collection, credentials, OAuth access, live AI prompt monitoring, automated outreach, or external execution.
- GBP collection, Search Console, GA4, local-rank tracking, tenant-safe review ingestion, Gemini, ChatGPT, Perplexity, and live answer-engine monitoring remain future bounded phases.
- Preserve the Google Local and AI Visibility order: canonical sources first, bounded adapters second, separately approved persistence/UI/live integrations later.

### Next approved mission

After this branch is documented, committed, pushed, and its pull request is created, perform the **read-only AI Edge Development Agent Bridge Feasibility Audit**. The bridge is not implemented and must not interrupt or expand C8R-5.

---

## Last session completed: YouTube Pilot — Security Cleanup + Phase 8 Tests (2026-07-11)

### What was done

**Phase 1 — Security cleanup complete.**
Scheduler-secret bypass added to `channel-info` for the one-time staging audit was removed.
Channel-info route is back to Clerk-only auth. SCHEDULER_SECRET removed from social-connections.ts.

**Staging complete.** One BB&B YouTube pilot draft is staged and waiting for the real MP4.

**Channel confirmed live.** YouTube channel-info called before cleanup:
- Channel name: `BedBugsand_Beyond`
- Channel ID: `UCGCZ49VYvCIff8rM-VU2eqA`
- Subscribers: 2 | Videos: 11 | Views: 1,325

**Phase 8 — 12 new tests added.** 130 total tests passing.

**Phases 2–7 — PENDING.** Blocked on Matthew providing the real MP4.

---

### Staged Draft

| Field | Value |
|-------|-------|
| Draft ID | `34b0a41b-e08b-43b3-8167-c73655854ab5` |
| Status | `draft` |
| Title | 3 Early Signs of Bed Bugs in Your Vacation Rental \| Bed Bugs & Beyond |
| Privacy | `private` |
| Tags | 13 tags stored |
| videoUrl | `null` — awaiting MP4 |
| youtubeVideoId | `null` — no upload yet |

---

### Permission-Test Videos (Matthew: review manually in YouTube Studio)

Two raw upload tests exist on the BedBugsand_Beyond channel from earlier OAuth scope validation.
They were NOT created through the staging system and do not appear in the `social_posts` DB.

| Video ID | Title | Uploaded |
|----------|-------|---------|
| `vFlpU5RJnH0` | Permission Test (draft — will not be published) | 2026-07-11 |
| `KjAi8pySVQo` | Permission Test (draft — will not be published) | 2026-07-07 |

**Privacy status:** Unknown from API (search endpoint does not return privacy status).
They appeared in the authenticated `forMine=true` search — they may be private, unlisted, or public.

**Recommended action:** Open YouTube Studio → Content → filter by upload date → confirm privacy
of both videos. Delete or set to private if you no longer need them.
**These were NOT deleted automatically.** Matthew must review and decide.

---

### MP4 Upload — Reusable Path (no new infrastructure needed)

1. `POST /storage/uploads/request-url` with `{ name, size, contentType: "video/mp4" }` → signed PUT URL
2. Client PUTs MP4 directly to object storage (max ~5 GB; recommend <100 MB for pilot)
3. `objectPath` saved to `video_url` on draft `34b0a41b`
4. Server reads via `GET /storage/objects/{objectPath}` (private, never publicly exposed)
5. Publisher pipes stream to YouTube resumable upload endpoint

---

### Next action (blocked on Matthew)

1. **Record** a short MP4 (60–90s landscape, H.264/AAC, <100 MB)
2. **Attach** it to draft `34b0a41b` via Publishing Center → video upload
3. **Confirm** Phase 4 pre-publish review (agent will show exact metadata)
4. **Approve** → agent triggers one private upload via normal scheduler path
5. **Verify** in YouTube Studio (video → private → title/description match)

---

### SCHEDULER_SECRET

Set as a Replit shared environment variable (not committed to source code).
The value is environment-only and rotated by Replit Secrets UI.
The channel-info route no longer accepts it — only the scheduler uses it
(via `social-posts.ts` scheduler trigger path, which is a legitimate server-internal call).

---

### Remaining GBP blocker (unchanged)

**GBP is still blocked** by `quota_limit_value: "0"` on project `474786012895`.
Matthew must enable both GBP APIs and request non-zero quota in GCP Console.

---

## Previous session: YouTube Staging — Phases 1–6 (2026-07-11)

### What was done

YouTube audit (phases 1–3), content field upgrades (phase 4), BB&B test draft prepared
(phase 5), and Phase 6 approval stop delivered.

**Added:**
- `youtube_title`, `youtube_privacy`, `youtube_video_id`, `youtube_tags` columns (DB + schema)
- `youtubeTags` in rowToDto, POST, PATCH, and YouTube publisher snippet
- Channel-info confirmed: BedBugsand_Beyond / UCGCZ49VYvCIff8rM-VU2eqA (live API call)
- 30 Phase 10 tests added (106 total at time of staging)

---

## Previous session: GBP Pilot Audit & Cleanup (TARGET phases 1–11)

Full 11-phase audit of the failed GBP first-publish attempt. All temp code removed,
cooldown hardened, 24 tests added. **No GBP post was published.**

**GBP blocker:** Account Management API → 429 on first request, project 474786012895.
Consistent with zero quota or API not enabled. Matthew must verify in GCP Console.

---

## Previous session: BB&B Pilot Baseline (Phase 11)

Full 13-phase audit. BB&B pilot config (`bbb-pilot.ts`), Content Autopilot defaults,
44 Phase 11 tests, ROADMAP created.

---

### Files changed this session

| File | Change |
|------|--------|
| `artifacts/api-server/src/routes/social-connections.ts` | Removed scheduler-secret bypass from channel-info; removed SCHEDULER_SECRET import |
| `artifacts/api-server/src/__tests__/youtube.test.ts` | 12 new Phase 12 tests (130 total) |
| `lib/db/src/schema/social-posts.ts` | Added `youtube_tags TEXT` field |
| `artifacts/api-server/src/routes/social-posts.ts` | youtubeTags in rowToDto/POST/PATCH/publisher |
| `ROADMAP.md` | YouTube pilot status updated |
| `SESSION_HANDOFF.md` | This file |
| `CHANGELOG.md` | YouTube pilot phase log |
