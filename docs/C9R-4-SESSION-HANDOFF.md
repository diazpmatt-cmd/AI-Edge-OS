# C9R-4 Session Handoff — Real AI Query Provider and Visibility Detection

**Date:** 2026-07-19
**Phase completed:** C9R-4 (Real AI Query Provider)
**V1 completion before:** 66%
**V1 completion after:** 91%
**Next phase:** C9R-5 (Scheduled Monitoring & Run History)

---

## What Was Done in C9R-4

### 1. Pure lib/db Layer (4 new files)

**`lib/db/src/ai-query-provider-types.ts`**
- `AiQueryProvider` interface (`name`, `model`, `isConfigured`, `execute()`)
- `AiQueryTenantContext` — business name, domain, phone, services, geographies, competitors, prohibited phrases
- `AiQueryRequest` / `AiQueryResult` — per-query input/output contracts
- `AiQueryScanSummary` / `PersistedAiQueryScan` / `PersistedAiQueryResult` — persistence types
- `AiQueryAdapterInput` — input contract for the 7th read-model adapter
- `AiVisibilitySource` union extended with `"ai_query"`

**`lib/db/src/ai-query-generation.ts`**
- `generateAiQueries(ctx): readonly string[]` — deterministic, sorted, deduplicated, prohibited-phrase-filtered
- `AI_QUERY_GENERATION_LIMIT = 12` exported constant
- `humanizeServiceId(id)` — converts `"bed-bug-treatment"` to `"bed bug treatment"`
- Combines service × geography templates + local-services fallback + area fallback
- Output is always `Object.freeze()`'d and lexicographically sorted for reproducibility

**`lib/db/src/ai-query-detection.ts`**
- `detectBusinessMention(text, ctx)` — priority chain: exact → normalized → domain → phone
- `detectCompetitorMentions(text, ctx)` — name + domain detection for all competitors
- `extractCitations(text)` — HTTPS URL extraction, `www.` stripping, dedup, position tracking
- All functions return `Object.freeze()`'d results

**`lib/db/src/ai-query-read-model-adapter.ts`**
- `adaptAiQuerySources(input)` — 7th read-model adapter
- `scan: null` → `not_connected` coverage (no scan ever run)
- Zero mentions → `no_observation` coverage + one observation per successful unmentioned result
- Any mention → `available` coverage; no observations generated (positive signal)
- Observations use `category: "measurement"`, `source: "ai_query"`, deterministic `dedupeKey`

**`lib/db/src/index.ts`** — all 4 new files re-exported at lines 453–456.

After adding these exports, `pnpm --filter @workspace/db exec tsc --build` was run to regenerate declarations before api-server could see the new types.

### 2. API Server Implementation (2 new service files)

**`artifacts/api-server/src/lib/openai-ai-query-provider.ts`**
- `OpenAiQueryProvider implements AiQueryProvider`
- Uses `AI_INTEGRATIONS_OPENAI_API_KEY` (or `OPENAI_API_KEY` fallback)
- Model from `OPENAI_MODEL` env var (default: `gpt-4o-mini`)
- Per-query 15-second `AbortController` timeout
- Maps HTTP errors → structured `failureReason`: `not_configured | timeout | auth_failure | rate_limit | provider_error`
- `isConfigured` property — returns safe `not_configured` result when no key present (no throw)

**`artifacts/api-server/src/lib/ai-query-scan-service.ts`**
- `AiQueryScanService.execute({ clientId, userId })` — full scan orchestration
- `buildTenantContext()` — resolves from `local_presence_profiles` + `competitors` table
- `website` field (not `websiteUrl`) used for `businessDomain` — matches actual schema column
- Sequential query execution (intentional — prevents OpenAI rate limits; controls costs)
- `createScanRecord()` → `status: "running"` → persist each result → `status: "completed"`
- `getLatestScan({ clientId })` — reads most recent completed scan + all results
- `AiQueryScanService` is injectable — accepts `provider?: AiQueryProvider` for tests

### 3. Schema Migration

`artifacts/api-server/src/lib/schema-migrate.ts` — idempotent additions:

```sql
CREATE TABLE IF NOT EXISTS ai_query_scans (
  id, client_id, status, provider, model, query_count, completed_count,
  mention_count, error, started_at, completed_at, created_at
)

CREATE INDEX IF NOT EXISTS ai_query_scans_client ON ai_query_scans(client_id, started_at DESC)

CREATE TABLE IF NOT EXISTS ai_query_results (
  id, scan_id, client_id, query, provider, model, response_text, latency_ms,
  generated_at, success, failure_reason, business_mentioned, mention_type,
  mention_position, competitor_mentions_json, citations_json, created_at
)

CREATE INDEX IF NOT EXISTS ai_query_results_scan ON ai_query_results(scan_id)
CREATE INDEX IF NOT EXISTS ai_query_results_client ON ai_query_results(client_id, created_at DESC)
```

### 4. Execution Service Integration

`artifacts/api-server/src/lib/ai-visibility-execution-service.ts` — 7th adapter wired:
- `AiQueryScanService` instantiated inside `execute()`
- Reads latest scan via `aiQuerySvc.getLatestScan({ clientId })`
- Calls `adaptAiQuerySources({ scan, results, geography, clientId, observedAt })`
- Result merged into `composeAiVisibilityReadModel()` inputs alongside the other 6 adapters

### 5. Routes (3 new endpoints)

In `artifacts/api-server/src/routes/ai-visibility.ts`:

