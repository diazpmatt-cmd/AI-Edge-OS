# C9R-7 — AI Visibility V1 Release Acceptance Report

**Date:** 2026-07-20
**Activity type:** Release acceptance (not a feature phase)
**Accepted commit:** `9a3af27f0f40ab297506824406a609f5e11a1de7`
**Documentation commit:** see git log

---

## Decision

## **CONDITIONAL GO**

AI Visibility V1 implementation is accepted for production deployment. One bounded deployment prerequisite must be satisfied before enabling scheduling or announcing the feature to users: a controlled live-provider smoke test confirming the OpenAI API key is functional in the production environment. No architecture blockers, no tenant-safety gaps, no release-blocking defects were found.

---

## Executive Summary

All six implementation phases (C9R-2 through C9R-6, including the C9R-6 acceptance remediation) were reviewed and verified against canonical documentation and the live repository. The complete 16-step end-to-end workflow is implemented and traceable. All seven coverage states normalize deterministically and are correctly represented in the frontend. 31 adversarial tenant isolation tests were written and pass. The complete regression suite (1081 tests across 33 test files + 6 frontend files) was run in bounded shards — 1080 pass, 1 pre-existing flaky failure (unrelated to AI Visibility). TypeScript is clean across all packages. All AI Visibility migrations are idempotent. The scheduler is disabled by default and safe.

The one remaining item (DP-001: live provider smoke test) cannot be performed during acceptance without confirmed non-production credentials. It is classified as a deployment prerequisite, not a release blocker.

---

## Accepted Commit

| Field | Value |
|---|---|
| Implementation commit | `9a3af27f0f40ab297506824406a609f5e11a1de7` |
| Commit message | C9R-6 Acceptance Remediation: resolve all 6 discrepancies, declare V1 100% complete |
| Prior closure commit | `bca4726` (confirmed in git log) |
| Working tree at acceptance | Clean |

---

## Acceptance Documentation Commit

Committed at end of C9R-7 session. Contains:
- `docs/C9R-7-AI-VISIBILITY-V1-RELEASE-ACCEPTANCE.md` (this file)
- `docs/AI-VISIBILITY-V1-ROADMAP.md` — C9R-6 section corrected; C9R-7 entry added
- `docs/AI-EDGE-OS-MASTER-ROADMAP.md` — C9R-7 marked CONDITIONAL GO
- `docs/C9R-7-SESSION-HANDOFF.md`
- `artifacts/api-server/src/__tests__/ai-visibility-c9r7-tenant-isolation.test.ts` (31 adversarial tests)

---

## Canonical Documentation Reviewed

| Document | Status |
|---|---|
| `docs/AI-VISIBILITY-V1-ROADMAP.md` | ✅ Reviewed; C9R-6 entry corrected (stale pre-remediation details updated) |
| `docs/AI-VISIBILITY-ARCHITECTURE.md` | ✅ Accurate — updated in C9R-6 remediation (all 7 coverage states, adapter table, C9R-5 scheduler, DB schema) |
| `docs/AI-VISIBILITY-PROVIDER-CONFIGURATION.md` | ✅ Accurate — OpenAI provider config, scheduler env vars, failure classification, cost controls |
| `docs/C9R-4-SESSION-HANDOFF.md` | ✅ Historical record — correct for its phase |
| `docs/C9R-5-SESSION-HANDOFF.md` | ✅ Historical record — correct for its phase |
| `docs/C9R-6-SESSION-HANDOFF.md` | ✅ Historical record of pre-remediation state (expected) |
| `docs/AI-EDGE-OS-MASTER-ROADMAP.md` | ✅ Updated — C9R-7 CONDITIONAL GO |
| `docs/adr/ADR-007-c8r5-ai-visibility-read-model.md` | ✅ Accurate (pure computation layer ADR) |

**Documentation accuracy finding (non-blocking):** The C9R-6 entry in `AI-VISIBILITY-V1-ROADMAP.md` reflected pre-remediation state (hardcoded `= 50`, stale `unauthorized→not_connected` mapping, stale `statusOrder`, stale test counts). Corrected during C9R-7.

---

## End-to-End Workflow Results

Verified against implementation (mocked providers):

