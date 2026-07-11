---
name: lib/db TypeScript declarations
description: lib/db is composite+emitDeclarationOnly; must rebuild after schema/bbb-services changes or api-server tsc sees stale types
---

`lib/db` is configured with `"composite": true, "emitDeclarationOnly": true, "outDir": "dist"` in its `tsconfig.json`. When TypeScript project references are used (api-server references lib/db), the consuming package resolves types from the compiled `dist/*.d.ts` files, not directly from source.

**The rule:** After adding new columns to the drizzle schema OR new exported functions to `bbb-services.ts`, run:
```
pnpm --filter @workspace/db exec tsc --build
```
Without this, `api-server` tsc will see stale types: missing exports (TS2305) and missing column properties (TS2339).

**Why:** Found during July 2026 security audit. After adding `createWeeklyPlanId`, `selectWeeklyServices`, `weeklyPlanId` column, `autopilotEnabled` column (all in a prior session), the api-server typecheck reported 19 errors. Running `tsc --build` on lib/db cleared all 19 in one step.

**How to apply:** Add a reminder in any task that modifies `lib/db/src/schema/*.ts` or `lib/db/src/bbb-services.ts` to rebuild lib/db before running api-server typecheck.
