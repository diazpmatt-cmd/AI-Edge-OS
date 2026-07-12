# ADR-006 — C6 Discovery Lifecycle Governance

**Status:** Accepted  
**Date:** 2026-07-12  
**Deciders:** Engineering  
**Supersedes:** —  
**Superseded by:** —

---

## Context

The discovery pipeline calls external paid APIs (DataForSEO, future providers). Without governance:

- Concurrent HTTP requests could trigger duplicate live runs for the same client.
- A crashed or timed-out run could leave a `"running"` snapshot with no lease, blocking future runs indefinitely.
- Provider calls could begin before an exclusive execution lock was held, allowing two callers to interleave inside the same pipeline.
- A cancellation signal could fire while a provider call was already in flight, with no checkpoint to observe it.

C5 introduced the pipeline and DB schema. C6 adds the governance layer that makes production operation safe.

---

## Decision

### Four execution invariants — permanent architecture rules

These invariants are enforced by `DiscoveryExecutionService` and must not be violated by any refactor, including C7.

| # | Invariant | Enforcement |
|---|-----------|-------------|
| **I1** | No provider fetch can begin before a lease is held. | `acquireLease()` is called before `pipeline.run()`. All steps are `await`-chained in strict order. |
| **I2** | Exactly one lease holder can execute a deterministic run. | `acquireLease()` issues an atomic `INSERT INTO discovery_leases … ON CONFLICT DO NOTHING`. Only one DB row wins per `(runId, clientId)`. |
| **I3** | A failed lease acquisition leaves no orphaned running snapshot. | `persistRunResult({ status: "running" })` is called **only after** `leaseAcquired = true`. A failed acquire causes an early return before any snapshot write. |
| **I4** | Cancellation cannot allow any new provider call after the signal is observed. | `shouldCancel()` is checked before every individual provider call — 10 checkpoints total across all pipeline stages. Once fired, the flag is permanently `true`. |

The canonical execution order inside `DiscoveryExecutionService.execute()` is:

```
1. acquireLease()                → if !acquired: return "lease_denied" (no snapshot written)
2. persistRunResult("running")   → only after lease secured
3. audit("live_run_requested")
4. cancelPoll (setInterval 2 s)
5. pipeline.run(context, cancelSignal)    ← providers called here only
6. finalize: updateRunState → transitions → diagnostics → costLedger
[finally] releaseLease()
```

**DO NOT reorder steps 1–5.**

### DiscoveryExecutionService — single canonical path

The execution sequence is extracted from the HTTP route into `DiscoveryExecutionService` (`artifacts/api-server/src/lib/discovery-execution-service.ts`). Both the manual HTTP route (C5/C6) and the C7 automated scheduler call this service. The sequence exists in exactly one place.

The HTTP route (`discovery-run.ts`) owns HTTP-specific concerns only:
- Clerk authentication
- Zod request validation
- Rate limiting (2/min live, 10/min dry)
- Idempotency check and replay (24h window)
- Governance policy check (`getActiveRunCount`)
- Budget guard check
- Provider health check
- Dry-run path (no service call)
- HTTP response formatting
- Idempotency record saving (success case)

### Run ID determinism

`runId = deriveRunId(clientId, weekLabel)` — deterministic from `(clientId, ISO week)`. Two requests for the same client in the same week always produce the same `runId`, which means:
- The lease is contentious (I2 fires naturally).
- The snapshot is idempotent (INSERT ON CONFLICT DO UPDATE).
- Idempotency replay works without storing the runId externally.

### Cooperative cancellation

The cancel route (`POST /api/discovery/cancel`) writes `status = "cancel_requested"` to the snapshot. The execution service polls this row every 2 seconds inside `cancelPollInterval`. When detected, `cancelSignal.request(...)` fires — `isCancelled` becomes permanently `true`. `shouldCancel()` returns `true` at the next of 10 checkpoints, and no new provider call can start (I4).

### Audit trail

Every event that changes run lifecycle is audited to `discovery_audit_events`:
- `dry_run_requested`
- `execution_denied_governance`
- `execution_denied_budget`
- `execution_denied_concurrency`
- `live_run_requested`
- `run_cancelled_requested`
- `execution_failed`
- `execution_complete` / `execution_partial` (via transitions table)

---

## Consequences

**Positive:**
- All four invariants are enforced at the service boundary, not spread across callers.
- C7 scheduler inherits governance for free by calling the service.
- The lease-before-snapshot ordering defect (I3 violation found in audit) cannot reappear without also breaking the manual-run path.
- 191 tests covering all invariants, pipeline cancellation, rate limiting, and idempotency.

**Negative / trade-offs:**
- The 2-second cancel poll adds a DB query every 2 s per running execution. Acceptable at current scale; can be replaced with a Postgres LISTEN/NOTIFY channel in a future phase.
- Rate limits are in-process (memory-based). They reset on pod restart and are not shared across multiple API server instances. Acceptable until multi-instance deployment; replace with Redis when needed. See `discovery-rate-limiter.ts` — single-instance documented.

---

## Alternatives considered

| Alternative | Rejected because |
|-------------|-----------------|
| Advisory lock (`pg_advisory_xact_lock`) | Tied to DB connection lifetime; connection pool complicates ownership. |
| Redis SETNX lease | Extra infrastructure dependency; not available in current environment. |
| Optimistic concurrency (version check on snapshot) | Does not prevent concurrent *starts*, only concurrent *writes*. |
| No cancellation | Expensive provider calls with no escape hatch is unacceptable for production. |
