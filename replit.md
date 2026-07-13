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
- DAB-1 is contractual governance only. Machine-enforced task state, stale-SHA rejection, claims, and approvals are deferred to DAB-2; direct ChatGPT/Codex communication through a bounded MCP interface is deferred to DAB-3.
- DAB-1 adds no ledger, persistence, runtime, network, integration, credential, API, UI, scheduler, webhook, GitHub Action, MCP server, Growth Engine behavior, or customer-facing capability. See `docs/adr/ADR-008-development-agent-bridge.md`.

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
