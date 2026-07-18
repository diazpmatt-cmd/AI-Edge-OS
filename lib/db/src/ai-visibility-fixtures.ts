import { BBB_BACKLINK_ALLOWED_SERVICES, BBB_BACKLINK_CLIENT_ID } from "./backlink-fixtures";
import type { BacklinkEvidenceRecord, BacklinkOpportunity, BacklinkWorkflow } from "./backlink-persistence-types";
import type { DiscoveryOpportunity } from "./discovery-types";
import type { LocalPresenceChannel, LocalPresenceProfile } from "./schema/local-presence";
import type { PlatformDelivery } from "./schema/platform-deliveries";
import type { SocialPost } from "./schema/social-posts";
import type { AiVisibilityAuthorizedScope } from "./ai-visibility-read-model-types";
import type { BacklinkOpportunityObservation, ConnectedGoogleSummary, ContentPostObservation, DiscoveryOpportunityObservation } from "./ai-visibility-read-model-adapters";

export const BBB_AI_VISIBILITY_NOW = new Date("2026-07-13T12:00:00.000Z");
export const BBB_AI_VISIBILITY_PHONE = "251-324-9090";
export const BBB_AI_VISIBILITY_GEOGRAPHY = "Baldwin County, Alabama";

export const BBB_AI_VISIBILITY_SCOPE: AiVisibilityAuthorizedScope = Object.freeze({
  clientId: BBB_BACKLINK_CLIENT_ID,
  activeServiceIds: Object.freeze([...BBB_BACKLINK_ALLOWED_SERVICES].sort()),
  authorizedGeographies: Object.freeze([
    "Baldwin County, Alabama", "Foley, AL", "Gulf Shores, AL", "Orange Beach, AL", "Fairhope, AL", "Daphne, AL", "Spanish Fort, AL",
  ]),
  prohibitedPhrases: Object.freeze([
    "termite", "termite service", "termite treatment", "whole home bed bug heat", "whole-home bed-bug heat", "bed bug heat treatment",
  ]),
});

export const BBB_AI_VISIBILITY_LOCAL_PROFILE: LocalPresenceProfile = {
  id: "11111111-1111-4111-8111-111111111111",
  clientId: BBB_BACKLINK_CLIENT_ID,
  businessName: "Bed Bugs & Beyond",
  phone: BBB_AI_VISIBILITY_PHONE,
  website: "https://bedbugsandbeyond.net",
  address: "Baldwin County",
  city: "Foley",
  state: "AL",
  zip: "36535",
  napJson: JSON.stringify({ name: "Bed Bugs & Beyond", phone: BBB_AI_VISIBILITY_PHONE, geography: BBB_AI_VISIBILITY_GEOGRAPHY }),
  createdAt: new Date("2026-07-01T12:00:00.000Z"),
  updatedAt: BBB_AI_VISIBILITY_NOW,
};

export const BBB_AI_VISIBILITY_LOCAL_CHANNELS: readonly LocalPresenceChannel[] = Object.freeze([
  { id: "21111111-1111-4111-8111-111111111111", clientId: BBB_BACKLINK_CLIENT_ID, channelName: "google_business", status: "connected", score: 35,
    listingUrl: "https://bedbugsandbeyond.net", verificationStatus: "verified", recommendedAction: "Maintain GBP facts and review responses.", metadataJson: null,
    completenessScore: 85, lastSyncAt: null,
    createdAt: new Date("2026-07-01T12:00:00.000Z"), updatedAt: BBB_AI_VISIBILITY_NOW },
  { id: "21111111-1111-4111-8111-111111111112", clientId: BBB_BACKLINK_CLIENT_ID, channelName: "nextdoor", status: "not_started", score: 0,
    listingUrl: null, verificationStatus: "not_started", recommendedAction: "Create and verify the Nextdoor business listing with canonical NAP.", metadataJson: null,
    completenessScore: 0, lastSyncAt: null,
    createdAt: new Date("2026-07-01T12:00:00.000Z"), updatedAt: BBB_AI_VISIBILITY_NOW },
]);

