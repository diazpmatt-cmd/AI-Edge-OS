# Channel Expansion Master Execution Checklist

Last updated: 2026-08-03
Owner: Bed Bugs & Beyond / AI Edge OS

This is the single ordered execution list for production recovery, lead intake, channel expansion, measurement, and operating documentation. A checked box means the result is verified, not merely planned or partially coded.

## A. Production reliability and Lead Bridge

1. [x] Verify the connected Gmail identity is `mattdiaz@bedbugsandbeyond.net`.
2. [x] Confirm Yelp lead emails can be found and read through the connected Gmail account.
3. [x] Confirm Nextdoor opportunity and promotional emails can be found and read through the connected Gmail account.
4. [x] Create hourly ChatGPT condition monitoring for genuine Yelp and Nextdoor leads without sending replies or modifying email.
5. [x] Create GitHub Issue #110 for the unified Yelp and Nextdoor Lead Bridge.
6. [x] Create branch `feature/lead-bridge-yelp-nextdoor`.
7. [x] Implement deterministic Yelp and Nextdoor email classification.
8. [x] Implement the first read-only Gmail polling worker and duplicate protection in draft PR #111.
9. [x] Add initial classifier tests and confirm the Coolify stack validation workflow passes for PR #111.
10. [ ] Diagnose the current production application crash using runtime logs and exact failure evidence.
11. [ ] Restore the main AI Edge OS application to a stable healthy state with restart count and health checks verified.
12. [ ] Add a separate lead-worker service so website failure does not stop inbox monitoring.
13. [ ] Add durable Gmail checkpoint storage and restart-safe catch-up scanning.
14. [ ] Add exponential backoff, failed-message quarantine, structured redacted logging, and stale-worker detection.
15. [ ] Add health/readiness reporting and a visible `last successful Gmail check` timestamp.
16. [ ] Configure `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` as protected Coolify secrets. **Owner action required.**
17. [ ] Run a controlled live Gmail ingestion test in production.
18. [ ] Verify one real Yelp email creates exactly one durable lead record after repeated worker runs.
19. [ ] Verify a Nextdoor promotional email is ignored and never becomes a customer lead.
20. [ ] Verify restart recovery catches missed emails without duplicates.
21. [ ] Merge PR #111 only after CI, production health, secrets, and live ingestion are verified.

## B. Unified Lead Inbox and revenue measurement

22. [ ] Build authenticated Lead Inbox API routes.
23. [ ] Build Lead Inbox dashboard with source, customer, service, location, urgency, age, status, and next action.
24. [ ] Add statuses for new, contacted, estimate provided, booked, completed, lost, duplicate, and spam.
25. [ ] Add source deep links and read-only message review.
26. [ ] Add notes, ownership, last-response time, and next-follow-up fields.
27. [ ] Add duplicate and shared-lead indicators across platforms.
28. [ ] Add lead-source attribution fields for channel, campaign, listing, and referral partner.
29. [ ] Add financial fields for lead charge, refund/dispute, estimate amount, booked revenue, and completed revenue.
30. [ ] Add performance calculations for response time, qualification rate, booking rate, cost per booking, and return on spend.
31. [ ] Add missed-lead and aging alerts.
32. [ ] Keep all outbound customer replies human-approved until a separate response capability is authorized and verified.

## C. Google channels

33. [ ] Audit current Google Business Profile connection code, permissions, and unresolved blockers.
34. [ ] Complete Google Business Profile account access verification. **Owner action may be required.**
35. [ ] Route actionable Google Business Profile notifications into the unified Lead Inbox where officially supported.
36. [ ] Add calls, website actions, reviews, messages, and local-visibility attribution where data is available.
37. [ ] Verify Google Local Services Ads pest-control eligibility and service-area availability.
38. [ ] Prepare Local Services Ads intake, dispute/status tracking, and cost-per-qualified-lead reporting.
39. [ ] Activate Local Services Ads only after owner approval of billing and budget controls. **Owner action required.**
40. [ ] Continue Google Maps and organic local-search attribution, service-area content, structured data, and conversion tracking.

## D. Yelp and Nextdoor completion

41. [ ] Create a human-reviewed draft response to a controlled Yelp lead without sending it.
42. [ ] Verify whether replying to Yelp's unique `messaging.yelp.com` address reaches the correct Yelp conversation.
43. [ ] Add Yelp response-time, booking, revenue, and lead-quality tracking.
44. [ ] Add Nextdoor exact-workflow deep links for operator follow-up.
45. [ ] Track Nextdoor opportunity volume before considering paid Opportunity Alerts.
46. [ ] Reassess paid Nextdoor access only when measured lead volume supports the expense. **Owner approval required.**

## E. Meta channels

47. [ ] Audit the current Facebook and Instagram connection architecture and permissions.
48. [ ] Connect the Bed Bugs & Beyond Facebook business page. **Owner login/approval required.**
49. [ ] Route Facebook Messenger inquiries and lead forms into the unified Lead Inbox.
50. [ ] Detect actionable comments without automatically posting replies.
51. [ ] Route Instagram direct-message business inquiries into the same inbox where officially supported.
52. [ ] Add cross-platform deduplication for Facebook and Instagram inquiries.
53. [ ] Keep Meta replies human-approved during initial rollout.

## F. Thumbtack

54. [ ] Create the Bed Bugs & Beyond Thumbtack account using the business Gmail. **Owner action underway/required.**
55. [ ] Enable email notifications for leads, customer messages, charges, refunds, and account alerts. **Owner action required.**
56. [ ] Inspect the first real or controlled Thumbtack notification email.
57. [ ] Document sender, subject patterns, included lead fields, deep links, and reply limitations.
58. [ ] Implement Thumbtack email classification and parsing.
59. [ ] Capture requested service, location, timing, quote/charge, response time, booking, and revenue.
60. [ ] Add strict budget and lead-quality thresholds before scaling. **Owner approval required for spending.**
61. [ ] Verify duplicate protection and one-record-per-lead behavior.

