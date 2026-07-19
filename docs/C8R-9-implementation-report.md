# C8R-9 Implementation Report

**Phase:** C8R-9 — Historical Authority Trends & Competitive Comparison
**Date:** 2026-07-19
**Status:** COMPLETE ✅

---

## Files Modified

| File | Change |
|---|---|
| `lib/db/src/backlink-history.ts` | Extended `BacklinkScoreSnapshot`; added `BacklinkPeriodSummary`, `BacklinkCompetitorComparison` types; added `computePeriodSummaries()` |
| `artifacts/api-server/src/lib/schema-migrate.ts` | Additive `ALTER TABLE … ADD COLUMN IF NOT EXISTS` guards for `new_count`, `lost_count`, `referring_domain_count` |
| `artifacts/api-server/src/routes/backlinks.ts` | Updated snapshot INSERT (9 columns); updated history/score SELECT (COALESCE new cols); added `GET /history/trend`; added `GET /history/competitive` |
| `artifacts/ai-edge-solutions/src/lib/backlink-ui-helpers.ts` | Added `computePeriodLabel`, `periodDeltaColor`, `competitorTrendIcon` helpers |
| `artifacts/ai-edge-solutions/src/pages/AuthorityEnginePage.tsx` | Added `BacklinkTrendPeriod`, `CompetitorBenchmark`, `CompetitiveComparisonResult` interfaces; extended `ScoreSnapshot`; added `trendPeriods` + `competitiveSummary` state; 5-way parallel fetch; Historical Trend Analysis cards; Competitive Benchmark table |

---

## Historical Analytics

### New schema columns on `backlink_score_history`

| Column | Type | Default | Purpose |
|---|---|---|---|
| `new_count` | INTEGER NOT NULL | 0 | Backlinks gained in this run period |
| `lost_count` | INTEGER NOT NULL | 0 | Backlinks lost in this run period |
| `referring_domain_count` | INTEGER NOT NULL | 0 | Unique referring domains at snapshot time |

Migration is additive: `ALTER TABLE backlink_score_history ADD COLUMN IF NOT EXISTS …`. Safe no-op on re-run.

### `computePeriodSummaries(snapshots, periodDays, now)`

Pure function in `lib/db/src/backlink-history.ts`. For each requested period window (e.g. 7d/30d/90d):

1. Finds the **baseline snapshot** — the most recent snapshot whose date is ≤ `(now − periodDays)`.
2. Falls back to the **oldest available snapshot** if none predate the cutoff.
3. Computes deltas: `latest.X − baseline.X` for authority, backlinks, referring domains, opportunities.
4. **Sums** `newCount` and `lostCount` across all snapshots **after** the baseline (window aggregation, not diff).
5. Derives `direction` from `authorityDelta` (primary KPI): `up / down / flat`.
6. Reports `snapshotsInWindow` = baseline + all post-baseline snapshots.

**v1 note:** `new_count` and `lost_count` are persisted as 0 placeholders. Phase 2 will populate these from DataForSEO provider diff data.

---

## Competitive Comparison

### `GET /api/backlinks/history/competitive`

- Fetches the **client's own** latest `backlink_score_history` row (authority_score, backlink_count, referring_domain_count, opportunity/won counts).
- Joins the `competitors` table (COALESCE all nullable score columns to 0) for up to 10 tracked competitors, ordered by `confidence_score DESC`.
- Returns `CompetitiveComparisonResult`:

```ts
interface CompetitiveComparisonResult {
  client: {
    authorityScore: number;
    backlinkCount: number;
    referringDomainCount: number;
    opportunityCount: number;
    wonCount: number;
  };
  competitors: CompetitorBenchmark[];  // domain, businessName, authorityScore, backlinkCount, citationScore, opportunityScore, organicVisibilityScore
}
```

**v1 note:** `authorityScore` on the client row reads from `backlink_score_history.authority_score`, which is 0 until Phase 2 populates it from DataForSEO. Competitor scores come from the existing `competitors` table populated by the discovery pipeline.

---

## APIs

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/backlinks/history/trend` | 90-day snapshots → `computePeriodSummaries([7,30,90])` → `{ periods, snapshotCount }` |
| `GET` | `/api/backlinks/history/competitive` | Client self-row + top 10 competitors → `CompetitiveComparisonResult` |
| `GET` | `/api/backlinks/history/score` | Updated: now returns `new_count`, `lost_count`, `referring_domain_count` per snapshot (COALESCE 0) |
| `POST` | `/api/backlinks/ingest/scheduled` | Updated: INSERT now persists all 9 columns (new_count=0, lost_count=0, referring_domain_count=0 for v1) |

All new routes are tenant-scoped (require `clientId` query param, resolved via `resolveAndValidateClientId`).

---

## UI

Two new sections were added to the **Backlinks** tab in `AuthorityEnginePage.tsx`, between the sparkline card and the Ingestion History toggle:

### 1. Historical Trend Analysis
- Renders when `trendPeriods.length > 0` (requires at least one snapshot).
- Three cards side-by-side (responsive grid): **7-Day**, **30-Day**, **90-Day**.
- Each card shows: Authority Δ, Backlinks Δ, Opps Δ, New Links (+N), Lost Links (−N), Referring Domains Δ.
- Direction badge (`↑ up` / `↓ down` / `→ flat`) with colour coding (green / red / slate).
- Snapshot count shown in muted footer text.

### 2. Competitive Benchmark
- Renders when `competitiveSummary` is non-null and has at least the client self-row.
- Table columns: Domain / Name, Authority, Backlinks, Citation Score, Opportunities.
- Client's own row is highlighted in electric blue (`#38BDF8`) with a bordered highlight.
- Competitor rows alternate subtle backgrounds.
- Empty-state message shown when no competitor data is available yet.
- "No competitor data" graceful empty state shown until first discovery run.