const discoveryScoreCard = (overrides: Partial<DiscoveryOpportunity["scoreCard"]> = {}): DiscoveryOpportunity["scoreCard"] => ({
  searchDemand: 78, competitorGap: 72, revenueImpact: 90, contentFeasibility: 82, seasonalRelevance: 70, aiSearchPotential: 76,
  composite: 80, confidence: "high",
  explanations: { searchDemand: "Fixture demand", competitorGap: "Fixture gap", revenueImpact: "Active service", contentFeasibility: "Existing workflow",
    seasonalRelevance: "Current", aiSearchPotential: "Evidence-backed opportunity" },
  version: "c5", enrichment: { competitorDomainCount: 3, paaQuestionCount: 4, cpcUsd: 8, coverageState: "gap" }, ...overrides,
});

const discoveryOpportunity = (id: string, title: string, serviceId: string | null, description: string): DiscoveryOpportunity => ({
  id, snapshotId: "snapshot::c8r5", clientId: BBB_BACKLINK_CLIENT_ID, opportunityType: "content_topic", title, description,
  targetEngine: "content", clusterId: `cluster::${id}`, serviceId, scoreCard: discoveryScoreCard(), compositeScore: 80, priority: "critical",
  status: "pending", assignedAt: null, createdAt: BBB_AI_VISIBILITY_NOW,
});

export const BBB_AI_VISIBILITY_DISCOVERY: readonly DiscoveryOpportunityObservation[] = Object.freeze([
  { opportunity: discoveryOpportunity("discovery::furniture", "Explain furniture and item-level bed bug treatment",
    "bed_bug_treatment", "Customers need evidence-backed content describing targeted furniture and item-level treatment."), geography: BBB_AI_VISIBILITY_GEOGRAPHY },
  { opportunity: discoveryOpportunity("discovery::fumigation", "Build fumigation service awareness",
    "fumigation", "Baldwin County commercial prospects need high-level professional fumigation information."), geography: "Foley, AL" },
  { opportunity: discoveryOpportunity("discovery::termite", "Promote termite treatment",
    "termites", "Generate active termite service leads."), geography: BBB_AI_VISIBILITY_GEOGRAPHY },
  { opportunity: discoveryOpportunity("discovery::outside", "Target Mobile County bed bug searches",
    "bed_bug_treatment", "Expand service positioning outside the authorized geography."), geography: "Mobile County, Alabama" },
  { opportunity: discoveryOpportunity("discovery::heat", "Promote whole-home bed-bug heat treatment",
    "bed_bug_treatment", "Position whole-home bed-bug heat as the primary treatment."), geography: BBB_AI_VISIBILITY_GEOGRAPHY },
]);

const backlinkOpportunity: BacklinkOpportunity = {
  id: "blop::c8r5", clientId: BBB_BACKLINK_CLIENT_ID, prospectId: "blpr::c8r5", category: "local_partnership", serviceId: "fumigation",
  potentialValue: 82, attainability: 74, rationale: "The South Baldwin Chamber lists local service businesses and competitors.",
  recommendedAction: "Review South Baldwin Chamber membership and directory placement.", evidenceIds: ["blev::c8r5"],
  createdAt: BBB_AI_VISIBILITY_NOW, updatedAt: BBB_AI_VISIBILITY_NOW,
};
const backlinkWorkflow: BacklinkWorkflow = {
  id: "blwf::c8r5", clientId: BBB_BACKLINK_CLIENT_ID, opportunityId: backlinkOpportunity.id, status: "reviewing", ownerId: null,
  nextAction: "Review membership requirements before approval.", dueAt: null, outcomeSummary: null, version: 1,
  createdAt: BBB_AI_VISIBILITY_NOW, updatedAt: BBB_AI_VISIBILITY_NOW, completedAt: null,
};
const backlinkEvidence: BacklinkEvidenceRecord = {
  id: "blev::c8r5", clientId: BBB_BACKLINK_CLIENT_ID, prospectId: "blpr::c8r5", sourceDomain: "southbaldwinchamber.com",
  sourceUrl: "https://southbaldwinchamber.com/member-directory", targetUrl: null, competitorUrl: null, category: "partnership_organization",
  serviceId: "fumigation", providers: ["fixture_backlink"], discoveredAt: new Date("2026-07-10T12:00:00.000Z"), freshnessDays: 3,
  localRelevance: 100, serviceRelevance: 85, competitorFrequency: 60, relationshipAccessibility: 90, editorialRequirements: 15,
  estimatedEffort: 25, authority: 68, createdAt: BBB_AI_VISIBILITY_NOW,
};
export const BBB_AI_VISIBILITY_BACKLINKS: readonly BacklinkOpportunityObservation[] = Object.freeze([
  { opportunity: backlinkOpportunity, workflow: backlinkWorkflow, evidence: [backlinkEvidence], geography: BBB_AI_VISIBILITY_GEOGRAPHY },
]);

