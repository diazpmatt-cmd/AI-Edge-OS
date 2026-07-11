// Phase B4 — Tenant Isolation Tests
// Proves BB&B and Lakeside use separate, disjoint registries with no cross-tenant leakage.
// Uses the same registry infrastructure as B2/B3 tests (no DB required).

import { describe, it, expect } from "vitest";
import {
  getDefaultTopics,
  normalizeTopicsIn,
  validateTopicForGenerationWith,
  type BBBService,
} from "../../../../../lib/db/src/bbb-services";
import {
  bbbRegistryProvider,
} from "../../../../../lib/db/src/client-context";
import {
  createDbServiceRegistryProvider,
  type DbServiceRecord,
} from "../../../../../lib/db/src/db-service-registry-provider";

// ── Lakeside Plumbing fixture registry ────────────────────────────────────────
// Uses the canonical DbServiceRecord format required by createDbServiceRegistryProvider.
// Mirrors the Lakeside fixture from db-service-registry-provider.test.ts (B2).

const LAKESIDE_DB_SERVICES: DbServiceRecord[] = [
  {
    serviceId:              "pipe_repair",
    displayName:            "Pipe Repair",
    category:               "pest" as any,
    status:                 "active",
    priority:               1,
    revenueWeight:          8,
    contentFrequencyWeight: 7,
    urgency:                "high",
    seasonality:            null,
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["homeowners", "property_managers"],
    campaignGoals:          ["call_generation", "inspection_booking"],
    allowedContentAngles:   ["educational", "promotional"],
    prohibitedClaims:       [],
    differentiators:        ["licensed plumber"],
    notes:                  "",
    promptRulePrefix:       null,
    sortOrder:              0,
  },
  {
    serviceId:              "drain_cleaning",
    displayName:            "Drain Cleaning",
    category:               "pest" as any,
    status:                 "active",
    priority:               2,
    revenueWeight:          7,
    contentFrequencyWeight: 6,
    urgency:                "medium",
    seasonality:            null,
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["homeowners"],
    campaignGoals:          ["call_generation", "homeowner_education"],
    allowedContentAngles:   ["educational", "prevention"],
    prohibitedClaims:       [],
    differentiators:        [],
    notes:                  "",
    promptRulePrefix:       null,
    sortOrder:              1,
  },
  {
    serviceId:              "leak_detection",
    displayName:            "Leak Detection",
    category:               "pest" as any,
    status:                 "active",
    priority:               3,
    revenueWeight:          9,
    contentFrequencyWeight: 8,
    urgency:                "high",
    seasonality:            null,
    generationAllowed:      true,
    bookingAllowed:         true,
    publishAllowed:         true,
    ctaAllowed:             true,
    supportedAudiences:     ["homeowners", "commercial"],
    campaignGoals:          ["call_generation"],
    allowedContentAngles:   ["promotional", "educational"],
    prohibitedClaims:       [],
    differentiators:        ["thermal imaging"],
    notes:                  "",
    promptRulePrefix:       null,
    sortOrder:              2,
  },
];

const LAKESIDE_RULES = "BUSINESS RULES:\n- Lakeside Plumbing is a licensed plumber.";
const LAKESIDE_REGISTRY = createDbServiceRegistryProvider(LAKESIDE_DB_SERVICES, LAKESIDE_RULES);
const BBB_REGISTRY      = bbbRegistryProvider;

// ── T-B4-ISO-1: Registry topic sets are disjoint ──────────────────────────────

describe("T-B4-ISO-1: BB&B and Lakeside topic sets are disjoint", () => {
  it("BB&B default topics contain pest-control services", () => {
    const bbbTopics = getDefaultTopics();
    expect(bbbTopics.some(t => t.toLowerCase().includes("bed bug"))).toBe(true);
    expect(bbbTopics.some(t => t.toLowerCase().includes("roach"))).toBe(true);
    expect(bbbTopics.some(t => t.toLowerCase().includes("ant"))).toBe(true);
  });

  it("Lakeside service display names contain plumbing services", () => {
    const lakesideNames = LAKESIDE_DB_SERVICES.map(s => s.displayName);
    expect(lakesideNames).toContain("Drain Cleaning");
    expect(lakesideNames).toContain("Leak Detection");
    expect(lakesideNames).toContain("Pipe Repair");
  });

  it("no BB&B default topic matches any Lakeside service name", () => {
    const bbbTopics = getDefaultTopics();
    const lakesideNames = new Set(LAKESIDE_DB_SERVICES.map(s => s.displayName));
    const overlap = bbbTopics.filter(t => lakesideNames.has(t));
    expect(overlap).toHaveLength(0);
  });

  it("no Lakeside service name matches any BB&B default topic", () => {
    const bbbTopics = new Set(getDefaultTopics());
    const lakesideNames = LAKESIDE_DB_SERVICES.map(s => s.displayName);
    const overlap = lakesideNames.filter(n => bbbTopics.has(n));
    expect(overlap).toHaveLength(0);
  });
});

