import { describe, expect, it } from "vitest";
import type { AuthorityScheduledExecutionPlan } from "./authority-scheduled-execution-plan.js";
import { buildAuthorityProofPreflight } from "./authority-proof-preflight.js";

const plan: AuthorityScheduledExecutionPlan = Object.freeze({
  mode: "scheduled",
  clientId: "00000000-0000-4000-8000-000000000001",
  providerId: "dataforseo_backlinks",
  providerRevision: "dataforseo-backlinks-v1",
  capabilities: Object.freeze(["referring_domains"] as const),
  discovery: Object.freeze({
    clientId: "00000000-0000-4000-8000-000000000001",
    clientDomain: "bedbugsbeyond.com",
    competitorDomains: Object.freeze(["competitor.example"]),
    serviceIds: Object.freeze(["bed-bug-treatment"]),
    city: "Foley",
    region: "Baldwin County, Alabama",
    limit: 50,
  }),
  allowedServiceIds: Object.freeze(["bed-bug-treatment"]),
  fingerprint: "f".repeat(64),
  runId: "run-001",
  providerExecutionAllowed: false,
});

describe("Authority proof preflight", () => {
  it("fails closed when a trusted cost estimate is unavailable", () => {
    const result = buildAuthorityProofPreflight({
      plan,
      costEstimate: { available: false, reason: "estimated_cost_unavailable" },
    });
    expect(result).toMatchObject({
      ok: false,
      executionAllowed: false,
      providerCallMade: false,
      code: "AUTHORITY_PROOF_ESTIMATED_COST_UNAVAILABLE",
      proof: null,
    });
  });

  it("derives the bounded proof only from the canonical plan and trusted cost estimate", () => {
    const result = buildAuthorityProofPreflight({
      plan,
      costEstimate: { available: true, estimatedCostUsd: 0.03, source: "provider_pricing_contract" },
      now: new Date("2026-08-14T04:15:00.000Z"),
    });
    expect(result.ok).toBe(true);
    expect(result.executionAllowed).toBe(false);
    expect(result.providerCallMade).toBe(false);
    if (result.ok) {
      expect(result.proof.allowed).toBe(true);
      expect(result.proof.limits).toEqual({ maxCostUsd: 0.25, maxRequests: 1, maxResults: 50 });
      expect(result.proof.confirmationText).toMatch(/^ARM AUTHORITY [0-9a-f]{12}$/);
    }
  });

  it("blocks a cost estimate above the proof ceiling without execution", () => {
    const result = buildAuthorityProofPreflight({
      plan,
      costEstimate: { available: true, estimatedCostUsd: 0.251, source: "provider_pricing_contract" },
    });
    expect(result.ok).toBe(false);
    expect(result.executionAllowed).toBe(false);
    expect(result.providerCallMade).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AUTHORITY_PROOF_POLICY_BLOCKED");
      expect(result.proof?.blockers).toContain("budget_per_run_ceiling_exceeded");
    }
  });

  it("refuses any non-allowlisted provider even when a cost estimate exists", () => {
    const result = buildAuthorityProofPreflight({
      plan: { ...plan, providerId: "fixture_backlinks" },
      costEstimate: { available: true, estimatedCostUsd: 0, source: "fixture" },
    });
    expect(result).toMatchObject({
      ok: false,
      executionAllowed: false,
      providerCallMade: false,
      code: "AUTHORITY_PROOF_PROVIDER_NOT_ALLOWLISTED",
    });
  });

  it("preserves the plan's fail-closed execution contract", () => {
    const unsafePlan = { ...plan, providerExecutionAllowed: true } as unknown as AuthorityScheduledExecutionPlan;
    const result = buildAuthorityProofPreflight({
      plan: unsafePlan,
      costEstimate: { available: true, estimatedCostUsd: 0.03, source: "provider_pricing_contract" },
    });
    expect(result).toMatchObject({
      ok: false,
      executionAllowed: false,
      providerCallMade: false,
      code: "AUTHORITY_PROOF_PLAN_NOT_FAIL_CLOSED",
    });
  });
});
