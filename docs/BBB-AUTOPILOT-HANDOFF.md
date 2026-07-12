# BB&B Content Autopilot — Foundation Handoff
**Date:** July 11, 2026  
**Client:** Bed Bugs & Beyond (Matthew)  
**Status:** Foundation complete. Pilot-safe. Awaiting first plan approval to enable autonomous generation.

---

## What Was Built

The BB&B Content Autopilot Foundation is a complete, production-grade autonomous content planning and generation system scoped specifically for Bed Bugs & Beyond's Gulf Coast pest control business. It implements the canonical service registry, revenue-first planning logic, full campaign metadata tracking, and an autonomous scheduler ready to be switched on when Matthew approves the first plan.

---

## System Architecture

### Service Registry (`lib/db/src/bbb-services.ts`)

16 canonical services with:
- `revenueWeight` (1–10): how strongly the service drives revenue
- `contentFrequencyWeight` (1–5): how often to post about it
- `campaignGoals[]`: which campaign goals are valid for this service
- `supportedAudiences[]`: which audience segments to target
- `prohibitedClaims[]`: content rules enforced at generation time
- `status`: `active` | `seasonal` | `limited` | `coming_soon` | `disabled`

**Hard blocks (no generation ever):**
- `termites` — coming_soon, not offered
- `wildlife_removal` — disabled
- `heat_treatment` — not a BB&B service; bed bug treatment is targeted/furniture-level, never whole-home heat

**Generatable services (active/seasonal):**
Bed Bug Treatment, Bed Bug Inspection, Cockroach Control, Ant Control, Spider Control, Fumigation, Rodent Control, Moles (low frequency), Mosquito Control, Flea & Tick Control, Commercial Pest Control, Vacation Rental Inspection, Property Manager Inspection

### Campaign Mix (`BBB_DEFAULT_CAMPAIGN_MIX`)
```
Revenue:   60%  →  call_generation, inspection_booking, treatment_booking, outreach goals
Education: 25%  →  homeowner_education, prevention, seasonal_alert
Trust:     15%  →  review_trust, local_visibility
```

For 7 posts/week: 4 revenue + 2 education + 1 trust.

### Status Color System
All service status indicators use the canonical four-state system only:
| State | Color | Hex | Meaning |
|-------|-------|-----|---------|
| READY | Green | `#22C55E` | Active, generatable |
| ACTION_REQUIRED | Yellow | `#F59E0B` | Needs user action |
| BLOCKED | Red | `#EF4444` | Not offered / disabled |
| PENDING | Gray | `#94A3B8` | Coming soon / not yet active |

Never derive colors from service categories or brand colors.

---

## Database Schema

### `social_posts` additions (V5.1)
| Column | Type | Purpose |
|--------|------|---------|
| `generation_run_id` | TEXT | UUID unique per generate call — distinguishes runs in same week |
| `revenue_weight` | TEXT | Registry `revenueWeight` at generation time (snapshot) |
| `urgency` | TEXT | Registry `urgency` at generation time (snapshot) |

### `auto_content_settings` additions (V5.1)
| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `autopilot_enabled` | TEXT | `'false'` | Enables autonomous scheduler — must be explicitly set to `'true'` |
| `generation_day` | TEXT | NULL | Day of week for weekly run (e.g. `'monday'`) |
| `generation_time` | TEXT | NULL | Wall-clock time in America/Chicago (e.g. `'08:00'`) |

**Previously added (V5.0):**
- `weekly_plan_id`, `campaign_goal`, `audience_id` on `social_posts`
- `next_generation_at`, `campaign_mix`, `selected_audiences` on `auto_content_settings`

---

## Autonomous Scheduler

**File:** `artifacts/api-server/src/lib/scheduler.ts`

The scheduler runs three concurrent loops:
1. **Post publisher** — every 60s: publishes any posts whose `scheduled_at <= now()`
2. **Autonomous content generation** — every 30min: generates weekly plans for tenants with `autopilot_enabled='true'`
3. **Missed-call recovery** — every 5min: sends textbacks to unrecovered missed calls

### Autonomous Generation Logic
1. Query: `WHERE autopilot_enabled='true' AND engine_paused IS DISTINCT FROM 'true' AND next_generation_at <= now()`
2. Compute `weeklyPlanId = createWeeklyPlanId(userId)` (deterministic per ISO week)
3. Check idempotency: if any posts with that `weeklyPlanId` exist, skip + advance `nextGenerationAt`
4. Call `POST /api/auto-content/generate` via internal HTTP with scheduler auth headers
5. On success: set `lastGeneratedAt = now()`, `nextGenerationAt = now() + 7 days`

### Auth Bypass
The generate route accepts scheduler calls via:
```
x-scheduler-secret: <SCHEDULER_SECRET env var>
x-scheduler-user-id: <userId>
```
This is the same pattern used by the publish route.

---

## API Endpoints

