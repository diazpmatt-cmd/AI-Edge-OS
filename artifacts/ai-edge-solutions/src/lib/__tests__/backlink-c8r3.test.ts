import { describe, expect, it } from "vitest";
import { FixtureBacklinkDataProvider } from "../../../../../lib/db/src/backlink-fixture-provider";
import { BBB_FIXTURE_BACKLINK_OBSERVATIONS, type FixtureBacklinkObservation } from "../../../../../lib/db/src/backlink-provider-fixtures";
import { ingestFixtureBacklinks } from "../../../../../lib/db/src/backlink-ingestion";
import { BBB_BACKLINK_ALLOWED_SERVICES, BBB_BACKLINK_BLOCKED_PHRASES, BBB_BACKLINK_CLIENT_ID } from "../../../../../lib/db/src/backlink-fixtures";
import { mergeBacklinkEvidence, normalizeBacklinkEvidence } from "../../../../../lib/db/src/backlink-normalizer";
import { scoreBacklinkEvidence } from "../../../../../lib/db/src/backlink-scorer";
import { InMemoryBacklinkRepository, deriveBacklinkProspectId } from "../../../../../lib/db/src/backlink-repository";
import type { BacklinkCapability } from "../../../../../lib/db/src/backlink-types";

const NOW = new Date("2026-07-12T12:00:00.000Z");
const services = [...BBB_BACKLINK_ALLOWED_SERVICES, "termites"];
const discovery = { clientId: BBB_BACKLINK_CLIENT_ID, clientDomain: "bedbugsbeyond.com", competitorDomains: ["competitor.example.com"],
  serviceIds: services, city: "Foley", region: "Baldwin County, Alabama", limit: 100 };
const policy = { allowedServiceIds: BBB_BACKLINK_ALLOWED_SERVICES, blockedPhrases: BBB_BACKLINK_BLOCKED_PHRASES, now: NOW };
const expectedCapabilities: BacklinkCapability[] = [
  "authority_metrics", "brand_mentions", "broken_links", "citation_directory_discovery", "link_intersections",
  "partnership_organization_discovery", "referring_domains", "resource_page_discovery",
];

describe("C8R-3 fixture provider contract", () => {
  it("declares exactly capabilities represented by fixture observations", () => {
    const provider = new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS);
    expect([...provider.capabilities].sort()).toEqual(expectedCapabilities);
    expect(provider.name).toBe("fixture_backlink");
  });

  it.each(expectedCapabilities)("declares %s only with a valid positive fixture", async capability => {
    const fixtures = BBB_FIXTURE_BACKLINK_OBSERVATIONS.filter(item =>
      item.capability === capability && item.clientId === BBB_BACKLINK_CLIENT_ID,
    );
    const provider = new FixtureBacklinkDataProvider(fixtures);
    const canonical = [];
    for (const fixture of fixtures) {
      const raw = await provider.discover({
        ...discovery,
        city: fixture.cities[0],
        region: fixture.region,
      });
      canonical.push(...raw.map(value => normalizeBacklinkEvidence(value, provider.name, BBB_BACKLINK_CLIENT_ID, policy)).filter(Boolean));
    }
    expect(provider.capabilities.has(capability)).toBe(true);
    expect(canonical.length).toBeGreaterThan(0);
  });

  it("returns deterministic cloned observations in stable order", async () => {
    const provider = new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS);
    const first = await provider.discover(discovery); const second = await provider.discover(discovery);
    expect(first).toEqual(second);
    expect(first.map(value => value.sourceUrl)).toEqual([...first].map(value => value.sourceUrl).sort());
    first[0].sourceDomain = "mutated.example";
    expect((await provider.discover(discovery))[0].sourceDomain).not.toBe("mutated.example");
  });

  it("applies exact tenant, service, geography, and limit filtering", async () => {
    const provider = new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS);
    const otherTenant = await provider.discover({ ...discovery, clientId: "client::other" });
    expect(otherTenant).toHaveLength(1); expect(otherTenant[0].sourceDomain).toBe("other.example");
    expect(await provider.discover({ ...discovery, serviceIds: ["fumigation"] })).toHaveLength(1);
    expect(await provider.discover({ ...discovery, region: "Mobile County, Alabama" })).toHaveLength(0);
    expect(await provider.discover({ ...discovery, city: "Mobile" })).toHaveLength(0);
    expect(await provider.discover({ ...discovery, limit: 2 })).toHaveLength(2);
    await expect(provider.discover({ ...discovery, limit: 0 })).rejects.toThrow("positive integer");
  });

  it("canonicalizes harmless geography formatting without fuzzy matching", async () => {
    const provider = new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS);
    const canonical = await provider.discover(discovery);
    const equivalent = await provider.discover({ ...discovery, city: "  Foley. ", region: " Baldwin   County - AL " });
    const outside = await provider.discover({ ...discovery, city: "Mobile", region: "Mobile County, AL" });
    expect(equivalent).toEqual(canonical);
    expect(outside).toHaveLength(0);
  });
});

