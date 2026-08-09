# Apollos MCP OAuth Transport

Date: 2026-08-09

## Goal

Let ChatGPT/Apollos invoke the tenant-safe Apollos Client Success Orchestrator using the same human identity AI Edge OS already trusts.

## Architecture

**Secure MCP Tunnel = transport.**

**Clerk OAuth = human actor authentication.**

**AI Edge `apollos_client_access` + client ownership = tenant authorization.**

The existing DAB `dab:read` workload identity is not a customer identity and must not be reused for Apollos client operations.

## Request flow

1. ChatGPT connects to the public Secure MCP Tunnel resource.
2. An unauthenticated request receives an OAuth `WWW-Authenticate` challenge pointing to RFC 9728 protected-resource metadata.
3. Protected-resource metadata identifies the Clerk authorization server and the supported `openid profile email` scopes.
4. ChatGPT completes OAuth with Clerk on behalf of the AI Edge user.
5. ChatGPT retries the MCP request with `Authorization: Bearer <Clerk OAuth token>`.
6. AI Edge verifies that token through Clerk with `acceptsToken: "oauth_token"`.
7. Clerk returns the canonical AI Edge `userId`.
8. The Apollos MCP runtime uses that `userId` to resolve only self-owned or explicitly delegated clients.
9. Tool-request `clientId` values remain selectors only; they never grant authority.

## Endpoints

Authenticated MCP resource inside the AI Edge API server:

- `POST /api/apollos/mcp`

Public protected-resource metadata:

- `GET /.well-known/oauth-protected-resource/api/apollos/mcp`
- `GET /.well-known/oauth-protected-resource` as a compatibility fallback

## Tool authentication

Every Apollos MCP tool declares OAuth and remains read-only / side-effect-free in this milestone.

Current tools:

- `apollos_list_clients`
- `apollos_get_client_context`
- `apollos_get_client_coverage`
- `apollos_get_activation_plan`
- `apollos_get_full_utilization`
- `apollos_get_capability_status`
- `apollos_prepare_activation`

## Configuration

### `APOLLOS_MCP_RESOURCE_URL`

Optional in ordinary direct HTTPS deployments; required when the externally visible MCP resource differs from the API server URL, including Secure MCP Tunnel deployments.

Set it to the exact public MCP resource URL ChatGPT is configured to call.

The server uses it to generate protected-resource metadata and OAuth challenges. It must be HTTPS outside localhost.

### `APOLLOS_MCP_AUTHORIZATION_SERVER`

Optional override for the Clerk authorization-server origin.

When omitted, AI Edge derives the Clerk Frontend API authorization-server origin from the existing `CLERK_PUBLISHABLE_KEY`.

## Clerk requirements

Before production linking:

- OAuth provider functionality must be enabled for the existing AI Edge Clerk application.
- Dynamic Client Registration should be enabled for MCP-compatible public clients.
- The authorization server must be publicly reachable from ChatGPT.
- `openid`, `profile`, and `email` are the current requested resource scopes.
- Refresh-token behavior must support persistent ChatGPT connectivity.

No customer platform passwords are stored by Apollos.

## Production transport boundary

The current DAB Secure MCP Tunnel points at the isolated engineering MCP bridge. Do not combine DAB workload identity and Apollos tenant identity.

Production activation must intentionally choose one of these transport layouts:

1. a dedicated Apollos Secure MCP Tunnel whose private target is the AI Edge API server `/api/apollos/mcp`; or
2. an explicitly reviewed transport routing layer that keeps the DAB and Apollos authorization boundaries separate.

A dedicated Apollos tunnel is the simpler security boundary if one tunnel cannot safely route both resources.

## Safety

- OAuth token is verified on every Apollos MCP request.
- Session tokens, API keys, and M2M tokens are not accepted by the Apollos MCP resource.
- Missing OAuth configuration fails closed.
- Unknown and unauthorized clients fail closed through the existing Apollos access policy.
- No provider write action is enabled by this transport milestone.
- Secure MCP Tunnel credentials are unrelated to tenant authorization.

## Development rule

**UNDERSTAND → REUSE → BUILD → TEST → EXPAND**
