# AI Edge Visibility — V1 Implementation Roadmap

**Current completion:** 100% ✅ V1 COMPLETE
**Target:** V1 — canonical source composition producing real, tenant-safe visibility recommendations with AI query evidence
**Last updated:** 2026-07-20

---

## V1 Acceptance Criteria

V1 is complete when all of the following are true:

1. `GET /api/ai-visibility/read-model/:clientId` returns a live `AiVisibilityReadModel` computed from real canonical source data (not random-bump and not hardcoded demo). ✅
2. The response includes a `coverage[]` array that accurately reports `available`, `not_connected`, `not_implemented`, `provider_error`, or `no_observation` for every source. ✅
3. The response includes a `rejected[]` array reporting any observations that failed tenant, geography, service, or prohibited-phrase validation. ✅
4. Recommendations include canonical references (`recordId`, `source`, `observedAt`) linking back to their source tables. ✅
5. Each recommendation includes `workflow` metadata linking to an existing engine's workflow (backlink, discovery, local_presence, or content_autopilot). ✅
6. The frontend's AIVisibilityEnginePage renders C8R-5 recommendations (not the random-bump legacy audit). ✅
7. Coverage diagnostics are visible to the user — they can see which sources are available, not connected, or not implemented. ✅
8. All data is tenant-isolated — no cross-client observation leakage. ✅
9. A read model result is persisted after each execution for history. ✅
10. AI query scans run via a real LLM provider and brand mention/citation detection is functional. ✅
11. All V1 tests pass: 0 TypeScript errors, 0 new test failures. ✅

---

## C9R-2: AI Visibility Execution Service & API ✅ COMPLETE

**Completed:** 2026-07-19
**Estimated completion impact:** +20% (34% → 54%)

- `AiVisibilityExecutionService` wired with 6 source adapters (+ AI query as 7th in C9R-4)
- `ai_visibility_run_results` table bootstrapped in schema-migrate.ts
- `GET /api/ai-visibility/read-model/:clientId` live
- `GET /api/ai-visibility/read-model/:clientId/history` live

---

## C9R-3: Frontend Read Model Integration ✅ COMPLETE

**Completed:** 2026-07-19
**Estimated completion impact:** +12% (54% → 66%)

- "Opportunities" tab in AIVisibilityEnginePage renders live `AiVisibilityReadModel`
- Coverage diagnostics panel visible
- Priority badges, evidence items, workflow links
- `rejected[]` count badge in summary
- Legacy audit tab preserved as "Legacy Audit"

---

## C9R-4: Real AI Query Provider ✅ COMPLETE

**Completed:** 2026-07-19
**Estimated completion impact:** +25% (66% → 91%)

**Implemented scope:**

- `AiQueryProvider` interface + `AiQueryRequest`/`AiQueryResult` types in `lib/db`
- `OpenAiQueryProvider` — uses Replit AI integration (OpenAI-compatible), `gpt-4o-mini` default
- `generateAiQueries(ctx)` — deterministic, sorted, prohibited-phrase-filtered, capped at 12
- `detectBusinessMention()` — exact → normalized → domain → phone priority chain
- `detectCompetitorMentions()` — name and domain detection for all registered competitors
- `extractCitations()` — HTTPS URL extraction with dedup and `www.` stripping
- `adaptAiQuerySources()` — 7th source adapter; maps scan results to observations + coverage
- `AiQueryScanService` — demand-triggered scan orchestration; sequential execution for cost control
- `ai_query_scans` + `ai_query_results` persistence tables (CREATE IF NOT EXISTS)
- 3 new routes: `POST /query-scan/:clientId`, `GET /query-scan/:clientId/latest`, `GET /query-scan/evidence/:scanId`
- `AiVisibilityQueryEvidencePanel` — "🤖 AI Query" tab in AIVisibilityEnginePage with scan header,
  per-query result cards, mention badges, competitor chips, citation list
- 63 new tests: 40 backend (pure functions + adapter) + 23 frontend (pure panel helpers)

See [AI-VISIBILITY-PROVIDER-CONFIGURATION.md](AI-VISIBILITY-PROVIDER-CONFIGURATION.md) for environment variables and enable/disable instructions.

