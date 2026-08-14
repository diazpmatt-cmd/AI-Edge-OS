import type { BacklinkIngestionInProgress, BacklinkIngestionSummary } from "@workspace/db";
import type { AuthorityScheduledExecutionPlan } from "./authority-scheduled-execution-plan.js";
import { buildAuthorityProofPreflightFromCurrentPricing } from "./authority-proof-preflight.js";
import {
  AUTHORITY_PROOF_MAX_COST_USD,
  AUTHORITY_PROOF_MAX_HTTP_ATTEMPTS,
  AUTHORITY_PROOF_MAX_PROVIDER_ROWS,
  AUTHORITY_PROOF_MAX_REQUESTS,
  validateAuthorityProofArm,
} from "./authority-proof-run-policy.js";

export interface AuthorityProofSpendAuthorization {
  readonly approved: true;
  readonly authorizationRef: string;
  readonly payloadHash: string;
  readonly maxCostUsd: number;
  readonly maxRequests: 1;
  readonly maxProviderRows: number;
  readonly maxHttpAttempts: 1;
  readonly expiresAt: string;
}

export interface AuthorityProofArmSubmission {
  readonly payloadHash: string;
  readonly confirmation: string;
}

export interface AuthorityProofIngestionExecutionResult {
  readonly providerCallMade: boolean;
  readonly replayed: boolean;
  readonly result: BacklinkIngestionSummary | BacklinkIngestionInProgress;
}

export interface AuthorityProofExecutionDependencies {
  /**
   * The only effectful boundary. No production implementation is mounted by
   * this module. A later separately reviewed adapter must return truthful call
   * and replay evidence instead of letting this gate infer provider activity.
   */
  executeIngestion(input: {
    readonly plan: AuthorityScheduledExecutionPlan;
    readonly now: Date;
  }): Promise<AuthorityProofIngestionExecutionResult>;
}

export type AuthorityProofExecutionResult =
  | {
      readonly outcome: "blocked";
      readonly code: string;
      readonly executionAllowed: false;
      readonly providerCallMade: false;
      readonly authorizationRef: string | null;
    }
  | {
      readonly outcome: "in_progress";
      readonly executionAllowed: true;
      readonly providerCallMade: boolean;
      readonly replayed: boolean;
      readonly authorizationRef: string;
      readonly runId: string;
      readonly provider: string;
    }
  | {
      readonly outcome: "completed";
      readonly executionAllowed: true;
      readonly providerCallMade: boolean;
      readonly replayed: boolean;
      readonly authorizationRef: string;
      readonly runId: string;
      readonly provider: string;
      readonly counts: {
        readonly observed: number;
        readonly accepted: number;
        readonly rejected: number;
        readonly mergedEvidence: number;
        readonly prospects: number;
        readonly evidence: number;
        readonly opportunities: number;
        readonly workflows: number;
      };
    };

function blocked(code: string, authorizationRef: string | null = null): AuthorityProofExecutionResult {
  return Object.freeze({
    outcome: "blocked" as const,
    code,
    executionAllowed: false as const,
    providerCallMade: false as const,
    authorizationRef,
  });
}

