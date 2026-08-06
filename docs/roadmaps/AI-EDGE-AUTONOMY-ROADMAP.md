# AI Edge OS Autonomy Roadmap

Last updated: 2026-08-02

## Current operational state

### Completed

- DAB-4A: deterministic one-operation planner.
- DAB-4B: durable one-cycle runtime composition.
- DAB-4C: bounded wake-up controller.
- DAB-4D: production activation-readiness gate.
- DAB-5A: unattended planner worker deployed in Coolify.
- DAB-5B: planner heartbeat/cycle visibility, stale detection, and recovery runbook.
- DAB-6A: unattended reasoning worker with durable requests, runs, structured recommendations, hard budgets, timeout, idempotency, and no action tools.
- DAB-6B: authenticated Mission Board showing planner state, agent state, provider readiness, budgets, queue state, and the latest recommendation.
- DAB-6C: fixed-allowlist trusted read-only project context with redaction, provenance, digests, truncation, total-byte limits, prompt-injection resistance, and Mission Board coverage visibility.
- DAB-7A: durable exact-scope approval inbox with immutable proposal fingerprints, expiry, risk and resource display, authenticated approve/reject/modify decisions, concurrency protection, and no execution authority.
- DAB-7B: isolated review-only preparation worker with a read-only source snapshot, disposable tmpfs workspace, structured file manifest, capability/path/size policy, hashed artifacts, unified diff, validation report, rollback plan, completion report, and Approval Inbox review visibility.
- DAB-8A code: first verified external publishing action implemented and merged. Production verification remains blocked by the unhealthy Coolify application state.

### In delivery

- Lead Bridge #110 / PR #111: read-only Gmail intake for Yelp and Nextdoor, deterministic classification, normalized durable lead records, deduplication, urgency, and later human-approved response drafting.
- Production recovery: diagnose and restore the Coolify application from `exited:unhealthy` before enabling customer-critical workers.

## Current authority boundary

The system may wake, inspect approved operational metadata and packaged durable project documents, reason, persist a recommendation, present an exact-scope preparation proposal, record an authenticated human decision, and prepare bounded review artifacts inside a disposable workspace. DAB-8A adds one tightly bounded external action only after a fresh authenticated hash-bound ARM confirmation: one Bed Bugs & Beyond post, one platform, one scheduled time. Lead Bridge adds read-only intake and classification only. It may not create or run campaigns, publish batches, switch platforms, mutate approved content, reply to customers, repair accounts, or expand authority from chat text alone.

## Publishing autonomy roadmap

1. Restore stable production health and verify DAB-8A in Coolify.
2. Add Facebook and Instagram campaign adapters and media verification.
3. Connect TikTok and add bounded publishing support.
4. Add YouTube video and Community publishing.
5. Resolve remaining Google Business Profile access limitations.
6. Enable one approved seven-day campaign with bounded daily slots.
7. Add idempotent retries, alerts, connection-health reporting, and post-publish performance reporting.

## Local discovery and lead-channel roadmap

The objective is one unified Lead Inbox and performance ledger, not a separate operating workflow for every platform. Each channel must enter AI Edge OS through the smallest reliable integration surface available: official API, authorized email ingestion, approved webhook, or manual deep link when automation is not permitted.

### Phase 1 — owned and highest-intent channels

1. **Google Business Profile**
   - Complete account connection and access verification.
   - Track calls, website actions, messages where available, reviews, and local visibility.
   - Route actionable notifications into the unified Lead Inbox.

2. **Google Local Services Ads**
   - Verify pest-control eligibility and service-area availability.
   - Connect lead notifications and dispute/status tracking where officially supported.
   - Measure cost per qualified lead, booking rate, and revenue.

3. **Yelp**
   - Complete Gmail-based read-only ingestion and deduplication.
   - Verify the unique Yelp reply-address behavior with a controlled human-approved draft.
   - Track response time, booking status, revenue, and lead quality.

4. **Facebook and Messenger**
   - Connect the business page, messages, lead forms, comments requiring response, and approved local-group workflow.
   - Keep all customer replies human-approved until response quality is proven.

