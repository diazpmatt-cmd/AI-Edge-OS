---
name: Phase C3 Discovery Persistence
description: Drizzle/PG persistence layer for C2 discovery engine — repo implementations, snapshotId stamping, idempotency contracts, and test patterns.
---

## Rule: pipeline must restamp snapshotId before assembly

C2 signals/clusters/opportunities leave the pipeline with `snapshotId: "pending"` because no DB existed during C2. In Stage 11 (C3), the pipeline restamps all child records with the actual `runId` before assembling `summaryBase`:

```typescript
const stampedSignals = allSignals.map(s =>
  s.snapshotId === runId ? s : { ...s, snapshotId: runId }
);
```

**Why:** Without this stamp, `getSignalsForRun(runId, clientId)` returns 0 rows because the stored `snapshotId` is `"pending"`, not the actual run PK. Tests Q2, Q5, Q6 catch this.

**How to apply:** Any future C2→C3 bridge that stores child records must restamp `snapshotId` before persisting.

---

## Rule: onConflictDoUpdate set keys must be camelCase JS names

In Drizzle `onConflictDoUpdate({ set: {...} })`, the object keys are the **Drizzle/JS property names** (camelCase), not the SQL column names. The `excluded.*` SQL values still use snake_case:

```typescript
set: {
  providersRun:   drizzleSql`excluded.providers_run`,  // ✅
  providers_run:  drizzleSql`excluded.providers_run`,  // ❌ won't map
}
```

**Why:** Drizzle maps camelCase keys to their column definitions; using snake_case keys silently no-ops the update.

---

## Architecture

- `lib/db/src/discovery-drizzle-repository.ts` — DrizzleDiscoveryRepository + InMemoryDiscoveryRepository + serialization helpers + bootstrapDiscoveryTables
- `lib/db/migrations/0005_c3_discovery_tables.sql` — idempotent raw SQL for 4 tables (drizzle-kit push blocked)
- `artifacts/ai-edge-solutions/src/lib/__tests__/discovery-c3.test.ts` — 103 tests, 20 categories A–T

## Idempotency contracts

- **Snapshot**: `ON CONFLICT (id) DO UPDATE` — re-running updates status/counts atomically
- **Signals / Clusters / Opportunities**: `ON CONFLICT (id) DO NOTHING` — deterministic PKs make duplicate writes safe no-ops

## InMemoryDiscoveryRepository flags for tests

- `simulateWriteFailure = true` — all writes throw; used in categories L (rollback) and R (pipeline tolerance)
- `writeCallCounts.*` — per-method call counters for idempotency assertions
- `reset()` — clears all state and resets counters

## Tenant isolation contract

Every read includes BOTH the record ID AND `clientId` in the WHERE clause. Cross-tenant access returns `null` / `[]` even when the ID is known.
