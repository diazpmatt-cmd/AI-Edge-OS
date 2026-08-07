import { describe, expect, it } from "vitest";

import {
  deriveBacklinkIngestionFingerprint,
  deriveBacklinkIngestionRunId,
  validateBacklinkIngestionClaim,
  type BacklinkIngestionMode,
} from "./backlink-ingestion-run";

function buildClaim(mode: BacklinkIngestionMode | string) {
  const fingerprint = deriveBacklinkIngestionFingerprint({
    trustedClientId: "client-1",
    providerId: "dataforseo_backlinks",
    providerRevision: "v1",
    mode: mode as BacklinkIngestionMode,
    capabilities: ["authority_metrics", "link_intersections", "referring_domains"],
    clientDomain: "example.com",
    competitorDomains: ["competitor.example"],
    serviceIds: ["service-a"],
    city: "Foley",
    region: "Baldwin County, Alabama",
    limit: 25,
    allowedServiceIds: new Set(["service-a"]),
  });

  return {
    id: deriveBacklinkIngestionRunId(fingerprint),
    clientId: "client-1",
    providerId: "dataforseo_backlinks",
    providerRevision: "v1",
    mode,
    capabilities: ["authority_metrics", "link_intersections", "referring_domains"] as const,
    inputFingerprint: fingerprint,
    now: new Date("2026-08-07T01:45:00.000Z"),
  };
}

describe("backlink ingestion mode contract", () => {
  it("keeps manual ingestion valid", () => {
    expect(validateBacklinkIngestionClaim(buildClaim("manual")).mode).toBe("manual");
  });

  it("accepts scheduled ingestion as a distinct persisted mode", () => {
    expect(validateBacklinkIngestionClaim(buildClaim("scheduled")).mode).toBe("scheduled");
  });

  it("rejects unknown ingestion modes", () => {
    expect(() => validateBacklinkIngestionClaim(buildClaim("fixture"))).toThrow("invalid ingestion mode");
  });

  it("keeps manual and scheduled fingerprints distinct", () => {
    expect(buildClaim("manual").inputFingerprint).not.toBe(buildClaim("scheduled").inputFingerprint);
  });
});
