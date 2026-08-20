import { describe, expect, it } from "vitest";
import { buildProofPackReadModel, type ProofPackEvidence } from "./proof-pack-read-model.js";

const from = new Date("2026-08-01T00:00:00.000Z");
const to = new Date("2026-09-01T00:00:00.000Z");
const at = new Date("2026-08-12T12:00:00.000Z");

function evidence(overrides: Partial<ProofPackEvidence> = {}): ProofPackEvidence {
  return { leads: [], calls: [], attributions: [], jobs: [], payments: [], reviews: [], referrals: [], referralAttributions: [], posts: [], journeyEvents: [], ...overrides };
}

describe("buildProofPackReadModel", () => {
  it("reports unsupported recovery and booking claims as unavailable", () => {
    const result = buildProofPackReadModel(evidence(), "tenant-a", from, to, at);
    expect(result.metrics.successfulRecovery).toMatchObject({ availability: "unavailable", value: null, verification: "not_verifiable" });
    expect(result.metrics.bookings).toMatchObject({ availability: "unavailable", value: null });
    expect(result.privacy).toEqual({ aggregateOnly: true, containsPii: false });
  });

  it("counts only period evidence and only paid or confirmed revenue", () => {
    const result = buildProofPackReadModel(evidence({
      payments: [
        { status: "collected", amountCents: 12500, paidAt: at } as any,
        { status: "paid", amountCents: 50000, paidAt: at } as any,
        { status: "outstanding", amountCents: 99000, paidAt: at } as any,
      ],
      attributions: [
        { id: "a", status: "won", revenue: "80.00", matchedAt: at, updatedAt: at, verifiedAt: at, verifiedByUserId: "user-1" } as any,
        { id: "b", status: "pending", revenue: "900.00", matchedAt: at, updatedAt: at } as any,
      ],
    }), "tenant-a", from, to, at);
    expect(result.metrics.verifiedRevenue.value).toBe(125);
    expect(result.metrics.attributableRevenue.value).toBe(80);
    expect(result.metrics.attributableRevenue).toMatchObject({ availability: "available", verification: "verified" });
    expect(result.revenueLeaks.proofGaps).toBe(1);
  });

  it("excludes unverified won attribution revenue and explains the partial evidence", () => {
    const result = buildProofPackReadModel(evidence({
      attributions: [
        { id: "legacy", status: "won", revenue: "500.00", matchedAt: at, updatedAt: at, verifiedAt: null, verifiedByUserId: null } as any,
      ],
    }), "tenant-a", from, to, at);
    expect(result.metrics.attributableRevenue).toMatchObject({
      availability: "partial",
      value: 0,
      verification: "observed",
    });
    expect(result.metrics.attributableRevenue.explanation).toContain("excluded");
  });
});
