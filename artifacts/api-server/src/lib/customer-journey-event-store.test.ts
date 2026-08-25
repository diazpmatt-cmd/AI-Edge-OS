import { describe, expect, it } from "vitest";
import { journeyEventIdentityKey } from "./customer-journey-event-store.js";

describe("journeyEventIdentityKey", () => {
  const base = { eventType: "missed_call_observed", source: "telnyx", canonicalRecordType: "telnyx_call", canonicalRecordId: " call-1 " } as const;

  it("is stable for provider replay", () => {
    expect(journeyEventIdentityKey({ clientId: "tenant-a", ...base })).toBe(journeyEventIdentityKey({ clientId: "tenant-a", ...base, canonicalRecordId: "call-1" }));
  });

  it("cannot deduplicate across tenants", () => {
    expect(journeyEventIdentityKey({ clientId: "tenant-a", ...base })).not.toBe(journeyEventIdentityKey({ clientId: "tenant-b", ...base }));
  });
});
