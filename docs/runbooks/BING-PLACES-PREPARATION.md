# Bing Places Preparation Runbook

Last updated: 2026-08-03
Business: Bed Bugs & Beyond

## Purpose

Prepare the non-secret identity data, listing fields, verification evidence, and operating controls required to claim or add Bed Bugs & Beyond in Bing Places for Business without storing Microsoft credentials or verification codes in source control.

## Official workflow baseline

Bing Places currently describes three core steps:

1. Claim an existing listing or add a new one.
2. Complete the listing profile with accurate business information, services, hours, photos, and contact methods.
3. Verify the listing using an available address, phone, or email PIN method.

Bing requires a valid business address, while eligible service-area businesses may be able to hide that address in public search results. The exact options shown in the authenticated account remain the source of truth.

Official source checked 2026-08-03:

- https://www.bingplaces.com/Home/Index

## Internal source package

Use `docs/audits/BED-BUGS-AND-BEYOND-BUSINESS-IDENTITY-AUDIT.md` before entering data in Bing Places.

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
- Fumigation is active, subject to approved safety and service language.

These repository values are preparation inputs, not proof that public phone, website, hours, address visibility, categories, or imagery are current. Confirm all live fields before submission.

## Owner-required actions

- Sign in with the approved Microsoft account.
- Confirm whether an existing listing is correct, duplicated, or controlled by another account.
- Approve the final business phone, website, hours, address visibility, categories, services, and imagery.
- Complete the verification method Bing makes available.
- Enter any verification PIN directly in Bing Places; never store it in GitHub.

## Listing data package

Prepare and confirm:

- legal business name;
- customer-facing display name;
- valid business address and whether it should be hidden publicly for a service-area business;
- primary business phone;
- HTTPS website;
- primary and additional categories;
- services actually offered;
- service areas;
- regular and special hours;
- business description based only on verified claims;
- logo, cover image, and representative service photos;
- approved appointment, contact, or website links where supported.

## Claim and verification workflow

1. Sign in to Bing Places for Business.
2. Search for Bed Bugs & Beyond before creating a new listing.
3. Review possible duplicates, old names, old phone numbers, and incorrect map records.
4. Claim the correct listing or add a new listing only when no valid record exists.
5. Enter the approved identity, contact, category, service, hours, and media fields.
6. Select the valid service-area/address-display option presented by Bing.
7. Complete the available verification method.
8. Record only non-secret evidence: public listing URL or identifier, verification date, status, operator, and field-review notes.
9. Check the public Bing listing after approval on desktop and mobile search surfaces where available.
10. Reconcile any differences between Bing, the official website, Google, Apple, Yelp, and other verified profiles.

## Verification gates

Do not mark Bing Places connected until all applicable gates pass:

- correct listing selected and duplicate risk reviewed;
- ownership or management authority confirmed;
- valid address recorded and public visibility decision approved;
- public name, phone, website, category, services, service area, and hours match current business facts;
- prohibited or unavailable services are absent;
- photos are owned or properly licensed and accurately represent the business;
- Bing verification completes successfully;
- public listing is checked after approval;
- public identifier, verification date, status, and evidence are recorded;
- credential revocation and team access are documented;
- no Microsoft password, MFA code, PIN, cookie, or session token is stored in source control.

## Measurement and maintenance

- Record observable Bing or Bing Maps referral traffic in analytics when available.
- Use unique campaign parameters only on links that remain customer-friendly and platform-compliant.
- Review listing accuracy after changes to phone, hours, website, categories, service area, or business status.
- Compare public fields against Google Business Profile and Apple Business to reduce entity inconsistency.
- Treat dashboard impressions or clicks as provider-reported observations, not guaranteed lead or revenue attribution.

## Current authority boundary

AI Edge OS may prepare listing data, track non-secret status, store public identifiers, schedule review reminders, and measure observable referrals. It may not sign in, pass multifactor authentication, submit a verification PIN, accept terms, change the live listing, or approve paid advertising without authenticated owner action and separate authority.
