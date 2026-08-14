import { describe, expect, it, vi } from "vitest";
import { ingestMarketplaceMailboxMessage, marketplaceLeadSourceIdentity } from "./marketplace-email-ingestion.js";
import { parseMarketplaceEmail } from "./marketplace-email-intake-parser.js";

const tenant = Object.freeze({ clientId: "11111111-1111-4111-8111-111111111111", clientName: "Example Pest Co" });
const receivedAt = new Date("2026-08-14T12:00:00Z");

function yelpMessage(messageId: string, threadId = "thread-abc") {
  return {
    messageId,
    threadId,
    from: "Yelp <reply+abc@messaging.yelp.com>",
    subject: "Message from Maria R. for Example Pest Co",
    body: [
      "Maria R. Has Waited 2 Days to Hear From You",
      "Which pests are you having problems with? Select all that apply.",
      "Cockroaches",
      "In what location do you need the service?",
      "Foley, AL 36535",
      "Any details you'd like to add?",
      "Kitchen activity at night.",
    ].join("\n"),
    receivedAt,
  };
}

describe("marketplace email ingestion", () => {
  it("uses trusted tenant identity rather than message content", async () => {
    const intake = vi.fn(async input => ({ lead: { id: "lead-1", ...input } as any, created: true }));
    const outcome = await ingestMarketplaceMailboxMessage({ tenant, message: yelpMessage("m1"), intake });
    expect(outcome.kind).toBe("lead");
    expect(intake).toHaveBeenCalledTimes(1);
    expect(intake.mock.calls[0][0]).toMatchObject({
      clientId: tenant.clientId,
      clientName: tenant.clientName,
      source: "gmail_yelp",
    });
  });

  it("uses Gmail thread identity so an original lead and reminder do not create separate source identities", () => {
    const a = yelpMessage("message-original", "thread-shared");
    const b = yelpMessage("message-reminder", "thread-shared");
    const parsedA = parseMarketplaceEmail({ ...a, messageId: a.messageId });
    const parsedB = parseMarketplaceEmail({ ...b, messageId: b.messageId });
    expect(marketplaceLeadSourceIdentity(a, parsedA)).toBe("gmail:yelp:thread:thread-shared");
    expect(marketplaceLeadSourceIdentity(b, parsedB)).toBe("gmail:yelp:thread:thread-shared");
  });

  it("uses a stable semantic fallback when Gmail thread identity is unavailable", () => {
    const a = yelpMessage("message-a", "");
    const b = yelpMessage("message-b", "");
    const parsedA = parseMarketplaceEmail({ ...a, messageId: a.messageId });
    const parsedB = parseMarketplaceEmail({ ...b, messageId: b.messageId });
    expect(marketplaceLeadSourceIdentity(a, parsedA)).toBe(marketplaceLeadSourceIdentity(b, parsedB));
    expect(marketplaceLeadSourceIdentity(a, parsedA)).toContain("gmail:yelp:semantic:");
  });

  it("keeps Nextdoor recommendation alerts out of the direct-lead inbox", async () => {
    const intake = vi.fn();
    const outcome = await ingestMarketplaceMailboxMessage({
      tenant,
      intake,
      message: {
        messageId: "n1",
        threadId: "nt1",
        from: "Nextdoor <no-reply@rs.email.nextdoor.com>",
        subject: "A neighbor asked for a pest control pro",
        body: "Someone nearby needs a pest control pro.\nC\nChasity F. · Foley, AL · 1 day ago\n\n\"Looking for recommendations for pest control services near Foley.\"",
        receivedAt,
      },
    });
    expect(outcome.kind).toBe("opportunity_signal");
    expect(intake).not.toHaveBeenCalled();
  });

  it("ignores spoofed marketplace mail without creating a lead", async () => {
    const intake = vi.fn();
    const outcome = await ingestMarketplaceMailboxMessage({
      tenant,
      intake,
      message: {
        ...yelpMessage("spoof"),
        from: "Yelp <reply@yelp.com.attacker.test>",
      },
    });
    expect(outcome.kind).toBe("ignored");
    expect(intake).not.toHaveBeenCalled();
  });

  it("fails before intake when trusted tenant identity is missing", async () => {
    const intake = vi.fn();
    await expect(ingestMarketplaceMailboxMessage({
      tenant: { clientId: "", clientName: "" },
      intake,
      message: yelpMessage("m2"),
    })).rejects.toThrow("trusted marketplace tenant identity is required");
    expect(intake).not.toHaveBeenCalled();
  });
});
