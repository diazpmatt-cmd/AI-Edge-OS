import type { BacklinkDataProvider, BacklinkDiscoveryInput } from "./backlink-providers";
import type { BacklinkNormalizationPolicy } from "./backlink-normalizer";
import { mergeBacklinkEvidence, normalizeBacklinkEvidence } from "./backlink-normalizer";
import { scoreBacklinkEvidence } from "./backlink-scorer";
import type { CanonicalBacklinkEvidence, BacklinkOpportunityCategory } from "./backlink-types";
import type { BacklinkIngestionPersistencePlan, BacklinkOpportunity, BacklinkProspect, BacklinkProspectType, BacklinkRepository, BacklinkWorkflow, BacklinkWorkflowEvent } from "./backlink-persistence-types";
import { deriveBacklinkOpportunityId, deriveBacklinkProspectId, deriveBacklinkWorkflowEventId, deriveBacklinkWorkflowId } from "./backlink-repository";
import { BacklinkIngestionPersistenceError, deriveBacklinkIngestionFingerprint, deriveBacklinkIngestionRunId, normalizeBacklinkProviderId, normalizeBacklinkProviderRevision } from "./backlink-ingestion-run";
import type { BacklinkIngestionCounts, BacklinkIngestionFailureStage } from "./backlink-ingestion-run";

