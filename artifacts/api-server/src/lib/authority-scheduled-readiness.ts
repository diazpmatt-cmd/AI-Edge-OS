import type { BacklinkProviderHealthState } from "@workspace/db";
import type { AuthorityDiscoveryContextResult } from "./authority-discovery-context.js";

export interface AuthorityScheduledReadiness {
  readonly ready: boolean;
  readonly code: string;
  readonly message: string;
  readonly executionAuthorized: boolean;
  readonly executionActivated: false;
}

export function evaluateAuthorityScheduledReadiness(input: {
  readonly clientActive: boolean;
  readonly discoveryContext: AuthorityDiscoveryContextResult;
  readonly liveProviderHealth: BacklinkProviderHealthState;
  readonly scheduledModeSchemaReady: boolean;
  readonly executionAuthorized?: boolean;
}): AuthorityScheduledReadiness {
  const executionAuthorized = input.executionAuthorized === true;

  if (!input.clientActive) {
    return Object.freeze({
      ready: false,
      code: "AUTHORITY_SCHEDULED_CLIENT_UNAVAILABLE",
      message: "The scheduled Authority client is missing or inactive.",
      executionAuthorized,
      executionActivated: false,
    });
  }

  if (!input.discoveryContext.ok) {
    return Object.freeze({
      ready: false,
      code: input.discoveryContext.code,
      message: input.discoveryContext.message,
      executionAuthorized,
      executionActivated: false,
    });
  }

  if (!input.scheduledModeSchemaReady) {
    return Object.freeze({
      ready: false,
      code: "AUTHORITY_SCHEDULED_MODE_SCHEMA_NOT_READY",
      message: "The backlink ingestion ledger still enforces manual-only runs and must be upgraded before scheduled execution can be represented truthfully.",
      executionAuthorized,
      executionActivated: false,
    });
  }

  if (input.liveProviderHealth.status !== "configured") {
    return Object.freeze({
      ready: false,
      code: "AUTHORITY_LIVE_BACKLINK_PROVIDER_NOT_READY",
      message: input.liveProviderHealth.reason ?? "No live backlink provider is configured.",
      executionAuthorized,
      executionActivated: false,
    });
  }

  return Object.freeze({
    ready: true,
    code: executionAuthorized
      ? "AUTHORITY_SCHEDULED_AUTHORIZED_NOT_ACTIVATED"
      : "AUTHORITY_SCHEDULED_READY_NOT_AUTHORIZED",
    message: executionAuthorized
      ? "Tenant context, scheduled-mode persistence, the live backlink provider, and explicit execution authorization are ready. This release still does not activate provider execution."
      : "Tenant context, scheduled-mode persistence, and the live backlink provider are ready. Paid scheduled execution remains unauthorized and inactive.",
    executionAuthorized,
    executionActivated: false,
  });
}
