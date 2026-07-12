// Phase A2 — Client Context Contract and Multi-Tenant Readiness Tests
//
// Validates that the Phase A1 abstraction (lib/db/src/client-context.ts):
//   1. Preserves BB&B behavior exactly (null-config parity)
//   2. Supports a completely independent non-BB&B client (leakage isolation)
//   3. Delegates registry operations correctly through ServiceRegistryProvider
//   4. Does not share mutable state between independently built contexts
//
// These tests are intentionally pure (no DB, no Express, no AI model).
// They exercise the building-block functions used by the generate route so that
// route behavior can be inferred from interface behavior.
//
// Import convention: relative paths to lib/db/src (not @workspace/db),
// matching the established convention in this test suite.

import { describe, it, expect } from "vitest";
import {
  buildClientContentContext,
  buildSystemPrompt,
  bbbRegistryProvider,
  BBB_DEFAULT_SERVICE_AREAS,
  BBB_REGION,
  DEFAULT_POST_ANGLES,
  DEFAULT_TONE_STYLE,
  type ServiceRegistryProvider,
  type PartialClientConfig,
  type ClientContentContext,
} from "../../../../../lib/db/src/client-context";
import {
  BBB_DEFAULT_APPROVAL_MODE,
  getGeneratableServices,
  getDefaultTopics,
  validateTopicForGeneration,
  getServicePromptRules,
  matchServiceByTopic,
  normalizeTopics,
} from "../../../../../lib/db/src/bbb-services";

// ── Fake registry for generic-client tests (T-A2-4, T-A2-5, T-A2-7) ──────────
// Represents a fictional plumbing company in DFW — no pest-control content.

const LAKESIDE_DEFAULT_TOPICS = ["Pipe Repair", "Drain Cleaning", "Water Heater"];

const fakePlumbingRegistry: ServiceRegistryProvider = {
  getGeneratableServices: () => [],
  matchByTopic: () => undefined,
  getPromptRules: (topic: string) =>
    topic.toLowerCase().includes("pipe")
      ? "PIPE REPAIR RULES:\n- Do not quote prices without a site survey."
      : "",
  validateTopic: () => null,
  selectWeeklySlots: () => [],
  normalizeTopics: (topics: string[]) => topics,
  getDefaultTopics: () => LAKESIDE_DEFAULT_TOPICS,
  getSystemBusinessRules: () =>
    "BUSINESS RULES (MUST FOLLOW):\n" +
    "- Lakeside Plumbing is a licensed plumber serving Dallas\u2013Fort Worth.\n" +
    "- Do NOT claim same-day availability without confirming with dispatch.\n" +
    "- Do NOT make guarantees about leak detection accuracy.",
};

const LAKESIDE_SERVICE_AREAS = ["Plano, TX", "Frisco, TX", "McKinney, TX", "Allen, TX"];

const fakePlumbingConfig: PartialClientConfig = {
  clientName:    "Lakeside Plumbing",
  industry:      "plumbing",
  serviceAreas:  LAKESIDE_SERVICE_AREAS,
  topics:        LAKESIDE_DEFAULT_TOPICS,
  approvalMode:  "draft_only",
  ctaText:       "Call Now \u2014 (972) 555-0100",
  ctaPreference: "call_now",
  frequency:     "weekly",
  platforms:     ["facebook", "instagram"],
  toneStyle:     ["professional", "trustworthy"],
  postAngles:    ["educational", "testimonial", "promotional"],
  postingTimes:  ["09:00", "17:00"],
};

// ── Canonical BB&B system prompt (character-for-character reference) ───────────
// This string is the Phase A2 specification of the exact output
// buildSystemPrompt(buildClientContentContext(null)) MUST produce.
// Any deviation from this string is a behavioral regression for the BB&B pilot.

