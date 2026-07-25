import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  referralRewardApprovalSchema,
  referralRewardFulfillmentSchema,
} from "../lib/referral-growth.js";

const routeSource = readFileSync(
  new URL("../routes/referrals.ts", import.meta.url),
  "utf8",
);
const compact = routeSource.replace(/\s+/g, " ");
const rewardRoutes = compact.slice(
  compact.indexOf("// ── RGE-4:"),
  compact.indexOf("// ── GET /api/referrals/stats"),
);
const transitionRoute = compact.slice(
  compact.indexOf("// ── PATCH /api/referrals/:id"),
  compact.indexOf("export default router"),
);
const statsRoute = compact.slice(
  compact.indexOf("// ── GET /api/referrals/stats"),
  compact.indexOf("// ── GET /api/referrals/programs"),
);

describe("RGE-4 explicit human decision schemas", () => {
  it("requires literal approval confirmation and idempotency", () => {
    expect(
      referralRewardApprovalSchema.safeParse({
        confirmApproval: true,
        idempotencyKey: "reward-approval:001",
      }).success,
    ).toBe(true);
    expect(
      referralRewardApprovalSchema.safeParse({
        confirmApproval: false,
        idempotencyKey: "reward-approval:001",
      }).success,
    ).toBe(false);
  });

  it("requires fulfillment evidence and literal confirmation", () => {
    expect(
      referralRewardFulfillmentSchema.safeParse({
        confirmFulfillment: true,
        method: "manual_credit",
        reference: "credit-memo-001",
        idempotencyKey: "reward-fulfillment:001",
      }).success,
    ).toBe(true);
    expect(
      referralRewardFulfillmentSchema.safeParse({
        confirmFulfillment: true,
        method: "manual_credit",
        reference: "",
        idempotencyKey: "reward-fulfillment:001",
      }).success,
    ).toBe(false);
  });
});

describe("RGE-4 tenant and duplicate safety contract", () => {
  it("tenant-scopes ledger reads, joins, approvals, fulfillments, and referral updates", () => {
    expect(rewardRoutes).toContain("WHERE rl.client_id = $1");
    expect(rewardRoutes).toContain("r.client_id = rl.client_id");
    expect(rewardRoutes).toContain("rp.client_id = rl.client_id");
    expect(rewardRoutes).toContain("WHERE client_id = $1 AND approval_idempotency_key = $2");
    expect(rewardRoutes).toContain(
      "WHERE client_id = $1 AND fulfillment_idempotency_key = $2",
    );
    expect(rewardRoutes).toContain(
      "WHERE id = $1 AND client_id = $2 AND status = 'converted'",
    );
    expect(rewardRoutes).not.toContain("req.body.clientId");
  });

  it("serializes decisions and prevents repeated approval or fulfillment", () => {
    expect(rewardRoutes).toContain(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
    );
    expect(rewardRoutes).toContain("AND status = 'pending_review'");
    expect(rewardRoutes).toContain("AND status = 'approved'");
    expect(rewardRoutes).toContain("duplicate_reward_approval");
    expect(rewardRoutes).toContain("duplicate_reward_fulfillment");
    expect(rewardRoutes).toContain("reward_approval_idempotency_conflict");
    expect(rewardRoutes).toContain("reward_fulfillment_idempotency_conflict");
  });

  it("contains no payment provider, scheduler, or automatic payout", () => {
    expect(rewardRoutes).not.toContain("stripe");
    expect(rewardRoutes).not.toContain("paypal");
    expect(rewardRoutes).not.toContain("fetch(");
    expect(rewardRoutes).not.toContain("setInterval");
    expect(rewardRoutes).not.toContain("scheduler");
    expect(rewardRoutes).toContain("externallyPaid: false");
    expect(rewardRoutes).toContain("no payment was issued");
  });
});

describe("RGE-4 conversion snapshot contract", () => {
  it("removes direct paid transitions and limits the generic transition route", () => {
    expect(transitionRoute).toContain('["converted", "cancelled"]');
    expect(transitionRoute).not.toContain('status === "paid"');
    expect(transitionRoute).toContain("referral_transition_not_allowed");
  });

  it("creates exactly one tenant-owned immutable reward snapshot on conversion", () => {
    expect(transitionRoute).toContain("INSERT INTO referral_reward_ledger");
    expect(transitionRoute).toContain(
      "ON CONFLICT (client_id, referral_id) DO NOTHING",
    );
    expect(transitionRoute).toContain("referral.rewardAmount");
    expect(transitionRoute).toContain("referral.rewardType");
    expect(transitionRoute).toContain("reward_snapshot_missing");
  });

  it("derives reward totals from ledger state instead of referral status", () => {
    expect(statsRoute).toContain("FROM referral_reward_ledger");
    expect(statsRoute).toContain("WHERE client_id = $1");
    expect(statsRoute).toContain("WHERE status='fulfilled'");
    expect(statsRoute).toContain(
      "WHERE status IN ('pending_review','approved')",
    );
    expect(statsRoute).not.toContain(
      "SUM(reward_amount) FILTER (WHERE status='paid')",
    );
  });
});
