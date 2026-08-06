import { describe, expect, it } from "vitest";

import { isWeeklyCampaignCommand } from "./apollos-weekly-campaign";

describe("isWeeklyCampaignCommand", () => {
  it.each([
    "Apollos, create and send a week's worth of posts across all four connected social platforms.",
    "Please schedule a seven-day campaign for Facebook and Instagram.",
    "Can you generate a week of posts for GBP and YouTube?",
    "I need you to prepare a 7-day campaign for Facebook.",
    "Let's build a weekly campaign for Instagram.",
    "Go ahead and publish a week of posts to Facebook.",
    "Publish Facebook posts this week.",
  ])("accepts an explicit weekly campaign command: %s", (command) => {
    expect(isWeeklyCampaignCommand(command)).toBe(true);
  });

  it.each([
    "Why did Facebook fail to publish this week?",
    "Did the YouTube post publish this week?",
    "What published on Facebook this week?",
    "Should we send a week of posts to all four platforms?",
    "Don't publish a week of posts to Facebook.",
    "Apollos, never send a weekly campaign to Instagram.",
    "Create a week of posts for all four except YouTube.",
    "Publish status for Facebook this week.",
    "Could you tell me why Facebook failed to publish this week?",
  ])("rejects a question, negation, or ambiguous request: %s", (command) => {
    expect(isWeeklyCampaignCommand(command)).toBe(false);
  });
});
