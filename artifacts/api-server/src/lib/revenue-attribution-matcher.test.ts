import { describe, expect, it } from "vitest";
import { selectRevenueAttributionCandidate } from "./revenue-attribution-matcher.js";

const customers = [
  { customerExternalId: "gd-1", customerName: "Jordan Smith", customerPhone: "(251) 555-0101" },
  { customerExternalId: "gd-2", customerName: "Jordan Jones", customerPhone: "(251) 555-0102" },
];

describe("selectRevenueAttributionCandidate", () => {
  it("prefers an immutable provider customer identifier", () => {
    expect(selectRevenueAttributionCandidate({ customerName: "Different Name", phone: null, providerCustomerId: "gd-2" }, customers)).toMatchObject({
      method: "provider_customer_id", confidence: 100, automaticMatchAllowed: true,
    });
  });

  it("allows normalized phone equality as an observed match", () => {
    expect(selectRevenueAttributionCandidate({ customerName: "Jordan", phone: "2515550101" }, customers)).toMatchObject({
      method: "normalized_phone", confidence: 85, automaticMatchAllowed: true,
    });
  });

  it("keeps a first-name-only result as a non-automatic candidate", () => {
    expect(selectRevenueAttributionCandidate({ customerName: "Jordan Unknown", phone: null }, customers)).toMatchObject({
      method: "first_name_candidate", confidence: 20, automaticMatchAllowed: false,
    });
  });

  it("does not automatically choose between customers sharing a phone", () => {
    const shared = [customers[0], { ...customers[1], customerPhone: customers[0].customerPhone }];
    expect(selectRevenueAttributionCandidate({ customerName: "Jordan", phone: "2515550101" }, shared)).toMatchObject({
      method: "normalized_phone", confidence: 50, automaticMatchAllowed: false,
    });
  });
});
