---
name: Phase B1 client resolver
description: canonical clients table, DB-backed context resolution, tenant isolation — Phase B1 of AI Edge OS multi-client foundation
---

## What was built

**New table**: `clients` (bootstrapped via raw SQL in `client-resolver.ts` — same pattern as `integration_health_history` in `diagnostics.ts`). Schema: `id, user_id (UNIQUE), slug (UNIQUE), client_name, industry, industry_label, region, service_areas (JSON text), timezone, is_active, created_at, updated_at`.

**Migration file**: `lib/db/migrations/0003_b1_clients_table.sql` — idempotent `CREATE TABLE IF NOT EXISTS` + BB&B backfill from auto_content_settings.

**Pure resolution layer** (lib/db/src/client-context.ts):
- `BBB_CLIENT_SLUG = "bed-bugs-and-beyond"`
- `ClientRecord` type (re-exported from schema/clients.ts)
- `SettingsSnapshot` interface (subset of auto_content_settings columns)
- `RegistryResolveResult` type
- `ClientResolveResult` type
- `resolveServiceRegistryProvider(client)` — single place slug→provider mapping lives
- `buildContextFromRecords(client, settings | null)` — pure function, no DB

**DB resolver** (artifacts/api-server/src/lib/client-resolver.ts):
- IIFE bootstrap: creates clients table + BB&B backfill on server start
- `resolveClientContentContextFromDb(userId)` — fetches clients + settings rows, calls `buildContextFromRecords`
- Lives in api-server (NOT lib/db) to avoid circular import through `lib/db/src/index.ts`

**Route integration** (auto-content.ts read paths only):
- GET /auto-content/settings: no-settings-row path uses resolver; unknown tenant returns 404 `{error:"no_client_configured"}`; settings-row path uses resolver for fallback service areas/topics
- GET /auto-content/suggestions: three `DEFAULT_SERVICE_AREAS`/`DEFAULT_TOPICS` references replaced with resolved context fallbacks
- NOT modified: generate, PUT, pause, resume handlers

## Key design decisions

**Why resolver in api-server not lib/db?**
`lib/db/src/index.ts` exports `db`. If resolver were in lib/db, it would import `db` from `../index`, and `index.ts` would re-export the resolver → circular import. Solution: resolver fetches in api-server, pure logic stays in lib/db.

**Why only BB&B is supported in Phase B1?**
`resolveServiceRegistryProvider` returns `{ supported: false }` for any slug other than `bed-bugs-and-beyond`. This is the single gate — add new slug→provider mappings there for Phase B2. An unsupported client returns `{ found: false, reason: "unsupported_registry" }`.

**Safety gates preserved:**
- `autopilot_enabled` NOT touched by migration or resolver
- Unknown tenants get 404, never BB&B defaults
- Inactive clients are rejected before any context is built

## Test counts (Phase B1)
- 44 Phase B1 tenant isolation tests (client-resolver.test.ts)
- 116 Phase A2 client-context tests (regression)
- 174 api-server tests (regression)
- 415 web tests (regression)

## Phase B2 checklist
- Add slug→provider mapping in `resolveServiceRegistryProvider`
- Add PUT /auto-content/settings integration (lock-step clients + settings upsert)
- Add POST /clients onboarding endpoint
- Revisit `buildClientContentContext` BB&B-specific defaults for non-BB&B tenants
