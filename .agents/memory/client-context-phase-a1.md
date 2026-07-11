---
name: ClientContentContext Phase A1
description: Multi-client architecture compatibility layer — ServiceRegistryProvider interface + bbbRegistryProvider shim + buildClientContentContext builder.
---

## What was built

`lib/db/src/client-context.ts` — new file, exported from `lib/db/src/index.ts`.

Key exports:
- `ServiceRegistryProvider` interface — abstraction over a client's service registry
- `bbbRegistryProvider` — concrete shim delegating to bbb-services.ts (zero new behavior)
- `ClientContentContext` interface — canonical config carrier for content generation
- `BBB_DEFAULT_SERVICE_AREAS`, `BBB_REGION` — single source of truth for BB&B geography
- `buildClientContentContext(PartialClientConfig | null, registryOverride?)` — builds context with BB&B-safe defaults
- `buildSystemPrompt(context)` — identical output to pre-Phase-A1 for BB&B

## Phase boundary

Phase A1: one registry provider (bbbRegistryProvider, backed by static BBB_SERVICES).
Phase B (future): DB-backed ServiceRegistryProvider + `clients` table. Interface does NOT change.

## BB&B identity invariants (never change without QA)

- `context.clientName` default = "Bed Bugs & Beyond"
- `context.region` default = "Gulf Coast of Alabama (Baldwin County)" (BBB_REGION)
- `context.industryLabel` default = "pest control" (from "pest_control")
- `bbbRegistryProvider.getSystemBusinessRules()` returns the exact BB&B BUSINESS RULES block

## auto-content.ts scope

Only the `POST /auto-content/generate` handler was modified. GET/PUT/pause/resume handlers
are unchanged and still use hardcoded "Bed Bugs & Beyond" defaults — that is intentional
for Phase A1. Phase B will extend those handlers.

## Why

The two pre-Phase-A1 constraints were: (1) bbb-services.ts is a BB&B-specific hardcoded
service registry; (2) AI generation prompts hardcode "Bed Bugs & Beyond" and "Gulf Coast
of Alabama". The compatibility layer introduces the ServiceRegistryProvider interface so
that future clients can plug in without touching the generate route's core logic.