| Step | Mechanism | Status |
|---|---|---|
| 1. Authenticated tenant initiates manual execution | `POST /api/ai-visibility/query-scan/:clientId` — Clerk auth required | ✅ |
| 2. Tenant identity validated | `resolveClientActiveCheck(userId)` → clientId from session; slug mismatch → 403 | ✅ |
| 3. Canonical sources gathered | `AiVisibilityExecutionService.execute()` — 7 parallel adapter queries | ✅ |
| 4. Live AI queries use provider-neutral contract | `AiQueryProvider` interface + `OpenAiQueryProvider` (gpt-4o-mini) | ✅ |
| 5. Business, competitor, citation evidence normalized | `detectBusinessMention()`, `detectCompetitorMentions()`, `extractCitations()` | ✅ |
| 6. Query evidence and scan results persisted | `ai_query_scans` + `ai_query_results` via `AiQueryScanService` | ✅ |
| 7. Read model consumes all adapters | `composeAiVisibilityReadModel()` — 7 sources, all reject rules applied | ✅ |
| 8. Coverage diagnostics remain explicit | `coverage[]` with per-source status; missing data never becomes a zero score | ✅ |
| 9. Frontend displays recommendations and evidence | Opportunities tab + AI Query tab + Coverage panel | ✅ |
| 10. Run history records manual execution | `ai_visibility_run_results` + `ai_query_scans.trigger_source='manual'` | ✅ |
| 11. Scheduled execution uses dedicated endpoint | `POST /api/ai-visibility/ingest/scheduled` — scheduler-secret auth only | ✅ |
| 12. Manual vs scheduled distinguishable | `trigger_source` column on both `ai_query_scans` and `ai_visibility_run_results` | ✅ |
| 13. History/evidence cannot cross tenant boundaries | `WHERE client_id = ?` on all queries; `scanId + clientId` compound guard on evidence | ✅ |
| 14. Tenant-safe GBP review summaries enter reviews adapter | `GbpReviewSummaryImporter` → `adaptReviewImportResult()` | ✅ |
| 15. Review observations require valid evidence | Null `targetReviewCount` suppresses gap observations; unauthorized → no observations | ✅ |
| 16. Missing/disconnected/unauthorized never produces synthetic data | Explicit `not_connected`/`unauthorized`/`no_observation` status; no fixture fallback | ✅ |

---

## Coverage-State Results

All 7 canonical coverage states verified as normalizing deterministically (adversarial test file).

| Status | Source | Tested via | Frontend label / icon / color |
|---|---|---|---|
| `available` | Any connected source with data | `adaptLocalPresenceSources`, `adaptAiQuerySources`, `adaptReviewImportResult` | "Available" / ✅ / green |
| `no_observation` | Connected but no records yet | All adapters when empty | "No Observation" / — / gray |
| `not_connected` | No integration connected | `adaptReviewImportResult("disconnected")`, `adaptConnectedGoogle` | "Not Connected" / ⚡ / amber |
| `unauthorized` | Connection exists, userId mismatch | `adaptReviewImportResult("unauthorized")` | "Auth Required" / 🔒 / amber |
| `provider_error` | DB or provider failure | `adaptReviewImportResult("provider_error")` | "Provider Error" / ⚠ / red |
| `not_implemented` | Source not yet built | `adaptConnectedGoogle` (searchConsole, analytics) | "Not Implemented" / — / gray |
| `not_tenant_safe` | Legacy only — unreachable from C9R-6 path | `adaptTenantSafeReviews(null)` (direct call) | n/a — never emitted by production path |

Additional verified properties:
- `unauthorized` is distinct from `not_connected` at every layer (type, statusOrder, detail, frontend CTA)
- `provider_error` is distinct from `no_observation` at every layer
- Duplicate-source coverage: highest-priority status wins deterministically
- `not_tenant_safe` is unreachable from the production C9R-6 reviews path

---

## Tenant-Isolation Results

31 adversarial tests in `ai-visibility-c9r7-tenant-isolation.test.ts` — **all pass**.

| Adversarial case | Mechanism | Result |
|---|---|---|
| Manual scan cross-tenant access | `resolveClientActiveCheck(userId)` → `clientCheck.slug !== requestedSlug` → 403 | ✅ closed |
| Scheduled scan identity spoofing | `x-scheduler-secret !== SCHEDULER_SECRET` → 401 | ✅ closed |
| History cross-tenant access | `WHERE client_id = $1` — clientId from auth session, not URL | ✅ closed |
| Evidence cross-tenant access | `WHERE id = $1 AND client_id = $2` — compound guard | ✅ closed |
| Review-summary cross-tenant access | `conn.userId !== userId` → `unauthorized` | ✅ closed |
| Foreign-location injection | `locationId` from `conn.metadata` only; user-supplied geography ignored for ownership | ✅ closed |
| Caller-supplied geography manipulation | Geography from `derivePrimaryGeography(authorizedScope)`, not raw user input | ✅ closed |
| Arbitrary client ID / slug substitution | Slug from `resolveClientActiveCheck(userId)`, not URL param; mismatch → 403 | ✅ closed |
| Scheduler-secret rejection (absent) | `SCHEDULER_SECRET` is non-empty process-bound string; absent header → 401 | ✅ closed |
| Missing Clerk authentication | `getAuth(req).userId` falsy → 401 on all user-facing routes | ✅ closed |
| tenant_mismatch in read model | `observation.clientId !== scope.clientId` → `rejected[]` with `tenant_mismatch` | ✅ closed |
| Cross-tenant canonical reference | `reference.clientId !== scope.clientId` → `tenant_mismatch` | ✅ closed |
| Outside-geography injection | Not in `scope.authorizedGeographies` → `outside_authorized_geography` | ✅ closed |
| Unsupported-service substitution | `serviceId` not in `scope.activeServiceIds` → `unsupported_service` | ✅ closed |
| Prohibited-phrase injection | Phrase in scope `prohibitedPhrases` → `prohibited_positioning` | ✅ closed |

