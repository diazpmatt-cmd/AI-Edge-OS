/**
 * Phase B1 Tenant Isolation Tests
 *
 * Tests the pure resolution layer: resolveServiceRegistryProvider and
 * buildContextFromRecords (lib/db/src/client-context.ts).
 *
 * No DB access — all tests use mock ClientRecord and SettingsSnapshot objects.
 * Import convention: relative path (not @workspace/db) per vitest config.
 */

import { describe, it, expect } from "vitest";
import {
  resolveServiceRegistryProvider,
  buildContextFromRecords,
  BBB_CLIENT_SLUG,
  BBB_DEFAULT_SERVICE_AREAS,
  BBB_REGION,
  bbbRegistryProvider,
  type ClientRecord,
  type SettingsSnapshot,
  type ClientResolveResult,
} from "../../../../../lib/db/src/client-context";

// ── Mock factories ─────────────────────────────────────────────────────────────

function makeBbbClientRecord(overrides: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id:            "00000000-0000-0000-0000-000000000001",
    userId:        "user_bbb_pilot",
    slug:          BBB_CLIENT_SLUG,
    clientName:    "Bed Bugs & Beyond",
    industry:      "pest_control",
    industryLabel: "pest control",
    region:        BBB_REGION,
    serviceAreas:  JSON.stringify(BBB_DEFAULT_SERVICE_AREAS),
    timezone:      "America/Chicago",
    isActive:      true,
    createdAt:     new Date("2025-01-01T00:00:00Z"),
    updatedAt:     new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeUnknownClientRecord(overrides: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id:            "00000000-0000-0000-0000-000000000002",
    userId:        "user_unknown_co",
    slug:          "unknown-plumbing-co",
    clientName:    "Unknown Plumbing Co",
    industry:      "plumbing",
    industryLabel: "plumbing",
    region:        "Dallas, TX",
    serviceAreas:  JSON.stringify(["Dallas, TX", "Plano, TX"]),
    timezone:      "America/Chicago",
    isActive:      true,
    createdAt:     new Date("2025-01-01T00:00:00Z"),
    updatedAt:     new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeBbbSettingsSnapshot(overrides: Partial<SettingsSnapshot> = {}): SettingsSnapshot {
  return {
    approvalMode:  "approval_required",
    frequency:     "every_other_day",
    postingTimes:  JSON.stringify(["08:00", "12:00", "17:00"]),
    platforms:     JSON.stringify(["facebook", "google"]),
    toneStyle:     JSON.stringify(["professional", "friendly"]),
    postAngles:    null,
    topics:        null,
    ctaText:       "Call Now \u2014 (251) 324-9090",
    ctaPreference: "call_now",
    ...overrides,
  };
}

// ── T-B1-1: BB&B registry provider resolution ─────────────────────────────────

describe("T-B1-1: BB&B registry provider resolution", () => {
  it("resolves bed-bugs-and-beyond slug to bbbRegistryProvider", () => {
    const result = resolveServiceRegistryProvider({ slug: BBB_CLIENT_SLUG });
    expect(result.supported).toBe(true);
    if (result.supported) {
      expect(result.provider).toBe(bbbRegistryProvider);
    }
  });

  it("bbbRegistryProvider has all required ServiceRegistryProvider methods", () => {
    const result = resolveServiceRegistryProvider({ slug: BBB_CLIENT_SLUG });
    expect(result.supported).toBe(true);
    if (result.supported) {
      const p = result.provider;
      expect(typeof p.getGeneratableServices).toBe("function");
      expect(typeof p.matchByTopic).toBe("function");
      expect(typeof p.getPromptRules).toBe("function");
      expect(typeof p.validateTopic).toBe("function");
      expect(typeof p.selectWeeklySlots).toBe("function");
      expect(typeof p.normalizeTopics).toBe("function");
      expect(typeof p.getDefaultTopics).toBe("function");
      expect(typeof p.getSystemBusinessRules).toBe("function");
    }
  });

  it("buildContextFromRecords with BB&B record returns found:true", () => {
    const result = buildContextFromRecords(makeBbbClientRecord(), makeBbbSettingsSnapshot());
    expect(result.found).toBe(true);
  });

  it("resolved BB&B context has correct clientName", () => {
    const result = buildContextFromRecords(makeBbbClientRecord(), null);
    expect(result.found).toBe(true);
    if (result.found) expect(result.context.clientName).toBe("Bed Bugs & Beyond");
  });

  it("resolved BB&B context has all 11 canonical service areas", () => {
    const result = buildContextFromRecords(makeBbbClientRecord(), null);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.context.serviceAreas).toHaveLength(BBB_DEFAULT_SERVICE_AREAS.length);
      expect(result.context.serviceAreas).toContain("Foley, AL");
      expect(result.context.serviceAreas).toContain("Perdido Beach, AL");
    }
  });

  it("resolved BB&B context uses bbbRegistryProvider", () => {
    const result = buildContextFromRecords(makeBbbClientRecord(), null);
    expect(result.found).toBe(true);
    if (result.found) expect(result.context.registry).toBe(bbbRegistryProvider);
  });

  it("resolved BB&B context industry is pest_control", () => {
    const result = buildContextFromRecords(makeBbbClientRecord(), null);
    expect(result.found).toBe(true);
    if (result.found) expect(result.context.industry).toBe("pest_control");
  });

  it("resolved BB&B context industryLabel is pest control", () => {
    const result = buildContextFromRecords(makeBbbClientRecord(), null);
    expect(result.found).toBe(true);
    if (result.found) expect(result.context.industryLabel).toBe("pest control");
  });

  it("resolved BB&B context client reference is the original record", () => {
    const record = makeBbbClientRecord();
    const result = buildContextFromRecords(record, null);
    expect(result.found).toBe(true);
    if (result.found) expect(result.client).toBe(record);
  });
});

