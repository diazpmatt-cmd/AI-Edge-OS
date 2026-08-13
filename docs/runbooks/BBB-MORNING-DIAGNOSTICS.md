# BB&B Morning Diagnostics — Apollos read-only tool contract

The morning diagnostic workflow must use the authenticated Apollos MCP surface and keep tenant selection server-authorized.

## Read-only tools

1. `apollos_get_client_coverage`
   - Select Bed Bugs & Beyond through the normal authorized `clientId` flow.
   - Read Facebook, Instagram, Google Business Profile, and YouTube capability state from the existing client coverage result.
   - Treat `AUTHORIZATION_REQUIRED`, `MISCONFIGURED`, `DEGRADED`, `BLOCKED`, or missing platform evidence as attention required; never infer a healthy connection from infrastructure uptime alone.

2. `apollos_get_weekly_publishing_health`
   - Select the same authorized client.
   - Reads only the newest validated `weekly_campaign` task for the resolved tenant owner.
   - Reuses the canonical weekly delivery summary and requires an external provider post ID or URL for every published delivery.
   - Returns only `verified`, `needs_attention`, or `unverified`.
   - `verified` requires every planned platform lane and every expected delivery to have receipt-backed success.
   - Missing campaign, unreadable ledger, invalid campaign contract, or missing lane evidence returns `unverified`.
   - Failed, skipped, unresolved, partial, or receipt-missing deliveries return `needs_attention`.

## Automation boundary

The morning diagnostic may read and report these results. It must not call publishing, retry, OAuth mutation, scheduler mutation, deployment, provider-spend, or credential-management tools. Do not wire the recurring automation to this contract until an authenticated human test confirms both tools return the expected Bed Bugs & Beyond tenant and sanitized data.
