# Overnight Roadmap Progress Report 01

Date: 2026-08-03
Branch: `feature/lead-bridge-yelp-nextdoor`
Scope: safe, non-destructive GitHub and read-only Coolify work

## Completed and verified

### Production recovery documentation

- Recorded current Coolify infrastructure and application evidence.
- Created `docs/runbooks/PRODUCTION-RECOVERY-INVESTIGATION.md`.
- Documented the safe evidence-collection order, ranked hypotheses, recovery decision tree, verification gates, rollback boundary, and exact blocker.
- Commit: `a497a8429009bcfb8d2945e687db8101b56a2405`.

### Gmail OAuth and secret handling

- Created `docs/runbooks/GMAIL-OAUTH-COOLIFY-SECRETS.md`.
- Documented Gmail read-only scope, offline refresh-token requirements, protected Coolify variables, preflight, activation, rotation, revocation, and prohibited credential handling.
- Commit: `939d7d2b08b83302ea885d6b7217f014faf0d5c6`.

### Lead Bridge deployment and recovery

- Created `docs/runbooks/LEAD-BRIDGE-DEPLOYMENT-RECOVERY.md`.
- Documented dedicated-service isolation, disabled-mode deployment, controlled preflight, idempotency, restart catch-up, health, failures, rollback, and bounded missed-message recovery.
- Commit: `1897b9b4aa765b50ca98c082464e1161f61399e4`.

### Channel activation governance

- Created `docs/runbooks/CHANNEL-ACTIVATION-CHECKLIST.md`.
- Covered ownership, official integration path, business identity, event contracts, deduplication, data safety, human approval, publishing, paid controls, health, testing, attribution, retention, and deactivation.
- Commit: `c153d2fc80d6b70d85a8eab4fd9cda4a384070d1`.

### Channel implementation issues

Created implementation issues with dependencies, scope, exclusions, acceptance criteria, test plans, and completion gates:

- #114 — Thumbtack read-only lead intake and economics tracking.
- #115 — Angi/HomeAdvisor lead intake, shared-lead detection, and ROI.
- #116 — Google Business Profile, Local Services Ads, and local attribution.
- #117 — Facebook, Messenger, and Instagram unified lead intake.
- #118 — Bing Places listing verification and Microsoft local attribution.
- #119 — TikTok connection, bounded publishing, and lead attribution.
- #120 — Craigslist Services approval-only posting and lead controls.
- #121 — Bark controlled feasibility and lead-economics experiment.
- #122 — Porch availability and authorized lead-intake assessment.
- #123 — local partnership and directory referral pipeline.

Updated existing issues:

- #112 — Apple Business now has explicit acceptance criteria and test plan.
- #113 — AI discovery visibility now has explicit acceptance criteria and test plan.

## Verified current production facts

Read-only Coolify inspection confirmed:

- Coolify server is reachable and usable.
- Primary Docker Compose application `rkonpoppxacsnlfkqmf6yct6` is `exited:unhealthy`.
- Primary application restart count is 11 with maximum 10; last restart type is `crash`.
- Secondary web application `h3yxpr01zd7th0dimwq5yiu2` is `running:unknown` with restart count 0.
- The current connector does not expose runtime container/deployment logs, environment presence, mounted-file status, or per-service health output.

## Blocked

### Exact production root cause

Blocked on bounded runtime logs from the primary Coolify Docker Compose application. The crash loop is verified, but the exact failing service and exception are not available through the current connector. Master checklist item 10 remains incomplete.

### Production restoration

Blocked until the exact failure is identified, a reviewed repair is prepared, and a controlled deployment verifies health. No restart or deployment was attempted.

### Live Lead Bridge activation

Blocked by:

- unhealthy primary production stack;
- absent owner-configured Gmail OAuth runtime secrets;
- no controlled live Gmail ingestion test;
- current worker reliability gaps, including durable checkpointing, pagination, backoff, quarantine, heartbeat, and dedicated service wiring.

### Live external channels

Apple, Google, Meta, Bing, TikTok, Thumbtack, Angi, Bark, Porch, and Craigslist account actions remain blocked on authenticated owner login, consent, verification, terms, billing, or real notification evidence as applicable.

## Failed or not completed

- No production diagnosis from logs was possible because the connector lacks log access.
- No code hardening was marked complete; only specifications and runbooks were completed.
- No account was created or modified.
- No listing was claimed or changed.
- No customer message was sent.
- No content was published.
- No billing or paid channel was activated.
- No pull request was merged.
- No production deployment or restart was performed.

## Owner-required actions

1. Provide or inspect bounded Coolify logs for the failed primary application when awake.
2. Complete Thumbtack and Angi account setup and enable all relevant email notifications.
3. Configure Gmail OAuth credentials in Coolify only after the production stack and dedicated worker path are ready.
4. Complete Apple/Microsoft/Google/Meta/TikTok sign-ins and verification only when the corresponding implementation package reaches its owner-action gate.
5. Approve any future spend, public posting, customer reply, or production deployment separately.

## Next safe independent work

- Create architecture decision records for Gmail intake, unified lead identity, source attribution, and human-approved replies.
- Inspect PR #111 code in detail and prepare a bounded hardening implementation plan tied to exact files and tests.
- Audit the website repository for crawler/indexing configuration and canonical business facts without changing live infrastructure.
- Prepare changelog and session-handoff updates after the current documentation package is fully indexed in the master checklist.
