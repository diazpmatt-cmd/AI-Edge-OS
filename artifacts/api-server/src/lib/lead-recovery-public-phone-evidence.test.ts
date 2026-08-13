import { describe, expect, it } from "vitest";
import { resolvePublicInboundEvidence } from "./lead-recovery-public-phone-evidence.js";

describe("Lead Recovery public inbound evidence", () => {
  it("normalizes a valid tenant local-presence phone", () => {
    expect(resolvePublicInboundEvidence("(251) 324-9090")).toEqual({
      phone: "+12513249090",
      source: "local_presence_profile",
      available: true,
    });
  });

  it("returns no evidence for a missing phone instead of falling back to BB&B", () => {
    expect(resolvePublicInboundEvidence(null)).toEqual({
      phone: null,
      source: null,
      available: false,
    });
  });

  it("rejects malformed phone evidence", () => {
    expect(resolvePublicInboundEvidence("12345")).toEqual({
      phone: null,
      source: null,
      available: false,
    });
  });
});
