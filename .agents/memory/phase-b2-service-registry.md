---
name: Phase B2 DB Service Registry
description: DB-backed ServiceRegistryProvider — architecture, IIFE ordering quirk, readonly arrays, test pattern.
---

## What was built
- `lib/db/src/schema/service-registry.ts` — 3 tables: client_services, client_service_topics, client_registry_rules
- `lib/db/src/db-service-registry-provider.ts` — createDbServiceRegistryProvider factory; operates entirely in-memory (no DB calls at method invocation time)
- `artifacts/api-server/src/lib/service-registry-loader.ts` — bootstrap IIFE (idempotent CREATE TABLE + BB&B seed) + loadClientServiceRegistry(clientId)

## Generic *In() variants in bbb-services.ts
All service-registry algorithms were refactored to accept `readonly BBBService[]` instead of using the global BBB_SERVICES:
- getDefaultTopicsFrom, validateTopicForGenerationWith, normalizeTopicsIn, matchServiceByTopicIn, getServicePromptRulesFor, selectWeeklyServicesFrom

**Why readonly:** Object.freeze() in createDbServiceRegistryProvider returns a readonly array. Functions must accept `readonly BBBService[]` or TypeScript errors TS2345. This is also correct TypeScript (read-only callers accept read-only).

## Wiring in client-resolver.ts
resolveClientContentContextFromDb now:
1. Calls loadClientServiceRegistry(clientRow.id)
2. If services loaded → createDbServiceRegistryProvider → pass as providerOverride to buildContextFromRecords
3. If no services or DB error → fall back to static resolveServiceRegistryProvider (legacy/first-startup path)

buildContextFromRecords in client-context.ts accepts optional `providerOverride?: ServiceRegistryProvider` — when set, skips the slug→provider lookup entirely.

## Tenant isolation gate in auto-content.ts
After auth, resolveClientContentContextFromDb is called. Unknown/inactive/unsupported clients get 403/422 before any AI generation. resolvedRegistry flows into buildClientContentContext as second arg.

## IIFE startup ordering quirk
service-registry-loader.ts is imported BY client-resolver.ts. Both IIFEs run concurrently (async fire-and-forget). On the VERY FIRST startup, the service-registry IIFE may fire before clients table is ready and log a warning. On subsequent restarts it succeeds because clients already exists. Not a bug — first-deploy graceful degradation.

**How to apply:** If logs show "Service registry not yet seeded for bed-bugs-and-beyond — falling back to static provider" after a cold deploy, restart the server once. The seed will succeed on the next startup.

## Safety rules (code-level, non-negotiable)
TOPIC_COMING_SOON_KEYWORDS, TOPIC_DISABLED_KEYWORDS, TOPIC_NOT_GENERATABLE_KEYWORDS are exported constants that apply BEFORE any DB record lookup. They cannot be overridden by DB data. The test suite verifies this for empty providers and Lakeside Plumbing providers.

## Test pattern
80+ vitest assertions in artifacts/ai-edge-solutions/src/lib/__tests__/db-service-registry-provider.test.ts:
- Parity: DB provider built from BBB_SERVICES → identical output to bbbRegistryProvider on every method
- Tenant isolation: Lakeside Plumbing mock provider cannot access BB&B services
- Safety: keyword blocks apply even in empty/foreign-industry providers
- Generic algorithms: *In() variants tested independently of global BBB_SERVICES

Import pattern: relative paths (../../../../../lib/db/src/…) not @workspace/db — consistent with BBB Autopilot tests.
