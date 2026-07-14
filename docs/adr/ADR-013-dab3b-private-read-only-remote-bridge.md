# ADR-013: DAB-3B Private Read-Only Remote MCP Foundation

- Status: Implemented offline; operational activation deferred
- Date: 2026-07-13
- Decision owners: Matthew Diaz (human authority), AI Edge OS architecture
- Task: DAB-3B, specification revision 1

## Context

DAB-2A owns canonical development tasks and authorization. DAB-2B1 persists that model in a tenant-independent store. DAB-2B2 records bounded read-only GitHub evidence. DAB-3A defines pure workload principals, request envelopes, operation policy, and fail-closed decisions. Browser-based ChatGPT Work cannot use a local STDIO process, so a future operational bridge requires a private remote MCP Streamable HTTP resource server.

## Decision

Implement an isolated, offline-tested Streamable HTTP resource-server foundation at a future stable HTTPS `/mcp` resource. Expose exactly five read-only operations: `get_task`, `get_specification_revisions`, `get_authorization_decisions`, `get_verified_git_evidence`, and `get_task_progress` mapped to canonical `get_events`.

The server publishes bounded OAuth protected-resource metadata and accepts only short-lived RS256 JWT access tokens validated against explicitly supplied exact issuer, audience, authorized party, subject, `dab:read` scope, token ID, issued/not-before/expiry times, pinned public verification key, and revocation generation. Verified claims map to a DAB-3A `read_only_automation` workload principal. They never map to Matthew's human authority, and identity is never accepted from tool arguments.

Every call constructs a DAB-3A request envelope and requires an exact active human Scope approval, verified Git evidence, and an allowed DAB-3A policy result. Missing, stale, edited, deleted, ambiguous, expired, revoked, replayed, rate-limited, disabled, or unavailable evidence fails closed.

## Canonical ownership

- DAB-2A owns tasks, specifications, approvals, lifecycle, and events.
- DAB-2B1 owns tenant-independent durable coordination storage.
- DAB-2B2 owns verified GitHub evidence and reconciliation state.
- DAB-3A owns workload principals, request envelopes, operation policy, and decisions.
- DAB-3B authenticates, adapts, rate-limits, transports, and projects. It does not replace or mutate canonical records.

## Replay and idempotency

Add one unapplied tenant-independent bridge request ledger. It atomically claims first use and stores only request-fingerprint, principal-reference, token-ID, nonce, and idempotency-key hashes plus a bounded correlation reference, operation, outcome, creation time, and expiry. Matching retries converge; conflicting idempotency or reused nonces fail closed. Raw tokens, credentials, nonces, request bodies, tool results, arbitrary JSON, customer identity, and unrestricted metadata are prohibited.

## Harmless proof and output boundary

`get_task_progress` returns the current bounded task projection and at most ten existing canonical audit events. It does not record progress, claim or transition work, submit reports, mutate Git/GitHub/files, or change application/customer state. All tools have closed schemas, read-only/non-destructive annotations, bounded results, and redacted errors.

## Operational separation

The repository includes an inactive Vercel-compatible entrypoint and routing configuration only. Importable modules read no environment variables and open no connections. Separate attributable authorization is required for database provisioning, migration execution, OAuth configuration, credentials/public keys, hosting/domain/TLS/deployment, ChatGPT Work app/plugin creation and installation, workspace policy, and runtime activation. Approval for one prerequisite never authorizes another.

## Consequences and tradeoffs

The design works with browser-based ChatGPT Work after later private hosting and plugin configuration while preserving DAB ownership and fail-closed policy. The cost is additional operational setup and a tenant-independent security ledger. Until those prerequisites are separately completed, DAB-3B is code only and not an operational bridge.

## Explicit exclusions

No local STDIO transport, unrestricted shell/Git/filesystem/SQL/database/network tool, customer authentication/data/database, application API change, GitHub write, task/workflow mutation, deployment, credential activation, plugin installation, paid provider, Growth Engine work, customer-facing behavior, autonomous execution, or DAB-3C is included.
