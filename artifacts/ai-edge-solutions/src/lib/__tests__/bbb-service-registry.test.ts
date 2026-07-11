// BB&B Service Registry — Business Rule Tests
// Phase 16 — Validates the canonical service registry, approval modes,
// termite/wildlife blocks, prompt rules, and campaign mix logic.

import { describe, it, expect } from "vitest";
import {
  BBB_SERVICES,
  BBB_AUDIENCES,
  BBB_DEFAULT_APPROVAL_MODE,
  APPROVAL_MODES,
  BBB_DEFAULT_CAMPAIGN_MIX,
  REVENUE_GOALS,
  EDUCATION_GOALS,
  TRUST_GOALS,
  CAMPAIGN_GOALS,
  getBBBService,
  getGeneratableServices,
  getActiveServices,
  getComingSoonServices,
  getDisabledServices,
  getDefaultTopics,
  validateTopicForGeneration,
  normalizeTopics,
  matchServiceByTopic,
  getServicePromptRules,
} from "../../../../../lib/db/src/bbb-services";

// ── T1: Registry contains all confirmed services ──────────────────────────────

describe("T1: Canonical registry — confirmed services", () => {
  const REQUIRED_SERVICE_IDS = [
    "bed_bug_inspection",
    "bed_bug_treatment",
    "residential_pest_control",
    "commercial_pest_control",
    "roaches",
    "rodents",
    "ants",
    "fleas",
    "ticks",
    "spiders",
    "wasps_hornets",
    "mosquitoes",
    "moles",
    "fumigation",
    "termites",
    "wildlife_removal",
  ];

  it("contains all 16 confirmed service records", () => {
    for (const id of REQUIRED_SERVICE_IDS) {
      expect(BBB_SERVICES.find(s => s.serviceId === id), `Missing service: ${id}`).toBeDefined();
    }
  });

  it("has no duplicate serviceIds", () => {
    const ids = BBB_SERVICES.map(s => s.serviceId);
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size);
  });
});

// ── T2: Fumigation is active ──────────────────────────────────────────────────

describe("T2: Fumigation is active", () => {
  const fumigation = getBBBService("fumigation");

  it("fumigation service exists", () => {
    expect(fumigation).toBeDefined();
  });

  it("fumigation status is active", () => {
    expect(fumigation!.status).toBe("active");
  });

  it("fumigation generationAllowed is true", () => {
    expect(fumigation!.generationAllowed).toBe(true);
  });

  it("fumigation ctaAllowed is true", () => {
    expect(fumigation!.ctaAllowed).toBe(true);
  });

  it("fumigation prohibited claims block dangerous content", () => {
    const prohibited = fumigation!.prohibitedClaims;
    expect(prohibited.some(c => c.toLowerCase().includes("diy"))).toBe(true);
    expect(prohibited.some(c => c.toLowerCase().includes("dosage") || c.toLowerCase().includes("chemical"))).toBe(true);
  });
});

// ── T3: Heat treatment is not offered ────────────────────────────────────────

describe("T3: Heat treatment is not offered / not a selectable service", () => {
  it("no service with serviceId containing 'heat_treatment' exists", () => {
    expect(BBB_SERVICES.find(s => s.serviceId.includes("heat_treatment"))).toBeUndefined();
  });

  it("bed_bug_treatment prohibits heat treatment claims", () => {
    const bbt = getBBBService("bed_bug_treatment")!;
    const prohibits = bbt.prohibitedClaims.join(" ").toLowerCase();
    expect(prohibits).toContain("heat treatment");
  });

  it("bed bug treatment differentiators reference targeted treatment and contrast with heat", () => {
    const bbt = getBBBService("bed_bug_treatment")!;
    const diffs = bbt.differentiators.join(" ").toLowerCase();
    expect(diffs).toContain("targeted treatment");
    // Differentiators may mention "heat treatment" as a contrast (e.g., "not requiring heat treatment")
    // but must never claim BB&B *performs* heat treatment — that check is in prohibitedClaims.
    if (diffs.includes("heat treatment")) {
      expect(diffs).toMatch(/not.*heat treatment|alternative.*heat treatment|without.*heat treatment|affordable.*heat treatment/i);
    }
  });
});

