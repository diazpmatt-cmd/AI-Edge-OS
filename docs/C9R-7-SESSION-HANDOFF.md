# C9R-7 Session Handoff — AI Visibility V1 Release Acceptance

**Date:** 2026-07-20
**Phase:** C9R-7 (release acceptance — not an implementation phase)
**Prior phase:** C9R-6 + acceptance remediation (commit `9a3af27`)
**Decision:** CONDITIONAL GO

---

## What Was Done

Performed formal release acceptance for AI Visibility V1 across:

- End-to-end workflow verification (all 16 steps)
- All 7 coverage-state acceptance (normalized deterministically)
- 31 adversarial tenant isolation tests (new test file)
- Scheduler safety property verification
- Persistence and schema migration verification
- Frontend state acceptance
- Complete regression across 33 test files (1080/1081 pass; 1 pre-existing flaky)
- TypeScript clean (lib/db, api-server, frontend)
- Canonical documentation updated (roadmap C9R-6 entry corrected, C9R-7 added)

## New Files

| File | Purpose |
|---|---|
| `artifacts/api-server/src/__tests__/ai-visibility-c9r7-tenant-isolation.test.ts` | 31 adversarial tenant isolation tests |
| `docs/C9R-7-AI-VISIBILITY-V1-RELEASE-ACCEPTANCE.md` | Formal acceptance report |
| `docs/C9R-7-SESSION-HANDOFF.md` | This file |

## Modified Files

| File | Change |
|---|---|
| `docs/AI-VISIBILITY-V1-ROADMAP.md` | C9R-6 entry corrected (post-remediation state); C9R-7 entry added |
| `docs/AI-EDGE-OS-MASTER-ROADMAP.md` | C9R-7 marked complete (CONDITIONAL GO) |

---

## Decision: CONDITIONAL GO

**Implementation accepted.** No release blockers. One deployment prerequisite:

> **DP-001:** Live AI provider smoke test — verify that `AI_INTEGRATIONS_OPENAI_API_KEY` (or `OPENAI_API_KEY`) is configured in the production environment and a single controlled POST to `/api/ai-visibility/query-scan/:clientId` completes successfully before enabling the scheduler or announcing the feature.

