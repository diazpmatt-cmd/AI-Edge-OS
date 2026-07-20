import type { LocalPresenceChannel, LocalPresenceProfile } from "./schema/local-presence";
import type { SocialPost } from "./schema/social-posts";
import type { PlatformDelivery } from "./schema/platform-deliveries";
import type { DiscoveryOpportunity } from "./discovery-types";
import type { BacklinkEvidenceRecord, BacklinkOpportunity, BacklinkWorkflow } from "./backlink-persistence-types";
import type {
  AiVisibilityCoverageDiagnostic,
  AiVisibilityLifecycleProjection,
  AiVisibilityNormalizedInput,
} from "./ai-visibility-read-model-types";
import type { ReviewImportResult } from "./tenant-safe-review-types";

export interface AiVisibilityAdapterResult {
  observations: AiVisibilityNormalizedInput[];
  coverage: AiVisibilityCoverageDiagnostic[];
}

export const AI_VISIBILITY_ADAPTER_DEFAULTS = Object.freeze({
  localPresence: Object.freeze({
    potential: Object.freeze({ businessImpact: 70, evidenceStrength: 85, localImpact: 90, servicePriority: 60, urgency: 65 }),
    attainability: Object.freeze({ relationshipAccess: 80, workflowReadiness: 85, effortEase: 70, freshness: 80, localRelevance: 100, serviceRelevance: 70 }),
  }),
  discovery: Object.freeze({ attainability: Object.freeze({ relationshipAccess: 65, workflowReadiness: 80, effortEase: 65, freshness: 85, localRelevance: 85, serviceRelevance: 85 }) }),
  review: Object.freeze({
    potential: Object.freeze({ businessImpact: 75, evidenceStrength: 75, localImpact: 85, servicePriority: 60, urgency: 70 }),
    attainability: Object.freeze({ relationshipAccess: 75, workflowReadiness: 70, effortEase: 65, freshness: 80, localRelevance: 90, serviceRelevance: 65 }),
  }),
  contentApproval: Object.freeze({
    potential: Object.freeze({ businessImpact: 65, evidenceStrength: 90, localImpact: 75, servicePriority: 70, urgency: 60 }),
    attainability: Object.freeze({ relationshipAccess: 100, workflowReadiness: 95, effortEase: 90, freshness: 90, localRelevance: 85, serviceRelevance: 85 }),
  }),
  contentFailure: Object.freeze({
    potential: Object.freeze({ businessImpact: 75, evidenceStrength: 95, localImpact: 75, servicePriority: 70, urgency: 85 }),
    attainability: Object.freeze({ relationshipAccess: 100, workflowReadiness: 85, effortEase: 70, freshness: 90, localRelevance: 85, serviceRelevance: 85 }),
  }),
});

const reference = (
  source: Parameters<typeof buildReference>[0], recordType: string, recordId: string, clientId: string, observedAt: Date,
) => buildReference(source, recordType, recordId, clientId, observedAt);

function buildReference(
  source: "local_presence" | "google_business" | "discovery" | "backlink" | "reviews" | "content" | "ai_query",
  recordType: string,
  recordId: string,
  clientId: string,
  observedAt: Date,
) {
  return { source, recordType, recordId, clientId, observedAt: observedAt.toISOString() } as const;
}