export interface ManualBacklinkIngestionInput {
  trustedClientId: string;
  provider: BacklinkDataProvider;
  discovery: BacklinkDiscoveryInput;
  normalizationPolicy: BacklinkNormalizationPolicy;
  repository: BacklinkRepository;
  now: Date;
  providerRevision?: string;
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

export interface ManualBacklinkIngestionInProgress {
  outcome: "in_progress";
  runId: string;
  clientId: string;
  provider: string;
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

export async function ingestFixtureBacklinks(input: ManualBacklinkIngestionInput): Promise<ManualBacklinkIngestionSummary | ManualBacklinkIngestionInProgress> {
  if (!input.trustedClientId.trim()) throw new Error("trustedClientId is required");
  if (input.discovery.clientId !== input.trustedClientId) throw new Error("discovery tenant does not match trusted client");
  const providerId = normalizeBacklinkProviderId(input.provider.name);
  const providerRevision = normalizeBacklinkProviderRevision(input.providerRevision ?? "c8r3-fixture-v1");
  if (!providerId || providerId.length > 100 || !providerRevision || providerRevision.length > 100) throw new Error("invalid provider identity");
  const fingerprint = deriveBacklinkIngestionFingerprint({ trustedClientId: input.trustedClientId, providerId, providerRevision, mode: "manual",
    capabilities: [...input.provider.capabilities], clientDomain: input.discovery.clientDomain, competitorDomains: input.discovery.competitorDomains,
    serviceIds: input.discovery.serviceIds, city: input.discovery.city, region: input.discovery.region, limit: input.discovery.limit,
    allowedServiceIds: input.normalizationPolicy.allowedServiceIds, blockedPhrases: input.normalizationPolicy.blockedPhrases });
  const runId = deriveBacklinkIngestionRunId(fingerprint);
  const claim = await input.repository.claimIngestionRun({ id: runId, clientId: input.trustedClientId, providerId, providerRevision, mode: "manual",
    capabilities: [...input.provider.capabilities].sort(), inputFingerprint: fingerprint, now: input.now });
  if (claim.outcome === "in_progress") return { outcome: "in_progress", runId, clientId: input.trustedClientId, provider: providerId };
  if (claim.outcome === "replayed") {
    if (!claim.run.resultSummary) throw new Error("succeeded ingestion run is missing its bounded summary");
    const result = claim.run.resultSummary;
    return { clientId: input.trustedClientId, provider: providerId, observed: result.observed, accepted: result.accepted, rejected: result.rejected,
      mergedEvidence: result.mergedEvidence, prospectIds: result.prospectIds, evidenceIds: result.evidenceIds,
      opportunityIds: result.opportunityIds, workflowIds: result.workflowIds };
  }

  let counts: BacklinkIngestionCounts = { observed: 0, accepted: 0, rejected: 0, mergedEvidence: 0, prospectCount: null, evidenceCount: null, opportunityCount: null, workflowCount: null };
  let failureStage: BacklinkIngestionFailureStage = "provider";
  try {
  const raw = await input.provider.discover(input.discovery);
  failureStage = "preparation";
  const stablePolicy = { ...input.normalizationPolicy, now: claim.run.startedAt };
  const normalized = raw.map(item => normalizeBacklinkEvidence(item, providerId, input.trustedClientId, stablePolicy));
  const accepted = normalized.filter((item): item is CanonicalBacklinkEvidence => item !== null);
  const merged = mergeBacklinkEvidence(accepted);
  counts = { ...counts, observed: raw.length, accepted: accepted.length, rejected: raw.length - accepted.length, mergedEvidence: merged.length };

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

  const workflows: BacklinkWorkflow[] = [];
  const initialEvents: BacklinkWorkflowEvent[] = [];
  const opportunityIds: string[] = [];
  const opportunities: BacklinkOpportunity[] = [];
  for (const [, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const scores = group.evidence.map(scoreBacklinkEvidence);
    const potentialValue = Math.max(...scores.map(value => value.potentialValue));
    const attainability = Math.max(...scores.map(value => value.attainability));
    const opportunityId = deriveBacklinkOpportunityId(input.trustedClientId, group.prospect.id, group.category, group.serviceId);
    const template = opportunityTemplate(group.category);
    const opportunity: BacklinkOpportunity = { id: opportunityId, clientId: input.trustedClientId, prospectId: group.prospect.id, category: group.category,
      serviceId: group.serviceId, potentialValue, attainability, rationale: template.rationale, recommendedAction: template.action,
      evidenceIds: Object.freeze(group.evidence.map(value => value.id).sort()), createdAt: input.now, updatedAt: input.now };
    opportunities.push(opportunity);
    const workflowId = deriveBacklinkWorkflowId(input.trustedClientId, opportunityId);
    workflows.push({ id: workflowId, clientId: input.trustedClientId, opportunityId, status: "discovered", ownerId: null, nextAction: null,
      dueAt: null, outcomeSummary: null, version: 1, createdAt: input.now, updatedAt: input.now, completedAt: null });
    initialEvents.push({ id: deriveBacklinkWorkflowEventId(workflowId, 1), clientId: input.trustedClientId, workflowId, opportunityId, sequence: 1,
      fromStatus: null, toStatus: "discovered", actorId: null, reason: "workflow_created", createdAt: input.now });
    opportunityIds.push(opportunityId);
  }

  const summary = {
    clientId: input.trustedClientId, provider: input.provider.name, observed: raw.length, accepted: accepted.length,
    rejected: raw.length - accepted.length, mergedEvidence: merged.length,
    prospectIds: Object.freeze([...prospectById.keys()].sort()), evidenceIds: Object.freeze(merged.map(value => value.id).sort()),
    opportunityIds: Object.freeze(opportunityIds.sort()), workflowIds: Object.freeze(workflows.map(value => value.id).sort()),
  };
  const plan: BacklinkIngestionPersistencePlan = Object.freeze({ prospects: Object.freeze([...prospectById.values()].sort((a,b) => a.id.localeCompare(b.id))),
    evidence: Object.freeze(merged.map(evidence => ({ prospectId: deriveBacklinkProspectId(input.trustedClientId, evidence.sourceDomain,
      evidence.category === "referring_domain" || evidence.category === "link_intersection" ? null : evidence.sourceUrl), evidence })).sort((a,b) => a.evidence.id.localeCompare(b.evidence.id))),
    opportunities: Object.freeze(opportunities.sort((a,b) => a.id.localeCompare(b.id))), workflows: Object.freeze(workflows.sort((a,b) => a.id.localeCompare(b.id))),
    initialEvents: Object.freeze(initialEvents.sort((a,b) => a.id.localeCompare(b.id))), summary: {
      observed: summary.observed, accepted: summary.accepted, rejected: summary.rejected, mergedEvidence: summary.mergedEvidence,
      prospectCount: summary.prospectIds.length, evidenceCount: summary.evidenceIds.length, opportunityCount: summary.opportunityIds.length, workflowCount: summary.workflowIds.length,
      prospectIds: summary.prospectIds, evidenceIds: summary.evidenceIds, opportunityIds: summary.opportunityIds, workflowIds: summary.workflowIds } });
  counts = plan.summary;
  failureStage = "finalization";
  await input.repository.commitIngestionRun({ runId, clientId: input.trustedClientId, plan, completedAt: input.now });
  return summary;
  } catch (error) {
    if (error instanceof BacklinkIngestionPersistenceError) failureStage = error.stage;
    const code = failureStage === "provider" ? "provider_failed" : failureStage === "preparation" ? "validation_failed"
      : failureStage === "finalization" ? "finalization_failed" : "persistence_failed";
    try { await input.repository.failIngestionRun({ runId, clientId: input.trustedClientId, stage: failureStage, code, counts, failedAt: input.now }); }
    catch { throw new Error(`backlink ingestion failed at ${failureStage}; failed run could not be recorded and may remain running`); }
    throw new Error(`backlink ingestion failed at ${failureStage}`);
  }
}
