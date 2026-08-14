import type { AuthorityScheduledExecutionPlan } from "./authority-scheduled-execution-plan.js";
import {
  deriveAuthorityProofCostEstimate,
  type AuthorityProofDerivedCostEstimate,
} from "./authority-proof-cost-estimate.js";
import {
  buildAuthorityProofRunPreflight,
  type AuthorityProofRunPreflight,
} from "./authority-proof-run-policy.js";

export type AuthorityProofCostEstimate = AuthorityProofDerivedCostEstimate;

export type AuthorityProofPreflightResult =
  | {
      readonly ok: true;
      readonly executionAllowed: false;
      readonly providerCallMade: false;
      readonly plan: AuthorityScheduledExecutionPlan;
      readonly proof: AuthorityProofRunPreflight;
      readonly costEstimate: Extract<AuthorityProofCostEstimate, { available: true }>;
    }
  | {
      readonly ok: false;
      readonly executionAllowed: false;
      readonly providerCallMade: false;
      readonly code: string;
      readonly plan: AuthorityScheduledExecutionPlan;
      readonly costEstimate: AuthorityProofCostEstimate;
      readonly proof: AuthorityProofRunPreflight | null;
    };

export function buildAuthorityProofPreflight(input: {
  readonly plan: AuthorityScheduledExecutionPlan;
  readonly costEstimate: AuthorityProofCostEstimate;
  readonly now?: Date;
}): AuthorityProofPreflightResult {
  const plan = input.plan;

  if (plan.providerExecutionAllowed !== false) {
    return Object.freeze({
      ok: false,
      executionAllowed: false,
      providerCallMade: false,
      code: "AUTHORITY_PROOF_PLAN_NOT_FAIL_CLOSED",
      plan,
      costEstimate: input.costEstimate,
      proof: null,
    });
  }

  if (plan.providerId !== "dataforseo_backlinks") {
    return Object.freeze({
      ok: false,
      executionAllowed: false,
      providerCallMade: false,
      code: "AUTHORITY_PROOF_PROVIDER_NOT_ALLOWLISTED",
      plan,
      costEstimate: input.costEstimate,
      proof: null,
    });
  }

  if (!input.costEstimate.available) {
    return Object.freeze({
      ok: false,
      executionAllowed: false,
      providerCallMade: false,
      code: `AUTHORITY_PROOF_${input.costEstimate.reason.toUpperCase()}`,
      plan,
      costEstimate: input.costEstimate,
      proof: null,
    });
  }

  const proof = buildAuthorityProofRunPreflight({
    clientId: plan.clientId,
    providerId: plan.providerId,
    providerRevision: plan.providerRevision,
    runId: plan.runId,
    fingerprint: plan.fingerprint,
    competitorDomains: plan.discovery.competitorDomains,
    serviceIds: plan.allowedServiceIds,
    geography: [plan.discovery.city, plan.discovery.region].filter(Boolean).join(", "),
    resultLimit: plan.discovery.limit,
    requestCount: 1,
    providerRequestRows: input.costEstimate.providerRequestRows,
    httpAttemptCount: input.costEstimate.httpAttemptCount,
    estimatedCostUsd: input.costEstimate.estimatedCostUsd,
  }, input.now);

  if (!proof.allowed) {
    return Object.freeze({
      ok: false,
      executionAllowed: false,
      providerCallMade: false,
      code: "AUTHORITY_PROOF_POLICY_BLOCKED",
      plan,
      costEstimate: input.costEstimate,
      proof,
    });
  }

  return Object.freeze({
    ok: true,
    executionAllowed: false,
    providerCallMade: false,
    plan,
    proof,
    costEstimate: input.costEstimate,
  });
}

/**
 * Zero-cost canonical entry point for #471 Phase A/B preflight.
 * Pricing is derived locally from the dated official pricing contract; this
 * function cannot execute DataForSEO and always preserves providerCallMade=false.
 */
export function buildAuthorityProofPreflightFromCurrentPricing(input: {
  readonly plan: AuthorityScheduledExecutionPlan;
  readonly now?: Date;
}): AuthorityProofPreflightResult {
  const now = input.now ?? new Date();
  return buildAuthorityProofPreflight({
    plan: input.plan,
    costEstimate: deriveAuthorityProofCostEstimate(input.plan, now),
    now,
  });
}