export function adaptLocalPresenceSources(input: {
  trustedClientId: string;
  profile: LocalPresenceProfile | null;
  channels: readonly LocalPresenceChannel[];
  geography: string;
  observedAt: Date;
}): AiVisibilityAdapterResult {
  const observations: AiVisibilityNormalizedInput[] = [];
  for (const channel of input.channels) {
    if (["connected", "verified_publishing", "live"].includes(channel.status)) continue;
    const label = channel.channelName.replace(/_/g, " ");
    observations.push({
      clientId: channel.clientId,
      dedupeKey: `citation directory ${channel.channelName}`,
      category: "citation_directory",
      serviceId: null,
      geography: input.geography,
      title: `Complete ${label} local listing`,
      whatWasObserved: `${label} is ${channel.status} with verification ${channel.verificationStatus ?? "unknown"}.`,
      whyItMatters: "A verified, NAP-consistent local listing strengthens local discovery and citation coverage.",
      evidence: [channel.recommendedAction ?? `Complete and verify the ${label} listing.`, `Recorded channel score: ${channel.score}.`],
      references: [reference("local_presence", "local_presence_channel", channel.id, channel.clientId, channel.updatedAt)],
      workflow: { kind: "local_presence", recordId: channel.id, action: channel.recommendedAction ?? `Review ${label} setup.` },
      humanApprovalRequired: true,
      lifecycle: null,
      scoreBasis: {
        kind: "weighted",
        potential: AI_VISIBILITY_ADAPTER_DEFAULTS.localPresence.potential,
        attainability: AI_VISIBILITY_ADAPTER_DEFAULTS.localPresence.attainability,
      },
    });
  }
  const profileReference = input.profile
    ? [reference("local_presence", "local_presence_profile", input.profile.id, input.profile.clientId, input.profile.updatedAt)]
    : [];
  return {
    observations,
    coverage: [{
      source: "local_presence",
      status: input.profile && input.channels.length ? "available" : "no_observation",
      detail: input.profile && input.channels.length ? `Local Presence profile and ${input.channels.length} channels are available.` : "No Local Presence profile/channel observation is available.",
      observedAt: profileReference[0]?.observedAt ?? null,
    }],
  };
}

export interface DiscoveryOpportunityObservation {
  opportunity: DiscoveryOpportunity;
  geography: string;
}

export function adaptDiscoverySources(items: readonly DiscoveryOpportunityObservation[]): AiVisibilityAdapterResult {
  const observations = items.filter(({ opportunity }) => !["complete", "suppressed"].includes(opportunity.status)).map(({ opportunity, geography }) => ({
    clientId: opportunity.clientId,
    dedupeKey: `${opportunity.opportunityType} ${opportunity.serviceId ?? "general"} ${opportunity.title}`,
    category: "discovery" as const,
    serviceId: opportunity.serviceId,
    geography,
    title: opportunity.title,
    whatWasObserved: opportunity.description,
    whyItMatters: `Discovery classified this as ${opportunity.priority} priority for the ${opportunity.targetEngine} engine.`,
    evidence: [
      `Discovery composite: ${opportunity.compositeScore}.`,
      `Evidence confidence: ${opportunity.scoreCard.confidence}.`,
      `Competitor gap component: ${opportunity.scoreCard.competitorGap}.`,
    ],
    references: [reference("discovery", "discovery_opportunity", opportunity.id, opportunity.clientId, opportunity.createdAt)],
    workflow: { kind: "discovery" as const, recordId: opportunity.id, action: `Continue in the existing ${opportunity.targetEngine} workflow.` },
    humanApprovalRequired: true,
    lifecycle: null,
    scoreBasis: {
      kind: "weighted" as const,
      potential: {
        businessImpact: opportunity.scoreCard.revenueImpact,
        evidenceStrength: opportunity.scoreCard.confidence === "high" ? 90 : opportunity.scoreCard.confidence === "medium" ? 65 : 40,
        localImpact: opportunity.scoreCard.aiSearchPotential,
        servicePriority: opportunity.scoreCard.contentFeasibility,
        urgency: opportunity.scoreCard.seasonalRelevance,
      },
      attainability: {
        ...AI_VISIBILITY_ADAPTER_DEFAULTS.discovery.attainability,
        effortEase: opportunity.scoreCard.contentFeasibility,
        serviceRelevance: opportunity.scoreCard.revenueImpact,
      },
    },
  }));
  return { observations, coverage: [{ source: "discovery", status: items.length ? "available" : "no_observation",
    detail: items.length ? `${items.length} canonical Discovery opportunities were supplied.` : "No canonical Discovery opportunity observation is available.",
    observedAt: items.length ? [...items].map(item => item.opportunity.createdAt.toISOString()).sort().at(-1) ?? null : null }] };
}

export interface BacklinkOpportunityObservation {
  opportunity: BacklinkOpportunity;
  workflow: BacklinkWorkflow;
  evidence: readonly BacklinkEvidenceRecord[];
  geography: string;
}

