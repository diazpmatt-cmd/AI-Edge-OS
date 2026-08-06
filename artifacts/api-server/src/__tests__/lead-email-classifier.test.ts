import { describe, expect, it } from "vitest";
import {
  classifyLeadEmail,
  classifySenderSource,
  extractMailboxAddress,
} from "../lib/lead-email-classifier.js";

const base = { messageId: "m1", receivedAt: new Date("2026-08-02T00:00:00Z") };

describe("lead email sender validation", () => {
  it("extracts the mailbox inside angle brackets", () => {
    expect(extractMailboxAddress("Yelp <reply+abc@messaging.yelp.com>")).toBe("reply+abc@messaging.yelp.com");
  });

  it("accepts reviewed Yelp and Nextdoor subdomains", () => {
    expect(classifySenderSource("Yelp <reply+abc@messaging.yelp.com>")).toBe("yelp");
    expect(classifySenderSource("Nextdoor <no-reply@rs.email.nextdoor.com>")).toBe("nextdoor");
  });

  it("rejects lookalike domains that merely contain a trusted name", () => {
    expect(classifySenderSource("Yelp <reply@yelp.com.attacker.test>")).toBe("other");
    expect(classifySenderSource("Nextdoor <notice@nextdoor.com.example.org>")).toBe("other");
  });

  it("does not trust a platform name in the display name", () => {
    expect(classifySenderSource("support@yelp.com <attacker@example.org>")).toBe("other");
    expect(classifySenderSource("Nextdoor Security <attacker@example.org>")).toBe("other");
  });
});

describe("classifyLeadEmail", () => {
  it("classifies a Yelp reminder as an urgent follow-up", () => {
    const result = classifyLeadEmail({
      ...base,
      from: "Yelp <reply+abc@messaging.yelp.com>",
      subject: "Message from Steve M. for Bed Bugs and Beyond",
      body: `Steve M. Has Waited 2 Days to Hear From You\n\nWhat type of pest control service do you need?\nExtermination\n\nWhich pests are you having problems with? Select all that apply.\nMice or rats\n\nAny details you'd like to add?\nHouse empty most of the time. Found mouse droppings.\n\nIn what location do you need the service?\n36561`,
    });
    expect(result.source).toBe("yelp");
    expect(result.kind).toBe("follow_up");
    expect(result.urgency).toBe("urgent");
    expect(result.customerName).toBe("Steve M.");
    expect(result.service).toBe("Mice or rats");
    expect(result.location).toBe("36561");
  });

  it("classifies a new Yelp lead and extracts the customer", () => {
    const result = classifyLeadEmail({
      ...base,
      messageId: "m2",
      from: "Yelp <reply+lead@messaging.yelp.com>",
      subject: "New lead on Yelp",
      body: `Maria R. requested a quote\n\nWhat type of pest control service do you need?\nBed bug treatment\n\nIn what location do you need the service?\nFoley, AL 36535`,
    });
    expect(result.source).toBe("yelp");
    expect(result.kind).toBe("lead");
    expect(result.urgency).toBe("urgent");
    expect(result.customerName).toBe("Maria R.");
    expect(result.service).toBe("Bed bug treatment");
    expect(result.location).toBe("Foley, AL 36535");
  });

  it("classifies a Yelp security email as an account notice, not a lead", () => {
    const result = classifyLeadEmail({
      ...base,
      messageId: "m3",
      from: "Yelp <no-reply@account.yelp.com>",
      subject: "Security alert for your Yelp account",
      body: "A new sign-in was detected.",
    });
    expect(result.source).toBe("yelp");
    expect(result.kind).toBe("account_notice");
    expect(result.urgency).toBe("none");
  });

  it("classifies a genuine Nextdoor opportunity separately from an upsell", () => {
    const result = classifyLeadEmail({
      ...base,
      messageId: "m4",
      from: "Nextdoor <no-reply@rs.email.nextdoor.com>",
      subject: "A neighbor asked for a pest control pro",
      body: `Someone nearby needs a pest control pro.\n\nC\nChasity F. · Milton, FL · 1 day ago\n\n“Looking for recommendations for pest control services near Milton.”`,
    });
    expect(result.source).toBe("nextdoor");
    expect(result.kind).toBe("lead");
    expect(result.urgency).toBe("urgent");
    expect(result.customerName).toBe("Chasity F.");
    expect(result.location).toBe("Milton, FL");
  });

  it("does not mistake a Nextdoor Opportunity Alerts upsell for a direct lead", () => {
    const result = classifyLeadEmail({
      ...base,
      from: "Nextdoor <no-reply@rs.email.nextdoor.com>",
      subject: "A neighbor just asked for a pest control pro",
      body: `Someone nearby needs a pest control pro right now.\nJobs fill within hours. Opportunity Alerts texts you the second a neighbor posts.\n\nC\n\nChasity F. · Milton, FL · 1 day ago\n\n“Looking for recommendations for pest control services.”\n\nTry Opportunity Alerts`,
    });
    expect(result.source).toBe("nextdoor");
    expect(result.kind).toBe("promotion");
    expect(result.urgency).toBe("none");
  });

  it("treats a spoofed Yelp sender as unrelated mail", () => {
    const result = classifyLeadEmail({
      ...base,
      messageId: "m5",
      from: "Yelp <reply@yelp.com.attacker.test>",
      subject: "New lead on Yelp",
      body: "Victim requested a quote",
    });
    expect(result.source).toBe("other");
    expect(result.kind).toBe("unknown");
  });

  it("classifies unrelated mail as unknown", () => {
    const result = classifyLeadEmail({ ...base, from: "person@example.com", subject: "Hello", body: "Hi" });
    expect(result.source).toBe("other");
    expect(result.kind).toBe("unknown");
  });
});
