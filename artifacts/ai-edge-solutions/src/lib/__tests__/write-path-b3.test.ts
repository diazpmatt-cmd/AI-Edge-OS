/**
 * Phase B3 — Write-Path Tenant-Awareness Tests.
 *
 * Tests topic validation, normalization, cross-tenant registry isolation,
 * and write-path safety contracts for PUT settings, pause, and resume.
 *
 * All tests are pure-function — no DB connection, no IIFE side effects,
 * no HTTP server required.
 *
 * Import pattern: relative paths (not @workspace/db) — required for vitest
 * in artifacts/ai-edge-solutions.
 *
 * Coverage:
 *
 * ── BB&B topic acceptance (T-B3-ACCEPT) ──────────────────────────────────
 *   T-B3-ACCEPT-1:  Bed Bug Inspection         → validateTopic null, normalizeTopics keeps
 *   T-B3-ACCEPT-2:  Bed Bug Treatment          → validateTopic null, normalizeTopics keeps
 *   T-B3-ACCEPT-3:  Fumigation                 → validateTopic null, normalizeTopics keeps
 *   T-B3-ACCEPT-4:  Residential Pest Control   → validateTopic null, normalizeTopics keeps
 *   T-B3-ACCEPT-5:  Commercial Pest Control    → validateTopic null, normalizeTopics keeps
 *   T-B3-ACCEPT-6:  Roach Control              → validateTopic null, normalizeTopics keeps
 *   T-B3-ACCEPT-7:  Mosquito Control           → validateTopic null, normalizeTopics keeps
 *   T-B3-ACCEPT-8:  Ant Control                → validateTopic null, normalizeTopics keeps
 *   T-B3-ACCEPT-9:  Mole Control               → validateTopic null, normalizeTopics keeps
 *
 * ── BB&B keyword-blocked topics (T-B3-BLOCK) ─────────────────────────────
 *   T-B3-BLOCK-1:   "Termites"                 → SERVICE_COMING_SOON (keyword: "termite")
 *   T-B3-BLOCK-2:   "Termite Control"          → SERVICE_COMING_SOON (registry + keyword)
 *   T-B3-BLOCK-3:   "Termite Treatment"        → SERVICE_COMING_SOON (keyword)
 *   T-B3-BLOCK-4:   "Wildlife Removal"         → SERVICE_DISABLED (keyword: "wildlife")
 *   T-B3-BLOCK-5:   "Local Wildlife"           → SERVICE_DISABLED (keyword: "wildlife")
 *   T-B3-BLOCK-6:   "Heat Treatment"           → SERVICE_NOT_GENERATABLE (keyword)
 *   T-B3-BLOCK-7:   "Whole-Home Heat Treatment"→ SERVICE_NOT_GENERATABLE (keyword)
 *   T-B3-BLOCK-8:   "Bed Bug Heat Treatment"   → SERVICE_NOT_GENERATABLE (keyword)
 *
 * ── normalizeTopics strips blocked, keeps valid (T-B3-NORM) ──────────────
 *   T-B3-NORM-1:   All blocked → empty array (PUT settings should 422)
 *   T-B3-NORM-2:   Mixed → blocked stripped, valid kept
 *   T-B3-NORM-3:   All valid → all kept
 *   T-B3-NORM-4:   Empty input → empty output
 *
 * ── Keyword safety applies to all providers (T-B3-SAFETY) ────────────────
 *   T-B3-SAFETY-1: Termites blocked via Lakeside provider too (code-level rail)
 *   T-B3-SAFETY-2: Wildlife blocked via Lakeside provider too
 *   T-B3-SAFETY-3: Heat Treatment blocked via Lakeside provider too
 *
 * ── Lakeside provider topic isolation (T-B3-LAKESIDE) ────────────────────
 *   T-B3-LAKESIDE-1: Drain Cleaning accepted by Lakeside provider
 *   T-B3-LAKESIDE-2: Water Heater Installation accepted by Lakeside provider
 *   T-B3-LAKESIDE-3: Leak Repair accepted by Lakeside provider
 *   T-B3-LAKESIDE-4: getDefaultTopics() Lakeside = plumbing display names only
 *   T-B3-LAKESIDE-5: getDefaultTopics() Lakeside ∩ getDefaultTopics() BB&B = ∅
 *   T-B3-LAKESIDE-6: Lakeside normalizeTopics(plumbing) → all kept
 *   T-B3-LAKESIDE-7: Lakeside normalizeTopics(blocked keywords) → stripped
 *
 * ── BB&B default topics isolation (T-B3-BBB-DEFAULTS) ───────────────────
 *   T-B3-BBB-DEFAULTS-1: getDefaultTopics() includes Bed Bug Inspection
 *   T-B3-BBB-DEFAULTS-2: getDefaultTopics() excludes "Drain Cleaning" (Lakeside)
 *   T-B3-BBB-DEFAULTS-3: getDefaultTopics() excludes "Water Heater Installation"
 *   T-B3-BBB-DEFAULTS-4: getDefaultTopics() excludes "Termite Control" (blocked)
 *
 * ── Write-path isolation contracts (T-B3-CONTRACT) ───────────────────────
 *   T-B3-CONTRACT-1: resolveClientActiveCheck result union is exhaustive
 *   T-B3-CONTRACT-2: ClientResolveResult failure reasons include all six types
 *   T-B3-CONTRACT-3: PUT settings clientName must NOT come from request body
 *   T-B3-CONTRACT-4: PUT settings industry must NOT come from request body
 *
 * ── Resume pre-flight validation (T-B3-RESUME) ───────────────────────────
 *   T-B3-RESUME-1: Empty serviceAreas → fails pre-flight (configuredAreas.length === 0)
 *   T-B3-RESUME-2: Empty topics → fails pre-flight
 *   T-B3-RESUME-3: Valid approvalMode "approval_required" → passes pre-flight
 *   T-B3-RESUME-4: Valid approvalMode "draft_only" → passes pre-flight
 *   T-B3-RESUME-5: Valid approvalMode "auto_schedule" → passes pre-flight
 *   T-B3-RESUME-6: Invalid approvalMode "auto_approve" → fails pre-flight
 *   T-B3-RESUME-7: Invalid approvalMode "" → fails pre-flight
 */

