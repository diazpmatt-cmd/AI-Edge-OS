# ADR-016: AI Visibility Scheduled Monitoring & Run History (C9R-5)

**Status:** Accepted
**Date:** 2026-07-20
**Builds on:** C9R-2 (AI Query Scan Service), C9R-3 (Execution Engine), C9R-4 (Audit Engine)

---

## Context

The AI Visibility Engine (C9R series) can run on-demand scans but had no mechanism to:
- Track historical scan outcomes with rich metadata (competitor mentions, citation counts, trigger source)
- Automatically schedule periodic scans per tenant
- Expose paginated, filterable scan history to the frontend
- Show trend direction over time

---

## Decision

### 1. Schema additions (idempotent in `schema-migrate.ts`)

**`ai_query_scans` table — 3 new columns:**
- `trigger_source` TEXT — `"manual"` | `"scheduled"` (default `"manual"`)
- `competitor_mention_count` INTEGER — aggregate cross-query competitor reference count
- `citation_count` INTEGER — aggregate citation signals from scan results

**`ai_visibility_run_results` table — 1 new column:**
- `trigger_source` TEXT — mirrors the scan-level field for query-level join convenience

**`ai_visibility_schedule` table (new):**
```sql
CREATE TABLE IF NOT EXISTS ai_visibility_schedule (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  enabled               BOOLEAN NOT NULL DEFAULT false,
  frequency             TEXT NOT NULL DEFAULT 'weekly',
  next_run_at           TIMESTAMPTZ,
  last_run_at           TIMESTAMPTZ,
  last_success_at       TIMESTAMPTZ,
  consecutive_failures  INTEGER NOT NULL DEFAULT 0,
  max_retries           INTEGER NOT NULL DEFAULT 3,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_schedule_enabled_next
  ON ai_visibility_schedule(enabled, next_run_at)
  WHERE enabled = true;
```

### 2. Pure lib/db helper exports (new files)

**`lib/db/src/ai-visibility-scan-history-types.ts`** — schedule config pure functions:
- `parseAiScheduleFrequency(v)` — safe parse with fallback to `"weekly"`
- `calcAiVisibilityNextRunAt(freq, from)` — adds 1/7/14/30 days per frequency
- `aiVisibilityBackoffMs(failures)` — exponential backoff `2^min(n,8) × 60s`; effective max = `AI_VISIBILITY_BACKOFF_MAX_MS` = 15 360 000 ms (≈ 256 min)
- `AI_VISIBILITY_BACKOFF_MAX_MS` — named constant (`2^8 × 60s = 15_360_000 ms`) documenting the actual cap
- `aiVisibilityShouldAutoDisable(failures, maxRetries)` — threshold guard
- `parseAiVisibilitySchedulerEnvConfig()` — reads `AI_VISIBILITY_SCHEDULER_ENABLED` / `AI_VISIBILITY_SCHEDULER_MAX_PER_TICK`

**`lib/db/src/ai-visibility-trend-normalization.ts`** — pure trend computation:
- `normalizeScanHistoryToTrendPoints(scans)` — groups completed scans by date, computes weighted mention rates
- `computeTrendSummary(points)` — derives `up`/`down`/`stable`/`insufficient_data` from ≥2 data points
- `computeFullTrendSummary(scans)` — convenience compose

### 3. `AiQueryScanService` changes

- `execute()` now accepts `triggerSource` in input and persists it + `competitorMentionCount` / `citationCount` at completion
- New `listHistory(clientId, opts?)` method returns `AiScanHistoryPage` with:
  - Paginated `AiScanHistorySummary[]` (page / pageSize / total / hasMore)
  - Optional `status` filter (completed / failed / running)
  - Graceful `42P01` guard (table not yet migrated → empty page)
  - `durationMs` computed server-side from `started_at` / `completed_at`
  - `evidenceHref` canonical URL per scan

### 4. Scheduler monitor (`ai-visibility-scheduler-monitor.ts`)

