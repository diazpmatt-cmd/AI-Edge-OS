import { describe, expect, it } from "vitest";
import type { AuthorityScheduledExecutionPlan } from "./authority-scheduled-execution-plan.js";
import {
  buildAuthorityProofPreflight,
  buildAuthorityProofPreflightFromCurrentPricing,
} from "./authority-proof-preflight.js";

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

const trustedEstimate = Object.freeze({
  available: true as const,
  estimatedCostUsd: 0.0312,
  source: "provider_pricing_contract",
  providerRequestRows: 200,
  httpAttemptCount: 1 as const,
  pricingVerifiedAt: "2026-08-14T13:30:00.000Z",
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

  it("derives the bounded proof only from canonical plan plus billing and retry scope", () => {
    const result = buildAuthorityProofPreflight({
      plan,
      costEstimate: trustedEstimate,
      now: new Date("2026-08-14T14:15:00.000Z"),
    });
    expect(result.ok).toBe(true);
    expect(result.executionAllowed).toBe(false);
    expect(result.providerCallMade).toBe(false);
    if (result.ok) {
      expect(result.proof.allowed).toBe(true);
      expect(result.proof.limits).toEqual({
        maxCostUsd: 0.25,
        maxRequests: 1,
        maxResults: 50,
        maxProviderRows: 200,
        maxHttpAttempts: 1,
      });
      expect(result.proof.confirmationText).toMatch(/^ARM AUTHORITY [0-9a-f]{12}$/);
    }
  });

  it("builds a zero-cost preflight directly from the current dated pricing contract", () => {
    const result = buildAuthorityProofPreflightFromCurrentPricing({
      plan,
      now: new Date("2026-08-14T14:15:00.000Z"),
    });
    expect(result).toMatchObject({
      ok: true,
      executionAllowed: false,
      providerCallMade: false,
      costEstimate: {
        available: true,
        estimatedCostUsd: 0.0312,
        providerRequestRows: 200,
        httpAttemptCount: 1,
      },
    });
  });

  it("fails closed when the dated pricing contract has expired its review window", () => {
    const result = buildAuthorityProofPreflightFromCurrentPricing({
      plan,
      now: new Date("2026-09-14T14:15:00.000Z"),
    });
    expect(result).toMatchObject({
      ok: false,
      executionAllowed: false,
      providerCallMade: false,
      code: "AUTHORITY_PROOF_PRICING_CONTRACT_STALE",
      proof: null,
    });
  });

  it("blocks a cost estimate above the proof ceiling without execution", () => {
    const result = buildAuthorityProofPreflight({
      plan,
      costEstimate: { ...trustedEstimate, estimatedCostUsd: 0.251 },
    });
    expect(result.ok).toBe(false);
    expect(result.executionAllowed).toBe(false);
    expect(result.providerCallMade).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AUTHORITY_PROOF_POLICY_BLOCKED");
      expect(result.proof?.blockers).toContain("budget_per_run_ceiling_exceeded");
    }
  });

  it("blocks a hidden provider retry even when logical request count remains one", () => {
    const result = buildAuthorityProofPreflight({
      plan,
      costEstimate: { ...trustedEstimate, httpAttemptCount: 2 as never },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.proof?.blockers).toContain("http_attempt_count_must_equal_one");
    }
  });

  it("refuses any non-allowlisted provider even when a cost estimate exists", () => {
    const result = buildAuthorityProofPreflight({
      plan: { ...plan, providerId: "fixture_backlinks" },
      costEstimate: trustedEstimate,
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
      costEstimate: trustedEstimate,
    });
    expect(result).toMatchObject({
      ok: false,
      executionAllowed: false,
      providerCallMade: false,
      code: "AUTHORITY_PROOF_PLAN_NOT_FAIL_CLOSED",
    });
  });
});