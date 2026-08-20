import { describe, expect, it } from "vitest";
import { collectedPaymentTotalCents } from "./attribution-payment-evidence.js";

describe("collectedPaymentTotalCents", () => {
  it("sums only positive, dated, collected payment evidence", () => {
    const at = new Date("2026-08-20T12:00:00.000Z");
    expect(collectedPaymentTotalCents([
      { amountCents: 12500, status: "collected", paidAt: at },
      { amountCents: 7500, status: "collected", paidAt: at },
      { amountCents: 90000, status: "outstanding", paidAt: at },
      { amountCents: 1000, status: "collected", paidAt: null },
    ])).toBe(20000);
  });

  it("fails closed when no canonical collected payment exists", () => {
    expect(collectedPaymentTotalCents([
      { amountCents: 5000, status: "outstanding", paidAt: new Date() },
      { amountCents: 5000, status: "collected", paidAt: null },
    ])).toBeNull();
  });
});