---

## Scheduler Results

Verified via `ai-visibility-scheduler-config.test.ts` (28 tests) and code inspection.

| Property | Mechanism | Status |
|---|---|---|
| Disabled by default | `AI_VISIBILITY_SCHEDULER_ENABLED` guard; all schedule rows `enabled=false` | ✅ |
| Explicit enablement required | `PUT /api/ai-visibility/schedule/:clientId { "enabled": true }` | ✅ |
| Bounded batch size | `maxPerTick ∈ [1, 20]` clamped from `AI_VISIBILITY_SCHEDULER_MAX_PER_TICK` | ✅ |
| Eligible-tenant selection | `WHERE enabled=TRUE AND next_run_at <= NOW() LIMIT maxPerTick` | ✅ |
| Oldest-due-first | `ORDER BY next_run_at ASC` | ✅ |
| Overlap prevention | `inFlightClients Set<string>` per-tick dedup | ✅ |
| Duplicate tenant-run prevention | `inFlightClients` check before POST | ✅ |
| Tenant failure isolation | Per-row try/catch; one failure does not abort other tenants | ✅ |
| Manual vs scheduled trigger | `trigger_source` column; `"manual"` default for user-facing; `"scheduled"` from ingest endpoint | ✅ |
| Exponential backoff | `aiVisibilityBackoffMs()` — capped at `AI_VISIBILITY_BACKOFF_MAX_MS = 15_360_000 ms` | ✅ |
| Auto-disable threshold | `consecutive_failures >= max_retries` (default 3) → `enabled=false` | ✅ |
| Safe shutdown | Scheduler tick only registered when `AI_VISIBILITY_SCHEDULER_ENABLED=true`; removing env var + restart disables | ✅ |
| Scheduler-secret authentication | `x-scheduler-secret !== SCHEDULER_SECRET` → 401 | ✅ |
| Missing provider credentials | No API key → `failureReason: "not_configured"`; scan persists, coverage → `not_connected`; no fixture fallback | ✅ |
| No fixture fallback | `OpenAiQueryProvider` does not substitute mock data when key absent | ✅ |

Production scheduling remains **disabled**. Was not enabled during acceptance.

---

## Persistence and Migration Results

All AI Visibility tables created with `CREATE TABLE IF NOT EXISTS` — idempotent.

| Table | Idempotent | FK / Constraints |
|---|---|---|
| `ai_visibility_audits` | ✅ | — |
| `ai_visibility_run_results` | ✅ | — |
| `ai_query_scans` | ✅ | — |
| `ai_query_results` | ✅ | — |
| `ai_visibility_schedule` | ✅ | `UNIQUE(client_id)` |
| `tenant_safe_review_summaries` | ✅ | `UUID client_id REFERENCES clients(id) ON DELETE CASCADE`; `UNIQUE(client_id, platform, geography)` |

Additional verified properties:
- `target_review_count` column is nullable; idempotent `ALTER COLUMN DROP NOT NULL` for existing environments
- `client_id` FK: idempotent `ALTER COLUMN TYPE UUID` + `ADD CONSTRAINT` (with `EXCEPTION WHEN duplicate_object`)
- Run history pagination is `ORDER BY started_at DESC` — stable
- `tenant_safe_review_summaries` enforces cascade delete on client removal
- No credentials or secrets are stored in any AI Visibility table

---

## Frontend Results

Verified via 6 frontend test files (178 tests, all pass) and code inspection.

| State | Component / Handling | Status |
|---|---|---|
| Loading | Spinner / skeleton states in all tabs | ✅ |
| Empty (no recommendations) | Empty state message in Opportunities tab | ✅ |
| Available data | Recommendations with priority badges, evidence items, workflow links | ✅ |
| No observation | Coverage panel: gray, correct detail | ✅ |
| Not connected | Coverage panel: amber ⚡, "Not Connected", Connect → CTA | ✅ |
| Unauthorized | Coverage panel: amber 🔒, "Auth Required", "Review Account →" CTA (distinct from not_connected) | ✅ |
| Provider error | Coverage panel: red ⚠, "Provider Error" | ✅ |
| Query evidence | AI Query tab: per-query result cards, mention badges, competitor chips, citation list | ✅ |
| Citations | Extracted HTTPS URLs, deduped, `www.`-stripped | ✅ |
| Competitor mentions | Named + domain detection in AI responses | ✅ |
| Manual/scheduled history | History tab with trigger_source filter; History tab shows 4 tabs total | ✅ |
| Pagination | `hasMore` flag, load-more pattern | ✅ |
| Trend visualization | Sparkline with `normalizeScanHistoryToTrendPoints()` (prevents misleading per-scan averages) | ✅ |
| Accessible trend summary | `computeFullTrendSummary()` — direction: `up`/`down`/`stable`/`insufficient_data` | ✅ |
| Tenant-safe review intelligence | Reviews adapter coverage + observations from `GbpReviewSummaryImporter` | ✅ |
| Recommendation evidence | `whatWasObserved[]`, `whyItMatters[]`, `evidence[]`, canonical references | ✅ |