describe("C8R-3 normalization and BB&B safety", () => {
  it("normalizes domains, removes tracking parameters, and keeps IDs deterministic", async () => {
    const provider = new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS);
    const raw = (await provider.discover(discovery)).find(value => value.sourceDomain === "southbaldwinchamber.com")!;
    const a = normalizeBacklinkEvidence(raw, provider.name, BBB_BACKLINK_CLIENT_ID, policy)!;
    const b = normalizeBacklinkEvidence(raw, provider.name, BBB_BACKLINK_CLIENT_ID, policy)!;
    expect(a).toEqual(b); expect(a.sourceUrl).not.toContain("utm_source"); expect(a.sourceDomain).toBe("southbaldwinchamber.com");
  });

  it("rejects termites, whole-home heat, and malformed URLs", async () => {
    const provider = new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS);
    const raw = await provider.discover(discovery);
    const normalized = raw.map(value => normalizeBacklinkEvidence(value, provider.name, BBB_BACKLINK_CLIENT_ID, policy));
    expect(normalized.filter(Boolean).some(value => value?.serviceId === "termites")).toBe(false);
    expect(raw.some(value => value.sourceUrl.includes("whole-home-bed-bug-heat"))).toBe(true);
    expect(raw.some(value => value.sourceUrl === "://not-a-url")).toBe(true);
    expect(normalized.filter(Boolean)).toHaveLength(raw.length - 3);
  });

  it("preserves furniture/item differentiation, fumigation, and Baldwin County", () => {
    const text = JSON.stringify(BBB_FIXTURE_BACKLINK_OBSERVATIONS).toLowerCase();
    expect(text).toContain("affected furniture and items");
    expect(text).toContain("furniture and item-level treatment");
    expect(text).toContain('"serviceid":"fumigation"');
    expect(text).toContain("baldwin county, alabama");
  });

  it("merges duplicate evidence deterministically and bounds metadata", () => {
    const base = BBB_FIXTURE_BACKLINK_OBSERVATIONS[0];
    const duplicate: FixtureBacklinkObservation = { ...base, evidence: { ...base.evidence, sourceUrl: `${base.evidence.sourceUrl}&utm_campaign=duplicate`, metadata: { apiKey: "not-stored", note: "x".repeat(700) } } };
    const provider = new FixtureBacklinkDataProvider([base, duplicate]);
    return provider.discover(discovery).then(raw => {
      const canonical = raw.map(value => normalizeBacklinkEvidence(value, provider.name, BBB_BACKLINK_CLIENT_ID, policy)!).filter(Boolean);
      const merged = mergeBacklinkEvidence(canonical); expect(merged).toHaveLength(1); expect(merged[0].providers).toEqual([provider.name]);
      expect(merged[0].providerMetadata[provider.name].apiKey).toBeUndefined();
      expect(String(merged[0].providerMetadata[provider.name].note)).toHaveLength(500);
    });
  });
});

