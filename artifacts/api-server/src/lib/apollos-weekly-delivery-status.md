# Apollos weekly delivery status

`GET /api/agent-tasks/:id/weekly-delivery-status` is an authenticated, tenant-scoped, read-only operator endpoint.

It validates the stored weekly campaign contract, reads the campaign posts and platform delivery ledger, selects only the latest attempt for each post/platform pair, and returns aggregate plus per-platform lifecycle counts.

A delivery is counted as published only when the latest delivery row is `published` and contains an external post ID or URL. Receipt-less published rows are surfaced as `receipt_missing` failures.

## Lifecycle meanings

- `generated`: all expected drafts exist.
- `approved`: all expected drafts are approved.
- `scheduled`: all expected drafts have reached the scheduled delivery stage.
- `attempted`: at least one latest platform delivery attempt exists.
- `partial`: at least one delivery has a verified external receipt and at least one delivery failed, was skipped, or remains unresolved.
- `published`: every expected delivery has a verified external post ID or URL.
- `failed`: no delivery has a verified receipt and every expected delivery has a terminal failure, skip, or receipt-missing result.

## Operator use

Use the endpoint after a weekly package is approved and scheduled to determine which platform lanes have verified external receipts, which lanes need attention, and whether any provider reported a receipt-less success. The endpoint does not retry or mutate delivery state.

## Security boundary

The endpoint scopes every task, post, and delivery query to the authenticated tenant. It never returns captions, media payloads, access tokens, connection metadata, or raw provider responses. Operator-visible diagnostics are redacted and truncated.

The endpoint performs no task, post, delivery, scheduling, retry, or provider mutation.
