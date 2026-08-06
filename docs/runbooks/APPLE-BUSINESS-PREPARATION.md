# Apple Business Preparation Runbook

Last updated: 2026-08-03
Business: Bed Bugs & Beyond

## Purpose

Prepare the business identity, listing content, verification evidence, and operating controls required to claim or add Bed Bugs & Beyond in Apple Business (formerly Apple Business Connect) without storing Apple credentials in source control.

## Current official baseline

Apple's April 2026 guidance distinguishes organization verification from location verification:

- A new Apple Business organization should complete verification within Apple's stated verification window.
- Organization verification currently requires two methods, selected from available options such as an accepted business identifier, domain validation, an eligible App Store Connect relationship, or approved official documents.
- Adding a location requires an authorized role, a search for an existing location, correct map placement, display name, category, status, phone, optional website, hours, and an associated brand.
- An existing Apple Maps location may offer phone verification using the phone number Apple already has on record.
- A location already managed by another organization requires a transfer request and may require supporting documentation.

The authenticated Apple Business interface is the source of truth for the exact methods available to this organization and location.

Official sources checked 2026-08-03:

- https://support.apple.com/guide/business/axm402206497/web
- https://support.apple.com/guide/business/abcb98816a34/web
- https://support.apple.com/guide/business/axm48c3280c0/web
- https://support.apple.com/guide/business/abcbdc543423/web

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

- Sign in with an Apple Account or Managed Apple Account that has the required Apple Business role.
- Accept Apple's terms.
- Complete the organization verification methods Apple offers.
- Complete location verification where required.
- Approve any phone verification, domain DNS change, transfer request, or supporting-document submission.
- Confirm the final phone, website, hours, service-area/location representation, categories, and approved imagery.

## Data package to prepare before sign-in

- Legal business name.
- Customer-facing display name: Bed Bugs & Beyond.
- Country/region: United States.
- Business phone number.
- HTTPS website.
- Physical address and exact map coordinates required by Apple for the location record.
- Approved public address representation.
- Primary and additional categories.
- Regular hours and holiday/special hours.
- Logo, cover photo, and location photos that meet Apple's standards.
- Action links, such as website, call, booking, or other approved customer actions.
- Two independent organization-verification methods and supporting evidence.
- Proof of ownership or authority if Apple requests documentation.

## Apple Business workflow

1. Sign in to Apple Business with a role authorized to manage the organization, brands, and locations.
2. Verify the organization using two Apple-accepted methods shown in the account.
3. Create or select the organization and brand.
4. Search for an existing Apple Maps location before creating a new one.
5. If the location exists, select it and confirm the map pin, display name, category, status, phone, website, hours, and brand.
6. If Apple offers phone verification for the existing location, confirm that the number on record is recognized before requesting the call.
7. If the location is already managed, request a transfer and provide only approved supporting documentation.
8. If no location exists, add it with the correct address, coordinates, map placement, display name, category, phone, website, hours, and brand.
9. Complete Apple review and verification.
10. Add approved photos, actions, and a first Showcase only after the core listing is accurate.
11. Record verification date, public Apple location identifier, status, and operator notes in AI Edge OS.
12. Review Apple Insights when available and attribute observable calls, website actions, or referrals.

## Domain verification boundary

If domain validation is selected as one verification method:

- Apple supplies the exact DNS TXT value.
- An authorized DNS operator adds the TXT record to the correct domain.
- No DNS value is guessed or copied from another organization.
- The record remains in place when Apple requires continued verification for an enabled feature.
- The verification value is treated as operational evidence, not an account credential, but it should still be handled through the approved DNS-change process.

No DNS change is performed from this runbook automatically.

## Verification gates

The Apple channel is not marked connected until all applicable items are verified:

- Organization ownership confirmed using the required verification methods.
- Correct business/location selected.
- Display name, phone, website, categories, hours, address, coordinates, and map placement verified.
- Active and unavailable services match the canonical AI Edge OS service registry.
- Apple approval, organization verification, location verification, or transfer completes as applicable.
- Public Apple Maps place card checked on an Apple device or web view.
- At least one action link tested.
- Public identifiers, verification date, and evidence recorded without secrets.
- Credential-revocation and team-access paths documented.
- No Apple Account password, MFA code, verification code, session cookie, or session token stored in GitHub.

## Current implementation boundary

AI Edge OS may prepare listing data, track status, store public Apple identifiers, create reminders, and measure observable referrals. It may not sign in, accept terms, pass multifactor authentication, submit verification documents, alter DNS, or change the live Apple listing without an authenticated owner action or an officially authorized API path.

## Future integration assessment

After the listing is verified, evaluate whether Apple Business API access through an approved third-party partner is justified. Do not add a new paid operating platform merely to automate fields that change rarely. Prefer direct Apple Business management unless measurable operational value supports an API partner.