function socialPost(id: string, overrides: Record<string, unknown>): SocialPost {
  return {
    id, userId: "user::bbb", clientName: "Bed Bugs & Beyond", platforms: '["google_business"]', imageData: null,
    caption: "Professional Baldwin County pest control. Call 251-324-9090.", ctaType: "call", ctaValue: BBB_AI_VISIBILITY_PHONE,
    scheduledAt: null, status: "draft", publishedAt: null, errorMessage: null, captionFacebook: null, captionGoogle: null,
    aiCity: "Foley", aiTopic: "Furniture-level bed bug treatment", aiAngle: "local education", contentScore: "85", bestPlatform: "google_business",
    imageRecommendation: null, duplicateRisk: "low", videoUrl: null, youtubeTitle: null, youtubePrivacy: null, youtubeVideoId: null, youtubeTags: null,
    audioUrl: null, matchedImageId: null, matchedImageUrl: null, matchedImageScore: null, impressions: null, reach: null, clicks: null, likes: null,
    comments: null, shares: null, engagementScore: null, serviceId: "bed_bug_treatment", campaignGoal: "homeowner_education", audienceId: "homeowners",
    weeklyPlanId: "week-2026-29-bbb", approvalStatus: "pending_review", approvedAt: null, approvedBy: null, generationRunId: "31111111-1111-4111-8111-111111111111",
    revenueWeight: "10", urgency: "high", timeSlot: "morning", slotIndex: "0", campaignSlotKey: "2026-W29-monday-morning", postsPerDay: "1",
    publishedBy: null, cancelledAt: null, cancelledBy: null, cancelReason: null, createdAt: BBB_AI_VISIBILITY_NOW, updatedAt: BBB_AI_VISIBILITY_NOW,
    ...overrides,
  } as SocialPost;
}

function delivery(id: string, postId: string, status: string): PlatformDelivery {
  return {
    id, postId, userId: "user::bbb", platform: "google_business", status, attemptNumber: 1, attemptId: `attempt::${id}`,
    externalPostId: status === "published" ? `external::${id}` : null, externalPostUrl: null, apiResponseStatus: status === "published" ? 200 : null,
    publishedAt: status === "published" ? BBB_AI_VISIBILITY_NOW : null, failedAt: status === "failed" ? BBB_AI_VISIBILITY_NOW : null,
    errorMessage: status === "failed" ? "Sanitized provider failure" : null, errorCode: status === "failed" ? "provider_error" : null,
    retryAllowed: true, retryCount: 0, approvedBy: "user::bbb", publishedBy: status === "published" ? "user::bbb" : null,
    metadata: null, createdAt: BBB_AI_VISIBILITY_NOW, updatedAt: BBB_AI_VISIBILITY_NOW,
  } as PlatformDelivery;
}