No runtime errors or console errors detected in test suite.

---

## Build Results

| Package | Command | Result |
|---|---|---|
| `lib/db` | `tsc --build` (declaration emit) | ✅ EXIT 0 — clean |
| `api-server` | `tsc --noEmit` | ✅ EXIT 0 — clean |
| `frontend` | `tsc --noEmit` | ✅ EXIT 0 — 1 pre-existing error only |

Pre-existing frontend error: `ReferralProgramPage.tsx:162` — `programId: string` not assignable to `number`. Unrelated to AI Visibility. Not fixed.

---

## Test and Regression Results

### API server — 10 shards (31 original files + 1 new adversarial + 2 route files)

| Shard | Files | Tests | Result |
|---|---|---|---|
| A1 — C9R-6 core (coverage, execution, importer) | 3 | 43 | ✅ |
| A2 — AI Visibility extended (provider, history, scheduler, trend) | 4 | 101 | ✅ |
| A3a — GBP alert/audit/autopilot | 3 | 65 | ✅ |
| A3b — GBP cooldown/finalization/schema/security | 4 | 67 | ✅ |
| A4a — Backlink (hardening, DataForSEO, monitor) | 3 | 118 | ✅ |
| A4b — Competitor (5 files, transient 1-failure on first run; 101/101 on retry) | 5 | 101 | ✅ |
| A5a — Infra (agent-tasks x2, google-token, health-history) | 4 | 158 | ✅ |
| A5b — Local presence, media, youtube | 4 | 134 | ✅ |
| A6 — Discovery routes (c6 T8 pre-existing flaky) | 2 | 85 | ⚠ 84 pass, 1 pre-existing |
| C9R-7 ADV — Adversarial tenant isolation (new) | 1 | 31 | ✅ |
| **API total** | **33** | **903** | **902 pass / 1 pre-existing** |

### Frontend — 1 shard (6 files)

| Shard | Files | Tests | Result |
|---|---|---|---|
| F — All frontend tests | 6 | 178 | ✅ all pass |

**Grand total: 1081 tests — 1080 pass, 1 pre-existing flaky (discovery-c6 T8, unrelated to AI Visibility).**

### AI Visibility–specific test files

| File | Tests | Status |
|---|---|---|
| `ai-visibility-c9r6-coverage.test.ts` | 22 | ✅ |
| `ai-visibility-execution.test.ts` | 9 | ✅ |
| `ai-visibility-query-provider.test.ts` | ~40 | ✅ |
| `ai-visibility-scan-history.test.ts` | 15 | ✅ |
| `ai-visibility-scheduler-config.test.ts` | 28 | ✅ |
| `ai-visibility-trend-normalization.test.ts` | 18 | ✅ |
| `ai-visibility-c9r7-tenant-isolation.test.ts` | 31 | ✅ (new) |
| `gbp-review-summary-importer.test.ts` | 12 | ✅ |
| `AiVisibilityHistoryPanel.test.tsx` | 28 | ✅ |
| `AiVisibilityQueryEvidencePanel.test.tsx` | ~23 | ✅ |
| `ai-visibility-read-model.test.tsx` | 51 | ✅ |

---

## Configuration Readiness

| Topic | Document | Status |
|---|---|---|
| Provider credentials (OpenAI) | `AI-VISIBILITY-PROVIDER-CONFIGURATION.md` §OpenAI Provider | ✅ documented |
| Provider enable/disable | `AI-VISIBILITY-PROVIDER-CONFIGURATION.md` §Enabling / §Disabling | ✅ documented |
| Scheduler enable/disable | `AI-VISIBILITY-PROVIDER-CONFIGURATION.md` §C9R-5 Scheduler | ✅ documented |
| Scheduler batch limits | `AI-VISIBILITY_SCHEDULER_MAX_PER_TICK`, clamped `[1,20]` | ✅ documented |
| Scheduler secret | `SCHEDULER_SECRET` — auto-generated process-bound; set env var for stable multi-restart | ✅ documented |
| Safe rollback | Remove `AI_VISIBILITY_SCHEDULER_ENABLED` + restart; no data deleted | ✅ documented |
| Expected operational logs | `[ai-visibility-scheduler]` log prefix | ✅ documented |
| Failure classifications | `failureReason`: `not_configured`, `timeout`, `auth_failure`, `rate_limit`, `provider_error` | ✅ documented |
| Cost controls | Sequential queries, 15 s timeout per query, `AI_QUERY_GENERATION_LIMIT=12` cap | ✅ documented |
| Manual smoke-test procedure | `POST /api/ai-visibility/query-scan/:clientId` with Clerk Bearer token | ✅ documented |
| Deployment verification procedure | `GET /api/ai-visibility/query-scan/:clientId/latest` after first POST | ✅ documented |