## G. Angi / HomeAdvisor

62. [ ] Create the Bed Bugs & Beyond Angi account using the business Gmail. **Owner action underway/required.**
63. [ ] Enable email notifications for leads, messages, charges, refunds, disputes, and account alerts. **Owner action required.**
64. [ ] Inspect the first real or controlled Angi/HomeAdvisor notification email.
65. [ ] Document sender, subject patterns, included lead fields, deep links, and reply limitations.
66. [ ] Implement Angi/HomeAdvisor email classification and parsing.
67. [ ] Detect shared leads, duplicate opportunities, and actual acquisition cost.
68. [ ] Add lead-charge, refund, dispute, booking, and revenue reporting.
69. [ ] Define pause thresholds when economics fall below the approved limit. **Owner approval required for spending rules.**

## H. Bing Places and Apple Business Connect

70. [ ] Audit the business identity data already stored in AI Edge OS for listing consistency.
71. [ ] Prepare the Bing Places name, service area, phone, hours, category, website, and media checklist.
72. [ ] Claim or verify Bing Places. **Owner Microsoft login/verification required.**
73. [ ] Add Bing/Maps referral and call attribution where observable.
74. [x] Prepare the Apple Business Connect profile and verification checklist. See `docs/runbooks/APPLE-BUSINESS-PREPARATION.md` and Issue #112.
75. [ ] Claim or verify Apple Business Connect / Apple Maps. **Owner Apple login/verification required.**
76. [ ] Maintain Apple hours, contact data, imagery, and action links.
77. [ ] Add Apple Maps referral attribution where observable.

## I. TikTok, YouTube, and social publishing

78. [ ] Audit the current TikTok OAuth and publishing implementation status.
79. [ ] Connect the Bed Bugs & Beyond TikTok account. **Owner login/approval required.**
80. [ ] Implement bounded TikTok publishing with media validation, payload binding, receipts, and a kill switch.
81. [ ] Evaluate TikTok business-message ingestion only if officially supported.
82. [ ] Track direct TikTok inquiries separately from content-assisted leads.
83. [ ] Add YouTube video and Community publishing with the same approval and verification controls.
84. [ ] Complete Facebook and Instagram campaign adapters and media verification.
85. [ ] Enable one approved seven-day campaign only after single-post production verification is stable.

## J. Craigslist, Bark, and Porch

86. [ ] Prepare compliant Craigslist Services posting templates.
87. [ ] Add an approval-only Craigslist posting and renewal workflow.
88. [ ] Add unique tracking links or phone attribution where practical.
89. [ ] Add Craigslist spam, fraud, and duplicate-lead controls.
90. [ ] Run a documented Bark feasibility and economics assessment.
91. [ ] Activate Bark only as a controlled experiment with a strict budget. **Owner approval required.**
92. [ ] Evaluate Porch pest-control availability and local lead volume.
93. [ ] Activate Porch only if a reliable authorized notification path and acceptable economics exist. **Owner approval required.**

## K. Partnerships, directories, and owned referrals

94. [ ] Build partner records for apartment managers and property-management companies.
95. [ ] Add referral source, agreement, follow-up schedule, status, notes, and attributed revenue fields.
96. [ ] Build pipelines for realtors, hotels, storage facilities, and moving companies.
97. [ ] Create a reviewed allowlist of legitimate chamber, neighborhood, and local-business directories.
98. [ ] Reject low-quality or spam directories and keep core business information consistent.
99. [ ] Unify GorillaDesk forms, calls, SMS, bookings, and customer referrals with marketplace leads.
100. [ ] Prevent duplicate customer and opportunity records across Gmail, GorillaDesk, Telnyx, web forms, and marketplace sources.

## L. Documentation, control, and operating readiness

101. [x] Add the local discovery and channel expansion plan to the AI Edge OS Autonomy Roadmap.
102. [x] Create this single numbered master execution checklist.
103. [x] Create or update architecture decision records for Gmail intake, unified lead identity, source attribution, and human-approved replies. See `docs/adr/ADR-LEAD-001-gmail-read-only-ingestion.md` through `ADR-LEAD-004-human-approved-outbound-responses.md`.
104. [x] Create the Gmail OAuth and Coolify secret-configuration runbook. See `docs/runbooks/GMAIL-OAUTH-COOLIFY-SECRETS.md`.
105. [x] Create the Lead Bridge deployment, rollback, and failure-recovery runbook. See `docs/runbooks/LEAD-BRIDGE-DEPLOYMENT-RECOVERY.md`.
106. [x] Create the channel activation checklist covering permissions, testing, deduplication, attribution, costs, health, fallback, and kill switch. See `docs/runbooks/CHANNEL-ACTIVATION-CHECKLIST.md`.
107. [x] Create separate implementation issues for Thumbtack, Angi, Google, Meta, Bing, Apple, TikTok, Craigslist, Bark, Porch, and partnerships. See Issues #112 and #114–#123.
108. [x] Add acceptance criteria and test plans to every implementation issue created for this channel package.
109. [ ] Update the changelog and session handoff after each completed delivery package.
110. [x] Produce a factual progress report listing completed, blocked, failed, and owner-required items without marking partial work complete. See `docs/reports/2026-08-03-OVERNIGHT-ROADMAP-PROGRESS-01.md`.

## Completion standard

A box is checked only when the result is verifiably complete. Planning, partial code, an account login, or a successful local test does not count as a finished production capability. When work is blocked, record the exact blocker and continue with the next safe independent item.