function validateSpendAuthorization(input: {
  readonly authorization: AuthorityProofSpendAuthorization;
  readonly expectedPayloadHash: string;
  readonly estimatedCostUsd: number;
  readonly providerRequestRows: number;
  readonly now: Date;
}): string | null {
  const auth = input.authorization;
  if (!auth.authorizationRef.trim()) return "AUTHORITY_PROOF_SPEND_AUTHORIZATION_REF_REQUIRED";
  if (auth.payloadHash !== input.expectedPayloadHash) return "AUTHORITY_PROOF_SPEND_PAYLOAD_HASH_MISMATCH";
  const expiresAt = Date.parse(auth.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= input.now.getTime()) return "AUTHORITY_PROOF_SPEND_AUTHORIZATION_EXPIRED";
  if (
    !Number.isFinite(auth.maxCostUsd) ||
    auth.maxCostUsd < input.estimatedCostUsd ||
    auth.maxCostUsd > AUTHORITY_PROOF_MAX_COST_USD
  ) {
    return "AUTHORITY_PROOF_SPEND_COST_NOT_AUTHORIZED";
  }
  if (auth.maxRequests !== AUTHORITY_PROOF_MAX_REQUESTS) return "AUTHORITY_PROOF_SPEND_REQUEST_LIMIT_INVALID";
  if (
    !Number.isInteger(auth.maxProviderRows) ||
    auth.maxProviderRows < input.providerRequestRows ||
    auth.maxProviderRows > AUTHORITY_PROOF_MAX_PROVIDER_ROWS
  ) {
    return "AUTHORITY_PROOF_SPEND_PROVIDER_ROWS_NOT_AUTHORIZED";
  }
  if (auth.maxHttpAttempts !== AUTHORITY_PROOF_MAX_HTTP_ATTEMPTS) return "AUTHORITY_PROOF_SPEND_HTTP_ATTEMPTS_INVALID";
  return null;
}

/**
 * Purely gated one-shot execution core for #471.
 *
 * This file creates no route, scheduler, MCP write tool, provider, repository,
 * credential lookup, or automatic authorization source. The effectful
 * dependency is callable only after current pricing, proof arm, and exact spend
 * authorization all bind to the same payload hash.
 */
export async function executeAuthorityProofOnce(input: {
  readonly plan: AuthorityScheduledExecutionPlan;
  readonly arm: AuthorityProofArmSubmission;
  readonly spendAuthorization: AuthorityProofSpendAuthorization | null;
  readonly now?: Date;
  readonly dependencies: AuthorityProofExecutionDependencies;
}): Promise<AuthorityProofExecutionResult> {
  const now = input.now ?? new Date();
  const preflight = buildAuthorityProofPreflightFromCurrentPricing({ plan: input.plan, now });
  if (!preflight.ok) return blocked(preflight.code);

  if (!input.spendAuthorization) {
    return blocked("AUTHORITY_PROOF_SPEND_AUTHORIZATION_REQUIRED");
  }

  const authorizationCode = validateSpendAuthorization({
    authorization: input.spendAuthorization,
    expectedPayloadHash: preflight.proof.payloadHash,
    estimatedCostUsd: preflight.costEstimate.estimatedCostUsd,
    providerRequestRows: preflight.costEstimate.providerRequestRows,
    now,
  });
  if (authorizationCode) {
    return blocked(authorizationCode, input.spendAuthorization.authorizationRef.trim() || null);
  }

  const arm = validateAuthorityProofArm({
    expectedPayloadHash: preflight.proof.payloadHash,
    submittedPayloadHash: input.arm.payloadHash,
    submittedConfirmation: input.arm.confirmation,
    expiresAt: preflight.proof.expiresAt,
    now,
  });
  if (!arm.ok) {
    return blocked(arm.code, input.spendAuthorization.authorizationRef);
  }

  const execution = await input.dependencies.executeIngestion({ plan: input.plan, now });
  const authorizationRef = input.spendAuthorization.authorizationRef;

  if ("outcome" in execution.result && execution.result.outcome === "in_progress") {
    return Object.freeze({
      outcome: "in_progress" as const,
      executionAllowed: true as const,
      providerCallMade: execution.providerCallMade,
      replayed: execution.replayed,
      authorizationRef,
      runId: execution.result.runId,
      provider: execution.result.provider,
    });
  }

  const result = execution.result as BacklinkIngestionSummary;
  return Object.freeze({
    outcome: "completed" as const,
    executionAllowed: true as const,
    providerCallMade: execution.providerCallMade,
    replayed: execution.replayed,
    authorizationRef,
    runId: input.plan.runId,
    provider: result.provider,
    counts: Object.freeze({
      observed: result.observed,
      accepted: result.accepted,
      rejected: result.rejected,
      mergedEvidence: result.mergedEvidence,
      prospects: result.prospectIds.length,
      evidence: result.evidenceIds.length,
      opportunities: result.opportunityIds.length,
      workflows: result.workflowIds.length,
    }),
  });
}
