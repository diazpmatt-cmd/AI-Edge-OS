# RGE-7 Production Acceptance — Attribution

Date: July 30, 2026
Project: AI Edge OS / Bed Bugs & Beyond
Status: Production accepted

## Scope

RGE-7 validates controlled referral attribution against GorillaDesk customer data using an explicit human confirmation step. The acceptance test was designed to avoid customer messaging, rewards, payments, external CRM writes, and real-customer impact.

## Production Evidence

- Added a visible `Sync GorillaDesk Customers` control to Referral Engine → Attribution.
- The sync action requires user confirmation before running.
- The UI clearly states that it reads GorillaDesk customers and lead sources into Alex.
- The UI clearly states that it sends no customer messages and writes nothing back to GorillaDesk.
- GorillaDesk jobs and payments were not synced and remained unavailable.
- Production sync completed successfully with 456 customers and 8 lead sources.
- A controlled GorillaDesk test customer and a controlled Alex referral were matched by exact normalized phone number.
- The proposed attribution candidate displayed 90% confidence.
- Measured referral revenue displayed as unavailable, which was expected because no GorillaDesk job was created.
- Human confirmation completed successfully.
- No automatic attribution confirmation occurred.
- No customer message, reward, payout, payment, or external GorillaDesk write occurred.

## Infrastructure Corrections Discovered During Acceptance

- PR #65 added the in-product GorillaDesk sync control to the Attribution tab.
- PR #65 merged as commit `ac728b1112014bade72e201e39bdc5e72031e099`.
- PR #66 added `GORILLADESK_API_KEY` to the API service environment mapping in `docker-compose.coolify.yml`.
- PR #66 merged as commit `8509ed94d31ce445efb1bfde41748cc9bc515702`.
- The GorillaDesk API key remains stored only in Coolify and was not committed to GitHub.
- Production verification showed that both Coolify deployments can execute API runtime code:
  - Alex application: `h3yxpr01zd7th0dimwq5yiu2`
  - Main Docker Compose stack: `rkonpoppxacsnlfkqmf6yct6`
- Shared runtime secrets may therefore need to be configured in both deployments when both can serve API requests.

## Safety State

The following controls remained unchanged throughout acceptance:

- Referral delivery mode: dry run
- Referral delivery emergency stop: engaged
- Referral scheduler: disabled
- Live referral delivery: disabled
- No automated customer communication
- No automated reward or payment issuance
- Attribution required a human decision

## Acceptance Decision

RGE-7 Attribution is production accepted.

Current formal Referral Growth acceptance: 7 of 8 milestones, 87.5%.

RGE-8 remains pending and must validate final end-to-end readiness without enabling live delivery, schedulers, automated rewards, or customer messaging.