// ── T-B4-ISO-2: Each registry resolves only its own services ──────────────────

describe("T-B4-ISO-2: each registry resolves only its own services", () => {
  it("BB&B registry matchByTopic finds bed bug service", () => {
    const svc = BBB_REGISTRY.matchByTopic("Bed Bug Inspection");
    expect(svc).toBeDefined();
    expect(svc?.displayName).toBeDefined();
  });

  it("BB&B registry matchByTopic returns undefined for Lakeside plumbing service", () => {
    const svc = BBB_REGISTRY.matchByTopic("Drain Cleaning");
    expect(svc).toBeUndefined();
  });

  it("Lakeside registry matchByTopic finds drain cleaning service", () => {
    const svc = LAKESIDE_REGISTRY.matchByTopic("Drain Cleaning");
    expect(svc).toBeDefined();
    expect(svc?.displayName).toBe("Drain Cleaning");
  });

  it("Lakeside registry matchByTopic returns undefined for BB&B pest service", () => {
    const svc = LAKESIDE_REGISTRY.matchByTopic("Bed Bug Inspection");
    expect(svc).toBeUndefined();
  });

  it("Lakeside registry matchByTopic returns undefined for Roach Control", () => {
    const svc = LAKESIDE_REGISTRY.matchByTopic("Roach Control");
    expect(svc).toBeUndefined();
  });
});

// ── T-B4-ISO-3: validateTopic returns null (allow) for registry's own services

describe("T-B4-ISO-3: validateTopic allows each registry's own services", () => {
  it("BB&B registry allows Bed Bug Inspection (returns null)", () => {
    expect(BBB_REGISTRY.validateTopic("Bed Bug Inspection")).toBeNull();
  });

  it("BB&B registry allows Roach Control", () => {
    expect(BBB_REGISTRY.validateTopic("Roach Control")).toBeNull();
  });

  it("Lakeside registry allows Drain Cleaning (returns null)", () => {
    expect(LAKESIDE_REGISTRY.validateTopic("Drain Cleaning")).toBeNull();
  });

  it("Lakeside registry allows Leak Detection", () => {
    expect(LAKESIDE_REGISTRY.validateTopic("Leak Detection")).toBeNull();
  });
});

// ── T-B4-ISO-4: getDefaultTopics / selectWeeklySlots are provider-scoped ─────

describe("T-B4-ISO-4: weekly slot selection is per-registry", () => {
  it("BB&B weekly slots contain pest-control services, not plumbing", () => {
    const bbbSlots = BBB_REGISTRY.selectWeeklySlots(7);
    const names = bbbSlots.map(s => s.service.displayName);
    const hasPest = names.some(n =>
      n.toLowerCase().includes("bed bug") ||
      n.toLowerCase().includes("roach") ||
      n.toLowerCase().includes("ant"),
    );
    expect(hasPest).toBe(true);
    const hasPlumbing = names.some(n =>
      n.toLowerCase().includes("drain") ||
      n.toLowerCase().includes("pipe") ||
      n.toLowerCase().includes("water heater"),
    );
    expect(hasPlumbing).toBe(false);
  });

  it("Lakeside weekly slots contain plumbing services, not pest-control", () => {
    const lakesideSlots = LAKESIDE_REGISTRY.selectWeeklySlots(3);
    const names = lakesideSlots.map(s => s.service.displayName);
    expect(names.length).toBeGreaterThan(0);
    const hasPlumbing = names.some(n =>
      n === "Drain Cleaning" || n === "Leak Detection" || n === "Pipe Repair",
    );
    expect(hasPlumbing).toBe(true);
    const hasPest = names.some(n =>
      n.toLowerCase().includes("bed bug") || n.toLowerCase().includes("termite"),
    );
    expect(hasPest).toBe(false);
  });
});

