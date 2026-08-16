import { describe, expect, it } from "vitest";
import {
  buildClientContentContext,
  buildContextFromRecords,
  buildSystemPrompt,
  type ServiceRegistryProvider,
} from "../../../../../lib/db/src/client-context";

const plumbingRegistry: ServiceRegistryProvider = {
  getGeneratableServices: () => [],
  matchByTopic: () => undefined,
  getPromptRules: () => "",
  validateTopic: () => null,
  selectWeeklySlots: () => [],
  normalizeTopics: topics => topics,
  getDefaultTopics: () => ["Pipe Repair"],
  getSystemBusinessRules: () => [
    "BUSINESS RULES (MUST FOLLOW):",
    "- Only discuss configured plumbing services.",
  ].join("\n"),
};

const alabamaPlumber = {
  id: "00000000-0000-4000-8000-000000000002",
  userId: "user_lakeside_002",
  slug: "lakeside-plumbing",
  clientName: "Lakeside Plumbing",
  industry: "plumbing",
  industryLabel: "plumbing",
  region: "Huntsville, AL",
  serviceAreas: JSON.stringify(["Huntsville, AL"]),
  timezone: "America/Chicago",
  isActive: true,
  createdAt: new Date("2026-08-15T00:00:00Z"),
  updatedAt: new Date("2026-08-15T00:00:00Z"),
};

describe("non-BB&B tenant context isolation regression", () => {
  it("uses the canonical stored Alabama region instead of inferring BB&B geography", () => {
    const resolved = buildContextFromRecords(alabamaPlumber, null, plumbingRegistry);
    expect(resolved.found).toBe(true);
    if (!resolved.found) return;

    expect(resolved.context.region).toBe("Huntsville, AL");
    expect(resolved.context.serviceAreas).toEqual(["Huntsville, AL"]);
    expect(buildSystemPrompt(resolved.context)).not.toContain("Baldwin County");
  });

  it("does not inherit the BB&B phone or business identity when settings are absent", () => {
    const resolved = buildContextFromRecords(alabamaPlumber, null, plumbingRegistry);
    expect(resolved.found).toBe(true);
    if (!resolved.found) return;

    const serialized = JSON.stringify(resolved.context);
    expect(resolved.context.clientName).toBe("Lakeside Plumbing");
    expect(resolved.context.ctaText).toBe("Contact Lakeside Plumbing");
    expect(serialized).not.toContain("Bed Bugs & Beyond");
    expect(serialized).not.toContain("251");
  });

  it("keeps the historical null-config BB&B compatibility path unchanged", () => {
    const legacy = buildClientContentContext(null);
    expect(legacy.clientName).toBe("Bed Bugs & Beyond");
    expect(legacy.region).toBe("Gulf Coast of Alabama (Baldwin County)");
    expect(legacy.ctaText).toContain("(251) 324-9090");
  });
});
