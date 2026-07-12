import type {
  BacklinkProviderMetadata,
  CanonicalBacklinkEvidence,
  RawBacklinkEvidence,
} from "./backlink-types";

export interface BacklinkNormalizationPolicy {
  allowedServiceIds: ReadonlySet<string>;
  blockedPhrases?: readonly string[];
  now: Date;
}

const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api.?key|credential)/i;
const MAX_METADATA_KEYS = 20;
const MAX_METADATA_STRING = 500;

function clampScore(value: number | null | undefined, fallback = 0): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim().match(/^https?:\/\//i) ? value.trim() : `https://${value.trim()}`);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    [...url.searchParams.keys()].filter(key => /^utm_|^(gclid|fbclid)$/i.test(key)).forEach(key => url.searchParams.delete(key));
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeDomain(value: string, sourceUrl: string): string {
  const fromUrl = normalizeUrl(value) ?? normalizeUrl(sourceUrl);
  if (!fromUrl) return "";
  return new URL(fromUrl).hostname.replace(/^www\./, "").toLowerCase();
}

function sanitizeMetadata(raw: Record<string, unknown> | undefined): BacklinkProviderMetadata {
  const entries: Array<readonly [string, string | number | boolean | null]> = Object.entries(raw ?? {})
    .filter(([key, value]) => !SENSITIVE_KEY.test(key) && (value == null || ["string", "number", "boolean"].includes(typeof value)))
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, MAX_METADATA_KEYS)
    .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, MAX_METADATA_STRING) : value as number | boolean | null] as const);
  return Object.freeze(Object.fromEntries(entries));
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function deriveBacklinkEvidenceId(input: {
  clientId: string; sourceUrl: string; targetUrl: string | null; competitorUrl: string | null; category: string;
}): string {
  return `blev::${fnv1a([input.clientId, input.category, input.sourceUrl, input.targetUrl ?? "", input.competitorUrl ?? ""].join("|"))}`;
}

export function normalizeBacklinkEvidence(
  raw: RawBacklinkEvidence,
  provider: string,
  clientId: string,
  policy: BacklinkNormalizationPolicy,
): CanonicalBacklinkEvidence | null {
  const sourceUrl = normalizeUrl(raw.sourceUrl);
  const sourceDomain = normalizeDomain(raw.sourceDomain, raw.sourceUrl);
  const targetUrl = normalizeUrl(raw.targetUrl);
  const competitorUrl = normalizeUrl(raw.competitorUrl);
  const serviceId = raw.serviceId?.trim() || null;
  if (!clientId.trim() || !provider.trim() || !sourceUrl || !sourceDomain) return null;
  if (serviceId && !policy.allowedServiceIds.has(serviceId)) return null;
  const safetyText = `${sourceUrl} ${targetUrl ?? ""} ${competitorUrl ?? ""}`.toLowerCase();
  if ((policy.blockedPhrases ?? []).some(term => safetyText.includes(term.toLowerCase()))) return null;

  const discovered = new Date(raw.discoveredAt);
  if (Number.isNaN(discovered.getTime())) return null;
  const freshnessDays = Math.max(0, Math.floor((policy.now.getTime() - discovered.getTime()) / 86_400_000));
  const id = deriveBacklinkEvidenceId({ clientId, sourceUrl, targetUrl, competitorUrl, category: raw.category });
  return {
    id, clientId, sourceDomain, sourceUrl, targetUrl, competitorUrl,
    category: raw.category,
    opportunityCategory: raw.opportunityCategory,
    serviceId,
    providers: Object.freeze([provider.trim().toLowerCase()]),
    discoveredAt: discovered.toISOString(),
    freshnessDays,
    localRelevance: clampScore(raw.localRelevance),
    serviceRelevance: clampScore(raw.serviceRelevance),
    competitorFrequency: clampScore(raw.competitorFrequency),
    relationshipAccessibility: clampScore(raw.relationshipAccessibility),
    editorialRequirements: clampScore(raw.editorialRequirements),
    estimatedEffort: clampScore(raw.estimatedEffort),
    authority: clampScore(raw.authority),
    providerMetadata: Object.freeze({ [provider.trim().toLowerCase()]: sanitizeMetadata(raw.metadata) }),
  };
}

export function mergeBacklinkEvidence(items: readonly CanonicalBacklinkEvidence[]): CanonicalBacklinkEvidence[] {
  const byTenantAndId = new Map<string, CanonicalBacklinkEvidence>();
  for (const item of items) {
    const key = `${item.clientId}|${item.id}`;
    const existing = byTenantAndId.get(key);
    if (!existing) { byTenantAndId.set(key, item); continue; }
    const newer = item.discoveredAt > existing.discoveredAt ? item : existing;
    byTenantAndId.set(key, {
      ...newer,
      providers: Object.freeze([...new Set([...existing.providers, ...item.providers])].sort()),
      providerMetadata: Object.freeze({ ...existing.providerMetadata, ...item.providerMetadata }),
      localRelevance: Math.max(existing.localRelevance, item.localRelevance),
      serviceRelevance: Math.max(existing.serviceRelevance, item.serviceRelevance),
      competitorFrequency: Math.max(existing.competitorFrequency, item.competitorFrequency),
      relationshipAccessibility: Math.max(existing.relationshipAccessibility, item.relationshipAccessibility),
      authority: Math.max(existing.authority, item.authority),
      editorialRequirements: Math.min(existing.editorialRequirements, item.editorialRequirements),
      estimatedEffort: Math.min(existing.estimatedEffort, item.estimatedEffort),
      freshnessDays: Math.min(existing.freshnessDays, item.freshnessDays),
    });
  }
  return [...byTenantAndId.values()].sort((a, b) => a.clientId.localeCompare(b.clientId) || a.id.localeCompare(b.id));
}
