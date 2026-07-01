---
name: GorillaDesk API
description: GorillaDesk public REST API structure, auth, and available endpoints.
---

## Base URL
`https://api.gorilladesk.com/v1`

## Auth
Bearer token in `Authorization` header. Key stored as `GORILLADESK_API_KEY` secret.

Note: `app.gorilladesk.com/api/*` returns the SPA HTML for all paths (misleading 200s) — the real JSON API is only at `api.gorilladesk.com/v1`.

## Available Endpoints (as of 2026-07)
- `GET /company` — company info (name, phone, address, timezone)
- `GET /users` — staff/technician list
- `GET /customers` — paginated customer list

**No endpoints exist** for: jobs, invoices, payments, transactions, routes, schedules, lead sources, analytics, reports.

## Customers Endpoint
- Pagination via `has_more` boolean + `created[gt]` date cursor (not offset/page-based)
- Max limit: 100 per page
- Filter params: `state` (active|deleted), `status` (active|inactive|lead), `created[gte/gt/lt/lte]`, `updated[gte/gt/lt/lte]`
- Customer object has `source: {id, name} | null` — this is the lead source field

**Why `starting_after=<id>` doesn't work:** The API ignores unknown cursor params and restarts from the beginning. Use `created[gt]` timestamp from the last record instead.

## Derived Metrics
From the customers list you can compute:
- Total/active customer count (filter `state === "active"`)
- New customers this month (filter `created` within month range)
- Lead source breakdown (group by `source.name`)

**Cannot compute** from the API: revenue, job counts, payment methods, AR aging.

## Data Architecture
- Revenue, jobs, customers (active_services/recurring) → manual_import snapshots in `gorilladesk_metric_snapshots`
- Customer list + lead sources → api_sync snapshots written by `POST /api/analytics/gorilladesk/sync`
- Payments breakdown → individual rows in `gorilladesk_payments` (seeded from GorillaDesk export)
- `getSnapshot()` in gorilladesk.ts prefers `api_sync` source over `manual_import` when both exist

**Why:** API has no financial data — only customers. Revenue/jobs come from manual export. Lead sources now come from live API sync.
