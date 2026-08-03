# ADR-LEAD-001: Read-Only Gmail Ingestion for Marketplace Leads

Status: Accepted for bounded implementation
Date: 2026-08-03

## Context

Bed Bugs & Beyond receives actionable lead and account notifications from platforms that do not expose the same API capabilities. Yelp and Nextdoor already send useful notifications to the business Gmail account, and future marketplaces such as Thumbtack and Angi may do the same.

A single email-ingestion path can reduce vendor sprawl and provide durable lead intake, but mailbox access creates a broad privacy and security boundary. The system must not treat mailbox access as permission to send, modify, archive, label, or delete email.

## Decision

Use a dedicated production worker with Google OAuth and the narrow `gmail.readonly` scope to list and fetch only messages matching reviewed allowlisted queries.

The worker will:

- run independently from the website request process;
- use protected runtime credentials stored outside GitHub;
- classify messages deterministically before any AI assistance;
- persist bounded normalized lead records and source references;
- deduplicate by provider/source identity and stable Gmail message ID;
- record durable checkpoint and health state;
- apply bounded retry, backoff, quarantine, and restart recovery;
- expose no email mutation or outbound-send capability.

## Trust boundary

The Gmail mailbox remains authoritative for the source message. AI Edge OS stores only the minimum normalized fields required for operations, attribution, deduplication, and audit.

OAuth client secrets, refresh tokens, access tokens, authorization codes, mailbox passwords, cookies, MFA codes, and unrestricted raw messages are forbidden from source control, issues, logs, and ordinary reports.

## Failure behavior

- Missing or revoked credentials fail closed.
- Provider or database failure does not advance the durable checkpoint.
- Exact replay creates no duplicate.
- Same identity with conflicting content is quarantined for review.
- Unknown senders or message formats do not become customer leads.
- Rapid retries are prohibited; official retry signals and capped backoff are used.
- Customer email is never modified as a side effect of ingestion.

## Consequences

### Positive

- One bounded intake mechanism can support several email-notification platforms.
- The platform can operate without Zapier when email contains sufficient information.
- Read-only access materially limits accidental external action.
- Durable source references support traceability and recovery.

### Negative

- Email formats may change without notice.
- Gmail read-only is still a sensitive/restricted scope and requires careful OAuth handling.
- Some provider features, message threads, charges, or replies may remain unavailable.
- Polling has more latency than a first-party webhook.
- A robust checkpoint and pagination strategy is required to avoid missed messages.

## Rejected alternatives

### Full Gmail scope

Rejected because it grants unnecessary compose, send, and delete authority.

### Gmail modify scope

Rejected because ingestion does not require marking read, labeling, archiving, or modifying messages.

### Shared mailbox password or IMAP credential

Rejected because it increases credential exposure and weakens revocation/audit boundaries.

### Provider scraping

Rejected because it may bypass platform controls, break frequently, and expose private account data.

### Automatic customer replies from the ingestion worker

Rejected because read authority must not imply external-response authority.

## Verification requirements

- OAuth scope is exactly read-only.
- Controlled message list/get succeeds.
- No Gmail mutation method exists in the worker surface.
- Replay and restart tests produce one lead record.
- Promotions and unknown mail fail safely.
- Logs are redacted.
- Checkpoint, health, backoff, quarantine, and kill switch are tested.
- Owner-authorized credentials and live preflight are completed before activation.

## Related records

- Issue #110
- PR #111
- `docs/runbooks/GMAIL-OAUTH-COOLIFY-SECRETS.md`
- `docs/runbooks/LEAD-BRIDGE-DEPLOYMENT-RECOVERY.md`
