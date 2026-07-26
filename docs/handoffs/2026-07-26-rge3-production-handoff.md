# Session Handoff — RGE-3 Production Acceptance

**Date:** 2026-07-26  
**Repository:** `diazpmatt-cmd/AI-Edge-OS`  
**Production app:** Coolify application ending in `rkonpoppxacsnlfkqmf6yct6`  
**Domain:** `https://aiedgesolutions.online`

## Current production state

- Main application is deployed through Coolify to the Hetzner server.
- Homepage and `/admin/referrals` are reachable.
- Referral dashboard loads all nine tabs:
  - Overview
  - Programs
  - Invitations
  - Referrals
  - Payouts
  - Fraud Review
  - Reporting
  - Attribution
  - Readiness
- The Bed Bugs & Beyond tenant resolves correctly.
- A zero-dollar service-credit referral program named `Test` was created successfully.
- RGE-3 functional acceptance is complete.

## Root cause resolved

The Referral API returned:

```json
{"error":"client_not_found","reason":"not_found"}
```

The database client row was temporarily associated with the browser-side Clerk user object ID instead of the authoritative identity inside the bearer token.

The API correctly uses the JWT `sub` claim. Clerk IDs are case-sensitive.

Authoritative production tenant identity:

```text
user_3FKEVWfSuyNsJz3oQ9kPH5nzKDm
```

The `clients.user_id` value for `bed-bugs-and-beyond` now exactly matches that JWT subject.

## Verification completed

The following were independently verified:

1. GitHub `main` and Coolify deployed the intended commits.
2. The live API image contains the parameterized PostgreSQL client lookup and masked diagnostic.
3. The running API container connects to the expected PostgreSQL database.
4. The active Bed Bugs & Beyond row exists in that database.
5. Web/Nginx resolves `api` to the current API container address.
6. The bearer token `sub` value matches `clients.user_id` exactly.
7. Referral program creation succeeds in the production UI.

## Permanent recovery runbook

Use:

```text
docs/runbooks/clerk-client-identity-recovery.md
```

Key rule: for tenant matching, trust the JWT `sub` claim—not `window.Clerk.user.id`, email address, profile display, or assumptions based on an older Clerk account.

Reconnect/sign-out and sign-in is an early recovery step when Clerk session behavior appears stale or contradictory.

## Current safety posture

Keep these controls unchanged until a later acceptance stage explicitly authorizes activation:

```text
SCHEDULER_ENABLED=false
REFERRAL_SCHEDULER_ENABLED=false
AI_VISIBILITY_SCHEDULER_ENABLED=false
REFERRAL_DELIVERY_ENABLED=false
REFERRAL_DELIVERY_MODE=dry_run
REFERRAL_DELIVERY_EMERGENCY_STOP=true
```

No live referral messages, payouts, rewards, or CRM writes are authorized.

## Clerk status

The application is still using Clerk development/test credentials copied from the prior environment.

This supports functional/provisional testing but is not final production authentication acceptance. Production `pk_live_` and `sk_live_` credentials remain a later task after the old Replit domain/integration conflict is fully resolved.

## Cleanup item

The temporary `[CLIENT-LOOKUP]` masked diagnostic remains in the API bundle. Remove it in a dedicated cleanup PR after the next stable acceptance checkpoint.

## Roadmap status

- RGE-1–2 accepted: 25%
- RGE-3 accepted: 37.5%
- RGE-4 target: 50%
- RGE-5 target: 62.5%
- RGE-6 target: 75%
- RGE-7 target: 87.5%
- RGE-8 target: 100%

## Next session

Start by reviewing this handoff and the identity recovery runbook.

Recommended next work:

1. Confirm the exact RGE-4 acceptance criteria from the roadmap or project documentation.
2. Preserve all current safety controls.
3. Execute RGE-4 in small, testable increments.
4. Avoid new production shell/database changes unless a verified acceptance requirement demands them.

## Working style

The user prefers the assistant to perform repository investigation, code changes, PR management, CI follow-up, and technical diagnosis directly whenever tools allow it. Minimize manual terminal steps. When a manual action is unavoidable, provide one command or one screen action at a time and explicitly identify whether the prompt is the server shell, API container, web container, browser console, or SQL client.
