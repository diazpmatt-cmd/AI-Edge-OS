# AI Edge Visibility — V1 Implementation Roadmap

**Current completion:** 91%
**Target:** V1 — canonical source composition producing real, tenant-safe visibility recommendations with AI query evidence
**Last updated:** 2026-07-19

---

## V1 Acceptance Criteria

V1 is complete when all of the following are true:

1. `GET /api/ai-visibility/read-model/:clientId` returns a live `AiVisibilityReadModel` computed from real canonical source data (not random-bump and not hardcoded demo). ✅
2. The response includes a `coverage[]` array that accurately reports `available`, `not_connected`, `not_implemented`, or `not_tenant_safe` for every source. ✅
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

## C9R-5: Scheduled Monitoring & Run History

**Objective:** Automate periodic AI visibility scans and provide historical trend data.

**Scope:**
- Scheduler integration: cron job calls `AiVisibilityExecutionService` (and internally `AiQueryScanService`) for each active client on a configurable schedule
- `GET /api/ai-visibility/read-model/:clientId/history` returns paginated run summaries with recommendation counts over time
- Frontend "History" tab: sparkline of `recommendation_count` and `available_source_count` over time
- Scheduler enabled/disabled via `AI_VISIBILITY_SCHEDULER_ENABLED` env var (default: `false`)

**Dependencies:** C9R-2 ✅, C9R-4 ✅

**Acceptance criteria:**
- When `AI_VISIBILITY_SCHEDULER_ENABLED=true`, scans run on schedule
- History endpoint returns ≥ 2 runs for a client with prior runs
- Frontend history chart renders correctly

**Estimated completion impact:** +6% (91% → 97%)

---

## C9R-6: Review Intelligence Tenant Safety (parallel with C9R-5)

**Objective:** Make review data tenant-safe and available to `adaptTenantSafeReviews`.

**Scope:**
- `tenant_safe_review_summaries` table: `(id, client_id, platform, review_count, average_rating, target_review_count, geography, observed_at)`
- Import job reading GBP review stats per client (bounded by connection)
- Wire table to `adaptTenantSafeReviews()` in execution service
- Remove `not_tenant_safe` coverage status for `reviews` source

**Dependencies:** C9R-2 ✅

**Acceptance criteria:**
- `reviews` coverage source reports `available` (not `not_tenant_safe`) when GBP is connected
- Review velocity gap generates a recommendation when `reviewCount < targetReviewCount`

**Estimated completion impact:** +3% (97% → 100%)

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
| C9R-5 (scheduling + history) | NEXT | 97% |
| C9R-6 (reviews, parallel) | PENDING | 100% |
