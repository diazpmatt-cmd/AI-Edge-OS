export type AuthorityTargetContactMethod = "email" | "phone" | "contact_form" | "social" | "other";
export type AuthorityTargetContactVerification = "unverified" | "human_verified" | "invalid";
export type AuthorityTargetContactAction = "verify" | "invalidate" | "reopen";

export interface AuthorityTargetContactInput {
  organizationName: string;
  contactName: string | null;
  roleTitle: string | null;
  contactMethod: AuthorityTargetContactMethod;
  email: string | null;
  phone: string | null;
  contactUrl: string | null;
  sourceUrl: string | null;
  notes: string | null;
}

const CONTACT_METHODS = new Set<AuthorityTargetContactMethod>([
  "email", "phone", "contact_form", "social", "other",
]);

function optionalString(value: unknown, max: number, code: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error(`${code}_invalid`);
  const clean = value.trim();
  if (!clean) return null;
  if (clean.length > max) throw new Error(`${code}_too_long`);
  return clean;
}

function requireHttpUrl(value: string | null, code: string): string | null {
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${code}_invalid`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${code}_invalid`);
  }
  return parsed.toString();
}

export function validateAuthorityTargetContactInput(raw: Record<string, unknown>): AuthorityTargetContactInput {
  const organizationName = optionalString(raw.organizationName, 300, "organization_name");
  if (!organizationName) throw new Error("organization_name_required");

  if (typeof raw.contactMethod !== "string" || !CONTACT_METHODS.has(raw.contactMethod as AuthorityTargetContactMethod)) {
    throw new Error("contact_method_invalid");
  }

  const email = optionalString(raw.email, 320, "email");
  const phone = optionalString(raw.phone, 80, "phone");
  const contactUrl = requireHttpUrl(optionalString(raw.contactUrl, 2000, "contact_url"), "contact_url");
  const sourceUrl = requireHttpUrl(optionalString(raw.sourceUrl, 2000, "source_url"), "source_url");

  if (!email && !phone && !contactUrl) {
    throw new Error("contact_path_required");
  }

  return {
    organizationName,
    contactName: optionalString(raw.contactName, 300, "contact_name"),
    roleTitle: optionalString(raw.roleTitle, 300, "role_title"),
    contactMethod: raw.contactMethod as AuthorityTargetContactMethod,
    email,
    phone,
    contactUrl,
    sourceUrl,
    notes: optionalString(raw.notes, 4000, "notes"),
  };
}

export function validateAuthorityTargetContactExpectedVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error("authority_target_contact_expected_version_required");
  }
  return Number(value);
}

export function nextAuthorityTargetContactVerification(
  action: AuthorityTargetContactAction,
  current: AuthorityTargetContactVerification,
  sourceUrl: string | null,
): AuthorityTargetContactVerification {
  if (action === "verify") {
    if (current === "invalid") throw new Error("authority_target_contact_invalid_must_reopen");
    if (!sourceUrl) throw new Error("authority_target_contact_verification_source_required");
    return "human_verified";
  }
  if (action === "invalidate") {
    if (current === "invalid") throw new Error("authority_target_contact_already_invalid");
    return "invalid";
  }
  if (current !== "invalid") throw new Error("authority_target_contact_reopen_requires_invalid");
  return "unverified";
}
