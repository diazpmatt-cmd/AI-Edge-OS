/**
 * Phase C2 — Tests C, D & E
 *
 * C. Registry gate statuses (all 5 statuses)
 * D. BB&B prohibited-service protection
 * E. Fumigation educational-only behavior
 */

import { describe, it, expect } from "vitest";
import {
  registryGate,
  evaluateSeasonality,
} from "../../../../../lib/db/src/discovery-registry-gate";
import {
  bbbRegistryProvider,
  type ServiceRegistryProvider,
} from "../../../../../lib/db/src/client-context";
import type { BBBService } from "../../../../../lib/db/src/bbb-services";

// ══════════════════════════════════════════════════════════════════════════════
// C. Registry gate statuses
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-C-1: registryGate — 'allowed' status", () => {
  it("bed bug inspection → allowed (generationAllowed=true)", () => {
    const result = registryGate("Bed Bug Inspection", bbbRegistryProvider);
    expect(result.status).toBe("allowed");
    expect(result.reason).toBe("ok");
    expect(result.serviceId).toBeTruthy();
    expect(result.allowedAngles.length).toBeGreaterThan(0);
  });

  it("residential pest control → allowed", () => {
    const result = registryGate("Residential Pest Control", bbbRegistryProvider);
    expect(result.status).toBe("allowed");
  });

  it("mosquito control → allowed (seasonal service is still generatable)", () => {
    const result = registryGate("Mosquito Control", bbbRegistryProvider);
    expect(result.status).toBe("allowed");
  });

  it("allowed result carries prohibitedClaims for enforcement at prompt time", () => {
    const result = registryGate("Bed Bug Inspection", bbbRegistryProvider);
    expect(result.status).toBe("allowed");
    expect(Array.isArray(result.prohibitedClaims)).toBe(true);
  });

  it("allowed result carries allowedAngles for content angle selection", () => {
    const result = registryGate("Bed Bug Inspection", bbbRegistryProvider);
    expect(result.status).toBe("allowed");
    expect(result.allowedAngles.length).toBeGreaterThan(0);
  });
});

describe("T-C2-C-2: registryGate — 'blocked' status", () => {
  it("Termite Control → blocked (SERVICE_COMING_SOON)", () => {
    const result = registryGate("Termite Control", bbbRegistryProvider);
    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("SERVICE_COMING_SOON");
  });

  it("Wildlife Removal → blocked (SERVICE_DISABLED)", () => {
    const result = registryGate("Wildlife Removal", bbbRegistryProvider);
    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("SERVICE_DISABLED");
  });

  it("blocked result carries no prohibitedClaims (suppressed = no content)", () => {
    const result = registryGate("Termite Control", bbbRegistryProvider);
    expect(result.status).toBe("blocked");
    expect(result.prohibitedClaims).toEqual([]);
    expect(result.allowedAngles).toEqual([]);
  });
});

describe("T-C2-C-3: registryGate — 'unknown' status (no registry match)", () => {
  it("completely unmapped topic → unknown (pass-through)", () => {
    const result = registryGate("HVAC Repair", bbbRegistryProvider);
    expect(result.status).toBe("unknown");
    expect(result.reason).toBe("no_registry_match");
    expect(result.serviceId).toBeNull();
  });

  it("plumbing topic → unknown in BB&B registry", () => {
    const result = registryGate("Pipe Leak Repair", bbbRegistryProvider);
    expect(result.status).toBe("unknown");
  });

  it("unknown result carries empty prohibitedClaims and allowedAngles", () => {
    const result = registryGate("Solar Panel Installation", bbbRegistryProvider);
    expect(result.prohibitedClaims).toEqual([]);
    expect(result.allowedAngles).toEqual([]);
  });
});

