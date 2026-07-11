---
name: Phase B2.1 Registry Typed Failures
description: Removal of silent static-registry fallback; typed failure reasons; bootstrap promise; route status codes.
---

## What changed

The silent fallback `return buildContextFromRecords(clientRow, snapshot)` (no providerOverride) in `client-resolver.ts` was removed. Every non-success path in `resolveClientContentContextFromDb` now returns a typed `ClientResolveResult` failure reason.

## Failure reason mapping (authoritative)

| RegistryLoadResult reason | ClientResolveResult reason   | HTTP status |
|--------------------------|------------------------------|-------------|
| `no_services`            | `registry_not_configured`    | 422         |
| `invalid_registry`       | `registry_invalid`           | 422         |
| `db_error`               | `registry_unavailable`       | 503         |

GET settings and POST generate both implement this mapping. GET suggestions and the settings fallback (second resolve call in GET settings) degrade gracefully to DEFAULT values — they are read-only and do not block the user on registry failure.

## Bootstrap readiness promise

`registryBootstrapReady: Promise<void>` is exported from `service-registry-loader.ts`. It resolves in the IIFE's `finally` block (always resolves — never hangs). `loadClientServiceRegistry` awaits it before any DB query. This eliminates the race where a request could arrive before tables were created.

**Why:** The IIFE is fire-and-forget; without the promise, a request arriving during table creation would get a `db_error` (table not found) rather than a seeded-and-ready result.

## validateRegistryRows location

Lives in `lib/db/src/registry-validator.ts` (NOT in service-registry-loader.ts) so tests can import it without triggering the IIFE side effects or requiring a DB connection. Exported from `lib/db/src/index.ts` and imported by service-registry-loader.ts via `@workspace/db`.

Checks: missing serviceId, missing displayName, duplicate service_key, invalid status value.

## bbbRegistryProvider production call sites (post B2.1)

- `service-registry-loader.ts` IIFE — `bbbRegistryProvider.getSystemBusinessRules()` — seed-time parity oracle ONLY. Never reached by live requests.
- `client-context.ts` — `const registry = registryOverride ?? bbbRegistryProvider` in `buildClientContentContext` — never reached in production; providerOverride is always passed by resolver OR resolver returns a typed failure before calling buildContextFromRecords.
- `client-context.ts` — `resolveServiceRegistryProvider` → returns `bbbRegistryProvider` — never reached in production after B2.1.

**How to apply:** If a new caller of `resolveClientContentContextFromDb` is added, it must handle ALL 6 failure reasons in `ClientResolveResult`. No implicit fallback to any static provider is allowed.

## Test file

`artifacts/ai-edge-solutions/src/lib/__tests__/registry-validator-b2-1.test.ts` — 39 tests:
- T-B2-1-V1 through V9: validateRegistryRows behavior
- T-B2-1-M: reason mapping contract
- T-B2-1-CA: consumer audit + parity + Lakeside isolation
- T-B2-1-SAFETY: keyword safety rails (code-level, not DB-configurable)
- T-B2-1-AUTOPILOT: autopilot gate unchanged

## Stale display name bug fixed

`db-service-registry-provider.test.ts` TEST_TOPICS and DISPLAY_NAMES had `"Mosquito Treatment"` but BBB_SERVICES uses `"Mosquito Control"`. Fixed in both places.
