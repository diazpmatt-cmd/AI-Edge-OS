---
name: ClientContentContext multi-tenant abstraction (Phases A1 + A2)
description: ServiceRegistryProvider interface + bbbRegistryProvider shim + generate route context plumbing, Phase A2 test suite, array-copy correctness rule.
---

## What was built

`lib/db/src/client-context.ts` — new file, exported from `lib/db/src/index.ts`.

Key exports:
- `ServiceRegistryProvider` interface — abstraction over a client's service registry (8 methods)
- `bbbRegistryProvider` — concrete shim delegating to bbb-services.ts (zero new behavior)
- `ClientContentContext` interface — canonical config carrier for content generation
- `BBB_DEFAULT_SERVICE_AREAS`, `BBB_REGION` — single source of truth for BB&B geography
- `DEFAULT_TONE_STYLE`, `DEFAULT_POST_ANGLES` — canonical defaults
- `buildClientContentContext(PartialClientConfig | null, registryOverride?)` — builds context with BB&B-safe defaults
- `buildSystemPrompt(context)` — identical output to pre-Phase-A1 for BB&B

## Array-copy rule — CRITICAL (found by Phase A2 tests)

`buildClientContentContext` **must spread-copy every array field** (`serviceAreas`, `topics`, `toneStyle`, `postAngles`, `postingTimes`, `platforms`).

**Why:** If the context returns `BBB_DEFAULT_SERVICE_AREAS` by reference and a caller mutates `ctx.serviceAreas.push(...)`, the shared module-level constant is corrupted — affecting all subsequent builds in the same process (including vitest's in-process runner).

**How to apply:** Any new array field added to `buildClientContentContext` must use `[...source]` spread, not the raw reference.

## BB&B system prompt reference (Phase A2 canonical snapshot)

`buildSystemPrompt(buildClientContentContext(null))` must produce the exact string in `BBB_EXPECTED_SYSTEM_PROMPT` inside `client-context.test.ts`. Key markers:
- Opens: `"You are a local pest control social media copywriter for Bed Bugs & Beyond, serving the Gulf Coast of Alabama (Baldwin County)."`
- Em dash U+2014 in the targeted-treatment rule
- Ends with `"Fumigation content must remain at awareness/educational level only"` — no trailing newline

## BB&B identity invariants (never change without QA)

- `context.clientName` default = `"Bed Bugs & Beyond"`
- `context.region` default = `"Gulf Coast of Alabama (Baldwin County)"` (`BBB_REGION`)
- `context.industryLabel` default = `"pest control"` (from `"pest_control"`)
- `bbbRegistryProvider.getSystemBusinessRules()` returns the exact BB&B BUSINESS RULES block

## Phase boundary

Phase A1: generate route only. GET/PUT/pause/resume handlers unchanged — still use hardcoded `"Bed Bugs & Beyond"` and `DEFAULT_SERVICE_AREAS`. Intentional: a `clients` table doesn't exist yet.

Phase B entry point: add `clients` table → load config from DB → replace all four remaining handlers with context-driven logic. Do NOT begin Phase B automatically.

## Test file

`artifacts/ai-edge-solutions/src/lib/__tests__/client-context.test.ts` — 116 tests, 8 groups (T-A2-1 through T-A2-8). Run with:
```
cd artifacts/ai-edge-solutions && pnpm exec vitest run --config vitest.config.ts src/lib/__tests__/client-context.test.ts
```

## Why

Pre-Phase-A1: bbb-services.ts is BB&B-specific; generate route hardcodes BB&B identity. The abstraction layer lets future clients plug in a `ServiceRegistryProvider` without touching generate route logic.
