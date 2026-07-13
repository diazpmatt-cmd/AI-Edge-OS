# ADR-010: DAB-2B1 Tenant-Independent Durable Coordination Store

- Status: Accepted for DAB-2B1 implementation
- Date: 2026-07-13
- Decision owners: Matthew Diaz; AI Edge OS architecture workflow
- Related: ADR-008, ADR-009, GitHub Issues #15 and #16

## Context

DAB-1 established attributable GitHub governance contracts. DAB-2A added the canonical pure task specification, authorization, lifecycle, claim, audit-event, milestone, idempotency, and completion-report model in `lib/development-control`. Its in-memory store proves behavior but cannot survive restart or coordinate multiple processes.

Development coordination is an internal control-plane concern. It is not customer data and must not share customer tenant identity, schemas, credentials, retention rules, or the `lib/db` import boundary. The DAB-2B audit on Issue #15 compared PostgreSQL, SQLite, GitHub Issues, repository files, and object/event storage.

## Decision

DAB-2B1 adds a separate `lib/development-control-store` package backed by PostgreSQL. `lib/development-control` remains the pure canonical model and exposes a repository contract that supports both the synchronous reference in-memory store and an asynchronous durable store.

The production boundary is a dedicated tenant-independent PostgreSQL control-plane database with a least-privilege role. The implementation never reads environment variables at import time. Configuration is explicit caller input, and sensitive connection values are never included in errors, fixtures, reports, logs, or committed files.

This phase defines schema, migration, store, and bounded factory code only. It does not provision a database, obtain credentials, or execute a migration against a live or hosted database.

## Canonical ownership

- DAB-2A pure types, deterministic hashes, validation, authorization categories, lifecycle transitions, claims, events, milestones, and report bounds remain canonical.
- The PostgreSQL package persists those records; it does not redefine their meaning.
- Development-control tables contain no `clientId`, tenant ID, customer foreign key, customer record, or customer credential.
- `lib/db` remains the customer/Growth Engine database package and is not imported by DAB-2B1.

## Durable model

The additive migration creates exactly:

1. `development_tasks`
2. `development_task_specifications`
3. `development_actor_identities`
4. `development_authorization_decisions`
5. `development_task_claims`
6. `development_audit_events`
7. `development_milestones`
8. `development_completion_reports`
9. `development_idempotency_records`

Task specifications, authorization decisions, audit events, milestone observations, and completion-report submissions retain immutable history. Current task, claim, milestone, and report projections remain versioned and queryable. Audit events use a monotonic per-task sequence; a cryptographic hash chain is deferred.

## Transaction and concurrency rules

Every mutation atomically commits:

- the current projection change;
- the append-only audit event; and
- the operation/task-scoped idempotency result.

The durable store uses PostgreSQL transactions, task row locks, optimistic versions, lease versions, and transaction-scoped advisory locks for idempotency keys. A reused key with a different fingerprint fails closed. PostgreSQL server time governs durable lease creation, renewal, expiry, and recovery. Active leases cannot be stolen.

Any validation, serialization, version, persistence, or finalization failure rolls back the complete mutation.

## Authorization and identity

All ten DAB-2A authorization categories remain independent. Approval remains bound to exact task ID, specification revision, specification hash, expected SHA, category, deciding actor, decision, and expiry. DAB-2B1 preserves the existing DAB-2A actor, recovery, transition, and report-submission policy rather than silently expanding it.

Actor snapshots are bounded development-control evidence. They cannot carry customer identity. GitHub identity reconciliation is not performed in this phase.

## Configuration and secret boundary

- Importing the package reads no environment variable and opens no connection.
- A caller must explicitly provide a PostgreSQL connection string to the runtime factory.
- Configuration failures are bounded and never echo the supplied value.
- Runtime, migration, and support roles should be separate when infrastructure is later approved.
- No live credential or hosted database is required for bounded DAB-2B1 verification.

## Consequences

Positive:

- DAB-2A behavior gains a durable, transactional implementation path without contaminating customer systems.
- Immutable history, restart persistence, optimistic concurrency, leases, ordering, and replay safety have explicit storage contracts.
- PostgreSQL offers established backup, point-in-time recovery, and operational tooling for a future control-plane service.

Tradeoffs:

- PostgreSQL integration tests require a separately authorized disposable test database; pure, TypeScript, schema, migration, and no-credential tests do not.
- The store package adds Drizzle/PostgreSQL dependencies and a dedicated migration lifecycle.
- Hosting, backup targets, retention periods, actor identity hardening, and incident RTO/RPO remain operational decisions.

## Deferred work

- DAB-2B2: read-only GitHub identity/evidence reconciliation, signed webhook inbox, polling recovery, replay, stale-SHA reconciliation, and rate-limit handling.
- DAB-3: bounded authenticated ChatGPT/Codex communication.
- Automated approval, claim, issue mutation, branch creation, commit, push, pull request, merge, deployment, credential use, or other external action.
- Database provisioning, migration execution, hosted runtime, API, UI, scheduler, worker, webhook, GitHub App, GitHub Action, or MCP server.
- Cryptographic event hash chaining.

## Security safeguards

- Fail closed on stale specification, SHA, category, actor, task version, lease version, chronology, or idempotency fingerprint.
- Bound JSON, text, arrays, identifiers, metadata, and reports at both pure and database layers.
- Reject customer identity and sensitive/unrestricted payloads.
- Do not globally block authorized compliance deletion; append-only behavior is a normal repository contract, while database governance may perform separately authorized cleanup.
- Backups, restore drills, retention, encryption, role separation, and monitoring are required before production hosting is approved.
