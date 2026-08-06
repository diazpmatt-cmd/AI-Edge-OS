import { describe, expect, it } from "vitest";

import {
  PUBLISHING_INTERRUPTION_STALE_MS,
  isCompleteInterruptedPublishingRecovery,
  shouldRecoverInterruptedPublishing,
} from "./publishing-interruption-recovery";
import type { SchedulerPublishRecovery } from "./scheduler-publish-recovery";

const recovery = (
  overrides: Partial<SchedulerPublishRecovery> = {},
): SchedulerPublishRecovery => ({
  status: "published",
  verifiedPublished: 2,
  terminalFailures: 0,
  unresolved: 0,
  expectedPlatforms: 2,
  publishedAt: new Date("2026-08-06T20:02:00.000Z"),
  errorMessage: "Scheduler recovered aggregate state from 2 verified receipts.",
  ...overrides,
});

describe("interrupted publishing recovery policy", () => {
  it("accepts complete published, partial, and failed terminal evidence", () => {
    expect(isCompleteInterruptedPublishingRecovery(recovery())).toBe(true);
    expect(
      isCompleteInterruptedPublishingRecovery(recovery({
        status: "published_with_warning",
        verifiedPublished: 1,
        terminalFailures: 1,
      })),
    ).toBe(true);
    expect(
      isCompleteInterruptedPublishingRecovery(recovery({
        status: "failed",
        verifiedPublished: 0,
        terminalFailures: 2,
        publishedAt: null,
      })),
    ).toBe(true);
  });

  it("rejects missing or unresolved platform evidence", () => {
    expect(
      isCompleteInterruptedPublishingRecovery(recovery({
        verifiedPublished: 1,
        unresolved: 1,
      })),
    ).toBe(false);
    expect(
      isCompleteInterruptedPublishingRecovery(recovery({
        expectedPlatforms: 0,
        verifiedPublished: 0,
      })),
    ).toBe(false);
  });

  it("recovers only after the stale threshold", () => {
    const now = new Date("2026-08-06T21:00:00.000Z");
    expect(
      shouldRecoverInterruptedPublishing({
        now,
        updatedAt: new Date(now.getTime() - PUBLISHING_INTERRUPTION_STALE_MS),
        recovery: recovery(),
      }),
    ).toBe(true);
    expect(
      shouldRecoverInterruptedPublishing({
        now,
        updatedAt: new Date(
          now.getTime() - PUBLISHING_INTERRUPTION_STALE_MS + 1,
        ),
        recovery: recovery(),
      }),
    ).toBe(false);
  });

  it("rejects invalid timestamps and incomplete evidence", () => {
    const now = new Date("2026-08-06T21:00:00.000Z");
    expect(
      shouldRecoverInterruptedPublishing({
        now,
        updatedAt: "not-a-date",
        recovery: recovery(),
      }),
    ).toBe(false);
    expect(
      shouldRecoverInterruptedPublishing({
        now,
        updatedAt: "2026-08-06T20:00:00.000Z",
        recovery: recovery({ unresolved: 1, verifiedPublished: 1 }),
      }),
    ).toBe(false);
  });
});
