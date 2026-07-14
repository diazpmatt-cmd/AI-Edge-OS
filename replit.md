# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

### DAB-1: GitHub-backed development task contract

- GitHub Issues and pull requests are the initial operational surface for proposed tasks, attributable approvals, implementation evidence, and factual Git milestones. No live task-ledger file is stored in the repository.
- `AGENTS.md` provides compact repository safeguards and routes agents to this handbook, `ROADMAP.md`, `CHANGELOG.md`, `SESSION_HANDOFF.md`, and `docs/adr/`; it must not duplicate or conflict with them.
- A mutable issue field, agent statement, proposal, or assignment is not approval. Matthew Diaz must provide an attributable decision tied to the exact specification revision, expected `origin/main` SHA, and authorization category.
- Scope, editing, committing, pushing, merging, deployment, credentials, paid providers, and external actions are independent authorization categories. Verified Git and deployment milestones remain factual records.
- DAB-1 remains contractual governance only. DAB-2A now supplies pure, in-memory enforcement contracts for task state, stale-SHA rejection, claims, and approvals; durable integration remains deferred to DAB-2B, and direct ChatGPT/Codex communication remains deferred to DAB-3.
- DAB-1 adds no ledger, persistence, runtime, network, integration, credential, API, UI, scheduler, webhook, GitHub Action, MCP server, Growth Engine behavior, or customer-facing capability. See `docs/adr/ADR-008-development-agent-bridge.md`.

### DAB-2A: pure development coordination state machine

- `lib/development-control` is the provider-independent development-control package. It is operationally separate from customer tenants and from Discovery, backlinks, Content Autopilot, Local Presence, reviews, AI Visibility, and other customer-facing systems.
- Task specifications have deterministic hashes, immutable revisions, expected `origin/main` SHAs, explicit branch/no-branch modes, and bounded scopes, files, exclusions, criteria, verification, documentation, and references. A revision or hash change invalidates prior approval.
- Human authority, architect/reviewer, Codex implementer, bounded sub-agent, and read-only automation are distinct trusted actor contracts. Matthew Diaz remains the sole material-action authority in DAB-2A fixtures and policy.
- Scope, editing, committing, pushing, pull-request creation, merging, deployment, credentials, paid providers, and external actions are independent categories. Task lifecycle state remains separate from approval state.
- The test-only in-memory state machine provides fail-closed transitions, atomic claims, bounded leases, explicit expired-claim recovery, deterministic append-only events, verified/not-verified/not-applicable milestones, stale-state rejection, and bounded completion reports.
- DAB-2A is a pure machine-enforcement foundation only. It adds no persistence, database, migration, API, UI, GitHub integration, MCP, network/environment access, credentials, shell/filesystem execution, automation, or live messaging. DAB-2B and DAB-3 remain deferred. See `docs/adr/ADR-009-dab2a-coordination-state-machine.md`.

### DAB-2B1: tenant-independent durable coordination store

- `lib/development-control` remains the pure canonical DAB-2A model. Its `DevelopmentCoordinationStore` contract permits the synchronous in-memory reference store and an asynchronous durable implementation without duplicating task, authorization, lifecycle, event, milestone, or report semantics.
- `lib/development-control-store` owns PostgreSQL/Drizzle persistence for development-control records only. It must use a dedicated control-plane database boundary and must never import `lib/db`, use customer `DATABASE_URL`, carry `clientId`, or share customer schemas, credentials, or retention rules.
- Importing the store package reads no environment variable and opens no connection. Database configuration is explicit caller input, and errors, fixtures, reports, logs, and committed files must never contain a supplied connection value.
- Durable mutations atomically write the versioned projection, append-only audit event, and operation/task-scoped idempotency result. PostgreSQL server time governs leases; task and lease versions reject stale writers; active leases cannot be stolen.
- Specification revisions, authorization decisions, audit events, milestone observations, and completion-report submissions retain immutable history. Current projections remain deterministic and bounded.
- DAB-2B1 defines code, schema, and one additive migration only. It does not provision a database, execute a live migration, host a service, reconcile GitHub, or automate an external action. DAB-2B2 GitHub reconciliation and DAB-3 direct ChatGPT/Codex communication remain deferred. See `docs/adr/ADR-010-dab2b1-durable-coordination-store.md`.