All other deployment prerequisites are satisfied:
- Scheduler disabled by default (`AI_VISIBILITY_SCHEDULER_ENABLED` unset)
- `SCHEDULER_SECRET` auto-generated process-bound (no external configuration required)
- All migrations idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`)
- Rollback: remove `AI_VISIBILITY_SCHEDULER_ENABLED` from secrets + restart; no data deleted

---

## Known Non-Blocking Issues

| Issue | Classification |
|---|---|
| `ReferralProgramPage.tsx:162` TypeScript mismatch | Pre-existing, unrelated to AI Visibility |
| `discovery-c6.test.ts > T8` cancellation race | Pre-existing flaky, unrelated to AI Visibility |
| Competitor test group inter-isolation flakiness | Pre-existing, transient — all 101 tests pass individually |
| Clerk `pk_test_*` in production | Operational; upgrade to `pk_live_*` is a separate deferred item |
| YouTube `invalid_grant` in production | Pre-existing; needs re-auth separately |

---

## Accepted Commit

`9a3af27f0f40ab297506824406a609f5e11a1de7` — C9R-6 Acceptance Remediation (all 6 discrepancies resolved)

Acceptance documentation commit: TBD (committed at end of C9R-7 session)

---

## DP-001 Diagnostic Findings (2026-07-20)

Four production scan requests were made. All four were rejected before the scan service was reached. Zero rows written. Zero paid calls.

| Request | Response | Root cause |
|---|---|---|
| `POST .../query-scan/bbb` × 2 | 401 | Bearer token absent — auth hook did not fire |
| `POST .../query-scan/default` × 2 | 403 | Slug mismatch: resolved slug `"bed-bugs-and-beyond"` ≠ requested `"default"` |
| `POST .../query-scan/bed-bugs-and-beyond` | — | Never attempted — page never built this URL |

**Backend guard: correct.** `resolveClientActiveCheck` failed closed on every attempt.

**Frontend defect:** `clientId` was read from `URLSearchParams` (`?clientId=` param → fallback `"default"`), not from `useActiveBusiness()`. Blanket catch showed "Scan failed. Check that an AI provider is configured." for every non-2xx, including 403 — a misleading diagnosis.

**Latent environment risk:** `AI_INTEGRATIONS_OPENAI_BASE_URL=localhost:1106` and a dummy `AI_INTEGRATIONS_OPENAI_API_KEY` block the real `OPENAI_API_KEY`. Unconfirmable until a scan reaches the provider.

---

## DP-001 Tenant Resolution Correction (2026-07-20)

Frontend correction applied. **DP-001 remains pending.** Release status remains **CONDITIONAL GO**.

### Files Modified

| File | Change |
|---|---|
| `artifacts/ai-edge-solutions/src/pages/AIVisibilityEnginePage.tsx` | Replace `URLSearchParams` clientId with `useActiveBusiness().activeBusiness.id`; export `classifyScanError`; fix `handleRunScan` catch |
| `artifacts/ai-edge-solutions/src/__tests__/AIVisibilityEnginePage.test.ts` | New — 48 tests (tenant identity constants + error classification) |
| `docs/C9R-7-AI-VISIBILITY-V1-RELEASE-ACCEPTANCE.md` | DP-001 diagnostic findings + correction record appended |
| `docs/C9R-7-SESSION-HANDOFF.md` | This file — updated with DP-001 findings |

### Correction Summary

- `clientId` now sourced from `useActiveBusiness().activeBusiness.id` — same context as top nav and all other authenticated pages
- No `"default"` fallback. No URL query string override for ordinary tenant users.
- Scan button guard: `if (!clientId) return` in `handleRunScan`
- Error classification: 401→session expired, 403→access denied, 404→not found, 5xx→service error, network→connection error, provider failures→specific messages. Never describes a 401 or 403 as a provider configuration failure.
- `classifyScanError` exported for direct unit testing

---

## DP-001 Execution Findings — Query Context Failure (2026-07-20, session 1)

After the frontend correction was deployed, DP-001 was executed and the provider was reached. **The scan completed but all 4 queries were generic** (e.g. "best local services in my area"), producing zero-value results. Three root causes were identified, fixed, and test-covered in this session.

**Scan:** `scan_id = 49aff305`, `client_id = 0f15a60a-6277-4933-a17e-d3e453a4e291`
**Result:** Completed, 4 queries, 4 results — all semantically wrong.

### Root Causes and Fixes (Session 1)

| # | Root Cause | Fix |
|---|---|---|
| 1 | `queryActiveServiceIds` queried `client_services.service_id` (nonexistent column → PostgreSQL 42703 silently swallowed → `[]`) | Renamed to `queryActiveServiceKeys()`, queries `service_key` + `ORDER BY sort_order ASC` |
| 2 | `buildTenantContext` looked up `local_presence_profiles WHERE client_id = $uuid` but prod profile has `client_id = "default"` (slug) → null → `["my area"]` fallback | Added `queryClientRow()` fallback reading `clients.service_areas` (JSON array, 11 locations) + `clients.client_name` by UUID |
| 3 | `generateAiQueries()` contained `activeServiceIds=[] → "local services"` and `geographies=[] → "my area"` silent fallbacks that masked both bugs | Removed all fallbacks — fail-closed: returns `[]` when either input is empty |
| 4 | No preflight gate — provider called even on empty context, spending API budget on zero-value scans | `validatePreflight()` in `execute()` → `{status:"preflight_failed", preflightFailure:...}` before any provider call; route returns 422 |

### Type System Changes

- `AiQueryScanStatus` ∪ `"preflight_failed"` added
- `AiPreflightFailureReason` = `"no_active_services" | "no_authorized_geography"` exported from `lib/db`
- `preflightFailure?` field on `AiQueryScanSummary`
- `lib/db/tsconfig.json` excludes `src/__tests__` (fixes `tsc --build` clean pass)

### Tests Added / Corrected (Session 1)

| File | Tests | Coverage |
|---|---|---|
| `ai-query-generation-canonical.test.ts` (new) | 28 | Fail-closed generation, correct service/geography injection, query format |
| `ai-query-scan-preflight.test.ts` (new) | 10 | `validatePreflight` logic, HTTP 422 response |
| `ai-visibility-query-provider.test.ts` (2 corrected) | — | Old "falls back to X" → new fail-closed assertions |
| `AIVisibilityEnginePage.test.ts` (6 added) | — | `classifyScanError` for 422 no_active_services / no_authorized_geography |

**All 201 AI-visibility-related tests pass after session 1 corrections.**

### Files Modified (Session 1 — Query Context Fix)

| File | Change |
|---|---|
| `artifacts/api-server/src/lib/ai-query-scan-service.ts` | `queryActiveServiceKeys()` (correct column); `queryClientRow()` fallback; no "my area"/"local services" strings |
| `lib/db/src/ai-query-generation.ts` | Fail-closed — returns `[]` when services or geographies empty; all fallback strings removed |
| `lib/db/src/ai-query-provider-types.ts` | `AiQueryScanStatus` + `"preflight_failed"`; `AiPreflightFailureReason` type; `preflightFailure?` on summary |
| `artifacts/api-server/src/routes/ai-visibility.ts` | HTTP 422 for `status === "preflight_failed"` |
| `artifacts/ai-edge-solutions/src/pages/AIVisibilityEnginePage.tsx` | `classifyScanError` 422 branch with actionable admin messages |
| `lib/db/tsconfig.json` | Excludes `src/__tests__` |
| `artifacts/api-server/src/__tests__/ai-query-generation-canonical.test.ts` | New — 28 tests |
| `artifacts/api-server/src/__tests__/ai-query-scan-preflight.test.ts` | New — 10 tests |
| `artifacts/api-server/src/__tests__/ai-visibility-query-provider.test.ts` | 2 test assertions corrected |
| `artifacts/ai-edge-solutions/src/__tests__/AIVisibilityEnginePage.test.ts` | 6 new 422 test cases |

---

## DP-001 Representative Selection Fix (2026-07-20, session 2)

Root causes 1–4 were corrected in session 1. A further analysis (session 2) revealed a fifth issue that would have produced poor-quality queries even with valid context data: the **representative-selection skew bug**.

### Root Cause 5 — Alpha-sort-then-cap skew in `generateAiQueries`

The algorithm built all `services × geographies × templates` combinations (16 × 11 × 4 = 704 for production BBB), sorted lexicographically, and capped at `AI_QUERY_GENERATION_LIMIT = 8`. With "ants" sorting before "bed bug inspection" alphabetically, the first 8 entries would all be ant-control queries, omitting every higher-priority BBB service. The `sort_order` column (tenant-canonical priority) was entirely ignored by the selection algorithm.

### Fix — Service-priority round-robin

`generateAiQueries()` now uses a **service-priority round-robin** algorithm:
- Outer loop: rounds (0, 1, 2, …) — each round advances the template index
- Inner loop: all services in caller-supplied order (sort_order ASC)
- Geography: `(round × services.length + serviceIndex) % geos.length` — distributes geos across services per round
- Deduplication via `Set<string>` on lower-cased queries
- Output is deterministic (no random element) but no longer alpha-sorted

### Geography integrity fix

Removed `city + state` from the geography fallback chain in `buildTenantContext`. A business's HQ address is not an authorized service geography. Authorized sources: (1) `local_presence_profiles.service_areas_json`, (2) `clients.service_areas`.

### Schema repair (idempotent)

Added to `schema-migrate.ts`: reassign `local_presence_profiles.client_id = 'default'` → real UUID, matched by `lower(business_name) = lower(clients.client_name)`, guarded by NOT EXISTS. Runs on next server restart. Idempotent.

### Provider-free dry run — exact production output (16 services × 11 geos × limit=8)

```
best bed bug inspection in Foley, AL
best bed bug treatment in Daphne, AL
best residential pest control in Loxley, AL
best commercial pest control in Fairhope, AL
best roaches in Gulf Shores, AL
best rodents in Orange Beach, AL
best mosquitoes in Summerdale, AL
best fumigation in Spanish Fort, AL
```

All 8 slots: distinct services in sort_order priority, distinct authorized geographies, no prohibited phrases, no generic content.

### Tests Added (Session 2)

| File | Tests (before → after) | What it covers |
|---|---|---|
| `ai-query-generation-canonical.test.ts` | 28 → 39 (+11) | Round-robin 16×11, priority order, fumigation boundary, ants exclusion, exact dry-run queries, geo diversity |
| `ai-query-scan-preflight.test.ts` | 10 → 16 (+6) | HQ city not authorized, service_areas_json authorized, legacy 'default' profile isolation, 42703 regression, is_active filter, missing service data |
| `ai-visibility-query-provider.test.ts` | +1 corrected | Alpha-sort assertion → service-priority-order determinism assertion |

**95 tests across 3 files — all pass (39 + 40 + 16).**

### Files Modified (Session 2)

| File | Change |
|---|---|
| `lib/db/src/ai-query-generation.ts` | Round-robin selection (service-priority order); removed alpha-sort; full policy documentation |
| `artifacts/api-server/src/lib/ai-query-scan-service.ts` | Removed `city + state` fallback; geography chain now: service_areas_json → clients.service_areas only |
| `artifacts/api-server/src/lib/schema-migrate.ts` | Idempotent `UPDATE local_presence_profiles … WHERE client_id = 'default'` data repair |
| `artifacts/api-server/src/__tests__/ai-query-generation-canonical.test.ts` | 28→39: determinism correction + 11 round-robin acceptance tests |
| `artifacts/api-server/src/__tests__/ai-query-scan-preflight.test.ts` | 10→16: 6 geography/service-registry integrity tests |
| `artifacts/api-server/src/__tests__/ai-visibility-query-provider.test.ts` | 1 alpha-sort assertion → service-priority-order determinism |

---

## Local-First Digital Intelligence Roadmap Update (2026-07-20)

Documentation-only update. No features implemented. No existing V1 percentages changed. No accepted engines reopened.

### Canonical Documents Updated

| Document | Change |
|---|---|
| `docs/AI-EDGE-OS-MASTER-ROADMAP.md` | Baldwin County strategic invariant; 7 post-V1 workstreams; Geographic Expansion Gates; Explicit Exclusions; Similarweb-Inspired Boundary; Business Constraints; Existing Engine Ownership table |
| `docs/adr/ADR-017-local-first-strategic-invariant.md` | New ADR recording the Baldwin County First invariant as a permanent governing constraint |
| `docs/C9R-7-SESSION-HANDOFF.md` | This section |

### Workstreams Added (Documentation Only — Not Started)

| ID | Workstream |
|---|---|
| WS-1 | AI Traffic Attribution (ChatGPT/Perplexity/Gemini/Copilot/Claude/Grok/DeepSeek/AI Mode) |
| WS-2 | First-Party Traffic and Channel Intelligence |
| WS-3 | Baldwin County Search Intelligence |
| WS-4 | Local Competitor Intelligence Expansion |
| WS-5 | Advertising Intelligence |
| WS-6 | Conversion Intelligence → future Conversion Edge |
| WS-7 | Natural-Language Intelligence / Command Center |

### Strategic Invariant

> Conquer Baldwin County first. Geographic expansion occurs only after AI Edge demonstrates repeatable, measurable, profitable growth for Bed Bugs & Beyond within Baldwin County.

Governed by ADR-017. Geographic expansion is gated at Stage 1 (Baldwin County), Stage 2 (adjacent Gulf Coast, 8-criterion gate), and Stage 3 (regional, requires Stage 2 evidence).

### Explicit Exclusions Documented

International expansion, global intelligence, retail pricing, Amazon consumer, stock market, cross-retailer, app-store, unapproved contact scraping, and unsupported competitor revenue claims are out of scope.

### V1 Percentages Preserved

All existing completion percentages are final. The new workstreams (WS-1 through WS-7) are marked ⬜ Not started.

---

## DP-001 Query Quality — Session 3 Fixes (2026-07-21)

Sessions 1 and 2 corrected: auth routing, slug resolution, column name, geography fallback, preflight gate, and representative selection. Two further quality deficiencies were identified and corrected in session 3 before deployment.

### Root Cause 6 — Intent-template skew (all-"best" queries)

**Problem:** `templateIdx = round % templates.length` is evaluated in the outer loop. With 16 services ≥ limit=8, round 0 fills all 8 slots. Every slot in round 0 receives `template 0` ("best {s} in {l}"). The other three intent templates ("recommended…company in", "who provides…near", "top…services in") never appeared in the output.

**Fix:** Move template selection inside the inner loop, keyed on the current emitted slot count:
```typescript
const templateIdx = result.length % templates.length;
```
This causes each consecutive emitted slot to advance to the next intent template, regardless of round. With 4 templates and limit=8, each template appears exactly twice.

### Root Cause 7 — Bare pest plural in queries (e.g. "best roaches")

**Problem:** `humanizeServiceId("roaches")` returns `"roaches"` (separator-to-space, no semantic mapping). This produced queries like `"best roaches in Gulf Shores, AL"` — not a phrase a real customer would type.

**Fix:** Added `SERVICE_DISPLAY_NAMES` map + exported `displayServiceName()` to `lib/db/src/ai-query-generation.ts`:

| Service key | Before | After |
|---|---|---|
| `roaches` | "roaches" | "roach control" |
| `rodents` | "rodents" | "rodent control" |
| `mosquitoes` | "mosquitoes" | "mosquito control" |
| `ants` | "ants" | "ant control" |
| `fleas` | "fleas" | "flea control" |
| `ticks` | "ticks" | "tick control" |
| `wasps_hornets` | "wasps hornets" | "wasp and hornet control" |
| `spiders` | "spiders" | "spider control" |
| `moles` | "moles" | "mole control" |
| `wildlife_removal` | "wildlife removal" | "wildlife removal" (unchanged) |

Service keys without an entry fall back to `humanizeServiceId()`. The map contains general pest-control industry terms only — no tenant-specific values hardcoded.

### Provider-free dry run — exact production output (Session 3 — final)

Template rotation by emitted slot (`result.length % 4`): slots 0,4 → "best", slots 1,5 → "recommended", slots 2,6 → "who provides", slots 3,7 → "top".

```
best bed bug inspection in Foley, AL
recommended bed bug treatment company in Daphne, AL
who provides residential pest control near Loxley, AL
top commercial pest control services in Fairhope, AL
best roach control in Gulf Shores, AL
recommended rodent control company in Orange Beach, AL
who provides mosquito control near Summerdale, AL
top fumigation services in Spanish Fort, AL
```

All constraints satisfied: 4 distinct intent templates (2 slots each), 8 distinct priority services, 8 distinct authorized geographies, no prohibited phrases, no bare pest plurals, no generic content.

### Tests Added / Corrected (Session 3)

| File | Tests (before → after) | What it covers |
|---|---|---|
| `ai-query-generation-canonical.test.ts` | 39 → 71 (+32) | Intent diversity (10 tests), service humanization (15 `displayServiceName` unit tests), natural-phrasing regression (9 tests), corrected `humanizeServiceId` and `displayServiceName` imports on 3 existing service-label assertions, corrected exact dry-run test to session 3 expected output |

**71 tests in canonical file, all pass. Provider and preflight files unaffected (56 pass).**

### Files Modified (Session 3)

| File | Change |
|---|---|
| `lib/db/src/ai-query-generation.ts` | `SERVICE_DISPLAY_NAMES` map; exported `displayServiceName()`; `templateIdx` moved to inner loop keyed on `result.length` |
| `artifacts/api-server/src/__tests__/ai-query-generation-canonical.test.ts` | 39→71: `displayServiceName` import + 3 assertion corrections + 32 new tests (sections 10, 11, 12) |

---

## DP-001 Final Pass — Production Accepted (2026-07-21)

**Status: GO — AI Visibility V1 is fully production-accepted.**

### Evidence

| Field | Value |
|---|---|
| Execution timestamp | `2026-07-21T01:45:06.719Z` UTC |
| HTTP response | 201 Created |
| Latency | 16,147 ms |
| Scan ID | `d2e7852c-8278-4be3-aa44-5f9af0297a47` |
| Queries executed | 8 / 8 (`success: true` on all) |
| Citation rate | 0 % (valid measured baseline — no AI citation yet) |
| trigger_source | `manual` |
| Errors | 0 |

All 8 queries used real BBB service names, real Baldwin County geographies, and mixed intent templates. No generic fallback content. No prohibited phrases.

### Decision

**CONDITIONAL GO → GO.** All 12 acceptance criteria passed. All five DP-001 query-context root causes (sessions 1–3) confirmed resolved in production.

### Next Phase

**Content Autopilot** — keyword and content-gap discovery, Baldwin County demand signals, competitor-topic intelligence, content planning / approval / publishing / performance feedback, tenant isolation, fail-closed.

Scheduling of AI Visibility scans may now be enabled when approved:
1. `PUT /api/ai-visibility/schedule/bed-bugs-and-beyond { "enabled": true, "frequency": "weekly" }`
2. Set `AI_VISIBILITY_SCHEDULER_ENABLED=true` in production secrets + restart API Server
3. Monitor `[ai-visibility-scheduler]` log lines
