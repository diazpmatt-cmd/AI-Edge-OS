# Revenue Proof Attribution Provenance Audit V1

Date: 2026-08-20

Umbrella: GitHub issue #535

## Decision

Keep attributable revenue `partial / observed`. Existing records can contain real job and revenue values, but they do not preserve enough provenance to call the attribution verified.

## Findings

1. `revenue_attribution` stores tenant, lead, status, revenue, GorillaDesk job ID and match time, but not match method, confidence, evidence timestamp, evidence source or verifier.
2. Automatic customer matching accepts either normalized phone equality or a first-name prefix. The selected method is not persisted.
3. Job matching selects one job per customer by greatest amount, not by a durable lead-to-job relationship.
4. A completed matched job automatically changes attribution status to `won` and copies its amount.
5. Manual create/update routes accept caller-supplied status, revenue, job ID and match time without a strict schema or verification transition.
6. Tenant filtering is correctly enforced for reads and row updates, and GorillaDesk snapshots are filtered by the resolved tenant project.

## Required provenance contract

Extend the existing attribution record or existing journey ledger—do not add another attribution store—with:

- `match_method`: `provider_customer_id | normalized_phone | human_verified | first_name_candidate`
- `match_confidence`: bounded integer 0–100
- `evidence_source`: canonical system/version
- `evidence_observed_at`: when the underlying job/payment evidence was observed
- `verified_at` and `verified_by_user_id`: nullable human-verification boundary
- immutable candidate/evidence identifiers sufficient to reproduce the decision

## Safety policy

| Match | Allowed state | Revenue proof |
|---|---|---|
| Provider customer/job ID | matched candidate | Observed until verification policy passes |
| Normalized phone | matched candidate | Partial; phone reuse/household ambiguity remains |
| First-name prefix | proposed candidate only | Never verified automatically |
| Human verified with canonical job evidence | won/verified | Eligible for attributable revenue |
| Caller-supplied status or revenue alone | manual draft | Never sufficient proof |

## Minimum implementation sequence

1. Add nullable provenance fields to the existing table and migration path.
2. Extract a pure matcher that returns method, confidence and reasons rather than a boolean.
3. Stop first-name candidates from automatically becoming `matched` or `won`.
4. Add a strict authenticated verification transition scoped by tenant and operator identity.
5. Make Proof Pack count verified attributable revenue separately from partial observed attribution.
6. Backfill old rows as `legacy_unknown`, confidence null and unverified; never infer provenance retrospectively.

## Implementation status

Implemented on `feature/attribution-provenance-v1`:

- Nullable provenance fields extend the existing attribution record; legacy rows remain unverified and are not reclassified.
- A pure matcher records normalized-phone or first-name-candidate evidence with explicit confidence and reasons.
- First-name-only candidates remain unmatched and never receive job/revenue evidence automatically.
- Human verification is authenticated, tenant-scoped, one-way, and requires canonical stored GorillaDesk job evidence.
- Proof Pack counts only human-verified won attribution revenue and explicitly reports excluded unverified won records as partial evidence.

No provider sync, customer action, production migration, deployment or retrospective verification was performed.
