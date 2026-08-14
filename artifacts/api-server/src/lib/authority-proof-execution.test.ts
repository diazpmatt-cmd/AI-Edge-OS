import { describe, expect, it, vi } from "vitest";
import type { AuthorityScheduledExecutionPlan } from "./authority-scheduled-execution-plan.js";
import { buildAuthorityProofPreflightFromCurrentPricing } from "./authority-proof-preflight.js";
import { executeAuthorityProofOnce } from "./authority-proof-execution.js";

const now = new Date("2026-08-14T14:30:00.000Z");
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

function gateMaterial() {
  const preflight = buildAuthorityProofPreflightFromCurrentPricing({ plan, now });
  if (!preflight.ok) throw new Error(`preflight unexpectedly blocked: ${preflight.code}`);
  return {
    preflight,
    arm: {
      payloadHash: preflight.proof.payloadHash,
      confirmation: preflight.proof.confirmationText,
    },
    spendAuthorization: {
      approved: true as const,
      authorizationRef: "human-spend-authorization-001",
      payloadHash: preflight.proof.payloadHash,
      maxCostUsd: 0.25,
      maxRequests: 1 as const,
      maxProviderRows: 200,
      maxHttpAttempts: 1 as const,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    },
  };
}

function successfulExecution() {
  return {
    providerCallMade: true,
    replayed: false,
    result: {
      clientId: plan.clientId,
      provider: "dataforseo_backlinks",
      observed: 12,
      accepted: 10,
      rejected: 2,
      mergedEvidence: 8,
      prospectIds: ["p1", "p2"],
      evidenceIds: ["e1", "e2", "e3"],
      opportunityIds: ["o1"],
      workflowIds: ["w1"],
    },
  } as const;
}

describe("Authority proof one-shot execution gate", () => {
  it("cannot invoke the effectful dependency without explicit spend authorization", async () => {
    const executeIngestion = vi.fn(async () => successfulExecution());
    const { arm } = gateMaterial();
    const result = await executeAuthorityProofOnce({
      plan,
      arm,
      spendAuthorization: null,
      now,
      dependencies: { executeIngestion },
    });

    expect(result).toEqual({
      outcome: "blocked",
      code: "AUTHORITY_PROOF_SPEND_AUTHORIZATION_REQUIRED",
      executionAllowed: false,
      providerCallMade: false,
      authorizationRef: null,
    });
    expect(executeIngestion).not.toHaveBeenCalled();
  });

  it("binds spend authorization to the exact proof payload hash", async () => {
    const executeIngestion = vi.fn(async () => successfulExecution());
    const { arm, spendAuthorization } = gateMaterial();
    const result = await executeAuthorityProofOnce({
      plan,
      arm,
      spendAuthorization: { ...spendAuthorization, payloadHash: "0".repeat(64) },
      now,
      dependencies: { executeIngestion },
    });

    expect(result).toMatchObject({
      outcome: "blocked",
      code: "AUTHORITY_PROOF_SPEND_PAYLOAD_HASH_MISMATCH",
      providerCallMade: false,
    });
    expect(executeIngestion).not.toHaveBeenCalled();
  });

  it("blocks expired or insufficient spend authority before the effect boundary", async () => {
    const executeIngestion = vi.fn(async () => successfulExecution());
    const { arm, spendAuthorization } = gateMaterial();

    const expired = await executeAuthorityProofOnce({
      plan,
      arm,
      spendAuthorization: { ...spendAuthorization, expiresAt: now.toISOString() },
      now,
      dependencies: { executeIngestion },
    });
    expect(expired).toMatchObject({ outcome: "blocked", code: "AUTHORITY_PROOF_SPEND_AUTHORIZATION_EXPIRED" });

    const insufficient = await executeAuthorityProofOnce({
      plan,
      arm,
      spendAuthorization: { ...spendAuthorization, maxCostUsd: 0.01 },
      now,
      dependencies: { executeIngestion },
    });
    expect(insufficient).toMatchObject({ outcome: "blocked", code: "AUTHORITY_PROOF_SPEND_COST_NOT_AUTHORIZED" });
    expect(executeIngestion).not.toHaveBeenCalled();
  });

  it("requires the exact arm confirmation after spend authorization is valid", async () => {
    const executeIngestion = vi.fn(async () => successfulExecution());
    const { arm, spendAuthorization } = gateMaterial();
    const result = await executeAuthorityProofOnce({
      plan,
      arm: { ...arm, confirmation: "ARM AUTHORITY wrong" },
      spendAuthorization,
      now,
      dependencies: { executeIngestion },
    });

    expect(result).toMatchObject({
      outcome: "blocked",
      code: "AUTHORITY_PROOF_CONFIRMATION_MISMATCH",
      providerCallMade: false,
    });
    expect(executeIngestion).not.toHaveBeenCalled();
  });

  it("calls the effect boundary exactly once only after pricing, spend, and arm gates all pass", async () => {
    const executeIngestion = vi.fn(async () => successfulExecution());
    const { arm, spendAuthorization } = gateMaterial();
    const result = await executeAuthorityProofOnce({
      plan,
      arm,
      spendAuthorization,
      now,
      dependencies: { executeIngestion },
    });

    expect(executeIngestion).toHaveBeenCalledTimes(1);
    expect(executeIngestion).toHaveBeenCalledWith({ plan, now });
    expect(result).toEqual({
      outcome: "completed",
      executionAllowed: true,
      providerCallMade: true,
      replayed: false,
      authorizationRef: "human-spend-authorization-001",
      runId: "run-001",
      provider: "dataforseo_backlinks",
      counts: {
        observed: 12,
        accepted: 10,
        rejected: 2,
        mergedEvidence: 8,
        prospects: 2,
        evidence: 3,
        opportunities: 1,
        workflows: 1,
      },
    });
  });

  it("preserves truthful replay/provider-call evidence from the effect boundary", async () => {
    const executeIngestion = vi.fn(async () => ({
      providerCallMade: false,
      replayed: true,
      result: successfulExecution().result,
    }));
    const { arm, spendAuthorization } = gateMaterial();
    const result = await executeAuthorityProofOnce({
      plan,
      arm,
      spendAuthorization,
      now,
      dependencies: { executeIngestion },
    });

    expect(result).toMatchObject({ outcome: "completed", providerCallMade: false, replayed: true });
  });

  it("returns bounded in-progress state without inventing a provider call", async () => {
    const executeIngestion = vi.fn(async () => ({
      providerCallMade: false,
      replayed: false,
      result: {
        outcome: "in_progress" as const,
        runId: plan.runId,
        clientId: plan.clientId,
        provider: "dataforseo_backlinks",
      },
    }));
    const { arm, spendAuthorization } = gateMaterial();
    const result = await executeAuthorityProofOnce({
      plan,
      arm,
      spendAuthorization,
      now,
      dependencies: { executeIngestion },
    });

    expect(result).toEqual({
      outcome: "in_progress",
      executionAllowed: true,
      providerCallMade: false,
      replayed: false,
      authorizationRef: "human-spend-authorization-001",
      runId: plan.runId,
      provider: "dataforseo_backlinks",
    });
  });
});
