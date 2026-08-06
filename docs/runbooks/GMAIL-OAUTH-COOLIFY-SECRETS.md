# Gmail OAuth and Coolify Secret Configuration

Last updated: 2026-08-03
Mailbox: `mattdiaz@bedbugsandbeyond.net`
Purpose: read-only Lead Bridge ingestion

## Security objective

Give the production Lead Bridge the narrowest practical Gmail access needed to list and read matching lead-notification messages while keeping OAuth credentials out of GitHub, build logs, application logs, browser storage, and ordinary operator notes.

## Required application values

The current worker expects these protected runtime values:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`

Recommended non-secret configuration:

- `GMAIL_USER_ID=me`
- `LEAD_EMAIL_WORKER_ENABLED=false` until preflight succeeds
- `LEAD_EMAIL_POLL_MS=300000`
- `GMAIL_LEAD_QUERY=<reviewed allowlisted query>`

The refresh token is required because the worker operates when the mailbox owner is not present. Google OAuth must therefore be authorized for offline access.

## Least-privilege scope

Use only:

`https://www.googleapis.com/auth/gmail.readonly`

Do not request Gmail send, compose, modify, label-editing, delete, or full-mailbox scopes for the ingestion worker. The current worker only calls message-list and message-get operations.

## Google Cloud preparation

An authenticated owner or authorized administrator must:

1. Select an approved Google Cloud project for the Lead Bridge.
2. Enable the Gmail API.
3. Configure the OAuth consent screen and intended audience.
4. Add only the Gmail read-only scope.
5. Add `mattdiaz@bedbugsandbeyond.net` as an allowed test user when the app is in testing mode.
6. Create an OAuth client appropriate for the controlled authorization flow.
7. Record the client ID and client secret directly into the approved secret-transfer process; do not paste them into GitHub.

### Testing-mode warning

Google documents that test-user authorizations can expire after seven days while the OAuth app remains in Testing. A production unattended worker should not be declared stable until the selected OAuth publishing/audience mode and verification requirements are understood and the refresh token survives the required observation period.

## Refresh-token authorization procedure

Use a controlled local or approved server-side OAuth helper that:

1. Requests exactly the Gmail read-only scope.
2. Uses `access_type=offline`.
3. Uses a consent prompt when necessary to ensure a refresh token is returned.
4. Verifies the signed-in account is `mattdiaz@bedbugsandbeyond.net` before consent.
5. Exchanges the authorization code over HTTPS.
6. Displays or transfers the refresh token only through the approved secret-handling path.
7. Does not commit token files, browser exports, console transcripts, screenshots, or shell history containing the credential.
8. Deletes temporary local token material after Coolify configuration and validation.

A prior consent may return no new refresh token. If that occurs, revoke the application's grant for the mailbox and repeat the controlled authorization flow rather than inventing a token or using an access token as a substitute.

## Coolify configuration

In **Coolify**, not GitHub:

1. Open the intended Lead Bridge application or dedicated worker service.
2. Add `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` as protected runtime secrets.
3. Ensure the values are not exposed as build arguments, public variables, image labels, or frontend variables.
4. Keep `LEAD_EMAIL_WORKER_ENABLED=false` during initial deployment.
5. Set the reviewed Gmail query and poll interval.
6. Save configuration without copying secret values into deployment notes.
7. Deploy the worker in disabled mode and confirm the process does not crash from missing non-secret configuration.

## Read-only preflight

Before enabling unattended polling, run one bounded preflight that proves:

- OAuth token exchange succeeds.
- The authenticated Gmail account matches the intended mailbox.
- `users.messages.list` succeeds with the reviewed query.
- `users.messages.get` succeeds for one controlled matching message.
- No message is modified, labeled, archived, marked read, deleted, drafted, or sent.
- No access token, refresh token, client secret, full raw message, or unrestricted API response appears in logs.

Record only:

- preflight timestamp;
- mailbox identity confirmation;
- scope confirmation;
- matching result count;
- controlled Gmail message ID or a one-way reference hash;
- success/failure reason code;
- operator identity.

## Activation sequence

1. Confirm production and database health.
2. Confirm dedicated worker health reporting exists.
3. Confirm deduplication and restart tests have passed.
4. Set `LEAD_EMAIL_WORKER_ENABLED=true`.
5. Deploy the exact reviewed commit.
6. Verify one poll completes successfully.
7. Verify one controlled message creates one lead record.
8. Run another poll and confirm no duplicate record is created.
9. Confirm promotional Nextdoor mail is classified as ignored.
10. Observe token refresh and worker health across the required stability window.

## Rotation and revocation

Rotate or revoke credentials immediately when:

- a credential may have been exposed;
- the mailbox owner or administrator changes;
- the OAuth client is replaced;
- the application requests broader scopes;
- the worker is retired;
- unexplained Gmail API activity appears;
- the refresh token stops behaving as expected.

Revocation procedure:

1. Disable the Lead Bridge worker.
2. Revoke the Google OAuth grant or client credential as appropriate.
3. Remove the affected value from Coolify.
4. Review bounded access logs and lead-ingestion records.
5. Generate a replacement only after the cause is understood.
6. Re-run the read-only preflight and duplicate test.

## Prohibited handling

Never place any of the following in GitHub, issues, pull requests, CI logs, screenshots, documentation examples, or chat transcripts:

- real OAuth client secret;
- refresh token;
- access token;
- authorization code;
- browser cookie;
- mailbox password;
- multifactor code;
- full raw customer email;
- unrestricted Gmail API response.

## Completion evidence for master checklist item 104

This documentation item is complete when this runbook is committed and references the exact production variables, least-privilege scope, owner-required authorization boundary, protected Coolify storage, preflight, activation, rotation, revocation, and prohibited handling.

The separate production configuration item remains incomplete until protected values are entered in Coolify and a controlled live test passes.

## Official references

- Google OAuth web-server and offline-access guidance: https://developers.google.com/identity/protocols/oauth2/web-server
- Gmail message-list method and scopes: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list
- Gmail message-get method and scopes: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get
- Gmail scope classifications: https://developers.google.com/workspace/gmail/api/auth/scopes
- Google OAuth app audience and testing behavior: https://support.google.com/cloud/answer/15549945