describe("C8R-3 manual ingestion", () => {
  it("persists canonical prospects, evidence, opportunities, and workflows in order", async () => {
    const repository = new InMemoryBacklinkRepository(); const provider = new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS);
    const summary = await ingestFixtureBacklinks({ trustedClientId: BBB_BACKLINK_CLIENT_ID, provider, discovery, normalizationPolicy: policy, repository, now: NOW });
    expect(summary.accepted).toBe(summary.observed - 3); expect(summary.rejected).toBe(3);
    expect(summary.prospectIds.length).toBeGreaterThan(5); expect(summary.opportunityIds).toHaveLength(summary.workflowIds.length);
    for (const opportunityId of summary.opportunityIds) {
      const opportunity = await repository.getOpportunityById(opportunityId, BBB_BACKLINK_CLIENT_ID); expect(opportunity).not.toBeNull();
      expect(opportunity!.potentialValue).toBeGreaterThanOrEqual(0); expect(opportunity!.attainability).toBeGreaterThanOrEqual(0);
      expect(opportunity!.potentialValue).not.toBe(opportunity!.attainability);
      expect(await repository.listWorkflowEvents(opportunityId, BBB_BACKLINK_CLIENT_ID)).toHaveLength(1);
    }
  });

  it("is fully idempotent across repeated ingestion", async () => {
    const repository = new InMemoryBacklinkRepository(); const provider = new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS);
    const input = { trustedClientId: BBB_BACKLINK_CLIENT_ID, provider, discovery, normalizationPolicy: policy, repository, now: NOW };
    const first = await ingestFixtureBacklinks(input); const second = await ingestFixtureBacklinks(input); expect(second).toEqual(first);
    for (const opportunityId of first.opportunityIds) expect(await repository.listWorkflowEvents(opportunityId, BBB_BACKLINK_CLIENT_ID)).toHaveLength(1);
    for (const prospectId of first.prospectIds) expect((await repository.listEvidenceForProspect(prospectId, BBB_BACKLINK_CLIENT_ID)).map(value => value.id)).toEqual(
      (await repository.listEvidenceForProspect(prospectId, BBB_BACKLINK_CLIENT_ID)).map(value => value.id).sort(),
    );
  });

  it("converges for equivalent duplicates in forward and reverse input order", async () => {
    const base = BBB_FIXTURE_BACKLINK_OBSERVATIONS[0];
    const duplicate: FixtureBacklinkObservation = {
      ...base,
      evidence: {
        ...base.evidence,
        authority: 91,
        relationshipAccessibility: 40,
        metadata: { relationship: "verified membership", note: "bounded duplicate" },
      },
    };
    const forward = new FixtureBacklinkDataProvider([base, duplicate]);
    const reverse = new FixtureBacklinkDataProvider([duplicate, base]);
    const canonical = async (provider: FixtureBacklinkDataProvider) => mergeBacklinkEvidence(
      (await provider.discover(discovery))
        .map(value => normalizeBacklinkEvidence(value, provider.name, BBB_BACKLINK_CLIENT_ID, policy)!)
        .filter(Boolean),
    );
    expect(await reverse.discover(discovery)).toEqual(await forward.discover(discovery));
    expect(await canonical(reverse)).toEqual(await canonical(forward));

    const repository = new InMemoryBacklinkRepository();
    const input = { trustedClientId: BBB_BACKLINK_CLIENT_ID, discovery, normalizationPolicy: policy, repository, now: NOW };
    const first = await ingestFixtureBacklinks({ ...input, provider: forward });
    const before = await repository.listOpportunities(BBB_BACKLINK_CLIENT_ID, { limit: 100 });
    const beforeEvidence = await repository.listEvidenceForProspect(first.prospectIds[0], BBB_BACKLINK_CLIENT_ID);
    const beforeEvents = await repository.listWorkflowEvents(first.opportunityIds[0], BBB_BACKLINK_CLIENT_ID);
    const second = await ingestFixtureBacklinks({ ...input, provider: reverse });
    expect(second).toEqual(first);
    expect(await repository.getProspectById(first.prospectIds[0], BBB_BACKLINK_CLIENT_ID)).not.toBeNull();
    expect(await repository.listEvidenceForProspect(first.prospectIds[0], BBB_BACKLINK_CLIENT_ID)).toEqual(beforeEvidence);
    expect(await repository.listOpportunities(BBB_BACKLINK_CLIENT_ID, { limit: 100 })).toEqual(before);
    expect(await repository.listWorkflowEvents(first.opportunityIds[0], BBB_BACKLINK_CLIENT_ID)).toEqual(beforeEvents);
  });

  it("uses maximum-per-dimension score aggregation without mixing dimensions", async () => {
    const base = BBB_FIXTURE_BACKLINK_OBSERVATIONS.find(value => value.capability === "link_intersections")!;
    const second: FixtureBacklinkObservation = { ...base, evidence: { ...base.evidence, sourceUrl: "https://baldwinpropertymanagers.org/vendors/pest-control", authority: 99, relationshipAccessibility: 5 } };
    const provider = new FixtureBacklinkDataProvider([base, second]); const repository = new InMemoryBacklinkRepository();
    const summary = await ingestFixtureBacklinks({ trustedClientId: BBB_BACKLINK_CLIENT_ID, provider, discovery, normalizationPolicy: policy, repository, now: NOW });
    expect(summary.opportunityIds).toHaveLength(1); const opportunity = (await repository.getOpportunityById(summary.opportunityIds[0], BBB_BACKLINK_CLIENT_ID))!;
    const canonical = (await provider.discover(discovery)).map(value => normalizeBacklinkEvidence(value, provider.name, BBB_BACKLINK_CLIENT_ID, policy)!);
    const scores = canonical.map(scoreBacklinkEvidence);
    expect(opportunity.potentialValue).toBe(Math.round(Math.max(...scores.map(value => value.potentialValue))));
    expect(opportunity.attainability).toBe(Math.round(Math.max(...scores.map(value => value.attainability))));
  });

  it("creates no partial records when every observation is invalid", async () => {
    const invalid = BBB_FIXTURE_BACKLINK_OBSERVATIONS.find(value => value.evidence.sourceUrl === "://not-a-url")!;
    const repository = new InMemoryBacklinkRepository(); const provider = new FixtureBacklinkDataProvider([invalid]);
    const summary = await ingestFixtureBacklinks({ trustedClientId: BBB_BACKLINK_CLIENT_ID, provider, discovery, normalizationPolicy: policy, repository, now: NOW });
    expect(summary).toMatchObject({ accepted: 0, rejected: 1, mergedEvidence: 0, prospectIds: [], evidenceIds: [], opportunityIds: [], workflowIds: [] });
    expect((await repository.listOpportunities(BBB_BACKLINK_CLIENT_ID)).items).toHaveLength(0);
  });

  it("never treats provider tenant data as authorization", async () => {
    const repository = new InMemoryBacklinkRepository(); const provider = new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS);
    await expect(ingestFixtureBacklinks({ trustedClientId: "client::other", provider, discovery, normalizationPolicy: policy, repository, now: NOW })).rejects.toThrow("does not match");
  });
});

