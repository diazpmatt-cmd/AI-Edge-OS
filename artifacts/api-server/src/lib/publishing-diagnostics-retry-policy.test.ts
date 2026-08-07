import { describe, expect, it } from "vitest";

import { applyPublishingDiagnosticsRetryPolicy } from "./publishing-diagnostics-retry-policy.js";
import type { PublishingLaneDiagnostic } from "./publishing-unresolved-diagnostics.js";

function lane(overrides: Partial<PublishingLaneDiagnostic> = {}): PublishingLaneDiagnostic {
  return {
    platform: "facebook",
    state: "terminal_failure",
    attemptNumber: 1,
    status: "failed",
    receiptVerified: false,
    retryAllowed: true,
    diagnosticCode: "PUBLISHING_TERMINAL_FAILURE",
    message: "Provider failed.",
    updatedAt: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("applyPublishingDiagnosticsRetryPolicy", () => {
  it("preserves retry eligibility for an isolated single-platform source", () => {
    const original = lane();
    const result = applyPublishingDiagnosticsRetryPolicy({
      expectedPlatforms: ["facebook"],
      lanes: [original],
    });

    expect(result[0]).toBe(original);
    expect(result[0].retryAllowed).toBe(true);
  });

  it("disables retry for a failed lane on a multi-platform source", () => {
    const result = applyPublishingDiagnosticsRetryPolicy({
      expectedPlatforms: ["facebook", "instagram"],
      lanes: [lane()],
    });

    expect(result[0].retryAllowed).toBe(false);
    expect(result[0].message).toContain("multi-platform source post");
  });

  it("does not alter verified or already non-retryable lanes", () => {
    const verified = lane({
      state: "verified_published",
      status: "published",
      receiptVerified: true,
      retryAllowed: false,
    });
    const cancelled = lane({ retryAllowed: false, status: "cancelled" });

    const result = applyPublishingDiagnosticsRetryPolicy({
      expectedPlatforms: ["facebook", "instagram"],
      lanes: [verified, cancelled],
    });

    expect(result[0]).toBe(verified);
    expect(result[1]).toBe(cancelled);
  });
});