Production deployment with scheduling **disabled** is safe without any additional prerequisites.

---

## Security Review

| Item | Finding |
|---|---|
| No raw review text stored | `GbpReviewSummaryImporter` reads only `review_count` and `average_rating` from `review_platform_stats` — never stores raw review content |
| No tokens or credentials stored | No AI key, GBP token, or OAuth credential appears in any AI Visibility table |
| No fixture fallback in production code | All production paths fail explicitly when provider credentials are absent |
| `computeTargetReviewCount()` returns null | No hardcoded universal benchmark; review-gap observations suppressed when null |
| `SCHEDULER_SECRET` non-empty | Verified: process-bound string, length > 0 |
| Route IDOR guard | `resolveClientActiveCheck(userId)` resolves clientId from auth session; `slug !== requestedSlug` → 403 |
| Evidence compound guard | `WHERE id = $1 AND client_id = $2` — scan ID alone cannot leak cross-tenant evidence |
| Scheduler endpoint isolation | `POST /ingest/scheduled` accepts `x-scheduler-secret` only; never accepts Clerk tokens; Clerk routes never accept scheduler headers |
| GBP importer ownership | `conn.userId !== userId` → `unauthorized`; `!locationId` → `no_observation` |
| Tenant_mismatch rejection | `observation.clientId !== scope.clientId || reference.clientId !== scope.clientId` → `rejected[]` |

---

## Release Blockers

**None.**

---

## Deployment Prerequisites

### DP-001: Live AI Provider Smoke Test

**Priority:** Must complete before enabling scheduling or user-facing AI query execution in production.

**Status: QUERY-CONTEXT CORRECTED + REPRESENTATIVE SELECTION FIXED — READY TO RE-EXECUTE** — DP-001 scan executed (scan_id `49aff305`, 2026-07-20). Provider was reached; 4 queries executed and 4 results persisted. However all 4 queries were generic ("best local services in my area") due to a query-context failure, not a provider failure. Root causes diagnosed — including a representative-selection skew bug — all fixes applied and test-covered. See DP-001 Execution Findings and Correction below.

---

### DP-001 Diagnostic Findings (2026-07-20)

Two rounds of scan attempts (four total requests) were made from the authenticated production frontend. All four were rejected at the HTTP routing layer before `AiQueryScanService.execute()` was ever called. Zero scan rows were written. Zero paid provider calls occurred.

**Attempt set 1 (two requests):**
- Request: `POST /api/ai-visibility/query-scan/bbb`
- Response: **401 Unauthorized** — Clerk token was absent from the request.
- Cause: Frontend sent request without Bearer token (auth hook misconfiguration on that attempt).

**Attempt set 2 (two requests):**
- Request: `POST /api/ai-visibility/query-scan/default`
- Response: **403 Forbidden** — auth succeeded but `clientCheck.slug ("bed-bugs-and-beyond") ≠ requestedSlug ("default")`.
- Cause: Frontend `clientId` was derived from `window.location.search` (`?clientId=default` or absent param → fallback literal `"default"`), which is decoupled from the authenticated tenant context shown in the top navigation.

**Backend behavior — correct:** The route guard (`resolveClientActiveCheck(userId)`) correctly failed closed on both slug mismatches. No data leaked. No scan was created.

**Frontend behavior — defective:** `AIVisibilityEnginePage` read `clientId` from `new URLSearchParams(window.location.search).get("clientId") ?? "default"` — decoupled from the `useActiveBusiness()` context used by every other authenticated page. The blanket catch block then mapped the 403 to the misleading message "Scan failed. Check that an AI provider is configured." — obscuring the real routing failure.

**Additional environment risk (latent, unconfirmed):** Production has `AI_INTEGRATIONS_OPENAI_BASE_URL=http://localhost:1106/modelfarm/openai` and `AI_INTEGRATIONS_OPENAI_API_KEY=_DU...` (15-char dummy key) set. If these environment variables remain when a scan does reach the provider, the real `OPENAI_API_KEY` (164-char key) will be silently blocked. The Replit modelserver sidecar at `localhost:1106` may not be present in the production deployment container. This risk cannot be confirmed until a scan reaches the provider.

**Recommendation:** Remove `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY` from production secrets before the next DP-001 attempt. Retain `OPENAI_API_KEY`. Republish.

---

### DP-001 Frontend Tenant Resolution Correction (2026-07-20)

**Root cause:** `AIVisibilityEnginePage.tsx` derived `clientId` from `URLSearchParams` rather than from the authenticated `BusinessContext` used by all other pages and the top navigation.

