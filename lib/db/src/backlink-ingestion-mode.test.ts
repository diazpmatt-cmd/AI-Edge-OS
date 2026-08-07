import { describe, expect, it } from "vitest";

import { ingestBacklinks, ingestFixtureBacklinks } from "./backlink-ingestion";
import { InMemoryBacklinkRepository } from "./backlink-repository";
import {
  deriveBacklinkIngestionFingerprint,
  deriveBacklinkIngestionRunId,
} from "./backlink-ingestion-run";
import type { BacklinkDataProvider, BacklinkDiscoveryInput } from "./backlink-providers";

const NOW = new Date("2026-08-07T02:00:00.000Z");
const discovery: BacklinkDiscoveryInput = {
  clientId: "client-1",
  clientDomain: "example.com",
  competitorDomains: ["competitor.com"],
  serviceIds: ["service-a"],
  city: "Foley",
  region: "Baldwin County, Alabama",
  limit: 25,
};

function provider(name = "test_backlinks"): BacklinkDataProvider {
  return {
    name,
    capabilities: new Set(["referring_domains"]),
    discover: async () => [],
  };
}

function runIdFor(input: {
  providerName: string;
  providerRevision: string;
  mode: "manual" | "scheduled";
}) {
  const fingerprint = deriveBacklinkIngestionFingerprint({
    trustedClientId: "client-1",
    providerId: input.providerName,
    providerRevision: input.providerRevision,
    mode: input.mode,
    capabilities: ["referring_domains"],
    clientDomain: discovery.clientDomain,
    competitorDomains: discovery.competitorDomains,
    serviceIds: discovery.serviceIds,
    city: discovery.city,
    region: discovery.region,
    limit: discovery.limit,
    allowedServiceIds: new Set(["service-a"]),
  });
  return deriveBacklinkIngestionRunId(fingerprint);
}

describe("generic backlink ingestion mode", () => {
  it("persists a scheduled run as scheduled without changing provider semantics", async () => {
    const repository = new InMemoryBacklinkRepository();
    const dataProvider = provider();

    const result = await ingestBacklinks({
      trustedClientId: "client-1",
      provider: dataProvider,
      discovery,
      normalizationPolicy: { allowedServiceIds: new Set(["service-a"]), now: NOW },
      repository,
      now: NOW,
      mode: "scheduled",
      providerRevision: "test-v1",
    });

    expect("outcome" in result).toBe(false);
    const run = await repository.getIngestionRun(
      runIdFor({ providerName: dataProvider.name, providerRevision: "test-v1", mode: "scheduled" }),
      "client-1",
    );
    expect(run?.status).toBe("succeeded");
    expect(run?.mode).toBe("scheduled");
  });

  it("keeps the fixture compatibility wrapper manual", async () => {
    const repository = new InMemoryBacklinkRepository();
    const dataProvider = provider("fixture_backlinks");

    await ingestFixtureBacklinks({
      trustedClientId: "client-1",
      provider: dataProvider,
      discovery,
      normalizationPolicy: { allowedServiceIds: new Set(["service-a"]), now: NOW },
      repository,
      now: NOW,
    });

    const run = await repository.getIngestionRun(
      runIdFor({ providerName: dataProvider.name, providerRevision: "c8r3-fixture-v1", mode: "manual" }),
      "client-1",
    );
    expect(run?.status).toBe("succeeded");
    expect(run?.mode).toBe("manual");
  });
});