Follows the backlink scheduler monitor pattern exactly:
- Queries `ai_visibility_schedule WHERE enabled = true AND next_run_at <= NOW()`
- POSTs to `/api/ai-visibility/ingest/scheduled` with `SCHEDULER_SECRET` + `x-scheduler-client-id` headers
- On success: resets `consecutive_failures`, advances `next_run_at` via `calcAiVisibilityNextRunAt`
- On failure: increments `consecutive_failures`, sets `next_run_at = NOW() + aiVisibilityBackoffMs(n)`
- On auto-disable threshold: sets `enabled = false` (tenant must re-enable via PUT)
- In-flight dedup: `Set<string>` guard prevents same client running twice in one tick
- Registered in `scheduler.ts` guarded by `AI_VISIBILITY_SCHEDULER_ENABLED=true` (default **disabled**)

### 5. Dedicated scheduler-auth endpoint

`POST /api/ai-visibility/ingest/scheduled` — scheduler-secret only, never Clerk auth.
Client identity comes from the `x-scheduler-client-id` header (UUID from `ai_visibility_schedule`).
This mirrors `POST /api/backlinks/ingest/scheduled` exactly and keeps the scheduler's internal trust
boundary separate from the user-facing `POST /api/ai-visibility/query-scan/:clientId` route.

### 5. API routes

**History endpoint (enhanced):**
```
GET /api/ai-visibility/read-model/:clientId/history
  ?page=1 &pageSize=20 &status=completed|failed|running
```

**Schedule endpoints (new):**
```
GET /api/ai-visibility/schedule/:clientId
PUT /api/ai-visibility/schedule/:clientId
  Body: { enabled: boolean, frequency?: "daily"|"weekly"|"biweekly"|"monthly" }
```

All routes have tenant IDOR guard (`resolveClientActiveCheck` + slug match).

### 6. Frontend History tab

- New `AiVisibilityHistoryPanel` component (default export + named helper exports)
- Added as 4th tab "📈 History" (green `#22C55E`) in `AIVisibilityEnginePage`
- Features: SVG sparkline (area fill + polyline + last-point dot), trend badge, status/source pills, pagination, status filter, accessible `aria-live` summary

---

## Consequences

### Good
- Tenants can now see their full scan history with trend direction at a glance
- Scheduled scans are disabled by default — no unexpected API costs for any tenant
- All pure functions are covered by unit tests (60 api-server + 28 frontend)
- Trend normalization is pure and shared between frontend derivation and server-side summary

### Tradeoffs
- `ai_visibility_schedule` uses a `UNIQUE (client_id)` constraint so only one schedule row per tenant — acceptable for v1
- The scheduler fires every 60 min (matches scan duration expectations); high-frequency scans not supported in v1
- `AI_VISIBILITY_SCHEDULER_ENABLED` is a global toggle — per-tenant disable is done via `enabled=false` on the schedule row

---

## Handoff

- To enable scheduled scans for a tenant: `PUT /api/ai-visibility/schedule/:clientId { enabled: true, frequency: "weekly" }`
- To activate the scheduler globally: set `AI_VISIBILITY_SCHEDULER_ENABLED=true` in environment secrets
- History tab is immediately visible; it shows an empty state when no scans exist
- All C9R-5 tests are in `ai-visibility-scheduler-config.test.ts` (28), `ai-visibility-trend-normalization.test.ts` (18), `ai-visibility-scan-history.test.ts` (15), `AiVisibilityHistoryPanel.test.tsx` (28) — 89 tests total
- Backoff correction (closure review): removed dead `Math.min(..., 24h)` guard; actual cap is `2^8 × 60s = 15_360_000 ms`; named constant `AI_VISIBILITY_BACKOFF_MAX_MS` added and exported
- Scheduler auth correction (closure review): dedicated endpoint `POST /api/ai-visibility/ingest/scheduled` added; scheduler monitor now targets this endpoint instead of the Clerk-protected user-facing route
