# ADR-012: DAB-3A Pure Offline Bridge Contracts

**Status:** Accepted for bounded implementation
**Date:** 2026-07-13

## Context

DAB-2A owns the canonical development-control specification, authorization, lifecycle, claim, milestone, completion-report, and repository contracts. DAB-2B1 owns their tenant-independent durable PostgreSQL implementation. DAB-2B2 owns read-only GitHub observation normalization and attribution diagnostics.

A future ChatGPT/Codex coordination interface needs a smaller security boundary before any transport, credential, hosted runtime, or live operation is considered. Directly exposing a coordination repository, GitHub adapter, shell, filesystem, database, or network would create a confused-deputy risk and could bypass the independent authorization categories established by DAB-1 and DAB-2A.

## Decision

DAB-3A introduces `@workspace/development-control-bridge`, a pure, offline, protocol-independent policy package. It defines:

- an already-verified workload-principal contract;
- a deterministic request envelope;
- an immutable operation allowlist;
- an explicit per-operation authorization-category matrix;
- pure fail-closed policy evaluation;
- bounded deterministic decisions and reason codes; and
- credential-free fixtures and pure tests.

An `allowed` DAB-3A decision means only that the supplied offline policy evidence satisfies the modeled requirements. It never means an operation was executed.

## Canonical ownership

- DAB-2A remains canonical for task specifications, approval semantics, lifecycle transitions, claims, milestones, completion reports, and the `DevelopmentCoordinationStore` contract.
- DAB-2B1 remains canonical for tenant-independent persistence, transactions, concurrency, idempotency, leases, and append-only history.
- DAB-2B2 remains canonical for read-only GitHub observations, stable numeric attribution, stale/force-push diagnostics, reconciliation, and bounded GitHub evidence.
- DAB-3A does not import the DAB-2B1 runtime or DAB-2B2 provider adapter and does not create a competing canonical model.

## Workload identity boundary

`BridgePrincipal` represents a workload identity that a future trusted adapter has already verified. It carries bounded issuer, subject, audience, credential-reference, verification, expiry, revocation-status, and workload-actor fields.

It cannot carry tokens, secrets, private keys, environment values, OAuth state, customer identity, unrestricted metadata, or human approval. Human authority and workload identity remain distinct, and a workload cannot approve itself.

DAB-3A performs no token parsing, key retrieval, JWKS lookup, OAuth flow, certificate handling, or live authentication.

## Request binding

Every `BridgeRequestEnvelope` binds:

- stable repository identity;
- task ID;
- specification revision and hash;
- expected `origin/main` SHA;
- allowlisted operation;
- one explicit authorization category;
- verified principal;
- nonce;
- issued-at and expiry timestamps;
- correlation ID;
- idempotency key; and
- deterministic request fingerprint.

Request lifetimes are bounded to fifteen minutes. Canonical normalization makes equivalent inputs produce the same fingerprint.

## Operation policy

The catalog classifies operations as `read_only`, `modeled_write`, or `deferred`. Every operation declares one exact independent authorization category and requires human approval evidence.

Read-only and modeled-write entries are policy descriptions only. Human verification, completion, material authorization decisions, milestone recording, and claim recovery remain deferred. No operation invokes a repository or external system.

## Fail-closed behavior

Policy evaluation denies missing or mismatched repository, task, revision, hash, SHA, category, approval, principal, request-time, nonce, idempotency, or evidence bindings. Stale, unavailable, ambiguous, edited, or deleted Git evidence fails closed. Revoked, unknown, expired, or not-yet-verified principals fail closed. Same-key/different-request observations fail closed.

Authorization categories are never inferred. Scope does not imply Editing; Editing does not imply Committing, Pushing, Pull-request creation, Merging, Deployment, Credentials, Paid providers, or External actions.

Missing evidence never becomes approval, execution, completion, claim ownership, a factual milestone, or success.

## Bounded outputs

Decisions contain only status, operation, authorization category, human-approval requirement, sorted stable reason codes, request fingerprint, and canonical task reference. They contain no raw prompts, transcripts, credentials, environment values, customer data, provider payloads, stack traces, arbitrary JSON, or unbounded output.

## Consequences

### Positive

- Future bridge adapters can share one deterministic policy boundary.
- Workload and human identity remain separable.
- Operation allowlists and authorization requirements are reviewable as code.
- Pure fixtures can exercise replay, expiry, revocation, stale-state, and confused-deputy risks without credentials or a live service.

### Tradeoffs

- DAB-3A authenticates nothing and executes nothing.
- Nonce, idempotency, and revocation behavior is modeled but not durably enforced.
- The policy must later be wrapped by separately approved authenticated, rate-limited, audited adapters.
- DAB-2A's login-shaped default authority identifier and DAB-2B2's stable numeric identity still require a separately approved runtime mapping.

## Security safeguards

- exact repository/task/revision/hash/SHA/category binding;
- independent human and workload identities;
- explicit revocation and expiry state;
- short request lifetime;
- deterministic request fingerprints;
- conflict-safe idempotency observations;
- bounded stable diagnostics;
- customer-identity rejection; and
- no direct store, provider, network, credential, filesystem, shell, Git, deployment, or customer-system capability.

## Deferred work

DAB-3A adds no MCP server, API, UI, hosted runtime, network listener, credentials, OAuth/JWKS integration, GitHub App, webhook, GitHub Action, database, schema, migration, scheduler, worker, Git operation, deployment, paid-provider call, external action, Growth Engine behavior, or customer-facing capability.

DAB-3B and every live read or write adapter require a new specification and separate attributable authorization for architecture, scope, editing, credentials, integration installation, deployment, and external actions as applicable.
