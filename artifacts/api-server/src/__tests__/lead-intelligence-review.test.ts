import { describe, expect, it, vi } from "vitest";
import type { Lead } from "@workspace/db/schema";

vi.mock("@workspace/db", () => ({ db: {} }));

import { LeadReviewService, type LeadReviewRepository } from "../services/lead-review";
import { createLeadReviewHandler } from "../routes/leads";

const clientId = "00000000-0000-4000-8000-000000000001";
const readyLead: Lead = {
  id: "00000000-0000-4000-8000-000000000301", clientName: "Bed Bugs & Beyond", source: "telnyx_sms",
  phone: "+12513249090", customerName: "Jane Customer", message: "I found bed bugs on a couch in Daphne.", eventType: "sms",
  status: "new", notes: null, service: "Furniture-level bed bug treatment", location: "Daphne, AL", urgency: "high",
  sourceMessageId: "message-301", draftResponse: "Thanks for reaching out. Our team can review treatment options for the affected couch in Daphne.",
  responseStatus: "ready_for_review", receivedAt: new Date("2026-08-03T10:00:00.000Z"), lastFollowUpAt: null, outcome: null,
  createdAt: new Date("2026-08-03T10:00:00.000Z"), updatedAt: new Date("2026-08-03T11:00:00.000Z"),
};

function makeRepository(lead: Lead | null = readyLead) {
  const findById = vi.fn().mockResolvedValue(lead);
  const saveReview = vi.fn().mockImplementation(async (_clientId, _leadId, update) => lead ? { ...lead, ...update, updatedAt: new Date("2026-08-03T12:00:00.000Z") } : null);
  const repository: LeadReviewRepository = { findById, saveReview };
  return { repository, findById, saveReview };
}

function makeResponse() {
  const response = { statusCode: 200, body: undefined as unknown,
    status: vi.fn((code: number) => { response.statusCode = code; return response; }),
    json: vi.fn((body: unknown) => { response.body = body; return response; }) };
  return response;
}

const resolveClient = vi.fn().mockResolvedValue({ found: true, client: { id: clientId } }) as any;
const ownsLead = vi.fn().mockResolvedValue(true);

describe("Lead Intelligence V1 human review", () => {
  it("approves a ready draft without sending it", async () => {
    const { repository, findById, saveReview } = makeRepository();
    const result = await new LeadReviewService(repository).reviewLead(clientId, readyLead.id, { action: "approve" });
    expect(result.status).toBe("approved");
    expect(findById).toHaveBeenCalledWith(clientId, readyLead.id);
    expect(saveReview).toHaveBeenCalledWith(clientId, readyLead.id, { draftResponse: readyLead.draftResponse, responseStatus: "approved" });
    expect(result).not.toHaveProperty("sent");
  });

  it("stores a safe human edit and returns it to review", async () => {
    const { repository, saveReview } = makeRepository({ ...readyLead, responseStatus: "approved" });
    const draftResponse = "Thanks for contacting us. What is the best time for our team to call about the couch in Daphne?";
    const result = await new LeadReviewService(repository).reviewLead(clientId, readyLead.id, { action: "edit", draftResponse });
    expect(result.status).toBe("edited");
    expect(saveReview).toHaveBeenCalledWith(clientId, readyLead.id, { draftResponse, responseStatus: "ready_for_review" });
  });

  it("rejects a draft while preserving it for review history", async () => {
    const { repository, saveReview } = makeRepository();
    const result = await new LeadReviewService(repository).reviewLead(clientId, readyLead.id, { action: "reject" });
    expect(result.status).toBe("rejected");
    expect(saveReview).toHaveBeenCalledWith(clientId, readyLead.id, { draftResponse: readyLead.draftResponse, responseStatus: "rejected" });
  });

  it("blocks unsafe human edits", async () => {
    const { repository, saveReview } = makeRepository();
    const result = await new LeadReviewService(repository).reviewLead(clientId, readyLead.id, { action: "edit", draftResponse: "Your appointment is confirmed and treatment is guaranteed." });
    expect(result).toEqual({ status: "invalid", error: "unsafe_draft" });
    expect(saveReview).not.toHaveBeenCalled();
  });

  it("does not approve a missing or unready draft", async () => {
    const { repository, saveReview } = makeRepository({ ...readyLead, draftResponse: null, responseStatus: "pending" });
    const result = await new LeadReviewService(repository).reviewLead(clientId, readyLead.id, { action: "approve" });
    expect(result).toEqual({ status: "invalid", error: "draft_not_ready" });
    expect(saveReview).not.toHaveBeenCalled();
  });

  it("requires authentication at the review endpoint", async () => {
    const review = vi.fn(); const response = makeResponse();
    const handler = createLeadReviewHandler(review as any, vi.fn(() => ({ userId: null })) as any, resolveClient, ownsLead);
    await handler({ params: { id: readyLead.id }, body: { action: "approve" } } as any, response);
    expect(response.statusCode).toBe(401); expect(review).not.toHaveBeenCalled();
  });

  it("passes the canonical tenant into the review service", async () => {
    const response = makeResponse();
    const review = vi.fn().mockResolvedValue({ status: "approved", lead: { ...readyLead, responseStatus: "approved" } });
    const handler = createLeadReviewHandler(review as any, vi.fn(() => ({ userId: "user_123" })) as any, resolveClient, ownsLead);
    await handler({ params: { id: readyLead.id }, body: { action: "approve" } } as any, response);
    expect(ownsLead).toHaveBeenCalledWith(clientId, readyLead.id);
    expect(review).toHaveBeenCalledWith(clientId, readyLead.id, { action: "approve" });
    expect(response.statusCode).toBe(200);
  });

  it("hides another tenant's lead and never invokes review", async () => {
    const response = makeResponse(); const review = vi.fn(); const denyOwnership = vi.fn().mockResolvedValue(false);
    const handler = createLeadReviewHandler(review as any, vi.fn(() => ({ userId: "user_123" })) as any, resolveClient, denyOwnership);
    await handler({ params: { id: readyLead.id }, body: { action: "approve" } } as any, response);
    expect(review).not.toHaveBeenCalled(); expect(response.statusCode).toBe(404); expect(response.body).toEqual({ error: "lead_not_found" });
  });
});
