import { describe, expect, it } from "vitest";
import {
  nextAuthorityAcquisitionProofVerification,
  validateAuthorityAcquisitionProofExpectedVersion,
  validateAuthorityAcquisitionProofInput,
  verificationAfterAuthorityAcquisitionProofEdit,
} from "./authority-acquisition-proof-lifecycle.js";

describe("Authority acquisition proof policy", () => {
  it("requires a supported proof type and HTTP(S) source URL", () => {
    expect(() => validateAuthorityAcquisitionProofInput({
      proofType: "magic",
      sourceUrl: "https://example.org/proof",
    })).toThrow("proof_type_invalid");
    expect(() => validateAuthorityAcquisitionProofInput({
      proofType: "backlink_live",
      sourceUrl: "javascript:alert(1)",
    })).toThrow("source_url_invalid");
  });

  it("accepts a live backlink proof with optional target URL", () => {
    expect(validateAuthorityAcquisitionProofInput({
      proofType: "backlink_live",
      sourceUrl: "https://publisher.example/article",
      targetUrl: "https://client.example/service",
      notes: "Link is visible in article body.",
    })).toMatchObject({
      proofType: "backlink_live",
      sourceUrl: "https://publisher.example/article",
      targetUrl: "https://client.example/service",
    });
  });

  it("requires positive expected versions", () => {
    expect(validateAuthorityAcquisitionProofExpectedVersion(2)).toBe(2);
    expect(() => validateAuthorityAcquisitionProofExpectedVersion(0)).toThrow("expected_version_required");
  });

  it("requires invalid proofs to be explicitly reopened", () => {
    expect(nextAuthorityAcquisitionProofVerification("invalidate", "human_verified")).toBe("invalid");
    expect(() => nextAuthorityAcquisitionProofVerification("verify", "invalid")).toThrow("invalid_must_reopen");
    expect(nextAuthorityAcquisitionProofVerification("reopen", "invalid")).toBe("unverified");
  });

  it("resets verification after edits and blocks edits while invalid", () => {
    expect(verificationAfterAuthorityAcquisitionProofEdit("human_verified")).toBe("unverified");
    expect(() => verificationAfterAuthorityAcquisitionProofEdit("invalid")).toThrow("invalid_must_reopen");
  });
});
