import { describe, expect, it } from "vitest";

import {
  PUBLISH_OWNERSHIP_CONFLICT_MESSAGE,
  PUBLISH_OWNERSHIP_SOURCE_STATUSES,
  PUBLISH_SOURCE_STATE_INVALID_MESSAGE,
  canClaimPublishingOwnership,
} from "./publishing-ownership";

describe("publishing ownership source policy", () => {
  it("allows only approved lifecycle states that can legitimately begin delivery", () => {
    expect(PUBLISH_OWNERSHIP_SOURCE_STATUSES).toEqual([
      "approved",
      "queued",
      "scheduled",
      "failed",
    ]);

    for (const status of PUBLISH_OWNERSHIP_SOURCE_STATUSES) {
      expect(
        canClaimPublishingOwnership({ status, approvalStatus: "approved" }),
      ).toBe(true);
    }
  });

  it.each([
    "draft",
    "generated",
    "awaiting_approval",
    "publishing",
    "published",
    "published_with_warning",
    "cancelled",
  ])("rejects non-claimable lifecycle state: %s", (status) => {
    expect(
      canClaimPublishingOwnership({ status, approvalStatus: "approved" }),
    ).toBe(false);
  });

  it.each([null, "pending_review", "rejected", "auto_approved"])(
    "requires explicit approved status: %s",
    (approvalStatus) => {
      expect(
        canClaimPublishingOwnership({
          status: "scheduled",
          approvalStatus,
        }),
      ).toBe(false);
    },
  );

  it("provides stable operator conflict diagnostics", () => {
    expect(PUBLISH_OWNERSHIP_CONFLICT_MESSAGE).toContain(
      "PUBLISH_OWNERSHIP_CONFLICT",
    );
    expect(PUBLISH_SOURCE_STATE_INVALID_MESSAGE).toContain(
      "PUBLISH_SOURCE_STATE_INVALID",
    );
  });
});
