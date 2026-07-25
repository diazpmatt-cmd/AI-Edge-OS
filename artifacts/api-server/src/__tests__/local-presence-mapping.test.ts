import { describe, it, expect } from "vitest";
import {
  mapGbpSnapshotToChannelUpdate,
  NO_GBP_AUDIT_UPDATE,
} from "@workspace/db";
import {
  computeOverallPresenceScore,
  computeChannelCompletenessScore,
} from "../lib/local-presence-repository";
import type { LocalPresenceChannel } from "@workspace/db";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date("2026-07-19T12:00:00.000Z");

function makeSnapshot(overrides: Partial<{
  status: string;
  overallScore: number;
  checksPassed: number;
  checksFailed: number;
  checksWarning: number;
  checksPending: number;
  gbpConnected: boolean;
  completedAt: Date | null;
  locationTitle: string | null;
}> = {}) {
  return {
    id: "snap-001",
    clientId: "bed-bugs-and-beyond",
    userId: "user_001",
    status: overrides.status ?? "complete",
    localScore: 30,
    localMaxScore: 41,
    apiScore: overrides.overallScore !== undefined ? overrides.overallScore - 30 : 52,
    apiMaxScore: 59,
    overallScore: overrides.overallScore ?? 82,
    maxScore: 100,
    checksPassed: overrides.checksPassed ?? 20,
    checksWarning: overrides.checksWarning ?? 3,
    checksFailed: overrides.checksFailed ?? 2,
    checksPending: overrides.checksPending ?? 0,
    locationName: "locations/BBB-001",
    locationTitle: overrides.locationTitle ?? "Bed Bugs & Beyond",
    gbpConnected: overrides.gbpConnected ?? true,
    errorMessage: null,
    startedAt: NOW,
    completedAt: overrides.completedAt !== undefined ? overrides.completedAt : NOW,
    createdAt: NOW,
    updatedAt: NOW,
  } as Parameters<typeof mapGbpSnapshotToChannelUpdate>[0];
}