| Route | Purpose |
|---|---|
| `POST /api/ai-visibility/query-scan/:clientId` | Triggers a new scan; returns `AiQueryScanSummary & { results: AiQueryResult[] }` |
| `GET /api/ai-visibility/query-scan/:clientId/latest` | Returns most recent completed scan + results (404 if none) |
| `GET /api/ai-visibility/query-scan/evidence/:scanId` | Returns all results for a specific scan ID |

### 6. Frontend

**`artifacts/ai-edge-solutions/src/components/AiVisibilityQueryEvidencePanel.tsx`**
- Scan summary header: status badge, mention rate, model, query count, timestamp
- Per-query result cards: mention badge (`exact`/`normalized`/`domain`/`phone`/not-mentioned), competitor chips, citation list, failure label
- Loading skeleton, empty state ("No scan yet — run your first scan"), error state
- Exported pure helpers: `getMentionBadgeConfig`, `getFailureLabel`, `formatScanTimestamp`, `getScanStatusConfig`, `computeScanMentionRate`

**`artifacts/ai-edge-solutions/src/components/AiVisibilityReadModelView.tsx`**
- `RMSource` union extended with `"ai_query"`
- `getSourceLabel` map: `ai_query` → `"AI Query Visibility"`

**`artifacts/ai-edge-solutions/src/pages/AIVisibilityEnginePage.tsx`**
- `activeTab` type: `"opportunities" | "ai_query" | "legacy"`
- `AiVisibilityQueryEvidencePanel` imported
- "🤖 AI Query" tab (purple `#A78BFA`) added between Opportunities and Legacy Audit
- `qeScan` / `qeResults` / `qeLoading` / `qeError` state
- `qeLoadedRef` prevents double-fetch on first mount
- `handleRunScan()` — `POST` scan, updates state, triggers read-model refresh

### 7. Tests (63 new tests)

**Backend — `artifacts/api-server/src/__tests__/ai-visibility-query-provider.test.ts`** (40 tests):
- `generateAiQueries`: 8 tests (cap, prohibition, dedup, determinism, sort, fallbacks)
- `humanizeServiceId`: 3 tests
- `detectBusinessMention`: 9 tests (exact, case, normalized, domain, phone, empty, priority, null domain)
- `detectCompetitorMentions`: 5 tests (name, domain, multiple, none, frozen)
- `extractCitations`: 7 tests (single, multiple, www strip, dedup, position, none, frozen)
- `adaptAiQuerySources`: 8 tests (null scan, available, no_observation, per-result obs, failed, source, category, dedupeKey)

**Frontend — `artifacts/ai-edge-solutions/src/__tests__/AiVisibilityQueryEvidencePanel.test.tsx`** (23 tests):
- `getMentionBadgeConfig`: 6 tests
- `getFailureLabel`: 6 tests
- `formatScanTimestamp`: 2 tests
- `getScanStatusConfig`: 4 tests
- `computeScanMentionRate`: 4 tests (25%, 0%, 100%, divide-by-zero guard)

---

## Verification Results

### TypeScript

| Package | Errors |
|---|---|
| `artifacts/api-server` | **0** |
| `artifacts/ai-edge-solutions` | **1 pre-existing** (`ReferralProgramPage.tsx:162` — pre-dates C9R-4, do not fix) |

### Test Results

| Suite | Passed | Failed | Notes |
|---|---|---|---|
| AI query provider (backend) | 40 | 0 | New in C9R-4 |
| AI visibility frontend panel | 23 | 0 | New in C9R-4 |
| AI visibility execution (prior) | 14 | 0 | C9R-2 tests, confirmed no regression |
| Full API suite | 780 | 2 | Both failures = `discovery-c6.test.ts > T8` (pre-existing flaky, pre-dates C9R-1) |
| Full frontend suite | 23 | 0 | C9R-4 panel tests |

**Pre-existing failures (do not fix in C9R-5):**
1. `discovery-c6.test.ts > T8` — flaky cancellation timing test. 2 sub-tests fail intermittently depending on scheduler timing. First noted in C8R-8. Not related to AI Visibility.

### Schema Migration Reproducibility

The two new tables are added via `CREATE TABLE IF NOT EXISTS` in `artifacts/api-server/src/lib/schema-migrate.ts`. They will be created on first startup from a clean checkout with no manual SQL required. Indexes are also idempotent (`CREATE INDEX IF NOT EXISTS`).

---

## C9R-5 Starting Point

**Objective:** Scheduled AI visibility scans + historical run data.

**Files to create:**
- `artifacts/api-server/src/lib/ai-visibility-scheduler.ts` — cron wrapper around `AiVisibilityExecutionService`
- Add `AI_VISIBILITY_SCHEDULER_ENABLED` env var guard (default: `false`)
- Implement `GET /api/ai-visibility/read-model/:clientId/history` (already in C9R-2 route file as stub)

**Frontend additions:**
- "History" tab in AIVisibilityEnginePage
- Sparkline of `recommendation_count` and `available_source_count` over time

**Dependencies:** C9R-2 ✅, C9R-4 ✅ (meaningful data to schedule)

**Pattern to follow:** Backlink scheduler in `artifacts/api-server/src/lib/backlink-scheduler.ts` — same `BACKLINK_SCHEDULER_ENABLED` guard pattern, same cron timing approach.

**Estimated completion impact:** +6% (91% → 97%)

---

## Known Non-Issues (Do Not Fix in C9R-5)

1. `discovery-c6.test.ts > T8` — pre-existing flaky test, not AI Visibility.
2. `ReferralProgramPage.tsx:162` TS error — pre-existing, not AI Visibility.
3. YouTube `invalid_grant` in production — pre-existing, requires manual re-auth.
4. GBP Phase 2 pilot — blocked by GCP quota = 0 (separate workstream).
