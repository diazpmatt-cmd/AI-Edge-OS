# Lead Bridge and Channel Expansion Handoff

Date: 2026-08-03
Repository: `diazpmatt-cmd/AI-Edge-OS`
Working branch: `feature/lead-bridge-yelp-nextdoor`
Draft pull request: #111

## Current delivery state

The branch contains a disabled-by-default, read-only Gmail Lead Bridge for Yelp and Nextdoor plus durable planning and evidence packages for production recovery, Apple Business, Bing Places, AI discovery, and additional acquisition channels.

The Lead Bridge does not send, reply, archive, delete, mark read, publish, change billing, or modify a third-party listing. It remains unmerged and undeployed.

## Latest hardening package

Branch commits added after the last verified CI head:

- `a58c02f1a2843bd8d777b9fe8d1e45ee7b8d0de2` — validate Gmail message identifiers, reject empty access tokens and oversized queries, and cap provider message arrays to the requested 50-message page size.
- `b724494d9b860bfc6cd278126d7d609eb0cd6c06` — construct Gmail full-message paths only through the validated path helper.
- `77375d88f5a790404fe02f0da7034b6cbe4e5c24` — add focused tests for malformed IDs, path traversal attempts, oversized IDs, page bounds, empty credentials, and oversized queries.

GitHub Actions run 131 was in progress when this handoff was written. Do not describe these commits as CI-verified until the run concludes successfully.

## Previously verified Lead Bridge capabilities

At commit `8f8061d975c383b50254cf61263e5b572ee57173`, Coolify stack validation passed 79 focused tests, library typecheck, API and frontend production builds, Compose rendering, production image builds, and `git diff --check`.

Verified behavior at that point includes:

- parsed exact-domain trust and spoof/lookalike rejection;
- bounded Gmail pagination, MIME extraction, request/token timeouts, and provider errors;
- capped exponential backoff with bounded `Retry-After` handling;
- exactly-one-cycle test mode and graceful shutdown;
- database-enforced duplicate protection and payload-conflict quarantine;
- durable checkpointing with bounded replay overlap;
- rollback-safe persistence and checkpoint behavior;
- persisted worker success/failure state and safe status reporting;
- a dedicated worker service that is inert unless explicitly enabled.

## Production recovery evidence

Primary Coolify Compose application:

- UUID: `rkonpoppxacsnlfkqmf6yct6`
- branch: `main`
- Compose file: `/docker-compose.coolify.yml`
- status: `exited:unhealthy`
- restart count: 11
- maximum restart count: 10
- last restart type: `crash`
- deployed commit field: `HEAD`

Separate static/frontend application:

- UUID: `h3yxpr01zd7th0dimwq5yiu2`
- URL: `https://alex.aiedgesolutions.online`
- status: `running:unknown`
- restart count: 0

The separate frontend's state does not prove that the primary API/Compose stack is healthy. Current read-only Coolify access still does not expose bounded deployment logs, container logs, per-service state, or an immutable deployed commit SHA. Root cause remains unproven. See Issue #124 and `docs/runbooks/PRODUCTION-RECOVERY-INVESTIGATION.md`.

## Apple Business and AI discovery

Prepared artifacts include:

- `docs/runbooks/APPLE-BUSINESS-PREPARATION.md`
- `docs/templates/APPLE-BUSINESS-LISTING-DATA-SHEET.md`
- `docs/templates/APPLE-BUSINESS-VERIFICATION-EVIDENCE-LOG.md`
- `docs/specs/APPLE-MAPS-ATTRIBUTION-SPEC.md`
- `docs/roadmaps/AI-DISCOVERY-PARTNER-PLAN.md`
- `docs/specs/AI-DISCOVERY-BENCHMARK-CORPUS.md`
- `docs/specs/BED-BUGS-AND-BEYOND-WEBSITE-AI-DISCOVERY-AUDIT.md`
- `docs/templates/AI-DISCOVERY-AUDIT-EVIDENCE-LOG.md`

Do not apply crawler, canonical, sitemap, or structured-data changes to the AI Edge Solutions frontend as a substitute for the authoritative Bed Bugs & Beyond website.

## Open issues

- #110 — Lead Bridge production acceptance
- #112 — Apple Business listing preparation and verification
- #113 — AI discovery visibility
- #114–#123 — channel implementation packages
- #124 — primary Coolify production recovery
- #125 — approval-gated YouTube publishing adapter

## Owner-required gates

1. Supply protected Gmail read-only OAuth credentials through Coolify; never commit them.
2. Provide authenticated Apple Business listing access and confirm phone, website, hours, categories, imagery, and verification evidence.
3. Identify or grant access to the authoritative Bed Bugs & Beyond website repository and production property.
4. Provide bounded primary Coolify deployment/container logs and exact deployed-version evidence.
5. Approve any future merge, production deployment, billing, account creation, public publication, customer response, or live-listing modification separately.

## Safe continuation order

1. Wait for and inspect GitHub Actions run 131.
2. If CI fails, use the first failing step and bounded logs to prepare the smallest branch-only correction.
3. If CI passes, update PR #111 and its hardening matrix with the exact run and test count.
4. Continue production recovery only with read-only evidence until the failing service and exception are proven.
5. Continue documentation, test specifications, and issue refinement for blocked external channels without claiming live activation.

## Completion truth

No merge, deployment, restart, account creation, billing change, customer message, public post, or live listing modification is part of this handoff. Checklist boxes must remain unchecked unless the full stated capability is committed and verified.
