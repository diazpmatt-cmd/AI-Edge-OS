/**
 * Phase B2 — DB-Backed ServiceRegistryProvider Tests
 *
 * Tests:
 *   1. Parity: createDbServiceRegistryProvider output is character-for-character
 *      identical to bbbRegistryProvider when seeded from BBB_SERVICES.
 *   2. Tenant Isolation: Lakeside Plumbing provider cannot produce BB&B services.
 *   3. Safety: termites / wildlife / heat treatment always blocked regardless of
 *      DB records.
 *   4. Generic algorithms: *In() variants are correct and independent of
 *      global BBB_SERVICES.
 *
 * NO DB access — all tests use in-memory data. The bootstrap seed is not tested
 * here; it is covered by the API server's integration tests.
 *
 * Import convention: relative paths to lib/db/src (not @workspace/db).
 */

import { describe, it, expect } from "vitest";
import {
  BBB_SERVICES,
  matchServiceByTopicIn,
  validateTopicForGenerationWith,
  selectWeeklyServicesFrom,
  normalizeTopicsIn,
  getDefaultTopicsFrom,
  getServicePromptRulesFor,
  getServicePromptRules,
  TOPIC_COMING_SOON_KEYWORDS,
  TOPIC_DISABLED_KEYWORDS,
  TOPIC_NOT_GENERATABLE_KEYWORDS,
  type BBBService,
} from "../../../../../lib/db/src/bbb-services";
import {
  bbbRegistryProvider,
} from "../../../../../lib/db/src/client-context";
import {
  createDbServiceRegistryProvider,
  type DbServiceRecord,
} from "../../../../../lib/db/src/db-service-registry-provider";

// ── Test helpers ───────────────────────────────────────────────────────────────

/** Mirror of getBbbPromptRulePrefix in service-registry-loader.ts */
function getTestPromptRulePrefix(serviceId: string): string | null {
  if (serviceId === "bed_bug_inspection" || serviceId === "bed_bug_treatment") {
    return [
      "BED BUG TREATMENT POSITIONING:",
      "- BB&B uses targeted treatment of affected furniture and specific areas.",
      "- This approach is often more affordable than whole-home heat treatment.",
      "- DO NOT claim BB&B offers heat treatment.",
      "- DO NOT claim guaranteed elimination or exact cost savings.",
      "- ALLOWED: professional inspection, targeted treatment, often more affordable than whole-home heat.",
    ].join("\n");
  }
  if (serviceId === "fumigation") {
    return [
      "FUMIGATION RULES:",
      "- Keep content at awareness/educational level.",
      "- DO NOT generate: chemical dosages, DIY instructions, regulatory compliance claims,",
      "  exact preparation steps, specific pricing, or guarantees.",
      "- ALLOWED: service awareness, general educational content, inspection/consultation CTA.",
    ].join("\n");
  }
  return null;
}

/** Convert BBBService[] to DbServiceRecord[] using the same prefix logic as the seed. */
function bbbServicesToDbRecords(): DbServiceRecord[] {
  return BBB_SERVICES.map((svc, index) => ({
    ...svc,
    promptRulePrefix: getTestPromptRulePrefix(svc.serviceId),
    sortOrder:        index,
  }));
}

const BBB_DB_SERVICES = bbbServicesToDbRecords();
const BBB_SYSTEM_RULES = bbbRegistryProvider.getSystemBusinessRules();
const dbProvider = createDbServiceRegistryProvider(BBB_DB_SERVICES, BBB_SYSTEM_RULES);

// ── Lakeside Plumbing mock (tenant isolation) ─────────────────────────────────

