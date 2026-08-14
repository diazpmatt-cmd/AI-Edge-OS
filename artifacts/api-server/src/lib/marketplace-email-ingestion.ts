import { createHash } from "node:crypto";
import { parseMarketplaceEmail, type ParsedMarketplaceEmail } from "./marketplace-email-intake-parser.js";
import type { LeadIntakeInput, LeadIntakeResult } from "../services/lead-intake.js";

export interface TrustedMarketplaceTenant {
  readonly clientId: string;
  readonly clientName: string;
}

export interface MarketplaceMailboxMessage {
  readonly messageId: string;
  readonly threadId: string | null;
  readonly from: string;
  readonly subject: string;
  readonly body: string;
  readonly receivedAt: Date;
}

export type MarketplaceEmailIngestionOutcome =
  | { readonly kind: "lead"; readonly parsed: ParsedMarketplaceEmail; readonly result: LeadIntakeResult }
  | { readonly kind: "opportunity_signal"; readonly parsed: ParsedMarketplaceEmail }
  | { readonly kind: "ignored"; readonly parsed: ParsedMarketplaceEmail };

export type MarketplaceLeadIntake = (input: LeadIntakeInput) => Promise<LeadIntakeResult>;

function normalized(value: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeThreadId(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed && trimmed.length <= 256 && /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

/**
 * Creates a source identity shared by a Yelp initial lead and its later Gmail
 * reminder when Gmail keeps them in one thread. A bounded semantic fallback is
 * used only when a trustworthy thread ID is unavailable.
 */
export function marketplaceLeadSourceIdentity(
  message: MarketplaceMailboxMessage,
  parsed: ParsedMarketplaceEmail,
): string {
  const threadId = safeThreadId(message.threadId);
  if (threadId) return `gmail:yelp:thread:${threadId}`;

  const semantic = [
    normalized(parsed.customerName),
    normalized(parsed.serviceHint),
    normalized(parsed.locationHint),
  ];
  const usefulSemanticParts = semantic.filter(Boolean).length;
  if (usefulSemanticParts >= 2) return `gmail:yelp:semantic:${digest(semantic.join("|"))}`;
  return `gmail:yelp:message:${message.messageId}`;
}

function leadMessage(parsed: ParsedMarketplaceEmail): string | null {
  const lines = [
    parsed.serviceHint ? `Service: ${parsed.serviceHint}` : null,
    parsed.locationHint ? `Location: ${parsed.locationHint}` : null,
    parsed.details ? `Details: ${parsed.details}` : null,
  ].filter((value): value is string => Boolean(value));
  return lines.length ? lines.join("\n").slice(0, 10_000) : null;
}

/**
 * Tenant-safe bridge from a read-only mailbox message into canonical Lead
 * Intelligence. Tenant identity is injected by trusted server configuration,
 * never parsed from message content or accepted from a customer payload.
 */
export async function ingestMarketplaceMailboxMessage(input: {
  readonly tenant: TrustedMarketplaceTenant;
  readonly message: MarketplaceMailboxMessage;
  readonly intake: MarketplaceLeadIntake;
}): Promise<MarketplaceEmailIngestionOutcome> {
  if (!input.tenant.clientId.trim() || !input.tenant.clientName.trim()) {
    throw new Error("trusted marketplace tenant identity is required");
  }

  const parsed = parseMarketplaceEmail({
    messageId: input.message.messageId,
    from: input.message.from,
    subject: input.message.subject,
    body: input.message.body,
    receivedAt: input.message.receivedAt,
  });

  if (parsed.source === "nextdoor" && parsed.kind === "opportunity_signal") {
    return Object.freeze({ kind: "opportunity_signal" as const, parsed });
  }

  if (parsed.source !== "yelp" || !["direct_lead", "lead_reminder"].includes(parsed.kind)) {
    return Object.freeze({ kind: "ignored" as const, parsed });
  }

  const result = await input.intake({
    clientId: input.tenant.clientId,
    clientName: input.tenant.clientName,
    source: "gmail_yelp",
    phone: null,
    customerName: parsed.customerName,
    message: leadMessage(parsed),
    eventType: parsed.kind === "lead_reminder" ? "marketplace_lead_reminder" : "marketplace_direct_lead",
    service: parsed.serviceHint,
    location: parsed.locationHint,
    urgency: parsed.urgency === "high" ? "urgent" : "normal",
    sourceMessageId: marketplaceLeadSourceIdentity(input.message, parsed),
    receivedAt: parsed.receivedAt,
  });

  return Object.freeze({ kind: "lead" as const, parsed, result });
}