// ── T4: Termites are coming_soon ─────────────────────────────────────────────

describe("T4: Termites — coming_soon status", () => {
  const termites = getBBBService("termites");

  it("termites service exists in registry", () => {
    expect(termites).toBeDefined();
  });

  it("termites status is coming_soon", () => {
    expect(termites!.status).toBe("coming_soon");
  });
});

// ── T5: Termites cannot generate ─────────────────────────────────────────────

describe("T5: Termites — generationAllowed is false (hard lock)", () => {
  const termites = getBBBService("termites")!;

  it("termites generationAllowed is false", () => {
    expect(termites.generationAllowed).toBe(false);
  });

  it("termites are not in getGeneratableServices()", () => {
    const generatable = getGeneratableServices().map(s => s.serviceId);
    expect(generatable).not.toContain("termites");
  });

  it("termites are not in getDefaultTopics()", () => {
    const topics = getDefaultTopics().map(t => t.toLowerCase());
    expect(topics.some(t => t.includes("termite"))).toBe(false);
  });

  it("validateTopicForGeneration('termites') returns SERVICE_COMING_SOON", () => {
    expect(validateTopicForGeneration("Termites")).toBe("SERVICE_COMING_SOON");
    expect(validateTopicForGeneration("termite control")).toBe("SERVICE_COMING_SOON");
    expect(validateTopicForGeneration("Termite Inspection")).toBe("SERVICE_COMING_SOON");
  });

  it("normalizeTopics strips termites from topic list", () => {
    const result = normalizeTopics(["Bed Bug Inspection", "Termites", "Roach Control"]);
    expect(result).not.toContain("Termites");
    expect(result).toContain("Bed Bug Inspection");
  });
});

// ── T6: Termites cannot receive booking CTAs ─────────────────────────────────

describe("T6: Termites — bookingAllowed and ctaAllowed are false", () => {
  const termites = getBBBService("termites")!;

  it("termites bookingAllowed is false", () => {
    expect(termites.bookingAllowed).toBe(false);
  });

  it("termites ctaAllowed is false", () => {
    expect(termites.ctaAllowed).toBe(false);
  });

  it("termites publishAllowed is false", () => {
    expect(termites.publishAllowed).toBe(false);
  });

  it("termites prohibited claims include service availability claims", () => {
    const prohibited = termites.prohibitedClaims.join(" ").toLowerCase();
    expect(prohibited).toContain("bb&b offers termite service");
  });
});

// ── T7: Wildlife removal is disabled ─────────────────────────────────────────

describe("T7: Wildlife removal — disabled", () => {
  const wildlife = getBBBService("wildlife_removal")!;

  it("wildlife_removal exists in registry", () => {
    expect(wildlife).toBeDefined();
  });

  it("wildlife_removal status is disabled", () => {
    expect(wildlife.status).toBe("disabled");
  });

  it("wildlife_removal generationAllowed is false", () => {
    expect(wildlife.generationAllowed).toBe(false);
  });

  it("wildlife_removal bookingAllowed is false", () => {
    expect(wildlife.bookingAllowed).toBe(false);
  });

  it("validateTopicForGeneration('wildlife removal') returns SERVICE_DISABLED", () => {
    expect(validateTopicForGeneration("wildlife removal")).toBe("SERVICE_DISABLED");
    expect(validateTopicForGeneration("Wildlife Removal")).toBe("SERVICE_DISABLED");
  });

  it("wildlife_removal is not in getGeneratableServices()", () => {
    const generatable = getGeneratableServices().map(s => s.serviceId);
    expect(generatable).not.toContain("wildlife_removal");
  });

  it("wildlife_removal is in getDisabledServices()", () => {
    const disabled = getDisabledServices().map(s => s.serviceId);
    expect(disabled).toContain("wildlife_removal");
  });
});

// ── T8: Moles receive low frequency ──────────────────────────────────────────

