import { createHash } from "node:crypto";

export type MarketplaceEmailSource = "yelp" | "nextdoor" | "other";
export type MarketplaceEmailKind =
  | "direct_lead"
  | "lead_reminder"
  | "opportunity_signal"
  | "promotion"
  | "account_notice"
  | "unknown";

export interface MarketplaceEmailInput {
  readonly messageId: string;
  readonly from: string;
  readonly subject: string;
  readonly body: string;
  readonly receivedAt: Date;
}

export interface ParsedMarketplaceEmail {
  readonly source: MarketplaceEmailSource;
  readonly kind: MarketplaceEmailKind;
  readonly sourceMessageId: string;
  readonly customerName: string | null;
  readonly serviceHint: string | null;
  readonly locationHint: string | null;
  readonly details: string | null;
  readonly urgency: "high" | "normal" | "none";
  readonly payloadHash: string;
  readonly receivedAt: Date;
}

const mailboxPattern = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/i;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pickLabeledLine(body: string, label: string): string | null {
  const match = body.match(new RegExp(`${escapeRegExp(label)}\\s*\\n([^\\n]+)`, "i"));
  return match?.[1]?.trim() || null;
}

export function extractMarketplaceMailbox(from: string): string | null {
  const angle = from.match(new RegExp(`<\\s*(${mailboxPattern.source})\\s*>`, "i"))?.[1];
  const address = angle ?? from.match(mailboxPattern)?.[0];
  return address?.toLowerCase() ?? null;
}

function isDomainOrSubdomain(domain: string, expected: string): boolean {
  return domain === expected || domain.endsWith(`.${expected}`);
}

export function classifyMarketplaceSource(from: string): MarketplaceEmailSource {
  const address = extractMarketplaceMailbox(from);
  if (!address) return "other";
  const domain = address.slice(address.lastIndexOf("@") + 1).replace(/\.$/, "");
  if (isDomainOrSubdomain(domain, "yelp.com")) return "yelp";
  if (isDomainOrSubdomain(domain, "nextdoor.com")) return "nextdoor";
  return "other";
}

function parseYelp(input: MarketplaceEmailInput, payloadHash: string): ParsedMarketplaceEmail {
  const subject = input.subject.trim();
  const body = input.body.trim();
  const accountNotice = /password|verification|account|security/i.test(subject);
  const directLead = /new lead on yelp|message from .+ for /i.test(subject)
    || /requested a quote/i.test(body);
  const reminder = directLead && /has waited\s+\d+\s+days?/i.test(body);
  const customerName = subject.match(/Message from (.+?) for/i)?.[1]?.trim()
    ?? body.match(/^(.+?)\s+Has Waited/im)?.[1]?.trim()
    ?? body.match(/^(.+?)\s+requested a quote/im)?.[1]?.trim()
    ?? null;
  const serviceHint = pickLabeledLine(body, "Which pests are you having problems with? Select all that apply.")
    ?? pickLabeledLine(body, "What type of pest control service do you need?");
  const details = pickLabeledLine(body, "Any details you'd like to add?");
  const locationHint = pickLabeledLine(body, "In what location do you need the service?");

  return Object.freeze({
    source: "yelp" as const,
    kind: accountNotice
      ? "account_notice" as const
      : reminder
        ? "lead_reminder" as const
        : directLead
          ? "direct_lead" as const
          : "promotion" as const,
    sourceMessageId: input.messageId,
    customerName,
    serviceHint,
    locationHint,
    details,
    urgency: reminder || /new lead on yelp/i.test(subject)
      ? "high" as const
      : directLead
        ? "normal" as const
        : "none" as const,
    payloadHash,
    receivedAt: new Date(input.receivedAt.getTime()),
  });
}

function parseNextdoor(input: MarketplaceEmailInput, payloadHash: string): ParsedMarketplaceEmail {
  const text = `${input.subject}\n${input.body}`;
  const promotion = /try opportunity alerts|set up your business|advertis|we miss you|get your business noticed/i.test(text);
  const recommendationSignal = /neighbor .* pest control pro|someone nearby needs a pest control pro/i.test(text);
  const line = input.body.match(/^([A-Z])\s*\n\s*([^\n]+?)\s+·\s+([^\n]+?)\s+·/m);
  const details = input.body.match(/[“"]([^”"]{20,})[”"]/m)?.[1]?.trim() ?? null;

  return Object.freeze({
    source: "nextdoor" as const,
    kind: recommendationSignal && !promotion
      ? "opportunity_signal" as const
      : promotion
        ? "promotion" as const
        : "unknown" as const,
    sourceMessageId: input.messageId,
    customerName: null,
    serviceHint: details ? "Pest control recommendation" : null,
    locationHint: line?.[3]?.trim() ?? null,
    details,
    urgency: recommendationSignal && !promotion ? "normal" as const : "none" as const,
    payloadHash,
    receivedAt: new Date(input.receivedAt.getTime()),
  });
}

export function parseMarketplaceEmail(input: MarketplaceEmailInput): ParsedMarketplaceEmail {
  const source = classifyMarketplaceSource(input.from);
  const payloadHash = hash([
    input.messageId,
    input.from.toLowerCase(),
    input.subject.trim(),
    input.body.trim(),
  ].join("\n"));

  if (source === "yelp") return parseYelp(input, payloadHash);
  if (source === "nextdoor") return parseNextdoor(input, payloadHash);

  return Object.freeze({
    source: "other" as const,
    kind: "unknown" as const,
    sourceMessageId: input.messageId,
    customerName: null,
    serviceHint: null,
    locationHint: null,
    details: null,
    urgency: "none" as const,
    payloadHash,
    receivedAt: new Date(input.receivedAt.getTime()),
  });
}
