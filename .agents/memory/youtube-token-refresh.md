---
name: YouTube token refresh guard bug
description: Why YouTube tokens go stale silently and how the refresh guard was fixed.
---

## The bug

All three YouTube refresh guards used:
```ts
if (conn.expiresAt && conn.expiresAt < new Date() && conn.refreshToken)
```
Since `expires_at` is `NULL` in the dev DB (lost during dev-sync), this is always `false` — refresh never fires, access token goes stale after 1 hour.

**Why** — The token check `conn.expiresAt &&` short-circuits to falsy when `expiresAt` is null, skipping the refresh entirely.

## Fix

Changed all three guards to:
```ts
if (conn.refreshToken && (!conn.expiresAt || conn.expiresAt < new Date()))
```
"Refresh if we have a refresh token AND either we don't know the expiry (null) OR it's confirmed expired."

Affected files:
- `social-connections.ts` — youtube/test-upload endpoint
- `social-connections.ts` — youtube/channel-info endpoint  
- `social-posts.ts` — YouTube publish flow

## Why `expires_at` is NULL in dev DB

The dev-sync chain drops the expiry at every hop:
1. `syncToDevServer` — didn't forward `refreshToken` or `expiresAt`
2. `oauth-sync` endpoint — hardcoded `expiresAt: null`, `refreshToken: null`
3. `dev-export` — omitted `expiresAt` from response JSON
4. `pull-from-prod` — hardcoded `expiresAt: null`

All four were fixed to propagate both `expiresAt` and `refreshToken` through the chain.

## HMAC signing note

`syncToDevServer` HMAC is computed over the **core** fields only (`{ provider, userId, accountName, accountId, accessToken, metadata }`). Extra fields (`refreshToken`, `expiresAt`) are passed in the body alongside the signature but NOT included in the HMAC. This matches what `oauth-sync` validates. Do not add new fields to the HMAC payload without updating both sides.

## Diagnostic clues

- Connected Accounts page shows "Token invalid (400)" + "Upload scope: Missing" → always means expired access token, NOT missing scope
- DB `metadata.uploadScopeGranted=true` with `scopeCheckedAt` from days ago → scopes were granted; diagnostic failure is secondary
- `expires_at = NULL` → dev-sync path; refresh guard will never fire without the fix
