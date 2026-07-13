import type { BacklinkDataProvider, BacklinkDiscoveryInput } from "./backlink-providers";
import type { BacklinkCapability, RawBacklinkEvidence } from "./backlink-types";
import type { FixtureBacklinkObservation } from "./backlink-provider-fixtures";

const SENSITIVE_METADATA_KEY = /(authorization|cookie|password|secret|token|api.?key|credential)/i;

const normalizePlace = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/\balabama\b/g, "al")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

const FIXTURE_ALLOWED_REGIONS = Object.freeze(new Set([normalizePlace("Baldwin County, Alabama")]));

const boundedMetadata = (metadata: Record<string, unknown> | undefined) => Object.entries(metadata ?? {})
  .filter(([key, value]) => !SENSITIVE_METADATA_KEY.test(key) && (value == null || ["string", "number", "boolean"].includes(typeof value)))
  .sort(([a], [b]) => a.localeCompare(b))
  .slice(0, 20)
  .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 500) : value]);

const observationKey = (item: FixtureBacklinkObservation) => JSON.stringify([
  item.clientId,
  [...item.cities].map(normalizePlace).sort(),
  normalizePlace(item.region),
  item.capability,
  item.evidence.sourceDomain,
  item.evidence.sourceUrl,
  item.evidence.targetUrl ?? null,
  item.evidence.competitorUrl ?? null,
  item.evidence.category,
  item.evidence.opportunityCategory,
  item.evidence.serviceId ?? null,
  new Date(item.evidence.discoveredAt).toISOString(),
  item.evidence.localRelevance ?? null,
  item.evidence.serviceRelevance ?? null,
  item.evidence.competitorFrequency ?? null,
  item.evidence.relationshipAccessibility ?? null,
  item.evidence.editorialRequirements ?? null,
  item.evidence.estimatedEffort ?? null,
  item.evidence.authority ?? null,
  boundedMetadata(item.evidence.metadata),
]);

const compareObservations = (a: FixtureBacklinkObservation, b: FixtureBacklinkObservation) =>
  a.evidence.sourceUrl.localeCompare(b.evidence.sourceUrl) ||
  a.evidence.category.localeCompare(b.evidence.category) ||
  (a.evidence.serviceId ?? "").localeCompare(b.evidence.serviceId ?? "") ||
  observationKey(a).localeCompare(observationKey(b));

export class FixtureBacklinkDataProvider implements BacklinkDataProvider {
  readonly name = "fixture_backlink";
  readonly capabilities: ReadonlySet<BacklinkCapability>;
  private readonly observations: readonly FixtureBacklinkObservation[];

  constructor(observations: readonly FixtureBacklinkObservation[]) {
    this.observations = Object.freeze(structuredClone([...observations]).sort(compareObservations));
    this.capabilities = Object.freeze(new Set(this.observations.map(item => item.capability)));
  }

  async discover(input: BacklinkDiscoveryInput): Promise<RawBacklinkEvidence[]> {
    if (!input.clientId.trim()) throw new Error("clientId is required");
    if (!Number.isInteger(input.limit) || input.limit < 1) throw new Error("limit must be a positive integer");
    const city = normalizePlace(input.city);
    const region = normalizePlace(input.region);
    if (!FIXTURE_ALLOWED_REGIONS.has(region)) return [];
    const services = new Set(input.serviceIds);
    return this.observations
      .filter(item => item.clientId === input.clientId)
      .filter(item => normalizePlace(item.region) === region)
      .filter(item => item.cities.some(value => normalizePlace(value) === city))
      .filter(item => !item.evidence.serviceId || services.has(item.evidence.serviceId))
      .slice(0, input.limit)
      .map(item => structuredClone(item.evidence));
  }
}
