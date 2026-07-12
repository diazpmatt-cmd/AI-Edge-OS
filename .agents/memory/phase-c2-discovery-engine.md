---
name: Phase C2 Discovery Engine
description: Key architectural decisions, pitfalls, and patterns from the Phase C2 canonical discovery engine implementation.
---

## What was built

8 pure-function modules in `lib/db/src/`:
- `discovery-types.ts` — all canonical types
- `discovery-providers.ts` — provider + repository interfaces + RawResult types
- `discovery-context.ts` — DiscoveryContext builder (ISO week, location parsing, gap score clamping)
- `discovery-registry-gate.ts` — 5-status gate + SeasonalityEvaluator
- `discovery-normalizer.ts` — text normalization, signal ID derivation, 4 normalizer functions
- `discovery-cluster-builder.ts` — deterministic grouping by (clientId+serviceId+intent), dedup
- `discovery-scorer.ts` — 6-dimension scorecard with C1 weights + priority tier + overrides
- `discovery-pipeline.ts` — fault-tolerant 11-stage pipeline (DiscoveryPipeline class)

221 tests across 6 files in `artifacts/ai-edge-solutions/src/lib/__tests__/discovery-*-c2.test.ts`.

## Critical pitfall: lookupService() dual-path in scorer

`registry.matchByTopic(serviceId)` matches on **display names** (e.g., "Bed Bug Inspection").
Signals store **snake_case serviceIds** (e.g., "bed_bug_inspection").

`matchByTopic("bed_bug_inspection")` returns undefined — no match.

Fix: always use `lookupService()` in the scorer instead of `matchByTopic` directly:
```ts
function lookupService(serviceId: string, registry: ServiceRegistryProvider) {
  return registry.matchByTopic(serviceId)
    ?? registry.getGeneratableServices().find(s => s.serviceId === serviceId);
}
```

**Why:** matchByTopic is designed for topic display names (AI prompt topics), not serviceId slugs. Any code that resolves a service from a signal.serviceId must use the dual-path.

**How to apply:** In any scorer, gate, or pipeline code that takes `signal.serviceId` and needs a `BBBService` object, use `lookupService()`, not `matchByTopic()` alone.

## Critical pitfall: test fixture null overrides

In test `makeSignal` helpers, **always use `!== undefined` checks for nullable fields**, not `??`:

```ts
// WRONG — null ?? 500 = 500 (replaces null with default)
volumeMonthly: overrides.volumeMonthly ?? 500,

// CORRECT — null is preserved
volumeMonthly: overrides.volumeMonthly !== undefined ? overrides.volumeMonthly : 500,
```

Same applies to `serviceId` — `null ?? "bed_bug_inspection"` silently overwrites the null.

**Why:** `??` only checks for null/undefined on the left side. If the intent is to allow `null` as a valid override value (different from "not provided"), `!== undefined` is required.

**How to apply:** Any test helper that accepts `T | null | undefined` for a field must use `!== undefined` guards, not `??`.

## ISO week boundary: Dec 31 2025 is 2026-W01

ISO 8601: the first week of a year contains the first Thursday.  
Jan 1 2026 is a Thursday → the ISO week starting Dec 29 2025 (Monday) is 2026-W01.  
Dec 31 2025 (Wednesday) is in 2026-W01, NOT 2025-W53.

**How to apply:** When writing ISO week tests for year-boundary dates, verify with the implementation rather than assuming based on calendar year.

## Phase boundary deviation documented

C1 architecture planned C2=schema, C3=interfaces, C4=pipeline.  
Actual implementation: C2 = all pure functions + interfaces + pipeline (no DB schema).  
DB persistence deferred to C3 (DrizzleDiscoveryRepository to be injected).

## Running tests for this phase

The discovery C2 tests run fast individually but timing out when combined with the full suite (which takes ~107s). Run them by file:

```bash
cd artifacts/ai-edge-solutions
pnpm exec vitest run src/lib/__tests__/discovery-context-c2.test.ts src/lib/__tests__/discovery-gate-c2.test.ts
pnpm exec vitest run src/lib/__tests__/discovery-cluster-c2.test.ts src/lib/__tests__/discovery-scorer-c2.test.ts
pnpm exec vitest run src/lib/__tests__/discovery-pipeline-c2.test.ts
pnpm exec vitest run --exclude "**/*c2*"  # pre-existing tests
```
