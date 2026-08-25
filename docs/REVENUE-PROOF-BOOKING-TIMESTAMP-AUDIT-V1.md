# Revenue Proof Booking Timestamp Audit V1

Date: 2026-08-20

Umbrella: GitHub issue #535

## Decision

Keep Proof Pack bookings unavailable. The canonical local GorillaDesk job evidence does not contain an authoritative job-created or booked timestamp.

## Evidence inspected

- `gorilladesk_jobs` stores provider job ID, customer ID, status, service, amount, `scheduled_for`, `completed_at` and local import `created_at`.
- The CSV normalizer accepts scheduled/service/appointment date and completed date columns, but no booked/created date.
- Local `created_at` is the database ingestion time, not the customer booking time.
- `scheduled_for` is the future service appointment time and cannot establish when the booking occurred.
- The existing GorillaDesk integration documents jobs and payments as CSV/manual-import only; its available public API path syncs customers, not jobs.
- Revenue attribution stores `matched_at`, which is attribution processing time rather than booking time.

## Rejected substitutions

| Candidate | Why it is unsafe as booking evidence |
|---|---|
| `gorilladesk_jobs.created_at` | Local ingestion timestamp |
| `scheduled_for` | Appointment/service time, not booking creation |
| `completed_at` | Job completion time |
| `revenue_attribution.matched_at` | Matching/reconciliation time |
| First appearance in a CSV | Export/import observation, not provider creation |

## Smallest acceptable unlock

One of the following must become available from an authoritative tenant-scoped source:

1. GorillaDesk job-created/booked timestamp paired with immutable external job ID; or
2. a verified GorillaDesk webhook/event that identifies job creation; or
3. a human-verified booking event appended to the existing customer-journey ledger with canonical job ID, evidence timestamp, verifier and provenance.

Any importer must preserve both the provider event timestamp and the ingestion timestamp. Replay must be idempotent by tenant + provider job ID + booking event type. No customer-facing booking count should be produced from current fields.

## Next recommended mission

`REVENUE-PROOF-ATTRIBUTION-PROVENANCE-V1`

Preserve match method, confidence, evidence timestamp and human-verification state for the existing revenue-attribution workflow. First-name-only matching must never become verified revenue. Reuse the current attribution table/journey ledger; do not create another attribution store or run provider writes.