### `POST /api/auto-content/generate`
Generates a weekly content plan. Now stores on every post:
- `weeklyPlanId` — groups all posts from the same weekly plan
- `generationRunId` — unique per API call (for debugging)
- `campaignGoal` — assigned by 60/25/15 position
- `audienceId` — from service registry
- `revenueWeight` — registry snapshot
- `urgency` — registry snapshot

Default `approvalMode` is now `BBB_DEFAULT_APPROVAL_MODE` = `"approval_required"` (was incorrectly defaulting to `"auto_schedule"` — fixed).

### `POST /api/social-posts/:id/approve` / `/reject` / `/pending-approval`
Approval workflow endpoints. `approve` stores `approvedBy` (Clerk userId) and `approvedAt` timestamp.

---

## First Proposed Weekly Plan

**Week of July 14–20, 2026** — shown in the Content Autopilot page:

| Day | Service | Goal | Audience | Bucket |
|-----|---------|------|----------|--------|
| Mon 7/14 | Bed Bug Treatment | call_generation | Homeowners | Revenue |
| Tue 7/15 | Vacation Rental Inspection | inspection_booking | Vacation Rental Owners | Revenue |
| Wed 7/16 | Cockroach Control | homeowner_education | Homeowners | Education |
| Thu 7/17 | Bed Bug Inspection | inspection_booking | Airbnb Hosts | Revenue |
| Fri 7/18 | Ant & Spider Prevention | seasonal_alert | Homeowners | Education |
| Sat 7/19 | Commercial Pest Control | commercial_outreach | Restaurants | Revenue |
| Sun 7/20 | Community Trust / Reviews | local_visibility | Homeowners | Trust |

To generate this plan as real drafts: click "Generate Weekly Content" in the Content Autopilot page.

---

## Pilot Configuration

The BB&B pilot is intentionally **conservative**:

| Setting | Value | Reason |
|---------|-------|--------|
| `autopilot_enabled` | `'false'` | Scheduler exists but fires for zero tenants until Matthew enables it |
| `approval_mode` | `'approval_required'` | Every post requires explicit approval before scheduling |
| `auto_schedule` | Disabled | No posts published without Matthew's review |

**To enable autonomous weekly generation:**
1. Set `autopilot_enabled = 'true'` in Matthew's `auto_content_settings` row
2. Set `next_generation_at` to the desired first run time (America/Chicago)
3. Optionally set `generation_day` and `generation_time` for display purposes

The system will then generate 7 posts every week automatically, respecting the 60/25/15 mix, idempotency, and approval workflow.

---

## Tests

**404 tests passing** (0 failures) across 10 test files.

New test file: `artifacts/ai-edge-solutions/src/lib/__tests__/bbb-autopilot-engine.test.ts` (52 tests)

Coverage:
- Status colors (1–8): canonical color map, service status adapter
- Weekly plan idempotency (12–13): same week = same planId, different weeks ≠ same planId
- Campaign mix (14–22): 60/25/15 verified, weights verified, moles low-frequency verified
- Service enforcement (23–26): termites/wildlife/heat blocked, fumigation safety rules enforced
- Approval workflow (29): approval_required default, never auto_schedule
- Pilot safety (9–10, 30): autopilot_enabled='false' default, no blind tenant migration

---

## What Is NOT Done (Explicitly Out of Scope for Pilot)

- **Recurring generation: disabled** — infrastructure exists, switch is off
- **YouTube publishing: pending MP4** — draft exists with correct metadata, waiting for real video file
- **Termites content: blocked** — will generate when service is added to BB&B's offerings
- **Wildlife content: blocked** — not offered, hard-blocked in registry and AI prompt rules
- **Full autopilot ("auto_schedule"):** available in the system, not enabled for BB&B until Matthew explicitly enables it

---

## Files Changed (Summary)

| File | Change |
|------|--------|
| `lib/db/src/bbb-services.ts` | Added `selectWeeklyServices`, `createWeeklyPlanId`, `serviceStatusToOperationalState`, `WeeklyServiceSlot` |
| `lib/db/src/schema/social-posts.ts` | Added `generationRunId`, `revenueWeight`, `urgency` |
| `lib/db/src/schema/auto-content.ts` | Added `autopilotEnabled`, `generationDay`, `generationTime` |
| `artifacts/api-server/src/routes/auto-content.ts` | Full campaign metadata on every post, scheduler auth bypass, fixed approvalMode default |
| `artifacts/api-server/src/lib/scheduler.ts` | Added `runAutonomousContentGeneration()` + 30-min tick |
| `artifacts/ai-edge-solutions/src/pages/BBBContentAutopilotPage.tsx` | Status color fixes, first proposed July weekly plan section |
| `artifacts/ai-edge-solutions/src/lib/__tests__/bbb-autopilot-engine.test.ts` | 52 new tests (Phase 11) |
| `CHANGELOG.md` | Phases 1–12 documented |