---

## Tests

| Suite | File | Tests | Result |
|---|---|---|---|
| C8R-9 History Analytics | `src/lib/__tests__/backlink-c8r9-history.test.ts` | 23 | ✅ PASS |
| C8R-10 Hardening | `src/lib/__tests__/backlink-c8r10.test.ts` | 29 | ✅ PASS |
| C8R-9 Scheduler | `src/lib/__tests__/backlink-c8r9.test.ts` | varies | ✅ PASS |
| Full frontend backlink suite | `src/lib/__tests__/backlink-*` | 305+ | ✅ PASS |
| API server backlink suite | `src/__tests__/backlink-*` | 113 | ✅ PASS |
| GBP schema-drift | — | 2 | ✅ PASS |

### New Test Coverage (C8R-9 history, 23 tests)

1. `BacklinkScoreSnapshot` — new fields accepted, default to 0, independent.
2. `computePeriodSummaries` — empty array → empty result.
3. `computePeriodSummaries` — single snapshot → flat direction, 0 deltas.
4. `computePeriodSummaries` — custom periodDays count and labels.
5. `computePeriodSummaries` — rising authority → `up` direction.
6. `computePeriodSummaries` — falling authority → `down` direction.
7. `computePeriodSummaries` — flat authority → `flat` direction.
8. `computePeriodSummaries` — 30-day delta > 7-day for steady growth.
9. `computePeriodSummaries` — backlinkDelta correct for 3-snapshot window.
10. `computePeriodSummaries` — referringDomainDelta correct.
11. `computePeriodSummaries` — opportunityDelta correct.
12. `computePeriodSummaries` — newBacklinks sums only post-baseline snapshots.
13. `computePeriodSummaries` — baseline's newCount excluded from sum.
14. `computePeriodSummaries` — zero new/lost for v1 placeholder data.
15. `computePeriodSummaries` — snapshotsInWindow = baseline + N post-baseline.
16. `computePeriodSummaries` — snapshotsInWindow = 1 for single snapshot.
17. `computePeriodSummaries` — fallback to oldest when none predate cutoff.
18. `computeBacklinkScoreTrend` — EMPTY_TREND for empty input (backward compat).
19. `computeBacklinkScoreTrend` — scoreDelta unaffected by new fields.
20. `computeBacklinkScoreTrend` — peakScore/avgScore unaffected by new fields.
21. `BacklinkScoreSnapshot` — newCount + lostCount are independent fields.
22. `computePeriodSummaries` — referringDomainDelta negative when declining.
23. `computePeriodSummaries` — correct periodDays labels for 14d and 60d.

---

## TypeScript Status

| Package | Command | Result |
|---|---|---|
| `lib/db` | `tsc --build` | ✅ 0 errors |
| `api-server` | `tsc --noEmit` | ✅ 0 errors |
| `ai-edge-solutions` | `tsc --noEmit` | ✅ 0 errors (2 pre-existing `ReferralProgram` unrelated to this phase) |

---

## Documentation Updated

- `docs/C8R-9-implementation-report.md` — this document
- `.agents/memory/MEMORY.md` — C8R-9 Historical Analytics entry added
- `.agents/memory/c8r9-historical-analytics.md` — full topic file with design decisions

---

## Updated Completion %

| Phase | Status | Completion |
|---|---|---|
| C8R-1 Backlink schema + repository | ✅ Complete | 100% |
| C8R-2 Opportunity pipeline | ✅ Complete | 100% |
| C8R-3 Opportunity scoring | ✅ Complete | 100% |
| C8R-4 Opportunity management | ✅ Complete | 100% |
| C8R-5 AI Visibility Engine | ✅ Complete | 100% |
| C8R-6 Backlink API routes | ✅ Complete | 100% |
| C8R-7 Provider registration | ✅ Complete | 100% |
| C8R-8 Provider readiness | ✅ Complete | 100% |
| C8R-9 (original) Scheduler + History | ✅ Complete | 100% |
| C8R-9 Historical Trends & Competitive | ✅ Complete | 100% |
| C8R-10 v1 Acceptance & Hardening | ✅ Complete | 100% |

**Overall Backlink Engine v1: 100% complete — GO status declared in C8R-10.**

---

## Recommended Next Phase

**C8R-11 — DataForSEO Live Data Integration (Phase 2 Provider)**

The v1 backlink engine uses honest `authority_score=0`, `new_count=0`, `lost_count=0` placeholders throughout because the DataForSEO credentials and live API access are not yet wired. C8R-11 should:

1. Wire DataForSEO credentials via environment secrets.
2. Implement `fetchBacklinkDiff(domain, since)` in the DataForSEO adapter — compares current vs. previous crawl to populate `new_count` / `lost_count`.
3. Populate `authority_score` from DataForSEO domain rating on every ingest run.
4. Populate `referring_domain_count` from DataForSEO referring domains count.
5. Surface non-zero values in the Historical Trend Analysis cards and Competitive Benchmark table.
6. Add a `GET /api/backlinks/history/trend?clientId=X&periods=7,30,90` query-param override for the period window sizes.
