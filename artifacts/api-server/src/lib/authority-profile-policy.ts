export interface AuthorityProfileInput {
  readonly primaryDomain?: unknown;
  readonly primaryWebsite?: unknown;
  readonly geography?: unknown;
  readonly serviceIds?: unknown;
  readonly discoveryEnabled?: unknown;
}

export type AuthorityProfileValidation =
  | {
      readonly ok: true;
      readonly value: {
        readonly primaryDomain: string;
        readonly primaryWebsite: string | null;
        readonly geography: readonly string[];
        readonly serviceIds: readonly string[];
        readonly discoveryEnabled: boolean;
      };
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
    };

function normalizeStringArray(value: unknown, maxItems: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  )];
  if (normalized.length > maxItems) return null;
  return normalized;
}

export function normalizeAuthorityDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > 253) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    const hostname = url.hostname.replace(/^www\./, "").replace(/\.$/, "");
    if (!hostname || hostname.length > 253 || !hostname.includes(".")) return null;
    if (!/^[a-z0-9.-]+$/.test(hostname)) return null;
    if (hostname.split(".").some((label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) return null;
    return hostname;
  } catch {
    return null;
  }
}

function normalizeWebsite(value: unknown, domain: string): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    const websiteDomain = normalizeAuthorityDomain(url.hostname);
    if (websiteDomain !== domain) return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

export function validateAuthorityProfileInput(
  input: AuthorityProfileInput,
): AuthorityProfileValidation {
  const primaryDomain = normalizeAuthorityDomain(input.primaryDomain);
  if (!primaryDomain) {
    return {
      ok: false,
      code: "AUTHORITY_PROFILE_DOMAIN_INVALID",
      message: "primaryDomain must be a valid bare domain or website hostname.",
    };
  }

  const primaryWebsite = normalizeWebsite(input.primaryWebsite, primaryDomain);
  if (primaryWebsite === undefined) {
    return {
      ok: false,
      code: "AUTHORITY_PROFILE_WEBSITE_INVALID",
      message: "primaryWebsite must be an HTTP(S) URL on the same primaryDomain.",
    };
  }

  const geography = normalizeStringArray(input.geography, 50);
  if (!geography) {
    return {
      ok: false,
      code: "AUTHORITY_PROFILE_GEOGRAPHY_INVALID",
      message: "geography must be an array of at most 50 non-empty strings.",
    };
  }

  const serviceIds = normalizeStringArray(input.serviceIds, 100);
  if (!serviceIds) {
    return {
      ok: false,
      code: "AUTHORITY_PROFILE_SERVICES_INVALID",
      message: "serviceIds must be an array of at most 100 non-empty strings.",
    };
  }

  if (typeof input.discoveryEnabled !== "boolean") {
    return {
      ok: false,
      code: "AUTHORITY_PROFILE_ENABLED_INVALID",
      message: "discoveryEnabled must be a boolean.",
    };
  }

  if (input.discoveryEnabled && (geography.length === 0 || serviceIds.length === 0)) {
    return {
      ok: false,
      code: "AUTHORITY_PROFILE_SCOPE_INCOMPLETE",
      message: "Authority discovery cannot be enabled until geography and service scope are both configured.",
    };
  }

  return {
    ok: true,
    value: Object.freeze({
      primaryDomain,
      primaryWebsite,
      geography: Object.freeze(geography),
      serviceIds: Object.freeze(serviceIds),
      discoveryEnabled: input.discoveryEnabled,
    }),
  };
}
