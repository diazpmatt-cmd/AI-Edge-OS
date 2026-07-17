/**
 * Bounded Autonomy Approval Engine — unit tests
 *
 * All tests operate on pure functions (no DB, no HTTP).
 * Coverage: evaluateTask, helpers, all rules, boundary conditions.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  evaluateTask,
  isNonEmptyString,
  isAllowedPlatform,
  isFutureTimestamp,
  KNOWN_TASK_TYPES,
  ALLOWED_PLATFORMS,
  ALWAYS_REVIEW_TYPES,
  RULE_SET_VERSION,
} from "../lib/approval-engine.js";

// ── Constants ─────────────────────────────────────────────────────────────────

describe("RULE_SET_VERSION", () => {
  it("is v1", () => expect(RULE_SET_VERSION).toBe("v1"));
});

describe("KNOWN_TASK_TYPES", () => {
  it("includes all expected types", () => {
    const expected = [
      "generate_content",
      "schedule_post",
      "publish_post",
      "update_auto_content_settings",
      "update_client_settings",
      "pause_autopilot",
      "resume_autopilot",
    ];
    for (const t of expected) {
      expect(KNOWN_TASK_TYPES).toContain(t as never);
    }
  });
});

describe("ALWAYS_REVIEW_TYPES", () => {
  it("includes publish_post", () => expect(ALWAYS_REVIEW_TYPES.has("publish_post")).toBe(true));
  it("includes update_auto_content_settings", () => expect(ALWAYS_REVIEW_TYPES.has("update_auto_content_settings")).toBe(true));
  it("includes update_client_settings", () => expect(ALWAYS_REVIEW_TYPES.has("update_client_settings")).toBe(true));
  it("includes pause_autopilot", () => expect(ALWAYS_REVIEW_TYPES.has("pause_autopilot")).toBe(true));
  it("includes resume_autopilot", () => expect(ALWAYS_REVIEW_TYPES.has("resume_autopilot")).toBe(true));
  it("does NOT include generate_content", () => expect(ALWAYS_REVIEW_TYPES.has("generate_content")).toBe(false));
  it("does NOT include schedule_post", () => expect(ALWAYS_REVIEW_TYPES.has("schedule_post")).toBe(false));
});

describe("ALLOWED_PLATFORMS", () => {
  it("includes facebook", () => expect(ALLOWED_PLATFORMS.has("facebook")).toBe(true));
  it("includes instagram", () => expect(ALLOWED_PLATFORMS.has("instagram")).toBe(true));
  it("includes tiktok", () => expect(ALLOWED_PLATFORMS.has("tiktok")).toBe(true));
  it("includes youtube", () => expect(ALLOWED_PLATFORMS.has("youtube")).toBe(true));
  it("includes google_business", () => expect(ALLOWED_PLATFORMS.has("google_business")).toBe(true));
  it("does not include twitter", () => expect(ALLOWED_PLATFORMS.has("twitter")).toBe(false));
  it("does not include linkedin", () => expect(ALLOWED_PLATFORMS.has("linkedin")).toBe(false));
});

// ── Helper: isNonEmptyString ──────────────────────────────────────────────────

describe("isNonEmptyString", () => {
  it("returns true for a normal string", () => expect(isNonEmptyString("hello")).toBe(true));
  it("returns false for empty string", () => expect(isNonEmptyString("")).toBe(false));
  it("returns false for whitespace-only string", () => expect(isNonEmptyString("   ")).toBe(false));
  it("returns false for null", () => expect(isNonEmptyString(null)).toBe(false));
  it("returns false for undefined", () => expect(isNonEmptyString(undefined)).toBe(false));
  it("returns false for number", () => expect(isNonEmptyString(42)).toBe(false));
  it("returns false for object", () => expect(isNonEmptyString({})).toBe(false));
});

// ── Helper: isAllowedPlatform ─────────────────────────────────────────────────

describe("isAllowedPlatform", () => {
  it("accepts facebook", () => expect(isAllowedPlatform("facebook")).toBe(true));
  it("accepts instagram", () => expect(isAllowedPlatform("instagram")).toBe(true));
  it("accepts tiktok", () => expect(isAllowedPlatform("tiktok")).toBe(true));
  it("accepts youtube", () => expect(isAllowedPlatform("youtube")).toBe(true));
  it("accepts google_business", () => expect(isAllowedPlatform("google_business")).toBe(true));
  it("rejects unknown platform", () => expect(isAllowedPlatform("twitter")).toBe(false));
  it("rejects empty string", () => expect(isAllowedPlatform("")).toBe(false));
  it("rejects null", () => expect(isAllowedPlatform(null)).toBe(false));
  it("rejects number", () => expect(isAllowedPlatform(1)).toBe(false));
  it("is case-sensitive (FACEBOOK rejected)", () => expect(isAllowedPlatform("FACEBOOK")).toBe(false));
});

// ── Helper: isFutureTimestamp ─────────────────────────────────────────────────

describe("isFutureTimestamp", () => {
  it("accepts a future ISO timestamp", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isFutureTimestamp(future)).toBe(true);
  });
  it("rejects a past ISO timestamp", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isFutureTimestamp(past)).toBe(false);
  });
  it("rejects current moment (edge case)", () => {
    const now = new Date().toISOString();
    expect(isFutureTimestamp(now)).toBe(false);
  });
  it("rejects non-date string", () => expect(isFutureTimestamp("not-a-date")).toBe(false));
  it("rejects null", () => expect(isFutureTimestamp(null)).toBe(false));
  it("rejects number", () => expect(isFutureTimestamp(Date.now())).toBe(false));
  it("rejects empty string", () => expect(isFutureTimestamp("")).toBe(false));
});

// ── evaluateTask — Rule 0: unknown task type ──────────────────────────────────

describe("evaluateTask — Rule 0: unknown task type", () => {
  it("rejects completely unknown task type", () => {
    const r = evaluateTask("do_the_thing", {});
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("UNKNOWN_TASK_TYPE");
  });

  it("rejects empty string task type", () => {
    const r = evaluateTask("", {});
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("UNKNOWN_TASK_TYPE");
  });

  it("rejects near-miss spellings", () => {
    const r = evaluateTask("generate-content", {});
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("UNKNOWN_TASK_TYPE");
  });

  it("error reason names the offending type", () => {
    const r = evaluateTask("hack_the_planet", {});
    expect(r.reason).toContain("hack_the_planet");
  });
});

// ── evaluateTask — Rule 1: always-review types ────────────────────────────────

describe("evaluateTask — Rule 1: high-stakes always requires_review", () => {
  const alwaysReview = [
    "publish_post",
    "update_auto_content_settings",
    "update_client_settings",
    "pause_autopilot",
    "resume_autopilot",
  ];

  for (const taskType of alwaysReview) {
    it(`${taskType} → requires_review regardless of payload`, () => {
      const r = evaluateTask(taskType, { everything: "valid" });
      expect(r.decision).toBe("requires_review");
      expect(r.ruleId).toBe("HIGH_STAKES_REVIEW");
    });

    it(`${taskType} → requires_review even with empty payload`, () => {
      const r = evaluateTask(taskType, {});
      expect(r.decision).toBe("requires_review");
      expect(r.ruleId).toBe("HIGH_STAKES_REVIEW");
    });
  }
});

// ── evaluateTask — generate_content ──────────────────────────────────────────

describe("evaluateTask — generate_content: auto_approved", () => {
  it("auto-approves with valid topic + platform", () => {
    const r = evaluateTask("generate_content", { topic: "bed bugs", platform: "facebook" });
    expect(r.decision).toBe("auto_approved");
    expect(r.ruleId).toBe("GENERATE_CONTENT_AUTO");
  });

  it("auto-approves for all allowed platforms", () => {
    const platforms = ["facebook", "instagram", "tiktok", "youtube", "google_business"];
    for (const platform of platforms) {
      const r = evaluateTask("generate_content", { topic: "pest control", platform });
      expect(r.decision).toBe("auto_approved");
    }
  });

  it("auto-approves with extra payload fields present", () => {
    const r = evaluateTask("generate_content", {
      topic: "termites",
      platform: "instagram",
      angle: "educational",
      tone: "professional",
    });
    expect(r.decision).toBe("auto_approved");
  });
});

describe("evaluateTask — generate_content: rejected", () => {
  it("rejects missing topic", () => {
    const r = evaluateTask("generate_content", { platform: "facebook" });
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("GENERATE_CONTENT_MISSING_TOPIC");
  });

  it("rejects empty topic", () => {
    const r = evaluateTask("generate_content", { topic: "", platform: "facebook" });
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("GENERATE_CONTENT_MISSING_TOPIC");
  });

  it("rejects whitespace-only topic", () => {
    const r = evaluateTask("generate_content", { topic: "   ", platform: "facebook" });
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("GENERATE_CONTENT_MISSING_TOPIC");
  });

  it("rejects invalid platform", () => {
    const r = evaluateTask("generate_content", { topic: "bed bugs", platform: "twitter" });
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("GENERATE_CONTENT_INVALID_PLATFORM");
  });

  it("rejects missing platform", () => {
    const r = evaluateTask("generate_content", { topic: "bed bugs" });
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("GENERATE_CONTENT_INVALID_PLATFORM");
  });

  it("rejects null platform", () => {
    const r = evaluateTask("generate_content", { topic: "bed bugs", platform: null });
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("GENERATE_CONTENT_INVALID_PLATFORM");
  });

  it("rejects when payload is null (treated as empty object)", () => {
    const r = evaluateTask("generate_content", null);
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("GENERATE_CONTENT_MISSING_TOPIC");
  });

  it("rejects when payload is an array (treated as empty object)", () => {
    const r = evaluateTask("generate_content", ["bed bugs", "facebook"]);
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("GENERATE_CONTENT_MISSING_TOPIC");
  });

  it("rejects when payload is a primitive string", () => {
    const r = evaluateTask("generate_content", "bed bugs");
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("GENERATE_CONTENT_MISSING_TOPIC");
  });
});

// ── evaluateTask — schedule_post ──────────────────────────────────────────────

describe("evaluateTask — schedule_post: auto_approved", () => {
  function futureTs(): string {
    return new Date(Date.now() + 3_600_000).toISOString();
  }

  it("auto-approves with valid postId + future scheduledAt + allowed platform", () => {
    const r = evaluateTask("schedule_post", {
      postId: "post-uuid-123",
      scheduledAt: futureTs(),
      platform: "facebook",
    });
    expect(r.decision).toBe("auto_approved");
    expect(r.ruleId).toBe("SCHEDULE_POST_AUTO");
  });

  it("auto-approves for all allowed platforms", () => {
    const platforms = ["facebook", "instagram", "tiktok", "youtube", "google_business"];
    for (const platform of platforms) {
      const r = evaluateTask("schedule_post", {
        postId: "abc",
        scheduledAt: futureTs(),
        platform,
      });
      expect(r.decision).toBe("auto_approved");
    }
  });
});

describe("evaluateTask — schedule_post: rejected", () => {
  function futureTs(): string {
    return new Date(Date.now() + 3_600_000).toISOString();
  }

  it("rejects missing postId", () => {
    const r = evaluateTask("schedule_post", { scheduledAt: futureTs(), platform: "facebook" });
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("SCHEDULE_POST_MISSING_POST_ID");
  });

  it("rejects empty postId", () => {
    const r = evaluateTask("schedule_post", { postId: "", scheduledAt: futureTs(), platform: "facebook" });
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("SCHEDULE_POST_MISSING_POST_ID");
  });

  it("rejects past scheduledAt", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const r = evaluateTask("schedule_post", { postId: "abc", scheduledAt: past, platform: "facebook" });
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("SCHEDULE_POST_INVALID_SCHEDULED_AT");
  });

  it("rejects invalid scheduledAt string", () => {
    const r = evaluateTask("schedule_post", { postId: "abc", scheduledAt: "not-a-date", platform: "facebook" });
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("SCHEDULE_POST_INVALID_SCHEDULED_AT");
  });

  it("rejects missing scheduledAt", () => {
    const r = evaluateTask("schedule_post", { postId: "abc", platform: "facebook" });
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("SCHEDULE_POST_INVALID_SCHEDULED_AT");
  });

  it("rejects invalid platform", () => {
    const r = evaluateTask("schedule_post", { postId: "abc", scheduledAt: futureTs(), platform: "snapchat" });
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("SCHEDULE_POST_INVALID_PLATFORM");
  });

  it("rejects missing platform", () => {
    const r = evaluateTask("schedule_post", { postId: "abc", scheduledAt: futureTs() });
    expect(r.decision).toBe("rejected");
    expect(r.ruleId).toBe("SCHEDULE_POST_INVALID_PLATFORM");
  });
});

// ── Result shape ──────────────────────────────────────────────────────────────

describe("evaluateTask — result shape", () => {
  it("always returns decision, ruleId, and reason", () => {
    const r = evaluateTask("generate_content", { topic: "bed bugs", platform: "facebook" });
    expect(typeof r.decision).toBe("string");
    expect(typeof r.ruleId).toBe("string");
    expect(typeof r.reason).toBe("string");
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it("reason is a non-empty string for all decisions", () => {
    const cases = [
      evaluateTask("unknown_type", {}),
      evaluateTask("publish_post", {}),
      evaluateTask("generate_content", { topic: "bed bugs", platform: "facebook" }),
      evaluateTask("generate_content", { platform: "facebook" }),
      evaluateTask("schedule_post", { postId: "x", scheduledAt: new Date(Date.now() + 3600000).toISOString(), platform: "facebook" }),
    ];
    for (const r of cases) {
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });
});

// ── Tenant isolation: engine has no shared state ──────────────────────────────

describe("evaluateTask — statelessness / tenant isolation", () => {
  it("repeated calls with same input return identical results", () => {
    const payload = { topic: "mosquitoes", platform: "instagram" };
    const r1 = evaluateTask("generate_content", payload);
    const r2 = evaluateTask("generate_content", payload);
    expect(r1.decision).toBe(r2.decision);
    expect(r1.ruleId).toBe(r2.ruleId);
  });

  it("two different callers' payloads do not bleed state", () => {
    const rA = evaluateTask("generate_content", { topic: "bed bugs", platform: "facebook" });
    const rB = evaluateTask("generate_content", { topic: "", platform: "facebook" });
    expect(rA.decision).toBe("auto_approved");
    expect(rB.decision).toBe("rejected");
  });
});
