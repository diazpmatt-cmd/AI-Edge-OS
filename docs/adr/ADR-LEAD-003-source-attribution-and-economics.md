# ADR-LEAD-003: Lead Source Attribution and Channel Economics

Status: Accepted for bounded implementation
Date: 2026-08-03

## Context

Bed Bugs & Beyond will receive leads from owned, organic, referral, marketplace, social, directory, and paid advertising channels. These sources expose different levels of evidence. Paid marketplaces may charge for shared or unqualified leads, while organic maps and AI-search referrals may provide only partial attribution.

Without a common model, lead volume can look impressive while hiding duplicate leads, acquisition charges, slow response, weak booking rates, refunds, disputes, and incomplete revenue. False precision is also dangerous: not every call or booking can be conclusively tied to a platform.

## Decision

Store attribution at three levels:

1. **Observed source evidence** — the factual provider, email, tracking code, referrer, call number, form, listing, campaign, or partner reference observed at intake.
2. **Operational attribution** — the source/channel used for routing, response, and performance reporting.
3. **Financial attribution** — costs, refunds, disputes, booked revenue, and completed revenue connected to the customer opportunity/job.

Attribution must record confidence and provenance rather than converting an inference into a fact.

## Canonical fields

### Source evidence

- channel and provider;
- account/location/profile/listing identifier when public or safely stored;
- campaign/ad/creative/referral partner identifier when available;
- external lead/conversation/event identifier;
- source URL or deep link;
- received/observed timestamp;
- tracking phone, URL parameter, form, referrer, or email evidence;
- attribution confidence: `direct`, `strong`, `inferred`, `unknown`;
- bounded provenance and reason code.

### Funnel outcomes

- received;
- qualified/unqualified;
- first response time;
- contacted;
- estimate provided;
- booked;
- completed;
- lost/cancelled;
- duplicate/shared/spam;
- loss reason.

### Financial fields

- lead/ad/referral cost;
- credit or bid cost;
- refund amount/status;
- dispute status;
- estimate amount;
- booked revenue;
- completed/collected revenue;
- adjustment or cancellation amount;
- currency and recorded timestamp.

## Calculation rules

- Lead counts exclude exact replay and separate spam/account notices from customer opportunities.
- Qualified-lead rate uses distinct operational opportunities, not raw messages.
- Cost per qualified lead includes non-refunded source costs.
- Cost per booking uses booked opportunities and avoids double-counting shared/linked duplicates.
- Return on spend uses the selected revenue basis and labels whether it is booked, completed, or collected revenue.
- Organic, map, AI-search, and referral attribution reports only what evidence supports.
- Shared leads retain each provider cost while completed revenue is counted once at the job/opportunity level.
- Refunds and disputes remain separate factual events; a requested refund is not recorded as received.

## Reporting boundaries

Every report must state:

- date range and timezone;
- revenue basis;
- included/excluded statuses;
- duplicate/shared-lead treatment;
- unattributed volume;
- incomplete or stale provider data;
- attribution confidence limitations.

No report may claim causality solely because a source was observed near the same time as a booking.

## Spend controls

Paid channels require:

- explicit owner-approved caps;
- approved geography and services;
- cost and quality thresholds;
- pause criteria;
- refund/dispute process;
- reconciliation to provider statements;
- no automatic expansion or budget increase without separate authority.

## Consequences

### Positive

- Makes channel comparisons economically meaningful.
- Separates raw volume from qualified and completed business.
- Handles shared leads and refunds honestly.
- Supports cautious measurement for organic and AI-discovery sources.

### Negative

- Some sources will remain partially or wholly unattributed.
- Revenue and cost reconciliation requires operational discipline.
- Booked revenue can overstate actual collected results if not clearly labeled.
- Partner and offline referrals may require manual evidence.

## Rejected alternatives

### Last-click attribution as universal truth

Rejected because calls, offline referrals, repeat customers, and cross-device journeys often lack reliable last-click evidence.

### Equal credit across every observed source

Rejected because it manufactures precision and can reward noisy or duplicated sources.

### Counting every marketplace message as a lead

Rejected because promotions, follow-ups, duplicates, and account notices distort economics.

### Optimizing on lead volume alone

Rejected because the business needs qualified bookings and completed revenue, not notification count.

## Verification requirements

- Exact replay does not increase lead counts or cost.
- Shared leads retain provider costs without duplicating revenue.
- Refund requested, approved, and received states remain distinct.
- Booked, completed, and collected revenue are not conflated.
- Unknown attribution remains unknown.
- Paid channel caps and pause calculations are deterministic and tested.
- Reports disclose confidence, exclusions, and stale/incomplete data.
- Access controls protect customer and financial data.

## Related records

- Issues #114–#123
- `docs/runbooks/CHANNEL-ACTIVATION-CHECKLIST.md`
- `docs/adr/ADR-LEAD-002-unified-lead-identity.md`
