# Session Handoff — C9R-5 Closure

**Date:** 2026-07-20  
**Phase completed:** C9R-5 — AI Visibility Scheduled Monitoring & Run History  
**Next phase:** C9R-6 — AI Visibility Monitoring Alerts

---

## What was built

### Schema additions (idempotent in `schema-migrate.ts`)
- `ai_query_scans.trigger_source` TEXT DEFAULT `'manual'`
- `ai_query_scans.competitor_mention_count` INTEGER
- `ai_query_scans.citation_count` INTEGER
- `ai_visibility_run_results.trigger_source` TEXT DEFAULT `'manual'`
- New table: `ai_visibility_schedule` (id, client_id UNIQUE, enabled DEFAULT false, frequency DEFAULT weekly, next_run_at, last_run_at, last_success_at, consecutive_failures DEFAULT 0, max_retries DEFAULT 3)
- Partial index: `ai_visibility_schedule_due` ON `(enabled, next_run_at) WHERE enabled = TRUE`

### lib/db additions
- `lib/db/src/ai-visibility-scan-history-types.ts` — types + pure scheduler helpers
- `lib/db/src/ai-visibility-trend-normalization.ts` — pure trend normalization
- Both exported from `lib/db/src/index.ts`

### API server additions
- `AiQueryScanService.listHistory()` — paginated history with optional status filter
- `GET /api/ai-visibility/read-model/:clientId/history` — paginated scan history
- `GET /api/ai-visibility/schedule/:clientId` — schedule config (or default disabled stub)
- `PUT /api/ai-visibility/schedule/:clientId` — upsert schedule (enable/disable/frequency)
- `POST /api/ai-visibility/ingest/scheduled` — **scheduler-secret-only** endpoint; scheduler monitor calls this
- `artifacts/api-server/src/lib/ai-visibility-scheduler-monitor.ts` — scheduler tick
- Scheduler registered in `scheduler.ts` when `AI_VISIBILITY_SCHEDULER_ENABLED=true`

### Frontend additions
- `AiVisibilityHistoryPanel.tsx` — History tab component (sparkline, trend badge, pagination, status filter)
- 4th tab "📈 History" added to `AIVisibilityEnginePage.tsx`

### Test additions (89 tests total)
- `ai-visibility-scheduler-config.test.ts` — 28 tests (scheduler config pure functions + new `AI_VISIBILITY_BACKOFF_MAX_MS` constant test)
- `ai-visibility-trend-normalization.test.ts` — 18 tests
- `ai-visibility-scan-history.test.ts` — 15 tests
- `AiVisibilityHistoryPanel.test.tsx` — 28 tests (frontend)

---

## Bugs fixed during closure review

### Bug 1: Scheduler auth gap (critical)
**Symptom:** The scheduler monitor was POSTing to `POST /api/ai-visibility/query-scan/:clientId` (Clerk auth required). The scheduler has no Clerk token — every scheduled scan would 401.  
**Fix:** Added dedicated `POST /api/ai-visibility/ingest/scheduled` (scheduler-secret auth only, mirrors `POST /api/backlinks/ingest/scheduled`). Updated the monitor to call this endpoint.  
**Files:** `ai-visibility.ts`, `ai-visibility-scheduler-monitor.ts`

### Bug 2: `triggerSource` not passed from route body (acceptance criteria violation)
**Symptom:** The user-facing `POST /api/ai-visibility/query-scan/:clientId` ignored `req.body.triggerSource` — every scan defaulted to `"manual"`.  
**Fix:** Route now reads `triggerSource` from request body and passes it to `svc.execute()`. Scheduler auth bug made this moot for scheduled scans (they now use the dedicated endpoint), but the field is now correctly passed for manual triggers that choose to supply it.  
**File:** `ai-visibility.ts`