const BBB_EXPECTED_SYSTEM_PROMPT =
  "You are a local pest control social media copywriter for Bed Bugs & Beyond, " +
  "serving the Gulf Coast of Alabama (Baldwin County). " +
  "Write authentic, local posts that feel genuine. Return ONLY valid JSON:\n" +
  '{"caption":string,"hashtags":string[],"imagePrompt":string}\n' +
  "\n" +
  "CORE RULES:\n" +
  "- caption is 2-3 sentences, mentions the specific city by name, names the pest/service naturally\n" +
  "- matches the post angle (educational=informative, warning=urgent risk, promotional=offer/deal, seasonal=time-relevant, faq=question+answer, testimonial=social proof voice, prevention=tips, emergency=urgent call)\n" +
  "- ends with the CTA\n" +
  "- No markdown, no code fences\n" +
  "- hashtags: 5-8 tags mixing local and service tags\n" +
  "- imagePrompt: 1 sentence describing a realistic professional photo\n" +
  "- JSON only\n" +
  "\n" +
  "BUSINESS RULES (MUST FOLLOW):\n" +
  "- BB&B uses targeted treatment of affected furniture and specific areas \u2014 NOT whole-home heat treatment\n" +
  "- Do NOT claim BB&B offers heat treatment or whole-home heat treatment\n" +
  "- Do NOT claim guaranteed elimination or specific savings without verified data\n" +
  "- Do NOT generate termite content, wildlife removal content, or heat treatment content\n" +
  "- Do NOT generate chemical dosages, DIY fumigation instructions, or regulatory compliance claims\n" +
  "- Fumigation content must remain at awareness/educational level only";

// ─────────────────────────────────────────────────────────────────────────────
// T-A2-1: BB&B Null-Config Parity
// Verifies that buildClientContentContext(null) reproduces the exact BB&B defaults
// that were hardcoded in the generate route before Phase A1.
// ─────────────────────────────────────────────────────────────────────────────

