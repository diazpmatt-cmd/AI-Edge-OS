import type {
  ProviderEvidence,
  ProviderExecutionResult,
  ProviderFinding,
  ProviderRecommendation,
  ProviderRollbackResult,
  ProviderVerificationResult,
} from "./types.js";

const bounded = (value: string, code: string): string => {
  const normalized = value.trim();
  if (!normalized || normalized.length > 500) throw new Error(code);
  return normalized;
};

export function createProviderEvidence(input: ProviderEvidence): ProviderEvidence {
  return Object.freeze({
    ...input,
    evidenceId: bounded(input.evidenceId, "PROVIDER_EVIDENCE_INVALID"),
    source: bounded(input.source, "PROVIDER_EVIDENCE_INVALID"),
    stateHash: bounded(input.stateHash, "PROVIDER_EVIDENCE_INVALID"),
    summary: bounded(input.summary, "PROVIDER_EVIDENCE_INVALID"),
  });
}

export function createProviderFinding(input: ProviderFinding): ProviderFinding {
  return Object.freeze({ ...input, evidenceIds: Object.freeze([...input.evidenceIds]) });
}

export function createProviderRecommendation(input: ProviderRecommendation): ProviderRecommendation {
  return Object.freeze({ ...input, findingIds: Object.freeze([...input.findingIds]) });
}

export function createProviderExecutionResult(input: ProviderExecutionResult): ProviderExecutionResult {
  return Object.freeze({ ...input });
}

export function createProviderVerificationResult(input: ProviderVerificationResult): ProviderVerificationResult {
  return Object.freeze({ ...input, evidenceIds: Object.freeze([...input.evidenceIds]) });
}

export function createProviderRollbackResult(input: ProviderRollbackResult): ProviderRollbackResult {
  return Object.freeze({ ...input });
}
