import { describe, expect, it } from "vitest";
import {
  buildWeeklyCampaignPlan,
  buildWeeklyGenerationJobs,
  isWeeklyCampaignCommand,
  parseWeeklyCampaignPlatforms,
} from "../lib/apollos-weekly-campaign";

describe("Apollos weekly campaign command", () => {
  it("recognizes the natural all-four-platform command", () => {
    const command =
      "Apollos, create and send out a week's worth of posts on all four social media accounts.";
    expect(isWeeklyCampaignCommand(command)).toBe(true);
    expect(parseWeeklyCampaignPlatforms(command)).toEqual([
      "facebook",
      "instagram",
      "google_business",
      "youtube",
    ]);
  });

  it("recognizes explicitly named platform subsets", () => {
    expect(
      parseWeeklyCampaignPlatforms(
        "Build next week's Facebook, Instagram, and GBP campaign",
      ),
    ).toEqual(["facebook", "instagram", "google_business"]);
  });

  it("does not treat a status question as an execution command", () => {
    expect(
      isWeeklyCampaignCommand("Did this week's YouTube post publish?"),
    ).toBe(false);
  });

  it("builds the approved cadence without blasting every platform daily", () => {
    const plan = buildWeeklyCampaignPlan({
      startDate: "2026-08-10",
      platforms: [
        "facebook",
        "instagram",
        "google_business",
        "youtube",
      ],
    });
    expect(plan.endDate).toBe("2026-08-16");
    expect(plan.deliveryCount).toBe(13);
    expect(plan.slots.filter((slot) => slot.platform === "facebook")).toHaveLength(5);
    expect(plan.slots.filter((slot) => slot.platform === "instagram")).toHaveLength(5);
    expect(plan.slots.filter((slot) => slot.platform === "google_business")).toHaveLength(2);
    expect(plan.slots.filter((slot) => slot.platform === "youtube")).toHaveLength(1);
  });

  it("shares each Facebook and Instagram creative while keeping separate delivery slots", () => {
    const plan = buildWeeklyCampaignPlan({
      startDate: "2026-08-10",
      platforms: ["facebook", "instagram"],
    });
    const monday = plan.slots.filter((slot) => slot.date === "2026-08-10");
    expect(monday).toHaveLength(2);
    expect(monday[0]?.creativeGroup).toBe(monday[1]?.creativeGroup);
    expect(monday[0]?.slotId).not.toBe(monday[1]?.slotId);
  });

  it("assigns video only to YouTube", () => {
    const plan = buildWeeklyCampaignPlan({
      startDate: "2026-08-10",
      platforms: ["facebook", "google_business", "youtube"],
    });
    expect(
      plan.slots.filter((slot) => slot.mediaType === "video").map((slot) => slot.platform),
    ).toEqual(["youtube"]);
  });

  it("requires one batch approval and guarded post-approval scheduling", () => {
    const plan = buildWeeklyCampaignPlan({
      startDate: "2026-08-10",
      platforms: ["youtube"],
    });
    expect(plan.approvalMode).toBe("weekly_batch");
    expect(plan.publishMode).toBe("schedule_after_approval");
    expect(plan.slots.every((slot) => slot.requiresApproval)).toBe(true);
  });

  it("rejects missing platforms and invalid dates with stable codes", () => {
    expect(() =>
      buildWeeklyCampaignPlan({
        startDate: "not-a-date",
        platforms: ["facebook"],
      }),
    ).toThrow("APOLLOS_WEEKLY_START_DATE_INVALID");
    expect(() =>
      buildWeeklyCampaignPlan({
        startDate: "2026-08-10",
        platforms: [],
      }),
    ).toThrow("APOLLOS_WEEKLY_PLATFORMS_REQUIRED");
  });

  it("expands one approved batch into four isolated generation jobs", () => {
    const plan = buildWeeklyCampaignPlan({
      startDate: "2026-08-10",
      platforms: [
        "facebook",
        "instagram",
        "google_business",
        "youtube",
      ],
    });
    const jobs = buildWeeklyGenerationJobs(
      "weekly:user:2026-08-10:all-four",
      plan,
    );
    expect(jobs.map((job) => ({
      platform: job.platform,
      generatorPlatform: job.generatorPlatform,
      count: job.count,
    }))).toEqual([
      { platform: "facebook", generatorPlatform: "facebook", count: 5 },
      { platform: "instagram", generatorPlatform: "instagram", count: 5 },
      { platform: "google_business", generatorPlatform: "google", count: 2 },
      { platform: "youtube", generatorPlatform: "youtube", count: 1 },
    ]);
    expect(new Set(jobs.map((job) => job.weeklyPlanId)).size).toBe(4);
    expect(jobs.every((job) => job.approvalMode === "approval_required")).toBe(true);
  });

  it("rejects malformed execution manifests with stable codes", () => {
    const plan = buildWeeklyCampaignPlan({
      startDate: "2026-08-10",
      platforms: ["facebook"],
    });
    expect(() => buildWeeklyGenerationJobs("", plan)).toThrow(
      "APOLLOS_WEEKLY_BATCH_KEY_INVALID",
    );
  });
});
