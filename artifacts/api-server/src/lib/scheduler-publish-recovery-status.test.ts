import { describe, expect, it } from "vitest";

import {
  SCHEDULER_RECOVERY_OWNED_POST_STATUSES,
  isSchedulerRecoveryOwnedPostStatus,
} from "./scheduler-publish-recovery";

describe("scheduler recovery post ownership", () => {
  it("allows reconciliation only while the scheduler still owns delivery", () => {
    expect(SCHEDULER_RECOVERY_OWNED_POST_STATUSES).toEqual([
      "scheduled",
      "publishing",
    ]);
    expect(isSchedulerRecoveryOwnedPostStatus("scheduled")).toBe(true);
    expect(isSchedulerRecoveryOwnedPostStatus("publishing")).toBe(true);
  });

  it.each([
    "published",
    "published_with_warning",
    "failed",
    "cancelled",
    "draft",
    "awaiting_approval",
  ])("preserves newer or externally owned state: %s", (status) => {
    expect(isSchedulerRecoveryOwnedPostStatus(status)).toBe(false);
  });
});
