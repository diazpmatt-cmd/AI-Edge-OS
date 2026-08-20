# Revenue Proof Payment-to-Job Link Integrity V1

Date: 2026-08-20

Umbrella: GitHub issue #535

## Decision

Use only tenant-scoped, individual GorillaDesk payment rows with a durable `job_id`, exact `collected` status, positive amount, and canonical payment timestamp to verify attributable revenue. Aggregate payment summaries and job estimates are not attribution proof.

## Existing evidence reused

- `gorilladesk_jobs.external_id` is the job identifier stored on an attribution candidate.
- `gorilladesk_payments.job_id` links an individual payment to that job.
- Both records preserve `project_id`, allowing authenticated tenant-scoped lookup.
- `gorilladesk_payments.paid_at` and exact `collected` status provide the canonical collected-revenue boundary already used by Proof Pack.

## Integrity gaps found

1. The previous human-verification transition required a stored job but did not require the job to be completed or paid.
2. Attribution revenue was copied from job amount, which can differ from collected payment value.
3. Seeded processor-total payment rows intentionally have no `job_id`; they cannot support attribution.
4. Legacy GorillaDesk `external_id` uniqueness is global rather than composite with `project_id`. Reads are tenant-scoped, but changing uniqueness safely requires a separate duplicate audit and migration plan.
5. CSV payment rows without a durable job identifier remain valid for aggregate reporting but cannot verify attributable revenue.
6. Missing CSV payment status previously defaulted to `collected`; it now imports as `unknown` so absence of evidence cannot become paid revenue.

## Implemented boundary

- Verification resolves the attribution candidate by authenticated client ID.
- The linked job must exist in the resolved tenant project and have exact `completed` status.
- At least one positive, dated, exact-`collected` payment must link to that job in the same tenant project.
- Verified attribution revenue is replaced with the sum of those collected payments, not the job estimate.
- Evidence source and observation time are updated at verification.
- Missing, aggregate-only, outstanding, undated, zero-value, cross-tenant, or unlinked payment evidence fails closed.

## Deferred migration concern

Do not change provider-ID uniqueness in production until a read-only duplicate/collision audit proves that `(project_id, external_id)` can replace global uniqueness without data loss. This implementation does not execute or add that migration.

## Next recommended mission

`GORILLADESK-TENANT-COMPOSITE-ID-AUDIT-V1`

Perform a read-only collision and import-upsert audit for jobs, customers, and payments. Design—but do not execute—a safe composite-identity migration only if real data supports it.
