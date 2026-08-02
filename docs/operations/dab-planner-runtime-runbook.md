# DAB Planner Runtime Operations Runbook

## Purpose

This runbook covers the production planner-only unattended runtime introduced in DAB-5A and made observable in DAB-5B.

The runtime may wake, read canonical development-control state, evaluate readiness, create an immutable plan, and persist leases, cycles, and heartbeats. It may not mutate tasks or lifecycle state, write to Git or GitHub, deploy, call providers, use paid services, access customer systems, or perform external actions.

## Status endpoint

`GET /api/dab/status`

The endpoint returns redacted operational metadata only:

- overall status: `healthy`, `stale`, `blocked`, `disabled`, or `uninitialized`;
- worker enabled state and cadence;
- latest heartbeat timestamp, readiness status, blocker codes, wake-up reason, due slot, next eligibility, and consecutive failure count;
- latest cycle key, completion time, task identifier, operation, stop code, outcome, and plan fingerprint.

It never returns database connection details, activation authorization references, raw task content, credentials, raw heartbeat payloads, or external-system data.

## Status meanings

- `healthy`: latest heartbeat is within three configured intervals and readiness is not blocked.
- `stale`: no heartbeat has been recorded within three configured intervals.
- `blocked`: latest heartbeat exists but DAB-4D readiness is blocked.
- `disabled`: the production worker enable flag is false.
- `uninitialized`: runner tables or a valid heartbeat do not yet exist, or status bounds are invalid.

For the current 60-second cadence, a heartbeat becomes stale after 180 seconds.

## Normal verification

1. Confirm the Coolify application reports `running:healthy`.
2. Request `/api/dab/status`.
3. Confirm `enabled` is `true`.
4. Confirm `status` is `healthy` or a truthful `blocked` state.
5. Confirm `latestHeartbeat.observedAt` advances over time.
6. Confirm `latestHeartbeat.consecutiveFailures` is stable or returns to zero after successful cycles.
7. Confirm the latest cycle, when present, contains only planner output and no mutation evidence.

## Kill switch

To stop planning immediately while preserving the service and audit trail:

1. Set `DAB_PLANNER_KILL_SWITCH=true` on the `dab-planner-worker` service.
2. Redeploy the Compose application.
3. Confirm subsequent heartbeats report `KILL_SWITCH_ACTIVE`.
4. Do not remove or edit prior heartbeat or cycle rows.

To resume:

1. Confirm the reason for the stop is resolved.
2. Set `DAB_PLANNER_KILL_SWITCH=false`.
3. Redeploy.
4. Confirm a fresh heartbeat appears and readiness is not blocked.

## Full disable

To prevent the worker process from entering its loop:

1. Set `DAB_PLANNER_WORKER_ENABLED=false` for both the worker and API services.
2. Redeploy.
3. Confirm `/api/dab/status` reports `disabled`.

Prefer the kill switch for temporary incident response because it preserves explicit stopped heartbeats.

## Stale heartbeat recovery

When status is `stale`:

1. Confirm the Coolify application and `dab-planner-worker` container are running.
2. Inspect worker logs for startup, database, lease, or configuration failures.
3. Confirm PostgreSQL is healthy and `DATABASE_URL` remains available to the worker.
4. Confirm the worker cadence and lease values remain bounded.
5. Restart only the worker service if the process is unhealthy.
6. If restart does not restore heartbeats, activate the kill switch before investigating schema or code changes.
7. Never delete leases, cycles, or heartbeat history as a first response.

## Blocked readiness recovery

When status is `blocked`:

1. Read `latestHeartbeat.blockers`.
2. Resolve the named evidence failure rather than bypassing the readiness gate.
3. Confirm no credential, Git-write, deployment, provider, paid-provider, or external-action capability has been introduced.
4. Redeploy only when configuration or code changed.
5. Confirm the next heartbeat becomes `ready`.

## Rollback

1. Activate the kill switch before rollback when possible.
2. Roll back the Coolify application to the last known-good `main` revision.
3. Confirm the API and web services remain healthy.
4. Confirm the worker is disabled or producing stopped heartbeats.
5. Preserve all DAB runner tables for audit and later diagnosis.
6. Record the rollback reason in the related GitHub issue or incident record.

## Restart safety

The worker uses a bounded PostgreSQL lease. Restarting the service must not create overlapping cycles. A replacement worker may acquire the lease only after expiry or when it is the same runtime owner. Cycle keys remain idempotent per due slot.

## Escalation boundary

Any proposal to add GitHub writes, deployments, provider calls, credentials, customer-system access, paid services, or task/lifecycle mutation is a new authorization phase. It must not be enabled through incident recovery or configuration drift.
