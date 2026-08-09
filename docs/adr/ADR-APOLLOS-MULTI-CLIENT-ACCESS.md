# ADR — Apollos Multi-Client Operator Access

## Status

Accepted for the Apollos Client Success Orchestrator MVP.

## Context

The canonical `clients` table currently has a unique index on `user_id`, so a Clerk user maps directly to one self-owned client tenant. That remains appropriate for a normal client login, but it is insufficient for an AI Edge operator who must safely operate multiple client tenants from one authenticated identity.

The browser's business selector is not an authorization boundary. Neither HTTP requests nor MCP tool arguments may become authoritative merely because they contain a client ID.

## Decision

Introduce a separate `apollos_client_access` delegation table with:

- `actor_user_id`
- `client_id`
- `access_level`
- active/inactive state
- unique actor/client pair

Self-owned access does not require a delegation row. The canonical `clients.user_id` relationship automatically grants `owner` access to that client.

Delegated access is additive and must be explicitly persisted server-side.

## Selection Policy

`selectAuthorizedApollosClient()` is the shared deterministic policy.

1. No authorized clients → fail `not_found`.
2. Explicit client ID in authorized set → select it.
3. Explicit client ID outside authorized set → fail `unauthorized`.
4. Exactly one authorized client and no selection → select it.
5. Multiple authorized clients with exactly one self-owned client → default to self-owned.
6. Multiple delegated clients with no self-owned default → fail `selection_required`.

## API Boundary

`GET /apollos/clients` returns only the authenticated actor's safe authorized-client view.

Other Apollos operator endpoints may accept `clientId` as a requested selection, but the server validates it through the access policy before resolving any client state.

The client ID is therefore a selector, not an authority claim.

## MCP Boundary

The Apollos client MCP tool catalog includes `apollos_list_clients`.

Client-targeted MCP tools may receive an optional `clientId`, but the runtime first resolves that ID against the authenticated actor's server-side authorized set. It then resolves live client state through the canonical client owner's existing tenant context.

The runtime also checks that the live resolved client UUID equals the authorized target UUID. A mismatch fails closed.

## Granting Access

The MVP intentionally does **not** expose a public grant/revoke endpoint.

The existing Client Onboarding route is authenticated but not a sufficiently strong operator-permission boundary because its current rows/actions are globally visible to any authenticated user. It must not be reused to grant delegated Apollos access without a stronger admin/operator authorization layer.

Future grant/revoke actions must require an explicit trusted admin/control-plane permission and must be auditable.

## Consequences

### Positive

- One operator identity can safely support many AI Edge clients.
- Existing one-client-per-user behavior remains intact.
- Frontend business selection cannot create cross-tenant access.
- MCP can support agency-level client selection without weakening tenant isolation.
- BB&B cannot become a silent fallback for another client.

### Deferred

- Admin-controlled grant/revoke UI or API.
- Mapping the OpenAI Secure MCP Tunnel caller identity to the authenticated AI Edge actor identity.
- Persisted operator/client selection preferences.

These are integration steps, not reasons to weaken the authorization model.
