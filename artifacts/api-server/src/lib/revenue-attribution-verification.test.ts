import { describe, expect, it } from "vitest";
import { buildVerifiedRevenueTransition } from "./revenue-attribution-verification.js";

const now = new Date("2026-08-25T12:00:00.000Z");

describe("buildVerifiedRevenueTransition", () => {
  it("derives revenue and provenance only from completed canonical job evidence", () => {
    const result = buildVerifiedRevenueTransition({
      current: { matchedAt: null, serviceType: null },
      job: { externalId: "job-7", status: "completed", amountCents: 18950, serviceType: "Pest control", completedAt: new Date("2026-08-24T18:00:00.000Z") },
      actorUserId: "operator-1",
      now,
    });
    expect(result).toEqual({ ok: true, updates: expect.objectContaining({
      status: "won", revenue: "189.5", gorilladeskJobId: "job-7", matchMethod: "human_verified",
      matchConfidence: 100, verifiedByUserId: "operator-1", verifiedAt: now,
    }) });
  });

  it("fails closed when completion evidence is missing", () => {
    expect(buildVerifiedRevenueTransition({
      current: { matchedAt: null, serviceType: null },
      job: { externalId: "job-7", status: "scheduled", amountCents: 99999, serviceType: null, completedAt: null },
      actorUserId: "operator-1",
      now,
    })).toEqual({ ok: false, error: "completed_job_evidence_required" });
  });
});
