import { describe, expect, it } from "vitest";

import {
  PUBLISHING_MUTATION_ALLOWED_COLUMNS,
  PUBLISHING_MUTATION_GUARD_DDL,
  PUBLISHING_RESULT_STATUSES,
  PUBLISHING_STATE_LOCKED_CODE,
  isPublishingResultStatus,
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

  it("installs an idempotent update/delete trigger with the stable error code", () => {
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
      "pg_advisory_xact_lock",
    );
  });
});
