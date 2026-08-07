import type { BacklinkDiscoveryInput } from "@workspace/db";
import type { StoredAuthorityProfile } from "./authority-profile-store.js";

export type AuthorityDiscoveryContextResult =
  | {
      readonly ok: true;
      readonly discovery: BacklinkDiscoveryInput;
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
    };

export function buildAuthorityDiscoveryContext(input: {
  readonly profile: StoredAuthorityProfile | null;
  readonly competitorDomains: readonly string[];
  readonly activeServiceIds: readonly string[];
  readonly limit?: number;
}): AuthorityDiscoveryContextResult {
  const profile = input.profile;
  if (!profile) {
    return {
      ok: false,
      code: "AUTHORITY_PROFILE_MISSING",
      message: "No tenant Authority Profile is configured.",
    };
  }
  if (!profile.discoveryEnabled) {
    return {
      ok: false,
      code: "AUTHORITY_DISCOVERY_DISABLED",
      message: "Authority discovery is disabled for this client.",
    };
  }
  if (
    !profile.primaryDomain ||
    !profile.primaryCity ||
    !profile.primaryRegion ||
    profile.geography.length === 0 ||
    profile.serviceIds.length === 0
  ) {
    return {
      ok: false,
      code: "AUTHORITY_PROFILE_SCOPE_INCOMPLETE",
      message: "Authority discovery requires domain, city, region, geography, and service scope.",
    };
  }

  const activeServices = new Set(input.activeServiceIds);
  const invalidServices = profile.serviceIds.filter((id) => !activeServices.has(id));
  if (invalidServices.length > 0) {
    return {
      ok: false,
      code: "AUTHORITY_PROFILE_SERVICE_SCOPE_STALE",
      message: "Authority discovery is blocked because the profile references inactive or missing canonical services.",
    };
  }

  const competitorDomains = [...new Set(
    input.competitorDomains
      .map((domain) => domain.trim().toLowerCase().replace(/^www\./, ""))
      .filter((domain) => domain && domain !== profile.primaryDomain),
  )].slice(0, 50);

  const requestedLimit = input.limit ?? 50;
  const limit = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(100, requestedLimit))
    : 50;

  return {
    ok: true,
    discovery: Object.freeze({
      clientId: profile.clientId,
      clientDomain: profile.primaryDomain,
      competitorDomains: Object.freeze(competitorDomains),
      serviceIds: Object.freeze([...profile.serviceIds]),
      city: profile.primaryCity,
      region: profile.primaryRegion,
      limit,
    }),
  };
}