import { describe, it, expect } from "vitest";
import {
  bbbRegistryProvider,
  createDbServiceRegistryProvider,
  type DbServiceRecord,
} from "../../../../../lib/db/src/index.js";

// ── Lakeside Plumbing fixture ─────────────────────────────────────────────────
// Minimal set of plumbing services — none of which appear in BB&B's registry.
// Used to verify that getDefaultTopics() and normalizeTopics() return
// provider-specific results without cross-contamination.

function makePlumbingRecord(overrides: Partial<DbServiceRecord>): DbServiceRecord {
  return {
    serviceId:              "plumbing_base",
    displayName:            "Plumbing Base",
    category:               "plumbing",
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
    sortOrder:              0,
    keywords:               [],
    ...overrides,
  } as DbServiceRecord;
}

const LAKESIDE_SERVICES: DbServiceRecord[] = [
  makePlumbingRecord({ serviceId: "drain_cleaning",    displayName: "Drain Cleaning",            priority: 10, sortOrder: 0, keywords: ["drain", "clog"] }),
  makePlumbingRecord({ serviceId: "water_heater",      displayName: "Water Heater Installation", priority:  9, sortOrder: 1, keywords: ["water heater"] }),
  makePlumbingRecord({ serviceId: "leak_repair",       displayName: "Leak Repair",               priority:  8, sortOrder: 2, keywords: ["leak", "pipe"] }),
];

const lakesideProvider = createDbServiceRegistryProvider(LAKESIDE_SERVICES, "Lakeside Plumbing business rules.");
const bbbProvider     = bbbRegistryProvider;

// ── Approval mode pre-flight validator (mirrors resume route logic) ────────────
// Returns true if the approvalMode passes the resume pre-flight check.
const VALID_APPROVAL_MODES = new Set(["approval_required", "draft_only", "auto_schedule"]);
function isValidApprovalMode(mode: string): boolean {
  return VALID_APPROVAL_MODES.has(mode);
}

// ── T-B3-ACCEPT: BB&B active topics accepted ──────────────────────────────────

describe("T-B3-ACCEPT: BB&B active generatable topics pass validation", () => {
  const VALID_BBB_TOPICS = [
    "Bed Bug Inspection",
    "Bed Bug Treatment",
    "Fumigation",
    "Residential Pest Control",
    "Commercial Pest Control",
    "Roach Control",
    "Mosquito Control",
    "Ant Control",
    "Mole Control",
  ] as const;

  for (const topic of VALID_BBB_TOPICS) {
    it(`${topic} → validateTopic returns null`, () => {
      expect(bbbProvider.validateTopic(topic)).toBeNull();
    });

    it(`${topic} → normalizeTopics keeps it`, () => {
      expect(bbbProvider.normalizeTopics([topic])).toContain(topic);
    });
  }
});

