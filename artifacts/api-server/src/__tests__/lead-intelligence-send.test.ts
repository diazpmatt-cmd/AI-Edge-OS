import { describe, expect, it, vi } from "vitest";
import type { Lead } from "@workspace/db/schema";
import { LeadSendService, type LeadSendRepository, type LeadSmsSender } from "../services/lead-send";

const approvedLead: Lead = {
  id: "00000000-0000-4000-8000-000000000201",
  clientName: "Bed Bugs & Beyond",
  source: "telnyx_sms",
  phone: "+12513249090",
  customerName: "Jane Customer",
  message: "I found bed bugs on a couch.",
  eventType: "sms",
  status: "new",
  notes: null,
  service: "Furniture bed bug treatment",
  location: "Daphne, AL",
  urgency: "high",
  sourceMessageId: "inbound-201",
  draftResponse: "Hi Jane, thanks for reaching out. Our team can review treatment options for the couch. What is the best time to contact you?",
  responseStatus: "approved",
  receivedAt: new Date("2026-08-03T10:00:00.000Z"),
  lastFollowUpAt: null,
  outcome: null,
  createdAt: new Date("2026-08-03T10:00:00.000Z"),
  updatedAt: new Date("2026-08-03T11:00:00.000Z"),
};

function repositoryWith(options: { claimed?: Lead | null; existing?: Lead | null } = {}) {
  const claimed = options.claimed === undefined ? { ...approvedLead, responseStatus: "sending" } : options.claimed;
  const existing = options.existing === undefined ? approvedLead : options.existing;
  const claimApproved = vi.fn().mockResolvedValue(claimed);
  const findById = vi.fn().mockResolvedValue(existing);
  const markSent = vi.fn().mockImplementation(async (_id, messageId, sentAt) => ({
    ...approvedLead,
    responseStatus: "sent",
    status: "contacted",
    lastFollowUpAt: sentAt,
    outcome: messageId ? `sms_sent:${messageId}` : "sms_sent",
  }));
  const releaseAfterFailure = vi.fn().mockImplementation(async (_id, error) => ({
    ...approvedLead,
    responseStatus: "approved",
    outcome: `sms_failed:${error}`,
  }));
  const repository: LeadSendRepository = { claimApproved, findById, markSent, releaseAfterFailure };
  return { repository, claimApproved, findById, markSent, releaseAfterFailure };
}

function senderReturning(result: Awaited<ReturnType<LeadSmsSender["send"]>>) {
  const send = vi.fn().mockResolvedValue(result);
  return { sender: { send } satisfies LeadSmsSender, send };
}

describe("Lead Intelligence approved SMS sending", () => {
  it("sends only an approved draft and records delivery metadata", async () => {
    const repo = repositoryWith();
    const sms = senderReturning({ ok: true, messageId: "telnyx-201" });
    const sentAt = new Date("2026-08-03T12:00:00.000Z");
    const service = new LeadSendService(repo.repository, sms.sender, () => sentAt);

    const result = await service.sendApprovedLead(approvedLead.id);

    expect(result.status).toBe("sent");
    expect(sms.send).toHaveBeenCalledWith({ to: approvedLead.phone, text: approvedLead.draftResponse });
    expect(repo.markSent).toHaveBeenCalledWith(approvedLead.id, "telnyx-201", sentAt);
    expect(repo.releaseAfterFailure).not.toHaveBeenCalled();
  });

  it("prevents a duplicate send after the first message is sent", async () => {
    const repo = repositoryWith({ claimed: null, existing: { ...approvedLead, responseStatus: "sent" } });
    const sms = senderReturning({ ok: true, messageId: "should-not-send" });
    const service = new LeadSendService(repo.repository, sms.sender);

    const result = await service.sendApprovedLead(approvedLead.id);

    expect(result).toEqual({ status: "invalid", error: "already_sent" });
    expect(sms.send).not.toHaveBeenCalled();
  });

  it("blocks a concurrent click while another send owns the claim", async () => {
    const repo = repositoryWith({ claimed: null, existing: { ...approvedLead, responseStatus: "sending" } });
    const sms = senderReturning({ ok: true, messageId: "should-not-send" });
    const service = new LeadSendService(repo.repository, sms.sender);

    const result = await service.sendApprovedLead(approvedLead.id);

    expect(result).toEqual({ status: "invalid", error: "send_in_progress" });
    expect(sms.send).not.toHaveBeenCalled();
  });

  it("blocks drafts that have not received human approval", async () => {
    const repo = repositoryWith({ claimed: null, existing: { ...approvedLead, responseStatus: "ready_for_review" } });
    const sms = senderReturning({ ok: true, messageId: "should-not-send" });
    const service = new LeadSendService(repo.repository, sms.sender);

    const result = await service.sendApprovedLead(approvedLead.id);

    expect(result).toEqual({ status: "invalid", error: "draft_not_approved" });
    expect(sms.send).not.toHaveBeenCalled();
  });

  it("returns the lead to approved state when Telnyx fails", async () => {
    const repo = repositoryWith();
    const sms = senderReturning({ ok: false, error: "Telnyx 503: unavailable" });
    const service = new LeadSendService(repo.repository, sms.sender);

    const result = await service.sendApprovedLead(approvedLead.id);

    expect(result.status).toBe("failed");
    expect(repo.releaseAfterFailure).toHaveBeenCalledWith(approvedLead.id, "Telnyx 503: unavailable");
    expect(repo.markSent).not.toHaveBeenCalled();
  });

  it("never sends without both a destination and approved draft text", async () => {
    const noPhoneRepo = repositoryWith({ claimed: { ...approvedLead, phone: "", responseStatus: "sending" } });
    const noDraftRepo = repositoryWith({ claimed: { ...approvedLead, draftResponse: null, responseStatus: "sending" } });
    const sms = senderReturning({ ok: true, messageId: "should-not-send" });

    expect(await new LeadSendService(noPhoneRepo.repository, sms.sender).sendApprovedLead(approvedLead.id))
      .toEqual({ status: "invalid", error: "missing_phone" });
    expect(await new LeadSendService(noDraftRepo.repository, sms.sender).sendApprovedLead(approvedLead.id))
      .toEqual({ status: "invalid", error: "missing_draft" });
    expect(sms.send).not.toHaveBeenCalled();
  });
});