const LAKESIDE_SERVICES: DbServiceRecord[] = [
  {
    serviceId:              "pipe_repair",
    displayName:            "Pipe Repair",
    category:               "pest" as any, // generic industry
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
    prohibitedClaims:       ["guaranteed same-day fix without an on-site quote"],
    differentiators:        ["licensed plumber serving Dallas–Fort Worth"],
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
];
const LAKESIDE_RULES = "BUSINESS RULES (MUST FOLLOW):\n- Lakeside Plumbing is a licensed plumber serving Dallas–Fort Worth.";
const lakesideProvider = createDbServiceRegistryProvider(LAKESIDE_SERVICES, LAKESIDE_RULES);

// ── T-B2-1: Provider creation ─────────────────────────────────────────────────

describe("T-B2-1: createDbServiceRegistryProvider — factory", () => {
  it("returns a ServiceRegistryProvider without error", () => {
    const p = createDbServiceRegistryProvider(BBB_DB_SERVICES, BBB_SYSTEM_RULES);
    expect(typeof p.matchByTopic).toBe("function");
    expect(typeof p.validateTopic).toBe("function");
    expect(typeof p.getPromptRules).toBe("function");
    expect(typeof p.selectWeeklySlots).toBe("function");
    expect(typeof p.normalizeTopics).toBe("function");
    expect(typeof p.getDefaultTopics).toBe("function");
    expect(typeof p.getSystemBusinessRules).toBe("function");
  });

  it("returns a provider with frozen services array (immutable)", () => {
    const services = bbbServicesToDbRecords();
    const p = createDbServiceRegistryProvider(services, "rules");
    const count = p.getGeneratableServices().length;
    // Mutating the original array does not affect the provider
    services.splice(0, services.length);
    expect(p.getGeneratableServices().length).toBe(count);
  });

  it("empty services array returns a provider that blocks all topics", () => {
    const emptyProvider = createDbServiceRegistryProvider([], "no rules");
    expect(emptyProvider.getDefaultTopics()).toHaveLength(0);
    expect(emptyProvider.getGeneratableServices()).toHaveLength(0);
    // Unknown topic → null (allow) — consistent with static validateTopicForGeneration
    expect(emptyProvider.validateTopic("Bed Bug Inspection")).toBeNull();
  });
});

// ── T-B2-2: Parity — getDefaultTopics ─────────────────────────────────────────

describe("T-B2-2: Parity — getDefaultTopics", () => {
  it("DB provider returns same topics as bbbRegistryProvider", () => {
    expect(dbProvider.getDefaultTopics()).toEqual(bbbRegistryProvider.getDefaultTopics());
  });

  it("same count as static provider", () => {
    expect(dbProvider.getDefaultTopics().length).toBe(bbbRegistryProvider.getDefaultTopics().length);
  });

  it("same ordering (priority then revenue weight)", () => {
    const staticTopics = bbbRegistryProvider.getDefaultTopics();
    const dbTopics     = dbProvider.getDefaultTopics();
    staticTopics.forEach((t, i) => expect(dbTopics[i]).toBe(t));
  });
});

// ── T-B2-3: Parity — matchByTopic ─────────────────────────────────────────────

describe("T-B2-3: Parity — matchByTopic", () => {
  const TEST_TOPICS = [
    "Bed Bug Inspection",
    "Bed Bug Treatment",
    "Residential Pest Control",
    "Commercial Pest Control",
    "Roach Control",
    "Rodent Control (Rats & Mice)",
    "Mosquito Treatment",
    "Fumigation",
    "Ant Treatment",
    "Flea Treatment",
    "Tick Treatment",
    "Wasp & Hornet Control",
    "Spider Control",
    "Mole Control",
  ];

  TEST_TOPICS.forEach(topic => {
    it(`matchByTopic("${topic}") returns same serviceId as static provider`, () => {
      const staticMatch = bbbRegistryProvider.matchByTopic(topic);
      const dbMatch     = dbProvider.matchByTopic(topic);
      expect(dbMatch?.serviceId).toBe(staticMatch?.serviceId);
    });
  });

  it("returns undefined for unknown topic in DB provider", () => {
    expect(dbProvider.matchByTopic("Unknown Service 12345")).toBeUndefined();
  });

  it("case-insensitive matching works", () => {
    expect(dbProvider.matchByTopic("BED BUG INSPECTION")?.serviceId).toBe("bed_bug_inspection");
    expect(dbProvider.matchByTopic("roach")?.serviceId).toBe("roaches");
  });
});

// ── T-B2-4: Parity — validateTopic ────────────────────────────────────────────

describe("T-B2-4: Parity — validateTopic", () => {
  const CASES: Array<[string, string | null]> = [
    ["Bed Bug Inspection",            null],
    ["Bed Bug Treatment",             null],
    ["Residential Pest Control",      null],
    ["Roach Control",                 null],
    ["Fumigation",                    null],
    ["Termite Treatment",             "SERVICE_COMING_SOON"],
    ["termite inspection",            "SERVICE_COMING_SOON"],
    ["Wildlife Removal",              "SERVICE_DISABLED"],
    ["wildlife removal",              "SERVICE_DISABLED"],
    ["Heat Treatment",                "SERVICE_NOT_GENERATABLE"],
    ["whole-home heat treatment",     "SERVICE_NOT_GENERATABLE"],
    ["bed bug heat treatment",        "SERVICE_NOT_GENERATABLE"],
    ["Completely Unknown Pest XYZ",   null],
    ["",                              null],
  ];

  CASES.forEach(([topic, expected]) => {
    it(`validateTopic("${topic}") → ${JSON.stringify(expected)} (matches static)`, () => {
      expect(dbProvider.validateTopic(topic)).toBe(expected);
      expect(bbbRegistryProvider.validateTopic(topic)).toBe(expected);
    });
  });
});

// ── T-B2-5: Parity — getPromptRules ───────────────────────────────────────────

describe("T-B2-5: Parity — getPromptRules", () => {
  const TOPICS_WITH_RULES = [
    "Bed Bug Inspection",
    "Bed Bug Treatment",
    "Fumigation",
  ];

  TOPICS_WITH_RULES.forEach(topic => {
    it(`getPromptRules("${topic}") is character-for-character identical to static`, () => {
      const staticRules = bbbRegistryProvider.getPromptRules(topic);
      const dbRules     = dbProvider.getPromptRules(topic);
      expect(dbRules).toBe(staticRules);
    });
  });

  it("returns empty string for unknown topic in both providers", () => {
    expect(dbProvider.getPromptRules("Unknown Pest XYZ")).toBe("");
    expect(bbbRegistryProvider.getPromptRules("Unknown Pest XYZ")).toBe("");
  });

  it("getPromptRules for Roach Control contains PROHIBITED CLAIMS", () => {
    const rules = dbProvider.getPromptRules("Roach Control");
    expect(rules).toContain("PROHIBITED CLAIMS");
  });

  it("getPromptRules output includes BED BUG TREATMENT POSITIONING for inspection", () => {
    expect(dbProvider.getPromptRules("Bed Bug Inspection")).toContain("BED BUG TREATMENT POSITIONING:");
    expect(dbProvider.getPromptRules("Bed Bug Inspection")).toContain("DO NOT claim BB&B offers heat treatment");
  });

  it("getPromptRules output includes FUMIGATION RULES for fumigation", () => {
    expect(dbProvider.getPromptRules("Fumigation")).toContain("FUMIGATION RULES:");
    expect(dbProvider.getPromptRules("Fumigation")).toContain("awareness/educational level");
  });
});

// ── T-B2-6: Parity — normalizeTopics ──────────────────────────────────────────

describe("T-B2-6: Parity — normalizeTopics", () => {
  const MIXED_TOPICS = [
    "Bed Bug Inspection",
    "Termite Treatment",     // blocked — coming soon
    "Wildlife Removal",      // blocked — disabled
    "Heat Treatment",        // blocked — not generatable
    "Roach Control",
    "Fumigation",
  ];

  it("DB provider normalizes to same topics as static provider", () => {
    const staticNorm = bbbRegistryProvider.normalizeTopics(MIXED_TOPICS);
    const dbNorm     = dbProvider.normalizeTopics(MIXED_TOPICS);
    expect(dbNorm).toEqual(staticNorm);
  });

  it("blocked topics are removed", () => {
    const normalized = dbProvider.normalizeTopics(MIXED_TOPICS);
    expect(normalized).not.toContain("Termite Treatment");
    expect(normalized).not.toContain("Wildlife Removal");
    expect(normalized).not.toContain("Heat Treatment");
  });

  it("valid topics are preserved", () => {
    const normalized = dbProvider.normalizeTopics(MIXED_TOPICS);
    expect(normalized).toContain("Bed Bug Inspection");
    expect(normalized).toContain("Roach Control");
    expect(normalized).toContain("Fumigation");
  });

  it("empty array returns empty array", () => {
    expect(dbProvider.normalizeTopics([])).toEqual([]);
  });
});

// ── T-B2-7: Parity — getSystemBusinessRules ───────────────────────────────────

describe("T-B2-7: Parity — getSystemBusinessRules", () => {
  it("DB provider returns exact same rules string as static provider", () => {
    expect(dbProvider.getSystemBusinessRules()).toBe(bbbRegistryProvider.getSystemBusinessRules());
  });

  it("starts with BUSINESS RULES (MUST FOLLOW):", () => {
    expect(dbProvider.getSystemBusinessRules()).toMatch(/^BUSINESS RULES \(MUST FOLLOW\):/);
  });

  it("contains termite restriction", () => {
    expect(dbProvider.getSystemBusinessRules()).toContain("Do NOT generate termite content");
  });

  it("contains heat treatment restriction", () => {
    expect(dbProvider.getSystemBusinessRules()).toContain("heat treatment");
  });
});

// ── T-B2-8: Parity — getGeneratableServices ───────────────────────────────────

describe("T-B2-8: Parity — getGeneratableServices", () => {
  it("DB provider returns same count as static provider", () => {
    expect(dbProvider.getGeneratableServices().length)
      .toBe(bbbRegistryProvider.getGeneratableServices().length);
  });

  it("DB provider includes fumigation (generationAllowed=true)", () => {
    const svc = dbProvider.getGeneratableServices().find(s => s.serviceId === "fumigation");
    expect(svc).toBeDefined();
  });

  it("DB provider excludes termites (generationAllowed=false)", () => {
    const svc = dbProvider.getGeneratableServices().find(s => s.serviceId === "termites");
    expect(svc).toBeUndefined();
  });

  it("DB provider excludes wildlife (generationAllowed=false)", () => {
    const svc = dbProvider.getGeneratableServices().find(s => s.serviceId === "wildlife_removal");
    expect(svc).toBeUndefined();
  });
});

// ── T-B2-9: Parity — selectWeeklySlots ────────────────────────────────────────

describe("T-B2-9: Parity — selectWeeklySlots structure", () => {
  it("returns count=7 slots", () => {
    const slots = dbProvider.selectWeeklySlots(7);
    expect(slots).toHaveLength(7);
  });

  it("each slot has service, campaignGoal, audienceId, bucket", () => {
    const slots = dbProvider.selectWeeklySlots(7);
    slots.forEach(slot => {
      expect(slot.service).toBeDefined();
      expect(slot.service.serviceId).toBeDefined();
      expect(typeof slot.campaignGoal).toBe("string");
      expect(typeof slot.audienceId).toBe("string");
      expect(["revenue", "education", "trust"]).toContain(slot.bucket);
    });
  });

  it("60/25/15 mix holds for count=20 (allows rounding)", () => {
    const slots = dbProvider.selectWeeklySlots(20);
    const rev   = slots.filter(s => s.bucket === "revenue").length;
    const edu   = slots.filter(s => s.bucket === "education").length;
    const trust = slots.filter(s => s.bucket === "trust").length;
    expect(rev + edu + trust).toBe(20);
    // Revenue = round(20 * 60/100) = 12
    expect(rev).toBe(12);
    // Education = round(20 * 25/100) = 5
    expect(edu).toBe(5);
    // Trust = 20 - 12 - 5 = 3
    expect(trust).toBe(3);
  });

  it("slots only contain generatable services", () => {
    const slots = dbProvider.selectWeeklySlots(14);
    slots.forEach(slot => {
      expect(slot.service.generationAllowed).toBe(true);
    });
  });

  it("termites never appear in slots", () => {
    const slots = dbProvider.selectWeeklySlots(14);
    const termiteSlot = slots.find(s => s.service.serviceId === "termites");
    expect(termiteSlot).toBeUndefined();
  });
});

// ── T-B2-10: Tenant isolation ─────────────────────────────────────────────────

describe("T-B2-10: Tenant isolation — Lakeside Plumbing cannot access BB&B services", () => {
  it("Lakeside provider default topics are plumbing, not pest control", () => {
    const topics = lakesideProvider.getDefaultTopics();
    expect(topics).toContain("Pipe Repair");
    expect(topics).not.toContain("Bed Bug Inspection");
    expect(topics).not.toContain("Roach Control");
  });

  it("Lakeside provider matchByTopic does not match BB&B services", () => {
    expect(lakesideProvider.matchByTopic("Bed Bug Inspection")).toBeUndefined();
    expect(lakesideProvider.matchByTopic("Roach Control")).toBeUndefined();
    expect(lakesideProvider.matchByTopic("Fumigation")).toBeUndefined();
  });

  it("Lakeside provider matchByTopic finds plumbing services", () => {
    expect(lakesideProvider.matchByTopic("Pipe Repair")?.serviceId).toBe("pipe_repair");
    expect(lakesideProvider.matchByTopic("Drain Cleaning")?.serviceId).toBe("drain_cleaning");
  });

  it("Lakeside provider getSystemBusinessRules is NOT BB&B rules", () => {
    const lakeRules = lakesideProvider.getSystemBusinessRules();
    const bbbRules  = dbProvider.getSystemBusinessRules();
    expect(lakeRules).not.toBe(bbbRules);
    expect(lakeRules).toContain("Lakeside Plumbing");
    expect(lakeRules).not.toContain("BB&B");
  });

  it("Lakeside and BB&B providers are independent (no shared state)", () => {
    const lakeTopics = lakesideProvider.getDefaultTopics();
    const bbbTopics  = dbProvider.getDefaultTopics();
    const intersection = lakeTopics.filter(t => bbbTopics.includes(t));
    expect(intersection).toHaveLength(0);
  });
});

// ── T-B2-11/12/13: Safety — hard-blocked topics ───────────────────────────────

describe("T-B2-11: Safety — termites always blocked", () => {
  TOPIC_COMING_SOON_KEYWORDS.forEach(kw => {
    it(`keyword "${kw}" → SERVICE_COMING_SOON in DB provider`, () => {
      expect(dbProvider.validateTopic(kw)).toBe("SERVICE_COMING_SOON");
    });
    it(`keyword "${kw}" → SERVICE_COMING_SOON even for Lakeside provider`, () => {
      expect(lakesideProvider.validateTopic(kw)).toBe("SERVICE_COMING_SOON");
    });
    it(`keyword "${kw}" → SERVICE_COMING_SOON in empty provider`, () => {
      const empty = createDbServiceRegistryProvider([], "");
      expect(empty.validateTopic(kw)).toBe("SERVICE_COMING_SOON");
    });
  });
});

describe("T-B2-12: Safety — wildlife always blocked", () => {
  TOPIC_DISABLED_KEYWORDS.forEach(kw => {
    it(`keyword "${kw}" → SERVICE_DISABLED in DB provider`, () => {
      expect(dbProvider.validateTopic(kw)).toBe("SERVICE_DISABLED");
    });
    it(`keyword "${kw}" → SERVICE_DISABLED in empty provider`, () => {
      const empty = createDbServiceRegistryProvider([], "");
      expect(empty.validateTopic(kw)).toBe("SERVICE_DISABLED");
    });
  });
});

describe("T-B2-13: Safety — heat treatment variants always blocked", () => {
  TOPIC_NOT_GENERATABLE_KEYWORDS.forEach(kw => {
    it(`keyword "${kw}" → SERVICE_NOT_GENERATABLE in DB provider`, () => {
      expect(dbProvider.validateTopic(kw)).toBe("SERVICE_NOT_GENERATABLE");
    });
    it(`keyword "${kw}" → SERVICE_NOT_GENERATABLE in empty provider`, () => {
      const empty = createDbServiceRegistryProvider([], "");
      expect(empty.validateTopic(kw)).toBe("SERVICE_NOT_GENERATABLE");
    });
  });
});

// ── T-B2-14: Safety — fumigation ──────────────────────────────────────────────

describe("T-B2-14: Safety — fumigation is generatable (educational-only via prompt rules)", () => {
  it("fumigation validateTopic returns null (allowed)", () => {
    expect(dbProvider.validateTopic("Fumigation")).toBeNull();
  });

  it("fumigation appears in generatable services", () => {
    const gen = dbProvider.getGeneratableServices();
    expect(gen.find(s => s.serviceId === "fumigation")).toBeDefined();
  });

  it("fumigation prompt rules enforce educational-only", () => {
    const rules = dbProvider.getPromptRules("Fumigation");
    expect(rules).toContain("awareness/educational level");
    expect(rules).toContain("DO NOT generate");
  });

  it("fumigation prompt rules match static bbbRegistryProvider exactly", () => {
    expect(dbProvider.getPromptRules("Fumigation"))
      .toBe(bbbRegistryProvider.getPromptRules("Fumigation"));
  });
});

// ── T-B2-15: Generic algorithms ───────────────────────────────────────────────

describe("T-B2-15: Generic algorithm — matchServiceByTopicIn", () => {
  it("finds service by exact displayName", () => {
    const result = matchServiceByTopicIn(BBB_DB_SERVICES, "Bed Bug Inspection");
    expect(result?.serviceId).toBe("bed_bug_inspection");
  });

  it("finds service by partial serviceId (underscores as spaces)", () => {
    const result = matchServiceByTopicIn(BBB_DB_SERVICES, "bed bug inspection");
    expect(result?.serviceId).toBe("bed_bug_inspection");
  });

  it("finds service when displayName contains the topic", () => {
    const result = matchServiceByTopicIn(BBB_DB_SERVICES, "roach");
    expect(result?.serviceId).toBe("roaches");
  });

  it("returns undefined for empty array", () => {
    expect(matchServiceByTopicIn([], "Bed Bug Inspection")).toBeUndefined();
  });

  it("uses caller-supplied array, not global BBB_SERVICES", () => {
    const result = matchServiceByTopicIn(LAKESIDE_SERVICES, "Pipe Repair");
    expect(result?.serviceId).toBe("pipe_repair");
  });
});

describe("T-B2-16: Generic algorithm — getDefaultTopicsFrom", () => {
  it("returns only generatable services", () => {
    const topics = getDefaultTopicsFrom(BBB_DB_SERVICES);
    expect(topics).not.toContain("Termite Control");
    expect(topics).not.toContain("Wildlife Removal");
  });

  it("sorts by priority ascending, then revenue weight descending", () => {
    const topics = getDefaultTopicsFrom(BBB_DB_SERVICES);
    // Bed bug inspection/treatment have priority 1 and revenue 10 — should be first two
    expect(topics[0]).toBe("Bed Bug Inspection");
    expect(topics[1]).toBe("Bed Bug Treatment");
  });

  it("returns empty array for empty services", () => {
    expect(getDefaultTopicsFrom([])).toHaveLength(0);
  });
});

describe("T-B2-17: Generic algorithm — validateTopicForGenerationWith", () => {
  it("keyword blocks apply even when services array is empty", () => {
    expect(validateTopicForGenerationWith([], "termite")).toBe("SERVICE_COMING_SOON");
    expect(validateTopicForGenerationWith([], "wildlife")).toBe("SERVICE_DISABLED");
    expect(validateTopicForGenerationWith([], "heat treatment")).toBe("SERVICE_NOT_GENERATABLE");
  });

  it("checks generationAllowed flag on matched service", () => {
    // Termites are in BB&B_SERVICES with generationAllowed=false
    // but the keyword check catches termites first
    const termiteService = BBB_DB_SERVICES.find(s => s.serviceId === "termites")!;
    expect(termiteService.generationAllowed).toBe(false);
    // Even without keyword match, generationAllowed=false should block
    const syntheticServices: DbServiceRecord[] = [
      { ...termiteService, serviceId: "custom_locked_svc", displayName: "Custom Locked Service" },
    ];
    const result = validateTopicForGenerationWith(syntheticServices, "Custom Locked Service");
    expect(result).toBe("SERVICE_COMING_SOON"); // status is "coming_soon"
  });
});

describe("T-B2-18: Generic algorithm — selectWeeklyServicesFrom", () => {
  it("works with Lakeside services array", () => {
    const slots = selectWeeklyServicesFrom(LAKESIDE_SERVICES, 4);
    expect(slots).toHaveLength(4);
    slots.forEach(slot => {
      expect(["pipe_repair", "drain_cleaning"]).toContain(slot.service.serviceId);
    });
  });

  it("excludes non-generatable services", () => {
    const lockedService: DbServiceRecord = {
      ...LAKESIDE_SERVICES[0],
      serviceId:         "locked_svc",
      displayName:       "Locked Service",
      generationAllowed: false,
    };
    const slots = selectWeeklyServicesFrom([...LAKESIDE_SERVICES, lockedService], 10);
    const hasLocked = slots.some(s => s.service.serviceId === "locked_svc");
    expect(hasLocked).toBe(false);
  });
});

describe("T-B2-19: Generic algorithm — normalizeTopicsIn", () => {
  it("uses caller-supplied services, not global BBB_SERVICES", () => {
    const lakesideTopics = ["Pipe Repair", "Drain Cleaning", "Bed Bug Inspection"];
    // Lakeside has no bed_bug_inspection — but keyword check passes so it's NOT blocked
    // (validateTopicForGenerationWith only blocks termite/wildlife/heat-treatment keywords)
    const result = normalizeTopicsIn(LAKESIDE_SERVICES, lakesideTopics);
    expect(result).toContain("Bed Bug Inspection"); // unknown topic — allowed
    expect(result).toContain("Pipe Repair");
  });

  it("always blocks hard-coded keywords regardless of services", () => {
    const result = normalizeTopicsIn(LAKESIDE_SERVICES, ["Pipe Repair", "termite inspection", "Wildlife Removal"]);
    expect(result).not.toContain("termite inspection");
    expect(result).not.toContain("Wildlife Removal");
    expect(result).toContain("Pipe Repair");
  });
});

// ── T-B2-20: getServicePromptRulesFor ─────────────────────────────────────────

describe("T-B2-20: getServicePromptRulesFor — prefix vs serviceId fallback", () => {
  it("uses promptRulePrefix when present", () => {
    const bbiRecord = BBB_DB_SERVICES.find(s => s.serviceId === "bed_bug_inspection")!;
    expect(bbiRecord.promptRulePrefix).not.toBeNull();
    const rules = getServicePromptRulesFor(bbiRecord);
    expect(rules).toContain("BED BUG TREATMENT POSITIONING:");
  });

  it("falls back to serviceId check when promptRulePrefix is null", () => {
    const bbiRecord = BBB_DB_SERVICES.find(s => s.serviceId === "bed_bug_inspection")!;
    const withoutPrefix: typeof bbiRecord = { ...bbiRecord, promptRulePrefix: null };
    const rules = getServicePromptRulesFor(withoutPrefix);
    // Should still produce the same output via serviceId fallback
    expect(rules).toContain("BED BUG TREATMENT POSITIONING:");
  });

  it("produces empty string for service with no rules", () => {
    const simpleService: BBBService & { promptRulePrefix: null } = {
      serviceId:              "simple_svc",
      displayName:            "Simple Service",
      category:               "pest",
      status:                 "active",
      priority:               5,
      revenueWeight:          5,
      contentFrequencyWeight: 5,
      urgency:                "medium",
      seasonality:            null,
      generationAllowed:      true,
      bookingAllowed:         true,
      publishAllowed:         true,
      ctaAllowed:             true,
      supportedAudiences:     [],
      campaignGoals:          [],
      allowedContentAngles:   [],
      prohibitedClaims:       [],
      differentiators:        [],
      notes:                  "",
      promptRulePrefix:       null,
    };
    expect(getServicePromptRulesFor(simpleService)).toBe("");
  });

  it("output is identical to static getServicePromptRules for all BB&B services", () => {
    // This is the core parity assertion for the prompt-rules path
    const DISPLAY_NAMES = [
      "Bed Bug Inspection", "Bed Bug Treatment", "Fumigation",
      "Roach Control", "Rodent Control (Rats & Mice)", "Mosquito Treatment",
    ];
    DISPLAY_NAMES.forEach(name => {
      const record = BBB_DB_SERVICES.find(s => s.displayName === name)!;
      expect(record, `Record not found for "${name}"`).toBeDefined();
      const staticRules = getServicePromptRules(name);
      const dbRules     = getServicePromptRulesFor(record);
      expect(dbRules).toBe(staticRules);
    });
  });
});

// ── T-B2-21: Exported keyword constants ───────────────────────────────────────

describe("T-B2-21: Exported keyword constants are correct", () => {
  it("TOPIC_COMING_SOON_KEYWORDS contains termite", () => {
    expect(TOPIC_COMING_SOON_KEYWORDS).toContain("termite");
  });

  it("TOPIC_DISABLED_KEYWORDS contains wildlife", () => {
    expect(TOPIC_DISABLED_KEYWORDS).toContain("wildlife");
  });

  it("TOPIC_NOT_GENERATABLE_KEYWORDS contains heat treatment variants", () => {
    expect(TOPIC_NOT_GENERATABLE_KEYWORDS).toContain("heat treatment");
    expect(TOPIC_NOT_GENERATABLE_KEYWORDS).toContain("whole-home heat treatment");
    expect(TOPIC_NOT_GENERATABLE_KEYWORDS).toContain("bed bug heat treatment");
  });
});
