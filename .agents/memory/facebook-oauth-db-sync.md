---
name: Facebook OAuth DB split + sync
description: Replit gives deployed and dev servers separate Postgres databases. The OAuth callback always hits the deployed server. Bridge: signed HMAC sync POST before the popup redirect.
---

# Facebook OAuth dev/prod DB sync

## The rule
Replit dev and deployed containers have DIFFERENT `DATABASE_URL` values. The Facebook OAuth callback always hits the deployed server (because `PUBLIC_APP_URL` in `[userenv.production]` is the deployed domain), so tokens land in the **production DB**. The dev API server queries the **dev DB** (always empty for OAuth tokens), making the card show "Needs Reconnection" in dev.

**Why:** Replit's platform injects a separate Postgres instance per environment.

## How to apply
After every successful token save in `oauth-callbacks.ts`, call `syncToDevServer(devOrigin, payload)` BEFORE `redirectSuccess()`. The dev server's `POST /api/social-connections/oauth-sync` (in `social-connections.ts`) verifies an HMAC-SHA256 signature using `OAUTH_STATE_SECRET ?? CLERK_SECRET_KEY` and upserts the connection into the local dev DB.

**The HMAC payload** is `JSON.stringify({provider, userId, accountName, accountId, accessToken, metadata})` — field order matters for the signature to match.

## Diagnostic marker
If production DB row has `metadata = ""` (empty string), the `/me/accounts` step returned 0 pages or failed. `meta-publish-status` will return `failureReason: "no_pages_found"` or `"missing_permissions"` depending on scopes.

## Key files
- `artifacts/api-server/src/routes/oauth-callbacks.ts` — `syncToDevServer()` helper + step 4b call
- `artifacts/api-server/src/routes/social-connections.ts` — `POST /api/social-connections/oauth-sync` endpoint
- `artifacts/ai-edge-solutions/src/pages/ConnectionsPage.tsx` — async `msgHandler` with `failureReason`-driven toast
