import { describe, expect, it } from "vitest";
import { isDeliveryEvent, isOptOutText, needsFollowUp, normalizeDeliveryStatus } from "../services/lead-delivery";

describe("Lead Intelligence delivery lifecycle", () => {
  it("normalizes Telnyx delivery events", () => {
    expect(isDeliveryEvent("message.delivered")).toBe(true);
    expect(isDeliveryEvent("message.received")).toBe(false);
    expect(normalizeDeliveryStatus("message.delivered", {})).toBe("delivered");
    expect(normalizeDeliveryStatus("message.finalized", { to: [{ status: "delivery_failed" }] })).toBe("delivery_failed");
  });

  it("recognizes standard SMS opt-out keywords", () => {
    expect(isOptOutText("STOP")).toBe(true);
    expect(isOptOutText(" unsubscribe ")).toBe(true);
    expect(isOptOutText("please stop texting me")).toBe(false);
    expect(isOptOutText("Yes, please call me")).toBe(false);
  });

  it("flags sent leads after 24 hours without a reply", () => {
    const now = new Date("2026-08-04T12:00:00.000Z");
    expect(needsFollowUp({
      responseStatus: "sent",
      lastFollowUpAt: new Date("2026-08-03T11:59:59.000Z"),
      outcome: "sms_delivered:msg-1",
    }, now)).toBe(true);
  });

  it("suppresses follow-up after reply or opt-out", () => {
    const now = new Date("2026-08-04T12:00:00.000Z");
    const sentAt = new Date("2026-08-01T12:00:00.000Z");
    expect(needsFollowUp({ responseStatus: "replied", lastFollowUpAt: sentAt, outcome: "sms_replied:in-1" }, now)).toBe(false);
    expect(needsFollowUp({ responseStatus: "opted_out", lastFollowUpAt: sentAt, outcome: "sms_opted_out" }, now)).toBe(false);
  });
});
