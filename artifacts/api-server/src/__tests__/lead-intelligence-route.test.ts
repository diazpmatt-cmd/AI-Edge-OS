import { describe, expect, it, vi } from "vitest";
import type { Lead } from "@workspace/db/schema";

vi.mock("@workspace/db", () => ({ db: {} }));
vi.mock("../services/lead-analysis", () => ({ analyzeLead: vi.fn() }));

import { createLeadAnalysisHandler } from "../routes/leads";

const clientId = "00000000-0000-4000-8000-000000000001";
const lead: Lead = {
  id: "00000000-0000-4000-8000-000000000201",
  clientName: "Bed Bugs & Beyond",
  source: "telnyx_sms",
  phone: "+12513249090",
  customerName: "Jane Customer",
  message: "I found bed bugs on a couch in Daphne. Can someone help soon?",
  eventType: "sms",
  status: "new",
  notes: null,
  service: "Furniture-level bed bug treatment",
  location: "Daphne, AL",
  urgency: "high",
  sourceMessageId: "message-201",
  draftResponse: "Thanks for reaching out. Our team can review treatment options for the affected couch in Daphne.",
  responseStatus: "ready_for_review",
  receivedAt: new Date("2026-08-03T10:00:00.000Z"),
  lastFollowUpAt: null,
  outcome: null,
  createdAt: new Date("2026-08-03T10:00:00.000Z"),
  updatedAt: new Date("2026-08-03T11:00:00.000Z"),
};

function makeResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status: vi.fn((code: number) => { response.statusCode = code; return response; }),
    json: vi.fn((body: unknown) => { response.body = body; return response; }),
  };
  return response;
}

const request = { params: { id: lead.id } } as any;
const authenticated = vi.fn(() => ({ userId: "user_123" })) as any;
const unauthenticated = vi.fn(() => ({ userId: null })) as any;
const resolveClient = vi.fn().mockResolvedValue({ found: true, client: { id: clientId } }) as any;
const ownsLead = vi.fn().mockResolvedValue(true);

function handlerFor(analyze: any, owns: any = ownsLead) {
  return createLeadAnalysisHandler(analyze, authenticated, resolveClient, owns);
}

describe("manual lead analysis route", () => {
  it("requires authentication before invoking analysis", async () => {
    const analyze = vi.fn();
    const response = makeResponse();
    const handler = createLeadAnalysisHandler(analyze as any, unauthenticated, resolveClient, ownsLead);
    await handler(request, response);
    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
    expect(analyze).not.toHaveBeenCalled();
  });

  it("returns a review draft without sending it", async () => {
    const analyze = vi.fn().mockResolvedValue({
      status: "ready_for_review", lead,
      analysis: { service: lead.service, location: lead.location, urgency: lead.urgency,
        summary: "Customer reports bed bugs on a couch in Daphne.", missingInformation: ["What is the best time to contact you?"], draftResponse: lead.draftResponse },
    });
    const response = makeResponse();
    await handlerFor(analyze as any)(request, response);
    expect(ownsLead).toHaveBeenCalledWith(clientId, lead.id);
    expect(analyze).toHaveBeenCalledWith(clientId, lead.id);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ lead: { id: lead.id, responseStatus: "ready_for_review" }, analysis: { summary: "Customer reports bed bugs on a couch in Daphne." } });
    expect(response.body).not.toHaveProperty("sent");
  });

  it("returns 404 without invoking analysis for another tenant's lead", async () => {
    const analyze = vi.fn();
    const response = makeResponse();
    const denyOwnership = vi.fn().mockResolvedValue(false);
    await handlerFor(analyze as any, denyOwnership)(request, response);
    expect(denyOwnership).toHaveBeenCalledWith(clientId, lead.id);
    expect(analyze).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ error: "lead_not_found" });
  });

  it.each([["provider_failure", 503], ["invalid_ai_output", 422], ["persistence_failure", 500]] as const)("maps %s to HTTP %s", async (error, expectedStatus) => {
    const analyze = vi.fn().mockResolvedValue({ status: "failed", error, lead: { ...lead, responseStatus: "pending" } });
    const response = makeResponse();
    await handlerFor(analyze as any)(request, response);
    expect(response.statusCode).toBe(expectedStatus);
    expect(response.body).toMatchObject({ error, lead: { id: lead.id, responseStatus: "pending" } });
  });

  it("returns 404 for a missing lead after tenant ownership is established", async () => {
    const analyze = vi.fn().mockResolvedValue({ status: "not_found", lead: null, error: "lead_not_found" });
    const response = makeResponse();
    await handlerFor(analyze as any)(request, response);
    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ error: "lead_not_found" });
  });

  it("contains unexpected failures without leaking details", async () => {
    const analyze = vi.fn().mockRejectedValue(new Error("secret provider detail"));
    const response = makeResponse();
    await handlerFor(analyze as any)(request, response);
    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: "analysis_unavailable" });
  });
});
