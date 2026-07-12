---
name: C6 Lifecycle Governance
description: Discovery run lifecycle — lease timing, cancellation wiring, and fire-and-forget policy established in C6 remediation.
---

## Lease timing contract
1. `deriveRunId(clientId, week)` — called BEFORE pipeline to get canonical ID.
2. `repository.persistRunResult({ status: "running", ... })` — pre-init snapshot BEFORE `acquireLease`. Makes the run visible to governance count immediately.
3. `acquireLease(pool, runId, clientId, ownerId, 1)` — called BEFORE `pipeline.run()`. Returns 409 `execution_denied_concurrency` if not acquired.
4. `pipeline.run(context, cancelSignal)` — passed the live CancellationSignal.
5. `releaseLease` — in `finally` block, always runs.

**Why:** Previous design acquired the lease retroactively after `pipeline.run()` completed, leaving a window where two concurrent requests could both run concurrently with no exclusion.

## Cancellation wiring
- `CancellationSignal` (writable) created in route handler; passed to `pipeline.run()`.
- A 2000ms `setInterval` polls `discovery_snapshots WHERE status='cancel_requested'` and calls `cancelSignal.request()` when detected.
- Pipeline checks `shouldCancel(token, checkpoint)` at 10 points: before Stage 1, between every stage, and before each provider call in the Stage 3 PAA loop and Stage 6 AI search loop.
- When cancelled: pipeline returns `{ status: "cancelled", allSignals: partialSignals }`. Route calls `updateRunState(cancelled)`, writes transition + audit, returns 200 with `status: "cancelled"`.

**Why:** Without per-iteration checks in Stage 3/6 loops, a cancel request is only honoured after the entire loop finishes, which could be minutes.

## Fire-and-forget policy
All async fire-and-forget calls (audit, transition, diagnostic, idempotency, lease release) MUST log errors in their `.catch()` — never `.catch(() => {})`. Pattern:
```typescript
someAsyncSideEffect(...).catch((err: unknown) => {
  console.error("[discovery-run] What failed:", err instanceof Error ? err.message : String(err));
});
```

**Why:** Silent catches hide DB connectivity issues and make incidents undetectable until a user reports missing data.

## How to apply
- Any new C-phase route that uses `acquireLease` must follow: persistRunResult → acquireLease → pipeline.run(ctx, cancelSignal).
- Any new pipeline stage added must have a `shouldCancel()` check inserted after it.
- Any new fire-and-forget call must use the logging pattern above.
