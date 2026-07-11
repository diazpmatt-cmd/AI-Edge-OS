---
name: BBB Autopilot Foundation
description: Autonomous content generation system for BB&B — architecture decisions, pilot safety gate, and vitest import constraints.
---

## Autonomous Scheduler Safety Gate

BB&B pilot: `auto_content_settings.autopilot_enabled` defaults to `'false'`.
The scheduler's `runAutonomousContentGeneration()` queries `WHERE autopilot_enabled='true'`
so it finds zero tenants and does nothing during the pilot.

**To enable:** Set `autopilot_enabled='true'` and `next_generation_at` in Matthew's settings row.

## WeeklyPlanId Idempotency

`createWeeklyPlanId(userId, date?)` returns a deterministic string per ISO week:
`week-YYYY-WW-{shortId}`. Duplicate scheduler ticks in the same week produce the same
planId, and the scheduler checks for existing posts before generating.

## Campaign Mix

`BBB_DEFAULT_CAMPAIGN_MIX = { revenue: 60, education: 25, trust: 15 }`
For 7 posts/week: 4 revenue + 2 education + 1 trust.

**Why:** Revenue-first maximizes booking/call-generation ROI for a local pest control business.

## Vitest Import Constraint

Tests in `artifacts/ai-edge-solutions` CANNOT use `@workspace/db` as an import.
The Vite/vitest environment doesn't resolve workspace package aliases.
**Use relative paths instead:** `"../../../../../lib/db/src/bbb-services"`.

Top-level `import` statements work; `require()` inside test bodies does NOT in ESM vitest.

## DB Migration Constraint

Drizzle push is blocked by a pre-existing `review_platform_stats` unique constraint.
All schema changes must be applied via `executeSql()` in code_execution, not `drizzle push`.

## Phase Completion

All 12 phases of the spec delivered:
- Status colors: PLATFORM_STATUS_COLORS canonical map enforced everywhere
- DB schema: 6 new columns across 2 tables (raw SQL migration)
- Autonomous scheduler: 30-min tick, idempotent, pilot-safe
- Revenue-first logic: selectWeeklyServices with weighted selection
- Campaign metadata: stored on every generated post
- Platform behavior: documented in code and handoff doc
- First July weekly plan: static display July 14-20, 2026
- Tests: 404/404 passing (52 new in bbb-autopilot-engine.test.ts)
- Docs: CHANGELOG.md + docs/BBB-AUTOPILOT-HANDOFF.md
