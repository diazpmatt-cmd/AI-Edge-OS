export type AuthorityBacklinkWinEvidenceVerification = "unverified" | "human_verified" | "invalid";
export type AuthorityBacklinkWinEvidenceAction = "verify" | "invalidate" | "reopen";

export interface AuthorityBacklinkWinEvidenceInput {
  sourceUrl: string;
  targetUrl: string;
  notes: string | null;
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field}_required`);
  const normalized = value.trim();
  if (normalized.length > max) throw new Error(`${field}_too_long`);
  return normalized;
}

function httpUrl(value: unknown, field: string): string {
  const raw = requiredText(value, field, 2000);
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error(`${field}_invalid`); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error(`${field}_invalid`);
  return parsed.toString();
}

export function validateAuthorityBacklinkWinEvidenceInput(input: Record<string, unknown>): AuthorityBacklinkWinEvidenceInput {
  const notes = input.notes == null || input.notes === "" ? null : requiredText(input.notes, "notes", 4000);
  return {
    sourceUrl: httpUrl(input.sourceUrl, "source_url"),
    targetUrl: httpUrl(input.targetUrl, "target_url"),
    notes,
  };
}

export function validateAuthorityBacklinkWinEvidenceExpectedVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error("expected_version_required");
  return Number(value);
}

export function verificationAfterAuthorityBacklinkWinEvidenceEdit(
  current: AuthorityBacklinkWinEvidenceVerification,
): AuthorityBacklinkWinEvidenceVerification {
  if (current === "invalid") throw new Error("invalid_must_reopen");
  return "unverified";
}

export function nextAuthorityBacklinkWinEvidenceVerification(
  current: AuthorityBacklinkWinEvidenceVerification,
  action: AuthorityBacklinkWinEvidenceAction,
): AuthorityBacklinkWinEvidenceVerification {
  if (action === "verify") {
    if (current === "invalid") throw new Error("invalid_must_reopen");
    return "human_verified";
  }
  if (action === "invalidate") {
    if (current === "invalid") throw new Error("already_invalid");
    return "invalid";
  }
  if (current !== "invalid") throw new Error("reopen_requires_invalid");
  return "unverified";
}
