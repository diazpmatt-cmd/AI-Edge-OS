import { describe, expect, it, vi } from "vitest";
import type { Lead } from "@workspace/db/schema";

vi.mock("@workspace/db", () => ({ db: {} }));

import {
  LeadAnalysisService,
  leadAnalysisOutputSchema,
  type LeadAnalysisProvider,
  type LeadAnalysisRepository,
} from "../services/lead-analysis";

const originalLead: Lead = {
  id: "00000000-0000-4000-8000-000000000101",
  clientName: "Bed Bugs & Beyond",
  source: "telnyx_sms",
  phone: "+12513249090",
  customerName: "Jane Customer",
  message: "I found bed bugs on a couch in Daphne. Can someone help soon?",
  eventType: "sms",
  status: "new",
  notes: null,
  service: null,
  location: null,
  urgency: "normal",
  sourceMessageId: "message-101",
  draftResponse: null,
  responseStatus: "pending",
  receivedAt: new Date("2026-08-03T10:00:00.000Z"),
  lastFollowUpAt: null,
  outcome: null,
  createdAt: new Date("2026-08-03T10:00:00.000Z"),
  updatedAt: new Date("2026-08-03T10:00:00.000Z"),
};

const validOutput = {
  service: "Furniture-level bed bug treatment",
  location: "Daphne, AL",
  urgency: "high",
  summary: "Customer reports bed bugs on a couch in Daphne and wants prompt help.",
  missingInformation: ["What is the best time for the team to contact you?"],
  draftResponse: "Hi Jane, thank you for reaching out. We can review options for treating the affected couch in Daphne. What is the best time for our team to contact you about next steps?",
};

function makeRepository(lead: Lead | null = originalLead) {
  const findById = vi.fn().mockResolvedValue(lead);
  const saveAnalysis = vi.fn().mockImplementation(async (_leadId, analysis) =>
    lead ? { ...lead, ...analysis, updatedAt: new Date("2026-08-03T11:00:00.000Z") } : null,
  );
  const setResponsePending = vi.fn().mockImplementation(async () =>
    lead ? { ...lead, responseStatus: "pending" } : null,
  );
  const repository: LeadAnalysisRepository = { findById, saveAnalysis, setResponsePending };
  return { findById, repository, saveAnalysis, setResponsePending };
}

function providerReturning(output: unknown): LeadAnalysisProvider {
  return {
    name: "fixture-ai",
    model: "fixture-v1",
    generate: vi.fn().mockResolvedValue(output),
  };
}