const pendingPost = socialPost("41111111-1111-4111-8111-111111111111", {});
const publishedPost = socialPost("41111111-1111-4111-8111-111111111112", { serviceId: "fumigation", aiTopic: "Professional fumigation awareness",
  status: "published", approvalStatus: "approved", approvedAt: BBB_AI_VISIBILITY_NOW, approvedBy: "user::bbb", scheduledAt: new Date("2026-07-13T10:00:00.000Z"),
  publishedAt: BBB_AI_VISIBILITY_NOW, publishedBy: "user::bbb" });
const failedPost = socialPost("41111111-1111-4111-8111-111111111113", { aiTopic: "Baldwin County bed bug inspection", serviceId: "bed_bug_inspection",
  status: "failed", approvalStatus: "approved", approvedAt: BBB_AI_VISIBILITY_NOW, approvedBy: "user::bbb", errorMessage: "Sanitized delivery failure" });
const generatedPost = socialPost("41111111-1111-4111-8111-111111111114", { approvalStatus: null });
const approvedPost = socialPost("41111111-1111-4111-8111-111111111115", {
  approvalStatus: "approved", approvedAt: BBB_AI_VISIBILITY_NOW, approvedBy: "user::bbb",
});
const queuedPost = socialPost("41111111-1111-4111-8111-111111111116", {
  status: "queued", approvalStatus: "approved", approvedAt: BBB_AI_VISIBILITY_NOW, approvedBy: "user::bbb",
});
const scheduledPost = socialPost("41111111-1111-4111-8111-111111111117", {
  status: "scheduled", approvalStatus: "approved", approvedAt: BBB_AI_VISIBILITY_NOW, approvedBy: "user::bbb",
  scheduledAt: new Date("2026-07-14T10:00:00.000Z"),
});

export const BBB_AI_VISIBILITY_CONTENT: readonly ContentPostObservation[] = Object.freeze([
  { clientId: BBB_BACKLINK_CLIENT_ID, tenantUserId: "user::bbb", geography: BBB_AI_VISIBILITY_GEOGRAPHY, post: pendingPost, deliveries: [] },
  { clientId: BBB_BACKLINK_CLIENT_ID, tenantUserId: "user::bbb", geography: BBB_AI_VISIBILITY_GEOGRAPHY, post: publishedPost,
    deliveries: [delivery("51111111-1111-4111-8111-111111111111", publishedPost.id, "published")] },
  { clientId: BBB_BACKLINK_CLIENT_ID, tenantUserId: "user::bbb", geography: BBB_AI_VISIBILITY_GEOGRAPHY, post: failedPost,
    deliveries: [delivery("51111111-1111-4111-8111-111111111112", failedPost.id, "failed")] },
  { clientId: BBB_BACKLINK_CLIENT_ID, tenantUserId: "user::bbb", geography: BBB_AI_VISIBILITY_GEOGRAPHY, post: generatedPost, deliveries: [] },
  { clientId: BBB_BACKLINK_CLIENT_ID, tenantUserId: "user::bbb", geography: BBB_AI_VISIBILITY_GEOGRAPHY, post: approvedPost, deliveries: [] },
  { clientId: BBB_BACKLINK_CLIENT_ID, tenantUserId: "user::bbb", geography: BBB_AI_VISIBILITY_GEOGRAPHY, post: queuedPost, deliveries: [] },
  { clientId: BBB_BACKLINK_CLIENT_ID, tenantUserId: "user::bbb", geography: BBB_AI_VISIBILITY_GEOGRAPHY, post: scheduledPost, deliveries: [] },
]);

export const BBB_AI_VISIBILITY_GOOGLE: ConnectedGoogleSummary = Object.freeze({
  clientId: BBB_BACKLINK_CLIENT_ID,
  connectionId: "google-connection::bbb",
  geography: BBB_AI_VISIBILITY_GEOGRAPHY,
  observedAt: BBB_AI_VISIBILITY_NOW,
  businessProfile: "connected",
  searchConsole: "not_implemented",
  analytics: "not_implemented",
});
