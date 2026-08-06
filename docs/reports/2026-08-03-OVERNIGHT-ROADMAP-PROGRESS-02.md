# Overnight Roadmap Progress Report 02

Date: 2026-08-03
Branch: `feature/lead-bridge-yelp-nextdoor`
Pull request: draft PR #111

## Completed and verified

### Lead Bridge hardening

- Added database-enforced event uniqueness by provider + Gmail message ID.
- Added transactional event claim and lead insertion so concurrent workers create one lead.
- Added payload-conflict detection and quarantine rather than silent overwrite.
- Added durable quarantine records with repeat-attempt counters.
- Added durable checkpoint, bounded replay overlap, worker attempts, successes, failures, counts, and safe error codes.
- Added tested capped exponential backoff, credential redaction, checkpoint query, checkpoint advancement, and stale detection.
- Added safe `/lead-email/status` reporting with `lastSuccessfulPollAt`, checkpoint, counts, and stale/degraded state.
- Added a dedicated disabled-by-default Compose worker service independent of website/API health.
- Updated Issue #110 to remove the stale Zapier-first direction and reflect the approved read-only Gmail architecture.
- Updated PR #111 and the hardening test matrix with current implementation and remaining blockers.

### Verification

The validation run for code commit `7dee44189d76896e56a730af733daf3f0906b3c1` passed:

- library TypeScript build;
- 59 focused tests across 11 files;
- concurrent duplicate, payload-conflict, quarantine, checkpoint, and worker-state integration tests against PostgreSQL;
- API production build;
- frontend production build;
- Docker Compose rendering;
- production image builds;
- `git diff --check`.

### Production recovery investigation

- Added a change-isolation report comparing the last recorded healthy deployment commit with current `main`.
- Verified current `main` is 85 commits ahead of the recorded healthy commit and the regression window includes material Dockerfile and Compose changes.
- Reconfirmed the Coolify application remains `exited:unhealthy`, restart count 11 against maximum 10, and reports `HEAD` instead of an immutable deployed SHA.
- Reconfirmed standalone PostgreSQL remains `running:healthy`, restart count 0, with health checks passing.
- Added the database isolation evidence to Issue #124.

### Apple Business preparation

- Created a listing data sheet with repository-verified name, region, time zone, service areas, and service-policy controls.
- Left phone, website, hours, legal name, location visibility, categories, imagery, action links, and verification documents blank rather than guessing.
- Added the prepared artifact and owner-required fields to Issue #112.

### AI discovery visibility

- Created a provider-neutral benchmark corpus for ChatGPT Search, Google AI/Gemini discovery, Claude web search, Perplexity, and Bing/Copilot.
- Added unbranded discovery, informational, and named-entity accuracy queries.
- Added location/session evidence, citation recording, factual-accuracy scoring, and prohibited-service regression gates.
- Added the artifact and remaining public-site blocker to Issue #113.

### Checklist updates

Newly checked after committed evidence and CI verification:

- 12 — isolated lead-worker service
- 13 — durable checkpoint and restart-safe overlap foundation
- 14 — backoff, quarantine, redacted logging, and stale detection
- 15 — health/readiness and last-success reporting
- 70 — canonical business-identity audit

## Failed attempt and correction

The first hardening CI attempt exposed a real redaction defect: a replacement expression echoed the captured OAuth value while relabeling it. The code was corrected in `7dee4418`; the redaction test then passed. No credential was involved—the test used synthetic fixture values.

## Exact blockers

### Production recovery

- The Coolify connector does not expose container/runtime logs.
- The failed deployment is identified as `HEAD`, not an immutable SHA.
- The first failing Compose service, exception, exit code, health-check response, and environment/file state remain unknown.

### Lead Bridge production activation

- Primary Coolify application must be recovered first.
- Injected Gmail-client tests remain for pagination, timeout, malformed MIME, one-cycle failure/success, and graceful shutdown.
- A fault-injection test remains for failed lead persistence versus checkpoint advancement.
- Protected Gmail OAuth values are not configured in Coolify.
- Controlled live one-cycle, Yelp replay, Nextdoor promotion-ignore, and restart-catch-up verification remain incomplete.

### Apple Business

- Live claim/verification requires the owner-controlled Apple account and verification evidence.
- Public phone, website, hours, address/service-area model, categories, media, and action links require owner confirmation.

### AI discovery

- The authoritative Bed Bugs & Beyond public website is not contained in this repository, so crawler, sitemap, structured-data, canonical, and public-content changes cannot safely be applied here.

## Owner-required actions

1. Complete protected Gmail OAuth authorization and Coolify secret entry after production recovery.
2. Confirm Apple Business phone, website, hours, legal name, service-area/address visibility, categories, media, action links, and verification documents.
3. Provide or connect the authoritative Bed Bugs & Beyond website repository before public crawler or structured-data changes.

## Safety record

No pull request was merged. No production deployment, restart, configuration mutation, external-account creation, billing change, customer message, public post, or live third-party listing change occurred.