describe("T8: Moles — low priority and low frequency", () => {
  const moles = getBBBService("moles")!;

  it("moles contentFrequencyWeight is 1 (lowest)", () => {
    expect(moles.contentFrequencyWeight).toBe(1);
  });

  it("moles priority is 5 (lowest of active services)", () => {
    const activeServices = getActiveServices().filter(s => s.generationAllowed);
    const maxPriority = Math.max(...activeServices.map(s => s.priority));
    expect(moles.priority).toBe(maxPriority);
  });

  it("moles urgency is low", () => {
    expect(moles.urgency).toBe("low");
  });

  it("bed bugs have higher contentFrequencyWeight than moles", () => {
    const bedBugs = getBBBService("bed_bug_treatment")!;
    expect(bedBugs.contentFrequencyWeight).toBeGreaterThan(moles.contentFrequencyWeight);
  });
});

// ── T9: Bed bug prompts use targeted-treatment positioning ───────────────────

describe("T9: Bed bug treatment — targeted-treatment positioning", () => {
  it("bed_bug_treatment differentiators reference targeted treatment approach", () => {
    const bbt = getBBBService("bed_bug_treatment")!;
    const diffs = bbt.differentiators.join(" ").toLowerCase();
    expect(diffs).toContain("targeted treatment");
    expect(diffs).toContain("affected furniture");
  });

  it("getServicePromptRules returns targeted-treatment context for bed bugs", () => {
    const rules = getServicePromptRules("Bed Bug Treatment");
    expect(rules.toLowerCase()).toContain("targeted treatment");
    expect(rules.toLowerCase()).toContain("affected furniture");
  });

  it("getServicePromptRules includes 'more affordable' differentiator", () => {
    const rules = getServicePromptRules("Bed Bug Treatment");
    expect(rules.toLowerCase()).toContain("affordable");
  });
});

// ── T10: Bed bug prompts do not claim heat treatment ─────────────────────────

describe("T10: Bed bug prompts — heat treatment prohibition", () => {
  it("getServicePromptRules for bed bugs prohibits heat treatment claims", () => {
    const rules = getServicePromptRules("Bed Bug Treatment");
    expect(rules.toLowerCase()).toContain("do not claim bb&b offers heat treatment");
  });

  it("bed_bug_treatment prohibited claims include heat treatment", () => {
    const bbt = getBBBService("bed_bug_treatment")!;
    const prohibited = bbt.prohibitedClaims.join(" ").toLowerCase();
    expect(prohibited).toContain("heat treatment");
  });
});

// ── T11: Fumigation prompts block unsafe procedural instructions ─────────────

describe("T11: Fumigation — unsafe instruction prohibition in prompt rules", () => {
  it("getServicePromptRules for fumigation includes DO NOT rules", () => {
    const rules = getServicePromptRules("Fumigation");
    expect(rules.toLowerCase()).toContain("do not");
  });

  it("fumigation prompt rules prohibit DIY instructions", () => {
    const rules = getServicePromptRules("Fumigation");
    expect(rules.toLowerCase()).toContain("diy");
  });

  it("fumigation prompt rules prohibit chemical dosages", () => {
    const rules = getServicePromptRules("Fumigation");
    expect(rules.toLowerCase()).toContain("dosage");
  });
});

// ── T12: Unknown services fail safely ────────────────────────────────────────

