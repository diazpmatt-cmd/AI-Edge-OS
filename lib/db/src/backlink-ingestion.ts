import type { BacklinkDataProvider, BacklinkDiscoveryInput } from "./backlink-providers";
import type { BacklinkNormalizationPolicy } from "./backlink-normalizer";
import { mergeBacklinkEvidence, normalizeBacklinkEvidence } from "./backlink-normalizer";
import { scoreBacklinkEvidence } from "./backlink-scorer";
import type { CanonicalBacklinkEvidence, BacklinkOpportunityCategory } from "./backlink-types";
import type { BacklinkOpportunity, BacklinkProspect, BacklinkProspectType, BacklinkRepository } from "./backlink-persistence-types";
import { deriveBacklinkOpportunityId, deriveBacklinkProspectId } from "./backlink-repository";

export interface ManualBacklinkIngestionInput {
  trustedClientId: string;
  provider: BacklinkDataProvider;
  discovery: BacklinkDiscoveryInput;
  normalizationPolicy: BacklinkNormalizationPolicy;
  repository: BacklinkRepository;
  now: Date;
}

export interface ManualBacklinkIngestionSummary {
  clientId: string;
  provider: string;
  observed: number;
  accepted: number;
  rejected: number;
  mergedEvidence: number;
  prospectIds: readonly string[];
  evidenceIds: readonly string[];
  opportunityIds: readonly string[];
  workflowIds: readonly string[];
}

/**
 * Repository calls are individually idempotent, but a complete ingestion run is not transactional.
 * A repository failure can leave earlier deterministic writes persisted; retrying safely converges
 * for this manual fixture-only phase. Live-provider or scheduled ingestion requires a repository-level
 * transactional unit of work rather than bypassing the repository abstraction here.
 */

const prospectTypeFor = (evidence: CanonicalBacklinkEvidence): BacklinkProspectType => {
  switch (evidence.category) {
    case "citation_directory": return "directory";
    case "partnership_organization": return evidence.opportunityCategory === "local_partnership" ? "partnership" : "organization";
    case "resource_page": case "broken_link": case "brand_mention": case "authority_metric": return "page";
    case "referring_domain": case "link_intersection": return "domain";
  }
};

const opportunityTemplate = (category: BacklinkOpportunityCategory): { rationale: string; action: string } => {
  const templates: Record<BacklinkOpportunityCategory, { rationale: string; action: string }> = {
    competitor_link_gap: { rationale: "A competitor has relevant placement that the client does not.", action: "Review eligibility and prepare a comparable listing request." },
    citation_directory: { rationale: "A relevant directory can strengthen local citation coverage.", action: "Verify listing requirements and prepare consistent business details." },
    local_partnership: { rationale: "A locally relevant organization is a potential relationship-based link source.", action: "Review membership or partnership requirements." },
    sponsorship_organization: { rationale: "A relevant organization offers a bounded sponsorship opportunity.", action: "Review sponsorship terms and local relevance." },
    niche_industry_link: { rationale: "An industry-specific source may strengthen topical authority.", action: "Review inclusion criteria and professional requirements." },
    guest_post: { rationale: "A relevant publisher may accept expert educational content.", action: "Review editorial guidelines before proposing a topic." },
    resource_page: { rationale: "A relevant resource page may include an appropriate client resource.", action: "Review the page and identify a useful contribution." },
    broken_link: { rationale: "A relevant resource contains a broken destination that may be replaceable.", action: "Validate the broken resource and prepare a suitable replacement." },
    unlinked_mention: { rationale: "The client is mentioned without a corresponding link.", action: "Verify the mention and request an editorial link where appropriate." },
    linkable_asset_content_gap: { rationale: "A missing useful asset limits attainable citation opportunities.", action: "Plan a factual, service-safe resource that fills the identified gap." },
  };
  return templates[category];
};

const groupKey = (clientId: string, prospectId: string, category: string, serviceId: string | null) =>
  `${clientId}|${prospectId}|${category}|${serviceId ?? ""}`;

