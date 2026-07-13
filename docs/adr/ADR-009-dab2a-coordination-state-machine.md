# ADR-009: DAB-2A Pure Development Coordination State Machine

**Status:** Accepted for DAB-2A implementation
**Date:** 2026-07-13
**Decision owner:** Matthew Diaz (final material-action authority)

## Context

DAB-1 established GitHub Issues and pull requests as a contractual, attributable coordination surface. DAB-1-PILOT-001 and DAB-1-PILOT-002 proved the workflow usable but exposed manual enforcement gaps: specifications lacked deterministic hashes, SHA and approval matching were manual, claims had no atomic lease, actor roles were not independently modeled, read-only tasks did not naturally express not-applicable Git milestones, and durable documents could lag factual Git state.

The platform needs a machine-validatable foundation before any durable coordination service or direct ChatGPT/Codex bridge is considered. That foundation must remain operationally separate from customer tenants and customer-facing AI Edge systems.

## Decision

DAB-2A introduces a pure TypeScript development-control package containing provider-independent contracts and a deterministic, test-only in-memory state machine. It translates the manual DAB-1 safeguards into fail-closed validation without adding production persistence, GitHub integration, APIs, user interfaces, networks, credentials, automation, or direct agent communication.

DAB-2A is a bounded subphase. It is not complete DAB-2.

## Canonical task specifications

Each task specification binds a stable task ID to an immutable positive revision, deterministic canonical hash, expected `origin/main` SHA, task type, priority, branch/no-branch mode, dependencies, origin, proposed agent, bounded scope, exact authorized files, exclusions, acceptance criteria, verification requirements, documentation requirements, and bounded development references.

Semantically set-like arrays are normalized, deduplicated, and sorted before dependency-free SHA-256 hashing. A changed specification must receive the next revision and a different hash. Approval bound to an older revision or hash does not carry forward.

## Independent development actors

DAB-2A models these actor classes separately:

- Human authority
- Architect/reviewer
- Codex implementer
- Bounded sub-agent
- Read-only automation

Actors are trusted bounded inputs supplied by the caller; DAB-2A does not authenticate them against an external provider. Development actors cannot carry customer `tenantId` or `clientId` values. Matthew Diaz is the sole human authority allowed to grant material-action approval in this phase's fixtures and policy.

## Authorization decisions

Scope, editing, committing, pushing, pull-request creation, merging, deployment, credentials, paid providers, and external actions are independent categories. Approval for one category never implies another.

Approval records bind the exact task, specification revision and hash, expected Git SHA, categories, deciding actor, decision, decision time, optional expiration, constraints, bounded rationale, and deterministic idempotency key. Proposed, approved, rejected, revoked, and expired decision states are represented independently from task lifecycle state.

Only a trusted human-authority actor may grant an approved material-action decision. Wrong-category, stale-SHA, stale-revision/hash, expired, revoked, rejected, and unauthorized decisions fail closed.

## Lifecycle, claims, and leases

The task lifecycle uses an explicit transition table for proposed, approved, claimed, in-progress, review-requested, verified, completed, blocked, rejected, and cancelled states. Invalid transitions are rejected.

One active claimant is permitted per task. Claims record a trusted owner, claim time, bounded expiration, and lease version. Renewal requires the same owner and current lease version. An active lease cannot be stolen. Expired claims require an explicit recovery operation before another claimant may acquire the task; recovery is never automatic.

Task and lease versions reject stale callers. Claim and authorized transitions validate the caller-supplied observed Git SHA against the approved expected SHA. DAB-2A does not collect remote Git state itself.

## Append-only events and idempotency

Every accepted in-memory mutation appends an immutable event with a deterministic event ID, task and specification provenance, prior/new state, actor, bounded reason, expected/observed Git state where applicable, correlation key, bounded metadata, and timestamp.

Idempotent retries with identical input return the prior result and do not append duplicate events. Reusing an idempotency key with different input fails closed.

## Factual milestones

Committed, pushed, pull-request-opened, merged, and deployed remain factual milestones rather than approvals. Each milestone is verified, not verified, or not applicable. Read-only and explicit no-branch tasks initialize these milestones as not applicable and cannot claim verified Git or deployment facts.

## Bounded completion reports

Completion reports bind to the active task revision and hash and contain bounded starting/final Git state, completed scope, changed files, verification and security results, accepted limitations, affected documentation, factual milestones, blockers, and a recommended next task.

Reports reject unauthorized files, credential-shaped values, private-key material, raw environment fields, customer identity, complete conversation transcripts, raw shell output, and unbounded strings, arrays, metadata, or total payload size.

## Security and separation

- Development control is separate from customer tenants and all customer-facing AI Edge systems.
- Discovery, backlink, Content Autopilot, Local Presence, review, AI Visibility, and customer task schemas are not reused.
- No production repository, database, migration, API, UI, GitHub integration, webhook, GitHub Action, MCP, network/environment access, credential handling, shell execution, arbitrary filesystem access, automated Git/deployment action, or live messaging is introduced.
- Observed SHA and verified actor identity are bounded trusted caller inputs; live collection and external identity binding are deferred.

## Consequences and tradeoffs

Positive consequences:

- DAB-1 governance rules become deterministic and unit-testable.
- Stale specifications, approvals, SHA observations, task versions, leases, and claims fail closed.
- Authorization, lifecycle, claims, events, and factual milestones remain distinct.
- Future persistence or integration can target one canonical development-control contract instead of inventing competing models.

Tradeoffs:

- The in-memory implementation is test-only and loses all state when discarded.
- Atomicity and concurrency guarantees are process-local demonstrations, not production coordination guarantees.
- Actor verification and observed Git SHA remain trusted inputs rather than independently authenticated facts.
- No GitHub workflow, direct ChatGPT/Codex communication, or autonomous execution is available.

## Deferred phases

- DAB-2B may separately design durable tenant-independent persistence, repository transactions, identity binding, and bounded GitHub coordination integration around these contracts.
- DAB-3 may separately design an authenticated, allowlisted MCP interface after persistence and authorization boundaries are approved.

Neither phase is implemented or approved by this decision.