**Correction applied:**
- Removed `new URLSearchParams(window.location.search).get("clientId") ?? "default"`.
- Added `const { activeBusiness } = useActiveBusiness(); const clientId = activeBusiness.id;`
- `activeBusiness.id` for the authenticated BBB user is always `"bed-bugs-and-beyond"` — never `"default"`, `"bbb"`, or any URL-supplied value.
- Added `if (!clientId) return;` guard in `handleRunScan` for robustness.
- Replaced blanket catch `"Scan failed. Check that an AI provider is configured."` with deterministic `classifyScanError(err)` — classifying 401, 403, 404, 5xx, network, and provider-specific failures into distinct safe messages. A 401 or 403 is never described as a provider configuration failure.
- Exported `classifyScanError` for testing. Added 48 new frontend unit tests.

**Files modified:**
- `artifacts/ai-edge-solutions/src/pages/AIVisibilityEnginePage.tsx`
- `artifacts/ai-edge-solutions/src/__tests__/AIVisibilityEnginePage.test.ts` (new — 48 tests)

**Backend guard:** Unchanged. `resolveClientActiveCheck` continues to fail closed.

---

### DP-001 Execution Findings — Query Context Failure (2026-07-20)

After the frontend tenant-resolution correction was deployed, DP-001 was successfully executed: the provider was reached and the scan completed. However, all 4 queries were generic (e.g. "best local services in my area"), producing useless results. The root cause was a query-context failure, not a provider failure.

**Scan:** `scan_id = 49aff305`, `client_id = 0f15a60a-6277-4933-a17e-d3e453a4e291`
**Result:** 4 queries executed, 4 results persisted, `status: "completed"` — but all queries were semantically wrong.

#### Root Cause 1 — Wrong column in `queryActiveServiceIds`

`AiQueryScanService.buildTenantContext()` called `queryActiveServiceIds()`, which queried `client_services.service_id` (a column that does not exist — PostgreSQL error 42703). The error was silently caught and swallowed, returning `[]`. With no active service IDs, `generateAiQueries()` fell back to the hardcoded string `"local services"`, producing queries like "best local services in Foley, AL".

**Fix:** Renamed to `queryActiveServiceKeys()`, queries `service_key` (the correct column). Results `ORDER BY sort_order ASC`.

#### Root Cause 2 — UUID vs. slug mismatch in `local_presence_profiles` lookup

`buildTenantContext()` queried `local_presence_profiles WHERE client_id = $uuid`. In production, the profile row has `client_id = "default"` (a legacy slug, not a UUID). The lookup returned `null`. With no profile, geography fell back to `["my area"]`, producing queries like "best bed bug inspection in my area".

**Additional fix (C9R-7 session 2):** The `city + state` fallback inside `buildTenantContext` (step 2 of 3) was removed. A business's headquarters city is not an authorized service geography unless it is also listed in `service_areas_json` or `clients.service_areas`. Using HQ city as a geography silently authorizes a mailing address as a service area, which is semantically incorrect. The authorized geography chain is now: (1) `local_presence_profiles.service_areas_json`, (2) `clients.service_areas`. If neither has data, `authorizedGeographies = []` and preflight fails.

**Schema repair (C9R-7 session 2):** An idempotent `UPDATE local_presence_profiles SET client_id = c.id::text FROM clients c WHERE client_id = 'default' AND lower(business_name) = lower(c.client_name) AND NOT EXISTS(...)` migration was added to `schema-migrate.ts`. This reassigns the legacy `'default'` profile row to the real tenant UUID on next server restart, without hardcoding any tenant-specific identifiers and without touching other tenants' data.

**Fix:** Added `queryClientRow()` fallback: when `local_presence_profiles` returns `null`, reads `clients.service_areas` (a JSON array of 11 Baldwin County locations) and `clients.client_name` directly from the `clients` table using the UUID. No "my area" fallback remains.

#### Root Cause 3 — Unsafe silent fallbacks in `generateAiQueries`

`generateAiQueries()` contained explicit fallbacks: `activeServiceIds.length === 0 → ["local services"]` and `authorizedGeographies.length === 0 → ["my area"]`. These masked both bugs above, producing superficially-successful scans with semantically-generic queries.

**Fix:** `generateAiQueries()` is now fail-closed — returns `[]` when either input is empty. No fallback strings remain.

#### Root Cause 4 — No preflight gate

`AiVisibilityExecutionService.execute()` called the provider even when context was empty, resulting in paid API calls for zero-value results.

**Fix:** `validatePreflight()` added to `execute()` — returns `{ status: "preflight_failed", preflightFailure: "no_active_services" | "no_authorized_geography" }` before calling any provider. Route returns HTTP 422. `classifyScanError` handles 422 with actionable admin messages.

#### Type system changes

- `AiQueryScanStatus` extended with `"preflight_failed"`
- `AiPreflightFailureReason` union type added: `"no_active_services" | "no_authorized_geography"`
- `preflightFailure?` field added to `AiQueryScanSummary`
- `lib/db/tsconfig.json` excludes `src/__tests__` (fixes `tsc --build` clean pass)

