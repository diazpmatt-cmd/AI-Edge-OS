# C9R-5 Session Handoff — Scheduled Monitoring & Run History

**Date:** 2026-07-20
**Phase completed:** C9R-5 (Scheduled Monitoring & Run History)
**V1 completion before:** 91%
**V1 completion after:** 97%
**Next phase:** C9R-6 (Review Intelligence Tenant Safety)

---

## What Was Done in C9R-5

### 1. Schema Additions (idempotent in `schema-migrate.ts`)

- `ai_query_scans.trigger_source` TEXT DEFAULT `'manual'`
- `ai_query_scans.competitor_mention_count` INTEGER
- `ai_query_scans.citation_count` INTEGER
- `ai_visibility_run_results.trigger_source` TEXT DEFAULT `'manual'`
- New table: `ai_visibility_schedule` (id, client_id UNIQUE, enabled DEFAULT false, frequency DEFAULT weekly, next_run_at, last_run_at, last_success_at, consecutive_failures DEFAULT 0, max_retries DEFAULT 3)
- Partial index: `ai_visibility_schedule_due` ON `(enabled, next_run_at) WHERE enabled = TRUE`

### 2. lib/db Additions

- `lib/db/src/ai-visibility-scan-history-types.ts` — types + pure scheduler helpers (`parseAiScheduleFrequency`, `calcAiVisibilityNextRunAt`, `aiVisibilityBackoffMs`, `AI_VISIBILITY_BACKOFF_MAX_MS`, `aiVisibilityShouldAutoDisable`, `parseAiVisibilitySchedulerEnvConfig`)
- `lib/db/src/ai-visibility-trend-normalization.ts` — pure trend normalization (`normalizeScanHistoryToTrendPoints`, `computeTrendSummary`, `computeFullTrendSummary`)
- Both exported from `lib/db/src/index.ts`

### 3. API Server Additions

- `AiQueryScanService.listHistory()` — paginated history with optional status filter
- `GET /api/ai-visibility/read-model/:clientId/history` — paginated scan history
- `GET /api/ai-visibility/schedule/:clientId` — schedule config (or default disabled stub)
- `PUT /api/ai-visibility/schedule/:clientId` — upsert schedule (enable/disable/frequency)
- `POST /api/ai-visibility/ingest/scheduled` — **scheduler-secret-only** endpoint; scheduler monitor calls this
- `artifacts/api-server/src/lib/ai-visibility-scheduler-monitor.ts` — scheduler tick
- Scheduler registered in `scheduler.ts` when `AI_VISIBILITY_SCHEDULER_ENABLED=true`

### 4. Frontend Additions

- `AiVisibilityHistoryPanel.tsx` — History tab (sparkline, trend badge, pagination, status/source filters)
- 4th "📈 History" tab added to `AIVisibilityEnginePage.tsx`

### 5. Tests (89 new tests)

| File | Tests |
|---|---|
| `ai-visibility-scheduler-config.test.ts` | 28 |
| `ai-visibility-trend-normalization.test.ts` | 18 |
| `ai-visibility-scan-history.test.ts` | 15 |
| `AiVisibilityHistoryPanel.test.tsx` | 28 |

---

## Closure Bugs Corrected

### Bug 1 — Scheduler auth gap (critical)

**Symptom:** The scheduler monitor was POSTing to `POST /api/ai-visibility/query-scan/:clientId` (Clerk auth). The scheduler has no Clerk token — every scheduled scan would 401.

**Fix:** Added dedicated `POST /api/ai-visibility/ingest/scheduled` (scheduler-secret auth, mirrors `POST /api/backlinks/ingest/scheduled`). Updated the monitor to call the new endpoint.

### Bug 2 — `triggerSource` not passed from route body

**Symptom:** `POST /api/ai-visibility/query-scan/:clientId` ignored `req.body.triggerSource` — every scan defaulted to `"manual"`.

**Fix:** Route now reads `triggerSource` from request body and passes it to `svc.execute()`.

### Bug 3 — Backoff dead code

**Symptom:** `Math.min(..., 24h)` was unreachable because the inner clamp limits the result to 2^8 × 60s = 15_360_000 ms < 86_400_000 ms. Implied the cap was 24h; actual cap was 256 min.

**Fix:** Removed the unreachable wrapper. Added `AI_VISIBILITY_BACKOFF_MAX_MS = 15_360_000` constant with comment. Added test asserting the constant equals the actual ceiling.

---

## All C9R-5 Acceptance Criteria — Verified

| Criterion | Status |
|---|---|
| Scheduling defaults to disabled | ✅ |
| Eligible tenants are tenant-safe | ✅ |
| Batch size and cadence bounded | ✅ |
| Overlapping cycles prevented | ✅ |
| Duplicate tenant scans prevented | ✅ |
| Tenant failures isolated | ✅ |
| Manual/scheduled triggers distinguishable | ✅ |
| History pagination stable, newest-first | ✅ |
| API + repo IDOR enforcement | ✅ |
| Frontend trends no misleading averages | ✅ |
| Provider failures explicit | ✅ |
| Tests never invoke paid providers | ✅ |

---

## Full Regression Results

- API: 758 tests across 29 files — all passing
- Frontend: 176 tests across 6 files — all passing
- API TypeScript: clean (0 errors)
- Frontend TypeScript: 1 pre-existing error (`ReferralProgramPage.tsx:162`) — not touched

---

## ADR

ADR-016: `artifacts/api-server/docs/ADR-016-c9r5-ai-visibility-scheduled-monitoring.md`

---

## Environment Variables

See [AI-VISIBILITY-PROVIDER-CONFIGURATION.md](AI-VISIBILITY-PROVIDER-CONFIGURATION.md) for the full C9R-5 scheduler variable reference and safe enablement sequence.

---

## Next Phase

**C9R-6 — Review Intelligence Tenant Safety**

Make review data tenant-safe and available to `adaptTenantSafeReviews`.

Scope:
- `tenant_safe_review_summaries` table: `(id, client_id, platform, review_count, average_rating, target_review_count, geography, observed_at)`
- Import job reading GBP review stats per client (bounded by connection)
- Wire table to `adaptTenantSafeReviews()` in execution service
- Remove `not_tenant_safe` coverage status for `reviews` source

Acceptance criteria:
- `reviews` coverage source reports `available` (not `not_tenant_safe`) when GBP is connected
- Review velocity gap generates a recommendation when `reviewCount < targetReviewCount`

Completion impact: +3% (97% → 100%)