export async function ingestFixtureBacklinks(input: ManualBacklinkIngestionInput): Promise<ManualBacklinkIngestionSummary> {
  if (!input.trustedClientId.trim()) throw new Error("trustedClientId is required");
  if (input.discovery.clientId !== input.trustedClientId) throw new Error("discovery tenant does not match trusted client");
  const raw = await input.provider.discover(input.discovery);
  const normalized = raw.map(item => normalizeBacklinkEvidence(item, input.provider.name, input.trustedClientId, input.normalizationPolicy));
  const accepted = normalized.filter((item): item is CanonicalBacklinkEvidence => item !== null);
  const merged = mergeBacklinkEvidence(accepted);

  const prospectById = new Map<string, BacklinkProspect>();
  const evidenceByProspect = new Map<string, CanonicalBacklinkEvidence[]>();
  for (const evidence of merged) {
    const pageUrl = evidence.category === "referring_domain" || evidence.category === "link_intersection" ? null : evidence.sourceUrl;
    const prospectId = deriveBacklinkProspectId(input.trustedClientId, evidence.sourceDomain, pageUrl);
    prospectById.set(prospectId, { id: prospectId, clientId: input.trustedClientId, prospectType: prospectTypeFor(evidence), domain: evidence.sourceDomain,
      pageUrl, displayName: null, createdAt: input.now, updatedAt: input.now });
    const list = evidenceByProspect.get(prospectId) ?? []; list.push(evidence); evidenceByProspect.set(prospectId, list);
  }

  const groups = new Map<string, { prospect: BacklinkProspect; category: BacklinkOpportunityCategory; serviceId: string | null; evidence: CanonicalBacklinkEvidence[] }>();
  for (const [prospectId, evidenceList] of evidenceByProspect) for (const evidence of evidenceList) {
    const prospect = prospectById.get(prospectId)!; const key = groupKey(input.trustedClientId, prospectId, evidence.opportunityCategory, evidence.serviceId);
    const group = groups.get(key) ?? { prospect, category: evidence.opportunityCategory, serviceId: evidence.serviceId, evidence: [] };
    group.evidence.push(evidence); groups.set(key, group);
  }

  const workflowIds: string[] = [];
  const opportunityIds: string[] = [];
  for (const [, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    await input.repository.upsertProspect(group.prospect);
    for (const evidence of [...group.evidence].sort((a, b) => a.id.localeCompare(b.id))) await input.repository.persistEvidence({ prospectId: group.prospect.id, evidence });
    const scores = group.evidence.map(scoreBacklinkEvidence);
    const potentialValue = Math.max(...scores.map(value => value.potentialValue));
    const attainability = Math.max(...scores.map(value => value.attainability));
    const opportunityId = deriveBacklinkOpportunityId(input.trustedClientId, group.prospect.id, group.category, group.serviceId);
    const template = opportunityTemplate(group.category);
    const opportunity: BacklinkOpportunity = { id: opportunityId, clientId: input.trustedClientId, prospectId: group.prospect.id, category: group.category,
      serviceId: group.serviceId, potentialValue, attainability, rationale: template.rationale, recommendedAction: template.action,
      evidenceIds: Object.freeze(group.evidence.map(value => value.id).sort()), createdAt: input.now, updatedAt: input.now };
    await input.repository.upsertOpportunity(opportunity);
    const workflow = await input.repository.createInitialWorkflow(opportunityId, input.trustedClientId, input.now);
    opportunityIds.push(opportunityId); workflowIds.push(workflow.id);
  }

  return {
    clientId: input.trustedClientId, provider: input.provider.name, observed: raw.length, accepted: accepted.length,
    rejected: raw.length - accepted.length, mergedEvidence: merged.length,
    prospectIds: Object.freeze([...prospectById.keys()].sort()), evidenceIds: Object.freeze(merged.map(value => value.id).sort()),
    opportunityIds: Object.freeze(opportunityIds.sort()), workflowIds: Object.freeze(workflowIds.sort()),
  };
}
