---
name: GBP cooldown system
description: Structured GbpCooldown record and helpers replacing the old flat cooldownUntil approach; verifiedByApi guard; one-time admin endpoint pattern.
---

## GbpCooldown structure (src/lib/gbp-cooldown.ts)

Pure helpers with no DB dependency — fully testable. Key types:

- `GbpCooldown` — `startedAt / expiresAt / reason / endpoint / service / attemptCount / retryAfterSec / errorType`
- `GbpErrorType` — `rate_limit | daily_quota | project_quota_zero | access_denied | api_disabled | unknown`
- `GBP_COOLDOWN_DEFAULTS` — duration per errorType in seconds

Key behaviors:
- `readGbpCooldown`: auto-clears expired (returns null); handles legacy flat `cooldownUntil` too
- `buildGbpCooldownRecord`: reads Retry-After, does NOT push deadline forward on repeat hits, increments attemptCount
- `stripLegacyCooldownFields`: removes old flat keys on any metadata write

**Why:** The old flat `cooldownUntil` reset the timer on every blind retry, could never classify errors, and silently blocked valid retries after expiry.

## verifiedByApi guard (publishToGBP)

Cached `accountName` / `locationName` are ONLY trusted if `metadata.verifiedByApi === true`.
Without the flag, cache is discarded and discovery APIs are called fresh.

**Why:** During the July 2026 GBP pilot attempt, a Google user ID (`account_id` from social_connections) was incorrectly seeded as the GBP business account resource ID. The guard prevents any manually-set value from being used.

## GBP API blocking pattern (July 2026)

- Both Account Management and Business Information APIs returned 429 on first-ever call, persisting 7+ min.
- Error message said "per minute" but behavior is inconsistent with a simple rate limit.
- Root cause unconfirmed — most likely zero-quota or unapproved API access in GCP project 474786012895.
- Matthew must check console.cloud.google.com before any retry.

## One-time admin endpoint lesson

The `POST /social-posts/admin/bbb-gbp-pilot` bypass endpoint was removed after the session per TARGET.
**Never leave a hardcoded-secret bypass route in production** — even behind a header token.
Future one-off operations should go through the normal authenticated queue path.
