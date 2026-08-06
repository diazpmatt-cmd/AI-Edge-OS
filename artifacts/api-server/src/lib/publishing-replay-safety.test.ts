import { describe, expect, it } from "vitest";

import { evaluateFullReplayReceiptGuard } from "./publishing-replay-safety";

const receipt = (platform: string, publishedAt: string) => ({
  platform,
  status: "published",
  externalPostId: `${platform}-external-id`,
  externalPostUrl: null,
  publishedAt,
  updatedAt: publishedAt,
});

describe("evaluateFullReplayReceiptGuard", () => {
  it("allows a first publish when no verified receipt exists", () => {
    expect(
      evaluateFullReplayReceiptGuard({
        platforms: ["facebook", "google"],
        deliveries: [
          {
            platform: "facebook",
            status: "failed",
            externalPostId: null,
            externalPostUrl: null,
            publishedAt: null,
            updatedAt: "2026-08-10T13:00:00.000Z",
          },
        ],
      }),
    ).toMatchObject({
      blocked: false,
      postStatus: null,
      verifiedCount: 0,
      totalPlatforms: 2,
    });
  });

  it("blocks a full replay when one platform already succeeded", () => {
    const guard = evaluateFullReplayReceiptGuard({
      platforms: ["facebook", "google"],
      deliveries: [receipt("facebook", "2026-08-10T13:01:00.000Z")],
    });

    expect(guard).toMatchObject({
      blocked: true,
      postStatus: "published_with_warning",
      verifiedPlatforms: ["facebook"],
      verifiedCount: 1,
      totalPlatforms: 2,
    });
    expect(guard.message).toContain("isolated failed delivery");
  });

  it("repairs aggregate published when every platform has a receipt", () => {
    const guard = evaluateFullReplayReceiptGuard({
      platforms: ["facebook", "google"],
      deliveries: [
        receipt("facebook", "2026-08-10T13:01:00.000Z"),
        receipt("google", "2026-08-10T13:02:00.000Z"),
      ],
    });

    expect(guard).toMatchObject({
      blocked: true,
      postStatus: "published",
      verifiedCount: 2,
      totalPlatforms: 2,
    });
    expect(guard.publishedAt?.toISOString()).toBe(
      "2026-08-10T13:02:00.000Z",
    );
  });

  it("uses historical verified receipts even if a later attempt failed", () => {
    const guard = evaluateFullReplayReceiptGuard({
      platforms: ["facebook"],
      deliveries: [
        receipt("facebook", "2026-08-10T13:01:00.000Z"),
        {
          platform: "facebook",
          status: "failed",
          externalPostId: null,
          externalPostUrl: null,
          publishedAt: null,
          updatedAt: "2026-08-10T13:05:00.000Z",
        },
      ],
    });

    expect(guard).toMatchObject({
      blocked: true,
      postStatus: "published",
      verifiedCount: 1,
    });
  });

  it("ignores receipt evidence for unrequested platforms", () => {
    expect(
      evaluateFullReplayReceiptGuard({
        platforms: ["google"],
        deliveries: [receipt("facebook", "2026-08-10T13:01:00.000Z")],
      }),
    ).toMatchObject({ blocked: false, verifiedCount: 0 });
  });

  it("does not trust a receipt-less published row", () => {
    expect(
      evaluateFullReplayReceiptGuard({
        platforms: ["facebook"],
        deliveries: [
          {
            platform: "facebook",
            status: "published",
            externalPostId: null,
            externalPostUrl: null,
            publishedAt: "2026-08-10T13:01:00.000Z",
            updatedAt: "2026-08-10T13:01:00.000Z",
          },
        ],
      }),
    ).toMatchObject({ blocked: false, verifiedCount: 0 });
  });
});
