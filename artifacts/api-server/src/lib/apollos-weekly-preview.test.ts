import { describe, expect, it } from "vitest";

import {
  buildWeeklyCampaignPreview,
  getWeeklyCampaignDateRange,
  isWeeklyCampaignPreviewCommand,
  nextWeeklyCampaignMonday,
} from "./apollos-weekly-preview";

describe("isWeeklyCampaignPreviewCommand", () => {
  it.each([
    "Apollos, preview a week's worth of posts across all four connected social platforms.",
    "Show me a seven-day campaign for Facebook and Instagram.",
    "Can you preview a week of content for GBP and YouTube?",
    "Let me see a weekly content plan for Facebook.",
  ])("accepts an explicit preview-only request: %s", (command) => {
    expect(isWeeklyCampaignPreviewCommand(command)).toBe(true);
  });

  it.each([
    "Create and send a week of posts across all four platforms.",
    "Preview and publish a week of posts on Facebook.",
    "Don't preview a week of posts for Instagram.",
    "Show me a week of posts for all four except YouTube.",
    "Why did Facebook fail this week?",
  ])("rejects execution, negation, exclusion, or diagnosis: %s", (command) => {
    expect(isWeeklyCampaignPreviewCommand(command)).toBe(false);
  });
});

describe("buildWeeklyCampaignPreview", () => {
  const now = new Date("2026-08-06T21:00:00.000Z");

  it("returns the exact all-platform plan without side effects", () => {
    const preview = buildWeeklyCampaignPreview({
      command:
        "Apollos, preview a week's worth of posts across all four connected social platforms.",
      now,
    });

    expect(preview.status).toBe("preview");
    expect(preview.previewOnly).toBe(true);
    expect(preview.plan.startDate).toBe("2026-08-10");
    expect(preview.plan.endDate).toBe("2026-08-16");
    expect(preview.plan.deliveryCount).toBe(13);
    expect(preview.planFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.platforms.map((item) => item.deliveryCount)).toEqual([
      5,
      5,
      2,
      1,
    ]);
    expect(Object.values(preview.sideEffects).every((value) => !value)).toBe(
      true,
    );
    expect(preview.executionContract).toEqual({
      generation: "not_started",
      approval: "not_requested",
      scheduling: "not_started",
      publishing: "not_started",
      verification: "external_provider_receipt_required_on_execution",
    });
  });

  it("uses the next Monday and enforces the 180-day execution range", () => {
    expect(nextWeeklyCampaignMonday(now)).toBe("2026-08-10");
    expect(getWeeklyCampaignDateRange(now)).toEqual({
      earliestStartDate: "2026-08-06",
      latestStartDate: "2027-02-02",
    });

    expect(() =>
      buildWeeklyCampaignPreview({
        command: "Preview a weekly campaign for Facebook.",
        startDate: "2026-08-05",
        now,
      }),
    ).toThrow("APOLLOS_WEEKLY_START_DATE_OUT_OF_RANGE");
  });
});