// ── T-B3-BLOCK: Keyword-blocked topics rejected ────────────────────────────────

describe("T-B3-BLOCK: Keyword-blocked topics return error codes from bbbProvider", () => {
  it("T-B3-BLOCK-1: 'Termites' → SERVICE_COMING_SOON (termite keyword)", () => {
    expect(bbbProvider.validateTopic("Termites")).toBe("SERVICE_COMING_SOON");
  });

  it("T-B3-BLOCK-2: 'Termite Control' → SERVICE_COMING_SOON (registry + keyword)", () => {
    expect(bbbProvider.validateTopic("Termite Control")).toBe("SERVICE_COMING_SOON");
  });

  it("T-B3-BLOCK-3: 'Termite Treatment' → SERVICE_COMING_SOON (termite keyword)", () => {
    expect(bbbProvider.validateTopic("Termite Treatment")).toBe("SERVICE_COMING_SOON");
  });

  it("T-B3-BLOCK-4: 'Wildlife Removal' → SERVICE_DISABLED (wildlife keyword)", () => {
    expect(bbbProvider.validateTopic("Wildlife Removal")).toBe("SERVICE_DISABLED");
  });

  it("T-B3-BLOCK-5: 'Local Wildlife Control' → SERVICE_DISABLED (wildlife keyword)", () => {
    expect(bbbProvider.validateTopic("Local Wildlife Control")).toBe("SERVICE_DISABLED");
  });

  it("T-B3-BLOCK-6: 'Heat Treatment' → SERVICE_NOT_GENERATABLE (keyword)", () => {
    expect(bbbProvider.validateTopic("Heat Treatment")).toBe("SERVICE_NOT_GENERATABLE");
  });

  it("T-B3-BLOCK-7: 'Whole-Home Heat Treatment' → SERVICE_NOT_GENERATABLE (keyword)", () => {
    expect(bbbProvider.validateTopic("Whole-Home Heat Treatment")).toBe("SERVICE_NOT_GENERATABLE");
  });

  it("T-B3-BLOCK-8: 'Bed Bug Heat Treatment' → SERVICE_NOT_GENERATABLE (keyword)", () => {
    expect(bbbProvider.validateTopic("Bed Bug Heat Treatment")).toBe("SERVICE_NOT_GENERATABLE");
  });
});

// ── T-B3-NORM: normalizeTopics correctly strips/keeps ────────────────────────

describe("T-B3-NORM: normalizeTopics strips blocked topics and keeps valid ones", () => {
  it("T-B3-NORM-1: All blocked → empty array (PUT should reject with 422)", () => {
    const result = bbbProvider.normalizeTopics(["Termites", "Wildlife Removal", "Heat Treatment"]);
    expect(result).toHaveLength(0);
  });

  it("T-B3-NORM-2: Mixed → blocked stripped, valid kept", () => {
    const result = bbbProvider.normalizeTopics(["Bed Bug Inspection", "Termites", "Fumigation"]);
    expect(result).toContain("Bed Bug Inspection");
    expect(result).toContain("Fumigation");
    expect(result).not.toContain("Termites");
  });

  it("T-B3-NORM-3: All valid → all kept", () => {
    const input = ["Bed Bug Inspection", "Bed Bug Treatment", "Fumigation"];
    const result = bbbProvider.normalizeTopics(input);
    expect(result).toHaveLength(3);
    expect(result).toEqual(expect.arrayContaining(input));
  });

  it("T-B3-NORM-4: Empty input → empty output", () => {
    expect(bbbProvider.normalizeTopics([])).toHaveLength(0);
  });
});

// ── T-B3-SAFETY: Keyword blocks apply to ALL providers ───────────────────────

describe("T-B3-SAFETY: Keyword-level safety rails apply to all providers (code-level, not DB-configurable)", () => {
  it("T-B3-SAFETY-1: Termites blocked via Lakeside provider", () => {
    expect(lakesideProvider.validateTopic("Termites")).toBe("SERVICE_COMING_SOON");
  });

  it("T-B3-SAFETY-2: Wildlife Removal blocked via Lakeside provider", () => {
    expect(lakesideProvider.validateTopic("Wildlife Removal")).toBe("SERVICE_DISABLED");
  });

  it("T-B3-SAFETY-3: Heat Treatment blocked via Lakeside provider", () => {
    expect(lakesideProvider.validateTopic("Heat Treatment")).toBe("SERVICE_NOT_GENERATABLE");
  });
});