describe("C8R-3 tenant isolation", () => {
  it("excludes cross-client and out-of-geography fixture data", async () => {
    const provider = new FixtureBacklinkDataProvider(BBB_FIXTURE_BACKLINK_OBSERVATIONS); const raw = await provider.discover(discovery);
    expect(raw.some(value => value.sourceDomain === "other.example")).toBe(false); expect(raw.some(value => value.sourceDomain === "mobile.example")).toBe(false);
  });

  it("isolates identical domains across two clients", async () => {
    const base = BBB_FIXTURE_BACKLINK_OBSERVATIONS[0]; const otherId = "client::other";
    const other: FixtureBacklinkObservation = { ...base, clientId: otherId };
    const provider = new FixtureBacklinkDataProvider([base, other]); const repository = new InMemoryBacklinkRepository();
    const a = await ingestFixtureBacklinks({ trustedClientId: BBB_BACKLINK_CLIENT_ID, provider, discovery, normalizationPolicy: policy, repository, now: NOW });
    const bDiscovery = { ...discovery, clientId: otherId };
    const b = await ingestFixtureBacklinks({ trustedClientId: otherId, provider, discovery: bDiscovery, normalizationPolicy: policy, repository, now: NOW });
    expect(a.prospectIds[0]).not.toBe(b.prospectIds[0]);
    expect(deriveBacklinkProspectId(BBB_BACKLINK_CLIENT_ID, base.evidence.sourceDomain, base.evidence.sourceUrl)).not.toBe(
      deriveBacklinkProspectId(otherId, base.evidence.sourceDomain, base.evidence.sourceUrl),
    );
    expect(await repository.getProspectById(a.prospectIds[0], otherId)).toBeNull();
  });

  it("preserves the repository cross-tenant association boundary", async () => {
    const provider = new FixtureBacklinkDataProvider([BBB_FIXTURE_BACKLINK_OBSERVATIONS[0]]); const repository = new InMemoryBacklinkRepository();
    const summary = await ingestFixtureBacklinks({ trustedClientId: BBB_BACKLINK_CLIENT_ID, provider, discovery, normalizationPolicy: policy, repository, now: NOW });
    const opportunity = (await repository.getOpportunityById(summary.opportunityIds[0], BBB_BACKLINK_CLIENT_ID))!;
    await expect(repository.upsertOpportunity({ ...opportunity, clientId: "client::other" })).rejects.toThrow("not found");
  });
});