// ── T-B4-ISO-5: Mutable arrays — provider instances do not share state ────────

describe("T-B4-ISO-5: provider instances are independent (no shared mutable state)", () => {
  it("selectWeeklySlots on BB&B does not contaminate Lakeside service IDs", () => {
    BBB_REGISTRY.selectWeeklySlots(7); // exercise BB&B — must not affect Lakeside
    const afterLakeside = LAKESIDE_REGISTRY.selectWeeklySlots(3).map(s => s.service.serviceId);
    const lakesideIds = new Set(LAKESIDE_DB_SERVICES.map(s => s.serviceId));
    // All Lakeside slot service IDs must belong to Lakeside
    for (const id of afterLakeside) {
      expect(lakesideIds.has(id)).toBe(true);
    }
  });

  it("two separate createDbServiceRegistryProvider instances produce independent Lakeside registries", () => {
    const registryA = createDbServiceRegistryProvider(LAKESIDE_DB_SERVICES, LAKESIDE_RULES);
    const registryB = createDbServiceRegistryProvider(LAKESIDE_DB_SERVICES, LAKESIDE_RULES);
    const slotsA = registryA.selectWeeklySlots(3).map(s => s.service.serviceId);
    const slotsB = registryB.selectWeeklySlots(3).map(s => s.service.serviceId);
    const lakesideIds = new Set(LAKESIDE_DB_SERVICES.map(s => s.serviceId));
    // Both instances must only return Lakeside service IDs
    for (const id of [...slotsA, ...slotsB]) {
      expect(lakesideIds.has(id)).toBe(true);
    }
  });
});

// ── T-B4-ISO-6: normalizeTopics uses per-registry services ────────────────────

describe("T-B4-ISO-6: normalizeTopics uses per-registry service list", () => {
  it("BB&B normalizeTopics preserves BB&B services", () => {
    const normalized = BBB_REGISTRY.normalizeTopics(["Bed Bug Inspection", "Roach Control"]);
    expect(normalized).toContain("Bed Bug Inspection");
    expect(normalized).toContain("Roach Control");
  });

  it("Lakeside normalizeTopics preserves plumbing services", () => {
    const normalized = LAKESIDE_REGISTRY.normalizeTopics(["Drain Cleaning", "Leak Detection"]);
    expect(normalized).toContain("Drain Cleaning");
    expect(normalized).toContain("Leak Detection");
  });

  it("Lakeside normalizeTopics removes hard-blocked pest keywords (wildlife/heat treatment)", () => {
    const result = LAKESIDE_REGISTRY.normalizeTopics(["Drain Cleaning", "wildlife removal"]);
    expect(result).toContain("Drain Cleaning");
    expect(result).not.toContain("wildlife removal");
  });

  it("BB&B normalizeTopics does not add Lakeside plumbing topics", () => {
    const bbbTopics = BBB_REGISTRY.normalizeTopics(["Bed Bug Inspection"]);
    expect(bbbTopics).not.toContain("Drain Cleaning");
    expect(bbbTopics).not.toContain("Pipe Repair");
  });
});

// ── T-B4-ISO-7: One tenant failure does not contaminate the other ──────────────

describe("T-B4-ISO-7: registry operations are non-contaminating", () => {
  it("Lakeside matchByTopic remains correct after BB&B processes unexpected input", () => {
    BBB_REGISTRY.validateTopic("WILDLIFE");
    BBB_REGISTRY.validateTopic("TERMITES");
    const svc = LAKESIDE_REGISTRY.matchByTopic("Drain Cleaning");
    expect(svc).toBeDefined();
    expect(svc?.displayName).toBe("Drain Cleaning");
  });

  it("BB&B matchByTopic remains correct after Lakeside processes unexpected input", () => {
    LAKESIDE_REGISTRY.validateTopic("Bed Bug Inspection"); // unknown to Lakeside, must not crash
    const svc = BBB_REGISTRY.matchByTopic("Bed Bug Inspection");
    expect(svc).toBeDefined();
  });

  it("getDefaultTopics from BB&B are unchanged after Lakeside registry is exercised", () => {
    LAKESIDE_REGISTRY.selectWeeklySlots(3);
    LAKESIDE_REGISTRY.normalizeTopics(["wildlife removal", "heat treatment"]);
    const bbbTopics = getDefaultTopics();
    expect(bbbTopics.some(t => t.toLowerCase().includes("bed bug"))).toBe(true);
  });
});
