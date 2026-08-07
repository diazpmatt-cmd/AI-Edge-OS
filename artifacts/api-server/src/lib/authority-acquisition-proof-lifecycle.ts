export type AuthorityAcquisitionProofType =
  | "backlink_live"
  | "citation_live"
  | "partnership_confirmed"
  | "sponsorship_confirmed"
  | "guest_post_live"
  | "other";

export type AuthorityAcquisitionProofVerification =
  | "unverified"
  | "human_verified"
  | "invalid";

export type AuthorityAcquisitionProofAction = "verify" | "invalidate" | "reopen";

export interface AuthorityAcquisitionProofInput {
  proofType: AuthorityAcquisitionProofType;
  sourceUrl: string;
  targetUrl: string | null;
  notes: string | null;
}

const PROOF_TYPES = new Set<AuthorityAcquisitionProofType>([
  "backlink_live",
  "citation_live",
  "partnership_confirmed",
  "sponsorship_confirmed",
  "guest_post_live",
  "other",
]);

function optionalString(value: unknown, max: number, code: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error(`${code}_invalid`);
  const clean = value.trim();
  if (!clean) return null;
  if (clean.length > max) throw new Error(`${code}_too_long`);
  return clean;
}

function requiredHttpUrl(value: unknown, code: string): string {
  const clean = optionalString(value, 2000, code);
  if (!clean) throw new Error(`${code}_required`);
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    throw new Error(`${code}_invalid`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${code}_invalid`);
  }
  return parsed.toString();
}

function optionalHttpUrl(value: unknown, code: string): string | null {
  const clean = optionalString(value, 2000, code);
  if (!clean) return null;
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    throw new Error(`${code}_invalid`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${code}_invalid`);
  }
  return parsed.toString();
}

export function validateAuthorityAcquisitionProofInput(
  raw: Record<string, unknown>,
): AuthorityAcquisitionProofInput {
  if (typeof raw.proofType !== "string" || !PROOF_TYPES.has(raw.proofType as AuthorityAcquisitionProofType)) {
    throw new Error("authority_acquisition_proof_type_invalid");
  }
  return {
    proofType: raw.proofType as AuthorityAcquisitionProofType,
    sourceUrl: requiredHttpUrl(raw.sourceUrl, "authority_acquisition_proof_source_url"),
    targetUrl: optionalHttpUrl(raw.targetUrl, "authority_acquisition_proof_target_url"),
    notes: optionalString(raw.notes, 4000, "authority_acquisition_proof_notes"),
  };
}

export function validateAuthorityAcquisitionProofExpectedVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error("authority_acquisition_proof_expected_version_required");
  }
  return Number(value);
}

export function nextAuthorityAcquisitionProofVerification(
  action: AuthorityAcquisitionProofAction,
  current: AuthorityAcquisitionProofVerification,
): AuthorityAcquisitionProofVerification {
  if (action === "verify") {
    if (current === "invalid") throw new Error("authority_acquisition_proof_invalid_must_reopen");
    return "human_verified";
  }
  if (action === "invalidate") {
    if (current === "invalid") throw new Error("authority_acquisition_proof_already_invalid");
    return "invalid";
  }
  if (current !== "invalid") throw new Error("authority_acquisition_proof_reopen_requires_invalid");
  return "unverified";
}

export function verificationAfterAuthorityAcquisitionProofEdit(
  current: AuthorityAcquisitionProofVerification,
): AuthorityAcquisitionProofVerification {
  if (current === "invalid") throw new Error("authority_acquisition_proof_invalid_must_reopen");
  return "unverified";
}
