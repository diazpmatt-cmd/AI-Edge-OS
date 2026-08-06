import { describe, expect, it } from "vitest";

import {
  PUBLISHING_MUTATION_ALLOWED_COLUMNS,
  PUBLISHING_MUTATION_GUARD_DDL,
  PUBLISHING_RESULT_STATUSES,
  PUBLISHING_STATE_LOCKED_CODE,
  SCHEDULER_AGGREGATE_RECOVERY_PREFIXES,
  VERIFIED_DELIVERY_RECEIPT_LOCKED_CODE,
  isPublishingResultStatus,
  isSchedulerAggregateRecoveryMessage,
  shouldDeferAdapterAggregateTransition,
} from "./publishing-mutation-guard";

describe("publishing mutation guard policy", () => {
  it("allows only in-flight and canonical provider-result states", () => {
    expect(PUBLISHING_RESULT_STATUSES).toEqual([
      "publishing",
      "published",
      "published_with_warning",
      "failed",
    ]);

    for (const status of PUBLISHING_RESULT_STATUSES) {
      expect(isPublishingResultStatus(status)).toBe(true);
    }

    for (const status of [
      "approved",
      "queued",
      "scheduled",
      "cancelled",
      "draft",
      "awaiting_approval",
    ]) {
      expect(isPublishingResultStatus(status)).toBe(false);
    }
  });

  it("allows only provider results, diagnostics, metrics, and timestamps to change", () => {
    expect(PUBLISHING_MUTATION_ALLOWED_COLUMNS).toEqual([
      "status",
      "published_at",
      "error_message",
      "youtube_video_id",
      "impressions",
      "reach",
      "clicks",
      "likes",
      "comments",
      "shares",
      "engagement_score",
      "updated_at",
    ]);
    expect(PUBLISHING_MUTATION_ALLOWED_COLUMNS).not.toContain("caption");
    expect(PUBLISHING_MUTATION_ALLOWED_COLUMNS).not.toContain("platforms");
    expect(PUBLISHING_MUTATION_ALLOWED_COLUMNS).not.toContain("approval_status");
    expect(PUBLISHING_MUTATION_ALLOWED_COLUMNS).not.toContain("scheduled_at");
    expect(PUBLISHING_MUTATION_ALLOWED_COLUMNS).not.toContain("cancelled_at");
  });

  it("defers adapter aggregate status until every expected latest lane is terminal", () => {
    expect(
      shouldDeferAdapterAggregateTransition({
        nextStatus: "published",
        expectedPlatformCount: 2,
        latestDeliveryCount: 2,
        latestUnresolvedCount: 2,
      }),
    ).toBe(true);

    expect(
      shouldDeferAdapterAggregateTransition({
        nextStatus: "published_with_warning",
        expectedPlatformCount: 2,
        latestDeliveryCount: 1,
        latestUnresolvedCount: 0,
        errorMessage: "Google failed",
      }),
    ).toBe(true);

    expect(
      shouldDeferAdapterAggregateTransition({
        nextStatus: "failed",
        expectedPlatformCount: 0,
        latestDeliveryCount: 0,
        latestUnresolvedCount: 0,
        errorMessage: "Provider adapter failed",
      }),
    ).toBe(true);
  });

  it("allows canonical completion only when expected terminal evidence is complete", () => {
    expect(
      shouldDeferAdapterAggregateTransition({
        nextStatus: "published",
        expectedPlatformCount: 2,
        latestDeliveryCount: 2,
        latestUnresolvedCount: 0,
      }),
    ).toBe(false);

    expect(
      shouldDeferAdapterAggregateTransition({
        nextStatus: "failed",
        expectedPlatformCount: 2,
        latestDeliveryCount: 2,
        latestUnresolvedCount: 0,
      }),
    ).toBe(false);

    expect(
      shouldDeferAdapterAggregateTransition({
        nextStatus: "publishing",
        expectedPlatformCount: 2,
        latestDeliveryCount: 0,
        latestUnresolvedCount: 0,
      }),
    ).toBe(false);
  });

  it("requires scheduler ownership and an exact internal recovery family", () => {
    expect(SCHEDULER_AGGREGATE_RECOVERY_PREFIXES).toEqual([
      "Scheduler recovered aggregate state from",
      "Scheduler error after",
      "Scheduler publish error before",
    ]);

    for (const prefix of SCHEDULER_AGGREGATE_RECOVERY_PREFIXES) {
      expect(isSchedulerAggregateRecoveryMessage(`${prefix} details`)).toBe(true);
    }
    expect(isSchedulerAggregateRecoveryMessage("Scheduler provider failed")).toBe(false);
    expect(isSchedulerAggregateRecoveryMessage("provider failed")).toBe(false);

    const recoveryMessage =
      "Scheduler publish error before any verified external receipt";
    expect(
      shouldDeferAdapterAggregateTransition({
        nextStatus: "failed",
        expectedPlatformCount: 2,
        latestDeliveryCount: 1,
        latestUnresolvedCount: 1,
        publishedBy: "scheduler",
        errorMessage: recoveryMessage,
      }),
    ).toBe(false);
    expect(
      shouldDeferAdapterAggregateTransition({
        nextStatus: "failed",
        expectedPlatformCount: 2,
        latestDeliveryCount: 1,
        latestUnresolvedCount: 1,
        publishedBy: "user_123",
        errorMessage: recoveryMessage,
      }),
    ).toBe(true);
  });

  it("installs monotonic delivery receipts and ledger-derived aggregate authority", () => {
    expect(PUBLISHING_MUTATION_GUARD_DDL).toMatch(/^\s*BEGIN;/);
    expect(PUBLISHING_MUTATION_GUARD_DDL).toMatch(/COMMIT;\s*$/);
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain(
      "CREATE OR REPLACE FUNCTION ai_edge_preserve_verified_delivery_receipt",
    );
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain(
      "BEFORE UPDATE OR DELETE ON platform_deliveries",
    );
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain(
      `MESSAGE = '${VERIFIED_DELIVERY_RECEIPT_LOCKED_CODE}'`,
    );
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain(
      "NEW.post_id IS DISTINCT FROM OLD.post_id",
    );
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain(
      "NEW.external_post_id := COALESCE(OLD.external_post_id, NEW.external_post_id)",
    );
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain(
      "CREATE OR REPLACE FUNCTION ai_edge_guard_publishing_post_mutation",
    );
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain(
      "BEFORE UPDATE OR DELETE ON social_posts",
    );
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain("to_jsonb(NEW)");
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain(
      `MESSAGE = '${PUBLISHING_STATE_LOCKED_CODE}'`,
    );
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain(
      "array_agg(DISTINCT btrim(value))",
    );
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain(
      "SELECT DISTINCT ON (platform)",
    );
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain(
      "verified_published_count + terminal_failure_count",
    );
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain(
      "NEW.status := 'published'",
    );
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain(
      "NEW.status := 'published_with_warning'",
    );
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain(
      "NEW.status := 'failed'",
    );
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain(
      "COALESCE(OLD.published_by, '') = 'scheduler'",
    );
    expect(PUBLISHING_MUTATION_GUARD_DDL).toContain(
      "pg_advisory_xact_lock",
    );
  });
});