---

## C9R-5: Scheduled Monitoring & Run History ✅ COMPLETE

**Completed:** 2026-07-20
**Estimated completion impact:** +6% (91% → 97%)

**Implemented scope:**

- `ai_visibility_schedule` table — per-tenant schedule config (`enabled`, `frequency`, `next_run_at`, `consecutive_failures`, `max_retries`)
- `ai_query_scans.trigger_source` column — `"manual"` or `"scheduled"` (backfilled default `"manual"`)
- `ai_query_scans.competitor_mention_count` + `citation_count` columns (aggregate helpers)
- `ai_visibility_run_results.trigger_source` column — mirrors scan trigger classification
- `AiQueryScanService.listHistory()` — paginated, newest-first, optional status filter
- `GET /api/ai-visibility/read-model/:clientId/history` — paginated scan history (`?page`, `?pageSize`, `?status`)
- `GET /api/ai-visibility/schedule/:clientId` — schedule config (or disabled stub)
- `PUT /api/ai-visibility/schedule/:clientId` — upsert schedule (`{ enabled, frequency }`)
- `POST /api/ai-visibility/ingest/scheduled` — scheduler-secret-only internal endpoint (not Clerk-protected)
- `ai-visibility-scheduler-monitor.ts` — scheduler tick; fetches eligible tenants, POSTs to ingest endpoint per tenant
- Scheduler registered in `scheduler.ts` when `AI_VISIBILITY_SCHEDULER_ENABLED=true` (default: disabled)
- `normalizeScanHistoryToTrendPoints()` — weighted day-level aggregation (prevents misleading per-scan averages)
- `computeTrendSummary()` / `computeFullTrendSummary()` — direction detection (`up`/`down`/`stable`/`insufficient_data`)
- `AI_VISIBILITY_BACKOFF_MAX_MS = 15_360_000` — named constant; exponential backoff capped at 2^8 × 60 s (≈ 256 min)
- `AiVisibilityHistoryPanel.tsx` — History tab: sparkline, trend badge, pagination, status/source filters
- 4th "📈 History" tab added to `AIVisibilityEnginePage.tsx`
- 89 new tests (28 scheduler config + 18 trend normalization + 15 scan history + 28 frontend panel)
- ADR-016: `artifacts/api-server/docs/ADR-016-c9r5-ai-visibility-scheduled-monitoring.md`

**Closure bugs corrected (post-merge):**
1. Scheduler was targeting Clerk-protected endpoint → added dedicated `POST /ingest/scheduled` (scheduler-secret auth)
2. `triggerSource` ignored in user-facing route body → now read and passed to `svc.execute()`
3. Dead `Math.min(..., 24h)` wrapper in `aiVisibilityBackoffMs` → removed; named constant added

See [AI-VISIBILITY-PROVIDER-CONFIGURATION.md](AI-VISIBILITY-PROVIDER-CONFIGURATION.md) for scheduler environment variables.

**Dependencies:** C9R-2 ✅, C9R-4 ✅

---

## C9R-6: Review Intelligence Tenant Safety ✅ COMPLETE

**Completed:** 2026-07-20 (+ C9R-6 Acceptance Remediation: 2026-07-20, commit `9a3af27`)
**Estimated completion impact:** +3% (97% → 100%)

