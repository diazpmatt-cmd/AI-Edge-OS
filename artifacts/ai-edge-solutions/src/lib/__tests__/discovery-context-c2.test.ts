/**
 * Phase C2 — Tests A & B
 *
 * A. DiscoveryContext construction
 * B. Array/object isolation
 */

import { describe, it, expect } from "vitest";
import {
  buildDiscoveryContext,
  toISOWeekLabel,
  getISOWeekNumber,
  parseServiceArea,
  type DiscoveryContext,
} from "../../../../../lib/db/src/discovery-context";
import {
  buildClientContentContext,
  bbbRegistryProvider,
} from "../../../../../lib/db/src/client-context";

// ── Shared fixtures ────────────────────────────────────────────────────────────

const NOW_JULY_12 = new Date("2026-07-12T10:00:00.000Z"); // Week 28 of 2026
const NOW_JAN_01  = new Date("2026-01-01T00:00:00.000Z");
const NOW_DEC_31  = new Date("2025-12-31T23:59:59.000Z");

const BBB_CONTEXT = buildClientContentContext(null, bbbRegistryProvider);

function makeBBBDiscovery(overrides: Partial<Parameters<typeof buildDiscoveryContext>[0]> = {}): DiscoveryContext {
  return buildDiscoveryContext({
    contentContext: BBB_CONTEXT,
    clientId:       "bbb-test-01",
    now:            NOW_JULY_12,
    ...overrides,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// A. DiscoveryContext construction
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-A-1: toISOWeekLabel — deterministic week derivation", () => {
  it("July 12 2026 is week 28 of 2026", () => {
    expect(toISOWeekLabel(NOW_JULY_12)).toBe("2026-W28");
  });

  it("Jan 1 2026 is week 1 of 2026", () => {
    expect(toISOWeekLabel(NOW_JAN_01)).toBe("2026-W01");
  });

  it("Dec 31 2025 is in ISO week 2026-W01 (year boundary: Jan 1 2026 is a Thursday → week starts Dec 29 2025)", () => {
    expect(toISOWeekLabel(NOW_DEC_31)).toBe("2026-W01");
  });

  it("Week number is padded to 2 digits", () => {
    expect(toISOWeekLabel(new Date("2026-03-01T00:00:00.000Z"))).toMatch(/W0[89]/);
  });
});

describe("T-C2-A-2: getISOWeekNumber — boundary values", () => {
  it("returns a value between 1 and 53", () => {
    const week = getISOWeekNumber(NOW_JULY_12);
    expect(week).toBeGreaterThanOrEqual(1);
    expect(week).toBeLessThanOrEqual(53);
  });
});

describe("T-C2-A-3: parseServiceArea — location parsing", () => {
  it("parses 'Foley, AL' correctly", () => {
    const { city, state } = parseServiceArea("Foley, AL");
    expect(city).toBe("Foley");
    expect(state).toBe("AL");
  });

  it("trims extra whitespace", () => {
    const { city, state } = parseServiceArea("  Gulf Shores ,  AL  ");
    expect(city).toBe("Gulf Shores");
    expect(state).toBe("AL");
  });

  it("returns empty strings for empty input", () => {
    const { city, state } = parseServiceArea("");
    expect(city).toBe("");
    expect(state).toBe("");
  });

  it("handles missing state gracefully", () => {
    const { city, state } = parseServiceArea("SomeCity");
    expect(city).toBe("SomeCity");
    expect(state).toBe("");
  });
});

describe("T-C2-A-4: buildDiscoveryContext — core fields", () => {
  it("sets clientId from input", () => {
    const ctx = makeBBBDiscovery({ clientId: "bbb-test-01" });
    expect(ctx.clientId).toBe("bbb-test-01");
  });

  it("sets currentWeek as ISO week label", () => {
    const ctx = makeBBBDiscovery();
    expect(ctx.currentWeek).toBe("2026-W28");
    expect(ctx.currentWeek).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("sets month = 7 for July 12", () => {
    const ctx = makeBBBDiscovery();
    expect(ctx.month).toBe(7);
  });

  it("derives location.city and location.state from first serviceArea", () => {
    const ctx = makeBBBDiscovery();
    expect(ctx.location.city).toBe("Foley");
    expect(ctx.location.state).toBe("AL");
  });

  it("inherits region from ClientContentContext", () => {
    const ctx = makeBBBDiscovery();
    expect(ctx.location.region).toBe(BBB_CONTEXT.region);
  });

  it("snapshotId defaults to 'pending' in C2", () => {
    const ctx = makeBBBDiscovery();
    expect(ctx.snapshotId).toBe("pending");
  });

  it("snapshotId override is respected", () => {
    const ctx = makeBBBDiscovery({ snapshotId: "snap-uuid-1234" });
    expect(ctx.snapshotId).toBe("snap-uuid-1234");
  });

  it("aiSearchGapScore defaults to 50", () => {
    const ctx = makeBBBDiscovery();
    expect(ctx.aiSearchGapScore).toBe(50);
  });

  it("aiSearchGapScore override is clamped 0–100", () => {
    expect(makeBBBDiscovery({ aiSearchGapScore: 75 }).aiSearchGapScore).toBe(75);
    expect(makeBBBDiscovery({ aiSearchGapScore: -10 }).aiSearchGapScore).toBe(0);
    expect(makeBBBDiscovery({ aiSearchGapScore: 150 }).aiSearchGapScore).toBe(100);
  });

  it("discoveryServices is populated (only generatable services)", () => {
    const ctx = makeBBBDiscovery();
    expect(ctx.discoveryServices.length).toBeGreaterThan(0);
    expect(ctx.discoveryServices.every(s => s.generationAllowed)).toBe(true);
  });

  it("passes through clientName and industry from ClientContentContext", () => {
    const ctx = makeBBBDiscovery();
    expect(ctx.clientName).toBe("Bed Bugs & Beyond");
    expect(ctx.industry).toBe("pest_control");
  });
});

describe("T-C2-A-5: buildDiscoveryContext — registry preserved", () => {
  it("registry is the bbbRegistryProvider", () => {
    const ctx = makeBBBDiscovery();
    expect(typeof ctx.registry.getGeneratableServices).toBe("function");
    expect(typeof ctx.registry.matchByTopic).toBe("function");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// B. Array/object isolation
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-B-1: serviceAreas array isolation", () => {
  it("mutating ctx.serviceAreas does not affect the original context", () => {
    const originalAreas = BBB_CONTEXT.serviceAreas.slice();
    const ctx = makeBBBDiscovery();
    ctx.serviceAreas.push("INJECTED");
    expect(BBB_CONTEXT.serviceAreas).toEqual(originalAreas);
  });

  it("two contexts built from the same base do not share serviceAreas array", () => {
    const ctx1 = makeBBBDiscovery();
    const ctx2 = makeBBBDiscovery();
    ctx1.serviceAreas.push("ONLY_IN_CTX1");
    expect(ctx2.serviceAreas).not.toContain("ONLY_IN_CTX1");
  });
});

describe("T-C2-B-2: topics array isolation", () => {
  it("mutating ctx.topics does not affect the original context", () => {
    const originalTopics = BBB_CONTEXT.topics.slice();
    const ctx = makeBBBDiscovery();
    ctx.topics.push("INJECTED_TOPIC");
    expect(BBB_CONTEXT.topics).toEqual(originalTopics);
  });
});

describe("T-C2-B-3: discoveryServices array isolation", () => {
  it("mutating ctx.discoveryServices does not affect the registry", () => {
    const ctx = makeBBBDiscovery();
    const originalCount = ctx.registry.getGeneratableServices().length;
    ctx.discoveryServices.push({} as import("../../../../../lib/db/src/bbb-services").BBBService);
    // Registry remains unchanged
    expect(ctx.registry.getGeneratableServices().length).toBe(originalCount);
  });
});

describe("T-C2-B-4: context determinism", () => {
  it("two calls with identical input produce identical week labels and months", () => {
    const ctx1 = makeBBBDiscovery();
    const ctx2 = makeBBBDiscovery();
    expect(ctx1.currentWeek).toBe(ctx2.currentWeek);
    expect(ctx1.month).toBe(ctx2.month);
    expect(ctx1.location.city).toBe(ctx2.location.city);
  });
});