5. **Nextdoor**
   - Ingest and classify opportunity emails without treating upsells as customer leads.
   - Deep-link operators to the exact Nextdoor workflow when direct reply automation is unavailable.
   - Reassess paid Opportunity Alerts only after measurable local lead volume justifies the cost.

### Phase 2 — paid lead marketplaces

6. **Thumbtack**
   - Connect account and lead notifications.
   - Capture requested service, location, timing, quoted cost, lead charge, response time, booking, and revenue.
   - Establish strict budget and lead-quality thresholds before scaling.

7. **Angi / HomeAdvisor**
   - Connect lead notifications and account status.
   - Identify shared leads, duplicate opportunities, and true acquisition cost.
   - Pause automatically or manually when economics fall below the approved threshold.

8. **Bark**
   - Run a controlled local-market experiment.
   - Track credit spend, contact rate, booking rate, and revenue before continued use.

9. **Porch**
   - Evaluate actual pest-control availability and local volume.
   - Activate only when there is a reliable notification or authorized integration path.

### Phase 3 — maps, directories, and organic discovery

10. **Bing Places**
    - Claim or verify the listing.
    - Synchronize core name, address/service area, phone, hours, categories, website, and media.
    - Track Bing/Maps referral traffic and calls where attribution is available.

11. **Apple Business Connect / Apple Maps**
    - Claim and verify the business location or service-area presence.
    - Maintain accurate hours, contact information, imagery, and action links.
    - Track Apple Maps referrals where observable.

12. **Local chamber and neighborhood directories**
    - Maintain a reviewed allowlist of legitimate directories.
    - Keep business information consistent and reject low-quality spam directories.

13. **Google Maps and organic local search**
    - Continue local SEO, review generation, service-area pages, structured data, and conversion tracking.
    - Connect lead source attribution back to the unified Lead Inbox and revenue ledger.

### Phase 4 — social and classified channels

14. **Instagram direct messages**
    - Route business inquiries into the unified Lead Inbox through the approved Meta connection.
    - Require human approval for replies during initial rollout.

15. **TikTok messages and local content**
    - Complete account connection.
    - Support bounded publishing first, then evaluate business-message ingestion if officially available.
    - Track content-assisted leads separately from direct inquiries.

16. **Craigslist Services**
    - Create an approved posting template and renewal schedule that complies with Craigslist rules.
    - Use unique tracking links or phone attribution when practical.
    - Apply strong spam, fraud, and duplicate-lead controls.

### Phase 5 — partnerships and owned referrals

17. **Apartment managers and property-management companies**
    - Build partner records, referral sources, service agreements, and follow-up schedules.

18. **Realtors, hotels, storage facilities, and moving companies**
    - Create a structured local-partnership pipeline with source attribution and revenue reporting.

19. **GorillaDesk forms, calls, and customer referrals**
    - Unify existing website forms, calls, SMS, bookings, and referral events with marketplace leads.
    - Prevent duplicate customer and opportunity records across systems.

## Channel activation rules

A channel is not considered connected merely because an account exists. It must pass all applicable gates:

1. Account ownership and permissions verified.
2. Official or authorized integration route identified.
3. Intake tested with a real or controlled message.
4. Deduplication and source attribution verified.
5. No automatic customer reply enabled without explicit authority.
6. Cost controls defined for paid channels.
7. Lead quality, response time, booking, revenue, and return on spend measurable.
8. Health monitoring, missed-event recovery, and operator fallback documented.
9. Kill switch and credential revocation path confirmed.
10. Channel retained only when its operational or financial value is proven.

## Required controls for every new action capability

Each capability requires a distinct authorization category, exact resource allowlist, immutable payload binding, idempotency, audit record, kill switch, rate limit, postcondition verification, and rollback or containment procedure. Prepared artifacts do not automatically become executable.

## Strategic destination

AI Edge OS wakes itself, understands bounded project and business context, identifies the highest-value next step, prepares work safely, requests approval when required, executes only within explicit authority, verifies the outcome, and reports a durable factual record. All lead and discovery channels converge into one operating view with source, urgency, response time, booking, cost, revenue, and return on investment.
