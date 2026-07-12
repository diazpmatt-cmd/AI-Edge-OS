# Discovery C6 — Session Handoff

**Date:** 2026-07-12  
**Status:** Production-ready baseline locked.  
**Test baseline:** 191 tests passing, 0 failures.  
**TypeScript:** `lib/db` build clean, `api-server` `tsc --noEmit` clean.

---

## What C6 is

C6 is the lifecycle governance layer for discovery runs. It wraps every manual discovery execution with:

- **Rate limiting** — 2 live runs / 10 dry runs per minute per user (in-process)
- **Idempotency** — 24-hour replay via `Idempotency-Key` header
- **Governance** — maximum 1 active run per client (DB-backed active-run count)
- **Budget guard** — per-run USD ceiling, clamped to `MAX_RUN_CEILING_USD`
- **Lease** — DB-atomic exclusive lock per `(runId, clientId)`
- **Running snapshot** — pre-initialized under the lease, governance-visible immediately
- **Cooperative cancellation** — DB-poll every 2 s, 10 `shouldCancel()` checkpoints in pipeline
- **Audit trail** — every lifecycle event in `discovery_audit_events`
- **Lifecycle transitions** — `discovery_lifecycle_transitions` table records state machine
- **Cost ledger** — per-run cost record in `discovery_cost_records`

---

## The four execution invariants

These are permanent architecture rules, documented in ADR-006.

| # | Invariant | Status |
|---|-----------|--------|
| I1 | No provider fetch before lease is held | ✓ Verified |
| I2 | Exactly one lease holder per deterministic run | ✓ Verified |
| I3 | Failed lease acquisition leaves no orphaned running snapshot | ✓ Fixed (was violated; now enforced by service ordering) |
| I4 | No new provider call after cancellation signal observed | ✓ Verified (10 checkpoints) |

**I3 fix:** The original route called `persistRunResult({ status: "running" })` before `acquireLease()`. If the lease failed, the snapshot was orphaned. Fixed by moving the lease acquisition first. The corrected order is now permanent inside `DiscoveryExecutionService`.

---

## Key files

| File | Purpose |
|------|---------|
| `artifacts/api-server/src/lib/discovery-execution-service.ts` | **New in C6-final.** Canonical execution path. C7 scheduler calls this. |
| `artifacts/api-server/src/routes/discovery-run.ts` | HTTP route — thin layer. Handles auth, rate limit, idempotency, governance, budget, dry-run, response. |
| `artifacts/api-server/src/routes/discovery-c6.test.ts` | 191 tests: invariants I1–I4, pipeline cancel, rate limiter, idempotency. |
| `lib/db/src/discovery-pipeline.ts` | Pipeline with 10 cancellation checkpoints (T5). |
| `lib/db/src/discovery-c6-repository.ts` | `acquireLease`, `releaseLease`, `updateRunState`. |
| `lib/db/src/discovery-cancellation.ts` | `CancellationToken`, `CancellationSignal`, `shouldCancel`. |
| `lib/db/src/discovery-audit.ts` | `createAuditEvent`, `appendAudit`, `AuditAction` union. |
| `docs/adr/ADR-006-c6-lifecycle-governance.md` | Architecture decision record. |

---

## What was removed (C7 cleanup)

Three partial C7 files that were committed prematurely are deleted and absent from the working tree:

- `lib/db/src/discovery-scheduler.ts` — deleted
- `lib/db/src/discovery-automation-config.ts` — deleted  
- `artifacts/api-server/src/routes/discovery-schedules.ts` — deleted

Verify with: `git ls-files lib/db/src/discovery-scheduler.ts` → empty output.

---

## C7 scope and contract

C7 adds **only** the automation layer on top of the existing C6 execution path.

### What C7 must implement

1. **Tenant-scoped discovery schedules** — per-client schedule rows in DB
2. **Timezone- and DST-safe next-run calculation** — use a proper TZ library (e.g. `date-fns-tz`)
3. **Scheduler leadership** — one scheduler instance leads at a time (DB heartbeat + timeout)
4. **Atomic schedule claiming** — `UPDATE ... WHERE claimed_at IS NULL AND next_run_at <= NOW()` with row-level lock
5. **Overlap policies** — `skip`, `queue_one`, `allow` per schedule
6. **Bounded catch-up** — configurable max-catch-up window (e.g. 24 h); don't replay months of missed runs
7. **Deterministic scheduled-occurrence idempotency** — `occurrenceId = deriveRunId(clientId, weekLabel)` reuses C6 idempotency
8. **Stale-run and abandoned-claim recovery** — claim TTL + background reaper
9. **Automation health and audit reporting** — scheduler run → audit events
10. **Disabled-by-default runtime loop** — `DISCOVERY_SCHEDULER_ENABLED=false` until piloted

### What C7 must NOT do

C7 must NOT re-implement this sequence:

```
rate limit → idempotency → governance → budget → lease → running snapshot →
pipeline → finalization → lease release
```

**The scheduler calls `DiscoveryExecutionService.execute()` with `actorType: "scheduler"`.**  
That is the only correct integration point.

### C7 call pattern

```typescript
import { DiscoveryExecutionService } from "../lib/discovery-execution-service.js";

const service = new DiscoveryExecutionService();
const result  = await service.execute({
  clientId,
  correlationId:   scheduleOccurrenceId,
  mode:            schedule.mode,
  costCeilingUSD:  schedule.costCeilingUSD,
  discoveryContext,
  plan:            { estimatedCostUSD, estimatedApiCalls },
  actor:           { actorType: "scheduler", actorId: scheduleId },
});

// Dispatch on result.status:
// "lease_denied"  → another run already executing; log and skip
// "cancelled"     → unexpected from scheduler; log warning
// "failed"        → log error, trigger health alert
// "complete" | "partial" → success; update schedule.lastRunAt, nextRunAt
```

---

## Running the tests

```bash
# Full test suite
pnpm --filter @workspace/api-server run test

# TypeScript check
pnpm --filter @workspace/api-server exec tsc --noEmit
pnpm --filter @workspace/db exec tsc --build
```

Expected: 191 tests passing, both builds clean.

---

## Known limitations (carry into C7)

| Limitation | Notes |
|-----------|-------|
| Rate limiter is in-process | Not shared across pods. Acceptable until multi-instance. Replace with Redis when horizontally scaled. See `discovery-rate-limiter.ts`. |
| Cancel poll is 2 s DB query | Simple and reliable. Can upgrade to Postgres LISTEN/NOTIFY for sub-second response if needed. |
| Governance count is advisory | `getActiveRunCount` counts `"running"` snapshots. A crashed node may leave stale `"running"` status. The lease TTL (currently 1 hour) acts as a backstop; a future C7 stale-run reaper will clean these up. |