### DAB-2B2: read-only GitHub reconciliation

- `lib/development-control-github` is a pure caller-driven adapter over bounded GitHub-owned observations. Importing it must not access environment variables, credentials, or the network.
- DAB-2A and DAB-2B1 retain canonical ownership. Reconciliation validates and diagnoses evidence but never performs approval, lifecycle, claim, milestone, completion-report, Git, deployment, or external-action mutations.
- Attribution uses an allowlisted numeric repository ID and stable numeric actor ID. Login is display context only; issue forms, bodies, labels, assignees, state, mutable selections, and agent claims are never approval evidence.
- Persist only normalized identifiers, timestamps, hashes, bounded approval bindings, source references, diagnostics, cursors, and summaries. Never retain raw bodies, payloads, headers, transcripts, tokens, environment values, stack traces, arbitrary errors, or customer identity.
- Evidence, runs, and cursor advancement are atomic and idempotent. Rate limits, unavailable sources, stale SHAs, force pushes, conflicts, and lag fail closed with bounded diagnostics.
- DAB-2B2 adds no installed integration, webhook, App, Action, scheduler, worker, API, UI, hosted runtime, MCP, GitHub write surface, or automated execution. DAB-3 remains deferred. See `docs/adr/ADR-011-dab2b2-read-only-github-reconciliation.md`.

### DAB-3A: pure offline bridge contracts

- `lib/development-control-bridge` is a pure, protocol-independent policy package. It imports only the canonical DAB-2A contracts; DAB-2B1 persistence and DAB-2B2 GitHub reconciliation remain untouched adapter boundaries.
- `BridgePrincipal` represents an already-verified workload identity, never human approval. It contains bounded identity references and explicit expiry/revocation state but no token, secret, OAuth state, environment value, customer identity, or unrestricted metadata.
- Every request binds repository, task, revision, specification hash, expected SHA, operation, authorization category, principal, nonce, issued/expiry times, correlation ID, and idempotency key into a deterministic fingerprint.
- The immutable operation catalog separates read-only, modeled-write, and deferred operations. An `allowed` decision means only that offline policy evidence passed; no operation executes.
- Scope, Editing, Committing, Pushing, Pull-request creation, Merging, Deployment, Credentials, Paid providers, and External actions remain independent. Missing, stale, revoked, expired, ambiguous, or unavailable evidence fails closed.
- DAB-3A adds no authentication transport, MCP server, API, UI, hosted runtime, network, credential access, database, migration, GitHub write, Git operation, deployment, scheduler, worker, Growth Engine behavior, or customer-facing capability. DAB-3B and all live behavior remain deferred. See `docs/adr/ADR-012-dab3a-pure-bridge-contracts.md`.

### DAB-3B: private read-only remote MCP foundation

- `artifacts/development-control-mcp` is an isolated Streamable HTTP resource-server foundation for browser-based ChatGPT Work. It exposes exactly five read-only tools and routes every call through DAB-3A request and policy evaluation.
- DAB-2A continues to own tasks, specifications, approvals, states, and events. DAB-2B1 owns tenant-independent persistence. DAB-2B2 owns verified GitHub evidence. DAB-3A owns principals, envelopes, operations, and policy. DAB-3B authenticates, adapts, rate-limits, and transports bounded projections only.
- Importable modules receive configuration explicitly and do not read environment variables. OAuth JWT validation requires exact issuer, resource audience, authorized party, subject, `dab:read` scope, token ID, short lifetime, pinned public key, and revocation generation.
- The bridge request ledger stores only bounded hashes and security outcomes. Never add raw tokens, credentials, nonces, request payloads, results, arbitrary JSON, customer identity, or general-purpose database access.
- The committed entrypoint remains inactive until separately authorized infrastructure supplies the store, OAuth configuration, public keys, rate limiter, kill switch, hosting, plugin, workspace approval, and credentials.
- Do not represent DAB-3B as deployed, configured, installed, connected, or operational. Do not add write tools, unrestricted shell/Git/filesystem/database/network access, application API behavior, customer data, Growth Engine behavior, or DAB-3C under this phase. See `docs/adr/ADR-013-dab3b-private-read-only-remote-bridge.md`.

