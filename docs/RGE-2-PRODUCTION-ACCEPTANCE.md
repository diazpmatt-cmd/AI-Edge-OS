# RGE-2 Production Acceptance

**Decision:** GO

**Accepted:** 2026-07-25

**Scope:** Referral Invitations & Follow-Up Preparation

## Production evidence

- The deployed Referral Growth interface visibly includes the **Invitations** view, reusable
  SMS/email templates, consent-backed invitation drafting, approval, cancellation, and contact
  suppression.
- The deployed JavaScript application served the dedicated Referral Growth bundle containing the
  invitation routes and interface labels.
- Unauthenticated requests to the invitation-template and invitation-list endpoints returned
  HTTP 401, confirming that the production authentication boundary was active.
- The production interface explicitly stated that RGE-2 was preparation-only and that approval did
  not send a message.
- The operator completed a logged-in visual smoke check and confirmed that the deployed interface
  was visible and behaving as expected.

## Safety evidence

- Every invitation remains constrained to `delivery_state='not_dispatched'` and
  `sequence_step=0`.
- Draft creation requires affirmative, documented channel consent.
- Tenant ownership is derived from the authenticated user; request bodies cannot select a tenant.
- Contact opt-out suppresses matching pending records and blocks future drafting or approval.
- RGE-2 contains no provider call, sender import, scheduler, or automatic follow-up.

## Acceptance boundary

RGE-2 is production-accepted for preparation and approval only. This decision does not authorize
live SMS/email delivery, scheduled follow-up, automatic publication, or provider activation.