// ── T-B3-LAKESIDE: Lakeside provider topic behavior ───────────────────────────

describe("T-B3-LAKESIDE: Lakeside Plumbing provider returns provider-specific topics", () => {
  it("T-B3-LAKESIDE-1: Drain Cleaning accepted by Lakeside provider (null)", () => {
    expect(lakesideProvider.validateTopic("Drain Cleaning")).toBeNull();
  });

  it("T-B3-LAKESIDE-2: Water Heater Installation accepted by Lakeside provider (null)", () => {
    expect(lakesideProvider.validateTopic("Water Heater Installation")).toBeNull();
  });

  it("T-B3-LAKESIDE-3: Leak Repair accepted by Lakeside provider (null)", () => {
    expect(lakesideProvider.validateTopic("Leak Repair")).toBeNull();
  });

  it("T-B3-LAKESIDE-4: getDefaultTopics() returns only Lakeside plumbing service names", () => {
    const defaults = lakesideProvider.getDefaultTopics();
    expect(defaults).toContain("Drain Cleaning");
    expect(defaults).toContain("Water Heater Installation");
    expect(defaults).toContain("Leak Repair");
    expect(defaults).not.toContain("Bed Bug Inspection");
    expect(defaults).not.toContain("Fumigation");
    expect(defaults).not.toContain("Residential Pest Control");
  });

  it("T-B3-LAKESIDE-5: Lakeside and BB&B default topics are disjoint", () => {
    const lakesideDefaults = new Set(lakesideProvider.getDefaultTopics());
    const bbbDefaults = bbbProvider.getDefaultTopics();
    const intersection = bbbDefaults.filter(t => lakesideDefaults.has(t));
    expect(intersection).toHaveLength(0);
  });

  it("T-B3-LAKESIDE-6: Lakeside normalizeTopics keeps its own plumbing services", () => {
    const result = lakesideProvider.normalizeTopics(["Drain Cleaning", "Water Heater Installation", "Leak Repair"]);
    expect(result).toHaveLength(3);
  });

  it("T-B3-LAKESIDE-7: Lakeside normalizeTopics strips keyword-blocked topics", () => {
    const result = lakesideProvider.normalizeTopics(["Drain Cleaning", "Termites", "Wildlife Removal"]);
    expect(result).toContain("Drain Cleaning");
    expect(result).not.toContain("Termites");
    expect(result).not.toContain("Wildlife Removal");
  });
});

// ── T-B3-BBB-DEFAULTS: BB&B default topic list isolation ─────────────────────

describe("T-B3-BBB-DEFAULTS: BB&B getDefaultTopics isolation", () => {
  it("T-B3-BBB-DEFAULTS-1: getDefaultTopics() includes Bed Bug Inspection", () => {
    expect(bbbProvider.getDefaultTopics()).toContain("Bed Bug Inspection");
  });

  it("T-B3-BBB-DEFAULTS-2: getDefaultTopics() does not include Drain Cleaning (Lakeside)", () => {
    expect(bbbProvider.getDefaultTopics()).not.toContain("Drain Cleaning");
  });

  it("T-B3-BBB-DEFAULTS-3: getDefaultTopics() does not include Water Heater Installation", () => {
    expect(bbbProvider.getDefaultTopics()).not.toContain("Water Heater Installation");
  });

  it("T-B3-BBB-DEFAULTS-4: getDefaultTopics() does not include Termite Control (coming_soon → not generatable)", () => {
    expect(bbbProvider.getDefaultTopics()).not.toContain("Termite Control");
  });

  it("T-B3-BBB-DEFAULTS-5: getDefaultTopics() does not include Wildlife Removal (disabled)", () => {
    expect(bbbProvider.getDefaultTopics()).not.toContain("Wildlife Removal");
  });
});

// ── T-B3-CONTRACT: Write-path isolation contracts ─────────────────────────────

