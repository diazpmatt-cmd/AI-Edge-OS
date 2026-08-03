# Channel Activation and Retention Checklist

Last updated: 2026-08-03
Applies to: lead marketplaces, maps/listings, social inboxes, directories, classified services, and referral partners

## Purpose

Define the minimum evidence required before AI Edge OS calls a channel connected, enables unattended intake, spends money, sends a response, publishes content, or retains the channel as an active source.

A platform account, login, profile, or successful test screen does not by itself count as an operational connection.

## 1. Business and ownership

- [ ] Business owner or authorized operator identified.
- [ ] Correct Bed Bugs & Beyond legal/display identity selected.
- [ ] Platform terms reviewed and accepted by an authorized human.
- [ ] Account recovery email and phone are current.
- [ ] Multifactor authentication enabled when available.
- [ ] Team roles use named accounts rather than shared passwords where supported.
- [ ] Credential revocation and administrator-transfer path documented.
- [ ] No credential, recovery code, session token, or verification document stored in GitHub.

## 2. Platform and integration legitimacy

- [ ] Official account, business portal, API, email-notification path, webhook, or approved integration identified.
- [ ] The integration does not scrape private pages or bypass platform restrictions.
- [ ] Required permissions are documented and limited to the actual use case.
- [ ] Read-only access is used when writes are unnecessary.
- [ ] Unavailable capabilities are stated honestly.
- [ ] Manual deep-link fallback exists when an official automated action is unavailable.
- [ ] Third-party vendor involvement, cost, data access, and termination path are documented.

## 3. Business identity consistency

Verify against the canonical business record:

- [ ] Display name.
- [ ] Website.
- [ ] Phone.
- [ ] Address or service-area representation.
- [ ] Regular and holiday hours.
- [ ] Primary and secondary categories.
- [ ] Description and service claims.
- [ ] Logo and approved imagery.
- [ ] Booking, call, message, and website action links.

Required service-policy checks:

- [ ] Termite service is not presented as currently offered.
- [ ] Whole-home bed bug heat treatment is not presented as an offered service.
- [ ] Furniture/item-focused bed bug treatment positioning is accurate where relevant.
- [ ] Fumigation is included as active where relevant.
- [ ] No unsupported guarantee, price, license, certification, or service-area claim appears.

## 4. Inbound event contract

- [ ] Each event type is enumerated: lead, customer message, follow-up, promotion, billing notice, account notice, review, comment, or unknown.
- [ ] Sender/domain, webhook signature, account identifier, or API source is allowlisted.
- [ ] Required source fields are documented.
- [ ] External lead/message/listing identifier is captured where available.
- [ ] Received time and source URL/deep link are captured.
- [ ] Raw provider payload retention is minimized and bounded.
- [ ] Unknown or malformed events fail safely into quarantine or review.
- [ ] Promotions and upsells cannot become customer leads by default.

## 5. Deduplication and identity

- [ ] Stable idempotency key defined by source and external identifier.
- [ ] Payload hash or normalized fingerprint recorded where useful.
- [ ] Exact replay creates no duplicate record.
- [ ] Same identifier with conflicting content is surfaced for review.
- [ ] Cross-channel duplicate signals are defined for customer, phone, email, location, time, and service.
- [ ] Shared marketplace leads are distinguishable from unique leads.
- [ ] Existing GorillaDesk, web-form, Gmail, Telnyx, and marketplace records are not silently duplicated.

## 6. Customer-data safety

- [ ] Data-minimization fields are documented.
- [ ] Sensitive content is redacted from logs.
- [ ] Full raw customer messages are not placed in GitHub, issues, or unrestricted observability tools.
- [ ] Data retention and deletion behavior is documented.
- [ ] Access is restricted to authenticated authorized operators.
- [ ] Cross-client or cross-tenant access is tested and fails closed.
- [ ] Export, incident review, and legal-hold boundaries are documented where applicable.

## 7. Human-response boundary

- [ ] Automatic replies are disabled unless separately authorized.
- [ ] Draft generation and sending are separate permissions.
- [ ] Human approval binds the exact destination, conversation, message text, attachments, and payload hash.
- [ ] Edited drafts require a new approval.
- [ ] One approval cannot be reused for another customer or platform.
- [ ] Sending receipt and external message ID are recorded.
- [ ] Failure does not silently retry into duplicate customer messages.
- [ ] Stop/kill-switch behavior is tested.

## 8. Publishing boundary

For channels supporting public posts:

- [ ] Account and exact destination are allowlisted.
- [ ] Content, media, scheduled time, and payload hash are bound to approval.
- [ ] Media validation passes.
- [ ] Platform limits and prohibited-content rules are documented.
- [ ] Idempotent publish key exists.
- [ ] One approved post produces at most one external post.
- [ ] External post ID, URL, timestamp, and verification receipt are recorded.
- [ ] Deletion/correction and containment procedure is documented.

## 9. Paid-channel controls

- [ ] Billing owner identified.
- [ ] Pricing model understood: subscription, lead charge, credit, bid, or advertising spend.
- [ ] Daily, weekly, and monthly caps approved.
- [ ] Geographic and service filters reviewed.
- [ ] Duplicate/shared-lead economics understood.
- [ ] Refund and dispute process documented.
- [ ] Automatic expansion or budget increases disabled unless separately approved.
- [ ] Pause threshold defined by qualified-lead cost, booking cost, revenue, and complaint/fraud rate.
- [ ] Spend and lead counts reconcile to provider records.
- [ ] Paid activation requires explicit owner authorization.

## 10. Health, reliability, and recovery

- [ ] Dedicated worker or integration health is visible.
- [ ] Last successful event or poll time is visible.
- [ ] Failure count and retry-after time are visible.
- [ ] Exponential backoff and rate-limit handling exist.
- [ ] Missed-event catch-up procedure is bounded.
- [ ] Checkpoint advancement occurs only after durable processing.
- [ ] Provider outage does not fabricate success.
- [ ] Website failure does not unnecessarily stop independent lead intake.
- [ ] Credential failure is distinguishable from no new leads.
- [ ] Operator fallback and escalation path documented.

## 11. Controlled test evidence

Before activation, run at least one applicable controlled event:

- [ ] Test lead or notification received.
- [ ] Source authenticated or verified.
- [ ] Event classified correctly.
- [ ] Normalized record contains expected fields.
- [ ] Exact replay creates no duplicate.
- [ ] Promotion/account notice is not treated as a lead.
- [ ] Deep link opens the correct source context.
- [ ] No unintended external write occurs.
- [ ] Logs contain no credential or excessive customer content.
- [ ] Kill switch stops further processing.

## 12. Attribution and economics

- [ ] Source and campaign/listing/referral partner recorded.
- [ ] Lead charge recorded where applicable.
- [ ] Qualification outcome recorded.
- [ ] First-response time recorded.
- [ ] Estimate, booking, completion, loss, refund, and dispute statuses supported.
- [ ] Revenue attribution supported.
- [ ] Cost per qualified lead and cost per booking calculated.
- [ ] Return on spend calculated for paid sources.
- [ ] Organic/referral sources use observable attribution without invented precision.

## 13. Activation decision

A channel may be marked **Connected — Read Only** when:

- ownership and integration legitimacy are verified;
- controlled intake succeeds;
- deduplication succeeds;
- health and recovery paths exist;
- no external write authority is present.

A channel may be marked **Connected — Human Approved Writes** only when:

- exact-scope approval exists;
- outbound idempotency and receipts exist;
- rollback/containment is documented and tested;
- live controlled verification passes.

A channel may be marked **Active — Paid** only when:

- billing and caps are approved;
- attribution is functioning;
- pause thresholds exist;
- economics are reviewed after a bounded test.

## 14. Retention review

Review each active channel on an agreed cadence:

- [ ] Account remains owned and recoverable.
- [ ] Permissions remain least privilege.
- [ ] Listing facts remain accurate.
- [ ] Integration remains officially supported.
- [ ] Health and missed-event recovery are working.
- [ ] Lead quality and response times are acceptable.
- [ ] Paid economics remain above the approved threshold.
- [ ] Complaints, fraud, spam, and duplicate rates are acceptable.
- [ ] Customer-data retention remains justified.
- [ ] Channel should be retained, paused, downgraded, or removed.

## 15. Deactivation procedure

1. Disable outbound actions and paid spend.
2. Stop the channel worker or integration.
3. Revoke credentials and vendor access where appropriate.
4. Preserve required bounded audit and financial records.
5. Remove stale public claims or action links.
6. Document unprocessed events and operator follow-up.
7. Confirm no automatic restart or billing remains.
8. Record reason, date, owner, and reactivation conditions.

## Completion evidence for master checklist item 106

This documentation item is complete when this checklist is committed and covers permissions, controlled testing, deduplication, attribution, cost controls, health monitoring, missed-event recovery, operator fallback, human approval, kill switches, retention review, and deactivation.
