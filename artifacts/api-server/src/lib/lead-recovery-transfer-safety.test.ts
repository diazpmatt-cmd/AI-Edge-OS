import { describe, expect, it } from "vitest";
import {
  assessTransferSafety,
  normalizeE164,
} from "./lead-recovery-transfer-safety.js";

describe("Lead Recovery transfer safety", () => {
  it("normalizes common US phone formats", () => {
    expect(normalizeE164("(251) 286-3200")).toBe("+12512863200");
    expect(normalizeE164("1-251-324-9090")).toBe("+12513249090");
    expect(normalizeE164("+12512863200")).toBe("+12512863200");
    expect(normalizeE164(" ")).toBe("");
  });

  it("blocks an unconfigured transfer destination", () => {
    expect(assessTransferSafety({
      transferPhone: "",
      telnyxAiNumber: "+12512863200",
    })).toMatchObject({
      status: "blocked",
      reason: "transfer_not_configured",
      configured: false,
    });
  });

  it("blocks transfer back to the Telnyx AI number", () => {
    expect(assessTransferSafety({
      transferPhone: "(251) 286-3200",
      telnyxAiNumber: "+12512863200",
    })).toMatchObject({
      status: "blocked",
      reason: "matches_telnyx_ai_number",
      sameAsTelnyxAiNumber: true,
    });
  });

  it("blocks the known legacy BB&B public-forwarding default", () => {
    expect(assessTransferSafety({
      transferPhone: "+12513249090",
      telnyxAiNumber: "+12512863200",
    })).toMatchObject({
      status: "blocked",
      reason: "matches_known_legacy_public_forwarding_number",
      knownLegacyUnsafeDefaultDetected: true,
    });
  });

  it("requires manual verification when no canonical public inbound number exists", () => {
    expect(assessTransferSafety({
      transferPhone: "+12515550123",
      telnyxAiNumber: "+12512863200",
    })).toMatchObject({
      status: "manual_verification_required",
      reason: "public_inbound_number_not_configured",
      knownLegacyUnsafeDefaultDetected: false,
    });
  });

  it("blocks a destination that matches the canonical public inbound number", () => {
    expect(assessTransferSafety({
      transferPhone: "+12515550123",
      telnyxAiNumber: "+12512863200",
      canonicalPublicInboundPhone: "+12515550123",
    })).toMatchObject({
      status: "blocked",
      reason: "matches_canonical_public_inbound_number",
      sameAsCanonicalPublicInbound: true,
    });
  });

  it("verifies a distinct transfer destination when the public inbound number is known", () => {
    expect(assessTransferSafety({
      transferPhone: "+12515550999",
      telnyxAiNumber: "+12512863200",
      canonicalPublicInboundPhone: "+12515550123",
    })).toMatchObject({
      status: "verified_non_looping",
      reason: "transfer_destination_distinct_from_public_inbound",
      sameAsTelnyxAiNumber: false,
      sameAsCanonicalPublicInbound: false,
    });
  });
});