### Bug 3: Backoff dead code (`aiVisibilityBackoffMs`)
**Symptom:** `Math.min(..., 24 * 60 * 60 * 1000)` was unreachable because the inner clamp `Math.min(failures, 8)` limits the result to `2^8 × 60s = 15_360_000 ms < 86_400_000 ms`. The 24h guard implied the cap was 24h; the actual cap was 256 min.  
**Fix:** Removed the unreachable `Math.min` wrapper. Added named constant `AI_VISIBILITY_BACKOFF_MAX_MS = 15_360_000` with explanatory comment. Added one test asserting the constant equals the actual ceiling.  
**Files:** `ai-visibility-scan-history-types.ts`, `ai-visibility-scheduler-config.test.ts`

---

## State of all C9R-5 acceptance criteria

| Criterion | Verified | Mechanism |
|-----------|----------|-----------|
| Scheduling defaults to disabled | ✅ | `enabled=false` default; `AI_VISIBILITY_SCHEDULER_ENABLED` guard |
| Eligible tenants are tenant-safe | ✅ | All routes use `resolveClientActiveCheck(userId)` + slug check |
| Batch size and cadence bounded | ✅ | `maxPerTick ∈ [1,20]`; frequency limited to daily/weekly/biweekly/monthly |
| Overlapping cycles prevented | ✅ | `inFlightClients Set<string>` per-client dedup within tick |
| Duplicate tenant scans prevented | ✅ | Same Set guard; scheduler advances `next_run_at` before next eligible check |
| Tenant failures isolated | ✅ | Per-row failure counter; exception caught per client |
| Manual/scheduled triggers distinguishable | ✅ | `trigger_source` column; two separate auth paths (Clerk vs scheduler-secret) |
| History pagination stable, newest-first | ✅ | `ORDER BY started_at DESC LIMIT $n OFFSET $m`; `hasMore` flag |
| API + repo IDOR enforcement | ✅ | `resolveClientActiveCheck` + slug check on all Clerk routes; `getScanEvidence(scanId, clientId)` uses both params |
| Frontend trends no misleading averages | ✅ | `normalizeScanHistoryToTrendPoints`: weighted aggregate per day, not per-scan average |
| Provider failures explicit | ✅ | `scan.status="failed"`, `error` column persisted; `42P01` handled gracefully |
| Tests never invoke paid providers | ✅ | Mock `AiQueryProvider` injected in all test files via constructor |

---

## How to enable scheduled scans

```bash
# 1. Enable for a specific tenant (via API)
curl -X PUT https://.../api/ai-visibility/schedule/bbb \
  -H "Authorization: Bearer <clerk-token>" \
  -H "Content-Type: application/json" \
  -d '{ "enabled": true, "frequency": "weekly" }'

# 2. Activate global scheduler (Replit environment secrets)
AI_VISIBILITY_SCHEDULER_ENABLED=true
AI_VISIBILITY_SCHEDULER_MAX_PER_TICK=2   # conservative start

# 3. Restart API server
```

---

## Documentation written this session

- `artifacts/api-server/docs/ADR-016-c9r5-ai-visibility-scheduled-monitoring.md` — updated
- `artifacts/api-server/docs/ai-visibility-architecture.md` — new
- `artifacts/api-server/docs/ai-visibility-provider-scheduler-config.md` — new
- `artifacts/api-server/docs/ai-visibility-env-vars.md` — new
- `artifacts/api-server/docs/ai-visibility-v1-roadmap.md` — new
- `artifacts/api-server/docs/master-roadmap.md` — new
- `artifacts/api-server/docs/session-handoff-c9r5.md` — this file

---

## Recommended next phase

**C9R-6: AI Visibility Monitoring Alerts**

Rationale: Scheduled scans now run autonomously. Without alerts, a declining trend or auto-disabled schedule is invisible to the operator until they manually check the History tab. C9R-6 closes this gap by adding proactive notification, completing the "observe → act" loop that C9R-5 opened.

Scope:
- `ai_visibility_alerts` table (type, severity, acknowledged, created_at)
- Alert evaluation run post-scan (mention-rate drop > threshold, schedule auto-disabled)
- `GET /api/ai-visibility/alerts/:clientId`
- `POST /api/ai-visibility/alerts/:clientId/acknowledge`
- Alert banner in the History tab (dismissable, auto-clears on recovery)
- Unit tests: alert evaluation pure functions + route behavioral tests
