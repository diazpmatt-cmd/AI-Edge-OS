import { describe, expect, it } from "vitest";

import { buildAuthorityScheduledExecutionPlan } from "./authority-scheduled-execution-plan.js";

const discovery = {
  clientId: "client-1",
  clientDomain: "example.com",
  competitorDomains: ["competitor-a.com", "competitor-b.com"],
  serviceIds: ["service-b", "service-a"],
  city: "Foley",
  region: "Baldwin County, Alabama",
  limit: 50,
};

const provider = {
  providerId: "dataforseo_backlinks",
  providerRevision: "dataforseo-backlinks-v1",
  capabilities: ["referring_domains", "link_intersections", "authority_metrics"] as const,
};

describe("buildAuthorityScheduledExecutionPlan", () => {
  it("builds a deterministic no-spend scheduled plan", () => {
    const first = buildAuthorityScheduledExecutionPlan({ discovery, provider });
    const second = buildAuthorityScheduledExecutionPlan({ discovery, provider });
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.plan.mode).toBe("scheduled");
      expect(first.plan.providerExecutionAllowed).toBe(false);
      expect(first.plan.runId).toMatch(/^blrun::[0-9a-f]{32}$/);
      expect(first.plan.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(first.plan.allowedServiceIds).toEqual(["service-a", "service-b"]);
    }
  });

  it("changes identity when canonical discovery input changes", () => {
    const first = buildAuthorityScheduledExecutionPlan({ discovery, provider });
    const second = buildAuthorityScheduledExecutionPlan({
      discovery: { ...discovery, competitorDomains: ["competitor-c.com"] },
      provider,
    });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(first.plan.runId).not.toBe(second.plan.runId);
  });

  it("requires at least one canonical competitor", () => {
    expect(buildAuthorityScheduledExecutionPlan({
      discovery: { ...discovery, competitorDomains: [] },
      provider,
    })).toMatchObject({ ok: false, code: "AUTHORITY_SCHEDULED_COMPETITORS_REQUIRED" });
  });

  it("rejects noncanonical provider identity", () => {
    expect(buildAuthorityScheduledExecutionPlan({
      discovery,
      provider: { ...provider, providerId: "DataForSEO Backlinks" },
    })).toMatchObject({ ok: false, code: "AUTHORITY_SCHEDULED_PROVIDER_ID_INVALID" });
  });

  it("dedupes and sorts provider capabilities", () => {
    const result = buildAuthorityScheduledExecutionPlan({
      discovery,
      provider: {
        ...provider,
        capabilities: ["referring_domains", "authority_metrics", "referring_domains"],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.capabilities).toEqual(["authority_metrics", "referring_domains"]);
  });
});