describe("T12: Unknown services — fail safely without crash", () => {
  it("validateTopicForGeneration for truly unknown topic returns null (safe pass-through)", () => {
    // Truly unknown topics that aren't blocked return null — they may be valid
    // custom topics not in the registry
    const result = validateTopicForGeneration("Lawn Care");
    expect(result).toBeNull();
  });

  it("getBBBService for unknown serviceId returns undefined", () => {
    expect(getBBBService("nonexistent_service")).toBeUndefined();
  });

  it("matchServiceByTopic for unknown topic returns undefined gracefully", () => {
    expect(matchServiceByTopic("Lawn Mowing")).toBeUndefined();
  });

  it("normalizeTopics with all unknown topics passes them through (no registry crash)", () => {
    const result = normalizeTopics(["Lawn Care", "Window Cleaning"]);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── T13: approval_required mode exists ───────────────────────────────────────

describe("T13: approval_required mode exists", () => {
  it("APPROVAL_MODES has approval_required key", () => {
    expect(APPROVAL_MODES).toHaveProperty("approval_required");
  });

  it("approval_required has label and description", () => {
    expect(APPROVAL_MODES.approval_required.label).toBeTruthy();
    expect(APPROVAL_MODES.approval_required.description).toBeTruthy();
  });

  it("all three modes exist", () => {
    expect(APPROVAL_MODES).toHaveProperty("draft_only");
    expect(APPROVAL_MODES).toHaveProperty("approval_required");
    expect(APPROVAL_MODES).toHaveProperty("auto_schedule");
  });
});

// ── T14: BB&B defaults to approval_required ──────────────────────────────────

describe("T14: BB&B default approval mode is approval_required", () => {
  it("BBB_DEFAULT_APPROVAL_MODE is approval_required", () => {
    expect(BBB_DEFAULT_APPROVAL_MODE).toBe("approval_required");
  });

  it("BBB_DEFAULT_APPROVAL_MODE is NOT auto_schedule", () => {
    expect(BBB_DEFAULT_APPROVAL_MODE).not.toBe("auto_schedule");
  });
});

// ── T19: Revenue mix approximates 60/25/15 ───────────────────────────────────

describe("T19: Campaign mix — 60/25/15 default", () => {
  it("BBB_DEFAULT_CAMPAIGN_MIX has revenue at 60", () => {
    expect(BBB_DEFAULT_CAMPAIGN_MIX.revenue).toBe(60);
  });

  it("BBB_DEFAULT_CAMPAIGN_MIX has education at 25", () => {
    expect(BBB_DEFAULT_CAMPAIGN_MIX.education).toBe(25);
  });

  it("BBB_DEFAULT_CAMPAIGN_MIX has trust at 15", () => {
    expect(BBB_DEFAULT_CAMPAIGN_MIX.trust).toBe(15);
  });

  it("mix sums to 100", () => {
    const total = BBB_DEFAULT_CAMPAIGN_MIX.revenue + BBB_DEFAULT_CAMPAIGN_MIX.education + BBB_DEFAULT_CAMPAIGN_MIX.trust;
    expect(total).toBe(100);
  });

  it("REVENUE_GOALS contains expected goals", () => {
    expect(REVENUE_GOALS.has("call_generation")).toBe(true);
    expect(REVENUE_GOALS.has("inspection_booking")).toBe(true);
    expect(REVENUE_GOALS.has("treatment_booking")).toBe(true);
  });

  it("EDUCATION_GOALS contains homeowner_education", () => {
    expect(EDUCATION_GOALS.has("homeowner_education")).toBe(true);
  });

  it("TRUST_GOALS contains review_trust and local_visibility", () => {
    expect(TRUST_GOALS.has("review_trust")).toBe(true);
    expect(TRUST_GOALS.has("local_visibility")).toBe(true);
  });
});

// ── T20: Weighted services — high-revenue services rank above moles ───────────

describe("T20: Service weights — revenue and frequency ordering", () => {
  it("bed bug services have revenueWeight 10 (maximum)", () => {
    expect(getBBBService("bed_bug_inspection")!.revenueWeight).toBe(10);
    expect(getBBBService("bed_bug_treatment")!.revenueWeight).toBe(10);
  });

  it("moles revenueWeight is the lowest among active services", () => {
    const activeGeneratable = getActiveServices().filter(s => s.generationAllowed);
    const molesWeight = getBBBService("moles")!.revenueWeight;
    const allWeights = activeGeneratable.map(s => s.revenueWeight);
    expect(molesWeight).toBe(Math.min(...allWeights));
  });

  it("roaches revenueWeight > moles revenueWeight", () => {
    expect(getBBBService("roaches")!.revenueWeight).toBeGreaterThan(getBBBService("moles")!.revenueWeight);
  });

  it("getDefaultTopics returns bed bugs before moles (priority order)", () => {
    const topics = getDefaultTopics();
    const bedBugIdx = topics.findIndex(t => t.toLowerCase().includes("bed bug"));
    const molesIdx  = topics.findIndex(t => t.toLowerCase().includes("mole"));
    expect(bedBugIdx).toBeGreaterThanOrEqual(0);
    expect(molesIdx).toBeGreaterThanOrEqual(0);
    expect(bedBugIdx).toBeLessThan(molesIdx);
  });
});

// ── T21: Seasonal rules are applied ──────────────────────────────────────────

describe("T21: Seasonal rules are applied", () => {
  it("mosquitoes has seasonal status", () => {
    expect(getBBBService("mosquitoes")!.status).toBe("seasonal");
  });

  it("mosquitoes seasonality describes Gulf Coast warm season", () => {
    const s = getBBBService("mosquitoes")!.seasonality!.toLowerCase();
    expect(s).toContain("april");
    expect(s).toContain("october");
  });

  it("fleas has seasonal status", () => {
    expect(getBBBService("fleas")!.status).toBe("seasonal");
  });

  it("ticks has seasonal status", () => {
    expect(getBBBService("ticks")!.status).toBe("seasonal");
  });

  it("wasps_hornets has seasonal status", () => {
    expect(getBBBService("wasps_hornets")!.status).toBe("seasonal");
  });

  it("bed bug services are year-round (no seasonality)", () => {
    expect(getBBBService("bed_bug_inspection")!.seasonality).toBeNull();
    expect(getBBBService("bed_bug_treatment")!.seasonality).toBeNull();
  });
});

// ── T25: Prohibited claims are rejected ──────────────────────────────────────

describe("T25: Prohibited claims are declared in registry", () => {
  it("heat treatment topic blocked by validateTopicForGeneration", () => {
    expect(validateTopicForGeneration("heat treatment")).toBe("SERVICE_NOT_GENERATABLE");
    expect(validateTopicForGeneration("whole-home heat treatment")).toBe("SERVICE_NOT_GENERATABLE");
    expect(validateTopicForGeneration("bed bug heat treatment")).toBe("SERVICE_NOT_GENERATABLE");
  });

  it("bed_bug_treatment has prohibitedClaims array with entries", () => {
    const bbt = getBBBService("bed_bug_treatment")!;
    expect(bbt.prohibitedClaims.length).toBeGreaterThan(0);
  });

  it("fumigation has prohibitedClaims array with entries", () => {
    const fum = getBBBService("fumigation")!;
    expect(fum.prohibitedClaims.length).toBeGreaterThan(0);
  });

  it("termites has prohibitedClaims blocking service claims", () => {
    const t = getBBBService("termites")!;
    expect(t.prohibitedClaims.length).toBeGreaterThan(0);
  });
});

// ── T28: No duplicated service arrays in migrated modules ─────────────────────

describe("T28: Registry is the single source — no stale arrays", () => {
  it("getGeneratableServices() returns all services with generationAllowed=true", () => {
    const generatable = getGeneratableServices();
    const withFlag = BBB_SERVICES.filter(s => s.generationAllowed);
    expect(generatable.length).toBe(withFlag.length);
  });

  it("getComingSoonServices() contains only termites", () => {
    const cs = getComingSoonServices();
    expect(cs.every(s => s.status === "coming_soon")).toBe(true);
    expect(cs.map(s => s.serviceId)).toContain("termites");
  });

  it("getDisabledServices() contains wildlife_removal", () => {
    const disabled = getDisabledServices();
    expect(disabled.every(s => s.status === "disabled")).toBe(true);
    expect(disabled.map(s => s.serviceId)).toContain("wildlife_removal");
  });

  it("CAMPAIGN_GOALS is a non-empty readonly array", () => {
    expect(CAMPAIGN_GOALS.length).toBeGreaterThan(0);
    expect(CAMPAIGN_GOALS).toContain("call_generation");
    expect(CAMPAIGN_GOALS).toContain("inspection_booking");
  });

  it("BBB_AUDIENCES contains expected high-value audiences", () => {
    const ids = BBB_AUDIENCES.map(a => a.audienceId);
    expect(ids).toContain("vacation_rental_owners");
    expect(ids).toContain("property_managers");
    expect(ids).toContain("restaurants");
  });
});
