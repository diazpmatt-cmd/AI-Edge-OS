import {
  deriveBacklinkIngestionFingerprint,
  deriveBacklinkIngestionRunId,
  normalizeBacklinkProviderId,
  normalizeBacklinkProviderRevision,
  type BacklinkCapability,
  type BacklinkDiscoveryInput,
} from "@workspace/db";

export interface AuthorityScheduledProviderPlanInput {
  readonly providerId: string;
  readonly providerRevision: string;
  readonly capabilities: readonly BacklinkCapability[];
}

export interface AuthorityScheduledExecutionPlan {
  readonly mode: "scheduled";
  readonly clientId: string;
  readonly providerId: string;
  readonly providerRevision: string;
  readonly capabilities: readonly BacklinkCapability[];
  readonly discovery: BacklinkDiscoveryInput;
  readonly allowedServiceIds: readonly string[];
  readonly fingerprint: string;
  readonly runId: string;
  readonly providerExecutionAllowed: false;
}

export type AuthorityScheduledExecutionPlanResult =
  | { readonly ok: true; readonly plan: AuthorityScheduledExecutionPlan }
  | { readonly ok: false; readonly code: string; readonly message: string };

export function buildAuthorityScheduledExecutionPlan(input: {
  readonly discovery: BacklinkDiscoveryInput;
  readonly provider: AuthorityScheduledProviderPlanInput;
}): AuthorityScheduledExecutionPlanResult {
  const providerId = normalizeBacklinkProviderId(input.provider.providerId);
  const providerRevision = normalizeBacklinkProviderRevision(input.provider.providerRevision);
  if (!providerId || providerId !== input.provider.providerId || providerId.length > 100) {
    return Object.freeze({
      ok: false,
      code: "AUTHORITY_SCHEDULED_PROVIDER_ID_INVALID",
      message: "Scheduled Authority execution requires a canonical provider identifier.",
    });
  }
  if (!providerRevision || providerRevision !== input.provider.providerRevision || providerRevision.length > 100) {
    return Object.freeze({
      ok: false,
      code: "AUTHORITY_SCHEDULED_PROVIDER_REVISION_INVALID",
      message: "Scheduled Authority execution requires a canonical provider revision.",
    });
  }

  const capabilities = [...new Set(input.provider.capabilities)].sort();
  if (capabilities.length === 0 || capabilities.length > 8) {
    return Object.freeze({
      ok: false,
      code: "AUTHORITY_SCHEDULED_CAPABILITIES_INVALID",
      message: "Scheduled Authority execution requires a bounded provider capability set.",
    });
  }

  if (!input.discovery.competitorDomains.length) {
    return Object.freeze({
      ok: false,
      code: "AUTHORITY_SCHEDULED_COMPETITORS_REQUIRED",
      message: "At least one canonical competitor domain is required before backlink discovery can be planned.",
    });
  }

  const allowedServiceIds = Object.freeze([...new Set(input.discovery.serviceIds)].sort());
  const fingerprint = deriveBacklinkIngestionFingerprint({
    trustedClientId: input.discovery.clientId,
    providerId,
    providerRevision,
    mode: "scheduled",
    capabilities,
    clientDomain: input.discovery.clientDomain,
    competitorDomains: input.discovery.competitorDomains,
    serviceIds: input.discovery.serviceIds,
    city: input.discovery.city,
    region: input.discovery.region,
    limit: input.discovery.limit,
    allowedServiceIds: new Set(allowedServiceIds),
  });

  return Object.freeze({
    ok: true,
    plan: Object.freeze({
      mode: "scheduled" as const,
      clientId: input.discovery.clientId,
      providerId,
      providerRevision,
      capabilities: Object.freeze(capabilities),
      discovery: Object.freeze({
        ...input.discovery,
        competitorDomains: Object.freeze([...input.discovery.competitorDomains]),
        serviceIds: Object.freeze([...input.discovery.serviceIds]),
      }),
      allowedServiceIds,
      fingerprint,
      runId: deriveBacklinkIngestionRunId(fingerprint),
      providerExecutionAllowed: false as const,
    }),
  });
}
