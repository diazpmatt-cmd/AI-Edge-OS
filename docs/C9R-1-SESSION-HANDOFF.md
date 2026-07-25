# C9R-1 Session Handoff — AI Edge Visibility Assessment

**Date:** 2026-07-19
**Commit:** `e44141e5` (deployed to aiedgesolutions.online)
**Phase completed:** C9R-1 (AI Edge Visibility Assessment)
**Next phase:** C9R-2 (AI Visibility Execution Service & API)

---

## What Was Done in C9R-1

1. Full codebase audit of the AI Edge Visibility engine across schema, persistence, adapters, routes, frontend, tests, and docs.
2. Classified every major capability as COMPLETE / PARTIAL / MISSING.
3. Created architecture documentation at `docs/AI-VISIBILITY-ARCHITECTURE.md`.
4. Created V1 acceptance criteria and implementation roadmap at `docs/AI-VISIBILITY-V1-ROADMAP.md`.
5. Created AI Edge OS Master Roadmap at `docs/AI-EDGE-OS-MASTER-ROADMAP.md`.
6. Confirmed all existing tests pass: 727/728 API tests, 32/32 AI visibility tests. 1 pre-existing failure in `discovery-c6.test.ts > T8` (flaky cancellation test, not AI visibility).
7. Confirmed 0 TypeScript errors in both API server and frontend.

---

## The Single Most Important Fact

The C8R-5 read model (`composeAiVisibilityReadModel`) is **fully built and tested** in `lib/db` but is **completely unwired**. It has:
- 6 source adapters
- Full tenant isolation (5 rejection rules)
- Deterministic dual-axis scoring
- Coverage diagnostics
- 60 tests passing

It produces real results from real canonical data — but nothing calls it in the running application. C9R-2 is 100% wiring work, no new design needed.

---

## C9R-2 Starting Point

**Files to create:**
- `artifacts/api-server/src/lib/ai-visibility-execution-service.ts` — collect canonical inputs, call `composeAiVisibilityReadModel`, persist result
- Schema migration addition in `artifacts/api-server/src/lib/schema-migrate.ts` — `ai_visibility_run_results` table
- New route in `artifacts/api-server/src/routes/ai-visibility.ts` — `GET /api/ai-visibility/read-model/:clientId`

**Imports available immediately:**
```typescript
import {
  composeAiVisibilityReadModel,
  adaptLocalPresenceSources,
  adaptDiscoverySources,
  adaptBacklinkSources,
  adaptContentSources,
  adaptTenantSafeReviews,
  adaptConnectedGoogle,
  type AiVisibilityReadModel,
  type ComposeAiVisibilityReadModelInput,
} from "@workspace/db";
```

**Known non-obvious constraints:**
- `adaptTenantSafeReviews(null)` → returns `not_tenant_safe` coverage. Pass `null` for now; this is correct until C9R-6.
- `adaptConnectedGoogle()` needs a `ConnectedGoogleSummary` — construct from `social_connections` row (Google OAuth) where `platform = 'google'`. Mark `searchConsole: "not_implemented"` and `analytics: "not_implemented"`.
- Geography string for BBB client: `"Baldwin County, Alabama"`.
- `scope.activeServiceIds` must be loaded from the service registry for the client — use `resolveServiceRegistryProvider(clientId)` from the Phase B2 layer.
- Execution service must never import schema/db types from `@workspace/db/schema` directly — import from `@workspace/db` (the composite package).

**Pattern to follow:** The C6 DiscoveryExecutionService at `artifacts/api-server/src/lib/discovery-execution-service.ts` is the closest architectural analog.

---

## Test Files to Create for C9R-2

- `artifacts/api-server/src/__tests__/ai-visibility-execution.test.ts`
  - Use `vi.mock("@workspace/db")` pattern (same as route behavioral tests)
  - Test: no client → returns empty read model with coverage `no_observation` for all sources
  - Test: BBB client with local presence data → local_presence source shows `available`
  - Test: tenant mismatch in input → shows in `rejected[]`
  - Test: result persisted to `ai_visibility_run_results`

---

## Current V1 Completion

```
Layer                         | Complete | Notes
------------------------------|----------|-------
C8R-5 pure computation        | 100%     | types, adapters, composer, scorer, fixtures
Persistence                   | 30%      | legacy audit table only; no read-model table
Execution service             | 0%       | C9R-2
API routes (read model)       | 0%       | C9R-2
Frontend (read model)         | 0%       | C9R-3
Real AI query provider        | 0%       | C9R-4
Scheduled monitoring          | 0%       | C9R-5
Review tenant safety          | 0%       | C9R-6
------------------------------|----------|-------
Overall V1                    | ~34%     |
```

---

## Pre-existing Issues (Do Not Fix in C9R-2)

1. `discovery-c6.test.ts > T8` — 1 pre-existing flaky test, not AI visibility.
2. YouTube `invalid_grant` in production — pre-existing, requires manual re-auth.
3. Clerk `pk_test_*` key in production — auth functional, upgrade to `pk_live_*` deferred.