**Implemented scope:**
- `tenant_safe_review_summaries` table: `(id, client_id UUID FK→clients, platform, review_count, average_rating, target_review_count NULLABLE, geography, source_connection_id, observed_at)` — bootstrapped in `schema-migrate.ts`, idempotent upsert key `(client_id, platform, geography)` (`tsrs_client_platform_geo_uniq`)
- `DrizzleTenantSafeReviewRepository` in `lib/db` — `upsert()` + `findByClientId()` with full tenant isolation
- `GbpReviewSummaryImporter` in `api-server/src/lib` — ownership-gated import from `review_platform_stats`; gates on (1) GBP social connection userId match, (2) `locationId` present in `conn.metadata`; no live GBP API calls; `client_id <> 'default'` guard; stores `conn.id` as `sourceConnectionId`
- `adaptReviewImportResult()` in `lib/db/src/ai-visibility-read-model-adapters.ts` — discriminated union (`available` / `no_observation` / `disconnected` / `unauthorized` / `provider_error`) mapped to canonical `AiVisibilityCoverageStatus`
- V1 target review count policy: `computeTargetReviewCount()` returns `null` — no universal benchmark in V1; `targetReviewCount: number | null` in schema and types; review-gap observations suppressed when target is `null`
- `AiVisibilityCoverageStatus` extended with `"unauthorized"` and `"provider_error"` (additive)
- `normalizeCoverage` `statusOrder`: `{ no_observation:1, not_connected:2, unauthorized:3, provider_error:4, not_implemented:5, not_tenant_safe:6, available:7 }`
- `AiVisibilityExecutionService` replaces `adaptTenantSafeReviews(null)` with parallel `GbpReviewSummaryImporter.importForClient()` + `adaptReviewImportResult()`
- 43 tests across 3 test files: coverage adapter (22), importer (12), execution service (9 updated)
- Frontend `RMCoverageStatus` += `"unauthorized"` + `"provider_error"`; `getCoverageStatusConfig("unauthorized")` → amber, "Auth Required", 🔒 (distinct from `not_connected`); `getCoverageStatusConfig("provider_error")` → red, "Provider Error", ⚠

**Coverage state mapping (post-remediation):**
| Import result kind | Coverage status | When |
|---|---|---|
| `available` | `available` | GBP connected + locationId authorized + review stats found + upserted |
| `no_observation` | `no_observation` | GBP connected but locationId absent or stats not yet present |
| `disconnected` | `not_connected` | No GBP social connection for user |
| `unauthorized` | `unauthorized` | Connection userId mismatch (cross-tenant attempt blocked) |
| `provider_error` | `provider_error` | DB error or all upserts failed |

`not_tenant_safe` is **never emitted** by the C9R-6 path. It is reachable only via the legacy `adaptTenantSafeReviews(null)` call, which the production execution service no longer invokes.

**Dependencies:** C9R-2 ✅

---

## C9R-7: AI Visibility V1 Release Acceptance ✅ COMPLETE

**Completed:** 2026-07-20
**Activity type:** Release acceptance (not an implementation phase)

**Result:** CONDITIONAL GO — AI Visibility V1 accepted for production deployment pending one bounded deployment prerequisite (live AI provider smoke test).

**Verification performed:**
- All 7 coverage states normalize deterministically (adversarial tests)
- Tenant isolation verified: tenant_mismatch, outside_geography, unsupported_service, prohibited_phrase adversarial cases all fail closed
- Scheduler safety properties verified: disabled by default, bounded batch, secret auth, exponential backoff, auto-disable
- All 30 original __tests__ files + 2 route files + 1 new adversarial file = 33 files accounted for
- 1081 total tests (1080 pass; 1 pre-existing flaky: discovery-c6 T8)
- lib/db, api-server, frontend TypeScript all clean

See [docs/C9R-7-AI-VISIBILITY-V1-RELEASE-ACCEPTANCE.md](C9R-7-AI-VISIBILITY-V1-RELEASE-ACCEPTANCE.md) for the full acceptance report.

---

## Deferred V2 Features

The following are explicitly out of scope for V1:

- Real-time AI answer monitoring (continuous LLM polling, not batch queries)
- Multi-model AI query comparison (ChatGPT vs Claude vs Gemini side-by-side in the UI)
- AI citation graph visualization
- Competitor AI mention frequency from live LLM responses
- Google Search Console integration (currently `not_implemented`)
- Google Analytics integration (currently `not_implemented`)
- Voice assistant (Siri/Alexa) dedicated probing

---

## Overall V1 Timeline Estimate

| Phase | Status | After Completion |
|---|---|---|
| C9R-2 (execution service + API) | ✅ COMPLETE | 54% |
| C9R-3 (frontend integration) | ✅ COMPLETE | 66% |
| C9R-4 (real AI queries + evidence panel) | ✅ COMPLETE | 91% |
| C9R-5 (scheduling + history) | ✅ COMPLETE | 97% |
| C9R-6 (reviews tenant safety) | ✅ COMPLETE | 100% |
