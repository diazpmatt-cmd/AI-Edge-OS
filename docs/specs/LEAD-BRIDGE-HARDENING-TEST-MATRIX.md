# Lead Bridge Hardening Test Matrix

Last updated: 2026-08-03
Scope: PR #111 / Issue #110
Status: implementation in progress; not production-ready

## Purpose

This document defines the minimum verification required before the read-only Gmail Lead Bridge may be enabled in production. Passing classifier unit tests alone is insufficient. Production activation remains blocked until database, worker, deployment, credential, and live replay behavior are verified.

## Current verified improvements

- Parsed mailbox-domain validation replaces substring trust for Yelp and Nextdoor senders.
- Lookalike domains such as `yelp.com.attacker.test` and `nextdoor.com.example.org` are rejected.
- Classifier fixtures cover Yelp follow-up, Yelp new lead, Yelp account notice, genuine Nextdoor opportunity, Nextdoor Opportunity Alerts promotion, spoofed sender, and unrelated mail.
- Gmail list pagination is bounded and configurable.
- Gmail HTTP requests and token refresh are time-bounded.
- Provider response bodies are not included in thrown Gmail HTTP errors.
- Logged error text is length-bounded and redacts common bearer-token forms.
- MIME traversal, part count, header values, extracted text, summary, and notes are bounded.
- Poll retries use capped exponential backoff.
- `LEAD_EMAIL_RUN_ONCE=true` provides a bounded one-cycle verification mode.
- SIGINT/SIGTERM stop new message processing after the current operation.

These improvements do not complete durable checkpointing, atomic deduplication, quarantine, persisted health state, or production service wiring.

## Unit test matrix

| Area | Case | Required result | Status |
|---|---|---|---|
| Sender parsing | Yelp address inside angle brackets | Exact mailbox extracted | Implemented |
| Sender parsing | Nextdoor reviewed subdomain | Classified as Nextdoor | Implemented |
| Sender spoofing | `yelp.com.attacker.test` | Rejected as other | Implemented |
| Sender spoofing | trusted name in display name, unrelated mailbox | Rejected as other | Implemented |
| Yelp | new lead | Lead, urgent, fields extracted | Implemented |
| Yelp | reminder/follow-up | Follow-up, urgent, fields extracted | Implemented |
| Yelp | security/account email | Account notice, not lead | Implemented |
| Yelp | promotion | Promotion, not actionable | Pending |
| Nextdoor | genuine opportunity | Lead, urgent, fields extracted | Implemented |
| Nextdoor | Opportunity Alerts upsell | Promotion, not actionable | Implemented |
| MIME | nested multipart within allowed depth | Plain text extracted | Pending |
| MIME | excessive depth/part count | Bounded without crash | Pending |
| Input limits | oversized headers/body | Deterministically truncated | Pending |
| Error safety | provider response containing customer data | Response body absent from logs | Pending |
| Backoff | repeated failures | Capped exponential delay | Pending |
| Kill switch | worker disabled | No credential read or Gmail call | Pending |
| One-cycle | run-once success | Exactly one poll, clean exit | Pending |
| One-cycle | run-once failure | Nonzero exit, no infinite retry | Pending |

## Database and concurrency matrix

| Case | Required result | Status |
|---|---|---|
| Exact replay | same source + external ID + payload | one durable lead | Pending |
| Concurrent replay | two workers ingest same message | one durable lead through database uniqueness | Pending |
| Identity conflict | same external ID, different payload hash | conflict/quarantine record, no silent overwrite | Pending |
| Transaction failure | lead insert fails | checkpoint does not advance | Pending |
| Checkpoint atomicity | lead and checkpoint commit | both or neither persist | Pending |
| Restart overlap | bounded overlap re-reads recent messages | no duplicates and no missed messages | Pending |

## Gmail and worker integration matrix

| Case | Required result | Status |
|---|---|---|
| Pagination | more than 50 matches | all pages processed up to approved cap | Code added; test pending |
| Page cap | backlog exceeds cap | warning and recoverable continuation | Code added; test pending |
| HTTP timeout | Gmail request hangs | request aborts and backoff begins | Code added; test pending |
| Token timeout | refresh hangs | bounded failure and backoff | Code added; test pending |
| 429/5xx | retryable provider failure | capped backoff; no data loss | Partial; Retry-After handling pending |
| malformed message | missing payload/headers | ignored or quarantined safely | Pending |
| oversized message | excessive MIME/body | bounded processing and review evidence | Partial bounds; quarantine pending |
| stale worker | no successful poll within threshold | persisted unhealthy/stale state | Pending |
| graceful stop | SIGTERM during page/message loop | no new message starts after stop flag | Code added; integration test pending |

## Deployment matrix

| Case | Required result | Status |
|---|---|---|
| Dedicated service | worker isolated from website/API health | Pending |
| Default state | worker disabled without explicit enable flag | Implemented in code |
| Secrets absent | process fails closed without exposing names/values beyond required variable names | Partial; live test pending |
| Health endpoint/state | last start/success/failure/checkpoint visible | Pending |
| Coolify restart | worker restarts without duplicate ingestion | Pending |
| Production one-cycle | approved Gmail account, read-only scope | Owner credentials required |
| Yelp replay | one real Yelp email processed repeatedly | Owner credentials and live test required |
| Nextdoor promotion | real upsell remains ignored | Owner credentials and live test required |

## Remaining implementation order

1. Add database uniqueness for source + event identity and conflict-safe insert behavior.
2. Add durable checkpoint, bounded overlap, and atomic checkpoint advancement.
3. Add quarantine/dead-letter storage for malformed, oversized, and identity-conflict messages.
4. Persist worker health, last success/failure, retry time, counts, and stale status.
5. Add worker-policy and Gmail-client tests with injected fetch, clock, sleep, and database adapters.
6. Wire a dedicated disabled-by-default Coolify service.
7. Run CI, typecheck, build, and compose validation.
8. Configure read-only Gmail OAuth secrets through the owner-controlled Coolify interface.
9. Run controlled one-cycle, replay, promotion-ignore, and restart-catch-up verification.

## Activation rule

Do not enable continuous production polling until every database, worker, deployment, and live-verification row required for activation is complete. No outbound Gmail or platform-response capability belongs in this milestone.