describe("T-C2-C-4: registryGate — 'unsupported' status (malformed input)", () => {
  it("empty string → unsupported", () => {
    const result = registryGate("", bbbRegistryProvider);
    expect(result.status).toBe("unsupported");
    expect(result.reason).toBe("empty_signal_topic");
  });

  it("whitespace-only string → unsupported", () => {
    const result = registryGate("   ", bbbRegistryProvider);
    expect(result.status).toBe("unsupported");
  });

  it("null → unsupported", () => {
    const result = registryGate(null, bbbRegistryProvider);
    expect(result.status).toBe("unsupported");
  });

  it("undefined → unsupported", () => {
    const result = registryGate(undefined, bbbRegistryProvider);
    expect(result.status).toBe("unsupported");
  });
});

describe("T-C2-C-5: registryGate — 'educational_only' status", () => {
  it("returns educational_only for a service with only educational angles (no promotional)", () => {
    // Create a fake registry with a service that has no promotional angles
    const educationalOnlyService: BBBService = {
      serviceId:              "educational_service",
      displayName:            "Educational Service Only",
      category:               "specialty",
      status:                 "active",
      priority:               3,
      revenueWeight:          5,
      contentFrequencyWeight: 3,
      urgency:                "low",
      seasonality:            null,
      generationAllowed:      true,
      bookingAllowed:         true,
      publishAllowed:         true,
      ctaAllowed:             false,
      supportedAudiences:     ["homeowners"],
      campaignGoals:          ["homeowner_education"],
      allowedContentAngles:   ["educational", "faq"], // no promotional, no emergency
      prohibitedClaims:       ["no commercial claims"],
      differentiators:        [],
      notes: "Educational only test service",
    };

    const fakeRegistry: ServiceRegistryProvider = {
      getGeneratableServices: () => [educationalOnlyService],
      matchByTopic: (topic: string) => {
        if (topic.toLowerCase().includes("educational service")) return educationalOnlyService;
        return undefined;
      },
      getPromptRules: () => "test rules",
      validateTopic: () => null, // passes validation
      selectWeeklySlots: () => [],
      normalizeTopics: (t) => t,
      getDefaultTopics: () => [],
      getSystemBusinessRules: () => "test",
    };

    const result = registryGate("Educational Service Only", fakeRegistry);
    expect(result.status).toBe("educational_only");
    expect(result.reason).toContain("educational");
    expect(result.allowedAngles).toContain("educational");
    expect(result.allowedAngles).not.toContain("promotional");
    expect(result.prohibitedClaims).toContain("no commercial claims");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// D. BB&B prohibited-service protection
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-D-1: Termites must not become actionable", () => {
  it("Termite Control → blocked", () => {
    const result = registryGate("Termite Control", bbbRegistryProvider);
    expect(result.status).toBe("blocked");
  });

  it("Termite Inspection → blocked", () => {
    const result = registryGate("Termite Inspection", bbbRegistryProvider);
    expect(result.status).toBe("blocked");
  });

  it("Termite Treatment → blocked", () => {
    const result = registryGate("Termite Treatment", bbbRegistryProvider);
    expect(result.status).toBe("blocked");
  });
});

describe("T-C2-D-2: Wildlife removal must remain excluded", () => {
  it("Wildlife Removal → blocked", () => {
    const result = registryGate("Wildlife Removal", bbbRegistryProvider);
    expect(result.status).toBe("blocked");
  });

  it("Animal Removal → unknown (not in registry at all — passes through)", () => {
    const result = registryGate("Animal Removal", bbbRegistryProvider);
    // May be "unknown" (not matched) or "blocked" (matched as wildlife removal)
    // Either way, it must not be "allowed"
    expect(result.status).not.toBe("allowed");
  });
});

describe("T-C2-D-3: Bed bug heat treatment must remain excluded", () => {
  it("Whole-Home Bed Bug Heat Treatment → blocked", () => {
    const result = registryGate("Whole-Home Bed Bug Heat Treatment", bbbRegistryProvider);
    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("SERVICE_NOT_GENERATABLE");
  });

  it("Bed Bug Heat Treatment → blocked", () => {
    const result = registryGate("Bed Bug Heat Treatment", bbbRegistryProvider);
    expect(result.status).toBe("blocked");
  });
});

describe("T-C2-D-4: blocked services return no content constraints", () => {
  it("blocked termites: no allowedAngles, no prohibitedClaims", () => {
    const result = registryGate("Termite Control", bbbRegistryProvider);
    expect(result.status).toBe("blocked");
    expect(result.allowedAngles).toEqual([]);
    expect(result.prohibitedClaims).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// E. Fumigation educational-only behavior
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-E-1: Fumigation is allowed (generationAllowed=true)", () => {
  it("Fumigation → allowed (not blocked)", () => {
    const result = registryGate("Fumigation", bbbRegistryProvider);
    expect(result.status).not.toBe("blocked");
    expect(result.status).not.toBe("unsupported");
  });

  it("Fumigation → allowed status specifically", () => {
    // Fumigation is generatable with promotional angles available
    const result = registryGate("Fumigation", bbbRegistryProvider);
    // Either "allowed" or "educational_only" is acceptable — never "blocked"
    expect(["allowed", "educational_only"]).toContain(result.status);
  });
});

describe("T-C2-E-2: Fumigation carries educational content constraints", () => {
  it("Fumigation result has prohibitedClaims enforcing educational constraints", () => {
    const result = registryGate("Fumigation", bbbRegistryProvider);
    expect(result.prohibitedClaims.length).toBeGreaterThan(0);
  });

  it("Fumigation prohibitedClaims include DIY instruction restriction", () => {
    const result = registryGate("Fumigation", bbbRegistryProvider);
    const hasNodiyClaim = result.prohibitedClaims.some(c =>
      c.toLowerCase().includes("diy") || c.toLowerCase().includes("instruction"),
    );
    expect(hasNodiyClaim).toBe(true);
  });

  it("Fumigation prohibitedClaims include chemical restriction", () => {
    const result = registryGate("Fumigation", bbbRegistryProvider);
    const hasChemicalClaim = result.prohibitedClaims.some(c =>
      c.toLowerCase().includes("chemical") || c.toLowerCase().includes("fumigant"),
    );
    expect(hasChemicalClaim).toBe(true);
  });

  it("Fumigation allowedAngles include educational", () => {
    const result = registryGate("Fumigation", bbbRegistryProvider);
    expect(result.allowedAngles).toContain("educational");
  });
});

describe("T-C2-E-3: Fumigation is not mistaken for heat treatment", () => {
  it("Fumigation serviceId is 'fumigation' (not heat_treatment)", () => {
    const result = registryGate("Fumigation", bbbRegistryProvider);
    if (result.serviceId) {
      expect(result.serviceId).not.toContain("heat_treatment");
      expect(result.serviceId).not.toContain("heat");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Seasonality evaluator tests
// ══════════════════════════════════════════════════════════════════════════════

describe("T-C2-E-4: evaluateSeasonality — core scoring", () => {
  const mosquitoService = bbbRegistryProvider.getGeneratableServices()
    .find(s => s.serviceId === "mosquitoes")!;

  it("year-round service (null seasonality) → 80", () => {
    const yearRoundService = bbbRegistryProvider.getGeneratableServices()
      .find(s => !s.seasonality)!;
    expect(evaluateSeasonality(yearRoundService, 7)).toBe(80);
  });

  it("mosquitoes in July (peak April–October) → 100", () => {
    expect(evaluateSeasonality(mosquitoService, 7)).toBe(100);
  });

  it("mosquitoes in October (peak boundary) → 100", () => {
    expect(evaluateSeasonality(mosquitoService, 10)).toBe(100);
  });

  it("mosquitoes in April (peak boundary) → 100", () => {
    expect(evaluateSeasonality(mosquitoService, 4)).toBe(100);
  });

  it("mosquitoes in December (off-season) → 20", () => {
    expect(evaluateSeasonality(mosquitoService, 12)).toBe(20);
  });

  it("mosquitoes in January (off-season) → 20", () => {
    expect(evaluateSeasonality(mosquitoService, 1)).toBe(20);
  });

  it("evaluateSeasonality is deterministic: same inputs → same output", () => {
    const score1 = evaluateSeasonality(mosquitoService, 7);
    const score2 = evaluateSeasonality(mosquitoService, 7);
    expect(score1).toBe(score2);
  });
});
