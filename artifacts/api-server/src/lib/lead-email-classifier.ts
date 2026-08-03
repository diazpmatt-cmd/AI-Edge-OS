import { createHash } from "node:crypto";

export type LeadEmailKind = "lead" | "follow_up" | "promotion" | "account_notice" | "unknown";
export type LeadEmailSource = "yelp" | "nextdoor" | "other";

export interface LeadEmailInput {
  messageId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: Date;
}

export interface ClassifiedLeadEmail {
  source: LeadEmailSource;
  kind: LeadEmailKind;
  externalId: string;
  customerName: string | null;
  service: string | null;
  location: string | null;
  details: string | null;
  urgency: "urgent" | "normal" | "none";
  payloadHash: string;
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const pick = (body: string, label: string) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`${escaped}\\s*\\n([^\\n]+)`, "i"));
  return match?.[1]?.trim() || null;
};

export function classifyLeadEmail(input: LeadEmailInput): ClassifiedLeadEmail {
  const from = input.from.toLowerCase();
  const subject = input.subject.trim();
  const body = input.body.trim();
  const payloadHash = hash([input.messageId, from, subject, body].join("\n"));

  if (from.includes("messaging.yelp.com") || from.includes("yelp.com")) {
    const isLead = /new lead on yelp|message from .+ for bed bugs and beyond/i.test(subject);
    const isAccountNotice = /password|verification|account|security/i.test(subject);
    const customerName = subject.match(/Message from (.+?) for/i)?.[1]?.trim()
      ?? body.match(/^(.+?) Has Waited/im)?.[1]?.trim()
      ?? body.match(/^(.+?) requested a quote/im)?.[1]?.trim()
      ?? null;
    const pests = pick(body, "Which pests are you having problems with? Select all that apply.");
    const service = pests ?? pick(body, "What type of pest control service do you need?");
    const details = pick(body, "Any details you'd like to add?");
    const location = pick(body, "In what location do you need the service?");
    const waited = /Has Waited\s+(\d+)\s+Days?/i.exec(body);
    return {
      source: "yelp",
      kind: isAccountNotice ? "account_notice" : isLead ? (/Has Waited/i.test(body) ? "follow_up" : "lead") : "promotion",
      externalId: input.messageId,
      customerName,
      service,
      location,
      details,
      urgency: waited || /new lead on yelp/i.test(subject) ? "urgent" : isLead ? "normal" : "none",
      payloadHash,
    };
  }

  if (from.includes("nextdoor.com")) {
    const isPromotion = /opportunity alerts|try opportunity alerts|set up your business|advertis|we miss you|get your business noticed/i.test(`${subject}\n${body}`);
    const isOpportunity = /neighbor .* pest control pro|someone nearby needs a pest control pro/i.test(`${subject}\n${body}`);
    const line = body.match(/^([A-Z])\s*\n\s*([^\n]+?)\s+·\s+([^\n]+?)\s+·/m);
    const details = body.match(/[“"]([^”"]{20,})[”"]/m)?.[1]?.trim() ?? null;
    return {
      source: "nextdoor",
      kind: isOpportunity && !isPromotion ? "lead" : isPromotion ? "promotion" : "unknown",
      externalId: input.messageId,
      customerName: line?.[2]?.trim() ?? null,
      service: details ? "Pest control recommendation" : null,
      location: line?.[3]?.trim() ?? null,
      details,
      urgency: isOpportunity && !isPromotion ? "urgent" : "none",
      payloadHash,
    };
  }

  return {
    source: "other",
    kind: "unknown",
    externalId: input.messageId,
    customerName: null,
    service: null,
    location: null,
    details: null,
    urgency: "none",
    payloadHash,
  };
}
