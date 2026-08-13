import { createHash } from "node:crypto";
import { BudgetGuard } from "@workspace/db";

export const AUTHORITY_PROOF_MAX_COST_USD = 0.25;
export const AUTHORITY_PROOF_MAX_REQUESTS = 1;
export const AUTHORITY_PROOF_MAX_RESULTS = 50;
export const AUTHORITY_PROOF_ARM_TTL_MS = 15 * 60 * 1000;

export interface AuthorityProofRunMaterial {
  readonly clientId: string;
  readonly providerId: string;
  readonly providerRevision: string;
  readonly runId: string;
  readonly fingerprint: string;
  readonly competitorDomains: readonly string[];
  readonly serviceIds: readonly string[];
  readonly geography: string;
  readonly resultLimit: number;
  readonly requestCount: number;
  readonly estimatedCostUsd: number;
}

export interface AuthorityProofRunPreflight {
  readonly allowed: boolean;
  readonly payloadHash: string;
  readonly confirmationText: string;
  readonly expiresAt: string;
  readonly blockers: readonly string[];
  readonly limits: {
    readonly maxCostUsd: number;
    readonly maxRequests: number;
    readonly maxResults: number;
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildAuthorityProofPayloadHash(material: AuthorityProofRunMaterial): string {
  return createHash("sha256")
    .update(stableStringify({
      clientId: material.clientId,
      providerId: material.providerId,
      providerRevision: material.providerRevision,
      runId: material.runId,
      fingerprint: material.fingerprint,
      competitorDomains: [...material.competitorDomains].map((value) => value.trim().toLowerCase()).sort(),
      serviceIds: [...material.serviceIds].map((value) => value.trim()).sort(),
      geography: material.geography.trim(),
      resultLimit: material.resultLimit,
      requestCount: material.requestCount,
      estimatedCostUsd: Number(material.estimatedCostUsd.toFixed(6)),
      limits: {
        maxCostUsd: AUTHORITY_PROOF_MAX_COST_USD,
        maxRequests: AUTHORITY_PROOF_MAX_REQUESTS,
        maxResults: AUTHORITY_PROOF_MAX_RESULTS,
      },
    }))
    .digest("hex");
}

export function buildAuthorityProofRunPreflight(
  material: AuthorityProofRunMaterial,
  now = new Date(),
): AuthorityProofRunPreflight {
  const blockers: string[] = [];

  if (!material.clientId.trim()) blockers.push("client_required");
  if (material.providerId !== "dataforseo_backlinks") blockers.push("provider_not_allowlisted");
  if (!material.providerRevision.trim()) blockers.push("provider_revision_required");
  if (!material.runId.trim() || !material.fingerprint.trim()) blockers.push("canonical_run_identity_required");
  if (material.competitorDomains.length === 0) blockers.push("canonical_competitors_required");
  if (material.serviceIds.length === 0) blockers.push("canonical_services_required");
  if (!material.geography.trim()) blockers.push("canonical_geography_required");
  if (!Number.isInteger(material.resultLimit) || material.resultLimit < 1 || material.resultLimit > AUTHORITY_PROOF_MAX_RESULTS) {
    blockers.push("result_limit_exceeded");
  }
  if (!Number.isInteger(material.requestCount) || material.requestCount !== AUTHORITY_PROOF_MAX_REQUESTS) {
    blockers.push("request_count_must_equal_one");
  }
  if (!Number.isFinite(material.estimatedCostUsd) || material.estimatedCostUsd < 0) {
    blockers.push("estimated_cost_invalid");
  }

  const budget = new BudgetGuard({
    perRunCeilingUSD: AUTHORITY_PROOF_MAX_COST_USD,
    maxRequestCount: AUTHORITY_PROOF_MAX_REQUESTS,
    dryRunMode: false,
  }).check(material.estimatedCostUsd, material.requestCount);
  if (!budget.allowed) blockers.push(`budget_${budget.reason ?? "blocked"}`);

  const payloadHash = buildAuthorityProofPayloadHash(material);
  const expiresAt = new Date(now.getTime() + AUTHORITY_PROOF_ARM_TTL_MS).toISOString();

  return Object.freeze({
    allowed: blockers.length === 0,
    payloadHash,
    confirmationText: `ARM AUTHORITY ${payloadHash.slice(0, 12)}`,
    expiresAt,
    blockers: Object.freeze(blockers),
    limits: Object.freeze({
      maxCostUsd: AUTHORITY_PROOF_MAX_COST_USD,
      maxRequests: AUTHORITY_PROOF_MAX_REQUESTS,
      maxResults: AUTHORITY_PROOF_MAX_RESULTS,
    }),
  });
}

export function validateAuthorityProofArm(input: {
  readonly expectedPayloadHash: string;
  readonly submittedPayloadHash: unknown;
  readonly submittedConfirmation: unknown;
  readonly expiresAt: string;
  readonly now?: Date;
}): { readonly ok: true } | { readonly ok: false; readonly code: string } {
  if (typeof input.submittedPayloadHash !== "string" || input.submittedPayloadHash !== input.expectedPayloadHash) {
    return Object.freeze({ ok: false, code: "AUTHORITY_PROOF_PAYLOAD_HASH_MISMATCH" });
  }
  const expectedConfirmation = `ARM AUTHORITY ${input.expectedPayloadHash.slice(0, 12)}`;
  if (typeof input.submittedConfirmation !== "string" || input.submittedConfirmation !== expectedConfirmation) {
    return Object.freeze({ ok: false, code: "AUTHORITY_PROOF_CONFIRMATION_MISMATCH" });
  }
  const now = input.now ?? new Date();
  if (!Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= now.getTime()) {
    return Object.freeze({ ok: false, code: "AUTHORITY_PROOF_PREFLIGHT_EXPIRED" });
  }
  return Object.freeze({ ok: true });
}
