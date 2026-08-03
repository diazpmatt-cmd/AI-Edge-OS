# AI Edge OS Autonomy Roadmap

Last updated: 2026-08-02

## Current operational state

### Completed

- DAB-4A: deterministic one-operation planner.
- DAB-4B: durable one-cycle runtime composition.
- DAB-4C: bounded wake-up controller.
- DAB-4D: production activation-readiness gate.
- DAB-5A: unattended planner worker deployed in Coolify.
- DAB-5B: planner heartbeat/cycle visibility, stale detection, and recovery runbook.
- DAB-6A: unattended reasoning worker with durable requests, runs, structured recommendations, hard budgets, timeout, idempotency, and no action tools.
- DAB-6B: authenticated Mission Board showing planner state, agent state, provider readiness, budgets, queue state, and the latest recommendation.
- DAB-6C: fixed-allowlist trusted read-only project context with redaction, provenance, digests, truncation, total-byte limits, prompt-injection resistance, and Mission Board coverage visibility.
- DAB-7A: durable exact-scope approval inbox with immutable proposal fingerprints, expiry, risk and resource display, authenticated approve/reject/modify decisions, concurrency protection, and no execution authority.
- DAB-7B: isolated review-only preparation worker with a read-only source snapshot, disposable tmpfs workspace, structured file manifest, capability/path/size policy, hashed artifacts, unified diff, validation report, rollback plan, completion report, and Approval Inbox review visibility.

## Current authority boundary

The system may wake, inspect approved operational metadata and packaged durable project documents, reason, persist a recommendation, present an exact-scope preparation proposal, record an authenticated human decision, and—only after approval—prepare bounded review artifacts inside a disposable workspace. It may not apply prepared work to the repository, mutate tasks, write Git/GitHub, create branches or commits, merge, deploy, call customer systems, publish content, install packages, run model-supplied commands, or use arbitrary tools.

## Next phase

### DAB-8 — First bounded action capability

Grant one narrowly scoped capability at a time, beginning with low-risk internal documentation or task-record writes. Each capability requires a distinct authorization category, exact resource allowlist, proposal and preparation fingerprint binding, idempotency, audit record, kill switch, rate limit, postcondition verification, and rollback procedure. Prepared artifacts do not automatically become executable.

## Product track after the autonomy foundation

1. Media generation and object-storage integration.
2. Facebook and Instagram image publishing.
3. Post-publish analytics and performance reporting.
4. Citation, NAP, and schema engines replacing placeholder data.
5. Scheduled and recurring content automation.

## Strategic destination

AI Edge OS wakes itself, understands bounded project and business context, identifies the highest-value next step, prepares work safely, requests approval when required, executes only within explicit authority, verifies the outcome, and reports a durable factual record.
