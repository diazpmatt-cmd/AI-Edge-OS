# ADR-LEAD-002: Unified Lead Identity and Deduplication

Status: Accepted for bounded implementation
Date: 2026-08-03

## Context

The same customer opportunity may arrive through Gmail, Yelp, Nextdoor, Thumbtack, Angi, Facebook, Instagram, Google, web forms, Telnyx, GorillaDesk, or a referral partner. Some platforms sell shared leads, some send repeated follow-ups, and some omit stable customer identifiers.

Treating every inbound event as a new lead would inflate lead counts, duplicate operator work, distort acquisition cost, and create a risk of repeated customer contact. Over-aggressive merging could combine unrelated people or properties.

## Decision

Separate three identities:

1. **Source event identity** — one immutable provider event or Gmail message.
2. **Source opportunity identity** — the provider's lead, conversation, form submission, or referral opportunity.
3. **Customer opportunity identity** — AI Edge OS's bounded operational record that may link several source opportunities when evidence supports the match.

Every inbound event must first be idempotent within its own source. Cross-source matching may flag or link probable duplicates but must not silently merge uncertain records.

## Source-event key

Prefer, in order:

- provider + provider account/location + immutable external event ID;
- provider + immutable conversation/lead ID + event subtype/version;
- Gmail mailbox + Gmail message ID;
- bounded deterministic fingerprint only when no stable ID exists.

A fingerprint may use normalized source, sender domain, received time bucket, customer contact tokens, location, service, and bounded content hash. It must not embed raw customer text or credentials.

## Cross-source matching signals

Potential duplicate scoring may consider:

- normalized phone number;
- normalized email address;
- provider customer/contact ID;
- street address or service location;
- service category;
- event time window;
- customer name as a weak supporting signal;
- referral or tracking identifier;
- existing GorillaDesk customer/job reference.

No single weak field such as name alone is sufficient for an automatic merge.

## Match outcomes

- `distinct` — evidence supports separate opportunities.
- `possible_duplicate` — operator review required.
- `linked_duplicate` — records remain independently traceable but are linked to one opportunity.
- `shared_lead` — the same or materially similar opportunity was sold or delivered by multiple sources.
- `exact_replay` — no new event or opportunity is created.
- `identity_conflict` — stable source identity reused with materially conflicting content; quarantine and review.

## Data and audit rules

- Preserve every source reference needed for factual traceability.
- Never overwrite the original source identity with a later source.
- Record match reason codes and the bounded fields used.
- Preserve operator decisions and reversals.
- Revenue is counted once at the customer opportunity/job level, while acquisition costs remain attributable to every charged source.
- Customer-facing communication history must remain tied to the exact source conversation and destination.

## Consequences

### Positive

- Prevents inflated lead counts and repeated outreach.
- Supports shared-lead economics and refund/dispute evidence.
- Preserves source-level auditability while giving operators one operational view.
- Allows cautious matching when provider data is incomplete.

### Negative

- Cross-source identity is probabilistic when contact details are absent.
- Operator review is required for ambiguous matches.
- Historical data may need backfill or reconciliation.
- Privacy-sensitive identifiers require strict access and retention controls.

## Rejected alternatives

### One database record per email/message only

Rejected because it cannot represent multi-message conversations or shared leads accurately.

### Automatic merge on name or phone alone

Rejected because recycled phone numbers, family members, property managers, and common names can create harmful false merges.

### Discarding duplicate source records

Rejected because acquisition charges, disputes, provider performance, and audit evidence must remain visible.

### AI-only deduplication

Rejected because deterministic source identity and explainable bounded rules must precede any model-assisted recommendation.

## Verification requirements

- Exact replay creates no duplicate source event.
- Restart/catch-up preserves event idempotency.
- Same source identity with conflicting payload fails safely.
- Cross-source exact contact matches can be linked with traceable reason codes.
- Weak or contradictory matches remain separate or reviewable.
- Shared charges remain visible while revenue is not double-counted.
- Unlink/reclassification preserves history.
- Tenant/client access boundaries fail closed.

## Related records

- Issue #110 and PR #111
- Issues #114, #115, #117, and #123
- `docs/runbooks/CHANNEL-ACTIVATION-CHECKLIST.md`
