---
name: BBB Autopilot idempotency guard
description: weeklyPlanId guard must fire BEFORE AI calls; absence caused duplicate weekly plan generation
---

The generate endpoint (`POST /api/auto-content/generate`) uses a deterministic `weeklyPlanId` (ISO-week key: `bbb-{userId}-{YYYY}-W{ww}`) to group all posts for a given week.

**The rule:** An early-return idempotency guard must check for existing posts with that `weeklyPlanId` BEFORE any AI generation calls. Without this guard, each scheduler invocation creates a fresh batch of 7 posts — unlimited duplicates within the same week.

**How to apply:**
- Guard position: immediately after `weeklyPlanId` and `generationRunId` are computed, before the `selectWeeklyServices()` call and before `Promise.all()` AI generation
- Query: `WHERE userId = userId AND weeklyPlanId = weeklyPlanId LIMIT 1`
- Response on hit: `{ ok: true, created: 0, skipped: N, reason: "weekly_plan_already_exists", weeklyPlanId }`
- The `return` must be on its own line (separate from `res.json()`) to avoid TS7030 "not all code paths return a value" — do `res.json({...}); return;` not `return res.json({...})`

**Why:** Found during July 2026 security audit dry-run. Second call with same weeklyPlanId created 7 duplicate posts before the guard was in place. After adding the guard, second call returns `created:0, skipped:7` and DB count stays at 7.
