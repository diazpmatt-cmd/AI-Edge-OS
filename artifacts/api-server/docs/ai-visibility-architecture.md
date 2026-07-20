# AI Visibility Engine — Architecture Reference

**Component series:** C9R-1 through C9R-5  
**Last updated:** 2026-07-20

---

## Overview

The AI Visibility Engine measures how prominently a business is mentioned across major AI language models (ChatGPT, Gemini, Perplexity, etc.) when a user asks questions relevant to that business's services and geography.

It is a multi-layer system:

```
┌───────────────────────────────────────────────────────────────────────┐
│ Frontend — AIVisibilityEnginePage.tsx                                 │
│   Tabs: Overview | Audit | Competitors | 📈 History                   │
└────────────────────────────┬──────────────────────────────────────────┘
                             │ useApiFetch (Bearer token)
┌────────────────────────────▼──────────────────────────────────────────┐
│ API Routes (artifacts/api-server/src/routes/ai-visibility.ts)         │
│                                                                       │
│  GET  /read-model/:clientId             → AiVisibilityReadModel       │
│  GET  /read-model/:clientId/history     → AiScanHistoryPage           │
│  GET  /schedule/:clientId               → AiVisibilityScheduleRow     │
│  PUT  /schedule/:clientId               → enable/configure schedule   │
│  POST /query-scan/:clientId             → manual scan (Clerk auth)    │
│  POST /ingest/scheduled                 → scheduler scan (secret auth)│
│  GET  /query-scan/:clientId/latest      → latest completed scan       │
│  GET  /query-scan/evidence/:scanId      → per-scan evidence detail    │
└─────────┬─────────────┬─────────────────┬─────────────────────────────┘
          │             │                 │
          ▼             ▼                 ▼
  AiVisibility   AiQueryScan       AiVisibilityScheduler
  ExecutionSvc   Service           Monitor (scheduler.ts tick)
  (audit engine) (scan orchestr.)  (ai-visibility-scheduler-monitor.ts)
          │             │
          ▼             ▼
  ┌───────────────────────────────────────┐
  │  PostgreSQL tables                    │
  │  ai_visibility_audits                 │
  │  ai_query_scans         (history)     │
  │  ai_query_results       (evidence)    │
  │  ai_visibility_schedule (scheduler)   │
  │  ai_visibility_run_results            │
  └───────────────────────────────────────┘
          │
          ▼
  AiQueryProvider (interface)
  └── OpenAiQueryProvider  ← only live provider in v1
      (OpenAI GPT-4o-mini)
```

---

## Layers

### 1. Audit Engine (`AiVisibilityExecutionService`)
Runs a comprehensive channel audit — not a live LLM query, but a static analysis of connected channels, GBP health, citation authority, and known AI search signals. Returns an `AiVisibilityReadModel` scored 0–100 across: Search, Maps, AI Search, Authority, Reviews, Competitor Gap.

### 2. Query Scan Service (`AiQueryScanService`)
Executes live LLM queries against an injected `AiQueryProvider`. Workflow:
1. Build `AiQueryTenantContext` from the DB (business name, geography, services, competitors)
2. Generate deterministic query list via `generateAiQueries(context)` (pure, no I/O)
3. Execute each query sequentially (avoids parallel API costs)
4. Persist scan record (`ai_query_scans`) + per-result records (`ai_query_results`)
5. Return `AiQueryScanSummary`

Queries are sequential by design — parallel LLM calls would multiply provider costs.

### 3. Scheduler Monitor (`runAiVisibilitySchedulerMonitor`)
A tick function registered in `scheduler.ts`. Runs only when `AI_VISIBILITY_SCHEDULER_ENABLED=true`.

Each tick:
1. Queries `ai_visibility_schedule` for eligible rows (`enabled=true`, `next_run_at <= NOW()`, capped at `maxPerTick`)
2. Skips any client already in-flight (`inFlightClients` Set)
3. POSTs to `POST /api/ai-visibility/ingest/scheduled` (internal, scheduler-secret auth)
4. On HTTP 2xx: resets failures, advances `next_run_at`
5. On non-2xx or exception: increments `consecutive_failures`, applies exponential backoff
6. On threshold exceeded: auto-disables the schedule row

