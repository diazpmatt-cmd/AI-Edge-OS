# ADR-015: Authority & Backlink v1 Acceptance

**Status:** Accepted  
**Date:** 2026-07-19  
**Deciders:** Engineering (AI Edge OS)  
**Tags:** backlink, authority, acceptance, v1

---

## Context

C8R-1 through C8R-9 collectively implemented the Authority & Backlink engine:

| Phase | Deliverable |
|---|---|
| C8R-1 | Evidence types, scoring weights, normalization contract |
| C8R-2 | Normalizer — service relevance, freshness, local relevance |
| C8R-3 | Fixture provider, BBB observations, ingestion orchestrator |
| C8R-4 | Repositories — prospects, evidence, opportunities, workflows, ingestion runs |
| C8R-5 | Ingestion run persistence — claim/commit/fail idempotency |
| C8R-6 | API routes — opportunities, runs, workflow transitions |
| C8R-7 | Frontend integration — AuthorityEnginePage backlinks tab |
| C8R-8 | DataForSEO provider contract, BacklinkProviderRegistry, provider health |
| C8R-9 | Scheduled discovery, historical score snapshots, run history |

C8R-10 (this ADR) performs a full repository-level acceptance audit before declaring v1 GA.

---

## Decision

**Authority & Backlink v1 is declared GO.**

The engine is production-ready for fixture-mode operation with the following characteristics:
- All data flows through canonical normalization and merge logic
- Tenant isolation enforced on every API and repository path via `resolveClient()`
- Scheduler disabled by default (`BACKLINK_SCHEDULER_ENABLED=true` required)
- No fabricated production data — fixture data is explicitly labeled
- All placeholder UI states are clearly marked with `PlaceholderBanner`

---

## Bugs Fixed During Acceptance (C8R-10 Hardening)

### BUG-1: Scheduled ingest always used fixture provider (CRITICAL)
**File:** `artifacts/api-server/src/routes/backlinks.ts`  
**Root cause:** `provider` from `_backlinkRegistry.resolve()` was dead — `ingestFixtureBacklinks` always received `new FixtureBacklinkDataProvider(...)` regardless. `void provider;` suppressed the TS warning.  
**Fix:** Use the `provider` variable in the `ingestFixtureBacklinks` call. DataForSEO will now activate when credentials are configured.

### BUG-2: authority_score used opportunity count as proxy (CRITICAL)
**File:** `artifacts/api-server/src/routes/backlinks.ts`  
**Root cause:** `Math.min(100, Math.max(0, summary.opportunityIds.length))` — opportunity count (typically < 20) stored as domain authority score. Produces misleading history chart.  
**Fix:** Store `0` explicitly. Real domain authority requires a live DA provider (v2 scope).

### BUG-3: runStatusColor mapped "completed" but API sends "succeeded" (IMPORTANT)
**File:** `artifacts/ai-edge-solutions/src/lib/backlink-ui-helpers.ts`  
**Root cause:** Schema uses `"succeeded"` (not `"completed"`) for the success state of `backlink_ingestion_runs`. The helper only checked `"completed"`, so succeeded runs rendered slate-gray instead of green.  
**Fix:** Accept both `"succeeded"` and `"completed"` for backward compatibility.

### BUG-4: PUT schedule did not recalculate next_run_at on frequency change (IMPORTANT)
**File:** `artifacts/api-server/src/routes/backlinks.ts`  
**Root cause:** CASE block fell through to `ELSE backlink_discovery_schedule.next_run_at` when an already-enabled schedule had its frequency changed. Old next_run_at was preserved regardless of the new frequency.  
**Fix:** Always compute `nextAt = calcNextRunAt(freq, now)`. Add CASE arm: `WHEN EXCLUDED.frequency != backlink_discovery_schedule.frequency THEN EXCLUDED.next_run_at`.

### HARDENING: Scheduler monitor hardcoded LIMIT 5
**File:** `artifacts/api-server/src/lib/backlink-scheduler-monitor.ts`  
**Root cause:** `LIMIT 5` was hardcoded instead of reading `BACKLINK_SCHEDULER_MAX_PER_TICK` from env.  
**Fix:** Import and call `parseBacklinkSchedulerEnvConfig()` at tick time. Use parameterized query.

---

## Deferred to v2

| Item | Reason |
|---|---|
| Real domain authority score in snapshots | Requires live DataForSEO or Moz credentials (GCP quota blocked in Phase 2) |
| Multi-tenant discovery config (per-client domain/city/region) | BBB is v1's single tenant; generalization deferred |
| DataForSEO providerRevision tracking | Fixture runs use `c8r3-fixture-v1`; live runs need versioned revision |
| Similarweb adapter | Second provider — out of v1 scope |
| Automated `provider_unavailable` count tracking | Currently hardcoded `0` in history summary |

---

## Consequences

- The engine is production-safe for fixture-mode operation
- DataForSEO will activate without code changes once credentials are present
- `BACKLINK_SCHEDULER_ENABLED=true` activates the 15-minute scheduler tick
- `BACKLINK_SCHEDULER_MAX_PER_TICK` (default: 5) bounds per-tick load
- All history snapshots have `authority_score=0` until a live DA provider is wired
- Trend sparklines are correct but flat on the authority dimension until v2
