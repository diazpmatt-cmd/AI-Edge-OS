import type { BacklinkProviderHealthState } from "@workspace/db";
import type { AuthorityDiscoveryContextResult } from "./authority-discovery-context.js";

export interface AuthorityScheduledReadiness {
  readonly ready: boolean;
  readonly code: string;
  readonly message: string;
  readonly executionActivated: false;
}

export function evaluateAuthorityScheduledReadiness(input: {
  readonly clientActive: boolean;
  readonly discoveryContext: AuthorityDiscoveryContextResult;
  readonly liveProviderHealth: BacklinkProviderHealthState;
}): AuthorityScheduledReadiness {
  if (!input.clientActive) {
    return Object.freeze({
      ready: false,
      code: "AUTHORITY_SCHEDULED_CLIENT_UNAVAILABLE",
      message: "The scheduled Authority client is missing or inactive.",
      executionActivated: false,
    });
  }

  if (!input.discoveryContext.ok) {
    return Object.freeze({
      ready: false,
      code: input.discoveryContext.code,
      message: input.discoveryContext.message,
      executionActivated: false,
    });
  }

  if (input.liveProviderHealth.status !== "configured") {
    return Object.freeze({
      ready: false,
      code: "AUTHORITY_LIVE_BACKLINK_PROVIDER_NOT_READY",
      message: input.liveProviderHealth.reason ?? "No live backlink provider is configured.",
      executionActivated: false,
    });
  }

  return Object.freeze({
    ready: true,
    code: "AUTHORITY_SCHEDULED_READY_NOT_ACTIVATED",
    message: "Tenant context and the live backlink provider are ready. Scheduled provider execution remains intentionally disabled until activation is explicitly authorized.",
    executionActivated: false,
  });
}