export function adaptBacklinkSources(items: readonly BacklinkOpportunityObservation[]): AiVisibilityAdapterResult {
  const observations = items.filter(item => !["won", "rejected", "expired"].includes(item.workflow.status)).map(item => ({
    clientId: item.opportunity.clientId,
    dedupeKey: `${item.opportunity.category} ${item.opportunity.serviceId ?? "general"} ${item.evidence[0]?.sourceDomain ?? item.opportunity.prospectId}`,
    category: item.opportunity.category === "citation_directory" ? "citation_directory" as const : "backlink" as const,
    serviceId: item.opportunity.serviceId,
    geography: item.geography,
    title: item.opportunity.recommendedAction,
    whatWasObserved: item.opportunity.rationale,
    whyItMatters: "Canonical backlink evidence identifies an authority opportunity with a distinct pursuit workflow.",
    evidence: item.evidence.map(evidence => `${evidence.sourceDomain}: ${evidence.category}; providers ${evidence.providers.join(", ")}.`),
    references: [
      reference("backlink", "backlink_opportunity", item.opportunity.id, item.opportunity.clientId, item.opportunity.updatedAt),
      reference("backlink", "backlink_workflow", item.workflow.id, item.workflow.clientId, item.workflow.updatedAt),
      ...item.evidence.map(evidence => reference("backlink", "backlink_evidence", evidence.id, evidence.clientId, evidence.discoveredAt)),
    ],
    workflow: { kind: "backlink" as const, recordId: item.workflow.id, action: item.workflow.nextAction ?? item.opportunity.recommendedAction },
    humanApprovalRequired: !["approved", "pursuing"].includes(item.workflow.status),
    lifecycle: null,
    scoreBasis: { kind: "canonical_backlink" as const, potentialValue: item.opportunity.potentialValue, attainability: item.opportunity.attainability },
  }));
  return { observations, coverage: [{ source: "backlink", status: items.length ? "available" : "no_observation",
    detail: items.length ? `${items.length} canonical backlink opportunity/workflow records were supplied.` : "No canonical backlink opportunity observation is available.",
    observedAt: items.length ? [...items].map(item => item.opportunity.updatedAt.toISOString()).sort().at(-1) ?? null : null }] };
}

function latestDelivery(deliveries: readonly PlatformDelivery[]): PlatformDelivery | null {
  return [...deliveries].sort((a, b) => b.attemptNumber - a.attemptNumber || b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id))[0] ?? null;
}

export function projectContentLifecycle(post: SocialPost, deliveries: readonly PlatformDelivery[]): AiVisibilityLifecycleProjection {
  const delivery = latestDelivery(deliveries.filter(item => item.postId === post.id));
  const deliveryStatus = delivery?.status;
  const deliveryProjection: AiVisibilityLifecycleProjection["delivery"] =
    deliveryStatus === "publishing" ? "publishing"
      : deliveryStatus === "published" ? "published"
      : deliveryStatus === "published_with_warning" ? "published_with_warning"
      : deliveryStatus === "failed" ? "failed"
      : deliveryStatus === "cancelled" ? "cancelled"
      : deliveryStatus === "skipped" ? "skipped"
      : post.status === "published" ? "published"
      : post.status === "partial" ? "published_with_warning"
      : post.status === "failed" ? "failed"
      : "not_attempted";
  const approval = post.approvalStatus === "pending_review" || post.approvalStatus === "pending" ? "pending"
    : post.approvalStatus === "approved" || post.approvalStatus === "auto_approved" ? "approved"
      : post.approvalStatus === "rejected" ? "rejected" : post.generationRunId ? "not_approved" : "not_required";
  const dispatch = post.status === "scheduled" || post.scheduledAt ? "scheduled"
    : post.status === "queued" || deliveryStatus === "queued" ? "queued" : "not_queued";
  return { preparation: post.generationRunId ? "generated" : "draft", approval, dispatch, delivery: deliveryProjection };
}

export interface ContentPostObservation {
  clientId: string;
  tenantUserId: string;
  geography: string;
  post: SocialPost;
  deliveries: readonly PlatformDelivery[];
}

