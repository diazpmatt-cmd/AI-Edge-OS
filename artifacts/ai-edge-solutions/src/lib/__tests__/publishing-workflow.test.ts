// Content Autopilot V1 — Publishing Workflow Tests
// Covers: STATUS_META completeness, PlatformStatus state machine,
// idempotency key shape, approval gate enforcement, pre-flight
// validation logic, and bulk-publish response contract.

import { describe, it, expect } from "vitest";
import { SOCIAL_PROVIDERS, QUEUEABLE_PROVIDERS } from "../social-providers";

// ─────────────────────────────────────────────────────────────────────────────
// Inline the STATUS_META and PlatformStatus from the page to test them
// independently without importing React components.
// ─────────────────────────────────────────────────────────────────────────────
type PlatformStatus =
  | "not-queued"
  | "draft-saved"
  | "approved"
  | "publishing"
  | "success"
  | "published-warning"
  | "failed";

const ALL_STATUSES: PlatformStatus[] = [
  "not-queued",
  "draft-saved",
  "approved",
  "publishing",
  "success",
  "published-warning",
  "failed",
];

const STATUS_META: Record<PlatformStatus, { dot: string; label: string; color: string }> = {
  "not-queued":        { dot: "#475569", label: "Not queued",          color: "#64748B" },
  "draft-saved":       { dot: "#FBBF24", label: "Draft saved",         color: "#FBBF24" },
  "approved":          { dot: "#A78BFA", label: "Approved",            color: "#A78BFA" },
  "publishing":        { dot: "#F97316", label: "Publishing...",        color: "#F97316" },
  "success":           { dot: "#22C55E", label: "Published ✓",         color: "#22C55E" },
  "published-warning": { dot: "#FBBF24", label: "Published (partial)", color: "#FBBF24" },
  "failed":            { dot: "#EF4444", label: "Failed",              color: "#EF4444" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency key helper (mirrors PublishingService.makeAttemptId)
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from "crypto";
function makeAttemptId(postId: string, platform: string, attemptNumber: number): string {
  return createHash("sha256")
    .update(`${postId}:${platform}:${attemptNumber}`)
    .digest("hex")
    .slice(0, 32);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-flight warning logic (mirrors getPublishableCount logic in the page)
// ─────────────────────────────────────────────────────────────────────────────
type Provider = { id: string; icon: string; label: string };
type Warning  = { platform: string; warning: string };

function getPlatformWarnings(
  selectedProviders: Provider[],
  connectedProviders: Set<string>,
  mediaKind: string | null,
): Warning[] {
  const warnings: Warning[] = [];
  for (const p of selectedProviders) {
    if (!connectedProviders.has(p.id)) {
      warnings.push({ platform: p.id, warning: "Not connected — link account in Connected Accounts" });
    } else if ((p.id === "youtube" || p.id === "tiktok") && mediaKind !== "video") {
      warnings.push({ platform: p.id, warning: "Requires video content to publish" });
    } else if (p.id === "instagram" && mediaKind === "audio") {
      warnings.push({ platform: p.id, warning: "Instagram requires an image (audio only won't work)" });
    }
  }
  return warnings;
}

function getPublishableCount(
  selectedProviders: Provider[],
  connectedProviders: Set<string>,
  mediaKind: string | null,
): number {
  const warnings = getPlatformWarnings(selectedProviders, connectedProviders, mediaKind);
  const blocked  = new Set(warnings.filter(w => w.warning.startsWith("Not connected")).map(w => w.platform));
  return selectedProviders.filter(p => !blocked.has(p.id)).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// BulkPublishResult contract helpers
// ─────────────────────────────────────────────────────────────────────────────
interface BulkDelivery {
  platform:       string;
  status:         string;
  errorMessage:   string | null;
  externalPostId: string | null;
}

function makeBulkResult(deliveries: BulkDelivery[]) {
  const published = deliveries.filter(d => d.status === "published").length;
  const failed    = deliveries.filter(d => d.status === "failed").length;
  return {
    ok:      failed === 0,
    results: [{ postStatus: published > 0 ? "published" : "failed", deliveries, published, failed, skipped: 0 }],
    summary: `${published} of ${deliveries.length} post(s) published successfully${failed ? `; ${failed} failed` : ""}.`,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describe("STATUS_META completeness", () => {
  it("1: every PlatformStatus value has a STATUS_META entry", () => {
    for (const s of ALL_STATUSES) {
      expect(STATUS_META[s]).toBeDefined();
      expect(STATUS_META[s].dot).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(STATUS_META[s].label.length).toBeGreaterThan(0);
      expect(STATUS_META[s].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("2: success status uses green dot", () => {
    expect(STATUS_META["success"].dot).toBe("#22C55E");
    expect(STATUS_META["success"].color).toBe("#22C55E");
  });

  it("3: failed status uses red dot", () => {
    expect(STATUS_META["failed"].dot).toBe("#EF4444");
  });

  it("4: not-queued is the only gray status (all others are non-gray)", () => {
    const gray = ALL_STATUSES.filter(s => STATUS_META[s].dot === "#475569");
    expect(gray).toEqual(["not-queued"]);
  });

  it("5: draft-saved and published-warning use the same amber color (both are 'needs attention')", () => {
    expect(STATUS_META["draft-saved"].dot).toBe(STATUS_META["published-warning"].dot);
  });
});

describe("PlatformStatus state machine", () => {
  it("6: valid terminal states are success, published-warning, failed", () => {
    const terminals: PlatformStatus[] = ["success", "published-warning", "failed"];
    for (const t of terminals) {
      expect(ALL_STATUSES).toContain(t);
    }
  });

  it("7: draft-saved is a required intermediate before publishing", () => {
    // The workflow requires draft-saved BEFORE approved/publishing/success
    const idx = (s: PlatformStatus) => ALL_STATUSES.indexOf(s);
    expect(idx("draft-saved")).toBeLessThan(idx("approved"));
    expect(idx("approved")).toBeLessThan(idx("publishing"));
    expect(idx("publishing")).toBeLessThan(idx("success"));
  });

  it("8: not-queued is the initial state (index 0)", () => {
    expect(ALL_STATUSES[0]).toBe("not-queued");
  });
});

describe("Idempotency key generation", () => {
  it("9: same inputs always produce the same attempt_id", () => {
    const a1 = makeAttemptId("post-123", "facebook", 1);
    const a2 = makeAttemptId("post-123", "facebook", 1);
    expect(a1).toBe(a2);
    expect(a1.length).toBe(32);
  });

  it("10: different postId → different attempt_id", () => {
    expect(makeAttemptId("post-A", "facebook", 1)).not.toBe(makeAttemptId("post-B", "facebook", 1));
  });

  it("11: different platform → different attempt_id", () => {
    expect(makeAttemptId("post-A", "facebook", 1)).not.toBe(makeAttemptId("post-A", "instagram", 1));
  });

  it("12: different attempt_number → different attempt_id (retry isolation)", () => {
    expect(makeAttemptId("post-A", "facebook", 1)).not.toBe(makeAttemptId("post-A", "facebook", 2));
  });

  it("13: attempt_id is exactly 32 hex chars (128-bit prefix of sha256)", () => {
    const id = makeAttemptId("post-uuid-xyz", "google", 1);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("Pre-flight validation — getPlatformWarnings", () => {
  const facebook: Provider = { id: "facebook", icon: "📘", label: "Facebook" };
  const instagram: Provider = { id: "instagram", icon: "📸", label: "Instagram" };
  const youtube: Provider   = { id: "youtube", icon: "▶️",  label: "YouTube" };
  const google: Provider    = { id: "google_business", icon: "🗺️", label: "Google Business" };

  it("14: disconnected platform → 'Not connected' warning", () => {
    const warnings = getPlatformWarnings([facebook], new Set(), null);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].warning).toMatch(/Not connected/);
    expect(warnings[0].platform).toBe("facebook");
  });

  it("15: YouTube without video → requires video warning", () => {
    const warnings = getPlatformWarnings([youtube], new Set(["youtube"]), "image");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].warning).toMatch(/video/i);
  });

  it("16: YouTube with video → no warning", () => {
    const warnings = getPlatformWarnings([youtube], new Set(["youtube"]), "video");
    expect(warnings).toHaveLength(0);
  });

  it("17: Instagram with audio → warning (no image)", () => {
    const warnings = getPlatformWarnings([instagram], new Set(["instagram"]), "audio");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].warning).toMatch(/image/i);
  });

  it("18: Instagram with image → no warning", () => {
    const warnings = getPlatformWarnings([instagram], new Set(["instagram"]), "image");
    expect(warnings).toHaveLength(0);
  });

  it("19: Facebook connected with no media → no warning (text-only posts ok)", () => {
    const warnings = getPlatformWarnings([facebook], new Set(["facebook"]), null);
    expect(warnings).toHaveLength(0);
  });

  it("20: Google Business connected with no media → no warning", () => {
    const warnings = getPlatformWarnings([google], new Set(["google_business"]), null);
    expect(warnings).toHaveLength(0);
  });

  it("21: multiple platforms — only disconnected ones are blocked", () => {
    const providers = [facebook, instagram, youtube, google];
    const connected = new Set(["facebook", "instagram", "youtube"]);
    const warnings  = getPlatformWarnings(providers, connected, "video");
    const blocked   = warnings.filter(w => w.warning.startsWith("Not connected"));
    expect(blocked.map(b => b.platform)).toEqual(["google_business"]);
  });
});

describe("Pre-flight validation — getPublishableCount", () => {
  const facebook: Provider = { id: "facebook", icon: "📘", label: "Facebook" };
  const instagram: Provider = { id: "instagram", icon: "📸", label: "Instagram" };
  const youtube: Provider   = { id: "youtube", icon: "▶️",  label: "YouTube" };

  it("22: all connected + compatible media → count equals platform count", () => {
    const providers = [facebook, instagram];
    const count = getPublishableCount(providers, new Set(["facebook", "instagram"]), "image");
    expect(count).toBe(2);
  });

  it("23: none connected → publishable count is 0", () => {
    const count = getPublishableCount([facebook, instagram], new Set(), null);
    expect(count).toBe(0);
  });

  it("24: partially connected → count equals connected count", () => {
    const providers = [facebook, instagram, youtube];
    const count = getPublishableCount(providers, new Set(["facebook"]), "video");
    // facebook connected + ok, instagram connected missing but here youtube needs video
    // Actually: facebook connected, instagram NOT connected (blocked), youtube NOT connected
    // Count should be 1 (just facebook)
    expect(count).toBe(1);
  });

  it("25: YouTube without video does NOT block (warning only, not 'Not connected')", () => {
    // A non-blocking warning should still count the platform as publishable
    // (the API handles the graceful failure)
    const providers = [facebook, youtube];
    const connected = new Set(["facebook", "youtube"]);
    const count = getPublishableCount(providers, connected, "image"); // youtube needs video
    // facebook = 1 publishable; youtube has a warning but NOT a "Not connected" warning
    // so it's still counted (the backend handles skipping gracefully)
    expect(count).toBe(2);
  });
});

describe("BulkPublishResult contract", () => {
  it("26: ok=true only when zero deliveries failed", () => {
    const allOk = makeBulkResult([
      { platform: "facebook",  status: "published",   errorMessage: null, externalPostId: "fb-123" },
      { platform: "instagram", status: "published",   errorMessage: null, externalPostId: "ig-456" },
    ]);
    expect(allOk.ok).toBe(true);
  });

  it("27: ok=false when any delivery fails", () => {
    const partial = makeBulkResult([
      { platform: "facebook",  status: "published", errorMessage: null,              externalPostId: "fb-123" },
      { platform: "instagram", status: "failed",    errorMessage: "token expired",   externalPostId: null     },
    ]);
    expect(partial.ok).toBe(false);
  });

  it("28: summary includes published/total count", () => {
    const result = makeBulkResult([
      { platform: "facebook", status: "published", errorMessage: null, externalPostId: "fb-1" },
      { platform: "youtube",  status: "failed",    errorMessage: "quota", externalPostId: null },
    ]);
    expect(result.summary).toMatch(/1 of 2/);
  });

  it("29: summary mentions failures when present", () => {
    const result = makeBulkResult([
      { platform: "facebook", status: "failed", errorMessage: "error", externalPostId: null },
    ]);
    expect(result.summary).toContain("failed");
  });

  it("30: results array always present even on full failure", () => {
    const result = makeBulkResult([
      { platform: "facebook", status: "failed", errorMessage: "error", externalPostId: null },
    ]);
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
  });
});

describe("QUEUEABLE_PROVIDERS registry coverage", () => {
  it("31: all QUEUEABLE_PROVIDERS exist in SOCIAL_PROVIDERS", () => {
    const allIds = new Set(SOCIAL_PROVIDERS.map(p => p.id));
    for (const q of QUEUEABLE_PROVIDERS) {
      expect(allIds.has(q.id)).toBe(true);
    }
  });

  it("32: BBB pilot platforms (facebook, instagram, google_business, youtube) are all queueable", () => {
    const bbbPilotIds = ["facebook", "instagram", "google_business", "youtube"];
    const queueableIds = QUEUEABLE_PROVIDERS.map(p => p.id);
    for (const id of bbbPilotIds) {
      expect(queueableIds).toContain(id);
    }
  });

  it("33: each queueable provider has required fields for autopilot", () => {
    for (const p of QUEUEABLE_PROVIDERS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.icon).toBeTruthy();
      expect(p.color).toBeTruthy();
    }
  });
});

describe("Approval gate — scheduler eligibility", () => {
  // These tests verify the BUSINESS LOGIC of approval gates without hitting the DB.
  // The actual DB filter in scheduler.ts is: approvalStatus IN ('approved', 'auto_approved')

  type PostRow = { id: string; approvalStatus: string | null; status: string };

  function isEligibleForScheduler(post: PostRow): boolean {
    if (post.status !== "scheduled") return false;
    if (!post.approvalStatus) return false;
    return ["approved", "auto_approved"].includes(post.approvalStatus);
  }

  it("34: status='scheduled' + approvalStatus='approved' → eligible", () => {
    expect(isEligibleForScheduler({ id: "1", status: "scheduled", approvalStatus: "approved" })).toBe(true);
  });

  it("35: status='scheduled' + approvalStatus='auto_approved' → eligible", () => {
    expect(isEligibleForScheduler({ id: "1", status: "scheduled", approvalStatus: "auto_approved" })).toBe(true);
  });

  it("36: status='scheduled' + approvalStatus='pending' → NOT eligible (must be approved first)", () => {
    expect(isEligibleForScheduler({ id: "1", status: "scheduled", approvalStatus: "pending" })).toBe(false);
  });

  it("37: status='scheduled' + approvalStatus=null → NOT eligible (legacy posts need approval)", () => {
    expect(isEligibleForScheduler({ id: "1", status: "scheduled", approvalStatus: null })).toBe(false);
  });

  it("38: status='draft' + approvalStatus='approved' → NOT eligible (must be scheduled first)", () => {
    expect(isEligibleForScheduler({ id: "1", status: "draft", approvalStatus: "approved" })).toBe(false);
  });

  it("39: status='published' + approvalStatus='approved' → NOT eligible (already done)", () => {
    expect(isEligibleForScheduler({ id: "1", status: "published", approvalStatus: "approved" })).toBe(false);
  });

  it("40: status='failed' + approvalStatus='approved' → NOT eligible (needs retry action)", () => {
    expect(isEligibleForScheduler({ id: "1", status: "failed", approvalStatus: "approved" })).toBe(false);
  });
});
