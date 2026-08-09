# Apollos Client Success Orchestrator

## North Star

Apollos continuously ensures each client is taking advantage of every applicable AI Edge OS capability.

The target operator command is:

> Apollos, make sure this client is using everything AI Edge OS has to offer.

For a local-service client, Apollos should understand the business, inspect applicable AI Edge capabilities, measure meaningful utilization, prioritize gaps, prepare safe activations, surface authorization boundaries, and continue independent work when one provider is blocked.

## Development Rule

**UNDERSTAND → REUSE → BUILD → TEST → EXPAND**

Do not repeat audits after the source of truth is established. Investigate actual failures when they occur.

## Existing Sources of Truth Reused

### Tenant and business context

- `lib/db/src/client-context.ts`
- `artifacts/api-server/src/lib/client-resolver.ts`

The DB-backed resolver is authoritative for the authenticated Clerk `userId`. It fails closed for unknown, inactive, unavailable, invalid, or unconfigured tenants and does not silently substitute the Bed Bugs & Beyond registry.

### Service eligibility and business safety

Apollos uses the resolved `ClientContentContext.registry`. It does not maintain a second service list.

This preserves service-level generation rules such as disabled or coming-soon services and prevents one tenant's business rules from leaking into another tenant.

### Connected accounts

The live coverage adapter reads the existing `socialConnectionsTable` scoped by authenticated `userId`. Access tokens are used only as connection evidence and are never returned by the Apollos coverage API.

### Content Autopilot

The live coverage adapter reuses the existing `auto_content_settings` row scoped by authenticated `userId` for enabled/paused state and configured platforms.

### Local Presence

The live coverage adapter reads canonical `local_presence_profiles` and `local_presence_channels` rows using the resolved client slug. It does **not** use the legacy `default` Local Presence compatibility identifier as cross-tenant evidence.

A configured Local Presence profile activates the engine coverage lane. Apple Business, Bing Places, and Nextdoor become active individually only when their canonical channel status is `connected`, `verified_publishing`, or `live`.

### Discovery

The live adapter reads the latest canonical `discovery_snapshots` row using the resolved client UUID. A current Discovery run is evidence that the engine is configured and operating. Latest `failed`, `cancelled`, or `cancel_requested` state is represented as degraded instead of active.

### Authority

The live adapter reads canonical `backlink_workflows` using the resolved client UUID. Existing tenant-scoped Authority workflow state is reused as evidence that the Authority Engine is in use; no second backlink lifecycle is created.

### Existing Apollos machinery

The orchestrator is additive to the existing Apollos chat, weekly campaign planning/preview, publishing status, delivery status, approval engine, Publishing Center, System Diagnostics, Discovery, AI Visibility read models, and Authority workflow. It does not duplicate publishing, OAuth, backlink, or execution systems.

## Canonical Capability Registry

`artifacts/api-server/src/lib/apollos-client-orchestrator.ts` defines one capability catalog for Apollos planning.

Each capability describes:

- stable key and display name;
- AI Edge pillar and category;
- applicable business kind;
- product stage;
- score weight;
- required integration, if any;
- activation feature, if any;
- dependencies;
- authorization type;
- activation gate;
- expected business benefit;
- recommended action.

The initial catalog spans:

- Discovery
- Content
- Authority
- Optimization
- Measurement
- Lead & Conversion
- Commerce

Planned adapters remain visible but have zero coverage-score weight until production-ready. This prevents roadmap features from artificially lowering a client's utilization score.

## Coverage Status Contract

Every applicable capability resolves deterministically to one of:

- `ACTIVE`
- `CONNECTED_NOT_ACTIVE`
- `CONFIGURATION_REQUIRED`
- `AUTHORIZATION_REQUIRED`
- `MISCONFIGURED`
- `DEGRADED`
- `AVAILABLE`
- `BLOCKED`
- `NOT_APPLICABLE`

Connection alone is not full utilization. For example, a connected Facebook account without an active Facebook publishing feature resolves to `CONNECTED_NOT_ACTIVE`, not `ACTIVE`.

## Client Coverage Score

The score is a deterministic weighted percentage across score-eligible applicable production capabilities.

Current utilization multipliers:

- `ACTIVE`: 1.00
- `CONNECTED_NOT_ACTIVE`: 0.50
- `DEGRADED`: 0.35
- setup, authorization, available, misconfigured, and blocked states: 0
- `NOT_APPLICABLE`: excluded
- planned product adapters: excluded from score weight

The score measures meaningful utilization rather than the number of integrations that happen to exist.

## Activation Planner

The activation planner turns coverage gaps into an ordered plan. Each plan item includes:

- capability;
- reason;
- expected benefit;
- dependencies;
- priority;
- authorization/execution gate;
- execution status;
- blocker, when present;
- recommended action.

