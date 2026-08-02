import { providerControlHash } from "./request-envelope.js";
import type { ProviderChangeEnvelope } from "./types.js";

export function createProviderChangeEnvelope(
  input: Omit<ProviderChangeEnvelope, "changeHash">,
): ProviderChangeEnvelope {
  if (!Number.isInteger(input.revision) || input.revision < 1) {
    throw new Error("PROVIDER_CHANGE_INVALID");
  }
  if (!input.reason.trim() || input.reason.length > 1_000) {
    throw new Error("PROVIDER_CHANGE_INVALID");
  }
  const payload = Object.freeze({
    ...input,
    evidenceIds: Object.freeze([...input.evidenceIds]),
    preconditions: Object.freeze([...input.preconditions]),
    verificationPlan: Object.freeze([...input.verificationPlan]),
    rollbackPlan: Object.freeze([...input.rollbackPlan]),
  });
  return Object.freeze({
    ...payload,
    changeHash: providerControlHash(payload, "provider_change"),
  });
}
