import { describe, expect, it } from "vitest";
import type { Lead, RevenueAttribution } from "@workspace/db";
import { buildRevenueLeakReadModel } from "./revenue-leak-read-model.js";

const NOW = new Date("2026-08-17T02:30:00.000Z");

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    clientId: "00000000-0000-4000-8000-000000000010",
    clientName: "Example Client",
    source: "telnyx",
    phone: "+15551234567",
    customerName: "Customer",
    message: null,
    eventType: "sms",
    status: "contacted",
    notes: null,
    service: null,
    location: null,
    urgency: "normal",
    sourceMessageId: null,
    draftResponse: null,
    responseStatus: "sent",
    receivedAt: new Date("2026-08-15T00:00:00.000Z"),
    lastFollowUpAt: new Date("2026-08-15T20:00:00.000Z"),
    outcome: "sms_sent",
    createdAt: new Date("2026-08-15T00:00:00.000Z"),
    updatedAt: new Date("2026-08-15T20:00:00.000Z"),
    ...overrides,
  };
}

function attribution(overrides: Partial<RevenueAttribution> = {}): RevenueAttribution {
  return {
    id: "00000000-0000-4000-8000-000000000020",
    leadId: "00000000-0000-4000-8000-000000000001",
    clientId: "00000000-0000-4000-8000-000000000010",
    customerName: "Customer",
    phone: "+15551234567",
    leadSource: "telnyx",
    status: "pending",
    revenue: null,
    serviceType: null,
    notes: null,
    gorilladeskJobId: null,
    matchedAt: null,
    createdAt: new Date("2026-08-15T00:00:00.000Z"),
    updatedAt: new Date("2026-08-16T00:00:00.000Z"),
    ...overrides,
  };
}

describe("buildRevenueLeakReadModel", () => {
  it("flags only canonical follow-up-due leads as revenue risks", () => {
    const model = buildRevenueLeakReadModel([
      lead(),
      lead({ id: "00000000-0000-4000-8000-000000000002", status: "booked" }),
      lead({ id: "00000000-0000-4000-8000-000000000003", lastFollowUpAt: new Date("2026-08-16T12:00:00.000Z") }),
      lead({ id: "00000000-0000-4000-8000-000000000004", outcome: "sms_replied:provider-message-id" }),
    ], [], NOW);

    expect(model.summary.revenueRisks).toBe(1);
    expect(model.items.map(item => item.id)).toEqual([
      "follow_up_due:00000000-0000-4000-8000-000000000001",
    ]);
    expect(model.items[0]?.verifiedRevenue).toBeNull();
  });

  it("reports unresolved attribution as proof gaps, not claimed lost revenue", () => {
    const model = buildRevenueLeakReadModel([], [
      attribution(),
      attribution({ id: "00000000-0000-4000-8000-000000000021", status: "unmatched", revenue: "125.00" }),
      attribution({ id: "00000000-0000-4000-8000-000000000022", status: "won", revenue: "300.00" }),
    ], NOW);

    expect(model.summary.proofGaps).toBe(2);
    expect(model.summary.verifiedRevenueAtIssue).toBe(125);
    expect(model.items.every(item => item.classification === "proof_gap")).toBe(true);
    expect(model.items.some(item => item.id.endsWith("00000000-0000-4000-8000-000000000022"))).toBe(false);
  });

  it("returns an empty truthful state when no evidence meets a rule", () => {
    const model = buildRevenueLeakReadModel([
      lead({ status: "completed" }),
    ], [
      attribution({ status: "won", revenue: "250.00" }),
    ], NOW);

    expect(model.summary).toEqual({ total: 0, revenueRisks: 0, proofGaps: 0, verifiedRevenueAtIssue: 0 });
    expect(model.items).toEqual([]);
  });
});
