# C9R-6 Session Handoff — Review Intelligence Tenant Safety

**Completed:** 2026-07-20
**Phase:** C9R-6 (final AI Visibility V1 implementation phase)
**Prior phase:** C9R-5 (scheduled monitoring, commit 93b8fe9 + 6c5b51a)

---

## What Was Done

Replaced the `adaptTenantSafeReviews(null)` hardcode in `AiVisibilityExecutionService`
with a real tenant-safe review import pipeline. AI Visibility V1 is now at 100%.

### New files

| File | Purpose |
|---|---|
| `lib/db/src/schema/tenant-safe-reviews.ts` | Drizzle table definition; upsert key `(client_id, platform, geography)` |
| `lib/db/src/tenant-safe-review-types.ts` | `ReviewImportResult` discriminated union, `ReviewImportSummary`, `TenantSafeReviewRepository` interface, `computeTargetReviewCount()`, `TENANT_SAFE_REVIEW_TARGET_COUNT_V1 = 50` |
| `lib/db/src/tenant-safe-review-repository.ts` | `DrizzleTenantSafeReviewRepository` — `upsert()` + `findByClientId()` |
| `artifacts/api-server/src/lib/gbp-review-summary-importer.ts` | `GbpReviewSummaryImporter` — ownership-gated, sources from `review_platform_stats` |
| `artifacts/api-server/src/__tests__/ai-visibility-c9r6-coverage.test.ts` | 13 tests: adapter + read-model composition |
| `artifacts/api-server/src/__tests__/gbp-review-summary-importer.test.ts` | 8 tests: importer behavioral coverage |

### Modified files

| File | Change |
|---|---|
| `lib/db/src/schema/index.ts` | `export * from "./tenant-safe-reviews"` |
| `lib/db/src/index.ts` | Phase C9R-6 exports added |
| `lib/db/src/ai-visibility-read-model-types.ts` | `AiVisibilityCoverageStatus` += `"provider_error"` |
| `lib/db/src/ai-visibility-read-model.ts` | `normalizeCoverage` `statusOrder` includes `provider_error: 3` |
| `lib/db/src/ai-visibility-read-model-adapters.ts` | `adaptReviewImportResult()` added; `ReviewImportResult` import moved to top |
| `artifacts/api-server/src/lib/schema-migrate.ts` | C9R-6 DDL: `tenant_safe_review_summaries` + two indexes |
| `artifacts/api-server/src/lib/ai-visibility-execution-service.ts` | Replaced `adaptTenantSafeReviews(null)` with `GbpReviewSummaryImporter` + `adaptReviewImportResult()` |
| `artifacts/api-server/src/__tests__/ai-visibility-execution.test.ts` | Test updated: `not_tenant_safe` → `not_connected` for reviews |
| `artifacts/ai-edge-solutions/src/components/AiVisibilityReadModelView.tsx` | `RMCoverageStatus` += `"provider_error"`; `getCoverageStatusConfig` case added (red #EF4444, label "Provider Error", icon "⚠") |
| `artifacts/ai-edge-solutions/src/__tests__/ai-visibility-read-model.test.tsx` | Test added: `getCoverageStatusConfig("provider_error")` returns red + correct label |
| `docs/AI-VISIBILITY-V1-ROADMAP.md` | C9R-6 marked complete, 100% |
| `docs/AI-EDGE-OS-MASTER-ROADMAP.md` | V1 marked complete, C9R-7 noted |
| `docs/AI-VISIBILITY-ARCHITECTURE.md` | Adapter table + coverage status table updated |

---

## Architecture Decisions

### Data source: review_platform_stats, not live GBP API
- `review_platform_stats` is already tenant-scoped (`client_id` column)
- The `client_id <> 'default'` guard in the SQL query prevents legacy unclaimed rows from leaking
- The GBP connection check (`social_connections WHERE userId + provider=google_business`) acts as an ownership gate
- No live GBP API calls → safe for test environments and high-frequency scheduler runs

### Coverage state mapping
- `disconnected` / `unauthorized` → `not_connected` (existing status)
- `provider_error` → new `"provider_error"` status (additive to `AiVisibilityCoverageStatus`)
- `not_tenant_safe` is never emitted by the C9R-6 path

### V1 target review count = 50
- `TENANT_SAFE_REVIEW_TARGET_COUNT_V1 = 50` in `tenant-safe-review-types.ts`
- Pure function `computeTargetReviewCount()` — no I/O, no side effects
- Future phases can add per-category or per-geography targets without changing the interface

---

## Test results
- C9R-6 coverage tests: 13/13 ✅
- GBP importer tests: 8/8 ✅
- Execution service tests (updated): 14/14 ✅
- `lib/db tsc --build`: clean ✅
- `api-server tsc --noEmit`: clean ✅
- `ai-edge-solutions tsc --noEmit`: clean (pre-existing ReferralProgramPage error unchanged) ✅

---

## What Is Next

**C9R-7 — AI Visibility V1 Release Acceptance** (not a feature phase).

This is a validation/documentation phase covering:
- End-to-end smoke test of the read model in production
- ADR for V1 architecture decisions (if not already captured in architecture doc)
- Any final cleanup or acceptance sign-off before marking V1 production-ready
