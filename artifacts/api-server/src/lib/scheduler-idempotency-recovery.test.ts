import { describe, expect, it } from "vitest";

import { reconcileSchedulerPublishException } from "./scheduler-publish-recovery";

describe("scheduler idempotency receipt recovery", () => {
  it("treats an idempotency hit with external evidence as verified publication", () => {
    const recovery = reconcileSchedulerPublishException({
      expectedPlatforms: ["facebook"],
      deliveries: [
        {
          platform: "facebook",
          status: "idempotency_hit",
          attemptNumber: 2,
          externalPostId: "facebook-existing-post",
          externalPostUrl: null,
          publishedAt: "2026-08-10T13:05:00.000Z",
          updatedAt: "2026-08-10T13:05:00.000Z",
        },
      ],
      error: "aggregate update failed after idempotency reconciliation",
    });

    expect(recovery).toMatchObject({
      status: "published",
      verifiedPublished: 1,
      terminalFailures: 0,
      unresolved: 0,
      expectedPlatforms: 1,
    });
    expect(recovery.publishedAt?.toISOString()).toBe(
      "2026-08-10T13:05:00.000Z",
    );
  });

  it("fails receipt integrity for idempotency status without external evidence", () => {
    const recovery = reconcileSchedulerPublishException({
      expectedPlatforms: ["facebook"],
      deliveries: [
        {
          platform: "facebook",
          status: "idempotency_hit",
          attemptNumber: 2,
          externalPostId: null,
          externalPostUrl: null,
          publishedAt: null,
          updatedAt: "2026-08-10T13:05:00.000Z",
        },
      ],
      error: "idempotency result missing receipt",
    });

    expect(recovery).toMatchObject({
      status: "failed",
      verifiedPublished: 0,
      terminalFailures: 1,
      unresolved: 0,
      expectedPlatforms: 1,
    });
  });

  it("uses a later idempotency receipt instead of an earlier failed attempt", () => {
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
        {
          platform: "facebook",
          status: "idempotency_hit",
          attemptNumber: 2,
          externalPostId: "facebook-existing-post",
          externalPostUrl: null,
          publishedAt: null,
          updatedAt: "2026-08-10T13:06:00.000Z",
        },
      ],
      error: "runtime exception after retry reconciliation",
    });

    expect(recovery.status).toBe("published");
    expect(recovery.verifiedPublished).toBe(1);
    expect(recovery.terminalFailures).toBe(0);
    expect(recovery.publishedAt?.toISOString()).toBe(
      "2026-08-10T13:06:00.000Z",
    );
  });
});
