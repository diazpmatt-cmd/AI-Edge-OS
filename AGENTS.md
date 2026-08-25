# AI Edge OS Agent Guidance

## Canonical project documents

- Engineering and operating guidance: `replit.md`
- Current priorities and deferred work: `ROADMAP.md`
- Delivered changes and verification history: `CHANGELOG.md`
- Current handoff and next approved mission: `SESSION_HANDOFF.md`
- Non-obvious architecture decisions: `docs/adr/`

Keep this file compact. Do not duplicate or contradict those documents; update the applicable canonical document when durable project state changes.

## Mandatory repository safeguards

- Before work, verify the expected `origin/main` SHA, current branch, and clean working tree. Stop on an unexpected or stale state.
- Use one approved task per feature branch and one agent per branch/worktree. Do not let agents concurrently modify the same working tree.
- Stay within the approved scope and explicit file list. Treat proposals, plans, issue fields, and agent recommendations as non-authoritative until Matthew Diaz records an attributable decision.
- Approval applies only to the exact task specification revision, expected Git SHA, and authorization category named in that decision.
- Keep scope, editing, committing, pushing, merging, deployment, credentials, paid providers, and external actions as separate authorization categories. Matthew's standing authorization covers committing, pushing, opening pull requests, repairing in-scope CI failures, and merging verified green mission-related pull requests without another routine prompt. It does not authorize deployment, credentials, paid providers, customer-facing actions, destructive actions, or unrelated work.
- Record committed, pushed, pull-request-opened, merged, and deployed milestones only after verifying the corresponding Git, GitHub, or deployment state.
- Run the required verification and review the complete diff before merging. Continue autonomously under standing authorization; request Matthew's hands only when direct human action or a still-separate authorization category is genuinely required.
- Never place credentials, tokens, secrets, raw environment values, private customer data, full conversation transcripts, or unbounded shell output in tasks, reports, commits, or documentation.

## DAB phase boundary

DAB-1 provides governance contracts and templates. DAB-2 provides canonical machine-enforced coordination, durable tenant-independent storage, and read-only GitHub evidence. DAB-3A owns pure bridge contracts and policy. DAB-3B owns the isolated read-only remote MCP foundation. DAB-3C adds only lazy composition and durable shared rate limiting for a future isolated activation. It remains tenant-independent, exact-tool allowlisted, OAuth claim validated, policy gated, and fail closed. Hosting, database provisioning or migration execution, OAuth configuration, credentials, ChatGPT plugin installation, workspace approval, deployment, runtime activation, and write operations require separate authorization.