### 4. Trend Normalization (pure functions)
`lib/db/src/ai-visibility-trend-normalization.ts` — shared between the server-side history endpoint and the frontend History panel.

- `normalizeScanHistoryToTrendPoints(scans)` — groups completed scans by UTC calendar date, computes weighted mention rate (total mentions ÷ total completed queries per day). Avoids misleading per-scan averages by aggregating across all scans in the same day.
- `computeTrendSummary(points)` — requires ≥2 data points; classifies >5% change as `up`/`down`, ≤5% as `stable`, <2 points as `insufficient_data`.

---

## Authentication Model

| Caller           | Auth mechanism                     | Route                               |
|------------------|------------------------------------|-------------------------------------|
| Frontend user    | Clerk JWT (Bearer)                 | All read-model + schedule + scan    |
| Scheduler daemon | `x-scheduler-secret` header        | `POST /ingest/scheduled`            |
| No auth          | 401 Unauthorized                   | All routes                          |

**Tenant IDOR guard:** every Clerk-authenticated route calls `resolveClientActiveCheck(userId)`, resolves the user's owning client, then compares the result slug against the URL `:clientId` param. A mismatch returns 403.

---

## Provider Contract

```typescript
interface AiQueryProvider {
  readonly name:  string;
  readonly model: string;
  execute(input: AiQueryProviderInput): Promise<AiQueryResult>;
}
```

Tests inject mock providers via the `AiQueryScanService(pool, db, provider?)` constructor. No test ever reaches a paid provider.

---

## Scheduler Safety Properties

| Property                       | Mechanism                                                  |
|-------------------------------|------------------------------------------------------------|
| Disabled by default           | `enabled=false` on schedule rows; global env guard         |
| Bounded batch per tick        | `maxPerTick` ≤ 20 (env `AI_VISIBILITY_SCHEDULER_MAX_PER_TICK`) |
| No overlapping cycles         | In-flight `Set<string>` per-client dedup within a tick     |
| Tenant failure isolation      | Per-row failure counter; other rows unaffected             |
| Auto-disable on repeat fail   | `consecutive_failures >= max_retries` → `enabled=false`    |
| Exponential backoff           | `aiVisibilityBackoffMs(n)`: 2ⁿ × 60 s, capped at 2⁸=256 min |
| Scheduler→route trust         | `SCHEDULER_SECRET` env var; separate endpoint from user-facing route |

---

## Data Flow: Manual Scan

```
User clicks "Run Scan"
  → POST /api/ai-visibility/query-scan/:slug  (Clerk Bearer token)
  → Route: verify userId, resolve clientId, read triggerSource from body (default: "manual")
  → AiQueryScanService.execute({ clientId, userId, triggerSource: "manual" })
  → INSERT ai_query_scans (status=running, trigger_source=manual)
  → for each query: OpenAiQueryProvider.execute() → INSERT ai_query_results
  → UPDATE ai_query_scans (status=completed, mention_count, competitor_mention_count, citation_count)
  → Return AiQueryScanSummary (201)
```

## Data Flow: Scheduled Scan

```
scheduler.ts tick (every 60 min)
  → runAiVisibilitySchedulerMonitor()
  → SELECT ai_visibility_schedule WHERE enabled=true AND next_run_at <= NOW() LIMIT maxPerTick
  → for each row not in-flight:
      POST /api/ai-visibility/ingest/scheduled
        x-scheduler-secret: <SCHEDULER_SECRET>
        x-scheduler-client-id: <clientId UUID>
    → Route: verify secret, extract trustedClientId from header
    → AiQueryScanService.execute({ clientId, userId: "scheduler", triggerSource: "scheduled" })
    → (same scan flow as manual)
  → UPDATE ai_visibility_schedule: advance next_run_at OR apply backoff
```