export function adaptContentSources(items: readonly ContentPostObservation[]): AiVisibilityAdapterResult {
  const observations: AiVisibilityNormalizedInput[] = [];
  for (const item of items) {
    const adapterClientId = item.post.userId === item.tenantUserId ? item.clientId : `tenant-mismatch::${item.post.userId}`;
    const lifecycle = projectContentLifecycle(item.post, item.deliveries);
    const failure = lifecycle.delivery === "failed";
    const pendingApproval = lifecycle.approval === "pending";
    if (!failure && !pendingApproval) continue;
    const deliveryRefs = item.deliveries.filter(delivery => delivery.postId === item.post.id)
      .map(delivery => reference("content", "platform_delivery", delivery.id, item.clientId, delivery.updatedAt));
    observations.push({
      clientId: adapterClientId,
      dedupeKey: `content ${item.post.id} ${failure ? "delivery failure" : "approval"}`,
      category: "content",
      serviceId: item.post.serviceId,
      geography: item.geography,
      title: failure ? `Resolve failed content delivery for ${item.post.aiTopic ?? item.post.caption.slice(0, 60)}` : `Review generated content for ${item.post.aiTopic ?? item.post.caption.slice(0, 60)}`,
      whatWasObserved: failure ? "An existing Content Autopilot delivery reached the failed state." : "Generated Content Autopilot material is awaiting human approval.",
      whyItMatters: failure ? "The content has not been successfully published and should remain in the existing retry workflow." : "Approval is required before this content may be queued, scheduled, or published.",
      evidence: [`Post status: ${item.post.status}.`, `Approval status: ${item.post.approvalStatus ?? "not_required"}.`, `Delivery status: ${lifecycle.delivery}.`],
      references: [reference("content", "social_post", item.post.id, adapterClientId, item.post.updatedAt), ...deliveryRefs],
      workflow: { kind: "content_autopilot", recordId: item.post.id, action: failure ? "Use the existing delivery retry workflow." : "Use the existing Content Autopilot approval workflow." },
      humanApprovalRequired: pendingApproval,
      lifecycle,
      scoreBasis: { kind: "weighted", potential: failure ? AI_VISIBILITY_ADAPTER_DEFAULTS.contentFailure.potential : AI_VISIBILITY_ADAPTER_DEFAULTS.contentApproval.potential,
        attainability: failure ? AI_VISIBILITY_ADAPTER_DEFAULTS.contentFailure.attainability : AI_VISIBILITY_ADAPTER_DEFAULTS.contentApproval.attainability },
    });
  }
  return { observations, coverage: [{ source: "content", status: items.length ? "available" : "no_observation",
    detail: items.length ? `${items.length} Content Autopilot records were supplied with lifecycle state preserved.` : "No Content Autopilot observation is available.",
    observedAt: items.length ? [...items].map(item => item.post.updatedAt.toISOString()).sort().at(-1) ?? null : null }] };
}

export interface TenantSafeReviewSummary {
  id: string;
  clientId: string;
  platform: string;
  reviewCount: number;
  averageRating: number;
  targetReviewCount: number;
  observedAt: Date;
  geography: string;
}

/** No adapter accepts the legacy global review tables; callers must provide a tenant-safe summary. */
export function adaptTenantSafeReviews(items: readonly TenantSafeReviewSummary[] | null): AiVisibilityAdapterResult {
  if (items === null) return { observations: [], coverage: [{ source: "reviews", status: "not_tenant_safe",
    detail: "Existing review tables are global and are excluded until tenant-safe observations exist.", observedAt: null }] };
  const observations = items.filter(item => item.reviewCount < item.targetReviewCount).map(item => ({
    clientId: item.clientId,
    dedupeKey: `review velocity ${item.platform}`,
    category: "review_intelligence" as const,
    serviceId: null,
    geography: item.geography,
    title: `Improve verified ${item.platform} review coverage`,
    whatWasObserved: `${item.reviewCount} reviews at ${item.averageRating.toFixed(1)} average versus a target of ${item.targetReviewCount}.`,
    whyItMatters: "Recent verified reviews strengthen local trust and provide evidence for future review intelligence.",
    evidence: [`Tenant-safe review summary ${item.id}.`],
    references: [reference("reviews", "tenant_safe_review_summary", item.id, item.clientId, item.observedAt)],
    workflow: { kind: "local_presence" as const, recordId: item.id, action: "Use the existing review-request and Local Presence workflow with human approval." },
    humanApprovalRequired: true,
    lifecycle: null,
    scoreBasis: { kind: "weighted" as const, potential: AI_VISIBILITY_ADAPTER_DEFAULTS.review.potential, attainability: AI_VISIBILITY_ADAPTER_DEFAULTS.review.attainability },
  }));
  return { observations, coverage: [{ source: "reviews", status: items.length ? "available" : "no_observation",
    detail: items.length ? `${items.length} tenant-safe review summaries were supplied.` : "No tenant-safe review observation is available.",
    observedAt: items.length ? [...items].map(item => item.observedAt.toISOString()).sort().at(-1) ?? null : null }] };
}

