import { describe, expect, it } from "vitest";
import { classifyLeadEmail } from "../lib/lead-email-classifier.js";

const base = { messageId: "m1", receivedAt: new Date("2026-08-02T00:00:00Z") };

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

  it("classifies unrelated mail as unknown", () => {
    const result = classifyLeadEmail({ ...base, from: "person@example.com", subject: "Hello", body: "Hi" });
    expect(result.source).toBe("other");
    expect(result.kind).toBe("unknown");
  });
});
