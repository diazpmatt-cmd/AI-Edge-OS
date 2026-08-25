import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeE164 } from "../lib/communication-endpoint-identity";
import { journeyIdentityKey, normalizeJourneyEmail, normalizeJourneyPhone } from "../../../../lib/db/src/customer-journey";

const telnyxRoute = fs.readFileSync(new URL("../routes/telnyx.ts", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../lib/schema-migrate.ts", import.meta.url), "utf8");

describe("tenant-owned communications foundation", () => {
  it("normalizes supported US destinations", () => {
    expect(normalizeE164("(251) 286-3200")).toBe("+12512863200");
    expect(normalizeE164("123")).toBeNull();
  });
  it("keeps journey identity inside the tenant", () => {
    expect(normalizeJourneyPhone("251-324-9090")).toBe("+12513249090");
    expect(normalizeJourneyEmail(" Owner@Example.com ")).toBe("owner@example.com");
    expect(journeyIdentityKey("tenant-a", "251-324-9090")).toBe("tenant-a:phone:+12513249090");
  });
  it("resolves Telnyx destinations before production writes", () => {
    expect(telnyxRoute).toContain('resolveCommunicationEndpoint("telnyx", to)');
    expect(telnyxRoute).toContain("hasRecentTextBack(from, endpoint.clientId)");
    expect(telnyxRoute).toContain("sendTextBack(from, endpoint.e164Number, textBackMessage)");
    expect(telnyxRoute).toContain('eventType: "missed_call_observed"');
    expect(telnyxRoute).toContain('eventType: "recovery_text_accepted"');
    expect(telnyxRoute).toContain('eventType: "recovery_text_delivered"');
    expect(telnyxRoute).toContain('deliveryStatus === "delivered"');
    expect(telnyxRoute).toContain('eventType: "customer_reply_observed"');
    expect(telnyxRoute).toContain("parentCallId: canonicalCallId");
    expect(telnyxRoute).toContain("parentMessageId: null");
    expect(telnyxRoute).toContain('businessName:       "the business"');
    expect(telnyxRoute).toContain("process.env.NODE_ENV === \"production\"");
  });
  it("adds idempotent tenant ownership schema", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS communication_endpoints");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS customer_journey_events");
    expect(migration).toContain("ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_id UUID");
  });
});
