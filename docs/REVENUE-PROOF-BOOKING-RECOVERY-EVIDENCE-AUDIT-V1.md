# Revenue Proof Booking & Recovery Evidence Audit V1

Date: 2026-08-20

Umbrella: GitHub issue #535

Scope: read-only architecture and evidence audit; no provider, customer, production, or schema action

## Decision

Do not report successful missed-call recovery or bookings yet. The repository has most of the required tenant and provider identifiers, but it does not persist a canonical causal edge from a missed call to its text-back/reply, or from a lead to a booking event. Existing aggregate formulas are estimates, not attribution evidence.

## Canonical evidence already available

| Evidence | Tenant boundary | Durable identifiers | Safe use now |
|---|---|---|---|
| Calls | `calls.client_id` | `calls.id`, Telnyx `call_sid` | Call counts and observed outcomes |
| SMS | `sms_conversations.client_id` | provider `message_id` | Direction and provider-observed delivery/receipt |
| Leads | `leads.client_id` | `leads.id`, inbound `source_message_id` | Source, response and lifecycle observations |
| Journey events | `customer_journey_events.client_id` | canonical record type/id, normalized phone/email | Existing review reservation/delivery evidence |
| GorillaDesk customers/jobs | tenant `project_id` | customer/job `external_id` | Scheduled/completed job observations |
| Revenue attribution | `revenue_attribution.client_id` | `lead_id`, `gorilladesk_job_id` | Observed attribution only; match provenance is incomplete |

## Gaps that block defensible proof

1. Telnyx call, missed-call, text-back and reply paths do not write canonical customer-journey events.
2. Missed-call lead rows do not retain `call_sid`; reply rows retain the inbound message ID but no parent text-back or missed-call identifier.
3. Phone-and-time correlation is not a durable causal relationship and may join separate customer interactions.
4. The existing recovery formulas count classified replies or callback requests against aggregate missed calls without proving which missed call was recovered.
5. GorillaDesk jobs expose `scheduled_for`, but no canonical `booked_at` event or source observation timestamp exists. A scheduled job is not necessarily a new booking in the requested reporting period.
6. Revenue job matching may use normalized phone or first-name fallback and chooses one job per customer, but the attribution row does not preserve match method, confidence, evidence version, or human verification.
7. The legacy scheduler missed-call scan is not tenant-scoped and inserts hard-coded BB&B identity without `client_id`; it must not be used as Proof Pack evidence or generalized as-is.
8. The legacy GorillaDesk import route hard-codes the BB&B project and is not an acceptable multi-tenant proof ingestion boundary.

## Smallest safe next implementation

Extend the existing `customer_journey_events` ledger; do not add another source-of-truth table.

1. On verified Telnyx events, append tenant-scoped journey events with canonical provider IDs:
   - `missed_call_observed` → canonical `telnyx_call` / `call_sid`
   - `recovery_text_sent` → canonical `telnyx_message` / outbound message ID, with parent call ID in metadata
   - `customer_reply_observed` → canonical `telnyx_message` / inbound message ID, with parent outbound message ID and call ID when available
2. Define successful recovery only when the causal chain is complete: missed call → successful text delivery → inbound customer reply, all for the same resolved tenant.
3. During tenant-scoped GorillaDesk import, append an idempotent `job_booking_observed` event only when the provider supplies a trustworthy booking/creation timestamp and external job ID. Otherwise keep bookings unavailable.
4. Preserve attribution match method (`phone`, `provider_customer_id`, `human`), confidence, evidence timestamp and verifier on the existing attribution record or journey-event metadata before upgrading attributable revenue to verified.
5. Replace or disable the global hard-coded recovery scheduler before using background recovery for additional tenants.

## Acceptance evidence for the next mission

- Cross-tenant identifiers can never join, even with the same normalized phone.
- Provider event replay is idempotent by tenant + provider + canonical record ID + event type.
- A reply without a durable parent chain does not count as recovered.
- A scheduled job without trustworthy booking evidence does not count as booked.
- First-name-only matching never produces verified attribution.
- No event payload stores message bodies, recordings, tokens or unnecessary PII in proof output.
- Proof Pack changes from unavailable to available only when the required canonical chain exists.

## Recommended mission

`REVENUE-PROOF-CANONICAL-JOURNEY-LINKS-V1`

Implement tenant-scoped, idempotent journey-event writes for verified Telnyx call/text events and expose a pure recovery-evidence composer. Keep booking evidence unavailable unless the existing GorillaDesk import can supply an authoritative booking timestamp. Do not send messages, enable the legacy scheduler, call providers, migrate production, or deploy.
