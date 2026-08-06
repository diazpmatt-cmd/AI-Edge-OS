# Scheduler terminal publishing preflight handling

The scheduler treats a canonical publish result as an early rejection only when the result is failed, has zero verified publishes, and contains no platform delivery results. This indicates the canonical service rejected the post before delivery rows or provider calls began.

The rejection becomes terminal only through a tenant-scoped compare-and-set update that still finds the post in `scheduled`. If another worker has already moved the post to `publishing`, `published`, or another state, the update affects zero rows and the newer state is preserved.

Actual platform delivery failures remain in the delivery ledger and continue through the existing partial-result and bounded-retry pathways.
