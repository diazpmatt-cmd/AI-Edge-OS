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
- Keep scope, editing, committing, pushing, merging, deployment, credentials, paid providers, and external actions as separate authorization categories. Approval in one category never authorizes another.
- Record committed, pushed, pull-request-opened, merged, and deployed milestones only after verifying the corresponding Git, GitHub, or deployment state.
- Run only the requested verification and review the complete diff before requesting the next authorization.
- Never place credentials, tokens, secrets, raw environment values, private customer data, full conversation transcripts, or unbounded shell output in tasks, reports, commits, or documentation.

## DAB phase boundary

DAB-1 provides governance contracts and templates only; it does not machine-enforce approvals or transitions and does not create direct agent communication. Machine-enforced coordination is deferred to DAB-2, and a bounded ChatGPT/Codex MCP bridge is deferred to DAB-3.
