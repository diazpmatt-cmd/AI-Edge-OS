import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { leadsTable, smsConversationsTable } from "@workspace/db/schema";

const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const DELIVERY_EVENTS = new Set([
  "message.sent",
  "message.finalized",
  "message.delivered",
  "message.delivery_failed",
  "message.failed",
]);

export type LeadDeliveryEvent = {
  eventType: string;
  messageId: string | null;
  customerNumber: string;
  deliveryStatus: string;
  occurredAt: Date;
};

export function normalizeDeliveryStatus(eventType: string, payload: any): string {
  const explicit = String(payload?.to?.[0]?.status ?? payload?.status ?? "").toLowerCase();
  if (explicit) return explicit;
  if (eventType === "message.delivered") return "delivered";
  if (eventType === "message.delivery_failed" || eventType === "message.failed") return "failed";
  if (eventType === "message.finalized") return "finalized";
  return "sent";
}

export function isDeliveryEvent(eventType: string): boolean {
  return DELIVERY_EVENTS.has(eventType);
}

export function isOptOutText(text: string): boolean {
  return STOP_WORDS.has(text.trim().toLowerCase().replace(/[^a-z]/g, ""));
}

export async function recordLeadDelivery(event: LeadDeliveryEvent): Promise<void> {
  if (event.messageId) {
    await db.update(smsConversationsTable)
      .set({ status: event.deliveryStatus })
      .where(eq(smsConversationsTable.messageId, event.messageId));
  }

  const outcome = event.messageId
    ? `sms_${event.deliveryStatus}:${event.messageId}`
    : `sms_${event.deliveryStatus}`;

  if (event.messageId) {
    await db.update(leadsTable)
      .set({ outcome, updatedAt: event.occurredAt })
      .where(sql`${leadsTable.outcome} LIKE ${`%${event.messageId}%`}`);
  }
}

export async function correlateInboundReply(input: {
  phone: string;
  text: string;
  messageId: string | null;
  receivedAt: Date;
}): Promise<{ matchedLeadId: string | null; optedOut: boolean }> {
  const optedOut = isOptOutText(input.text);
  const [lead] = await db.select()
    .from(leadsTable)
    .where(and(eq(leadsTable.phone, input.phone), eq(leadsTable.responseStatus, "sent")))
    .orderBy(desc(leadsTable.lastFollowUpAt), desc(leadsTable.updatedAt))
    .limit(1);

  if (!lead) return { matchedLeadId: null, optedOut };

  await db.update(leadsTable)
    .set({
      status: optedOut ? "opted_out" : "replied",
      responseStatus: optedOut ? "opted_out" : "replied",
      outcome: optedOut ? "sms_opted_out" : `sms_replied${input.messageId ? `:${input.messageId}` : ""}`,
      updatedAt: input.receivedAt,
    })
    .where(eq(leadsTable.id, lead.id));

  return { matchedLeadId: lead.id, optedOut };
}

export function needsFollowUp(lead: {
  responseStatus: string;
  lastFollowUpAt: Date | null;
  outcome: string | null;
}, now = new Date(), delayHours = 24): boolean {
  if (lead.responseStatus !== "sent" || !lead.lastFollowUpAt) return false;
  if (lead.outcome?.startsWith("sms_replied") || lead.outcome === "sms_opted_out") return false;
  return now.getTime() - lead.lastFollowUpAt.getTime() >= delayHours * 60 * 60 * 1000;
}
