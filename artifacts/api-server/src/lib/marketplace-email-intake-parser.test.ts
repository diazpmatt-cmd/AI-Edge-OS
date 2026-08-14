import { describe, expect, it } from "vitest";
import {
  classifyMarketplaceSource,
  extractMarketplaceMailbox,
  parseMarketplaceEmail,
  type MarketplaceEmailInput,
} from "./marketplace-email-intake-parser";

const receivedAt = new Date("2026-08-13T18:00:00.000Z");

function input(overrides: Partial<MarketplaceEmailInput> = {}): MarketplaceEmailInput {
  return {
    messageId: "msg-001",
    from: "Yelp <lead@yelp.com>",
    subject: "New lead on Yelp",
    body: "Jamie requested a quote\nWhich pests are you having problems with? Select all that apply.\nBed bugs\nIn what location do you need the service?\nDaphne, AL\nAny details you'd like to add?\nBed bugs found on a couch in the guest room.",
    receivedAt,
    ...overrides,
  };
}

describe("marketplace email intake parser", () => {
  it("extracts and normalizes an address from a display-name mailbox", () => {
    expect(extractMarketplaceMailbox("Yelp Leads <LEAD@alerts.yelp.com>")).toBe("lead@alerts.yelp.com");
  });

  it.each([
    ["lead@yelp.com", "yelp"],
    ["lead@alerts.yelp.com", "yelp"],
    ["notify@nextdoor.com", "nextdoor"],
    ["notify@mail.nextdoor.com", "nextdoor"],
  ] as const)("classifies trusted provider domain %s", (from, expected) => {
    expect(classifyMarketplaceSource(from)).toBe(expected);
  });

  it.each([
    "lead@yelp.com.evil.example",
    "lead@notyelp.com",
    "notify@nextdoor.com.evil.example",
    "Yelp <attacker@example.com>",
  ])("rejects lookalike provider domain %s", (from) => {
    expect(classifyMarketplaceSource(from)).toBe("other");
  });

  it("parses a Yelp quote request as a direct lead with structured hints", () => {
    const parsed = parseMarketplaceEmail(input({ subject: "Message from Jamie for Pest Control" }));
    expect(parsed).toMatchObject({
      source: "yelp",
      kind: "direct_lead",
      customerName: "Jamie",
      serviceHint: "Bed bugs",
      locationHint: "Daphne, AL",
      details: "Bed bugs found on a couch in the guest room.",
      urgency: "normal",
    });
  });

  it("classifies a Yelp waited-days notification as a high-urgency reminder", () => {
    const parsed = parseMarketplaceEmail(input({
      subject: "Message from Jamie for Pest Control",
      body: "Jamie Has Waited 2 Days\nWhat type of pest control service do you need?\nBed bug treatment",
    }));
    expect(parsed.kind).toBe("lead_reminder");
    expect(parsed.urgency).toBe("high");
    expect(parsed.customerName).toBe("Jamie");
  });

  it("keeps Yelp security/account mail out of the customer-lead lane", () => {
    const parsed = parseMarketplaceEmail(input({
      subject: "Security verification for your Yelp account - New lead on Yelp",
    }));
    expect(parsed.kind).toBe("account_notice");
  });

  it("classifies a Nextdoor recommendation alert as an opportunity signal, never a direct lead", () => {
    const parsed = parseMarketplaceEmail(input({
      from: "Nextdoor <alerts@nextdoor.com>",
      subject: "A neighbor needs a pest control pro",
      body: "J\nJordan · Fairhope, AL · 2h\n\"Can anyone recommend a reliable pest control pro for an issue at my home?\"",
    }));
    expect(parsed.source).toBe("nextdoor");
    expect(parsed.kind).toBe("opportunity_signal");
    expect(parsed.kind).not.toBe("direct_lead");
    expect(parsed.customerName).toBeNull();
    expect(parsed.locationHint).toBe("Fairhope, AL");
  });

  it("lets a Nextdoor promotion classification override recommendation-like wording", () => {
    const parsed = parseMarketplaceEmail(input({
      from: "Nextdoor <alerts@nextdoor.com>",
      subject: "Try opportunity alerts",
      body: "Someone nearby needs a pest control pro. Advertise your business to neighbors.",
    }));
    expect(parsed.kind).toBe("promotion");
    expect(parsed.urgency).toBe("none");
  });

  it("keeps untrusted senders in the unknown lane", () => {
    const parsed = parseMarketplaceEmail(input({ from: "Lead Alert <lead@example.com>" }));
    expect(parsed).toMatchObject({ source: "other", kind: "unknown", urgency: "none" });
  });

  it("produces a deterministic idempotency hash for identical payloads", () => {
    const first = parseMarketplaceEmail(input());
    const second = parseMarketplaceEmail(input());
    expect(first.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.payloadHash).toBe(first.payloadHash);
  });

  it("changes the idempotency hash when meaningful payload content changes", () => {
    const first = parseMarketplaceEmail(input());
    const second = parseMarketplaceEmail(input({ body: `${input().body}\nAdditional customer detail` }));
    expect(second.payloadHash).not.toBe(first.payloadHash);
  });

  it("copies receivedAt instead of retaining a mutable Date reference", () => {
    const sourceDate = new Date(receivedAt);
    const parsed = parseMarketplaceEmail(input({ receivedAt: sourceDate }));
    expect(parsed.receivedAt).not.toBe(sourceDate);
    expect(parsed.receivedAt.toISOString()).toBe(sourceDate.toISOString());
  });
});