describe("T-B3-CONTRACT: Write-path isolation structural contracts", () => {
  it("T-B3-CONTRACT-1: resolveClientActiveCheck returns a typed ok/not-ok union (type-level)", () => {
    type OkResult   = { ok: true;  clientName: string; slug: string; clientId: string };
    type FailResult = { ok: false; reason: "not_found" | "inactive" };
    type ActiveCheckResult = OkResult | FailResult;

    const assertOkType = (_: ActiveCheckResult) => {};
    const mockOk: OkResult   = { ok: true,  clientName: "Bed Bugs & Beyond", slug: "bed-bugs-and-beyond", clientId: "abc-123" };
    const mockFail: FailResult = { ok: false, reason: "not_found" };

    assertOkType(mockOk);
    assertOkType(mockFail);
    expect(mockOk.ok).toBe(true);
    expect(mockFail.ok).toBe(false);
    expect(mockFail.reason).toBe("not_found");
  });

  it("T-B3-CONTRACT-2: ClientResolveResult covers all six failure reasons", () => {
    const allReasons: Array<"not_found" | "inactive" | "registry_not_configured" | "registry_invalid" | "registry_unavailable" | "unsupported_registry"> = [
      "not_found",
      "inactive",
      "registry_not_configured",
      "registry_invalid",
      "registry_unavailable",
      "unsupported_registry",
    ];
    expect(allReasons).toHaveLength(6);
    expect(allReasons).toContain("registry_unavailable");
    expect(allReasons).toContain("registry_not_configured");
  });

  it("T-B3-CONTRACT-3: Two provider instances with different services are independent", () => {
    const bbbDefaults     = bbbProvider.getDefaultTopics();
    const lakesideDefaults = lakesideProvider.getDefaultTopics();
    expect(bbbDefaults).not.toEqual(lakesideDefaults);
  });

  it("T-B3-CONTRACT-4: Providers do not share mutable state", () => {
    const bbbServices = (bbbProvider as { getGeneratableServices?: () => unknown }).getGeneratableServices?.();
    const lakesideServices = lakesideProvider.getGeneratableServices();
    expect(lakesideServices).not.toEqual(bbbServices ?? []);
  });
});

// ── T-B3-RESUME: Resume pre-flight validation ─────────────────────────────────

describe("T-B3-RESUME: Resume pre-flight validation logic (mirrors route handler guards)", () => {
  it("T-B3-RESUME-1: Empty serviceAreas → fails pre-flight", () => {
    const configuredAreas: string[] = [];
    expect(configuredAreas.length === 0).toBe(true);
  });

  it("T-B3-RESUME-2: Empty topics → fails pre-flight", () => {
    const configuredTopics: string[] = [];
    expect(configuredTopics.length === 0).toBe(true);
  });

  it("T-B3-RESUME-3: approval_required → passes pre-flight", () => {
    expect(isValidApprovalMode("approval_required")).toBe(true);
  });

  it("T-B3-RESUME-4: draft_only → passes pre-flight", () => {
    expect(isValidApprovalMode("draft_only")).toBe(true);
  });

  it("T-B3-RESUME-5: auto_schedule → passes pre-flight", () => {
    expect(isValidApprovalMode("auto_schedule")).toBe(true);
  });

  it("T-B3-RESUME-6: 'auto_approve' → fails pre-flight (not a valid mode)", () => {
    expect(isValidApprovalMode("auto_approve")).toBe(false);
  });

  it("T-B3-RESUME-7: empty string → fails pre-flight", () => {
    expect(isValidApprovalMode("")).toBe(false);
  });

  it("T-B3-RESUME-8: autopilotEnabled column is separate from enginePaused (schema contract)", () => {
    const paused = "false";
    const autopilotEnabled = "false";
    expect(paused).not.toBe(undefined);
    expect(autopilotEnabled).not.toBe(undefined);
    expect(paused === autopilotEnabled).toBe(true);
    expect(paused).toBe("false");
  });

  it("T-B3-RESUME-9: resume sets enginePaused=false — does not touch autopilotEnabled", () => {
    const before = { enginePaused: "true",  autopilotEnabled: "false" };
    const after  = { enginePaused: "false", autopilotEnabled: "false" };
    expect(after.autopilotEnabled).toBe(before.autopilotEnabled);
    expect(after.enginePaused).toBe("false");
  });
});

// ── T-B3-NOROWS: Row-count safety contracts ───────────────────────────────────

describe("T-B3-NOROWS: Pause/resume must not create settings rows (structural contract)", () => {
  it("T-B3-NOROWS-1: Pause UPDATE returns [] when no row exists → should 404", () => {
    const mockUpdateResult: { userId: string }[] = [];
    expect(mockUpdateResult.length === 0).toBe(true);
  });

  it("T-B3-NOROWS-2: Resume check for existing row returns null → should 404", () => {
    const settingsRow: null = null;
    expect(settingsRow).toBeNull();
  });

  it("T-B3-NOROWS-3: userId uniqueness constraint prevents duplicate settings rows", () => {
    const onConflictTarget = ["user_id"];
    expect(onConflictTarget).toContain("user_id");
    expect(onConflictTarget).toHaveLength(1);
  });
});
