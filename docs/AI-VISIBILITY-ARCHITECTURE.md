# AI Edge Visibility — Architecture Reference

**Status:** C9R-5 complete — scheduled monitoring live, run history API + History tab shipped, 97% V1 complete
**Last updated:** 2026-07-20
**ADR:** [ADR-007](adr/ADR-007-c8r5-ai-visibility-read-model.md)

---

## Three Parallel Systems

The engine has three parallel layers operating concurrently:

### Layer 1 — Legacy Audit System (operational, demo-backed)

| Artifact | Purpose |
|---|---|
| `lib/db/src/schema/ai-visibility.ts` | `ai_visibility_audits` table — 7 integer scores + 3 JSON blob columns |
| `lib/db/src/schema/audit-exports.ts` | `audit_exports` table — PDF/email export log |
| `artifacts/api-server/src/routes/ai-visibility.ts` | CRUD + random-bump `generate-report` + PDF/email delivery |
| `artifacts/ai-edge-solutions/src/pages/AIVisibilityEnginePage.tsx` | Frontend; reads `GET /api/ai-visibility/:clientId`, falls back to hardcoded `DEMO` |

The legacy system is operational. Its `generate-report` produces random-bump scores — **not AI-generated, not sourced from canonical systems.** The demo fallback is indistinguishable from real data at the API level.

### Layer 2 — C8R-5 Read Model + C9R-2/C9R-3 Execution (operational, live)

| Artifact | Purpose |
|---|---|
| `lib/db/src/ai-visibility-read-model-types.ts` | TypeScript contracts — all interfaces and discriminated union types |
| `lib/db/src/ai-visibility-read-model.ts` | `composeAiVisibilityReadModel()` — pure, deterministic, tenant-safe composer |
| `lib/db/src/ai-visibility-read-model-adapters.ts` | 6 canonical source adapters (see below) |
| `lib/db/src/ai-visibility-prioritizer.ts` | Dual-axis scoring engine (potentialValue + attainability) |
| `lib/db/src/ai-visibility-fixtures.ts` | BBB golden-template fixtures for test coverage |
| `artifacts/api-server/src/lib/ai-visibility-execution-service.ts` | Collects all 7 adapter inputs, calls `composeAiVisibilityReadModel`, persists result |
| `GET /api/ai-visibility/read-model/:clientId` | Live read model endpoint — returns real tenant-safe recommendations |
| `AIVisibilityEnginePage.tsx` — "Opportunities" tab | Renders C9R-2 read model; "AI Query" tab renders C9R-4 evidence panel |

### Layer 3 — Competitor AI Visibility Provider (operational, P6.2)

| Artifact | Purpose |
|---|---|
| `artifacts/api-server/src/lib/competitor-ai-visibility-provider.ts` | `AiEdgeVisibilityProvider` — reads `ai_visibility_audits.competitors_json`, derives competitor AI scores |

Real provider (`isMock: false`). Wired into the competitor enrichment registry. Derives competitor scores from gap data, not direct AI query execution.

---

## C8R-5 + C9R-4 Source Adapters

| # | Adapter | Function | Input Type | Coverage Source |
|---|---|---|---|---|
| 1 | Local Presence | `adaptLocalPresenceSources()` | `LocalPresenceChannel[]` + `LocalPresenceProfile` | `local_presence` |
| 2 | Discovery | `adaptDiscoverySources()` | `DiscoveryOpportunityObservation[]` | `discovery` |
| 3 | Backlinks | `adaptBacklinkSources()` | `BacklinkOpportunityObservation[]` | `backlink` |
| 4 | Content | `adaptContentSources()` | `ContentPostObservation[]` | `content` |
| 5 | Reviews | `adaptTenantSafeReviews()` | `TenantSafeReviewSummary[] \| null` | `reviews` |
| 6 | Google Connected | `adaptConnectedGoogle()` | `ConnectedGoogleSummary` | `google_business`, `google_search_console`, `google_analytics` |
| 7 | AI Query | `adaptAiQuerySources()` | `AiQueryAdapterInput` (scan + results) | `ai_query` |

Passing `null` to `adaptTenantSafeReviews` explicitly reports `not_tenant_safe`. `searchConsole` and `analytics` report `not_implemented`. `adaptAiQuerySources` with `scan: null` reports `not_connected` for `ai_query`.

---

## C9R-5 Scheduled Monitoring System

### Architecture Overview

