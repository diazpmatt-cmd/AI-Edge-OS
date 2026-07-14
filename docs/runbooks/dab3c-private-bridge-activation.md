# DAB-3C Private Bridge Activation Runbook

This runbook records names, safety checks, and order only. It contains no credential values and authorizes no operational action.

## Required configuration names

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

The database must be the dedicated tenant-independent development-control database. The OAuth value is a public verification key only. Never use generic `DATABASE_URL`, a customer database, a customer identity, a private key, a token, or another application environment value.

## Separately authorized activation order

1. Reconfirm the approved code, main SHA, exact five-tool catalog, and clean repository state.
2. Create or verify the isolated third Vercel project. Do not modify `ai-edge-os` or `ai-edge-os-ai-edge-solutions`.
3. Create or verify the dedicated non-customer Supabase control plane. Keep GitHub connection and Edge Functions disabled.
4. Review migrations `0001` through `0004`; execute them only under separate migration authorization and verify SQL/Drizzle parity afterward.
5. Populate canonical DAB task, specification, attributable authorization, event, and verified Git evidence only through a separately approved bounded bootstrap or reconciliation procedure. Empty storage must remain fail closed.
6. Configure the OAuth provider and ChatGPT client registration under separate credential and external-action authorization. Use OAuth 2.1 discovery, PKCE, exact resource audience, and the configured public verification key.
7. Insert only the named isolated environment values under separate credential and Vercel authorization. Start with `DAB3C_ENABLED=false` and `DAB3C_KILL_SWITCH=true`.
8. Deploy only the isolated bridge project under separate deployment authorization.
9. Verify HTTPS protected-resource metadata, authentication rejection, kill switch, bounded headers/body/output, and the exact tool list before enabling requests.
10. Enable the bridge and disable the kill switch only under separate activation authorization.
11. Create or install the private ChatGPT Work app/plugin only after workspace-admin approval, then perform one bounded read-only proof.

## Rollback

Set the kill switch active, disable the bridge, revoke the token generation, and remove the private ChatGPT Work connection in that order as separately authorized. Do not delete canonical audit evidence or reuse customer infrastructure.

## Proof limits

The first proof may read one approved task and its bounded progress only. It must not write application data, mutate GitHub, run Git or shell operations, access a filesystem, execute arbitrary SQL, deploy, read credentials, contact customer systems, or add tools.
