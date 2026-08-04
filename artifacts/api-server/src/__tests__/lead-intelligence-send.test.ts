import { describe, expect, it, vi } from "vitest";
import type { Lead } from "@workspace/db/schema";
import { LeadSendService, type LeadSendRepository, type LeadSmsSender } from "../services/lead-send";

const reviewedLead: Lead = {
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
  responseStatus: "ready_for_review",
  receivedAt: new Date("2026-08-03T10:00:00.000Z"),
  lastFollowUpAt: null,
  outcome: null,
  createdAt: new Date("2026-08-03T10:00:00.000Z"),
  updatedAt: new Date("2026-08-03T11:00:00.000Z"),
};

function repositoryWith(options: { claimed?: Lead | null; existing?: Lead | null } = {}) {
  const claimed = options.claimed === undefined ? { ...reviewedLead, responseStatus: "sending" } : options.claimed;
  const existing = options.existing === undefined ? reviewedLead : options.existing;
  const claimReviewed = vi.fn().mockResolvedValue(claimed);
  const findById = vi.fn().mockResolvedValue(existing);
  const markSent = vi.fn().mockImplementation(async (_id, messageId, sentAt) => ({
    ...reviewedLead,
    responseStatus: "sent",
    status: "contacted",
    lastFollowUpAt: sentAt,
    outcome: messageId ? `sms_sent:${messageId}` : "sms_sent",
  }));
  const releaseAfterFailure = vi.fn().mockImplementation(async (_id, error) => ({
    ...reviewedLead,
    responseStatus: "ready_for_review",
    outcome: `sms_failed:${error}`,
  }));
  const repository: LeadSendRepository = { claimReviewed, findById, markSent, releaseAfterFailure };
  return { repository, claimReviewed, findById, markSent, releaseAfterFailure };
}

function senderReturning(result: Awaited<ReturnType<LeadSmsSender["send"]>>) {
  const send = vi.fn().mockResolvedValue(result);
  return { sender: { send } satisfies LeadSmsSender, send };
}

describe("Lead Intelligence one-step approve and send", () => {
  it("claims a reviewed draft, sends it once, and records delivery metadata", async () => {
    const repo = repositoryWith();
    const sms = senderReturning({ ok: true, messageId: "telnyx-201" });
    const sentAt = new Date("2026-08-03T12:00:00.000Z");
    const service = new LeadSendService(repo.repository, sms.sender, () => sentAt);

    const result = await service.approveAndSendLead(reviewedLead.id);

    expect(result.status).toBe("sent");
    expect(sms.send).toHaveBeenCalledWith({ to: reviewedLead.phone, text: reviewedLead.draftResponse });
    expect(repo.markSent).toHaveBeenCalledWith(reviewedLead.id, "telnyx-201", sentAt);
    expect(repo.releaseAfterFailure).not.toHaveBeenCalled();
  });

  it("also accepts a previously approved draft for backward compatibility", async () => {
    const repo = repositoryWith({ claimed: { ...reviewedLead, responseStatus: "sending" }, existing: { ...reviewedLead, responseStatus: "approved" } });
    const sms = senderReturning({ ok: true, messageId: "telnyx-202" });

    const result = await new LeadSendService(repo.repository, sms.sender).approveAndSendLead(reviewedLead.id);

    expect(result.status).toBe("sent");
    expect(sms.send).toHaveBeenCalledOnce();
  });

  it("prevents a duplicate send after the first message is sent", async () => {
    const repo = repositoryWith({ claimed: null, existing: { ...reviewedLead, responseStatus: "sent" } });
    const sms = senderReturning({ ok: true, messageId: "should-not-send" });

    const result = await new LeadSendService(repo.repository, sms.sender).approveAndSendLead(reviewedLead.id);

    expect(result).toEqual({ status: "invalid", error: "already_sent" });
    expect(sms.send).not.toHaveBeenCalled();
  });

  it("blocks a concurrent click while another send owns the claim", async () => {
    const repo = repositoryWith({ claimed: null, existing: { ...reviewedLead, responseStatus: "sending" } });
    const sms = senderReturning({ ok: true, messageId: "should-not-send" });

    const result = await new LeadSendService(repo.repository, sms.sender).approveAndSendLead(reviewedLead.id);

    expect(result).toEqual({ status: "invalid", error: "send_in_progress" });
    expect(sms.send).not.toHaveBeenCalled();
  });

  it("blocks a draft that is not ready for human review", async () => {
    const repo = repositoryWith({ claimed: null, existing: { ...reviewedLead, responseStatus: "pending" } });
    const sms = senderReturning({ ok: true, messageId: "should-not-send" });

    const result = await new LeadSendService(repo.repository, sms.sender).approveAndSendLead(reviewedLead.id);

    expect(result).toEqual({ status: "invalid", error: "draft_not_ready" });
    expect(sms.send).not.toHaveBeenCalled();
  });

  it("returns the lead to review state when Telnyx fails", async () => {
    const repo = repositoryWith();
    const sms = senderReturning({ ok: false, error: "Telnyx 503: unavailable" });

    const result = await new LeadSendService(repo.repository, sms.sender).approveAndSendLead(reviewedLead.id);

    expect(result.status).toBe("failed");
    expect(repo.releaseAfterFailure).toHaveBeenCalledWith(reviewedLead.id, "Telnyx 503: unavailable");
    expect(repo.markSent).not.toHaveBeenCalled();
  });

  it("never sends without both a destination and reviewed draft text", async () => {
    const noPhoneRepo = repositoryWith({ claimed: { ...reviewedLead, phone: "", responseStatus: "sending" } });
    const noDraftRepo = repositoryWith({ claimed: { ...reviewedLead, draftResponse: null, responseStatus: "sending" } });
    const sms = senderReturning({ ok: true, messageId: "should-not-send" });

    expect(await new LeadSendService(noPhoneRepo.repository, sms.sender).approveAndSendLead(reviewedLead.id))
      .toEqual({ status: "invalid", error: "missing_phone" });
    expect(await new LeadSendService(noDraftRepo.repository, sms.sender).approveAndSendLead(reviewedLead.id))
      .toEqual({ status: "invalid", error: "missing_draft" });
    expect(sms.send).not.toHaveBeenCalled();
  });
});
