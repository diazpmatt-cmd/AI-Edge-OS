# Apollos weekly delivery status

`GET /api/agent-tasks/:id/weekly-delivery-status` is an authenticated, tenant-scoped, read-only operator endpoint.

It validates the stored weekly campaign contract, reads the campaign posts and platform delivery ledger, selects only the latest attempt for each post/platform pair, and returns aggregate plus per-platform lifecycle counts.

A delivery is counted as published only when the latest delivery row is `published` and contains an external post ID or URL. Receipt-less published rows are surfaced as `receipt_missing` failures.

The endpoint performs no task, post, delivery, scheduling, retry, or provider mutation. Provider diagnostics are redacted and truncated before being returned.