// ── T-B1-2: Unknown tenant — no silent fallback to BB&B ───────────────────────

describe("T-B1-2: Unknown tenant — no silent fallback to BB&B", () => {
  it("unknown slug returns { supported: false }", () => {
    const result = resolveServiceRegistryProvider({ slug: "unknown-plumbing-co" });
    expect(result.supported).toBe(false);
  });

  it("unknown slug result carries the slug for diagnostics", () => {
    const result = resolveServiceRegistryProvider({ slug: "unknown-plumbing-co" });
    expect(result.supported).toBe(false);
    if (!result.supported) {
      expect(result.slug).toBe("unknown-plumbing-co");
      expect(result.reason).toBe("no_registry_for_industry");
    }
  });

  it("buildContextFromRecords with unknown-slug client returns found:false / unsupported_registry", () => {
    const result = buildContextFromRecords(makeUnknownClientRecord(), null);
    expect(result.found).toBe(false);
    if (!result.found) expect(result.reason).toBe("unsupported_registry");
  });

  it("unsupported client result does NOT contain any BB&B strings", () => {
    const result = buildContextFromRecords(makeUnknownClientRecord(), null) as Extract<ClientResolveResult, { found: false }>;
    expect(result.found).toBe(false);
    // The result object must not contain any BB&B identity
    const resultJson = JSON.stringify(result);
    expect(resultJson).not.toContain("Bed Bugs");
    expect(resultJson).not.toContain("251");
    expect(resultJson).not.toContain("bed-bugs-and-beyond");
    expect(resultJson).not.toContain("Baldwin County");
  });

  it("unsupported client result does NOT expose a context", () => {
    const result = buildContextFromRecords(makeUnknownClientRecord(), null);
    expect(result.found).toBe(false);
    expect((result as Record<string, unknown>).context).toBeUndefined();
  });

  it("empty string slug returns { supported: false }", () => {
    const result = resolveServiceRegistryProvider({ slug: "" });
    expect(result.supported).toBe(false);
  });

  it("partial match on BBB_CLIENT_SLUG returns { supported: false }", () => {
    const r1 = resolveServiceRegistryProvider({ slug: "bed-bugs" });
    const r2 = resolveServiceRegistryProvider({ slug: "bed-bugs-and-beyond-extra" });
    expect(r1.supported).toBe(false);
    expect(r2.supported).toBe(false);
  });
});

// ── T-B1-3: Cross-client isolation — contexts are independent ─────────────────

describe("T-B1-3: Cross-client isolation", () => {
  it("two BB&B resolves produce independent context objects", () => {
    const r1 = buildContextFromRecords(makeBbbClientRecord(), null);
    const r2 = buildContextFromRecords(makeBbbClientRecord(), null);
    expect(r1.found).toBe(true);
    expect(r2.found).toBe(true);
    if (r1.found && r2.found) {
      expect(r1.context).not.toBe(r2.context);
    }
  });

  it("BB&B resolution does not affect unknown-client resolution", () => {
    const bbbResult  = buildContextFromRecords(makeBbbClientRecord(), null);
    const unknResult = buildContextFromRecords(makeUnknownClientRecord(), null);
    expect(bbbResult.found).toBe(true);
    expect(unknResult.found).toBe(false);
  });

  it("resolving client A does not expose client B userId in the result", () => {
    const clientA = makeBbbClientRecord({ userId: "user_A" });
    const result  = buildContextFromRecords(clientA, null);
    expect(result.found).toBe(true);
    if (result.found) {
      // Client A's record is in the result, not client B
      expect(result.client.userId).toBe("user_A");
      const resultJson = JSON.stringify(result);
      expect(resultJson).not.toContain("user_B");
    }
  });
});