### DAB-3C: isolated private bridge activation composition

- DAB-3C composes the existing DAB-3B entrypoint lazily from exact `DAB3C_` caller configuration. Importable modules must not read environment values, open a database pool, contact a network, or activate a runtime.
- Use only the dedicated tenant-independent development-control database. Never read generic or customer `DATABASE_URL`, customer identity, customer schemas, application credentials, or customer retention state.
- Keep the exact five DAB-3B tools and DAB-3A policy boundaries unchanged. Missing identity, authorization, canonical state, Git evidence, freshness, replay protection, rate capacity, or configuration must fail closed.
- Shared serverless rate limits persist only hashed principal references, bounded counters, and timestamps. Never persist tokens, private keys, credentials, raw environment values, request bodies, tool results, nonces, customer identity, or unrestricted metadata.
- An empty control plane is unavailable, not successful. Canonical task/approval/event and Git-evidence population or reconciliation requires a separate attributable operational authorization.
- DAB-3C implementation does not authorize or perform Vercel/Supabase changes, migration execution, OAuth configuration, credentials, deployment, ChatGPT Work app/plugin installation, workspace policy, or runtime activation. Follow `docs/runbooks/dab3c-private-bridge-activation.md` only under separate authorization. See `docs/adr/ADR-014-dab3c-private-bridge-activation.md`.

### C8R-5: AI Visibility read model

- AI Visibility is a tenant-safe, deterministic read model over canonical systems. It does not own source records or workflow state.
- Local Presence remains canonical for GBP, directories, citations, NAP consistency, and reviews. Discovery remains canonical for evidence and opportunities. The backlink system remains canonical for backlink prospects, evidence, opportunities, and pursuit workflows. Content Autopilot remains canonical for preparation, approval, queueing, scheduling, publishing, failure, and measurement.
- `ai_visibility_audits` is legacy and explicitly noncanonical. C8R-5 contracts and adapters must never accept it as evidence.
- Source adapters translate canonical records into bounded normalized inputs. The pure composer must not access the database, API routes, environment variables, OAuth state, networks, or provider clients.
- Potential value and attainability are separate deterministic outputs. Do not replace them with a generic SEO or visibility score.
- Missing or unsafe sources are represented by coverage diagnostics such as `not_connected`, `not_implemented`, `not_tenant_safe`, and `no_observation`; unavailable data never becomes a fabricated zero.
- Content preparation, approval, dispatch, and delivery remain separate lifecycle facets. Generated content without an approval record maps to `not_approved`, not `not_required`; generated, approved, queued, and scheduled content is not published until delivery evidence says it is.
- Invalid services, prohibited claims, unauthorized geography, mixed tenants, unsupported evidence, and malformed inputs are rejected before prioritization.
- C8R-5 adds no persistence, API, UI, scheduler, provider, network, live collection, or external execution behavior. See `docs/adr/ADR-007-c8r5-ai-visibility-read-model.md`.

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

- Voicemail stays on the BB&B business phone (+12513249090). Press 3 transfers the caller there; native phone voicemail handles messages. Do not build Telnyx recording, AI Edge voicemail storage, or transcription unless explicitly requested.

## Gotchas

- Bed Bugs & Beyond offers no active termite service and no whole-home bed-bug heat treatment. Furniture/item-level bed-bug treatment is the differentiator; fumigation is active; authorized geography is Baldwin County, Alabama.
- Do not infer source availability from a missing record. Emit the applicable bounded coverage diagnostic.
- Do not collapse generated, approved, queued, scheduled, delivered, and failed content states.

## Documentation workflow

- Durable phase completion belongs in `CHANGELOG.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md`.
- Non-obvious architecture decisions require an ADR under `docs/adr/`.
- Operational development tasks and pull-request handoffs use the GitHub templates; the canonical repository documents retain durable architecture and project history.
- Historical phase handoffs remain historical; do not rewrite them for later phases.
- Documentation, verification evidence, code, and tests should ship together in the approved phase commit so architecture does not depend on chat memory.

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
