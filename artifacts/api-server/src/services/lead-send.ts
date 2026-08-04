import { and, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { leadsTable, type Lead } from "@workspace/db/schema";

export type LeadSmsSender = {
  send(input: { to: string; text: string }): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }>;
};

export type LeadSendRepository = {
  claimReviewed(leadId: string): Promise<Lead | null>;
  findById(leadId: string): Promise<Lead | null>;
  markSent(leadId: string, messageId: string | null, sentAt: Date): Promise<Lead | null>;
  releaseAfterFailure(leadId: string, error: string): Promise<Lead | null>;
};

export type LeadSendResult =
  | { status: "sent"; lead: Lead; messageId: string | null }
  | { status: "not_found"; error: "lead_not_found" }
  | { status: "invalid"; error: "draft_not_ready" | "missing_phone" | "missing_draft" | "already_sent" | "send_in_progress" }
  | { status: "failed"; error: "provider_failure"; detail: string; lead: Lead | null };

export function createTelnyxLeadSmsSender(fetchFn: typeof fetch = fetch): LeadSmsSender {
  return {
    async send({ to, text }) {
      const apiKey = process.env.TELNYX_API_KEY;
      const from = process.env.TELNYX_FROM_NUMBER ?? "+12512863200";
      if (!apiKey) return { ok: false, error: "TELNYX_API_KEY not set" };

      try {
        const response = await fetchFn("https://api.telnyx.com/v2/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ from, to, text }),
        });
        const payload = await response.json().catch(() => ({})) as any;
        if (!response.ok) {
          const detail = payload?.errors?.[0]?.detail ?? response.statusText ?? "Telnyx request failed";
          return { ok: false, error: `Telnyx ${response.status}: ${detail}` };
        }
        return { ok: true, messageId: payload?.data?.id ?? null };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Network error" };
      }
    },
  };
}

export function createDrizzleLeadSendRepository(): LeadSendRepository {
  return {
    async claimReviewed(leadId) {
      const [lead] = await db
        .update(leadsTable)
        .set({ responseStatus: "sending", updatedAt: new Date() })
        .where(and(
          eq(leadsTable.id, leadId),
          inArray(leadsTable.responseStatus, ["ready_for_review", "approved"]),
        ))
        .returning();
      return lead ?? null;
    },
    async findById(leadId) {
      const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1);
      return lead ?? null;
    },
    async markSent(leadId, messageId, sentAt) {
      const [lead] = await db
        .update(leadsTable)
        .set({
          responseStatus: "sent",
          status: "contacted",
          lastFollowUpAt: sentAt,
          outcome: messageId ? `sms_sent:${messageId}` : "sms_sent",
          updatedAt: sentAt,
        })
        .where(and(eq(leadsTable.id, leadId), eq(leadsTable.responseStatus, "sending")))
        .returning();
      return lead ?? null;
    },
    async releaseAfterFailure(leadId, error) {
      const safeError = error.slice(0, 300);
      const [lead] = await db
        .update(leadsTable)
        .set({ responseStatus: "ready_for_review", outcome: `sms_failed:${safeError}`, updatedAt: new Date() })
        .where(and(eq(leadsTable.id, leadId), eq(leadsTable.responseStatus, "sending")))
        .returning();
      return lead ?? null;
    },
  };
}

export class LeadSendService {
  constructor(
    private readonly repository: LeadSendRepository,
    private readonly sender: LeadSmsSender,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async approveAndSendLead(leadId: string): Promise<LeadSendResult> {
    const claimed = await this.repository.claimReviewed(leadId);
    if (!claimed) {
      const existing = await this.repository.findById(leadId);
      if (!existing) return { status: "not_found", error: "lead_not_found" };
      if (existing.responseStatus === "sent") return { status: "invalid", error: "already_sent" };
      if (existing.responseStatus === "sending") return { status: "invalid", error: "send_in_progress" };
      return { status: "invalid", error: "draft_not_ready" };
    }

    if (!claimed.phone.trim()) {
      await this.repository.releaseAfterFailure(leadId, "missing_phone");
      return { status: "invalid", error: "missing_phone" };
    }
    if (!claimed.draftResponse?.trim()) {
      await this.repository.releaseAfterFailure(leadId, "missing_draft");
      return { status: "invalid", error: "missing_draft" };
    }

    const result = await this.sender.send({ to: claimed.phone, text: claimed.draftResponse.trim() });
    if (!result.ok) {
      const released = await this.repository.releaseAfterFailure(leadId, result.error);
      return { status: "failed", error: "provider_failure", detail: result.error, lead: released };
    }

    const sent = await this.repository.markSent(leadId, result.messageId, this.now());
    if (!sent) {
      return { status: "failed", error: "provider_failure", detail: "sent_but_state_update_failed", lead: null };
    }
    return { status: "sent", lead: sent, messageId: result.messageId };
  }
}

export const sendApprovedLead = (leadId: string) =>
  new LeadSendService(createDrizzleLeadSendRepository(), createTelnyxLeadSmsSender()).approveAndSendLead(leadId);