function makeChannel(overrides: Partial<LocalPresenceChannel> = {}): LocalPresenceChannel {
  return {
    id: "ch-001",
    clientId: "bed-bugs-and-beyond",
    channelName: "google_business",
    status: "connected",
    score: 35,
    listingUrl: null,
    verificationStatus: "verified",
    recommendedAction: null,
    metadataJson: null,
    completenessScore: 85,
    lastSyncAt: null,
    providerId: null,
    nextSyncAt: null,
    healthScore: 35,
    issuesJson: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ── mapGbpSnapshotToChannelUpdate ─────────────────────────────────────────────

describe("mapGbpSnapshotToChannelUpdate", () => {
  it("maps a healthy complete snapshot to connected status", () => {
    const result = mapGbpSnapshotToChannelUpdate(makeSnapshot({
      overallScore: 82, checksFailed: 0, checksWarning: 0, gbpConnected: true,
    }));
    expect(result.status).toBe("connected");
    expect(result.verificationStatus).toBe("verified");
    expect(result.score).toBe(82);
    expect(result.healthScore).toBe(82);
    expect(result.issues).toHaveLength(0);
  });

  it("maps a disconnected GBP to setup_in_progress with critical issue", () => {
    const result = mapGbpSnapshotToChannelUpdate(makeSnapshot({ gbpConnected: false }));
    expect(result.status).toBe("setup_in_progress");
    expect(result.verificationStatus).toBe("pending");
    const critical = result.issues.find(i => i.code === "gbp_not_connected");
    expect(critical).toBeDefined();
    expect(critical!.severity).toBe("critical");
  });

  it("produces a high-severity issue for failed checks", () => {
    const result = mapGbpSnapshotToChannelUpdate(makeSnapshot({ checksFailed: 4 }));
    const issue = result.issues.find(i => i.code === "gbp_checks_failed");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("high");
    expect(issue!.message).toContain("4 audit checks failed");
  });

  it("produces a medium-severity issue for warning checks", () => {
    const result = mapGbpSnapshotToChannelUpdate(makeSnapshot({ checksWarning: 2, checksFailed: 0 }));
    const issue = result.issues.find(i => i.code === "gbp_checks_warning");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("medium");
    expect(issue!.message).toContain("2 audit checks need attention");
  });

  it("returns score 0 for an incomplete (running) snapshot", () => {
    const result = mapGbpSnapshotToChannelUpdate(makeSnapshot({
      status: "running", overallScore: 50,
    }));
    expect(result.score).toBe(0);
    expect(result.healthScore).toBe(0);
    expect(result.status).toBe("setup_in_progress");
  });

  it("uses updatedAt when completedAt is null", () => {
    const snap = makeSnapshot({ completedAt: null });
    const result = mapGbpSnapshotToChannelUpdate(snap);
    expect(result.lastSyncAt).toEqual(snap.updatedAt);
  });
});

// ── NO_GBP_AUDIT_UPDATE fallback ─────────────────────────────────────────────

describe("NO_GBP_AUDIT_UPDATE", () => {
  it("has score 0 and a no_audit_run issue", () => {
    expect(NO_GBP_AUDIT_UPDATE.score).toBe(0);
    expect(NO_GBP_AUDIT_UPDATE.healthScore).toBe(0);
    expect(NO_GBP_AUDIT_UPDATE.issues[0].code).toBe("no_audit_run");
    expect(NO_GBP_AUDIT_UPDATE.issues[0].severity).toBe("high");
  });
});

// ── computeChannelCompletenessScore ──────────────────────────────────────────

describe("computeChannelCompletenessScore", () => {
  it("scores 0 for not_started with no URL", () => {
    expect(computeChannelCompletenessScore({ status: "not_started" })).toBe(0);
  });

  it("scores 30 for any started status", () => {
    expect(computeChannelCompletenessScore({ status: "setup_in_progress" })).toBe(30);
  });

  it("scores 55 for connected with listing URL but not verified", () => {
    expect(computeChannelCompletenessScore({
      status: "connected", listingUrl: "https://g.co/biz/bbb",
    })).toBe(85);
  });

  it("scores 100 for connected + listing URL + verified", () => {
    const score = computeChannelCompletenessScore({
      status: "connected",
      listingUrl: "https://g.co/biz/bbb",
      verificationStatus: "verified",
    });
    expect(score).toBe(100);
  });
});

// ── computeOverallPresenceScore with GBP-derived channel ─────────────────────

describe("computeOverallPresenceScore with GBP bridge", () => {
  const baseChannels: LocalPresenceChannel[] = [
    makeChannel({ channelName: "google_business", score: 82, status: "connected" }),
    makeChannel({ id: "ch-002", channelName: "apple_business",  score: 5,  status: "setup_in_progress" }),
    makeChannel({ id: "ch-003", channelName: "bing_places",     score: 10, status: "verified_publishing" }),
    makeChannel({ id: "ch-004", channelName: "facebook",        score: 0,  status: "not_started" }),
    makeChannel({ id: "ch-005", channelName: "yelp",            score: 5,  status: "setup_in_progress" }),
    makeChannel({ id: "ch-006", channelName: "nextdoor",        score: 2,  status: "setup_in_progress" }),
  ];

  it("weights google_business at 40 out of 100 total weight", () => {
    const withGbp82 = computeOverallPresenceScore(baseChannels);
    const withGbp0 = computeOverallPresenceScore(
      baseChannels.map(ch =>
        ch.channelName === "google_business" ? { ...ch, score: 0 } : ch
      )
    );
    const diff = withGbp82 - withGbp0;
    expect(diff).toBeGreaterThan(0);
    expect(diff).toBeLessThanOrEqual(40);
  });

  it("includes NAP bonus when 5+ channels are active", () => {
    const allActive = baseChannels.map(ch => ({ ...ch, status: "connected" as const }));
    const score = computeOverallPresenceScore(allActive);
    const withoutBonus = computeOverallPresenceScore(
      allActive.slice(0, 2)
    );
    expect(score).toBeGreaterThan(withoutBonus);
  });

  it("caps overall score at 100", () => {
    const allPerfect = baseChannels.map(ch => ({ ...ch, score: 100, status: "connected" as const }));
    expect(computeOverallPresenceScore(allPerfect)).toBe(100);
  });
});
