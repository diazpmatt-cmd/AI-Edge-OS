# ADR-008: DAB-1 GitHub-Backed Development Task Contract

**Status:** Accepted
**Date:** 2026-07-13
**Decision owner:** Matthew Diaz (final authority)

## Context

AI Edge OS development currently relies on detailed task specifications, explicit authorization, Git branches, verification reports, durable project documentation, and GitHub pull requests. The process is safe but repeated copying between ChatGPT and Codex can lose task revision, Git-state, approval, or handoff details.

The repository already has canonical durable documents for engineering guidance, roadmap state, delivered changes, session handoff, and architecture decisions. It does not have a development-task ledger, GitHub task templates, project agent guidance, direct ChatGPT/Codex communication, or an operational MCP bridge.

## Decision

DAB-1 establishes a contractual coordination layer using GitHub Issues and pull requests as the initial operational task and handoff surface. It adds compact repository agent guidance and standardized GitHub templates. Existing repository documents remain the durable architecture and project-history surface, while GitHub remains authoritative for code, reviews, commits, pull requests, and merges.

DAB-1 does not add technical enforcement, a task database, a live bridge, or direct agent communication. Its safeguards are conventions made reviewable through structured fields and explicit evidence requirements.

## Canonical surfaces

- `AGENTS.md` provides compact, persistent repository safeguards and routes agents to canonical documents.
- `replit.md` remains the Engineering Handbook and operating guidance.
- `ROADMAP.md` remains the priority and deferred-work record.
- `CHANGELOG.md` remains the delivered-change and verification record.
- `SESSION_HANDOFF.md` remains the current handoff and next-mission record.
- `docs/adr/` remains the architecture-decision record.
- GitHub Issues hold proposed and approved operational task specifications.
- GitHub pull requests hold implementation evidence, verification, review, and factual Git milestones.
- GitHub's actor identity and creation, update, comment, and review timestamps provide the DAB-1 attribution timeline.

No mutable live task-ledger file is stored in the repository.

## Task identity and stale-state contract

Each task records a stable task ID, immutable specification revision, expected full `origin/main` SHA, and intended branch. Approval must apply to that exact specification revision, SHA, and authorization category. Before work begins, the implementer verifies the current branch, clean working tree, and local/remote starting SHA and stops on mismatch.

One task uses one feature branch and one agent uses a given branch/worktree at a time. Parallel work requires isolated worktrees or repositories.

These are contractual DAB-1 requirements. Optimistic concurrency, leases, specification hashes, automatic stale-SHA rejection, and machine-validated claims are deferred to DAB-2.

## Proposal and approval separation

A created issue, issue-form selection, assignment, task status, agent statement, recommendation, or plan is not approval. Approval evidence must be an attributable GitHub comment, review, or other explicit decision record from Matthew Diaz's verified identity.

The decision must identify:

- The exact task and specification revision
- The expected Git SHA
- The approved authorization categories
- Any limits or accepted verification conditions

## Authorization categories

The following categories remain independent:

- Scope
- Editing
- Committing
- Pushing
- Merging
- Deployment
- Credentials
- Paid providers
- External actions

Approval for one category never implies approval for another. A later approval may authorize additional categories without retroactively expanding an earlier decision.

## Factual milestones

Committed, pushed, pull-request-opened, merged, and deployed are factual milestones. They are recorded only after verifying the corresponding Git, GitHub, or deployment state. They are not inferred from an approval or an agent report.

## Handoff contract

The pull-request handoff records the starting Git state, exact scope, changed files, exclusions, verification commands and results, accepted limitations, documentation, authorization evidence, final Git state, PR state, completion report, and recommended next task.

Reports must not contain credentials, tokens, secrets, raw environment values, private customer data, full conversation transcripts, or unbounded shell output.

## Security safeguards

- Matthew remains final authority for material scope and every side-effecting authorization category.
- GitHub identity and attributable decision history form the DAB-1 approval evidence boundary.
- Agents stop on stale Git state, dirty starting state, unapproved scope, or missing category-specific authorization.
- Work is isolated by task, branch, and worktree.
- Templates prohibit sensitive or unbounded data.
- DAB-1 adds no runtime, network, credential, customer-tenant, provider, or execution capability.
- No autonomous commit, push, merge, deployment, credential use, paid-provider call, or external action is introduced.

## Deferred machine enforcement — DAB-2

DAB-2 may introduce a separately approved internal coordination ledger with strict task versions, specification hashes, immutable transition events, attributable decisions, expected-SHA compare-and-swap, idempotency, bounded claims, and stale-state rejection.

DAB-2 must not reuse customer-facing task, Discovery, backlink, content, or tenant records as the development control plane. Its exact storage and authentication architecture requires separate approval.

## Deferred direct communication — DAB-3

DAB-3 may expose a separately approved bounded MCP interface for reading tasks and decisions, appending proposals, claiming approved tasks, submitting completion reports, requesting review, recording authorized decisions, and reading verified Git status.

It must not expose unrestricted shell, filesystem, SQL, network, credential retrieval, commit, push, merge, deployment, paid-provider, or external-action tools. Authentication, identity binding, tool allowlists, and per-tool approval policies require separate architecture approval.

## Consequences and tradeoffs

Positive consequences:

- Task specifications, approvals, and handoffs become reviewable and attributable.
- GitHub remains the code and review source of truth.
- Existing durable project documents are reused rather than duplicated.
- DAB-1 delivers immediate coordination value without introducing operational infrastructure or credentials.

Tradeoffs:

- DAB-1 cannot technically prevent an incorrect issue selection, stale task claim, unauthorized transition, or concurrent edit.
- Humans and agents must verify approval evidence and Git state.
- GitHub availability and identity controls are dependencies of the operational process.
- Direct ChatGPT/Codex communication and machine validation remain unavailable until separately approved later phases.

## Explicit exclusions

DAB-1 adds no task ledger, database, migration, schema, API, UI, scheduler, webhook, GitHub Action, MCP server, project MCP configuration, integration, port, credential, network behavior, runtime execution, Growth Engine behavior, or customer-facing capability.
