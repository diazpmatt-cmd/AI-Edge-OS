# Apple Business Preparation Runbook

Last updated: 2026-08-03
Business: Bed Bugs & Beyond

## Purpose

Prepare the business identity, listing content, verification evidence, and operating controls required to claim or add Bed Bugs & Beyond in Apple Business (formerly Apple Business Connect) without storing Apple credentials in source control.

## Internal source package

Use `docs/audits/BED-BUGS-AND-BEYOND-BUSINESS-IDENTITY-AUDIT.md` as the repository-level source audit before entering data in Apple Business.

Repository-verified starting facts:

- Customer-facing name: `Bed Bugs & Beyond`.
- Industry: pest control.
- Region: Gulf Coast of Alabama / Baldwin County.
- Time zone: America/Chicago.
- Repository-defined service areas: Foley, Daphne, Loxley, Fairhope, Gulf Shores, Orange Beach, Summerdale, Spanish Fort, Elberta, Lillian, and Perdido Beach, Alabama.
- Termite service is coming soon, not currently offered.
- Wildlife removal is disabled.
- Whole-home bed bug heat treatment must not be represented as offered.
- Bed bug positioning should emphasize targeted treatment of affected furniture and specific areas.
- Fumigation is active, with educational and safety limits on public claims.

These seed values require a live database read and owner confirmation before submission. Do not treat repository defaults as proof that public phone, website, hours, address visibility, categories, or imagery are current.

## Owner-required actions

- Sign in with an Apple Account or Managed Apple Account.
- Accept Apple's terms.
- Complete organization or location verification.
- Approve any phone verification, transfer request, or supporting-document submission.
- Confirm the final phone, website, hours, service-area/location representation, categories, and approved imagery.

## Data package to prepare before sign-in

- Legal business name.
- Customer-facing display name: Bed Bugs & Beyond.
- Country/region: United States.
- Business phone number.
- HTTPS website.
- Physical address or Apple-supported location/service-area representation.
- Primary and additional categories.
- Regular hours and holiday/special hours.
- Logo, cover photo, and location photos that meet Apple's standards.
- Action links, such as website, call, booking, or other approved customer actions.
- Proof of ownership or authority if Apple requests documentation.

## Apple Business workflow

1. Sign in to Apple Business.
2. Create or select the organization and brand.
3. Search for an existing location before creating a new one.
4. If the location exists, claim it and complete phone or organization verification.
5. If it is already managed, request a transfer and provide supporting documentation.
6. If no location exists, add it with the correct map pin, display name, category, phone, website, hours, and brand.
7. Complete Apple review and verification.
8. Add approved photos, actions, and a first Showcase only after the core listing is accurate.
9. Record verification date, Apple location identifier, status, and operator notes in AI Edge OS.
10. Review Apple Insights when available and attribute observable calls, website actions, or referrals.

## Verification gates

The Apple channel is not marked connected until all applicable items are verified:

- Organization ownership confirmed.
- Correct business/location selected.
- Display name, phone, website, categories, hours, and map placement verified.
- Active and unavailable services match the canonical AI Edge OS service registry.
- Apple approval or phone verification completed.
- Public Apple Maps place card checked on an Apple device or web view.
- At least one action link tested.
- Public identifiers, verification date, and evidence recorded without secrets.
- Credential-revocation and team-access paths documented.
- No Apple Account password, verification code, or session token stored in GitHub.

## Current implementation boundary

AI Edge OS may prepare listing data, track status, store public Apple identifiers, create reminders, and measure observable referrals. It may not sign in, accept terms, pass multifactor authentication, submit verification documents, or alter the live Apple listing without an authenticated owner action or an officially authorized API path.

## Future integration assessment

After the listing is verified, evaluate whether Apple Business API access through an approved third-party partner is justified. Do not add a new paid operating platform merely to automate fields that change rarely. Prefer direct Apple Business management unless measurable operational value supports an API partner.
