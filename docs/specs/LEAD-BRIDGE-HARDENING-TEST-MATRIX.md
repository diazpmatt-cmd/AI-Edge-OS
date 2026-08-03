# Lead Bridge Hardening Test Matrix

Last updated: 2026-08-03
Scope: PR #111 / Issue #110
Status: implementation hardened and CI-verified; live production activation remains blocked

## Purpose

This document defines the minimum verification required before the read-only Gmail Lead Bridge may be enabled in production. Passing classifier unit tests alone is insufficient. Production activation remains blocked until credentials, live Gmail behavior, restart recovery, and production health are verified.

## Current verified improvements

- Parsed mailbox-domain validation replaces substring trust for Yelp and Nextdoor senders.
- Lookalike domains such as `yelp.com.attacker.test` and `nextdoor.com.example.org` are rejected.
- Classifier fixtures cover Yelp follow-up, Yelp new lead, Yelp account notice, genuine Nextdoor opportunity, Nextdoor Opportunity Alerts promotion, spoofed sender, and unrelated mail.
- Gmail list pagination is bounded and configurable.
- Gmail HTTP requests and token refresh are time-bounded.
- Provider response bodies are not included in thrown Gmail HTTP errors.
- Logged error text is length-bounded and tested to redact bearer and OAuth credential values.
- MIME traversal, part count, header values, extracted text, summary, and notes are bounded.
- Poll retries use tested capped exponential backoff.
- `LEAD_EMAIL_RUN_ONCE=true` provides a bounded one-cycle verification mode.
- SIGINT/SIGTERM stop new message processing after the current operation.
- Database-enforced event identity prevents two workers from creating two leads for the same Gmail message.
- Conflicting payload hashes are quarantined instead of silently overwriting the claimed event.
- Malformed or oversized events have durable quarantine records with attempt counters.
- Gmail checkpoints persist with a bounded six-hour replay overlap.
- Worker attempt, success, failure, checkpoint, counts, and safe error code persist durably.
- `/lead-email/status` exposes safe health, stale/degraded state, checkpoint, counts, and `lastSuccessfulPollAt` without customer content or credentials.
- A dedicated `lead-email-worker` Compose service is isolated from website/API health and remains inert unless explicitly enabled.

## Unit test matrix

| Area | Case | Required result | Status |
|---|---|---|---|
| Sender parsing | Yelp address inside angle brackets | Exact mailbox extracted | Verified |
| Sender parsing | Nextdoor reviewed subdomain | Classified as Nextdoor | Verified |
| Sender spoofing | `yelp.com.attacker.test` | Rejected as other | Verified |
| Sender spoofing | trusted name in display name, unrelated mailbox | Rejected as other | Verified |
| Yelp | new lead | Lead, urgent, fields extracted | Verified |
| Yelp | reminder/follow-up | Follow-up, urgent, fields extracted | Verified |
| Yelp | security/account email | Account notice, not lead | Verified |
| Nextdoor | genuine opportunity | Lead, urgent, fields extracted | Verified |
| Nextdoor | Opportunity Alerts upsell | Promotion, not actionable | Verified |
| Checkpoint query | no checkpoint | original bounded query | Verified |
| Checkpoint query | checkpoint present | bounded replay overlap added | Verified |
| Backoff | repeated failures | capped exponential delay | Verified |
| Error safety | bearer/OAuth values in error | values redacted | Verified |
| Health | missing or overdue success | stale | Verified |

## Database and concurrency matrix

| Case | Required result | Status |
|---|---|---|
| Exact replay | same provider + external ID + payload | one durable lead | Verified by integration test |
| Concurrent replay | two workers ingest same message | one durable lead through database uniqueness | Verified by integration test |
| Identity conflict | same external ID, different payload hash | conflict/quarantine record, no second lead | Verified by integration test |
| Quarantine replay | same rejected event repeats | one record with incremented attempts | Verified by integration test |
| Worker success state | checkpoint and counters recorded | durable values query correctly | Verified by integration test |
| Worker failure state | safe code, count, and timestamp recorded | durable values query correctly | Verified by integration test |
| Transaction failure | lead insert fails | checkpoint does not advance | Pending fault-injection test |
| Restart overlap | overlap re-reads recent messages | policy + dedup verified; live restart pending |

## Gmail and worker integration matrix

| Case | Required result | Status |
|---|---|---|
| Pagination | more than 50 matches | all pages processed up to approved cap | Code added; injected-client test pending |
| Page cap | backlog exceeds cap | warning and recoverable continuation | Code added; injected-client test pending |
| HTTP timeout | Gmail request hangs | request aborts and backoff begins | Code added; injected-client test pending |
| Token timeout | refresh hangs | bounded failure and backoff | Code added; injected-client test pending |
| 429/5xx | provider failure | capped backoff; no data loss | Backoff verified; `Retry-After` support pending |
| malformed message | missing payload/headers | ignored or quarantined safely | Live fixture pending |
| oversized message | excessive MIME/body | bounded processing and quarantine | Code + quarantine repository verified; full MIME fixture pending |
| stale worker | no successful poll within threshold | persisted state reported stale | Code and policy verified |
| graceful stop | SIGTERM during page/message loop | no new message starts after stop flag | Code added; integration test pending |

## Deployment matrix

| Case | Required result | Status |
|---|---|---|
| Dedicated service | worker isolated from website/API health | Compose implemented and rendering verified |
| Default state | worker disabled without explicit enable flag | Implemented; inert sleep path |
| Secrets absent while disabled | no credential read or Gmail call | Implemented by Compose and worker gates; live container test pending |
| Health endpoint/state | last success/failure/checkpoint visible | Implemented and API build verified |
| Production image | worker entrypoint packaged | Production image build verified |
| Coolify restart | worker restarts without duplicate ingestion | Live verification pending |
| Production one-cycle | approved Gmail account, read-only scope | Owner credentials required |
| Yelp replay | one real Yelp email processed repeatedly | Owner credentials and live test required |
| Nextdoor promotion | real upsell remains ignored | Owner credentials and live test required |

## CI evidence

The validation run for commit `7dee44189d76896e56a730af733daf3f0906b3c1` passed:

- library TypeScript build;
- 59 focused tests across 11 files;
- API production build;
- frontend production build;
- Docker Compose rendering;
- production image builds;
- `git diff --check`.

## Remaining implementation and activation order

1. Add injected Gmail-client tests for pagination, timeouts, malformed MIME, one-cycle behavior, and graceful shutdown.
2. Add fault-injection coverage proving a failed lead insert cannot advance the checkpoint.
3. Recover the unhealthy primary Coolify application using runtime evidence rather than speculation.
4. Configure read-only Gmail OAuth secrets through the owner-controlled Coolify interface.
5. Run controlled one-cycle, exact replay, promotion-ignore, and restart-catch-up verification.
6. Keep PR #111 draft and unmerged until all production gates are evidenced.

## Activation rule

Do not enable continuous production polling until every deployment and live-verification row required for activation is complete. No outbound Gmail or platform-response capability belongs in this milestone.
