import type { BacklinkCapability, RawBacklinkEvidence } from "./backlink-types";

export interface BacklinkDiscoveryInput {
  clientId: string;
  clientDomain: string;
  competitorDomains: readonly string[];
  serviceIds: readonly string[];
  city: string;
  region: string;
  limit: number;
}

/** Optional providers, including future Similarweb adapters, implement this boundary. */
export interface BacklinkDataProvider {
  readonly name: string;
  readonly capabilities: ReadonlySet<BacklinkCapability>;
  discover(input: BacklinkDiscoveryInput): Promise<RawBacklinkEvidence[]>;
}

export function hasBacklinkCapability(
  provider: Pick<BacklinkDataProvider, "capabilities">,
  capability: BacklinkCapability,
): boolean {
  return provider.capabilities.has(capability);
}