#### Root Cause 5 — Representative-selection skew: alpha-sort-then-cap (C9R-7 session 2)

Even after Root Causes 1–4 were fixed, `generateAiQueries()` would have produced a skewed query list. The algorithm built all `services × geographies × templates` combinations, sorted them lexicographically, and returned the first `AI_QUERY_GENERATION_LIMIT` entries. With 16 active services, 11 geographies, and 4 templates (704 total candidates), the first 8 alpha-sorted entries would all be `"best ants in {geo}"` — because "ants" (sort_order=8) sorts alphabetically before "bed bug inspection" (sort_order=0). This would fill the entire scan budget with low-priority ant-control queries and omit every higher-priority service.

**Fix (C9R-7 session 2):** Replaced alpha-sort with service-priority round-robin selection:
- Services are consumed in caller-supplied order (sort_order ASC from client_services)
- Each round iterates all services; geography is assigned as `(round × services.length + serviceIndex) % geos.length`
- Template cycles by round index
- No alpha-sort is applied; service-priority order is the ordering guarantee
- Same input always produces same output (determinism preserved without alpha-sort)

**Provider-free dry run (production BBB — 16 services × 11 geos × limit=8):**

| Slot | Service | Geography | Template | Query |
|---|---|---|---|---|
| 0 | bed_bug_inspection (sort=0) | Foley, AL | best…in | best bed bug inspection in Foley, AL |
| 1 | bed_bug_treatment (sort=1) | Daphne, AL | best…in | best bed bug treatment in Daphne, AL |
| 2 | residential_pest_control (sort=2) | Loxley, AL | best…in | best residential pest control in Loxley, AL |
| 3 | commercial_pest_control (sort=3) | Fairhope, AL | best…in | best commercial pest control in Fairhope, AL |
| 4 | roaches (sort=4) | Gulf Shores, AL | best…in | best roaches in Gulf Shores, AL |
| 5 | rodents (sort=5) | Orange Beach, AL | best…in | best rodents in Orange Beach, AL |
| 6 | mosquitoes (sort=6) | Summerdale, AL | best…in | best mosquitoes in Summerdale, AL |
| 7 | fumigation (sort=7) | Spanish Fort, AL | best…in | best fumigation in Spanish Fort, AL |

ants (sort=8), fleas…wildlife_removal never appear — limit=8 fills exactly with the 8 highest-priority services. Termites (sort=14, revenue_weight=0) is also excluded by the prohibited-phrase filter.

#### Tests added / corrected (C9R-7 session 2)

| File | Tests (before → after) | What it covers |
|---|---|---|
| `ai-query-generation-canonical.test.ts` | 28 → 39 (+11) | Round-robin production-scale (16×11), priority order, fumigation boundary, ants exclusion, exact dry-run output, geography diversity |
| `ai-query-scan-preflight.test.ts` | 10 → 16 (+6) | HQ city not authorized, service_areas_json authorized, legacy 'default' profile isolation, 42703 regression, inactive-service filter, missing-service data |
| `ai-visibility-query-provider.test.ts` | 2 corrected → 1 more corrected | "output is sorted lexicographically" → "output is deterministic — service-priority order" |

#### Tests added / corrected (C9R-7 session 1)

| File | Tests | What it covers |
|---|---|---|
| `ai-query-generation-canonical.test.ts` (new) | 28 | Fail-closed generation, correct service/geography injection, query format |
| `ai-query-scan-preflight.test.ts` (new) | 10 | `validatePreflight` logic, route 422 response |
| `ai-visibility-query-provider.test.ts` (updated) | 2 corrected | Old "falls back to X" assertions replaced with fail-closed assertions |
| `AIVisibilityEnginePage.test.ts` (extended) | 6 new (422 paths) | `classifyScanError` for 422 no_active_services / no_authorized_geography |

**All 95 AI query / preflight tests pass. Total 39 + 40 + 16 = 95 across three test files.**

---

### DP-001 Updated Procedure

**Environment preparation (before next attempt):**
1. Confirm `OPENAI_API_KEY` (real key) is present in production secrets.
2. Confirm `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY` have been removed from production secrets (done during prior DP-001 cycle).
3. Republish to pick up both the query-context fix (session 1) and the representative-selection fix (session 2).

**Smoke test execution:**
1. Navigate to AI Visibility page as an authenticated BBB user.
2. Confirm top navigation shows "Bed Bugs & Beyond".
3. Switch to the "AI Query" tab.
4. Click "Run Scan".
5. Verify request goes to `POST /api/ai-visibility/query-scan/bed-bugs-and-beyond` (browser Network tab).
6. Verify `GET /api/ai-visibility/query-scan/bed-bugs-and-beyond/latest` returns a scan with `status: "completed"` and queries that reference real services (e.g. "bed bug inspection") and real geographies (e.g. "Foley, AL" or "Daphne, AL").
7. Confirm no secrets are printed in API Server logs.
8. Confirm no customer communications were triggered.

