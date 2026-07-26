# Clerk Client Identity Recovery Runbook

## Purpose

Prevent repeat failures where an authenticated user can sign in successfully but the API returns:

```json
{"error":"client_not_found","reason":"not_found"}
```

This runbook captures the production incident resolved on 2026-07-26 for the Bed Bugs & Beyond tenant.

## Core rule

The authoritative identity for tenant lookup is the Clerk JWT `sub` claim sent to the API.

Do **not** assume that any of the following are authoritative without checking the token:

- profile email
- connected Google or GitHub account
- `window.Clerk.user.id`
- a previously recorded Clerk user ID
- capitalization copied from an earlier note

PostgreSQL text matching is case-sensitive. The `clients.user_id` value must match the JWT `sub` value exactly, character for character.

## Incident root cause

The browser profile object and the token subject did not agree.

- Browser profile ID observed: `user_3H2xXm6f1rTsS3bLrJMxux1eUPEh`
- JWT `sub` actually sent to the API: `user_3FKEVWfSuyNsJz3oQ9kPH5nzKDm`

The database was temporarily updated to the browser profile ID, which did not solve the issue. The API correctly used the JWT `sub` value. Updating `clients.user_id` to the exact token subject resolved the failure immediately.

## Fast diagnostic order

Use this sequence before changing code, redeploying repeatedly, or editing tenant data.

### 1. Reconnect first

When Clerk requests begin looping or returning repeated `400` responses:

1. Sign out of the application.
2. Close all application tabs.
3. Reopen the application.
4. Sign in again.
5. Re-run the token checks below.

A reconnect frequently refreshes stale session state and reduces misleading noise.

### 2. Confirm the token can be issued

In the browser console:

```javascript
await window.Clerk.session.getToken()
```

Expected: a long JWT beginning with `eyJ`.

Do not paste or screenshot the full token. If exposed, sign out after testing to invalidate the session.

### 3. Read the authoritative Clerk identity

In the browser console:

```javascript
JSON.parse(
  atob(
    (await window.Clerk.session.getToken())
      .split('.')[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
  )
).sub
```

Record the returned `user_...` value exactly, including capitalization.

### 4. Confirm the Referral API response

```javascript
fetch('/api/referrals/programs', {
  headers: {
    Authorization: `Bearer ${await window.Clerk.session.getToken()}`
  }
}).then(async response =>
  console.log('STATUS:', response.status, 'BODY:', await response.text())
)
```

Interpretation:

- `401`: authentication/token validation problem
- `404 client_not_found`: token is accepted, but no exact active tenant match exists
- `200`: identity resolution is working

### 5. Verify the live API database row

Run from the **API container**, not the host shell and not the web container.

The runtime API bundle is located at:

```text
/app/artifacts/api-server/dist/index.mjs
```

The production image may not include `psql`. Use the installed `pg` package when necessary.

First locate it:

```sh
find /app -path '*/node_modules/pg/package.json' -print -quit
```

Then query the live database using the returned package path. Verify:

- current database
- database user
- server address
- `clients.user_id`
- tenant slug
- `is_active`

### 6. Update only after the token subject is known

Update `clients.user_id` only to the exact JWT `sub` value.

Example pattern:

```sql
UPDATE clients
SET user_id = '<EXACT_JWT_SUB>',
    updated_at = NOW()
WHERE slug = 'bed-bugs-and-beyond'
RETURNING id, user_id, slug, client_name, is_active;
```

Expected result: exactly one active Bed Bugs & Beyond row.

No redeploy is required for this database-only correction.

## Container and terminal rules

### Host shell

Prompt resembles:

```text
root@aiedge-prod-01:~#
```

Use Docker commands here.

### Container shell

Prompt resembles:

```text
#
```

Docker commands are unavailable inside the container. Run Node/database commands directly.

### Correct container selection

- `api-...`: application server and database access
- `web-...`: Nginx/static frontend and upstream routing checks

Never paste expected output such as `user_id: '...'` into the shell as a command.

## Routing verification

If the API logs do not show a request, verify Nginx and Docker DNS before assuming code was lost.

Nginx forwards:

```nginx
location /api/ {
  proxy_pass http://api:3000/api/;
}
```

From the web container:

```sh
getent hosts api
```

Compare that address with the current API container address from the host. In this incident, both matched, so stale upstream routing was ruled out.

## Deployment verification

Do not trust a successful-looking page alone.

Confirm all three:

1. Coolify deployment commit matches GitHub `main`.
2. Running API bundle contains the expected code marker.
3. Live endpoint behavior reflects the change.

For the temporary diagnostic used during this incident:

```sh
grep -o "\[CLIENT-LOOKUP\]" /app/artifacts/api-server/dist/index.mjs | head
```

## Do-not-repeat checklist

- Do not match tenant records by email.
- Do not trust `window.Clerk.user.id` over JWT `sub`.
- Do not ignore capitalization differences in Clerk IDs.
- Do not update the database before decoding the token.
- Do not run SQL directly in a normal shell.
- Do not assume `psql` exists in the production image.
- Do not run Docker commands from inside a container.
- Do not redeploy repeatedly for a database-only identity correction.
- Do not expose full JWTs in screenshots or chat.
- Reconnect/sign out and back in early when Clerk session behavior becomes noisy.

## Successful acceptance result

After setting `clients.user_id` to the exact JWT subject, the Referral page loaded successfully and the zero-dollar test referral program was created for Bed Bugs & Beyond.

This incident confirms the operating principle:

> Every setback should produce a durable runbook, a faster diagnostic path, and less user frustration the next time.
