# DAB-3C Private Bridge Activation Runbook

This runbook records names, safety checks, and order only. It contains no credential values and authorizes no operational action.

## Current deployment topology

The active deployment target is the isolated Coolify MCP application, not Vercel. The application pulls the immutable `ai-edge-os-mcp` image from GHCR through `docker-compose.mcp.prebuilt.yml` and must remain separate from the customer-facing AI Edge OS application stack.

The preferred ChatGPT transport is an OpenAI Secure MCP Tunnel so the MCP bridge does not require a public inbound MCP domain or firewall opening. The tunnel client makes outbound HTTPS connections to OpenAI and forwards traffic to the local MCP service. The OAuth authorization server remains a separate browser-reachable service; the tunnel does not make an OAuth provider private or browser-accessible automatically.

The bridge must stay fail closed until every activation dependency is proven:

- `DAB3C_ENABLED=false`
- `DAB3C_KILL_SWITCH=true`
- no customer-facing domain assigned to the MCP resource
- no customer database used as the development-control plane
- no write-capable MCP tools

## Required bridge configuration names

- `DAB3C_ENABLED`
- `DAB3C_KILL_SWITCH`
- `DAB3C_CONTROL_DATABASE_URL`
- `DAB3C_RESOURCE_URL`
- `DAB3C_DOCUMENTATION_URL`
- `DAB3C_OAUTH_ISSUER`
- `DAB3C_OAUTH_AUTHORIZED_PARTY`
- `DAB3C_OAUTH_SUBJECT`
- `DAB3C_OAUTH_KEY_ID`
- `DAB3C_OAUTH_PUBLIC_KEY_PEM_B64`
- `DAB3C_REVOCATION_GENERATION`
- `DAB3C_REPOSITORY_ID`
- `DAB3C_MATTHEW_ACTOR_ID`

The control database must be a dedicated tenant-independent development-control PostgreSQL database. The OAuth key stored by the bridge is a public verification key only. Never use generic `DATABASE_URL`, the production/customer application database, a customer identity, a private signing key, an access token, a tunnel runtime key, or another application's secret as a DAB bridge value.

## Required transport and OAuth properties

Before activation, verify all of the following:

- The MCP resource is reachable through the configured Secure MCP Tunnel.
- The tunnel client is pinned to a reviewed immutable version and can reach the MCP container over the private Coolify network.
- Tunnel credentials exist only in the tunnel runtime configuration and are never committed or copied into bridge logs.
- The OAuth provider supports OAuth 2.1-compatible authorization code flow with PKCE S256.
- The OAuth provider supports the dedicated `dab:read` scope without broadening it to a generic application scope.
- Protected-resource metadata identifies the exact MCP resource URL and authorization server.
- Every one of the five MCP tools advertises OAuth with the `dab:read` scope.
- An unauthenticated tool call returns an MCP `mcp/www_authenticate` challenge without executing the tool.
- The authorization server is reachable by the user's browser independently of the MCP tunnel.
- Access tokens are RS256 JWTs satisfying the bridge's exact issuer, audience, authorized-party, subject, scope, key ID, lifetime, token ID, and revocation-generation checks.

## Separately authorized activation order

1. Reconfirm the approved code, current `main` SHA, immutable MCP image publication, exact five-tool catalog, and clean repository state.
2. Verify the isolated Coolify MCP application is healthy with `/healthz`, has no public/customer domain, and remains disabled with the kill switch active.
3. Create or verify a dedicated tenant-independent development-control PostgreSQL database. Do not reuse the production/customer AI Edge OS database.
4. Review development-control migrations `0001` through `0004`; execute them only under separate migration authorization and verify SQL/Drizzle parity afterward.
5. Populate canonical DAB task, specification, attributable authorization, event, and verified Git evidence only through a separately approved bounded bootstrap or reconciliation procedure. Empty storage must remain fail closed.
6. Create or verify the OpenAI Secure MCP Tunnel under separate external-action/credential authorization. Configure the tunnel client to reach the private MCP service without exposing a public MCP port.
7. Configure a browser-reachable OAuth provider and ChatGPT client registration under separate credential and external-action authorization. Require authorization code + PKCE S256, the exact MCP resource audience, the dedicated `dab:read` scope, and the configured public verification key.
8. Insert only the named isolated DAB bridge values into the MCP Coolify resource. Keep `DAB3C_ENABLED=false` and `DAB3C_KILL_SWITCH=true`.
9. Verify through the tunnel: protected-resource metadata, unauthenticated HTTP challenge, tool-level `mcp/www_authenticate` challenge, strict authentication rejection, bounded headers/body/output, and exactly five read-only tools.
10. Enable the bridge and disable the kill switch only after database, tunnel, OAuth, and metadata proofs are all green and activation is separately authorized.
11. Create the private ChatGPT workspace app using the tunnel connection, complete OAuth linking, rescan the exact five tools, and perform one bounded read-only proof.

## Rollback

Set the kill switch active, disable the bridge, revoke the OAuth token generation, stop or revoke the tunnel runtime credential, and remove the private ChatGPT workspace connection in that order as separately authorized. Do not delete canonical audit evidence or reuse customer infrastructure.

## Proof limits

The first proof may read one approved task and its bounded progress only. It must not write application data, mutate GitHub, run Git or shell operations, access a filesystem, execute arbitrary SQL, deploy, read credentials, contact customer systems, or add tools.
