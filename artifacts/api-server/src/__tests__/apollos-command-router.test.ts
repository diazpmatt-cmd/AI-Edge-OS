import { describe, expect, it } from "vitest";
import { routeApollosCommand } from "../lib/apollos-command-router";

describe("routeApollosCommand", () => {
  it("routes a one-command weekly campaign to preparation before approval", () => {
    expect(
      routeApollosCommand(
        "Apollos, create and send out a week's worth of posts on Facebook, Instagram, GBP, and YouTube.",
      ),
    ).toMatchObject({
      operation: "weekly_campaign",
      capability: "prepare",
      confidence: "high",
      approvalBoundary: "before_external_effect",
      requiresApprovalNow: false,
      requestedExternalEffect: true,
      reasonCode: "APOLLOS_ROUTE_WEEKLY_CAMPAIGN",
    });
  });

  it("does not demand approval merely to create reviewable drafts", () => {
    expect(
      routeApollosCommand("Create Facebook and Instagram content drafts"),
    ).toMatchObject({
      operation: "content_preparation",
      capability: "prepare",
      requiresApprovalNow: false,
      requestedExternalEffect: false,
    });
  });

  it("requires approval for a direct external publishing request", () => {
    expect(routeApollosCommand("Publish this post to Facebook now")).toMatchObject({
      operation: "external_publish",
      capability: "publish",
      requiresApprovalNow: true,
      requestedExternalEffect: true,
    });
  });

  it("keeps troubleshooting read-only even when publishing is mentioned", () => {
    expect(
      routeApollosCommand("Why did YouTube publishing fail? Diagnose the root cause."),
    ).toMatchObject({
      operation: "system_diagnosis",
      capability: "diagnose",
      approvalBoundary: "none",
      requiresApprovalNow: false,
      requestedExternalEffect: false,
    });
  });

  it("routes advice without creating an external effect", () => {
    expect(
      routeApollosCommand("What should I prioritize next to improve the business?"),
    ).toMatchObject({
      operation: "business_recommendation",
      capability: "recommend",
      confidence: "high",
      requiresApprovalNow: false,
    });
  });

  it("requests clarification rather than pretending to understand", () => {
    expect(routeApollosCommand("Help me with that thing")).toMatchObject({
      operation: "unknown",
      capability: "recommend",
      confidence: "low",
      reasonCode: "APOLLOS_ROUTE_CLARIFICATION_REQUIRED",
    });
  });

  it("returns immutable routing evidence", () => {
    const route = routeApollosCommand("Diagnose the failed video render");
    expect(Object.isFrozen(route)).toBe(true);
    expect(Object.isFrozen(route.matchedSignals)).toBe(true);
    expect(route.matchedSignals).toContain("diagnostic_request");
  });

  it.each([
    "Create a weekly campaign for all four platforms",
    "Build seven-day content for Facebook, Instagram, Google Business, and YouTube",
    "Schedule a 7-day campaign across all 4 platforms",
  ])("recognizes weekly command phrasing: %s", (command) => {
    expect(routeApollosCommand(command).operation).toBe("weekly_campaign");
  });
});
