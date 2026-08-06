## Security boundary

This read-only status surface is authenticated through Clerk and scopes every task, post, and delivery query to the authenticated tenant. It never returns captions, media payloads, access tokens, connection metadata, or raw provider responses. Operator-visible diagnostics are redacted and truncated.
