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

### In delivery

- DAB-8A: first verified external publishing action. One authenticated operator may save one exact Bed Bugs & Beyond post, choose one allowlisted connected platform, schedule it, run a read-only preflight, and arm the exact payload hash. A dedicated worker publishes at most one post, then records the platform delivery ID, external post ID/URL, timestamp, and verification receipt.

## Current authority boundary

The system may wake, inspect approved operational metadata and packaged durable project documents, reason, persist a recommendation, present an exact-scope preparation proposal, record an authenticated human decision, and prepare bounded review artifacts inside a disposable workspace. DAB-8A adds one tightly bounded external action only after a fresh authenticated hash-bound ARM confirmation: one Bed Bugs & Beyond post, one platform, one scheduled time. It may not create or run campaigns, publish batches, switch platforms, mutate approved content, reply to customers, repair accounts, or expand authority from chat text alone.

## Publishing autonomy roadmap

1. DAB-8A — save, schedule, publish, and verify one approved test post.
2. Add Facebook and Instagram campaign adapters and media verification.
3. Add YouTube video and Community publishing.
4. Resolve remaining Google Business Profile access limitations.
5. Enable one approved seven-day campaign with bounded daily slots.
6. Add idempotent retries, alerts, connection-health reporting, and post-publish performance reporting.

## Required controls for every new action capability

Each capability requires a distinct authorization category, exact resource allowlist, immutable payload binding, idempotency, audit record, kill switch, rate limit, postcondition verification, and rollback or containment procedure. Prepared artifacts do not automatically become executable.

## Strategic destination

AI Edge OS wakes itself, understands bounded project and business context, identifies the highest-value next step, prepares work safely, requests approval when required, executes only within explicit authority, verifies the outcome, and reports a durable factual record.
