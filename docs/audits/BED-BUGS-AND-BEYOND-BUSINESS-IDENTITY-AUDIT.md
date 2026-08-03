# Bed Bugs & Beyond Business Identity Audit

Last updated: 2026-08-03
Scope: repository-defined AI Edge OS business identity and listing inputs
Status: repository audit complete; live database and public-listing verification pending

## Purpose

Establish which Bed Bugs & Beyond facts are already defined inside AI Edge OS, identify conflicts or missing listing fields, and prevent Apple Business, Bing Places, Google, AI-search, and directory work from inventing data.

## Verified canonical identity

The client bootstrap in `artifacts/api-server/src/lib/client-resolver.ts` defines the following Bed Bugs & Beyond tenant identity:

| Field | Repository-defined value | Confidence |
|---|---|---|
| Display name | `Bed Bugs & Beyond` | Verified in bootstrap code |
| Stable slug | `bed-bugs-and-beyond` | Verified in bootstrap code |
| Industry | `pest_control` | Verified in bootstrap code |
| Industry label | `pest control` | Verified in bootstrap code |
| Region | `Gulf Coast of Alabama (Baldwin County)` | Verified in bootstrap code |
| Time zone | `America/Chicago` | Verified in bootstrap code |
| Active state | `true` at initial bootstrap | Verified default/bootstrap behavior |

### Repository-defined service areas

The bootstrap defines:

- Foley, Alabama
- Daphne, Alabama
- Loxley, Alabama
- Fairhope, Alabama
- Gulf Shores, Alabama
- Orange Beach, Alabama
- Summerdale, Alabama
- Spanish Fort, Alabama
- Elberta, Alabama
- Lillian, Alabama
- Perdido Beach, Alabama

These are suitable as a starting service-area set, but a live database read and owner review must confirm they remain current before synchronizing any public listing.

## Verified service-positioning rules

The canonical registry in `lib/db/src/bbb-services.ts` and its database loader establishes the following critical listing and AI-discovery rules:

### Active and permissible claims

- Bed Bug Inspection is active.
- Bed Bug Treatment is active.
- Residential Pest Control is active.
- Commercial Pest Control is active.
- Roach Control is active.
- Rodent Control is active.
- Fumigation is active.
- Additional active or seasonal pest services are represented in the registry and must retain their exact status when used publicly.

### Hard restrictions

- Do not claim that Bed Bugs & Beyond offers whole-home bed bug heat treatment.
- Position bed bug treatment around targeted treatment of affected furniture and specific areas.
- Do not promise guaranteed elimination, one-visit resolution, or unverified exact savings.
- Termite Control is `coming_soon`, with generation, booking, publishing, and CTA capability disabled.
- Wildlife Removal is disabled and must not be presented as offered.
- Fumigation may be listed as active, but public content must avoid chemical dosages, do-it-yourself instructions, regulatory guarantees, unapproved preparation steps, exact price guarantees, or elimination guarantees.

## Listing profile capability already modeled

`lib/db/src/schema/local-presence.ts` provides fields for:

- business name
- phone
- website
- address, city, state, and ZIP
- normalized NAP data
- description
- categories
- hours
- service areas
- attributes
- photos
- per-channel listing URL
- verification status
- provider identifier
- completeness and health scores
- sync timestamps and issue records

This schema is sufficient to store an Apple Business, Bing Places, Google, and directory readiness snapshot. It does not prove that every field currently has a live value.

## Fields not verified from the inspected repository sources

The following values must be read from the live tenant record or confirmed by the owner before any public listing is created or modified:

- primary public phone number
- canonical HTTPS website URL
- current operating hours and holiday hours
- whether the business should be represented as service-area only or with a customer-facing location
- public street address, if one is legitimately customer-facing
- primary and secondary listing categories for each platform
- legal organization name versus public display name
- business license or verification documentation
- logo, cover image, and approved location/service photos
- approved appointment, quote, call, and website action links
- current Apple, Bing, Google, Yelp, or other provider identifiers

Absence from this repository audit must not be interpreted as absence from the production database. It means the value was not verified in the inspected source files.

## Consistency findings

1. **Business name:** The repository consistently uses `Bed Bugs & Beyond` for the canonical client display name. The Lead Bridge currently writes `Bed Bugs and Beyond` in one field; this should be normalized in a future data-model change, while preserving source payload text separately.
2. **Geography:** Baldwin County and the listed municipalities are consistently aligned with the business's local-market positioning.
3. **Service truth:** The service registry contains strong safeguards against termite, wildlife-removal, and heat-treatment misrepresentation.
4. **Listing data separation:** The local-presence schema correctly separates canonical profile data from channel-specific status and provider identifiers.
5. **Verification gap:** Code-defined seed values do not replace a read-only production database snapshot or public place-card review.

## Recommended canonical listing record

Before connecting Apple or Bing, create or verify one owner-approved internal record with these fields:

```text
business_display_name
legal_business_name
service_area_business
public_address_visibility
phone_e164
website_https
primary_category
secondary_categories
regular_hours
holiday_hours
service_areas
short_description
long_description
logo_asset_id
cover_asset_id
approved_photo_asset_ids
action_links
owner_verified_at
source_evidence
```

All channel adapters should read from this record instead of maintaining platform-specific copies of business facts.

## Activation gates

A listing may not be marked ready until:

1. the live AI Edge OS profile is read and compared with this audit;
2. the owner confirms phone, website, hours, address visibility, categories, and imagery;
3. active and unavailable service claims match the canonical registry;
4. the public place card is reviewed after verification;
5. provider identifiers and verification evidence are stored without secrets;
6. discrepancies are recorded rather than silently overwritten.

## Audit conclusion

The repository already provides a strong canonical name, geography, time zone, service-area seed, service registry, and listing-profile schema. The main remaining risk is not missing architecture; it is unverified operational data such as phone, website, hours, address visibility, categories, imagery, and live provider identifiers. No live listing was changed by this audit.