// ── T-B1-4: Service area isolation ────────────────────────────────────────────

describe("T-B1-4: Service area isolation", () => {
  it("mutating one context serviceAreas does not affect another", () => {
    const r1 = buildContextFromRecords(makeBbbClientRecord(), null);
    const r2 = buildContextFromRecords(makeBbbClientRecord(), null);
    expect(r1.found && r2.found).toBe(true);
    if (r1.found && r2.found) {
      const snapshot = [...r1.context.serviceAreas];
      r1.context.serviceAreas.push("Injected, XX");
      expect(r2.context.serviceAreas).toEqual(snapshot);
    }
  });

  it("different DB service_areas columns produce different contexts", () => {
    const custom  = makeBbbClientRecord({ serviceAreas: JSON.stringify(["Only City, TX"]) });
    const result  = buildContextFromRecords(custom, null);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.context.serviceAreas).toEqual(["Only City, TX"]);
      expect(result.context.serviceAreas).not.toContain("Foley, AL");
    }
  });

  it("empty service_areas JSON falls back to BBB_DEFAULT_SERVICE_AREAS for BB&B", () => {
    const emptyAreas = makeBbbClientRecord({ serviceAreas: "[]" });
    const result     = buildContextFromRecords(emptyAreas, null);
    expect(result.found).toBe(true);
    if (result.found) {
      // buildClientContentContext fills in BBB_DEFAULT_SERVICE_AREAS when array is empty
      expect(result.context.serviceAreas).toEqual(BBB_DEFAULT_SERVICE_AREAS);
    }
  });
});

// ── T-B1-5: Settings snapshot isolation ───────────────────────────────────────

describe("T-B1-5: Settings snapshot isolation", () => {
  it("different settingsSnapshots produce different contexts", () => {
    const r1 = buildContextFromRecords(
      makeBbbClientRecord(),
      makeBbbSettingsSnapshot({ ctaText: "Text A" }),
    );
    const r2 = buildContextFromRecords(
      makeBbbClientRecord(),
      makeBbbSettingsSnapshot({ ctaText: "Text B" }),
    );
    expect(r1.found && r2.found).toBe(true);
    if (r1.found && r2.found) {
      expect(r1.context.ctaText).toBe("Text A");
      expect(r2.context.ctaText).toBe("Text B");
    }
  });

  it("null settings produces a valid BB&B context with defaults", () => {
    const result = buildContextFromRecords(makeBbbClientRecord(), null);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.context.ctaText).toBeTruthy();
      expect(result.context.approvalMode).toBeTruthy();
      expect(result.context.frequency).toBeTruthy();
    }
  });

  it("settings topics override the default topic list", () => {
    const customTopics = ["Cockroaches", "Ants"];
    const r = buildContextFromRecords(
      makeBbbClientRecord(),
      makeBbbSettingsSnapshot({ topics: JSON.stringify(customTopics) }),
    );
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.context.topics).toEqual(customTopics);
    }
  });

  it("settings platforms override the default platform list", () => {
    const r = buildContextFromRecords(
      makeBbbClientRecord(),
      makeBbbSettingsSnapshot({ platforms: JSON.stringify(["tiktok"]) }),
    );
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.context.platforms).toEqual(["tiktok"]);
    }
  });
});

// ── T-B1-6: Inactive clients rejected ─────────────────────────────────────────

describe("T-B1-6: Inactive clients rejected", () => {
  it("inactive BB&B client returns { found: false, reason: 'inactive' }", () => {
    const result = buildContextFromRecords(
      makeBbbClientRecord({ isActive: false }),
      makeBbbSettingsSnapshot(),
    );
    expect(result.found).toBe(false);
    if (!result.found) expect(result.reason).toBe("inactive");
  });

  it("inactive client result does NOT expose a context object", () => {
    const result = buildContextFromRecords(
      makeBbbClientRecord({ isActive: false }),
      null,
    );
    expect(result.found).toBe(false);
    expect((result as Record<string, unknown>).context).toBeUndefined();
  });

  it("inactive check runs before registry check (inactive unknown client → inactive, not unsupported)", () => {
    const result = buildContextFromRecords(
      makeUnknownClientRecord({ isActive: false }),
      null,
    );
    expect(result.found).toBe(false);
    if (!result.found) expect(result.reason).toBe("inactive");
  });
});

// ── T-B1-7: Tenant scope — resolver queries are per-userId ────────────────────

