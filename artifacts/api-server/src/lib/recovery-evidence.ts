import type { CustomerJourneyEvent } from "@workspace/db";

export type RecoveryEvidence = {
  missedCallsObserved: number;
  recoveryTextsSent: number;
  customerRepliesObserved: number;
  verifiedRecoveries: number;
  unlinkedReplies: number;
  evidenceState: "unavailable" | "partial" | "verified";
};

function metadataId(event: CustomerJourneyEvent, key: string): string | null {
  const value = event.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildRecoveryEvidence(events: readonly CustomerJourneyEvent[], clientId: string): RecoveryEvidence {
  const scoped = events.filter(event => event.clientId === clientId && event.source === "telnyx");
  const missed = scoped.filter(event => event.eventType === "missed_call_observed" && event.canonicalRecordType === "telnyx_call" && event.canonicalRecordId);
  const missedIds = new Set(missed.map(event => event.canonicalRecordId!));
  const accepted = scoped.filter(event => event.eventType === "recovery_text_accepted" && event.canonicalRecordType === "telnyx_message" && event.canonicalRecordId && missedIds.has(metadataId(event, "parentCallId") ?? ""));
  const deliveredIds = new Set(scoped.filter(event => event.eventType === "recovery_text_delivered" && event.canonicalRecordType === "telnyx_message" && event.canonicalRecordId).map(event => event.canonicalRecordId!));
  const texts = accepted.filter(event => deliveredIds.has(event.canonicalRecordId!));
  const textIds = new Set(texts.map(event => event.canonicalRecordId!));
  const replies = scoped.filter(event => event.eventType === "customer_reply_observed" && event.canonicalRecordType === "telnyx_message" && event.canonicalRecordId);
  const verifiedRecoveries = new Set(replies.map(event => metadataId(event, "parentMessageId")).filter((id): id is string => Boolean(id && textIds.has(id)))).size;
  const unlinkedReplies = replies.filter(event => !textIds.has(metadataId(event, "parentMessageId") ?? "")).length;
  const evidenceState = scoped.length === 0 ? "unavailable" : unlinkedReplies > 0 || (replies.length > 0 && verifiedRecoveries === 0) ? "partial" : "verified";
  return { missedCallsObserved: missed.length, recoveryTextsSent: texts.length, customerRepliesObserved: replies.length, verifiedRecoveries, unlinkedReplies, evidenceState };
}
