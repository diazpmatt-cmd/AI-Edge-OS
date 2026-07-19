# Authority & Backlink v1 Handoff

**Date:** 2026-07-19  
**Phase completion:** C8R-1 through C8R-10  
**Status:** v1 GA — GO

---

## What Was Built

The Authority & Backlink engine is a complete link-opportunity discovery and workflow pipeline integrated into the BBB (Bed Bugs & Beyond) admin dashboard.

### Core pipeline

```
Provider (fixture | DataForSEO)
  → discover() → RawBacklinkEvidence[]
  → normalizeBacklinkEvidence()  (freshness, service, local relevance)
  → mergeBacklinkEvidence()      (deduplicate by domain + category + service)
  → scoreBacklinkEvidence()      (potentialValue + attainability, 0–100)
  → group by (prospectId, category, serviceId)
  → BacklinkProspect + BacklinkOpportunity + BacklinkWorkflow
  → persist via BacklinkRepository (Drizzle / Postgres)
  → idempotent via BacklinkIngestionRun claim/commit/fail
```

### Key files

| File | Role |
|---|---|
| `lib/db/src/backlink-types.ts` | All TypeScript types |
| `lib/db/src/backlink-providers.ts` | Provider interface contract |
| `lib/db/src/backlink-normalizer.ts` | Evidence normalization |
| `lib/db/src/backlink-scorer.ts` | Scoring weights and formula |
| `lib/db/src/backlink-ingestion.ts` | Ingestion orchestrator |
| `lib/db/src/backlink-repository.ts` | Drizzle repository |
| `lib/db/src/backlink-lifecycle.ts` | Workflow state machine |
| `lib/db/src/backlink-ingestion-run.ts` | Run idempotency |
| `lib/db/src/dataforseo-backlink-adapter.ts` | Live DataForSEO adapter |
| `lib/db/src/backlink-scheduler-config.ts` | Frequency / backoff / env config |
| `lib/db/src/backlink-history.ts` | History types and helpers |
| `lib/db/src/schema/backlinks.ts` | Drizzle schema |
| `artifacts/api-server/src/routes/backlinks.ts` | All 9 REST routes |
| `artifacts/api-server/src/lib/backlink-scheduler-monitor.ts` | Scheduler tick |
| `artifacts/ai-edge-solutions/src/pages/AuthorityEnginePage.tsx` | Frontend (Backlinks tab) |
| `artifacts/ai-edge-solutions/src/lib/backlink-ui-helpers.ts` | Frontend helpers |

---

## Database Schema

### Core backlink tables (schema/backlinks.ts → schema-migrate.ts)
- `backlink_prospects` — one row per (client, domain, optional pageUrl)
- `backlink_evidence` — normalised evidence items; FK to prospects
- `backlink_opportunities` — scored groups; FK to prospects
- `backlink_workflows` — state machine per opportunity (discovered → won/rejected/expired)
- `backlink_workflow_events` — immutable audit trail
- `backlink_ingestion_runs` — idempotency table; UNIQUE on (client, provider, revision, mode, fingerprint)

### Scheduling & history tables (schema-migrate.ts raw DDL)
- `backlink_discovery_schedule` — one row per client; UNIQUE(client_id); partial index on `next_run_at WHERE enabled`
- `backlink_score_history` — one row per (client_id, snapshot_date); UNIQUE; 90-day retention; `authority_score=0` (v1 placeholder)

---

## API Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/backlinks/providers/health` | Clerk OR scheduler-secret | Provider registry health report |
| GET | `/api/backlinks/schedule` | Clerk | Fetch discovery schedule config |
| PUT | `/api/backlinks/schedule` | Clerk | Upsert schedule config |
| POST | `/api/backlinks/ingest/scheduled` | x-scheduler-secret | Scheduler-triggered ingest + snapshot |
| GET | `/api/backlinks/history/score` | Clerk | Historical score snapshots |
| GET | `/api/backlinks/history/summary` | Clerk | Run counts + schedule state |
| GET | `/api/backlinks/opportunities` | Clerk | Paginated opportunity list |
| GET | `/api/backlinks/opportunities/:id` | Clerk | Opportunity detail + evidence + workflow |
| PATCH | `/api/backlinks/workflows/:opportunityId` | Clerk | Transition workflow status |
| GET | `/api/backlinks/runs` | Clerk | Ingestion run history |
| POST | `/api/backlinks/ingest/fixture` | Clerk | Manual fixture ingest trigger |

### Tenant isolation
Every Clerk-authenticated route calls `resolveClient(req, res)` which:
1. Extracts `userId` from Clerk session
2. Calls `resolveClientContentContextFromDb(userId)` → maps user → client
3. All DB queries are scoped to `client.id` — no cross-tenant data leakage possible

