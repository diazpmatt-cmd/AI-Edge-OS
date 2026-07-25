import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  "src/components/referrals/ReferralRewardsPanel.tsx",
  "utf8",
);
const page = readFileSync("src/pages/ReferralProgramPage.tsx", "utf8");

describe("RGE-4 reward UI safety contract", () => {
  it("uses the controlled reward ledger for the existing Payouts view", () => {
    expect(page).toContain('label: "Payouts"');
    expect(page).toContain("<ReferralRewardsPanel />");
    expect(page).not.toContain("Mark Paid ✓");
  });

  it("requires separate approval and fulfillment confirmations", () => {
    expect(component).toContain("confirmApproval: true");
    expect(component).toContain("confirmFulfillment: true");
    expect(component).toContain("window.confirm");
    expect(component).toContain("window.prompt");
    expect(component).toContain("Approve — no payout");
    expect(component).toContain("Record manual fulfillment");
  });

  it("makes the no-payment boundary explicit and calls no provider", () => {
    expect(component).toContain("cannot issue cash, credits, discounts");
    expect(component).toContain("No payment was issued");
    expect(component).not.toContain("Stripe");
    expect(component).not.toContain("PayPal");
    expect(component).not.toContain("fetch(");
  });
});
