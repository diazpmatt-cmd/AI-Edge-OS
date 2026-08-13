import { describe, expect, it } from "vitest";
import { resolvePublicInboundEvidence } from "./lead-recovery-public-phone-evidence.js";

describe("Lead Recovery public inbound evidence", () => {
  it("normalizes a valid tenant local-presence phone as collision-only evidence", () => {
    expect(resolvePublicInboundEvidence("(251) 324-9090")).toEqual({
      phone: "+12513249090",
      source: "local_presence_profile_configured",
      available: true,
      phoneSpecificProvenanceVerified: false,
      usableForCollisionDetection: true,
      usableForNonLoopVerification: false,
    });
  });

  it("returns no evidence for a missing phone instead of falling back to BB&B", () => {
    expect(resolvePublicInboundEvidence(null)).toEqual({
      phone: null,
      source: null,
      available: false,
      phoneSpecificProvenanceVerified: false,
      usableForCollisionDetection: false,
      usableForNonLoopVerification: false,
    });
  });

  it("rejects malformed phone evidence", () => {
    expect(resolvePublicInboundEvidence("12345")).toEqual({
      phone: null,
      source: null,
      available: false,
      phoneSpecificProvenanceVerified: false,
      usableForCollisionDetection: false,
      usableForNonLoopVerification: false,
    });
  });
});
