# ADR-LEAD-004: Human-Approved Outbound Customer Responses

Status: Accepted for future bounded implementation
Date: 2026-08-03

## Context

Fast lead response can improve booking outcomes, but customer-facing messages create legal, reputational, privacy, and operational consequences. Platforms differ in reply mechanisms and threading. A response intended for one Yelp lead must not be sent to another lead, another platform, or an ordinary email address. A model-generated draft may contain an unsupported service, price, guarantee, availability statement, or incorrect customer context.

Read access, draft generation, approval, and delivery are separate authorities. None implies another.

## Decision

All outbound customer responses remain human-approved until a later separately authorized policy demonstrates that a narrower class of messages can be automated safely.

The response workflow must separate:

1. source intake;
2. deterministic service-policy validation;
3. draft generation;
4. human review and modification;
5. exact-scope approval;
6. delivery through an official authorized platform path;
7. postcondition verification and receipt;
8. follow-up status and audit.

## Approval binding

Approval must bind the exact:

- client/business identity;
- platform and account/location;
- external lead/conversation/message identifier;
- recipient or provider destination;
- draft text and normalized payload hash;
- attachments/media, if any;
- language;
- expiration time;
- allowed single operation;
- approving authenticated human;
- constraints and rationale.

Any material edit, destination change, new attachment, expired approval, or source-thread change requires new approval.

## Service and content policy

Before approval, deterministic checks must reject or flag:

- termite service represented as currently available;
- whole-home bed bug heat treatment represented as offered;
- incorrect departure from furniture/item-focused bed bug positioning;
- omission or misuse of fumigation where relevant;
- unsupported fixed price, guarantee, license, certification, safety, or availability claim;
- discriminatory, threatening, deceptive, or unprofessional language;
- request for unnecessary sensitive data;
- unsafe chemical or treatment instructions;
- disclosure of another customer's information;
- platform-incompatible contact or payment request.

AI assistance may recommend wording but cannot override policy or approval requirements.

## Delivery and idempotency

- Use only official or verified authorized reply mechanisms.
- Generate an idempotency key from platform/account/conversation/approved-payload identity.
- One approval may produce at most one successful external message.
- Uncertain provider outcomes must be reconciled before retry.
- Delivery receipt must record provider message ID, conversation ID, timestamp, result, and verification status.
- The system must never mark a customer contacted solely because a send was attempted.

## Failure behavior

### Approval invalid or stale

Do not send. Return a bounded reason and require fresh review.

### Destination mismatch

Do not send. Never redirect automatically to a guessed email or thread.

### Provider timeout or uncertain result

Do not immediately resend. Query or inspect authoritative provider evidence when possible; otherwise require operator review.

### Content-policy failure

Do not send. Show the exact bounded policy reasons and create a revised draft only after review.

### Credential or permission failure

Do not send. Preserve the approved draft without exposing credentials and require account repair by an authorized owner.

## Consequences

### Positive

- Prevents read access from becoming reply authority.
- Protects against wrong-recipient and duplicate messages.
- Keeps business/service claims reviewable.
- Provides factual delivery receipts and accountability.

### Negative

- Human approval adds latency.
- Different platforms require separate adapters and receipts.
- Operators must review even routine responses during early rollout.
- Some platforms may support only manual deep-link follow-up.

## Rejected alternatives

### Automatic reply to every new lead

Rejected because classification, context, service fit, availability, and platform threading can be wrong.

### Approval of a reusable template for all customers

Rejected for initial rollout because customer details, pest type, location, and platform context materially affect the message.

### Email fallback when platform reply is unavailable

Rejected unless the customer explicitly provided email for that purpose and the exact destination is separately approved.

### Treating sent status as delivered or read

Rejected because provider acceptance, delivery, and customer read are different facts.

## Verification requirements

- Drafting works without send credentials.
- Approval and delivery permissions are independently enforced.
- Exact payload hash and destination binding are tested.
- Edited, expired, cross-thread, cross-platform, and replayed approvals fail closed.
- Service-policy violations are rejected deterministically.
- Provider timeout and uncertain-result tests prevent duplicate sends.
- One controlled approved message produces one verified receipt.
- Kill switch prevents all sends while preserving drafts and evidence.
- Customer and credential data are redacted from logs.

## Related records

- Issue #110
- Issues #114, #115, #117, and #120
- `docs/adr/ADR-LEAD-001-gmail-read-only-ingestion.md`
- `docs/runbooks/CHANNEL-ACTIVATION-CHECKLIST.md`
