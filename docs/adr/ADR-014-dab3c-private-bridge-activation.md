# ADR-014: DAB-3C Private Bridge Activation Boundary

## Status

Accepted for bounded implementation. Operational activation remains deferred.

## Context

DAB-3B supplies an offline-tested Streamable HTTP MCP resource server with five read-only tools, strict workload-token verification, canonical DAB adapters, replay protection, and fail-closed policy evaluation. Its committed entrypoint intentionally remained inactive because no hosted control plane, OAuth configuration, or runtime had been authorized.

DAB-3C must make that entrypoint composition-ready for an isolated private deployment without connecting it to customer systems or silently performing infrastructure, credential, migration, deployment, or ChatGPT Work actions. Serverless instances also require a durable rate limiter; an in-memory counter cannot enforce a shared limit.

## Decision

- The isolated entrypoint lazily reads only an explicit `DAB3C_` configuration allowlist when a request arrives. Module import opens no pool, reads no configuration value, and contacts no network.
- Disabled, killed, missing, malformed, or inconsistent configuration returns a bounded redacted `503` before creating the control-plane store.
- Runtime composition reuses DAB-2A coordination, DAB-2B1 PostgreSQL storage, DAB-2B2 verified Git evidence, DAB-3A policy, and the DAB-3B transport and authentication contracts.
- The existing five read-only tools and their closed schemas remain unchanged.
- One additive tenant-independent rate-limit relation provides atomic shared-window counters. It persists only a hashed principal reference, a bounded count, and window timestamps.
- The Node adapter converts only the isolated Vercel request/response boundary to the existing Web `Request`/`Response` handler. It adds no outbound network client or general API surface.
- Configuration accepts only a pinned RS256 public verification key and exact issuer, resource audience, authorized party, subject, scope, repository, human-authority actor, token lifetime, and revocation generation.
- The control-plane database is explicit caller input named `DAB3C_CONTROL_DATABASE_URL`; generic or customer `DATABASE_URL` is never read.

## Canonical ownership

DAB-2A owns task, specification, approval, lifecycle, and event semantics. DAB-2B1 owns tenant-independent persistence. DAB-2B2 owns normalized verified GitHub evidence. DAB-3A owns bridge principals, request envelopes, operation policy, and decisions. DAB-3B owns authenticated read-only transport. DAB-3C composes those owners and adds shared rate-limit persistence; it creates no competing task, approval, evidence, or workflow model.

## Fail-closed behavior

Identity mismatch, invalid signature or claim, expiry, revocation, stale state, missing or ambiguous evidence, replay, idempotency conflict, exhausted rate limit, storage failure, invalid configuration, and kill-switch activation reject the request with bounded redacted output. No fallback reads customer systems or fabricates canonical data.

## Consequences

- An isolated deployment can later be configured without changing the five-tool policy surface.
- A verified-empty control plane correctly returns unavailable evidence. Positive live proof requires a separately authorized canonical task/specification/approval and Git-evidence population or reconciliation step.
- Migration `0004` must be reviewed and separately executed after the earlier unapplied development-control migrations. This implementation does not run it.
- Durable rate limiting adds one control-plane relation but no customer or application schema dependency.

## Deferred operational actions

Vercel project creation or modification, Supabase provisioning or configuration, migration execution, OAuth registration and credentials, environment insertion, domain/TLS work, deployment, endpoint proof, ChatGPT Work app/plugin creation or installation, workspace approval, and runtime activation each require separate attributable authorization. The canonical and duplicate application Vercel projects remain untouched.

## Security boundaries

No token, private key, shared secret, credential, raw environment value, request body, tool result, nonce, customer identity, or arbitrary metadata is persisted or logged. No shell, filesystem, arbitrary SQL, GitHub mutation, deployment control, unrestricted network, customer system, or write tool is exposed.
