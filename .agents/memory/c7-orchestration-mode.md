---
name: C7 scheduler — OrchestrationMode vs executionMode
description: Two completely different "mode" concepts in the discovery system; confusing them causes type errors and wrong behavior.
---

## The rule

`OrchestrationMode` (`"primary_only" | "fallback" | "merge"`) and `schedule.executionMode` (`"live" | "dry"`) are **entirely separate concepts**. Never cast one to the other.

- `OrchestrationMode` — lives in `lib/db/src/discovery-orchestrator.ts`; passed to `DiscoveryExecutionService.execute({ mode })`. Controls which providers are consulted (DataForSEO primary vs fallback vs both).
- `schedule.executionMode` — lives on the `DiscoverySchedule` entity. Controls whether a scheduled run makes real API calls ("live") or is a no-op simulation ("dry").

## How to apply

In `ScheduledDispatcher.dispatch()`:

1. Check `dryRunOverride || schedule.executionMode === "dry"` **before** calling `execute()`.
   - If true → skip `execute()`, mark occurrence as `skipped` with `skipReason: "dry_run_simulated"`, return `{ result: "dispatched", executionStatus: "dry_run_simulated" }`.
   - This mirrors how the HTTP route handles `dryRun=true` before calling the service.

2. For live runs, pass `orchestrationMode: OrchestrationMode` (default `"primary_only"`) to `execute()`. This is not derived from `schedule.executionMode`.

**Why:** The type system exposes the bug immediately — `"dry" | "live"` is not assignable to `OrchestrationMode`. But the semantic confusion runs deeper: they are orthogonal dimensions. A "dry" execution can run against any orchestration mode (primary/fallback/merge) conceptually; in practice it just skips API calls entirely.
