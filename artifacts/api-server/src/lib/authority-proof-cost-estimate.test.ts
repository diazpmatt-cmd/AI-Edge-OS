import { describe, expect, it } from "vitest";
import type { DataForSEOBacklinkConfig } from "@workspace/db";
import type { AuthorityScheduledExecutionPlan } from "./authority-scheduled-execution-plan.js";
import {
  AUTHORITY_PROOF_DATAFORSEO_HTTP_ATTEMPTS,
  AUTHORITY_PROOF_DATAFORSEO_PROVIDER_ROW_CEILING,
  DATAFORSEO_BACKLINKS_PROOF_PRICING,
  buildAuthorityProofDataForSEOConfig,
  deriveAuthorityProofCostEstimate,
} from "./authority-proof-cost-estimate.js";

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

const baseConfig: DataForSEOBacklinkConfig = Object.freeze({
  login: "example@example.com",
  password: "not-a-real-secret",
  baseUrl: "https://api.dataforseo.com",
  enabled: true,
  maxRequestsPerRun: 10,
  retry: Object.freeze({ maxAttempts: 2, delayMs: 2000, timeoutMs: 30000 }),
});

describe("Authority proof DataForSEO pricing contract", () => {
  it("prices the provider row ceiling, not only the retained result limit", () => {
    const estimate = deriveAuthorityProofCostEstimate(plan, new Date("2026-08-14T14:00:00.000Z"));
    expect(estimate.available).toBe(true);
    if (estimate.available) {
      expect(estimate.providerRequestRows).toBe(AUTHORITY_PROOF_DATAFORSEO_PROVIDER_ROW_CEILING);
      expect(estimate.providerRequestRows).toBe(200);
      expect(estimate.estimatedCostUsd).toBe(0.0312);
      expect(estimate.httpAttemptCount).toBe(1);
      expect(estimate.source).toBe(DATAFORSEO_BACKLINKS_PROOF_PRICING.source);
    }
  });

  it("uses the smaller actual provider row ceiling for a smaller proof", () => {
    const estimate = deriveAuthorityProofCostEstimate({
      ...plan,
      discovery: { ...plan.discovery, limit: 10 },
    }, new Date("2026-08-14T14:00:00.000Z"));
    expect(estimate).toMatchObject({
      available: true,
      providerRequestRows: 40,
      estimatedCostUsd: 0.02544,
      httpAttemptCount: 1,
    });
  });

  it("fails closed once the dated pricing contract is stale", () => {
    const staleAt = new Date(
      Date.parse(DATAFORSEO_BACKLINKS_PROOF_PRICING.verifiedAt) +
        DATAFORSEO_BACKLINKS_PROOF_PRICING.reviewAfterMs +
        1,
    );
    expect(deriveAuthorityProofCostEstimate(plan, staleAt)).toEqual({
      available: false,
      reason: "pricing_contract_stale",
    });
  });

  it("fails closed on a non-allowlisted provider", () => {
    expect(deriveAuthorityProofCostEstimate({
      ...plan,
      providerId: "fixture_backlinks",
    }, new Date("2026-08-14T14:00:00.000Z"))).toEqual({
      available: false,
      reason: "provider_not_allowlisted",
    });
  });

  it("fails closed when the canonical result limit exceeds the proof policy", () => {
    expect(deriveAuthorityProofCostEstimate({
      ...plan,
      discovery: { ...plan.discovery, limit: 51 },
    }, new Date("2026-08-14T14:00:00.000Z"))).toEqual({
      available: false,
      reason: "result_limit_invalid",
    });
  });

  it("forces the future proof adapter to one request and one HTTP attempt", () => {
    const proof = buildAuthorityProofDataForSEOConfig(baseConfig);
    expect(proof.maxRequestsPerRun).toBe(1);
    expect(proof.retry.maxAttempts).toBe(AUTHORITY_PROOF_DATAFORSEO_HTTP_ATTEMPTS);
    expect(proof.retry.delayMs).toBe(baseConfig.retry.delayMs);
    expect(proof.retry.timeoutMs).toBe(baseConfig.retry.timeoutMs);
    expect(proof.login).toBe(baseConfig.login);
    expect(proof.password).toBe(baseConfig.password);
    expect(baseConfig.maxRequestsPerRun).toBe(10);
    expect(baseConfig.retry.maxAttempts).toBe(2);
  });
});
