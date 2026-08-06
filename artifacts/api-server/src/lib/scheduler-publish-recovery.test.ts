import { describe, expect, it } from "vitest";

import { reconcileSchedulerPublishException } from "./scheduler-publish-recovery";

const published = (platform: string, attemptNumber = 1) => ({
  platform,
  status: "published",
  attemptNumber,
  externalPostId: `${platform}-receipt-${attemptNumber}`,
  externalPostUrl: null,
  publishedAt: `2026-08-10T13:0${attemptNumber}:00.000Z`,
  updatedAt: `2026-08-10T13:0${attemptNumber}:00.000Z`,
});

describe("reconcileSchedulerPublishException", () => {
  it("recovers published when every expected platform has a verified receipt", () => {
    const recovery = reconcileSchedulerPublishException({
      expectedPlatforms: ["facebook", "google"],
      deliveries: [published("facebook"), published("google")],
      error: "aggregate update failed",
    });

    expect(recovery).toMatchObject({
      status: "published",
      verifiedPublished: 2,
      terminalFailures: 0,
      unresolved: 0,
      expectedPlatforms: 2,
    });
    expect(recovery.publishedAt?.toISOString()).toBe(
      "2026-08-10T13:01:00.000Z",
    );
  });

  it("preserves verified successes when another platform fails", () => {
    const recovery = reconcileSchedulerPublishException({
      expectedPlatforms: ["facebook", "google"],
      deliveries: [
        published("facebook"),
        {
          platform: "google",
          status: "failed",
          attemptNumber: 1,
          externalPostId: null,
          externalPostUrl: null,
          publishedAt: null,
          updatedAt: "2026-08-10T13:01:00.000Z",
        },
      ],
      error: "Bearer secret-token runtime failure",
    });

    expect(recovery).toMatchObject({
      status: "published_with_warning",
      verifiedPublished: 1,
      terminalFailures: 1,
      unresolved: 0,
    });
    expect(recovery.errorMessage).toContain("receipts were preserved");
    expect(recovery.errorMessage).toContain("[REDACTED]");
    expect(recovery.errorMessage).not.toContain("secret-token");
  });

  it("uses the latest attempt for each platform", () => {
    const recovery = reconcileSchedulerPublishException({
      expectedPlatforms: ["facebook"],
      deliveries: [
        {
          platform: "facebook",
          status: "failed",
          attemptNumber: 1,
          externalPostId: null,
          externalPostUrl: null,
          publishedAt: null,
          updatedAt: "2026-08-10T13:00:00.000Z",
        },
        published("facebook", 2),
      ],
      error: "late aggregate failure",
    });

    expect(recovery.status).toBe("published");
    expect(recovery.verifiedPublished).toBe(1);
    expect(recovery.terminalFailures).toBe(0);
  });

  it("fails closed when provider success has no external receipt", () => {
    const recovery = reconcileSchedulerPublishException({
      expectedPlatforms: ["facebook"],
      deliveries: [
        {
          platform: "facebook",
          status: "published",
          attemptNumber: 1,
          externalPostId: null,
          externalPostUrl: null,
          publishedAt: "2026-08-10T13:01:00.000Z",
          updatedAt: "2026-08-10T13:01:00.000Z",
        },
      ],
      error: "receipt missing",
    });

    expect(recovery).toMatchObject({
      status: "failed",
      verifiedPublished: 0,
      terminalFailures: 1,
      unresolved: 0,
    });
  });

  it("fails closed when the scheduler has no ledger evidence", () => {
    const recovery = reconcileSchedulerPublishException({
      expectedPlatforms: ["facebook"],
      deliveries: [],
      error: "network unavailable",
    });

    expect(recovery).toMatchObject({
      status: "failed",
      verifiedPublished: 0,
      terminalFailures: 0,
      unresolved: 1,
    });
  });

  it("does not let an unexpected platform make the expected set complete", () => {
    const recovery = reconcileSchedulerPublishException({
      expectedPlatforms: ["facebook", "google"],
      deliveries: [published("facebook"), published("instagram")],
      error: "unexpected adapter result",
    });

    expect(recovery).toMatchObject({
      status: "published_with_warning",
      verifiedPublished: 1,
      expectedPlatforms: 2,
      unresolved: 1,
    });
  });

  it("preserves receipts but never claims complete publication when scope is unknown", () => {
    const recovery = reconcileSchedulerPublishException({
      expectedPlatforms: [],
      deliveries: [published("facebook")],
      error: "platform JSON was unavailable",
    });

    expect(recovery).toMatchObject({
      status: "published_with_warning",
      verifiedPublished: 1,
      expectedPlatforms: 0,
      unresolved: 0,
    });
    expect(recovery.errorMessage).toContain("scope was unavailable");
  });

  it("treats malformed non-array platform scope as unknown", () => {
    const recovery = reconcileSchedulerPublishException({
      expectedPlatforms: { facebook: true },
      deliveries: [published("facebook")],
      error: "platform JSON was malformed",
    });

    expect(recovery).toMatchObject({
      status: "published_with_warning",
      verifiedPublished: 1,
      expectedPlatforms: 0,
    });
    expect(recovery.errorMessage).toContain("scope was unavailable");
  });

  it("uses the delivery update time when a verified receipt lacks publishedAt", () => {
    const recovery = reconcileSchedulerPublishException({
      expectedPlatforms: ["facebook"],
      deliveries: [
        {
          platform: "facebook",
          status: "published",
          attemptNumber: 1,
          externalPostId: "facebook-receipt",
          externalPostUrl: null,
          publishedAt: null,
          updatedAt: "2026-08-10T13:05:00.000Z",
        },
      ],
      error: "aggregate update failed",
    });

    expect(recovery.status).toBe("published");
    expect(recovery.publishedAt?.toISOString()).toBe(
      "2026-08-10T13:05:00.000Z",
    );
  });

  it("preserves warned provider receipts without upgrading to clean published", () => {
    const recovery = reconcileSchedulerPublishException({
      expectedPlatforms: ["facebook"],
      deliveries: [
        {
          platform: "facebook",
          status: "published_with_warning",
          attemptNumber: 1,
          externalPostId: "facebook-receipt",
          externalPostUrl: null,
          publishedAt: "2026-08-10T13:05:00.000Z",
          updatedAt: "2026-08-10T13:05:00.000Z",
        },
      ],
      error: "degraded provider result",
    });

    expect(recovery).toMatchObject({
      status: "published_with_warning",
      verifiedPublished: 1,
      terminalFailures: 0,
      unresolved: 0,
    });
  });
});
