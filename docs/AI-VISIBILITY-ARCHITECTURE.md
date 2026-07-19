# AI Edge Visibility — Architecture Reference

**Status:** C8R-5 pure layer complete; execution/API/frontend wiring pending (C9R-2+)
**Last updated:** 2026-07-19
**ADR:** [ADR-007](adr/ADR-007-c8r5-ai-visibility-read-model.md)

---

## Two Parallel Systems

The engine currently has two parallel, partially independent layers:

### Layer 1 — Legacy Audit System (operational, demo-backed)

| Artifact | Purpose |
|---|---|
| `lib/db/src/schema/ai-visibility.ts` | `ai_visibility_audits` table — 7 integer scores + 3 JSON blob columns |
| `lib/db/src/schema/audit-exports.ts` | `audit_exports` table — PDF/email export log |
| `artifacts/api-server/src/routes/ai-visibility.ts` | CRUD + random-bump `generate-report` + PDF/email delivery |
| `artifacts/ai-edge-solutions/src/pages/AIVisibilityEnginePage.tsx` | 811-line frontend; reads `GET /api/ai-visibility/:clientId`, falls back to hardcoded `DEMO` |

The legacy system is operational. Its `generate-report` produces random-bump scores — **not AI-generated, not sourced from canonical systems.** The demo fallback is indistinguishable from real data at the API level.

### Layer 2 — C8R-5 Pure Read Model (complete, not yet wired)

| Artifact | Purpose |
|---|---|
| `lib/db/src/ai-visibility-read-model-types.ts` | TypeScript contracts — all interfaces and discriminated union types |
| `lib/db/src/ai-visibility-read-model.ts` | `composeAiVisibilityReadModel()` — pure, deterministic, tenant-safe composer |
| `lib/db/src/ai-visibility-read-model-adapters.ts` | 6 source adapters (see below) |
| `lib/db/src/ai-visibility-prioritizer.ts` | Dual-axis scoring engine (potentialValue + attainability) |
| `lib/db/src/ai-visibility-fixtures.ts` | BBB golden-template fixtures for test coverage |
| `lib/db/src/index.ts` | Exports all C8R-5 symbols from `@workspace/db` |

**The C8R-5 read model is NOT wired to any API route, execution service, persistence table, or frontend component.**

### Layer 3 — Competitor AI Visibility Provider (operational, P6.2)

| Artifact | Purpose |
|---|---|
| `artifacts/api-server/src/lib/competitor-ai-visibility-provider.ts` | `AiEdgeVisibilityProvider` — reads `ai_visibility_audits.competitors_json`, derives competitor AI scores |

Real provider (`isMock: false`). Wired into the competitor enrichment registry. Derives competitor scores from gap data, not direct AI query execution.

---

## C8R-5 Source Adapters

| Adapter | Function | Input Type | Coverage Source |
|---|---|---|---|
| Local Presence | `adaptLocalPresenceSources()` | `LocalPresenceChannel[]` + `LocalPresenceProfile` | `local_presence` |
| Discovery | `adaptDiscoverySources()` | `DiscoveryOpportunityObservation[]` | `discovery` |
| Backlinks | `adaptBacklinkSources()` | `BacklinkOpportunityObservation[]` | `backlink` |
| Content | `adaptContentSources()` | `ContentPostObservation[]` | `content` |
| Reviews | `adaptTenantSafeReviews()` | `TenantSafeReviewSummary[] \| null` | `reviews` |
| Google Connected | `adaptConnectedGoogle()` | `ConnectedGoogleSummary` | `google_business`, `google_search_console`, `google_analytics` |

Passing `null` to `adaptTenantSafeReviews` explicitly reports `not_tenant_safe` (the review tables are not yet tenant-safe). `searchConsole` and `analytics` report `not_implemented`.

---

## Scoring Model

### Potential Value Weights (sum to 1.0)
- Business impact: **30%**
- Evidence strength: **25%**
- Local impact: **20%**
- Service priority: **15%**
- Urgency: **10%**

### Attainability Weights (sum to 1.0)
- Relationship access: **25%**
- Workflow readiness: **20%**
- Effort ease: **20%**
- Freshness: **15%**
- Local relevance: **10%**
- Service relevance: **10%**

### Priority Thresholds
- Critical: ≥ 80
- High: ≥ 65
- Medium: ≥ 45
- Low: < 45

Canonical backlink scores pass through as-is without recomputation.

---

## Tenant Isolation (C8R-5)

Five pre-prioritization rejection rules enforced by `validateInput()`:

| Code | Condition |
|---|---|
| `tenant_mismatch` | Observation or canonical reference `clientId` ≠ trusted scope `clientId` |
| `invalid_input` | Missing required fields (title, dedupeKey, workflow, references) |
| `unsupported_service` | `serviceId` not in `scope.activeServiceIds` |
| `outside_authorized_geography` | Normalized geography not in `scope.authorizedGeographies` |
| `prohibited_positioning` | Evidence/title/description contains a `scope.prohibitedPhrases` term |

Rejected observations are returned in the model's `rejected[]` array with the rejection code and reason — never silently dropped.

---

## Coverage Diagnostics

Each adapter emits a `AiVisibilityCoverageDiagnostic` per source:

| Status | Meaning |
|---|---|
| `available` | Source has canonical observations |
| `not_connected` | Source integration exists but is not connected |
| `not_implemented` | Source ingestion has not been built yet |
| `not_tenant_safe` | Source exists but cannot provide tenant-safe observations |
| `no_observation` | Source is connected but returned zero records |

Missing data is **never converted to a zero score**. Coverage affects the completeness summary only.

---

## Execution Gap (C9R-2 Target)

The missing execution path is:

```
[Canonical DB tables]
       ↓  (SQL queries per source)
[AiVisibilityExecutionService]
       ↓  (collects all 6 adapter inputs)
[composeAiVisibilityReadModel()]   ← exists today
       ↓  (AiVisibilityReadModel)
[ai_visibility_run_results table]  ← does not exist yet
       ↓
[GET /api/ai-visibility/read-model/:clientId]  ← does not exist yet
       ↓
[AIVisibilityEnginePage — C8R-5 tab]  ← does not exist yet
```

---

## Database Schema (production-bootstrapped via schema-migrate.ts)

```sql
ai_visibility_audits (id, client_id, business_name, overall_score, search_score, maps_score,
  ai_search_score, authority_score, review_score, competitor_gap_score,
  channels_json, competitors_json, recommendations_json, created_at, updated_at)

audit_exports (id, client_id, export_type, recipient_email, created_at)
```

No persistence table exists yet for C8R-5 read model results.
