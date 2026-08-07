# Authority Backlink Win Evidence

## Goal
Require durable, human-verified acquisition evidence before a backlink workflow can transition to `won`.

## V1 proof
- tenant-scoped opportunity/prospect identity
- linking page URL (`sourceUrl`)
- client target URL (`targetUrl`)
- optional notes
- verification state (`unverified`, `human_verified`, `invalid`)
- verified actor + timestamp
- optimistic version

## Safety
- no crawling or automated verification
- no external provider calls
- no paid model calls
- no send capability
- no automatic workflow transition
- `mark_won` remains an explicit human action, but is rejected unless current verified proof exists
- editing verified proof clears verification and requires fresh human verification
- invalid proof is retained for audit and must be explicitly reopened

## Measurement contract
A `won` workflow must be backed by at least one current human-verified proof for the same tenant and opportunity. This proof becomes the durable basis for won-backlink counts and later authority-impact measurement.
