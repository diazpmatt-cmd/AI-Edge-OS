# Apollos Operator Roadmap

Status: ACTIVE
Owner: AI Edge Solutions
Canonical engineering roadmap for Apollos operator autonomy.

## Mission

Apollos should operate as a safe AI business and engineering operator for AI Edge OS. Its default loop is:

1. What is broken?
2. What changed?
3. What is the highest-ROI next action?
4. What can Apollos verify or safely do itself before involving a human?

The operating rule is: verify first, reuse existing systems, act only within explicit authority, preserve evidence, and ask for human action only when the boundary is genuinely human-only or approval-gated.

## Roadmap priorities

### P0 - Finish production access
- Complete Clerk production authentication for the Apollos Secure MCP Tunnel.
- Verify authenticated ChatGPT tool discovery and execution.
- Verify the existing admin and tenant authorization boundaries end to end.

### P1 - Control Plane Visibility
Goal: Apollos can independently inspect the systems that run AI Edge OS.

- GitHub: repository state, recent changes, pull requests, CI/status checks, deployment-producing commits.
- Hetzner: servers, status, public IPs, firewalls, primary IPs.
- Coolify: applications/services, health, deployment state, timestamps, image/revision awareness, logs when safely available.
- Clerk: OAuth application settings, OAuth applications, users, and additional safe production-auth diagnostics.
- Add one synthesized control-plane health report that distinguishes healthy, degraded, broken, unknown, and human-only states.

### P2 - Self-Diagnostics
Goal: Apollos can answer "what broke and why?" with evidence.

- Reuse the existing Apollos diagnostics and repair-worker architecture.
- Correlate task/checkpoint failures with control-plane health and recent changes.
- Produce root cause, confidence, affected component, evidence, recommended repair, repair authority, and verification steps.
- Prefer first-party evidence over guesses.
- Never expose credentials or secret values.

### P3 - Safe Repair
Goal: Apollos can say "I found the problem; here is the repair" and safely execute bounded repairs when authorized.

- Reuse the existing repair planner, adapter policies, approval gates, kill switches, receipts, and repair worker.
- Expand read-only and checkpoint-resume repairs first.
- Add explicit repair proposals for deployment/configuration/code changes.
- Require human approval for external publishing, provider spend, credential changes, production deployments, destructive actions, or other high-impact mutations unless a narrower pre-authorized policy is explicitly established.
- Every repair must have a verification step and durable receipt.

### P4 - Business Brain and ROI Operator
Goal: Apollos understands the company and prioritizes work by business impact.

- Canonical product suite, pricing, roadmap, client configuration, architecture, deployment state, and current blockers.
- Client utilization and growth opportunity scoring.
- Highest-ROI next-action ranking with reason, expected impact, confidence, effort, and blocker.
- Preserve the existing Client Success Orchestrator and Full Utilization Cycle as the client-level source of truth.

### P5 - Native Business Data Connections
Goal: reduce manual checking and broaden evidence.

- Google Analytics
- Google Search Console
- Google Business Profile
- Telnyx
- PostgreSQL operational health
- OpenAI usage/billing visibility where safely available
- Stripe when billing/revenue workflows are ready

Provider integrations should be read-only first, tenant-safe, provider-agnostic where practical, and explicit about missing authorization.

### P6 - Revenue Operator
Goal: turn intelligence into daily revenue execution.

Apollos should be able to surface and prioritize:
- leads requiring action
- reviews and reputation opportunities
- SEO and AI-visibility opportunities
- competitor movements
- backlink/citation/authority opportunities
- content opportunities
- retention/reactivation opportunities
- revenue-impacting system failures

The output should answer: "What are the few things AI Edge should do next that are most likely to improve revenue or protect revenue?"

## Existing foundations to reuse

Do not rebuild these systems:
- Apollos Client Success Orchestrator and capability registry
- client coverage and activation planner
- `apollos_execute_safe_action`
- `apollos_run_full_utilization_cycle`
- Clerk read-only control-plane tools
- Hetzner read-only control-plane tool
- Apollos diagnostics engine
- Apollos repair planner
- repair adapter policy/kill-switch framework
- repair execution receipts
- Apollos repair worker
- Secure MCP Tunnel transport and Clerk OAuth boundary

## Development rule

AUDIT -> CONSOLIDATE -> VERIFY -> EXPAND

For every new capability:
1. Audit whether it already exists.
2. Extend the canonical implementation instead of creating a parallel system.
3. Add the smallest safe change.
4. Test the authorization and tenant boundaries.
5. Verify production evidence before declaring completion.

## Definition of Apollos V1 mission-capable

Apollos V1 is mission-capable when:
- ChatGPT can authenticate to the production Apollos MCP surface.
- GitHub, Hetzner, Coolify, and Clerk control-plane visibility are operational.
- Apollos can synthesize a control-plane diagnostic report.
- Apollos can propose a repair with evidence, risk, authority boundary, and verification steps.
- At least one bounded repair class can execute end to end with approval/kill-switch protections and a durable receipt.
- Apollos can run the client Full Utilization Cycle for Bed Bugs & Beyond without cross-tenant leakage.
- Human-only actions are clearly separated from tasks Apollos can perform itself.

## Current execution order

1. Finish the production Clerk auth blocker.
2. Complete Control Plane Visibility, starting with activation of the existing Hetzner adapter, then native GitHub and Coolify visibility.
3. Add synthesized self-diagnostics across those systems.
4. Extend the existing repair framework into evidence-backed repair proposals and bounded repairs.
5. Run the Bed Bugs & Beyond Full Utilization Mission.
6. Add Google Analytics/Search Console/GBP and other business-data providers.
7. Build the ROI/Revenue Operator loop.

This document is the roadmap to refer back to during Apollos development. Session-end Google Drive handoffs should summarize progress against this roadmap without storing secret values.