Repair and degraded states rank ahead of ordinary setup work. Authorization-blocked actions remain in the plan but do not prevent independent `SAFE_AUTOMATIC_ACTION` work from being identified.

## Full-Utilization Mission Contract

`buildApollosClientMissionSummary()` is the deterministic operator-facing response for the North Star command.

It groups the current activation plan into:

- safe automatic work that is ready;
- human approval work;
- OAuth authorization work;
- external configuration work;
- blocked work;
- top prioritized actions.

It fails closed if the coverage object and activation plan do not belong to the same client.

The authenticated API exposes this as `GET /apollos/full-utilization`.

## Execution Gates

Apollos uses these explicit boundaries:

- `SAFE_AUTOMATIC_ACTION`
- `HUMAN_APPROVAL_REQUIRED`
- `OAUTH_AUTHORIZATION_REQUIRED`
- `EXTERNAL_CONFIGURATION_REQUIRED`
- `BLOCKED`

The initial `prepare-activation` endpoint is deliberately side-effect free. It prepares the activation contract but does not authenticate to providers, publish content, send outreach, spend money, or mutate provider state.

Future execution adapters must call the existing canonical action systems rather than creating a second publishing, OAuth, messaging, or provider-control stack.

## Tenant Isolation

Tenant identity is derived from Clerk authentication and the canonical client resolver.

The Apollos orchestrator endpoints do not accept an authoritative client ID from request bodies. A caller cannot select another tenant by sending a different `clientId`.

Unknown and broken tenants fail closed through the existing typed resolver outcomes.

Bed Bugs & Beyond remains the flagship tenant, not a fallback tenant.

## Initial API Surface

The API server exposes:

- `GET /apollos/capabilities`
- `GET /apollos/client-context`
- `GET /apollos/client-coverage`
- `GET /apollos/activation-plan`
- `GET /apollos/full-utilization`
- `GET /apollos/capabilities/:capabilityKey`
- `POST /apollos/prepare-activation`

These provide the behavior required by future Apollos MCP tools such as context/audit/coverage/status/plan/explain/prepare without prematurely coupling customer data into the engineering DAB bridge.

## MCP Boundary

The existing Secure Tunnel currently targets the isolated Development Agent Bridge MCP runtime. That runtime has a deliberately bounded engineering tool surface and DAB-specific OAuth/policy model.

Its authentication contract is a pinned workload identity with exact `dab:read` scope, repository/task policy evaluation, nonce/idempotency controls, and a tenant-independent DAB ledger. Those controls are appropriate for engineering operations but do not establish an AI Edge customer tenant.

Do **not** simply add customer-tenant tools to the DAB engineering catalog. Client orchestration requires an authenticated mapping from the ChatGPT actor to the AI Edge tenant and appropriate client-scoped authorization.

The next MCP phase should expose the orchestrator through a tenant-scoped Apollos MCP surface while preserving the existing DAB engineering boundary. The transport can be shared later, but authorization and tool policy must remain distinct.

## Initial Live Evidence

The live adapter currently uses only tenant-safe evidence with explicit ownership:

- canonical resolved client context and service registry;
- user-scoped social connections;
- user-scoped Content Autopilot settings and platforms;
- slug-scoped Local Presence profile/channels;
- client-UUID-scoped Discovery snapshots;
- client-UUID-scoped Authority workflows.

Capabilities without tenant-safe live evidence remain setup/available instead of borrowing legacy global BB&B state.

This is intentional fail-closed behavior. Add evidence adapters as their tenant ownership is explicit.

## Test Tenants

Focused pure tests use:

1. Bed Bugs & Beyond
2. fictional Boatliner Company

They prove:

- deterministic scoring;
- meaningful-use vs connection-only distinction;
- OAuth gating;
- explicit blockers;
- degraded-state scoring;
- commerce/local-service applicability;
- deterministic activation planning;
- blocked authorization does not suppress independent ready work;
- full-utilization mission grouping;
- cross-tenant mission mismatch fails closed;
- no BB&B identity leakage into Boatliner output.

## Expansion Order

1. **Current MVP** — capability registry, coverage engine, activation planner, full-utilization mission, tenant-safe live evidence, side-effect-free preparation API.
2. Add remaining tenant-safe evidence adapters for reviews, AI Receptionist, Lead Recovery, Optimization, Measurement, and Commerce using their existing sources of truth.
3. Add the smallest existing Apollos/Command Center UI surface for coverage score and prioritized actions.
4. Add a tenant-scoped Apollos MCP adapter over the orchestrator contracts.
5. Bind safe automatic actions to existing canonical execution systems.
6. Add recurring coverage refresh and outcome measurement so Apollos continuously closes gaps rather than running a one-time onboarding checklist.