The scheduler endpoint uses `x-scheduler-secret` + `x-scheduler-client-id` headers as its trust boundary (internal only).

---

## Provider Architecture

### BacklinkProviderRegistry
Priority-based registry. `resolve()` returns the highest-priority **configured** provider.

```
Priority 10: DataForSEOBacklinkAdapter   — live, requires DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD
Priority  1: FixtureBacklinkDataProvider — always configured, BBB fixture observations
```

When DataForSEO is unconfigured, a stub is registered (appears in health report as "unconfigured", never selected by `resolve()`). The fixture provider is the automatic fallback.

### Activating DataForSEO
Set `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` environment secrets. The adapter activates immediately (process restart required). No code changes needed.

---

## Scheduler

### Configuration
| Env Var | Default | Description |
|---|---|---|
| `BACKLINK_SCHEDULER_ENABLED` | `false` | Master on/off switch |
| `BACKLINK_SCHEDULER_TICK_MS` | 900000 (15 min) | Tick interval |
| `BACKLINK_SCHEDULER_MAX_PER_TICK` | 5 | Max schedule rows per tick |

### Scheduling lifecycle
1. Tick queries `backlink_discovery_schedule WHERE enabled=true AND next_run_at <= NOW()`
2. For each due row: POST `/api/backlinks/ingest/scheduled` with scheduler-secret headers
3. On success: reset failures, advance `next_run_at` by frequency
4. On `provider_unavailable`: advance by 1 day, no failure counter bump
5. On failure: increment `consecutive_failures`, apply exponential backoff (30 min base, 6 h cap)
6. At `consecutive_failures >= max_retries`: auto-disable the row

---

## Frontend

The **Backlinks** tab of `AuthorityEnginePage.tsx` provides:
- **Opportunity table** — paginated, filterable by category + workflow status
- **Detail drawer** — rationale, recommended action, evidence with authority metrics  
- **Workflow controls** — status transition buttons (reviewing → pursuing → won/rejected)
- **Ingestion run history** — last 20 runs with counts
- **Discovery Status card** (C8R-9) — schedule state, last success, next run, provider health
- **Historical Authority Trend** (C8R-9) — SVG sparkline for authority score + backlink count

Non-backlink tabs (Citations, NAP, Schema, Actions) display `PlaceholderBanner` — these are explicitly labeled as pending until their respective scanning engines are built.

---

## Test Coverage

| Test file | Tests | Scope |
|---|---|---|
| `lib/__tests__/backlink-c8r1.test.ts` | 10 | Scoring weights and evidence types |
| `lib/__tests__/backlink-c8r2.test.ts` | 12 | Normalizer — freshness, relevance |
| `lib/__tests__/backlink-c8r3.test.ts` | 8 | Fixture provider, BBB observations |
| `lib/__tests__/backlink-c8r4.test.ts` | 14 | Repository types and lifecycle |
| `lib/__tests__/backlink-c8r7.test.ts` | 12 | UI helpers (pre-C8R-9) |
| `lib/__tests__/backlink-c8r8.test.ts` | 8 | Provider health, DataForSEO config |
| `lib/__tests__/backlink-c8r9.test.ts` | 38 | History helpers, sparkline |
| `lib/__tests__/backlink-c8r10.test.ts` | ~50 | C8R-10 acceptance hardening (all helpers) |
| `api-server/__tests__/backlink-dataforseo-adapter.test.ts` | 36 | DataForSEO adapter |
| `api-server/__tests__/backlink-scheduler-monitor.test.ts` | 48 | Scheduler config pure functions |
| `api-server/__tests__/backlink-c8r10-hardening.test.ts` | ~35 | C8R-10 route behavioral contracts |

---

## Known Limitations (Deferred to v2)

| Item | Detail |
|---|---|
| `authority_score` in history | Stored as 0 (v1 placeholder); real DA requires live DataForSEO or Moz |
| Discovery config per client | `clientDomain`, `city`, `region` are hardcoded to BBB; generalize in v2 |
| `provider_unavailable` run counting | `providerUnavailableRuns` is always 0 in history summary; needs a counter |
| Scheduled ingest `providerRevision` | Fixture runs use `c8r3-fixture-v1`; live provider should use a versioned rev |
| Second backlink provider | Similarweb or Moz adapter is a v2 enhancement |

---

## Recommended Next Engine

**Referral Program Engine** — based on the existing `ReferralProgramPage.tsx` stub and the established pattern of: types → normalizer → scorer → repository → routes → frontend integration. Or, if GBP quota is resolved, resume GBP Phase 2 (live API verification).
