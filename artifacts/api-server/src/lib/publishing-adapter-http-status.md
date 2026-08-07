# Internal adapter partial-result status

A protected loopback provider-adapter response with a valid `results` envelope may be normalized from a 5xx status to HTTP 207 so `PublishingService` consumes and preserves its per-platform results. Unstructured server failures remain unchanged.
