# Referral Growth V1 — Production Deployment Authorization

**Authorized:** 2026-07-25

## Release source

- Repository: `diazpmatt-cmd/AI-Edge-OS`
- Integrated `main` commit: `c89d7bfcc883e7cb6b4eee8d2b05c7398746e54f`
- Integration PR: #50
- Validated integration head: `c891ef83845102f51236a2e616784a345db80773`

## Authorized deployment scope

Deploy the integrated `main` application for production smoke testing and sequential Referral Growth V1 production acceptance.

This authorization does **not** authorize autonomous referral operation or any live customer action.

## Required safety state

The deployment must preserve all fail-closed Referral Growth controls:

- referral delivery disabled;
- delivery mode remains `dry_run`;
- referral delivery emergency stop engaged;
- referral scheduler disabled;
- global scheduler disabled for this acceptance phase;
- no automatic follow-up;
- no live SMS or email;
- no automatic reward issuance, credit, discount, or payment;
- no GorillaDesk or external CRM write;
- no unapproved customer action.

The code defaults fail closed when delivery environment controls are absent: delivery is disabled, mode resolves to dry run, and the emergency stop remains engaged.

## Acceptance sequence

1. Confirm the production build and deployment are healthy.
2. Run authenticated tenant-scoped smoke tests.
3. Production-accept RGE-3 controlled delivery in dry-run mode.
4. Continue RGE-4 through RGE-8 acceptance sequentially, recording evidence for each milestone.

## Authorization boundary

Any release of the emergency stop, switch to live delivery, scheduler activation, live recipient allowlisting, real message, reward/payment action, or external CRM write requires a separate explicit authorization and must not be inferred from this deployment approval.