/**
 * C9R-6: Maps a ReviewImportResult (from GbpReviewSummaryImporter) to an
 * AiVisibilityAdapterResult, using the canonical AiVisibilityCoverageStatus
 * values. The existing adaptTenantSafeReviews() handles the "available" and
 * "no_observation" paths; this function handles failure/disconnected paths.
 */
export function adaptReviewImportResult(result: ReviewImportResult): AiVisibilityAdapterResult {
  switch (result.kind) {
    case "available":
      return adaptTenantSafeReviews(result.summaries);
    case "no_observation":
      return adaptTenantSafeReviews([]);
    case "disconnected":
      return {
        observations: [],
        coverage: [{
          source: "reviews",
          status: "not_connected",
          detail: result.reason,
          observedAt: null,
        }],
      };
    case "unauthorized":
      return {
        observations: [],
        coverage: [{
          source: "reviews",
          status: "not_connected",
          detail: `Unauthorized: ${result.reason}`,
          observedAt: null,
        }],
      };
    case "provider_error":
      return {
        observations: [],
        coverage: [{
          source: "reviews",
          status: "provider_error",
          detail: `Provider error: ${result.error}`,
          observedAt: null,
        }],
      };
  }
}

export interface ConnectedGoogleSummary {
  clientId: string;
  connectionId: string;
  geography: string;
  observedAt: Date;
  businessProfile: "connected" | "not_connected";
  searchConsole: "available" | "not_connected" | "not_implemented";
  analytics: "available" | "not_connected" | "not_implemented";
}

/** Accepts only bounded connection state; OAuth fields and provider clients are deliberately absent. */
export function adaptConnectedGoogle(summary: ConnectedGoogleSummary): AiVisibilityAdapterResult {
  const observations: AiVisibilityNormalizedInput[] = [];
  if (summary.businessProfile === "not_connected") observations.push({
    clientId: summary.clientId,
    dedupeKey: "google business profile connection",
    category: "local_presence",
    serviceId: null,
    geography: summary.geography,
    title: "Connect and verify Google Business Profile",
    whatWasObserved: "No verified Google Business Profile connection is available.",
    whyItMatters: "GBP is a canonical Local Presence channel for maps, local business facts, posts, and reviews.",
    evidence: [`Bounded connection summary ${summary.connectionId}.`],
    references: [reference("google_business", "connection_summary", summary.connectionId, summary.clientId, summary.observedAt)],
    workflow: { kind: "local_presence", recordId: summary.connectionId, action: "Use the existing Google Business connection workflow." },
    humanApprovalRequired: true,
    lifecycle: null,
    scoreBasis: { kind: "weighted", potential: AI_VISIBILITY_ADAPTER_DEFAULTS.localPresence.potential, attainability: AI_VISIBILITY_ADAPTER_DEFAULTS.localPresence.attainability },
  });
  return { observations, coverage: [
    { source: "google_business", status: summary.businessProfile === "connected" ? "available" : "not_connected",
      detail: summary.businessProfile === "connected" ? "A bounded verified GBP connection summary is available." : "Google Business Profile is not connected.", observedAt: summary.observedAt.toISOString() },
    { source: "google_search_console", status: summary.searchConsole,
      detail: summary.searchConsole === "available" ? "A tenant-safe Search Console summary is available." : summary.searchConsole === "not_connected" ? "Search Console is not connected." : "Search Console ingestion is not implemented.", observedAt: summary.searchConsole === "available" ? summary.observedAt.toISOString() : null },
    { source: "google_analytics", status: summary.analytics,
      detail: summary.analytics === "available" ? "A tenant-safe Google Analytics summary is available." : summary.analytics === "not_connected" ? "Google Analytics is not connected." : "Google Analytics ingestion is not implemented.", observedAt: summary.analytics === "available" ? summary.observedAt.toISOString() : null },
  ] };
}
