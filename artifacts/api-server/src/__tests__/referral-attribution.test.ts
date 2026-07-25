import { describe, expect, it } from "vitest";
import {
  normalizeReferralPhone,
  scoreReferralCustomerMatch,
} from "../lib/referral-attribution.js";

describe("RGE-7 read-only referral attribution", () => {
  it("normalizes US phone formatting", () => {
    expect(normalizeReferralPhone("+1 (251) 555-1212")).toBe("2515551212");
  });

  it("scores exact phone and email evidence", () => {
    expect(
      scoreReferralCustomerMatch({
        referralPhone: "2515551212",
        customerPhone: "(251) 555-1212",
        referralEmail: "CUSTOMER@example.com ",
        customerEmail: "customer@example.com",
      }),
    ).toEqual({
      confidence: 100,
      reasons: ["phone_exact", "email_exact"],
    });
  });

  it("does not use names as identity evidence", () => {
    expect(scoreReferralCustomerMatch({}).confidence).toBe(0);
  });
});
