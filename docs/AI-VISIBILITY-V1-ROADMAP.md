# AI Edge Visibility — V1 Implementation Roadmap

**Current completion:** 34%
**Target:** V1 — canonical source composition producing real, tenant-safe visibility recommendations
**External AI query execution (real LLM probes) is V2.**

---

## V1 Acceptance Criteria

V1 is complete when all of the following are true:

1. `GET /api/ai-visibility/read-model/:clientId` returns a live `AiVisibilityReadModel` computed from real canonical source data (not random-bump and not hardcoded demo).
2. The response includes a `coverage[]` array that accurately reports `available`, `not_connected`, `not_implemented`, or `not_tenant_safe` for every source.
3. The response includes a `rejected[]` array reporting any observations that failed tenant, geography, service, or prohibited-phrase validation.
4. Recommendations include canonical references (`recordId`, `source`, `observedAt`) linking back to their source tables.
5. Each recommendation includes `workflow` metadata linking to an existing engine's workflow (backlink, discovery, local_presence, or content_autopilot).
6. The frontend's AIVisibilityEnginePage renders C8R-5 recommendations (not the random-bump legacy audit).
7. Coverage diagnostics are visible to the user — they can see which sources are available, not connected, or not implemented.
8. All data is tenant-isolated — no cross-client observation leakage.
9. A read model result is persisted after each execution for history.
10. All V1 tests pass: 0 TypeScript errors, 0 new test failures.

**Not required for V1:** Real AI query execution (ChatGPT/Claude/Perplexity probes), brand mention frequency from LLM responses, citation scraping from live AI answers. These are V2.

---

## C9R-2: AI Visibility Execution Service & API

**Objective:** Wire `composeAiVisibilityReadModel` to a real endpoint by building the execution service that collects all canonical inputs.

**Scope:**
- `AiVisibilityExecutionService` in `artifacts/api-server/src/lib/ai-visibility-execution-service.ts`
  - Accepts `{ clientId, geography, pool }` + an authorized scope resolved from the service registry
  - Queries Local Presence channels + profile for the client
  - Queries Discovery opportunities for the client
  - Queries Backlink opportunities + workflows + evidence for the client
  - Queries Content/SocialPosts + PlatformDeliveries for the client
  - Passes `null` to `adaptTenantSafeReviews` (reviews remain `not_tenant_safe` until C9R-6)
  - Constructs `ConnectedGoogleSummary` from the social connections table
  - Calls all 6 adapters to produce `observations[]` and `coverage[]`
  - Calls `composeAiVisibilityReadModel()` with the collected inputs
  - Persists result to `ai_visibility_run_results`
  - Returns `AiVisibilityReadModel`
- `ai_visibility_run_results` table in `schema-migrate.ts`:
  - `id`, `client_id`, `generated_at`, `result_json` (full serialized AiVisibilityReadModel), `recommendation_count`, `rejected_count`, `available_source_count`
- New route `GET /api/ai-visibility/read-model/:clientId` — requires auth, resolves client, calls execution service
- New route `GET /api/ai-visibility/read-model/:clientId/history` — returns prior run summaries (no result_json for pagination)

**Dependencies:** C8R-5 complete (✓), Local Presence tables (✓), Discovery tables (✓), Backlink tables (✓), Social Posts + Platform Deliveries tables (✓), Social Connections table (✓)

**Acceptance criteria:**
- Authenticated `GET /api/ai-visibility/read-model/bbb` returns a valid `AiVisibilityReadModel` with real BBB data
- `coverage[]` includes an entry for each of the 8 sources
- `recommendations[]` includes canonical `references[]` with real record IDs
- Result is persisted to `ai_visibility_run_results`
- 0 new TypeScript errors

**Estimated completion impact:** +20% (34% → 54%)

---

## C9R-3: Frontend Read Model Integration

**Objective:** Replace the legacy random-bump audit display with C8R-5 read model data in the AIVisibilityEnginePage.

**Scope:**
- Add a second data fetch from `GET /api/ai-visibility/read-model/:clientId` alongside the legacy audit fetch
- New "Opportunities" tab (or replace existing Recommendations section) rendering `AiVisibilityReadModel.recommendations[]`
  - Priority badge (critical/high/medium/low) with potentialValue + attainability scores
  - whatWasObserved + whyItMatters + evidence items
  - Workflow action link (`workflow.kind` → existing engine deeplink)
  - `humanApprovalRequired` indicator
