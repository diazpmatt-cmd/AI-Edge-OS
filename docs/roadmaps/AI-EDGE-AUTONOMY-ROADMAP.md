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

## Current authority boundary

The system may wake, inspect approved operational metadata, reason, persist a recommendation, and report its state. It may not execute its recommendation, mutate tasks, write Git/GitHub, deploy, call customer systems, publish content, or use arbitrary tools.

## Next phases

### DAB-6C — Trusted read-only context expansion

Add bounded read-only context adapters for the Engineering Handbook, roadmap, Session Handoff, ADRs, open issues, recent merges, CI state, deployment health, and approved business priorities. Every source must be versioned, redacted, size-bounded, and attributable.

### DAB-7A — Human approval inbox

Present proposed actions with exact scope, requested authorization categories, risk, expiry, affected resources, and approve/reject/modify controls. Approval remains separate from execution.

### DAB-7B — Sandboxed work preparation

Permit approved preparation in an isolated workspace: proposed patches, tests, preview artifacts, risk analysis, rollback plan, and completion report. No merge or deployment authority.

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
