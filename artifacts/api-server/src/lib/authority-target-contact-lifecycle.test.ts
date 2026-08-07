import { describe, expect, it } from "vitest";
import {
  nextAuthorityTargetContactVerification,
  validateAuthorityTargetContactExpectedVersion,
  validateAuthorityTargetContactInput,
  verificationAfterAuthorityTargetContactEdit,
} from "./authority-target-contact-lifecycle.js";

describe("Authority target contact policy", () => {
  it("requires an organization, bounded contact method, and at least one contact path", () => {
    expect(() => validateAuthorityTargetContactInput({
      organizationName: "",
      contactMethod: "email",
      email: "team@example.com",
    })).toThrow("organization_name_required");

    expect(() => validateAuthorityTargetContactInput({
      organizationName: "Publisher",
      contactMethod: "carrier_pigeon",
      email: "team@example.com",
    })).toThrow("contact_method_invalid");

    expect(() => validateAuthorityTargetContactInput({
      organizationName: "Publisher",
      contactMethod: "other",
    })).toThrow("contact_path_required");
  });

  it("accepts an organization contact form without requiring personal email", () => {
    expect(validateAuthorityTargetContactInput({
      organizationName: "Local Chamber",
      contactMethod: "contact_form",
      contactUrl: "https://example.org/contact",
      sourceUrl: "https://example.org/about",
    })).toMatchObject({
      organizationName: "Local Chamber",
      email: null,
      contactUrl: "https://example.org/contact",
    });
  });

  it("allows only http/https provenance and contact URLs", () => {
    expect(() => validateAuthorityTargetContactInput({
      organizationName: "Publisher",
      contactMethod: "contact_form",
      contactUrl: "javascript:alert(1)",
    })).toThrow("contact_url_invalid");
  });

  it("requires a positive integer expected version", () => {
    expect(validateAuthorityTargetContactExpectedVersion(2)).toBe(2);
    expect(() => validateAuthorityTargetContactExpectedVersion("2")).toThrow("expected_version_required");
    expect(() => validateAuthorityTargetContactExpectedVersion(0)).toThrow("expected_version_required");
  });

  it("requires source provenance before human verification", () => {
    expect(() => nextAuthorityTargetContactVerification("verify", "unverified", null))
      .toThrow("verification_source_required");
    expect(nextAuthorityTargetContactVerification("verify", "unverified", "https://example.org/staff"))
      .toBe("human_verified");
  });

  it("editing a human-verified contact requires fresh verification", () => {
    expect(verificationAfterAuthorityTargetContactEdit("unverified")).toBe("unverified");
    expect(verificationAfterAuthorityTargetContactEdit("human_verified")).toBe("unverified");
    expect(() => verificationAfterAuthorityTargetContactEdit("invalid")).toThrow("invalid_must_reopen");
  });

  it("preserves invalid contacts until a human explicitly reopens them", () => {
    expect(nextAuthorityTargetContactVerification("invalidate", "human_verified", "https://example.org/staff"))
      .toBe("invalid");
    expect(() => nextAuthorityTargetContactVerification("verify", "invalid", "https://example.org/staff"))
      .toThrow("invalid_must_reopen");
    expect(nextAuthorityTargetContactVerification("reopen", "invalid", "https://example.org/staff"))
      .toBe("unverified");
  });
});