- New "Coverage" panel rendering `AiVisibilityReadModel.coverage[]`
  - Source name, status badge, observedAt timestamp, detail text
- Loading, empty, and error states for both tabs
- `rejected[]` count visible in a summary badge (not expanded by default)
- Legacy audit tab remains as "Legacy Audit" for backward compatibility until deprecated

**Dependencies:** C9R-2

**Acceptance criteria:**
- Page renders C8R-5 recommendations with real data (not demo)
- Coverage diagnostics visible
- Empty state displayed when `recommendations[]` is empty
- All existing UI tests pass

**Estimated completion impact:** +12% (54% → 66%)

---

## C9R-4: Real AI Query Provider

**Objective:** Execute actual LLM queries to detect whether the business appears in AI-generated answers.

**Scope:**
- `AiQueryProvider` adapter interface in `lib/db/src/`
  - `query(prompt: string, clientId: string): Promise<AiQueryResult>`
  - `AiQueryResult`: `{ answer: string; citations: string[]; businessMentioned: boolean; mentionContext: string | null }`
- `OpenAiQueryAdapter` implementing `AiQueryProvider` using the OpenAI integration
- Query set: configurable per-client list of target queries (e.g. "best bed bug exterminator in Baldwin County AL")
- Brand mention detection: case-insensitive business name + phone + URL matching in the answer text
- Citation detection: extract URLs from answer + citations array
- New source adapter `adaptAiQueryResults()` in `ai-visibility-read-model-adapters.ts`
  - Each missing mention → one `AiVisibilityNormalizedInput` (category: `local_presence`, workflow: `local_presence`)
  - Each detected citation gap → one normalized input
- Integration into `AiVisibilityExecutionService` (C9R-2)

**Dependencies:** C9R-2, OpenAI integration

**Acceptance criteria:**
- Real AI queries execute and brand mention is detected/not-detected
- Query results contribute to `composeAiVisibilityReadModel()` inputs
- `coverage[]` includes `ai_query` source as `available` when queries run
- All provider output is `isMock: false`

**Estimated completion impact:** +25% (66% → 91%)

---

## C9R-5: Scheduled Monitoring & Run History

**Objective:** Automate periodic AI visibility scans and provide historical trend data.

**Scope:**
- Scheduler integration: weekly cron job calls `AiVisibilityExecutionService` for each active client
- `GET /api/ai-visibility/read-model/:clientId/history` returns paginated run summaries with recommendation counts over time
- Frontend "History" tab: sparkline of `recommendation_count` and `available_source_count` over time
- Scheduler enabled/disabled via `AI_VISIBILITY_SCHEDULER_ENABLED` env var (default: `false`)

**Dependencies:** C9R-2, C9R-4 (meaningful data to schedule)

**Acceptance criteria:**
- When `AI_VISIBILITY_SCHEDULER_ENABLED=true`, scans run on schedule
- History endpoint returns ≥ 2 runs for a client with prior runs
- Frontend history chart renders correctly

**Estimated completion impact:** +6% (91% → 97%)

---

## C9R-6: Review Intelligence Tenant Safety (parallel with C9R-3+)

**Objective:** Make review data tenant-safe and available to `adaptTenantSafeReviews`.

**Scope:**
- `tenant_safe_review_summaries` table: `(id, client_id, platform, review_count, average_rating, target_review_count, geography, observed_at)`
- Import job reading GBP review stats per client (bounded by connection)
- Wire table to `adaptTenantSafeReviews()` in execution service
- Remove `not_tenant_safe` coverage status for `reviews` source

**Dependencies:** C9R-2

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

| Phase | Estimated Sessions | After Completion |
|---|---|---|
| C9R-2 (execution service + API) | 1 | 54% |
| C9R-3 (frontend integration) | 1 | 66% |
| C9R-4 (real AI queries) | 1–2 | 91% |
| C9R-5 (scheduling + history) | 1 | 97% |
| C9R-6 (reviews, parallel) | 0.5 | 100% |