```
[scheduler.ts tick — AI_VISIBILITY_SCHEDULER_ENABLED=true]
         │
         └─ runAiVisibilitySchedulerMonitor()
               │
               ├─ SELECT from ai_visibility_schedule WHERE enabled=TRUE AND next_run_at <= NOW()
               │   LIMIT maxPerTick (env: AI_VISIBILITY_SCHEDULER_MAX_PER_TICK, default 5, clamped [1,20])
               │
               ├─ inFlightClients Set<string> — per-client dedup within a tick
               │
               └─ per eligible tenant:
                     POST /api/ai-visibility/ingest/scheduled
                       x-scheduler-secret: <SCHEDULER_SECRET>
                       x-scheduler-client-id: <clientId>
                           │
                           └─ AiQueryScanService.execute({ clientId, userId:"scheduler", triggerSource:"scheduled" })
```

### Authentication Model

Two separate auth paths prevent credential confusion:

| Path | Endpoint | Auth mechanism | Caller |
|---|---|---|---|
| User-facing | `POST /api/ai-visibility/query-scan/:clientId` | Clerk Bearer token | Frontend / manual API |
| Scheduler | `POST /api/ai-visibility/ingest/scheduled` | `x-scheduler-secret` header | Scheduler tick only |

The scheduler endpoint never accepts a Clerk token. The user-facing endpoint never accepts a scheduler secret.

### Scheduler Safety Properties

| Property | Mechanism |
|---|---|
| Disabled by default | `AI_VISIBILITY_SCHEDULER_ENABLED` guard; all schedule rows have `enabled=false` by default |
| Bounded batch size | `maxPerTick ∈ [1, 20]` from `AI_VISIBILITY_SCHEDULER_MAX_PER_TICK` |
| No overlapping cycles | `inFlightClients Set<string>` — per-client dedup within a single tick |
| Tenant failure isolation | Per-row `consecutive_failures`; exceptions caught per-client in try/finally |
| Auto-disable on repeated failure | `consecutive_failures >= max_retries` (default 3) → `enabled=false` |
| Exponential backoff | `AI_VISIBILITY_BACKOFF_MAX_MS = 15_360_000 ms` (2^8 × 60 s ≈ 256 min) |

### Run History

`AiQueryScanService.listHistory(clientId, { page, pageSize, status })`:
- `ORDER BY started_at DESC` — newest-first, stable pagination
- `LIMIT` / `OFFSET` with `hasMore` flag
- Optional `status` filter (`completed` / `failed` / `running`)
- `42P01` guard — table not yet migrated → returns empty page (never throws)

Trend normalization: `normalizeScanHistoryToTrendPoints()` groups completed scans by UTC calendar day and pools mentions/queries before computing a rate — prevents inflating or deflating rates when multiple scans run the same day.

---

## C9R-4 AI Query Provider System

### Architecture Overview

```
[AiQueryScanService.execute({ clientId })]
         │
         ├─ buildTenantContext()          ← queries local_presence_profiles + competitors table
         │   └─ AiQueryTenantContext
         │
         ├─ generateAiQueries(context)    ← deterministic, prohibited-phrase filtered, capped at 12
         │   └─ readonly string[]
         │
         ├─ OpenAiQueryProvider.execute() ← sequential (cost control), 15 s timeout per query
         │   └─ AiQueryResult             ← detectBusinessMention + detectCompetitorMentions + extractCitations
         │
         ├─ persistScan()                 ← ai_query_scans (header) + ai_query_results (per query)
         │
         └─ adaptAiQuerySources()         ← wired as 7th adapter in AiVisibilityExecutionService
             └─ { observations, coverage }
```

### Pure Functions (lib/db)

| Function | Location | Purpose |
|---|---|---|
| `generateAiQueries(ctx)` | `ai-query-generation.ts` | Deterministic, sorted, deduped query list — lexicographically ordered, limited to `AI_QUERY_GENERATION_LIMIT` (12) |
| `humanizeServiceId(id)` | `ai-query-generation.ts` | Converts `"bed-bug-treatment"` → `"bed bug treatment"` |
| `detectBusinessMention(text, ctx)` | `ai-query-detection.ts` | Checks exact name → normalized (&→and) → domain → phone; returns `{mentioned, mentionType, position}` |
| `detectCompetitorMentions(text, ctx)` | `ai-query-detection.ts` | Finds all competitor names and domains in response text |
| `extractCitations(text)` | `ai-query-detection.ts` | Extracts HTTPS URLs, strips `www.`, deduplicates |
| `adaptAiQuerySources(input)` | `ai-query-read-model-adapter.ts` | Maps scan + results to coverage diagnostics + observations |

### Detection Priority

`detectBusinessMention` evaluates signals in this priority order (highest wins):

1. **exact** — case-insensitive business name literal
2. **normalized** — name with `&` replaced by `and` (or vice versa)
3. **domain** — `businessDomain` substring match (after stripping `www.`)
4. **phone** — `businessPhone` digit normalization match

### Provider Configuration

See [AI-VISIBILITY-PROVIDER-CONFIGURATION.md](AI-VISIBILITY-PROVIDER-CONFIGURATION.md) for environment variables and enable/disable instructions.

