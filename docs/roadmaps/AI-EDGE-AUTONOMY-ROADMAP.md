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

## Current authority boundary

The system may wake, inspect approved operational metadata and packaged durable project documents, reason, persist a recommendation, present an exact-scope preparation proposal, and record an authenticated human decision. An approval currently authorizes nothing beyond a durable decision record. The system may not prepare or apply work, mutate tasks, write Git/GitHub, deploy, call customer systems, publish content, or use arbitrary tools.

## Next phases

### DAB-7B — Sandboxed work preparation

Permit an independently authorized preparation worker to consume an approved, unexpired DAB-7A decision and create proposed patches, tests, preview artifacts, risk analysis, rollback plans, and completion reports in an isolated workspace. It may not apply changes to the repository, commit, push, merge, deploy, publish, contact customers, or perform external actions.

### DAB-8 — First bounded action capability

Grant one narrowly scoped capability at a time, beginning with low-risk internal documentation or task-record writes. Each capability requires an allowlist, authorization category, idempotency, audit record, kill switch, rate limit, and rollback procedure.

## Product track after the autonomy foundation

1. Media generation and object-storage integration.
2. Facebook and Instagram image publishing.
3. Post-publish analytics and performance reporting.
4. Citation, NAP, and schema engines replacing placeholder data.
5. Scheduled and recurring content automation.

## Strategic destination

AI Edge OS wakes itself, understands bounded project and business context, identifies the highest-value next step, prepares work safely, requests approval when required, executes only within explicit authority, verifies the outcome, and reports a durable factual record.
