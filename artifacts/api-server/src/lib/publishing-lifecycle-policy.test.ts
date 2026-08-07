import { describe, expect, it } from "vitest";

import {
  CANCELLABLE_PRE_DELIVERY_STATUSES,
  FULL_RETRY_SOURCE_STATUSES,
  IMMEDIATE_PUBLISH_APPROVAL_SOURCE_STATUSES,
  MANUAL_APPROVAL_SOURCE_STATUSES,
  buildPublishFinalizationConflictSummary,
  canApproveForImmediatePublish,
  canCancelBeforeDelivery,
  canFinalizePublishingAggregate,
  canManuallyApprovePost,
  canRetryFullPost,
} from "./publishing-lifecycle-policy";

describe("publishing lifecycle mutation policy", () => {
  it("never lets route approval reset an in-flight or delivered post", () => {
    for (const status of ["publishing", "published", "published_with_warning", "cancelled"]) {
      expect(canApproveForImmediatePublish(status)).toBe(false);
      expect(canManuallyApprovePost(status)).toBe(false);
    }

    for (const status of IMMEDIATE_PUBLISH_APPROVAL_SOURCE_STATUSES) {
      expect(canApproveForImmediatePublish(status)).toBe(true);
    }
    for (const status of MANUAL_APPROVAL_SOURCE_STATUSES) {
      expect(canManuallyApprovePost(status)).toBe(true);
    }
  });

  it("allows full-post retry only from failed", () => {
    expect(FULL_RETRY_SOURCE_STATUSES).toEqual(["failed"]);
    expect(canRetryFullPost("failed")).toBe(true);
    for (const status of ["publishing", "published", "published_with_warning", "cancelled", "approved"]) {
      expect(canRetryFullPost(status)).toBe(false);
    }
  });

  it("allows cancellation only before provider delivery begins", () => {
    for (const status of CANCELLABLE_PRE_DELIVERY_STATUSES) {
      expect(canCancelBeforeDelivery(status)).toBe(true);
    }
    for (const status of ["publishing", "published", "published_with_warning", "cancelled"]) {
      expect(canCancelBeforeDelivery(status)).toBe(false);
    }
  });

  it("gives final aggregation ownership only to publishing", () => {
    expect(canFinalizePublishingAggregate("publishing")).toBe(true);
    for (const status of ["approved", "scheduled", "cancelled", "published", "failed"]) {
      expect(canFinalizePublishingAggregate(status)).toBe(false);
    }
  });

  it("builds a bounded conflict diagnostic that preserves delivery evidence", () => {
    const summary = buildPublishFinalizationConflictSummary({
      deliverySummary: "1 of 2 published successfully. 1 failed.",
      currentStatus: "cancelled",
    });
    expect(summary).toContain("1 of 2 published successfully");
    expect(summary).toContain("PUBLISH_FINALIZATION_STATE_CONFLICT");
    expect(summary).toContain("cancelled");
    expect(summary.length).toBeLessThanOrEqual(500);
  });
});
