import { describe, expect, it } from "vitest";

import {
  diagnosePublishingLanes,
  selectLatestPublishingAttempts,
  summarizePublishingDiagnostics,
} from "./publishing-unresolved-diagnostics";

const row = (
  platform: string,
  status: string,
  attemptNumber: number,
  options: Partial<{
    externalPostId: string | null;
    externalPostUrl: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    updatedAt: string;
  }> = {},
) => ({
  platform,
  status,
  attemptNumber,
  externalPostId: options.externalPostId ?? null,
  externalPostUrl: options.externalPostUrl ?? null,
  errorCode: options.errorCode ?? null,
  errorMessage: options.errorMessage ?? null,
  updatedAt: options.updatedAt ?? "2026-08-07T00:00:00.000Z",
});

describe("publishing unresolved diagnostics", () => {
  it("uses the latest attempt independently per platform", () => {
    const latest = selectLatestPublishingAttempts([
      row("facebook", "failed", 1),
      row("facebook", "published", 2, { externalPostId: "fb-2" }),
      row("google", "publishing", 1),
    ]);
    expect(latest.get("facebook")?.attemptNumber).toBe(2);
    expect(latest.get("google")?.status).toBe("publishing");
  });

  it("distinguishes verified, failed, missing-receipt, in-flight, and missing lanes", () => {
    const lanes = diagnosePublishingLanes({
      expectedPlatforms: ["facebook", "google", "youtube", "instagram", "tiktok"],
      deliveries: [
        row("facebook", "published", 1, { externalPostId: "fb-1" }),
        row("google", "failed", 1, { errorCode: "GBP_FAILED", errorMessage: "Google failed" }),
        row("youtube", "published", 1),
        row("instagram", "publishing", 1),
      ],
    });
    expect(lanes.map((lane) => lane.state)).toEqual([
      "verified_published",
      "terminal_failure",
      "receipt_missing",
      "in_flight",
      "missing_attempt",
    ]);
    expect(summarizePublishingDiagnostics(lanes)).toEqual({
      total: 5,
      verified: 1,
      terminalFailures: 1,
      receiptMissing: 1,
      inFlight: 1,
      missingAttempts: 1,
      unresolved: 3,
    });
  });

  it("redacts secrets from provider diagnostics", () => {
    const [lane] = diagnosePublishingLanes({
      expectedPlatforms: ["facebook"],
      deliveries: [
        row("facebook", "failed", 1, {
          errorMessage: "Bearer super-secret-token failed",
        }),
      ],
    });
    expect(lane.message).toContain("[REDACTED]");
    expect(lane.message).not.toContain("super-secret-token");
  });
});
