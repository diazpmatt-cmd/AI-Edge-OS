import { describe, expect, it } from "vitest";

import {
  diagnosePublishingLanes,
  selectLatestPublishingAttempts,
  selectLatestVerifiedPublishingReceipts,
  summarizePublishingDiagnostics,
} from "./publishing-unresolved-diagnostics";

const row = (
  platform: string,
  status: string,
  attemptNumber: number,
  options: Partial<{
    id: string;
    externalPostId: string | null;
    externalPostUrl: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    retryAllowed: boolean | null;
    updatedAt: string;
  }> = {},
) => ({
  id: options.id ?? `${platform}-${attemptNumber}`,
  platform,
  status,
  attemptNumber,
  externalPostId: options.externalPostId ?? null,
  externalPostUrl: options.externalPostUrl ?? null,
  errorCode: options.errorCode ?? null,
  errorMessage: options.errorMessage ?? null,
  retryAllowed: options.retryAllowed ?? true,
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

  it("tracks durable historical receipts independently from the latest attempt", () => {
    const verified = selectLatestVerifiedPublishingReceipts([
      row("facebook", "published", 1, { externalPostId: "fb-1" }),
      row("facebook", "failed", 2),
      row("google", "published", 1),
    ]);
    expect(verified.get("facebook")?.attemptNumber).toBe(1);
    expect(verified.has("google")).toBe(false);
  });

  it("distinguishes verified, failed, missing-receipt, in-flight, and missing lanes", () => {
    const lanes = diagnosePublishingLanes({
      expectedPlatforms: ["facebook", "google", "youtube", "instagram", "tiktok"],
      deliveries: [
        row("facebook", "published", 1, { externalPostId: "fb-1" }),
        row("google", "failed", 1, { id: "google-failed-1", errorCode: "GBP_FAILED", errorMessage: "Google failed" }),
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
    expect(lanes[1].deliveryId).toBe("google-failed-1");
    expect(lanes[4].deliveryId).toBeNull();
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

  it("treats any historical verified receipt as authoritative after a later failure", () => {
    const [lane] = diagnosePublishingLanes({
      expectedPlatforms: ["facebook"],
      deliveries: [
        row("facebook", "published", 1, {
          id: "facebook-published-1",
          externalPostId: "fb-existing",
        }),
        row("facebook", "failed", 2, {
          id: "facebook-failed-2",
          errorMessage: "Later replay attempt failed",
        }),
      ],
    });

    expect(lane).toMatchObject({
      deliveryId: "facebook-published-1",
      state: "verified_published",
      receiptVerified: true,
      retryAllowed: false,
      attemptNumber: 1,
      diagnosticCode: "PUBLISHING_RECEIPT_VERIFIED",
    });
  });

  it("honors a persisted non-retryable terminal delivery", () => {
    const [lane] = diagnosePublishingLanes({
      expectedPlatforms: ["google"],
      deliveries: [
        row("google", "failed", 1, {
          retryAllowed: false,
          errorMessage: "Manual review required",
        }),
      ],
    });

    expect(lane).toMatchObject({
      state: "terminal_failure",
      status: "failed",
      receiptVerified: false,
      retryAllowed: false,
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