describe("T-B1-7: Tenant scope", () => {
  it("client records have distinct userIds", () => {
    const clientA = makeBbbClientRecord({ userId: "user_A", id: "uuid-A" });
    const clientB = makeBbbClientRecord({ userId: "user_B", id: "uuid-B" });
    expect(clientA.userId).not.toBe(clientB.userId);
  });

  it("resolved context only contains data from the provided client record", () => {
    const clientA = makeBbbClientRecord({
      userId: "user_A",
      clientName: "Client A Company",
    });
    const result = buildContextFromRecords(clientA, null);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.context.clientName).toBe("Client A Company");
      expect(result.client.userId).toBe("user_A");
    }
  });

  it("slug uniqueness: two records with different slugs resolve independently", () => {
    const r1 = resolveServiceRegistryProvider({ slug: BBB_CLIENT_SLUG });
    const r2 = resolveServiceRegistryProvider({ slug: "another-pest-co" });
    expect(r1.supported).toBe(true);
    expect(r2.supported).toBe(false);
  });
});

// ── T-B1-8: BB&B canonical field values ───────────────────────────────────────

describe("T-B1-8: BB&B canonical field values", () => {
  it("BBB_CLIENT_SLUG matches the canonical constant", () => {
    expect(BBB_CLIENT_SLUG).toBe("bed-bugs-and-beyond");
  });

  it("BB&B context region matches BBB_REGION when service areas include ', AL'", () => {
    const result = buildContextFromRecords(makeBbbClientRecord(), null);
    expect(result.found).toBe(true);
    if (result.found) expect(result.context.region).toBe(BBB_REGION);
  });

  it("BB&B context industry is pest_control and label is pest control", () => {
    const result = buildContextFromRecords(makeBbbClientRecord(), null);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.context.industry).toBe("pest_control");
      expect(result.context.industryLabel).toBe("pest control");
    }
  });

  it("ClientContentContext does NOT have an autopilot_enabled field", () => {
    const result = buildContextFromRecords(makeBbbClientRecord(), null);
    expect(result.found).toBe(true);
    if (result.found) {
      expect((result.context as Record<string, unknown>).autopilotEnabled).toBeUndefined();
      expect((result.context as Record<string, unknown>).autopilot_enabled).toBeUndefined();
    }
  });
});

// ── T-B1-9: Unsupported registry — explicit typed result ──────────────────────

describe("T-B1-9: Unsupported registry — explicit typed result", () => {
  it("every unknown slug returns the typed unsupported reason", () => {
    const slugs = ["plumbing-co", "hvac-llc", "roofing-pros", "", "BED-BUGS-AND-BEYOND"];
    for (const slug of slugs) {
      const result = resolveServiceRegistryProvider({ slug });
      expect(result.supported).toBe(false);
      if (!result.supported) {
        expect(result.reason).toBe("no_registry_for_industry");
      }
    }
  });

  it("BBB_CLIENT_SLUG comparison is case-sensitive — uppercase does not match", () => {
    const result = resolveServiceRegistryProvider({ slug: "BED-BUGS-AND-BEYOND" });
    expect(result.supported).toBe(false);
  });

  it("buildContextFromRecords reason for unsupported slug is 'unsupported_registry'", () => {
    const slugs = ["roofing", "hvac", "landscaping"];
    for (const slug of slugs) {
      const record = makeUnknownClientRecord({ slug });
      const result = buildContextFromRecords(record, null);
      expect(result.found).toBe(false);
      if (!result.found) expect(result.reason).toBe("unsupported_registry");
    }
  });
});

// ── T-B1-10: Service registry delegation ──────────────────────────────────────

describe("T-B1-10: BB&B service registry delegation", () => {
  it("bbbRegistryProvider.getDefaultTopics returns a non-empty array", () => {
    const topics = bbbRegistryProvider.getDefaultTopics();
    expect(Array.isArray(topics)).toBe(true);
    expect(topics.length).toBeGreaterThan(0);
  });

  it("bbbRegistryProvider.getGeneratableServices returns non-empty list", () => {
    const services = bbbRegistryProvider.getGeneratableServices();
    expect(services.length).toBeGreaterThan(0);
  });

  it("bbbRegistryProvider.getSystemBusinessRules starts with 'BUSINESS RULES'", () => {
    const rules = bbbRegistryProvider.getSystemBusinessRules();
    expect(rules).toMatch(/^BUSINESS RULES/);
  });

  it("bbbRegistryProvider.validateTopic returns null for a valid BB&B topic", () => {
    const topics = bbbRegistryProvider.getDefaultTopics();
    const firstTopic = topics[0];
    if (firstTopic) {
      const error = bbbRegistryProvider.validateTopic(firstTopic);
      expect(error).toBeNull();
    }
  });

  it("context registry methods match bbbRegistryProvider methods", () => {
    const result = buildContextFromRecords(makeBbbClientRecord(), null);
    expect(result.found).toBe(true);
    if (result.found) {
      const { registry } = result.context;
      expect(registry.getDefaultTopics()).toEqual(bbbRegistryProvider.getDefaultTopics());
      expect(registry.getGeneratableServices()).toEqual(bbbRegistryProvider.getGeneratableServices());
    }
  });
});
