---
name: Integration Health History schema
description: integration_health_history table — what it stores, how it's created, persist pattern, and security constraints.
---

## Table: integration_health_history

Columns: id (uuid PK), user_id (text), provider (text), status (text: healthy|warning|failed),
checked_at (timestamptz), last_success_at (timestamptz nullable), response_time_ms (integer nullable),
error_code (text nullable), error_message (text nullable — sanitized, max 300 chars),
health_score (integer: 100|50|0), metadata (jsonb — non-sensitive only), created_at (timestamptz).

Indexes: idx_ihh_user_provider (user_id, provider), idx_ihh_checked_at (checked_at DESC).

## Creation method

Created via raw SQL `CREATE TABLE IF NOT EXISTS` inside a self-executing async IIFE at the top of
`artifacts/api-server/src/routes/diagnostics.ts`. Same pattern required for all new tables because
drizzle-kit push is blocked by the pre-existing review_platform_stats unique constraint conflict.

Drizzle schema definition still exists at `lib/db/src/schema/integration-health.ts` and is exported
from the index so Drizzle ORM insert calls (`db.insert(integrationHealthHistoryTable)`) work correctly.

## Persist pattern

`persistHealthSnapshot(userId, platforms, checkedAt)` is called fire-and-forget after every
`GET /diagnostics/health` response is sent to the client. It inserts one row per provider.
Auto-prunes records older than 90 days on every write via `DELETE ... WHERE checked_at < cutoff`.

## Security constraints — NEVER store

- OAuth access tokens, refresh tokens, API keys, secrets
- Raw error objects from provider SDKs
- Bearer headers or any string matching OAuth token patterns

`sanitizeDetail()` strips ya29.*, 1//*, Bearer tokens, and access/refresh_token= patterns
before storing error_message. Metadata JSONB only stores known-safe fields per provider
(locationTitle, cooldownUntil, uploadScopeGranted, channelName, publishReady).

## Read endpoint

`GET /diagnostics/health-history?provider=&limit=` — query via raw pool.query (not ORM)
to avoid Drizzle type issues with the JSONB column.

## Frontend

Collapsible "DEV" panel at the bottom of SystemDiagnosticsPage. Uses useQuery with
enabled: historyOpen (lazy — only fetches when open). 60s refetch interval.
