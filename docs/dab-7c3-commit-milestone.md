# DAB-7C3 Commit Milestone

The commit milestone is a separately authorized operation over a verified DAB-7C2 apply receipt.

It does not imply push, pull-request creation, merge, deployment, credentials, spending, or customer-facing external action authority.

Required invariants:
- verified DAB-7C2 apply receipt
- independent `committing` authorization
- exact repository, branch, parent SHA, and applied file digests
- fail-closed behavior on drift or stale authorization
- idempotent single-commit execution
- durable attributable commit receipt