---

## Execution Flow (C9R-2 + C9R-4)

```
GET /api/ai-visibility/read-model/:clientId
         │
         └─ AiVisibilityExecutionService.execute()
               │
               ├─ Parallel queries (7 adapters):
               │   ├─ adaptLocalPresenceSources()
               │   ├─ adaptDiscoverySources()
               │   ├─ adaptBacklinkSources()
               │   ├─ adaptContentSources()
               │   ├─ adaptTenantSafeReviews()
               │   ├─ adaptConnectedGoogle()
               │   └─ adaptAiQuerySources()   ← reads latest completed scan from DB
               │
               ├─ composeAiVisibilityReadModel()
               │
               ├─ Persist → ai_visibility_run_results
               │
               └─ Returns AiVisibilityReadModel
```

The `adaptAiQuerySources()` adapter in the execution service reads the **most recent completed scan** from `ai_query_scans`. It does NOT trigger a new scan on every read-model fetch. New scans are triggered explicitly via `POST /api/ai-visibility/query-scan/:clientId`.

---

## Scoring Model

### Potential Value Weights (sum to 1.0)
- Business impact: **30%**
- Evidence strength: **25%**
- Local impact: **20%**
- Service priority: **15%**
- Urgency: **10%**

### Attainability Weights (sum to 1.0)
- Relationship access: **25%**
- Workflow readiness: **20%**
- Effort ease: **20%**
- Freshness: **15%**
- Local relevance: **10%**
- Service relevance: **10%**

### Priority Thresholds
- Critical: ≥ 80
- High: ≥ 65
- Medium: ≥ 45
- Low: < 45

Canonical backlink scores pass through as-is without recomputation.

---

## Tenant Isolation (C8R-5)

Five pre-prioritization rejection rules enforced by `validateInput()`:

| Code | Condition |
|---|---|
| `tenant_mismatch` | Observation or canonical reference `clientId` ≠ trusted scope `clientId` |
| `invalid_input` | Missing required fields (title, dedupeKey, workflow, references) |
| `unsupported_service` | `serviceId` not in `scope.activeServiceIds` |
| `outside_authorized_geography` | Normalized geography not in `scope.authorizedGeographies` |
| `prohibited_positioning` | Evidence/title/description contains a `scope.prohibitedPhrases` term |

Rejected observations are returned in the model's `rejected[]` array with the rejection code and reason — never silently dropped.

The `AiQueryTenantContext.prohibitedPhrases` field is passed through to query generation — no query will contain a prohibited phrase. For BBB, `prohibitedPhrases: []` in V1 (the "termite" prohibition is a service-registry rule, not a query prohibition for the AI scan).

---

## Coverage Diagnostics

Each adapter emits a `AiVisibilityCoverageDiagnostic` per source:

| Status | Meaning |
|---|---|
| `available` | Source has canonical observations |
| `not_connected` | Source integration exists but is not connected |
| `not_implemented` | Source ingestion has not been built yet |
| `not_tenant_safe` | Source exists but cannot provide tenant-safe observations |
| `no_observation` | Source is connected but returned zero records |

Missing data is **never converted to a zero score**. Coverage affects the completeness summary only.

---

## Database Schema (production-bootstrapped via schema-migrate.ts)

```sql
-- Legacy audit
ai_visibility_audits (id, client_id, business_name, overall_score, search_score, maps_score,
  ai_search_score, authority_score, review_score, competitor_gap_score,
  channels_json, competitors_json, recommendations_json, created_at, updated_at)

audit_exports (id, client_id, export_type, recipient_email, created_at)

-- C9R-2 read model persistence
ai_visibility_run_results (id, client_id, generated_at, result_json,
  recommendation_count, rejected_count, available_source_count)

-- C9R-4 AI query persistence
ai_query_scans (id, client_id, status, provider, model, query_count, completed_count,
  mention_count, competitor_mention_count, citation_count, error,
  trigger_source DEFAULT 'manual', started_at, completed_at, created_at)

ai_query_results (id, scan_id, client_id, query, provider, model, response_text,
  latency_ms, generated_at, success, failure_reason, business_mentioned, mention_type,
  mention_position, competitor_mentions_json, citations_json, created_at)

-- C9R-5 scheduling
ai_visibility_schedule (id, client_id UNIQUE, enabled DEFAULT false,
  frequency DEFAULT 'weekly', next_run_at, last_run_at, last_success_at,
  consecutive_failures DEFAULT 0, max_retries DEFAULT 3, created_at, updated_at)
```

Indexes: `ai_query_scans(client_id, started_at DESC)`, `ai_query_results(scan_id)`, `ai_query_results(client_id, created_at DESC)`, `ai_visibility_schedule_due` partial index on `(enabled, next_run_at) WHERE enabled = TRUE`.
