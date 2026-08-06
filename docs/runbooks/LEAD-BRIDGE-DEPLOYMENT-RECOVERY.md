# Lead Bridge Deployment, Rollback, and Recovery Runbook

Last updated: 2026-08-03
Applies to: Yelp and Nextdoor Gmail ingestion in PR #111

## Purpose

Deploy the read-only Lead Bridge without coupling customer-lead monitoring to the public website, prevent duplicate ingestion during retries and restarts, and provide an evidence-driven rollback path.

## Current implementation facts

The draft implementation currently:

- uses Google OAuth refresh-token credentials;
- lists Gmail messages matching an allowlisted query;
- fetches full matching messages read-only;
- classifies Yelp and Nextdoor mail deterministically;
- writes normalized lead records;
- deduplicates by `source=gmail-lead-bridge` and `eventType=gmail:<message-id>`;
- requires `LEAD_EMAIL_WORKER_ENABLED=true` to operate;
- enforces a minimum poll interval of 60 seconds;
- does not send, archive, label, mark read, delete, or otherwise mutate mail.

The current implementation does **not yet** provide a durable high-water checkpoint, Gmail pagination beyond the first returned page, exponential backoff, dead-letter quarantine, a last-success heartbeat, a dedicated production service, or a verified live OAuth preflight.

## Required architecture before production activation

Run the Lead Bridge as a dedicated Coolify service or compose worker rather than inside the website or API request process.

Required properties:

- independent restart policy;
- no public ingress;
- no customer-reply capability;
- protected Gmail credentials available only at runtime;
- database network access limited to the required application database;
- explicit health/readiness reporting;
- kill switch through `LEAD_EMAIL_WORKER_ENABLED=false`;
- bounded logs with customer-data redaction;
- deployment independent from the public web container.

## Pre-deployment gates

Do not activate the worker until all applicable gates pass:

1. Primary production application and PostgreSQL are healthy.
2. PR #111 is still open and unmerged while live verification is pending.
3. The exact deployment commit is recorded.
4. Gmail OAuth secrets are configured through the protected Coolify path.
5. OAuth scope is exactly Gmail read-only.
6. The worker is deployed with `LEAD_EMAIL_WORKER_ENABLED=false`.
7. Database migration requirements are reviewed; no destructive migration is required for this slice.
8. Classifier unit tests pass in CI.
9. Compose/build validation passes in CI.
10. The Gmail query is reviewed for intended sender coverage and bounded lookback.
11. Logs are confirmed not to print token values, raw message bodies, or unrestricted Gmail errors.
12. Operator rollback access is confirmed.

## Disabled-mode deployment

1. Deploy the reviewed commit with the worker disabled.
2. Confirm the worker process starts and exits or idles according to the intended supervisor model.
3. Confirm no Gmail API request occurs.
4. Confirm no lead record is written.
5. Confirm public web/API health is unchanged.
6. Confirm the dedicated service can be stopped without affecting the website.

## Controlled read-only preflight

Use one known Yelp notification and one known Nextdoor promotional or opportunity email.

1. Enable a one-cycle or bounded preflight mode if implemented.
2. Authenticate as `mattdiaz@bedbugsandbeyond.net`.
3. Confirm Gmail message listing succeeds.
4. Confirm the controlled messages can be fetched.
5. Record classification output without sending or mutating mail.
6. Verify the Yelp message becomes an actionable lead only when the content actually represents a customer inquiry.
7. Verify the Nextdoor promotional message becomes `ignored` rather than a customer lead.
8. Confirm only normalized bounded fields enter the database.
9. Confirm logs contain no full customer message or credential.

If a bounded one-cycle mode does not exist, add it before production activation rather than using an unattended infinite loop as the first live test.

## Idempotency verification

For the same controlled Gmail message:

1. Run ingestion once and record the resulting lead ID.
2. Run ingestion again without changing the source message.
3. Confirm no second lead record is created.
4. Restart the worker.
5. Run ingestion again.
6. Confirm the original record remains the only record.
7. Confirm a conflicting payload for the same Gmail message ID is surfaced for review rather than silently duplicated or overwritten.

## Restart and catch-up verification

After durable checkpointing is implemented:

