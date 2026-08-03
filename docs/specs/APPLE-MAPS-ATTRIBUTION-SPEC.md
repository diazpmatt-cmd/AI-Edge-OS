# Apple Maps Attribution Specification

Last updated: 2026-08-03
Scope: Bed Bugs & Beyond Apple Business / Apple Maps listing
Related: Issue #112

## Goal

Measure observable traffic and conversions from the Apple Maps place card without claiming attribution that Apple does not expose and without changing the live listing until owner review and verification are complete.

## Attribution hierarchy

Use the strongest available evidence in this order:

1. Apple-provided place-card or action analytics, when available to the verified account.
2. A reviewed website action URL that resolves to the canonical Bed Bugs & Beyond site and carries a stable Apple source marker.
3. A dedicated, owner-approved call-tracking number that forwards correctly and preserves emergency/after-hours behavior.
4. First-party lead-source confirmation recorded by staff or in GorillaDesk.
5. Referrer or landing-page evidence when present.
6. Report as `unknown/unattributed` when no reliable evidence exists.

Never infer an Apple source solely because a lead used an iPhone, Safari, or an Apple email address.

## Website action URL

Preferred pattern after the authoritative website is identified:

```text
https://<canonical-domain>/<approved-landing-path>?utm_source=apple_maps&utm_medium=organic&utm_campaign=local_listing
```

Requirements:

- HTTPS canonical domain only.
- No redirect through an unreviewed third party.
- Final page loads successfully on mobile.
- Query parameters survive the redirect chain when technically supported.
- Canonical tags continue pointing to the normal canonical page.
- Page content matches the visible listing and active service policy.
- No customer or session identifier is embedded in the public URL.

If Apple removes parameters or the listing supports only the canonical homepage, record that limitation and use the next strongest evidence source.

## Call attribution

A dedicated Apple Maps number is optional and requires owner approval.

Before use, verify:

- correct forwarding destination;
- caller-ID behavior;
- business-hours and after-hours routing;
- voicemail behavior;
- recording/consent requirements where applicable;
- failover when the tracking provider is unavailable;
- monthly cost and cancellation procedure;
- number ownership and portability;
- no conflict with canonical business-identity requirements.

Do not replace the primary public number merely to create attribution if doing so reduces listing consistency or customer trust.

## Lead-source record

Store the following fields when supported by AI Edge OS or the future unified Lead Inbox:

- `source_channel`: `apple_maps`
- `source_method`: `apple_analytics`, `utm`, `tracking_phone`, `staff_confirmed`, `referrer`, or `unknown`
- `source_evidence`: bounded non-secret reference
- `first_touch_at`
- `lead_created_at`
- `booked_at`
- `completed_at`
- `booked_revenue`
- `completed_revenue`
- `attribution_confidence`: `high`, `medium`, `low`, or `unknown`

Do not store Apple credentials, customer message bodies, call recordings, or verification documents in GitHub.

## Measurement checks

### Pre-activation

- [ ] Canonical website and approved landing page confirmed.
- [ ] Website action URL reviewed on mobile.
- [ ] Analytics event or server-side source capture verified in a non-production or controlled test.
- [ ] Call-tracking choice explicitly approved or rejected.
- [ ] Staff source-confirmation field available or documented.
- [ ] Reporting distinguishes observed from inferred attribution.

### Post-verification

- [ ] Public Apple Maps place card opens the intended website URL.
- [ ] Test visit reaches the expected landing page.
- [ ] Observable source marker appears in approved analytics when technically supported.
- [ ] Test call reaches the correct destination if a tracking number is approved.
- [ ] One controlled lead can be traced without duplicate records.
- [ ] Removal/failback procedure is documented.

## Reporting

Report at minimum:

- Apple-attributed website visits;
- Apple-attributed calls;
- confirmed leads;
- booked jobs;
- completed revenue;
- attribution method and confidence;
- unattributed volume;
- measurement gaps.

Do not promise ranking, impression, call, or conversion data that the verified Apple account and first-party systems do not actually provide.

## Current blocker

The live listing, authoritative website URL, analytics property, public phone strategy, and Apple account analytics are not yet verified. This specification prepares measurement only; it does not authorize a live listing change, phone-number replacement, tracking-provider purchase, or publication.