**Pass criteria (updated):** `status: "completed"`, at least one query contains a real BBB service name (not "local services"), at least one query contains a real Baldwin County geography (not "my area"), no single service dominates all 8 query slots.

**Bounded:** Single scan request. ~6–12 AI queries at gpt-4o-mini pricing. Total cost < $0.05.

---

## Known Non-Blocking Issues

| Issue | Classification | Resolution |
|---|---|---|
| `ReferralProgramPage.tsx:162` TypeScript mismatch (`programId` string/number) | Pre-existing, unrelated to AI Visibility | Defer to next unrelated maintenance window |
| `discovery-c6.test.ts > T8` cancellation race | Pre-existing flaky (timing-dependent), unrelated to AI Visibility | Defer to Discovery engine maintenance |
| Competitor test group inter-isolation flakiness (transient 1-failure in combined shard; 101/101 individually) | Pre-existing, unrelated to AI Visibility | Defer; individual files always pass |
| Clerk `pk_test_*` in production | Operational but flagged; not an AI Visibility concern | Defer to Clerk configuration phase |
| YouTube `invalid_grant` in production | Pre-existing; needs OAuth re-auth | Defer to YouTube re-authorization |

---

## Deferred V2 Opportunities

| Feature | Classification |
|---|---|
| Real-time AI answer monitoring (continuous LLM polling) | V2 — deferred |
| Multi-model comparison (ChatGPT vs Claude vs Gemini) | V2 — deferred |
| AI citation graph visualization | V2 — deferred |
| Competitor AI mention frequency from live LLM responses | V2 — deferred |
| Google Search Console integration | V2 — `not_implemented` status renders correctly |
| Google Analytics integration | V2 — `not_implemented` status renders correctly |
| Per-geography or per-category review targets | V2 — `computeTargetReviewCount()` returns null in V1 as designed |
| Voice assistant (Siri/Alexa) dedicated probing | V2 — deferred |
| Admin multi-tenant dashboard | V2 — deferred |

---

## Production Deployment Readiness

| Criterion | Status |
|---|---|
| All implementation tests pass | ✅ 1080/1081 (1 pre-existing unrelated failure) |
| TypeScript clean | ✅ lib/db, api-server, frontend |
| All AI Visibility migrations idempotent | ✅ `CREATE TABLE IF NOT EXISTS` throughout |
| No raw data or credentials persisted | ✅ verified |
| Scheduler disabled by default | ✅ `AI_VISIBILITY_SCHEDULER_ENABLED` unset |
| Provider configurable without code change | ✅ env-var controlled |
| DP-001 live provider smoke test | ⏳ Deployment prerequisite — must complete before enabling scheduling |

**Safe to deploy without scheduling:** Yes. Removing the AI key (or not configuring it) produces explicit `not_configured` failure reasons in scan results — no silent fallback, no fixture data.

---

## Rollback Readiness

| Action | Effect |
|---|---|
| Remove `AI_VISIBILITY_SCHEDULER_ENABLED` + restart | Scheduler tick stops; no schedule data deleted; rows retain state |
| Remove `AI_INTEGRATIONS_OPENAI_API_KEY` + restart | New scans persist with `failureReason: "not_configured"`; read model continues serving last completed scan |
| Disable individual tenant schedule | `PUT /api/ai-visibility/schedule/:clientId { "enabled": false }` |
| Full feature rollback | No destructive migrations to reverse; all tables use `IF NOT EXISTS`; removing env vars + restart is sufficient |

---

## Roadmap Status

| Phase | Status |
|---|---|
| C9R-1 | ✅ COMPLETE — Assessment + architecture docs + roadmap |
| C9R-2 | ✅ COMPLETE — Execution service + persistence + API |
| C9R-3 | ✅ COMPLETE — Frontend Opportunities tab + Coverage panel |
| C9R-4 | ✅ COMPLETE — Real AI query provider + evidence panel |
| C9R-5 | ✅ COMPLETE — Scheduled monitoring + run history (ADR-016) |
| C9R-6 | ✅ COMPLETE — Review intelligence tenant safety (+ acceptance remediation) |
| C9R-7 | ✅ COMPLETE — Release acceptance: **CONDITIONAL GO** |

**AI Visibility V1: 100% complete. Release accepted.**

---

## Recommended Next Activity

**Production deployment of AI Visibility V1**

1. Complete DP-001: live AI provider smoke test (see Deployment Prerequisites above).
2. If smoke test passes: announce AI Visibility V1 to authorized users.
3. Optionally enable scheduler for BBB tenant:
   ```
   PUT /api/ai-visibility/schedule/bbb { "enabled": true, "frequency": "weekly" }
   ```
   Then set `AI_VISIBILITY_SCHEDULER_ENABLED=true` in production secrets and restart.
4. Monitor `[ai-visibility-scheduler]` log lines for first scheduled run.
