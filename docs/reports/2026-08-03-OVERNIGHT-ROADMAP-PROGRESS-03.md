# Overnight Roadmap Progress 03

Date: 2026-08-03
Branch: `feature/lead-bridge-yelp-nextdoor`

## Completed

- Added the Bing Places preparation runbook with canonical-data, duplicate-review, verification, address-visibility, media, attribution, and credential-safety controls.
- Refreshed the Apple Business preparation runbook against current official Apple guidance, including separate organization/location verification, two-method organization verification, domain validation, phone verification, transfer, and map-data controls.
- Refreshed the AI Discovery Partner Plan against current official OpenAI and Anthropic crawler guidance, separating search/user-directed retrieval from model-training policy and documenting edge/WAF testing requirements.
- Marked master checklist item 71 complete after the Bing preparation package was committed.
- Added implementation evidence to Issues #112, #113, and #118.

## Commits

- `e9ac9fe512d04e945836d651ce3eccf3f99bbf2b` — Bing Places preparation runbook.
- `0627448cd6365a28b99a96b018d0fd693c0e8baa` — Apple Business verification refresh.
- `fe5408c20bb6bb228d6a06475ffdd43f1873f635` — AI crawler discovery-policy refresh.
- `14e663c3cb031e9ab67be68cd92832a6c97f2f83` — master checklist item 71 completion.

## Blocked

- Production crash diagnosis still requires bounded Coolify runtime/container logs and immutable deployment evidence.
- Lead Bridge production activation still requires protected Gmail OAuth secrets, production recovery, and controlled live replay/restart evidence.
- Apple Business verification requires authenticated owner action and the verification methods Apple offers to the account.
- Bing Places claim and verification require authenticated owner action.
- Live AI discovery audit requires access to the authoritative Bed Bugs & Beyond website repository and production property.

## Owner-required actions

- Provide or authorize read-only Coolify runtime evidence collection.
- Configure the approved Gmail read-only OAuth values as protected Coolify secrets when production is ready.
- Complete Apple and Microsoft sign-in/verification steps when the prepared data is confirmed.
- Identify or grant access to the authoritative Bed Bugs & Beyond website repository/property.

## Safety record

No merge, deployment, restart, production configuration change, account creation, billing action, customer communication, publication, DNS change, crawler-rule change, or live listing modification occurred.
