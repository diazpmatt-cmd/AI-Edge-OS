# Lead Bridge Hardening Test Matrix

Last updated: 2026-08-03
Scope: PR #111 / Issue #110
Status: implementation and non-live boundaries CI-verified; production activation remains blocked

## Purpose

This document defines the minimum verification required before the read-only Gmail Lead Bridge may be enabled in production. Passing unit and integration tests is not sufficient by itself. Production activation remains blocked until credentials, live Gmail behavior, restart recovery, and production health are verified.

## Current verified improvements

- Parsed mailbox-domain validation replaces substring trust for Yelp and Nextdoor senders.
- Lookalike domains such as `yelp.com.attacker.test` and `nextdoor.com.example.org` are rejected.
- Classifier fixtures cover Yelp follow-up, Yelp new lead, Yelp account notice, genuine Nextdoor opportunity, Nextdoor Opportunity Alerts promotion, spoofed sender, and unrelated mail.
- Gmail pagination is injectable, bounded, de-duplicated, and tested across multiple pages and an unfinished page cap.
- Gmail HTTP requests and token refresh are time-bounded and tested.
- Provider response bodies are excluded from thrown Gmail HTTP errors.
- Logged error text is length-bounded and tested to redact bearer and OAuth credential values.
- MIME traversal, depth, part count, header values, extracted text, summary, and notes are bounded; excessive depth and oversized content are tested as truncated/rejected inputs.
- Poll retries use tested capped exponential backoff.
- `LEAD_EMAIL_RUN_ONCE=true` has a tested exactly-one-cycle success and failure path.
- SIGINT/SIGTERM resolve an interruptible wait and stop new polling after the current operation.
- Database-enforced event identity prevents concurrent workers from creating two leads for one Gmail message.
- Conflicting payload hashes are quarantined instead of silently overwriting the claimed event.
- Malformed or oversized events have durable quarantine records with attempt counters.
- Gmail checkpoints persist with a bounded six-hour replay overlap.
- A controlled PostgreSQL fault proves a failed lead insert rolls back its event claim and does not advance the durable checkpoint.
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
| MIME | nested plain text | bounded text extracted | Verified |
| MIME | excessive depth | truncated/rejected without unbounded recursion | Verified |
| HTTP error | provider body contains sensitive text | status-only bounded error | Verified |

## Database and concurrency matrix

| Case | Required result | Status |
|---|---|---|
| Exact replay | same provider + external ID + payload | one durable lead | Verified by integration test |
| Concurrent replay | two workers ingest same message | one durable lead through database uniqueness | Verified by integration test |
| Identity conflict | same external ID, different payload hash | conflict/quarantine record, no second lead | Verified by integration test |
| Quarantine replay | same rejected event repeats | one record with incremented attempts | Verified by integration test |
| Worker success state | checkpoint and counters recorded | durable values query correctly | Verified by integration test |
| Worker failure state | safe code, count, and timestamp recorded | durable values query correctly | Verified by integration test |
| Transaction failure | lead insert fails | transaction rolls back and checkpoint does not advance | Verified by PostgreSQL fault-injection test |
| Restart overlap | overlap re-reads recent messages | policy + atomic dedup verified; live restart pending |

## Gmail and worker integration matrix

| Case | Required result | Status |
|---|---|---|
| Pagination | multiple result pages | all unique IDs returned in first-seen order up to approved cap | Verified by injected-client test |
| Page cap | backlog exceeds cap | capped result is explicit and recoverable | Verified by injected-client test |
| HTTP timeout | Gmail request hangs | request aborts with bounded timeout error | Verified by injected-fetch test |
| Token timeout | refresh hangs | bounded failure returned | Verified by timeout test |
| 429/5xx | provider failure | safe classification and capped backoff | Backoff/error handling verified; `Retry-After` support remains optional hardening |
| malformed message | absent/unsupported content | no unbounded processing or customer lead creation | Boundary helpers verified; live fixture pending |
| oversized/deep message | excessive MIME/body | bounded processing and quarantine-capable result | MIME boundary tests and quarantine repository verified |
| one-cycle success | controlled preflight succeeds | one poll and no scheduled wait | Verified by runtime-loop test |
| one-cycle failure | controlled preflight fails | one failure record path and no retry loop | Verified by runtime-loop test |
| stale worker | no successful poll within threshold | persisted state reported stale | Code and policy verified |
| graceful stop | shutdown resolves during wait | worker exits without another poll | Verified by interruptible-wait/runtime test; live SIGTERM pending |

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

The Coolify stack validation for code commit `613aa91e96401f3f02aba68d927e464c27f822dd` completed successfully:

- dependency installation;
- library TypeScript build;
- 74 focused tests across 13 files;
- API production build;
- frontend production build;
- Docker Compose rendering;
- production image builds;
- `git diff --check`.

The preceding run exposed one real MIME-depth propagation defect. Commit `613aa91e96401f3f02aba68d927e464c27f822dd` corrected it, and the complete validation then passed.

## Remaining activation order

1. Recover the unhealthy primary Coolify application using runtime evidence rather than speculation.
2. Configure read-only Gmail OAuth secrets through the owner-controlled Coolify interface.
3. Run a controlled production one-cycle test without Gmail mutation.
4. Verify exact replay of one real Yelp notification creates one durable lead.
5. Verify one real Nextdoor Opportunity Alerts promotion remains ignored.
6. Verify restart catch-up re-reads the overlap without duplicates or missed messages.
7. Keep PR #111 draft and unmerged until every production gate is evidenced.

## Activation rule

Do not enable continuous production polling until every deployment and live-verification row required for activation is complete. No outbound Gmail or platform-response capability belongs in this milestone.
