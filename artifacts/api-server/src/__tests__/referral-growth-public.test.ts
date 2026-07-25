import { describe, expect, it } from "vitest";
import {
  createReferralProgramSchema,
  generateReferralCode,
  getPublicProgramAvailability,
  isSelfReferral,
  normalizeEmail,
  normalizePhone,
  normalizeReferralCode,
  publicReferralSubmissionSchema,
  REFERRAL_CODE_PATTERN,
  ReferralSubmissionRateLimiter,
} from "../lib/referral-growth.js";

const validSubmission = {
  referrerName: "Jane Customer",
  referrerEmail: "jane@example.com",
  referrerPhone: "",
  referredName: "Sam Neighbor",
  referredEmail: "",
  referredPhone: "(251) 555-0101",
  notes: "",
  website: "",
};

describe("Referral Growth public enrollment contract", () => {
  it("generates unguessable, format-safe referral codes", () => {
    const first = generateReferralCode();
    const second = generateReferralCode();
    expect(first).toMatch(REFERRAL_CODE_PATTERN);
    expect(second).toMatch(REFERRAL_CODE_PATTERN);
    expect(first).not.toBe(second);
    expect(first).not.toContain("CLIENT");
  });

  it("normalizes referral codes without accepting unsafe path text", () => {
    expect(normalizeReferralCode(" ref-abcd1234 ")).toBe("REF-ABCD1234");
    expect(normalizeReferralCode("../../clients")).toBeNull();
    expect(normalizeReferralCode("short")).toBeNull();
  });

  it("requires contact details for both people", () => {
    expect(publicReferralSubmissionSchema.safeParse(validSubmission).success).toBe(true);
    expect(publicReferralSubmissionSchema.safeParse({
      ...validSubmission,
      referrerEmail: "",
      referrerPhone: "",
    }).success).toBe(false);
    expect(publicReferralSubmissionSchema.safeParse({
      ...validSubmission,
      referredEmail: "",
      referredPhone: "",
    }).success).toBe(false);
  });

  it("rejects honeypot content and overlong notes", () => {
    expect(publicReferralSubmissionSchema.safeParse({
      ...validSubmission,
      website: "spam.example",
    }).success).toBe(false);
    expect(publicReferralSubmissionSchema.safeParse({
      ...validSubmission,
      notes: "x".repeat(1001),
    }).success).toBe(false);
  });

  it("normalizes email and phone values for duplicate detection", () => {
    expect(normalizeEmail(" Jane@Example.COM ")).toBe("jane@example.com");
    expect(normalizePhone("+1 (251) 555-0101")).toBe("2515550101");
    expect(normalizePhone("(251) 555-0101")).toBe("2515550101");
    expect(normalizeEmail(" ")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });

  it("detects matching email or phone self-referrals", () => {
    const parsed = publicReferralSubmissionSchema.parse(validSubmission);
    expect(isSelfReferral(parsed)).toBe(false);
    expect(isSelfReferral({
      ...parsed,
      referredEmail: "JANE@example.com",
      referredPhone: "(251) 555-0101",
    })).toBe(true);
    expect(isSelfReferral({
      ...parsed,
      referrerPhone: "251.555.0101",
    })).toBe(true);
  });

  it("allows only active, unexpired programs below their capacity", () => {
    expect(getPublicProgramAvailability({
      status: "active",
      usesCount: 3,
      maxUses: 10,
      expiresAt: "2026-08-01T00:00:00.000Z",
    }, new Date("2026-07-24T00:00:00.000Z"))).toEqual({ available: true });

    expect(getPublicProgramAvailability({
      status: "paused",
      usesCount: 0,
      maxUses: null,
      expiresAt: null,
    })).toEqual({ available: false, reason: "inactive" });

    expect(getPublicProgramAvailability({
      status: "active",
      usesCount: 0,
      maxUses: null,
      expiresAt: "2026-07-23T00:00:00.000Z",
    }, new Date("2026-07-24T00:00:00.000Z"))).toEqual({ available: false, reason: "expired" });

    expect(getPublicProgramAvailability({
      status: "active",
      usesCount: 10,
      maxUses: 10,
      expiresAt: null,
    })).toEqual({ available: false, reason: "capacity_reached" });
  });

  it("validates bounded program configuration", () => {
    expect(createReferralProgramSchema.safeParse({
      name: "Neighbor Referral",
      rewardType: "credit",
      rewardValue: 25,
      maxUses: 100,
    }).success).toBe(true);
    expect(createReferralProgramSchema.safeParse({
      name: "X",
      rewardType: "crypto",
      rewardValue: -1,
    }).success).toBe(false);
  });

  it("rate-limits repeated public submissions by referral code and requester", () => {
    const limiter = new ReferralSubmissionRateLimiter(2, 60_000);
    expect(limiter.check("REF-ONE:127.0.0.1", 1_000).allowed).toBe(true);
    expect(limiter.check("REF-ONE:127.0.0.1", 2_000).allowed).toBe(true);
    expect(limiter.check("REF-ONE:127.0.0.1", 3_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 58,
    });
    expect(limiter.check("REF-TWO:127.0.0.1", 3_000).allowed).toBe(true);
  });
});
