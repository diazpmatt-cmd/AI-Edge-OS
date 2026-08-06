import { describe, expect, it } from "vitest";

import {
  buildScheduledPreflightFailureMessage,
  isEarlyCanonicalPublishRejection,
} from "./publishing-preflight-policy";

describe("isEarlyCanonicalPublishRejection", () => {
  it("recognizes a failure returned before delivery rows exist", () => {
    expect(
      isEarlyCanonicalPublishRejection({
        postStatus: "failed",
        published: 0,
        failed: 1,
        skipped: 0,
        deliveries: [],
        summary: "Content blocked by claims policy",
      }),
    ).toBe(true);
  });

  it("does not collapse a platform delivery failure into preflight", () => {
    expect(
      isEarlyCanonicalPublishRejection({
        postStatus: "failed",
        published: 0,
        failed: 1,
        skipped: 0,
        deliveries: [{ platform: "facebook", status: "failed" }],
        summary: "Facebook requires attention",
      }),
    ).toBe(false);
  });

  it("does not classify successful or partial external delivery", () => {
    expect(
      isEarlyCanonicalPublishRejection({
        postStatus: "published",
        published: 1,
        failed: 0,
        skipped: 0,
        deliveries: [{ platform: "facebook", status: "published" }],
        summary: "1 of 1 published successfully",
      }),
    ).toBe(false);

    expect(
      isEarlyCanonicalPublishRejection({
        postStatus: "published_with_warning",
        published: 1,
        failed: 1,
        skipped: 0,
        deliveries: [
          { platform: "facebook", status: "published" },
          { platform: "google", status: "failed" },
        ],
        summary: "1 of 2 published successfully. 1 failed.",
      }),
    ).toBe(false);
  });
});

describe("buildScheduledPreflightFailureMessage", () => {
  it("returns a bounded operator diagnostic", () => {
    const message = buildScheduledPreflightFailureMessage("x".repeat(700));

    expect(message).toContain("Scheduler stopped terminal preflight retries");
    expect(message.length).toBeLessThanOrEqual(500);
  });

  it("uses a safe fallback for an empty summary", () => {
    expect(buildScheduledPreflightFailureMessage(" ")).toContain(
      "before platform delivery began",
    );
  });
});