1. Record the current successful checkpoint.
2. Stop the worker.
3. Deliver or identify controlled matching mail during downtime.
4. Restart the worker.
5. Confirm the missed message is ingested once.
6. Confirm older already-processed messages are skipped.
7. Confirm checkpoint advancement occurs only after durable record insertion.
8. Simulate a failure before checkpoint advancement and verify safe replay.

## Runtime health requirements

The production worker should expose or persist:

- runtime ID;
- enabled/disabled state;
- last poll started time;
- last poll succeeded time;
- last failed time;
- consecutive failure count;
- current retry-after time;
- number of messages listed, fetched, actionable, ignored, duplicated, and failed;
- last durable checkpoint;
- credential readiness without revealing credential values;
- database readiness;
- stale threshold and stale status.

A process being alive is not sufficient evidence that Gmail polling is succeeding.

## Failure behavior

### OAuth failure

- Stop repeated rapid attempts.
- Report a bounded reason such as `oauth_refresh_failed`.
- Do not print provider response bodies containing sensitive detail.
- Keep existing lead data unchanged.
- Require credential review or reauthorization.

### Gmail rate limit or temporary provider failure

- Apply capped exponential backoff with jitter.
- Honor an official retry time when provided.
- Do not busy-loop.
- Do not advance the durable checkpoint past unprocessed messages.

### Malformed or unsupported email

- Store a bounded quarantine reference containing source, message ID hash/reference, received time, classifier version, and reason code.
- Do not store an unrestricted raw message in logs.
- Continue processing other independent messages.

### Database unavailable

- Do not acknowledge or checkpoint the message as complete.
- Back off and retry safely.
- Preserve idempotency on recovery.

### Duplicate or uniqueness conflict

- Treat the existing durable record as the source of truth when the source ID and payload identity match.
- Surface conflicting content for review when identity matches but normalized payload differs.

### Classifier defect

- Disable the worker.
- Preserve source references and affected record IDs.
- Correct the classifier and add a regression fixture.
- Reprocess only through an explicit bounded recovery operation.

## Rollback triggers

Immediately disable the worker when:

- customer emails are modified;
- duplicate records are created;
- promotional messages are repeatedly classified as leads;
- credentials or customer content appear in logs;
- polling enters a rapid failure loop;
- database performance is materially affected;
- the worker causes the API or website to become unhealthy;
- an unexpected OAuth scope is observed;
- lead records cannot be traced to a source message reference.

## Rollback procedure

1. Set `LEAD_EMAIL_WORKER_ENABLED=false` or stop only the dedicated worker service.
2. Do not stop the website or unrelated workers unless independently required.
3. Revoke Gmail credentials only when exposure or unauthorized behavior is suspected.
4. Record deployment commit, timestamps, reason code, affected message references, and affected lead IDs.
5. Preserve bounded logs and database evidence.
6. Identify records created during the faulty window.
7. Do not delete records automatically; mark or quarantine them for operator review.
8. Revert to the last verified worker image or leave the service disabled.
9. Add a regression test for the failure.
10. Repeat disabled-mode deployment, controlled preflight, idempotency, and restart verification before reactivation.

## Recovery from missed messages

A recovery scan must be bounded by:

- explicit start and end time;
- reviewed Gmail query;
- maximum pages/messages;
- read-only access;
- existing deduplication rules;
- dry-run count and classification summary before writes;
- operator-approved execution when the range is unusually large;
- completion report with processed, duplicate, ignored, quarantined, and failed counts.

Never remove the query time boundary and scan the entire mailbox as an emergency shortcut.

## Production completion evidence

The Lead Bridge is production-verified only when:

- dedicated service isolation is confirmed;
- protected OAuth secrets are configured;
- controlled preflight passes;
- one Yelp lead is persisted once across repeat polls;
- one Nextdoor promotion is ignored;
- restart catch-up succeeds without duplicates;
- health and last-success state are visible;
- logs pass redaction review;
- rollback is tested or demonstrated in disabled mode;
- the worker remains stable for the agreed observation period;
- PR #111 acceptance evidence is attached before merge.

## Current blockers

- Primary Coolify Docker Compose application remains `exited:unhealthy`.
- Runtime logs identifying the production crash are not available through the current connector.
- Gmail OAuth client ID, client secret, and refresh token require authenticated owner configuration.
- The current worker lacks several reliability controls listed above.

No deployment, merge, production restart, customer reply, or mailbox mutation was performed while creating this runbook.