describe("Lead Intelligence V1 analysis", () => {
  it("extracts structured details and stores a draft for human review", async () => {
    const { repository, saveAnalysis } = makeRepository();
    const service = new LeadAnalysisService(repository, providerReturning(validOutput));

    const result = await service.analyzeLead(originalLead.id);

    expect(result.status).toBe("ready_for_review");
    if (result.status !== "ready_for_review") throw new Error("expected ready result");
    expect(result.analysis).toEqual(validOutput);
    expect(saveAnalysis).toHaveBeenCalledWith(originalLead.id, {
      service: validOutput.service,
      location: validOutput.location,
      urgency: "high",
      draftResponse: validOutput.draftResponse,
      responseStatus: "ready_for_review",
    });
    expect(result.lead.status).toBe("new");
  });

  it("preserves null service and location while returning only genuine missing questions", async () => {
    const output = {
      ...validOutput,
      service: null,
      location: null,
      urgency: "normal",
      summary: "Customer asks for help but does not identify the pest or service location.",
      missingInformation: [
        "What pest or service do you need help with?",
        "What city is the property located in?",
      ],
      draftResponse: "Thanks for reaching out. What pest or service do you need help with, and what city is the property located in? Our team will review your answers and follow up.",
    };
    const { repository, saveAnalysis } = makeRepository({
      ...originalLead,
      message: "I need help at a property.",
      customerName: null,
    });
    const service = new LeadAnalysisService(repository, providerReturning(output));

    const result = await service.analyzeLead(originalLead.id);

    expect(result.status).toBe("ready_for_review");
    expect(saveAnalysis).toHaveBeenCalledWith(
      originalLead.id,
      expect.objectContaining({ service: null, location: null }),
    );
    if (result.status === "ready_for_review") {
      expect(result.analysis.missingInformation).toHaveLength(2);
    }
  });

  it.each([
    ["routine", "low"],
    ["unknown", "normal"],
    ["urgent", "high"],
    ["critical", "emergency"],
  ])("normalizes urgency %s to %s", async (inputUrgency, expectedUrgency) => {
    const { repository, saveAnalysis } = makeRepository();
    const service = new LeadAnalysisService(
      repository,
      providerReturning({ ...validOutput, urgency: inputUrgency }),
    );

    await service.analyzeLead(originalLead.id);

    expect(saveAnalysis).toHaveBeenCalledWith(
      originalLead.id,
      expect.objectContaining({ urgency: expectedUrgency }),
    );
  });

  it("rejects invalid or prohibited AI output without storing a draft", async () => {
    const { repository, saveAnalysis, setResponsePending } = makeRepository();
    const service = new LeadAnalysisService(repository, providerReturning({
      ...validOutput,
      draftResponse: "Your appointment is confirmed and treatment is guaranteed.",
    }));

    const result = await service.analyzeLead(originalLead.id);

    expect(result).toMatchObject({ status: "failed", error: "invalid_ai_output" });
    expect(saveAnalysis).not.toHaveBeenCalled();
    expect(setResponsePending).not.toHaveBeenCalled();
    expect(result.lead).toEqual(originalLead);
  });

  it("keeps the lead pending when the AI provider fails", async () => {
    const provider: LeadAnalysisProvider = {
      name: "fixture-ai",
      model: "fixture-v1",
      generate: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    };
    const previouslyReadyLead = {
      ...originalLead,
      draftResponse: "Previous review draft",
      responseStatus: "ready_for_review",
    };
    const { repository, saveAnalysis, setResponsePending } = makeRepository(previouslyReadyLead);
    const service = new LeadAnalysisService(repository, provider);

    const result = await service.analyzeLead(originalLead.id);

    expect(result).toMatchObject({ status: "failed", error: "provider_failure" });
    expect(result.lead.responseStatus).toBe("pending");
    expect(result.lead.draftResponse).toBe("Previous review draft");
    expect(saveAnalysis).not.toHaveBeenCalled();
    expect(setResponsePending).toHaveBeenCalledOnce();
    expect(setResponsePending).toHaveBeenCalledWith(originalLead.id);
  });

  it("updates only analysis fields and preserves the original lead identity and inquiry", async () => {
    const { repository, saveAnalysis } = makeRepository();
    const service = new LeadAnalysisService(repository, providerReturning(validOutput));

    const result = await service.analyzeLead(originalLead.id);

    expect(saveAnalysis.mock.calls[0]?.[1]).not.toHaveProperty("phone");
    expect(saveAnalysis.mock.calls[0]?.[1]).not.toHaveProperty("customerName");
    expect(saveAnalysis.mock.calls[0]?.[1]).not.toHaveProperty("message");
    expect(saveAnalysis.mock.calls[0]?.[1]).not.toHaveProperty("source");
    expect(saveAnalysis.mock.calls[0]?.[1]).not.toHaveProperty("sourceMessageId");
    expect(saveAnalysis.mock.calls[0]?.[1]).not.toHaveProperty("receivedAt");
    expect(saveAnalysis.mock.calls[0]?.[1]).not.toHaveProperty("status");
    expect(result.lead).toMatchObject({
      phone: originalLead.phone,
      customerName: originalLead.customerName,
      message: originalLead.message,
      source: originalLead.source,
      sourceMessageId: originalLead.sourceMessageId,
      receivedAt: originalLead.receivedAt,
      status: "new",
    });
  });

  it("has no sending capability and leaves the draft in review state", () => {
    expect(LeadAnalysisService.prototype).not.toHaveProperty("send");
    expect(LeadAnalysisService.prototype).not.toHaveProperty("dispatch");
    expect(validOutput.draftResponse).toBeTruthy();
    expect(leadAnalysisOutputSchema.safeParse(validOutput).success).toBe(true);
  });
});
