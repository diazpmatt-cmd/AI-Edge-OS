# ADR-011: DAB-2B2 Read-Only GitHub Reconciliation

- Status: Accepted for DAB-2B2 implementation
- Date: 2026-07-13
- Decision owners: Matthew Diaz; AI Edge OS architecture workflow
- Related: ADR-008, ADR-009, ADR-010, GitHub Issue #18

## Context

DAB-2A owns the pure canonical development-control model and DAB-2B1 owns its tenant-independent durable PostgreSQL store. GitHub contains authoritative source records for repositories, numeric actors, issues, comments, reviews, pull requests, commits, refs, check runs, and commit statuses, but mutable GitHub fields are not canonical authorization or task state.

## Decision

DAB-2B2 adds a separate pure `@workspace/development-control-github` package and four additive tenant-independent reconciliation tables. A caller supplies the read-only transport, clock, identity policy, and durable store. Package import performs no environment access, credential discovery, or network work.

The adapter normalizes bounded observations, hashes transient content, preserves immutable evidence versions, and reconciles them deterministically. It validates attributable approval evidence but never invokes DAB-2A approval, lifecycle, claim, milestone, completion-report, Git, deployment, or external-action mutations.

## Source ownership

- DAB-2A remains canonical for task specifications, authorization, lifecycle, claims, events, milestones, idempotency, and completion reports.
- DAB-2B1 remains canonical for durable development-control storage.
- GitHub is authoritative only for GitHub-owned source observations.
- Issue bodies, forms, labels, assignees, issue state, mutable selections, and agent statements are proposals, never approval evidence.

## Identity and attribution

Human authority is pinned to an allowlisted stable numeric repository ID plus Matthew Diaz's separately approved stable numeric GitHub actor ID. Login is bounded display context only. A renamed login with the same actor ID can remain attributable; a copied login with a different actor ID fails closed. Only authoritative issue comments and pull-request reviews can carry approval evidence, and they must bind exactly to task ID, revision, specification hash, full expected SHA, and each independent category.

## Determinism and persistence

Observation fingerprints cover repository ID, object type, stable object ID, authoritative update time, and bounded content hash. Evidence is ordered by update time, object type, numeric object ID, and fingerprint. Exact replay is idempotent; conflicting reuse fails closed. Edited or deleted observations create immutable versions instead of overwriting history.

The additive migration creates only `development_github_identities`, `development_github_evidence`, `development_github_reconciliation_cursors`, and `development_github_reconciliation_runs`. Accepted evidence, run state, and cursor advancement share one repository transaction. Partial failure cannot advance the cursor.

## Rate limits and availability

Conditional reads and ETags are caller concerns expressed through the read-only contract. Primary and secondary limits, Retry-After/reset observations, bounded deterministic backoff, retry time, lag, and source unavailability produce explicit diagnostics. They never fabricate approval or advance past unprocessed evidence.

## Security boundaries

- No raw response bodies, webhook payloads, full comments, transcripts, headers, tokens, environment values, stack traces, arbitrary errors, or unrestricted metadata are stored.
- No `clientId`, customer tenant, customer schema, customer credential, customer `DATABASE_URL`, Growth Engine data, or customer retention coupling enters this control-plane boundary.
- The public client contract exposes only bounded `GET` and `HEAD` observations and no GitHub mutation method.
- No database is provisioned and the migration is not executed during bounded verification.

## Consequences and deferred work

DAB-2B2 provides deterministic read-only evidence reconciliation and a durable cursor/run boundary. It does not install a GitHub integration, webhook, App, Action, scheduler, worker, API, UI, hosted runtime, MCP server, or operational bridge. Automated authorization/execution and all GitHub writes remain prohibited. Direct ChatGPT/Codex communication remains deferred to DAB-3.
