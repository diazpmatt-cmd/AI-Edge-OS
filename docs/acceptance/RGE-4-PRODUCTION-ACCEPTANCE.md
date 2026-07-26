# RGE-4 Production Acceptance — Reward Ledger and Fulfillment Controls

**Status:** Acceptance procedure defined; execution pending  
**Target milestone:** Referral Growth Engine production acceptance 4 of 8 (50%)  
**Production tenant:** Bed Bugs & Beyond

## Purpose

Verify that the already-merged RGE-4 reward ledger works in production without issuing money, credits, discounts, messages, or external CRM writes.

RGE-4 records human decisions and evidence only. It does not perform fulfillment.

## Preconditions

Before testing:

1. RGE-3 remains production accepted.
2. The authenticated Clerk JWT `sub` resolves exactly to the active Bed Bugs & Beyond client row.
3. The production referral dashboard loads successfully.
4. The following controls remain unchanged:

```text
SCHEDULER_ENABLED=false
REFERRAL_SCHEDULER_ENABLED=false
AI_VISIBILITY_SCHEDULER_ENABLED=false
REFERRAL_DELIVERY_ENABLED=false
REFERRAL_DELIVERY_MODE=dry_run
REFERRAL_DELIVERY_EMERGENCY_STOP=true
```

5. No payment provider, credit provider, messaging provider, or CRM write path is enabled.
6. Use a controlled test program with a reward value of `$0`.

## Acceptance fixture

Use the existing production program named `Test` if it remains active and has a `$0` reward. Otherwise create a new clearly labeled `$0` test program.

Create one controlled referral with unmistakable test-only names. Do not use a real customer identity or contact destination.

Recommended labels:

```text
Referrer: RGE4 Acceptance Referrer
Referred: RGE4 Acceptance Referral
Source: manual
Notes: RGE-4 production acceptance; no payment or credit authorized
```

## Required functional evidence

RGE-4 is accepted only when every item below passes.

### 1. Conversion creates exactly one immutable reward snapshot

- The controlled referral begins in `pending`.
- A human explicitly marks it converted.
- The referral moves to `converted`.
- Exactly one reward-ledger row appears in the Payouts tab.
- The ledger row shows the expected tenant, referral, program, reward type, and `$0` amount.
- Repeated refreshes do not create duplicate ledger rows.
- The ledger status begins at `pending_review`.

### 2. Direct paid transition is unavailable

- The Referrals tab exposes no direct **Mark Paid** action.
- The generic referral transition path allows conversion or cancellation only.
- The referral cannot become `paid` before fulfillment evidence is recorded.

### 3. Approval requires explicit human confirmation

- The Payouts tab displays the warning that AI Edge OS issues no payment.
- A human explicitly approves the `$0` reward.
- The ledger moves from `pending_review` to `approved`.
- The interface confirms that no payment was issued.
- Refreshing the page preserves the approved state.

### 4. Fulfillment requires external evidence

- Fulfillment cannot proceed without a non-empty evidence reference.
- Use a clearly synthetic evidence reference, such as:

```text
RGE4-ACCEPTANCE-ZERO-DOLLAR-NO-PAYOUT
```

- A human explicitly confirms that fulfillment occurred outside AI Edge OS.
- The ledger moves from `approved` to `fulfilled`.
- The fulfillment method, evidence reference, actor, and timestamp persist after refresh.
- The interface confirms that no payment was issued.

### 5. Referral and ledger states remain consistent

After fulfillment evidence is recorded:

- The reward ledger status is `fulfilled`.
- The referral status is `paid` only as an internal lifecycle label indicating recorded external fulfillment evidence.
- `paid_at` is populated.
- No external payment, credit, discount, message, or CRM mutation occurred.

### 6. KPI totals derive from ledger state

- Pending reward count decreases after fulfillment.
- Fulfilled reward count increases by one.
- Pending reward total remains accurate.
- Fulfilled reward total remains accurate.
- For the `$0` acceptance fixture, dollar totals remain `$0` while counts change correctly.

### 7. Tenant and duplicate safety remain intact

- All reads and mutations remain scoped to Bed Bugs & Beyond.
- Repeating approval or fulfillment does not create duplicate actions.
- Refreshing or double-clicking does not create a second reward snapshot.
- Unknown reward identifiers fail closed.
- No fallback tenant or hardcoded Clerk identity is introduced.

### 8. Safety posture remains unchanged

After the acceptance test:

- All scheduler switches remain disabled.
- Referral delivery remains disabled and in dry-run mode.
- The emergency stop remains engaged.
- No real SMS or email was sent.
- No cash, credit, discount, or payment was issued.
- No GorillaDesk or external CRM write occurred.

## Acceptance decision

### PASS

RGE-4 production acceptance passes when all eight evidence groups are verified with the controlled `$0` referral and no safety invariant changes.

Update the roadmap to:

```text
RGE-1–4 accepted: 50%
```

Record the test referral ID, reward-ledger ID, timestamps, and synthetic evidence reference in a dated handoff or acceptance record. Do not record tokens, secrets, raw authorization headers, or private customer data.

### FAIL

RGE-4 remains pending if any of the following occurs:

- no reward snapshot is created on conversion;
- duplicate reward rows appear;
- approval or fulfillment skips explicit confirmation;
- fulfillment succeeds without evidence;
- a direct paid action remains available;
- totals are derived from referral status instead of ledger state;
- tenant isolation fails;
- any external payment, credit, message, scheduler, or CRM action occurs;
- any required safety switch changes.

## Cleanup boundary

The temporary `[CLIENT-LOOKUP]` diagnostic is not part of RGE-4 acceptance. Remove it in a separate cleanup change only after the production acceptance checkpoint is stable.

Clerk production-key migration is also separate from RGE-4 functional acceptance and must not be bundled into this test.