describe("T-A2-1: BB&B null-config parity", () => {
  const ctx = buildClientContentContext(null);

  it("clientName is 'Bed Bugs & Beyond'", () => {
    expect(ctx.clientName).toBe("Bed Bugs & Beyond");
  });

  it("industry is 'pest_control'", () => {
    expect(ctx.industry).toBe("pest_control");
  });

  it("industryLabel is 'pest control'", () => {
    expect(ctx.industryLabel).toBe("pest control");
  });

  it("serviceAreas deep-equals BBB_DEFAULT_SERVICE_AREAS", () => {
    expect(ctx.serviceAreas).toEqual(BBB_DEFAULT_SERVICE_AREAS);
  });

  it("region is the canonical BB&B region string", () => {
    expect(ctx.region).toBe(BBB_REGION);
    expect(ctx.region).toBe("Gulf Coast of Alabama (Baldwin County)");
  });

  it("approvalMode is 'approval_required' (matches BBB_DEFAULT_APPROVAL_MODE)", () => {
    expect(ctx.approvalMode).toBe("approval_required");
    expect(ctx.approvalMode).toBe(BBB_DEFAULT_APPROVAL_MODE);
  });

  it("ctaText contains the BB&B phone number", () => {
    expect(ctx.ctaText).toContain("(251) 324-9090");
  });

  it("ctaPreference is 'call_now'", () => {
    expect(ctx.ctaPreference).toBe("call_now");
  });

  it("frequency is 'every_other_day'", () => {
    expect(ctx.frequency).toBe("every_other_day");
  });

  it("postingTimes are the canonical three BB&B posting times", () => {
    expect(ctx.postingTimes).toEqual(["08:00", "12:00", "17:00"]);
  });

  it("platforms include facebook", () => {
    expect(ctx.platforms).toContain("facebook");
  });

  it("toneStyle matches the default professional-friendly tone", () => {
    expect(ctx.toneStyle).toEqual(DEFAULT_TONE_STYLE);
  });

  it("postAngles matches the default 8-angle set", () => {
    expect(ctx.postAngles).toEqual(DEFAULT_POST_ANGLES);
    expect(ctx.postAngles).toHaveLength(8);
  });

  it("topics is a non-empty array of BB&B default topics", () => {
    expect(ctx.topics.length).toBeGreaterThan(0);
    expect(ctx.topics.some(t => t.toLowerCase().includes("bed bug"))).toBe(true);
  });

  it("registry is the bbbRegistryProvider", () => {
    expect(ctx.registry).toBe(bbbRegistryProvider);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-A2-2: BB&B System Prompt Parity
// Strict characterization test: buildSystemPrompt(buildClientContentContext(null))
// must equal the canonical reference string exactly.
// ─────────────────────────────────────────────────────────────────────────────

describe("T-A2-2: BB&B system prompt parity (exact characterization)", () => {
  const ctx = buildClientContentContext(null);
  const prompt = buildSystemPrompt(ctx);

  it("equals the canonical reference string character-for-character", () => {
    expect(prompt).toBe(BBB_EXPECTED_SYSTEM_PROMPT);
  });

  it("opens with the correct role declaration (industry + client name + region)", () => {
    expect(prompt).toContain(
      "You are a local pest control social media copywriter for Bed Bugs & Beyond, " +
      "serving the Gulf Coast of Alabama (Baldwin County).",
    );
  });

  it("contains the client name 'Bed Bugs & Beyond'", () => {
    expect(prompt).toContain("Bed Bugs & Beyond");
  });

  it("contains the industry label 'pest control'", () => {
    expect(prompt).toContain("pest control");
  });

  it("contains the region 'Gulf Coast of Alabama (Baldwin County)'", () => {
    expect(prompt).toContain("Gulf Coast of Alabama (Baldwin County)");
  });

  it("contains the BUSINESS RULES header", () => {
    expect(prompt).toContain("BUSINESS RULES (MUST FOLLOW):");
  });

  it("contains targeted-treatment bed bug positioning", () => {
    expect(prompt).toContain(
      "BB&B uses targeted treatment of affected furniture and specific areas",
    );
  });

  it("prohibits heat treatment claims", () => {
    expect(prompt).toContain("Do NOT claim BB&B offers heat treatment or whole-home heat treatment");
  });

  it("prohibits termite content", () => {
    expect(prompt).toContain("Do NOT generate termite content");
  });

  it("prohibits wildlife removal content", () => {
    expect(prompt).toContain("wildlife removal content");
  });

  it("restricts fumigation to awareness/educational level only", () => {
    expect(prompt).toContain("Fumigation content must remain at awareness/educational level only");
  });

  it("prohibits chemical dosages and DIY fumigation instructions", () => {
    expect(prompt).toContain("chemical dosages, DIY fumigation instructions");
  });

  it("ends without a trailing newline (same as pre-Phase-A1 hardcoded string)", () => {
    expect(prompt.endsWith("\n")).toBe(false);
    expect(prompt).toMatch(/level only$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-A2-3: Registry Provider Delegation
// Verifies that bbbRegistryProvider correctly delegates to bbb-services.ts
// functions and produces behaviorally correct results.
// ─────────────────────────────────────────────────────────────────────────────

describe("T-A2-3: BB&B registry provider delegation", () => {
  describe("getGeneratableServices", () => {
    it("returns the same count as the direct bbb-services function", () => {
      const direct = getGeneratableServices();
      const via = bbbRegistryProvider.getGeneratableServices();
      expect(via.length).toBe(direct.length);
    });

    it("returns the same service IDs as the direct bbb-services function", () => {
      const directIds = getGeneratableServices().map(s => s.serviceId).sort();
      const viaIds = bbbRegistryProvider.getGeneratableServices().map(s => s.serviceId).sort();
      expect(viaIds).toEqual(directIds);
    });

    it("excludes termites (coming_soon) from generatable services", () => {
      const ids = bbbRegistryProvider.getGeneratableServices().map(s => s.serviceId);
      expect(ids).not.toContain("termites");
    });

    it("excludes wildlife_removal (disabled) from generatable services", () => {
      const ids = bbbRegistryProvider.getGeneratableServices().map(s => s.serviceId);
      expect(ids).not.toContain("wildlife_removal");
    });
  });

  describe("matchByTopic", () => {
    it("finds bed_bug_inspection by topic string", () => {
      const svc = bbbRegistryProvider.matchByTopic("Bed Bug Inspection");
      expect(svc).toBeDefined();
      expect(svc?.serviceId).toBe("bed_bug_inspection");
    });

    it("finds bed_bug_treatment by topic string", () => {
      const svc = bbbRegistryProvider.matchByTopic("Bed Bug Treatment");
      expect(svc).toBeDefined();
      expect(svc?.serviceId).toBe("bed_bug_treatment");
    });

    it("returns undefined for unknown topics (same as direct function)", () => {
      const directResult = matchServiceByTopic("Lawn Mowing");
      const viaResult = bbbRegistryProvider.matchByTopic("Lawn Mowing");
      expect(viaResult).toBeUndefined();
      expect(viaResult).toBe(directResult);
    });

    it("matches produce the same result as calling matchServiceByTopic directly", () => {
      const topics = ["Bed Bug Inspection", "Roaches", "Fumigation", "Mosquitoes"];
      for (const topic of topics) {
        const direct = matchServiceByTopic(topic);
        const via = bbbRegistryProvider.matchByTopic(topic);
        expect(via?.serviceId).toBe(direct?.serviceId);
      }
    });
  });

  describe("validateTopic", () => {
    it("returns SERVICE_COMING_SOON for Termites", () => {
      expect(bbbRegistryProvider.validateTopic("Termites")).toBe("SERVICE_COMING_SOON");
    });

    it("returns SERVICE_DISABLED for Wildlife Removal", () => {
      expect(bbbRegistryProvider.validateTopic("Wildlife Removal")).toBe("SERVICE_DISABLED");
    });

    it("returns SERVICE_NOT_GENERATABLE for heat treatment variants", () => {
      expect(bbbRegistryProvider.validateTopic("heat treatment")).toBe("SERVICE_NOT_GENERATABLE");
      expect(bbbRegistryProvider.validateTopic("whole-home heat treatment")).toBe("SERVICE_NOT_GENERATABLE");
    });

    it("returns null for valid generatable topics", () => {
      expect(bbbRegistryProvider.validateTopic("Bed Bug Inspection")).toBeNull();
      expect(bbbRegistryProvider.validateTopic("Roach Control")).toBeNull();
    });

    it("agrees with validateTopicForGeneration for all test cases", () => {
      const cases = [
        "Termites", "Wildlife Removal", "heat treatment",
        "Bed Bug Treatment", "Fumigation", "Roaches",
      ];
      for (const topic of cases) {
        expect(bbbRegistryProvider.validateTopic(topic))
          .toBe(validateTopicForGeneration(topic));
      }
    });
  });

  describe("selectWeeklySlots", () => {
    it("returns the requested number of slots", () => {
      expect(bbbRegistryProvider.selectWeeklySlots(7)).toHaveLength(7);
    });

    it("returns slots with valid service, campaignGoal, and audienceId fields", () => {
      const slots = bbbRegistryProvider.selectWeeklySlots(3);
      for (const slot of slots) {
        expect(slot.service).toBeDefined();
        expect(slot.service.serviceId).toBeTruthy();
        expect(slot.campaignGoal).toBeTruthy();
        expect(slot.audienceId).toBeTruthy();
      }
    });

    it("returns 0 slots for count 0", () => {
      expect(bbbRegistryProvider.selectWeeklySlots(0)).toHaveLength(0);
    });

    it("returns only generatable services in slots", () => {
      const slots = bbbRegistryProvider.selectWeeklySlots(14);
      const ids = slots.map(s => s.service.serviceId);
      expect(ids).not.toContain("termites");
      expect(ids).not.toContain("wildlife_removal");
    });
  });

  describe("getPromptRules", () => {
    it("returns targeted-treatment positioning for bed bug treatment", () => {
      const rules = bbbRegistryProvider.getPromptRules("Bed Bug Treatment");
      expect(rules.toLowerCase()).toContain("targeted treatment");
    });

    it("returns DIY prohibition for fumigation", () => {
      const rules = bbbRegistryProvider.getPromptRules("Fumigation");
      expect(rules.toLowerCase()).toContain("diy");
    });

    it("agrees with getServicePromptRules for bed bug treatment", () => {
      const direct = getServicePromptRules("Bed Bug Treatment");
      const via = bbbRegistryProvider.getPromptRules("Bed Bug Treatment");
      expect(via).toBe(direct);
    });

    it("returns empty string for unknown topics (safe, no crash)", () => {
      expect(bbbRegistryProvider.getPromptRules("Lawn Mowing")).toBe("");
    });
  });

  describe("normalizeTopics", () => {
    it("strips termites from a mixed topic list", () => {
      const result = bbbRegistryProvider.normalizeTopics([
        "Bed Bug Inspection", "Termites", "Roach Control",
      ]);
      expect(result).not.toContain("Termites");
      expect(result).toContain("Bed Bug Inspection");
    });

    it("agrees with normalizeTopics from bbb-services directly", () => {
      const input = ["Bed Bug Treatment", "Termites", "Wildlife Removal", "Fumigation"];
      const direct = normalizeTopics(input);
      const via = bbbRegistryProvider.normalizeTopics(input);
      expect(via).toEqual(direct);
    });
  });

  describe("getDefaultTopics", () => {
    it("returns a non-empty list of topics", () => {
      expect(bbbRegistryProvider.getDefaultTopics().length).toBeGreaterThan(0);
    });

    it("agrees with getDefaultTopics from bbb-services directly", () => {
      expect(bbbRegistryProvider.getDefaultTopics()).toEqual(getDefaultTopics());
    });

    it("includes bed bug topics", () => {
      const topics = bbbRegistryProvider.getDefaultTopics().map(t => t.toLowerCase());
      expect(topics.some(t => t.includes("bed bug"))).toBe(true);
    });

    it("does not include termites", () => {
      const topics = bbbRegistryProvider.getDefaultTopics().map(t => t.toLowerCase());
      expect(topics.some(t => t.includes("termite"))).toBe(false);
    });
  });

  describe("getSystemBusinessRules", () => {
    it("starts with the canonical BUSINESS RULES header", () => {
      const rules = bbbRegistryProvider.getSystemBusinessRules();
      expect(rules).toMatch(/^BUSINESS RULES \(MUST FOLLOW\):/);
    });

    it("contains the targeted-treatment bed bug positioning", () => {
      const rules = bbbRegistryProvider.getSystemBusinessRules();
      expect(rules).toContain("targeted treatment of affected furniture");
    });

    it("prohibits heat treatment claims", () => {
      const rules = bbbRegistryProvider.getSystemBusinessRules();
      expect(rules).toContain("NOT whole-home heat treatment");
    });

    it("prohibits termite content generation", () => {
      const rules = bbbRegistryProvider.getSystemBusinessRules();
      expect(rules).toContain("termite content");
    });

    it("restricts fumigation to educational level", () => {
      const rules = bbbRegistryProvider.getSystemBusinessRules();
      expect(rules).toContain("awareness/educational level only");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-A2-4: Generic Client Context (Lakeside Plumbing)
// Verifies that buildClientContentContext uses the supplied configuration
// and custom registry provider without falling back to any BB&B values.
// ─────────────────────────────────────────────────────────────────────────────

describe("T-A2-4: Generic client context — Lakeside Plumbing", () => {
  const ctx = buildClientContentContext(fakePlumbingConfig, fakePlumbingRegistry);

  it("clientName is 'Lakeside Plumbing'", () => {
    expect(ctx.clientName).toBe("Lakeside Plumbing");
  });

  it("industry is 'plumbing'", () => {
    expect(ctx.industry).toBe("plumbing");
  });

  it("industryLabel is 'plumbing'", () => {
    expect(ctx.industryLabel).toBe("plumbing");
  });

  it("serviceAreas are the supplied DFW areas, not BB&B areas", () => {
    expect(ctx.serviceAreas).toEqual(LAKESIDE_SERVICE_AREAS);
    for (const city of BBB_DEFAULT_SERVICE_AREAS) {
      expect(ctx.serviceAreas).not.toContain(city);
    }
  });

  it("region is derived from the first supplied service area (Plano area, TX)", () => {
    expect(ctx.region).toBe("Plano area, TX");
  });

  it("registry is the fakePlumbingRegistry", () => {
    expect(ctx.registry).toBe(fakePlumbingRegistry);
  });

  it("approvalMode uses the supplied value 'draft_only'", () => {
    expect(ctx.approvalMode).toBe("draft_only");
  });

  it("ctaText uses the supplied Lakeside phone number", () => {
    expect(ctx.ctaText).toContain("(972) 555-0100");
    expect(ctx.ctaText).not.toContain("(251) 324-9090");
  });

  it("topics are the supplied plumbing topics", () => {
    expect(ctx.topics).toEqual(LAKESIDE_DEFAULT_TOPICS);
  });

  it("registry.getDefaultTopics() returns plumbing topics, not pest topics", () => {
    const topics = ctx.registry.getDefaultTopics();
    expect(topics).toContain("Pipe Repair");
    expect(topics.some(t => t.toLowerCase().includes("bed bug"))).toBe(false);
  });

  it("system prompt opens with the plumbing copywriter role", () => {
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain(
      "You are a local plumbing social media copywriter for Lakeside Plumbing",
    );
  });

  it("system prompt contains the DFW region", () => {
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain("Plano area, TX");
  });

  it("system prompt contains the fake business rules", () => {
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain("Lakeside Plumbing is a licensed plumber serving Dallas");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-A2-5: BB&B Leakage Test (multi-tenant isolation)
// Asserts that the Lakeside Plumbing context and system prompt contain none of
// the BB&B-specific values. This is the critical multi-tenant isolation gate.
// ─────────────────────────────────────────────────────────────────────────────

describe("T-A2-5: BB&B leakage test — Lakeside Plumbing context contains no BB&B values", () => {
  const ctx = buildClientContentContext(fakePlumbingConfig, fakePlumbingRegistry);
  const prompt = buildSystemPrompt(ctx);

  // ── Context field leakage ────────────────────────────────────────────────

  it("context.clientName contains no BB&B business name", () => {
    expect(ctx.clientName).not.toContain("Bed Bugs");
    expect(ctx.clientName).not.toContain("Bed Bugs & Beyond");
  });

  it("context.industry contains no pest-control reference", () => {
    expect(ctx.industry).not.toContain("pest");
    expect(ctx.industry).not.toContain("pest_control");
  });

  it("context.serviceAreas contains no BB&B cities", () => {
    const bbbCityRoots = [
      "Foley", "Daphne", "Loxley", "Fairhope", "Gulf Shores",
      "Orange Beach", "Summerdale", "Spanish Fort", "Elberta",
      "Lillian", "Perdido",
    ];
    for (const city of ctx.serviceAreas) {
      for (const root of bbbCityRoots) {
        expect(city).not.toContain(root);
      }
    }
  });

  it("context.region contains no BB&B region language", () => {
    expect(ctx.region).not.toContain("Gulf Coast");
    expect(ctx.region).not.toContain("Baldwin County");
    expect(ctx.region).not.toContain("Alabama");
  });

  // ── System prompt leakage ─────────────────────────────────────────────────

  it("system prompt does not mention 'Bed Bugs & Beyond'", () => {
    expect(prompt).not.toContain("Bed Bugs & Beyond");
  });

  it("system prompt does not mention 'bed bug' (case-insensitive)", () => {
    expect(prompt.toLowerCase()).not.toContain("bed bug");
  });

  it("system prompt does not mention 'pest control' (case-insensitive)", () => {
    expect(prompt.toLowerCase()).not.toContain("pest control");
  });

  it("system prompt does not mention 'fumigation'", () => {
    expect(prompt.toLowerCase()).not.toContain("fumigation");
  });

  it("system prompt does not mention 'termite'", () => {
    expect(prompt.toLowerCase()).not.toContain("termite");
  });

  it("system prompt does not mention 'heat treatment'", () => {
    expect(prompt.toLowerCase()).not.toContain("heat treatment");
  });

  it("system prompt does not contain any BB&B city name", () => {
    const bbbCityRoots = [
      "foley", "daphne", "loxley", "fairhope", "gulf shores",
      "orange beach", "summerdale", "spanish fort", "elberta",
      "lillian", "perdido",
    ];
    const lower = prompt.toLowerCase();
    for (const city of bbbCityRoots) {
      expect(lower).not.toContain(city);
    }
  });

  it("system prompt does not contain 'Gulf Coast of Alabama'", () => {
    expect(prompt).not.toContain("Gulf Coast of Alabama");
  });

  it("system prompt does not contain 'Baldwin County'", () => {
    expect(prompt).not.toContain("Baldwin County");
  });

  it("system prompt does not contain BB&B system rules", () => {
    expect(prompt).not.toContain(
      "BB&B uses targeted treatment of affected furniture",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-A2-6: Context Immutability and Isolation
// Verifies that building multiple contexts produces independent objects and that
// mutable fields (serviceAreas, topics arrays) are not shared by reference.
// ─────────────────────────────────────────────────────────────────────────────

describe("T-A2-6: Context immutability and isolation", () => {
  it("two calls to buildClientContentContext(null) return different object references", () => {
    const a = buildClientContentContext(null);
    const b = buildClientContentContext(null);
    expect(a).not.toBe(b);
  });

  it("null-config and custom-config contexts are different objects", () => {
    const bbb = buildClientContentContext(null);
    const plumbing = buildClientContentContext(fakePlumbingConfig, fakePlumbingRegistry);
    expect(bbb).not.toBe(plumbing);
  });

  it("mutating serviceAreas on one null-config context does not affect another", () => {
    const a = buildClientContentContext(null);
    const b = buildClientContentContext(null);
    (a.serviceAreas as string[]).push("Injected City, ZZ");
    expect(b.serviceAreas).not.toContain("Injected City, ZZ");
    expect(b.serviceAreas).toEqual(BBB_DEFAULT_SERVICE_AREAS);
  });

  it("mutating topics on one context does not affect another", () => {
    const a = buildClientContentContext(null);
    const b = buildClientContentContext(null);
    const originalLength = b.topics.length;
    (a.topics as string[]).push("__injected_topic__");
    expect(b.topics).toHaveLength(originalLength);
    expect(b.topics).not.toContain("__injected_topic__");
  });

  it("custom registry is isolated to the context it was supplied to", () => {
    const bbb = buildClientContentContext(null);
    const plumbing = buildClientContentContext(fakePlumbingConfig, fakePlumbingRegistry);
    expect(bbb.registry).toBe(bbbRegistryProvider);
    expect(plumbing.registry).toBe(fakePlumbingRegistry);
    expect(bbb.registry).not.toBe(plumbing.registry);
  });

  it("normalizing topics via one registry does not affect another registry's normalizeTopics", () => {
    // BB&B registry strips termites; fake plumbing registry passes all topics through
    const bbResult = bbbRegistryProvider.normalizeTopics(["Bed Bug Treatment", "Termites"]);
    const fakeResult = fakePlumbingRegistry.normalizeTopics(["Bed Bug Treatment", "Termites"]);
    expect(bbResult).not.toContain("Termites");
    expect(fakeResult).toContain("Termites");
    // Neither call should have mutated the other registry's behavior
    expect(bbbRegistryProvider.normalizeTopics(["Termites"])).not.toContain("Termites");
    expect(fakePlumbingRegistry.normalizeTopics(["Termites"])).toContain("Termites");
  });

  it("repeated builds with null config produce semantically equal but reference-distinct contexts", () => {
    const builds: ClientContentContext[] = Array.from({ length: 5 }, () =>
      buildClientContentContext(null),
    );
    // All should be semantically equal
    for (const ctx of builds) {
      expect(ctx.clientName).toBe("Bed Bugs & Beyond");
      expect(ctx.region).toBe(BBB_REGION);
    }
    // All should be distinct objects
    const unique = new Set(builds);
    expect(unique.size).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-A2-7: Auto-Content Generate Route Characterization
// Tests the building blocks consumed by the generate route.
// Preference: behavior tests (what the route produces) over source-code inspection.
// ─────────────────────────────────────────────────────────────────────────────

describe("T-A2-7: Generate route building-block characterization", () => {
  describe("BB&B default behavior (null/empty config → same as pre-Phase-A1)", () => {
    const ctx = buildClientContentContext(null);

    it("clientName is 'Bed Bugs & Beyond' — the value written to generated posts", () => {
      expect(ctx.clientName).toBe("Bed Bugs & Beyond");
    });

    it("system prompt matches the canonical BB&B reference (same as pre-Phase-A1 hardcoded string)", () => {
      expect(buildSystemPrompt(ctx)).toBe(BBB_EXPECTED_SYSTEM_PROMPT);
    });

    it("registry.validateTopic rejects termites (the route returns 422 for these)", () => {
      expect(ctx.registry.validateTopic("Termites")).toBe("SERVICE_COMING_SOON");
    });

    it("registry.selectWeeklySlots returns slots — same slots the route assigns to schedule days", () => {
      const slots = ctx.registry.selectWeeklySlots(7);
      expect(slots).toHaveLength(7);
      expect(slots[0].service.serviceId).toBeTruthy();
    });

    it("registry.matchByTopic returns correct service data for serviceId assignment in DB insert", () => {
      const svc = ctx.registry.matchByTopic("Bed Bug Inspection");
      expect(svc?.serviceId).toBe("bed_bug_inspection");
      expect(svc?.revenueWeight).toBeGreaterThan(0);
    });

    it("registry.getPromptRules is used per-slot in the generation loop", () => {
      const rules = ctx.registry.getPromptRules("Bed Bug Treatment");
      expect(rules).toContain("targeted treatment");
    });
  });

  describe("custom registry override (simulates future non-BB&B client routing)", () => {
    const ctx = buildClientContentContext(fakePlumbingConfig, fakePlumbingRegistry);

    it("system prompt uses the custom registry's business rules, not BB&B's", () => {
      const prompt = buildSystemPrompt(ctx);
      expect(prompt).toContain("Lakeside Plumbing is a licensed plumber");
      expect(prompt).not.toContain("BB&B uses targeted treatment");
    });

    it("registry.validateTopic always returns null for the fake registry (pass-through)", () => {
      expect(ctx.registry.validateTopic("Any Topic")).toBeNull();
    });

    it("registry.selectWeeklySlots returns empty array for fake registry", () => {
      expect(ctx.registry.selectWeeklySlots(7)).toEqual([]);
    });

    it("registry.getDefaultTopics returns plumbing topics", () => {
      expect(ctx.registry.getDefaultTopics()).toContain("Pipe Repair");
    });
  });

  describe("partial config overrides only what is supplied", () => {
    it("supplying only clientName overrides the name but keeps BB&B geography", () => {
      const ctx = buildClientContentContext({ clientName: "Gulf Pest Pros" });
      expect(ctx.clientName).toBe("Gulf Pest Pros");
      // All Alabama service areas → still derives BB&B region
      expect(ctx.region).toBe(BBB_REGION);
      expect(ctx.registry).toBe(bbbRegistryProvider);
    });

    it("supplying only serviceAreas keeps clientName default", () => {
      const ctx = buildClientContentContext({
        serviceAreas: ["Austin, TX", "Round Rock, TX"],
      });
      expect(ctx.clientName).toBe("Bed Bugs & Beyond");
      expect(ctx.serviceAreas).toEqual(["Austin, TX", "Round Rock, TX"]);
      expect(ctx.region).not.toContain("Baldwin County");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-A2-8: Canonical Geography Protection
// Verifies that BBB_DEFAULT_SERVICE_AREAS and BBB_REGION are the canonical
// values used by buildClientContentContext(null), and characterizes their shape.
// ─────────────────────────────────────────────────────────────────────────────

describe("T-A2-8: Canonical geography protection", () => {
  it("BBB_DEFAULT_SERVICE_AREAS has exactly 11 entries", () => {
    expect(BBB_DEFAULT_SERVICE_AREAS).toHaveLength(11);
  });

  it("all BBB_DEFAULT_SERVICE_AREAS entries end with ', AL' (Alabama)", () => {
    for (const area of BBB_DEFAULT_SERVICE_AREAS) {
      expect(area).toMatch(/, AL$/);
    }
  });

  it("BBB_DEFAULT_SERVICE_AREAS includes the key BB&B markets", () => {
    expect(BBB_DEFAULT_SERVICE_AREAS).toContain("Foley, AL");
    expect(BBB_DEFAULT_SERVICE_AREAS).toContain("Gulf Shores, AL");
    expect(BBB_DEFAULT_SERVICE_AREAS).toContain("Orange Beach, AL");
    expect(BBB_DEFAULT_SERVICE_AREAS).toContain("Fairhope, AL");
    expect(BBB_DEFAULT_SERVICE_AREAS).toContain("Daphne, AL");
  });

  it("BBB_REGION is the canonical geographic context string", () => {
    expect(BBB_REGION).toBe("Gulf Coast of Alabama (Baldwin County)");
  });

  it("buildClientContentContext(null).serviceAreas equals BBB_DEFAULT_SERVICE_AREAS", () => {
    const ctx = buildClientContentContext(null);
    expect(ctx.serviceAreas).toEqual(BBB_DEFAULT_SERVICE_AREAS);
  });

  it("buildClientContentContext(null).region equals BBB_REGION", () => {
    const ctx = buildClientContentContext(null);
    expect(ctx.region).toBe(BBB_REGION);
  });

  it("empty serviceAreas array falls back to BBB_DEFAULT_SERVICE_AREAS", () => {
    const ctx = buildClientContentContext({ serviceAreas: [] });
    expect(ctx.serviceAreas).toEqual(BBB_DEFAULT_SERVICE_AREAS);
  });

  it("null serviceAreas falls back to BBB_DEFAULT_SERVICE_AREAS", () => {
    const ctx = buildClientContentContext({ serviceAreas: null });
    expect(ctx.serviceAreas).toEqual(BBB_DEFAULT_SERVICE_AREAS);
  });

  it("non-Alabama service areas derive a non-BB&B region string", () => {
    const ctx = buildClientContentContext({
      serviceAreas: ["Dallas, TX", "Fort Worth, TX"],
    });
    expect(ctx.region).not.toContain("Baldwin County");
    expect(ctx.region).not.toContain("Gulf Coast");
    expect(ctx.region).not.toContain("Alabama");
  });

  it("Alabama service areas always derive the canonical BB&B region string", () => {
    // Any subset of Alabama cities should produce the canonical BB&B region
    const ctx = buildClientContentContext({
      serviceAreas: ["Mobile, AL", "Huntsville, AL"],
    });
    expect(ctx.region).toBe(BBB_REGION);
  });
});
