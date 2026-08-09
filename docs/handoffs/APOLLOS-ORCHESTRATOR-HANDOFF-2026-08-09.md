# Apollos Client Success Orchestrator — Session Handoff

Date: 2026-08-09
Branch: `feat/apollos-client-orchestrator-mvp`
PR: #377

## North Star

Matthew should be able to say:

> Apollos, make sure this client is using everything AI Edge OS has to offer.

Apollos must understand the selected authorized client, measure meaningful utilization across applicable AI Edge capabilities, prioritize gaps, continue independent work, and stop only at explicit approval/OAuth/external-configuration boundaries.

## Development Rule

**UNDERSTAND → REUSE → BUILD → TEST → EXPAND**

Do not re-audit established architecture unless an actual failure or contradictory evidence requires it.

## Built in PR #377

### Core orchestrator

- canonical AI Edge capability registry across Discovery, Content, Authority, Optimization, Measurement, Lead & Conversion, and Commerce;
- deterministic coverage states and weighted utilization score;
- deterministic activation planner with priority, dependency, benefit, authorization gate, and blocker metadata;
- full-utilization mission contract for the operator command;
- planned/roadmap-only adapters remain visible but do not lower current-offering utilization.

### Live tenant-safe evidence

Current live evidence is deliberately limited to sources with explicit tenant ownership:

- canonical client resolver + DB service registry;
- user-scoped social connections;
- user-scoped Content Autopilot settings;
- canonical-slug Local Presence profiles/channels;
- client-UUID Discovery snapshots;
- client-UUID Authority/backlink workflows;
- canonical-slug AI Receptionist settings.

Excluded until migrated to tenant-safe ownership:

- legacy global Reviews;
- legacy Lead Recovery/global leads;
- legacy/demo-fallback AI Visibility route data.

### Multi-client operator access

- `apollos_client_access` delegated-access persistence;
- self-owned client access remains implicit through `clients.user_id`;
- tested deterministic client selection policy;
- `GET /apollos/clients` returns safe authorized client metadata;
- selected client IDs are validated selectors, never authority claims;
- no public access grant/revoke endpoint exists yet.

The existing Client Onboarding route must not be used to grant Apollos permissions until it has a stronger admin/control-plane authorization boundary.

### API

- `GET /apollos/capabilities`
- `GET /apollos/clients`
- `GET /apollos/client-context?clientId=...`
- `GET /apollos/client-coverage?clientId=...`
- `GET /apollos/activation-plan?clientId=...`
- `GET /apollos/full-utilization?clientId=...`
- `GET /apollos/capabilities/:capabilityKey?clientId=...`
- `POST /apollos/prepare-activation?clientId=...`

Activation preparation is side-effect free.

### MCP

Transport-neutral Apollos client MCP runtime and JSON-RPC handler exist.

Tools:

- `apollos_list_clients`
- `apollos_get_client_context`
- `apollos_get_client_coverage`
- `apollos_get_activation_plan`
- `apollos_get_full_utilization`
- `apollos_get_capability_status`
- `apollos_prepare_activation`

MCP client selection is validated against the authenticated actor's server-side access set. Runtime additionally verifies that authorized target UUID and live-resolved client UUID agree.

### UI

- `/admin/apollos-coverage`
- authorized client selector
- AI Edge Coverage score
- active/applicable/opportunity counts
- sign-in and blocked counts
- prioritized next actions with explicit execution gates
- Client Coverage tile under Command Center → AI CMO

## Remaining Integration Boundary

The production Secure MCP Tunnel still needs a trusted mapping from OpenAI/ChatGPT caller identity to the AI Edge actor identity (`userId`).

Do not treat the existing DAB `dab:read` workload identity as a customer tenant identity.

The client MCP tool/runtime behavior is built; transport identity wiring is the remaining MCP integration boundary.

## Current Safety Boundaries

- no production deployment performed;
- no credential changes performed;
- no Coolify/tunnel/DAB3C changes in PR #377;
- no provider writes;
- no OAuth execution;
- no external publishing;
- no outreach sending;
- no financial actions;
- no BB&B fallback for unknown tenants.

## Next Build Order

1. Finish PR #377 CI and fix only actual failures.
2. Make PR #377 merge-ready; do not deploy production without an explicit production step.
3. Resolve Secure MCP Tunnel caller → AI Edge actor identity mapping from official OpenAI-supported transport behavior.
4. Mount the Apollos client MCP handler behind that authenticated transport.
5. Add a trusted admin/control-plane grant/revoke path for delegated client access.
6. Migrate remaining global evidence sources to tenant-safe ownership, then wire them into coverage.
7. Bind `SAFE_AUTOMATIC_ACTION` capabilities to existing canonical execution systems one by one.

## Definition of Success for the Next Milestone

From ChatGPT, Apollos can list Matthew's authorized AI Edge clients, select Bed Bugs & Beyond or another authorized client, run `apollos_get_full_utilization`, and return the real coverage score plus prioritized actions without exposing or crossing tenant data.
