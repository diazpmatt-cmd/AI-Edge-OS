import type {
  BacklinkEvidenceRecord,
  BacklinkOpportunity,
  BacklinkProspect,
  BacklinkWorkflow,
} from "@workspace/db";

export type BacklinkOpportunityPriorityTier = "top" | "high" | "medium" | "low";
export type BacklinkOpportunityReasonCode =
  | "high_value"
  | "easy_win"
  | "competitor_gap"
  | "local_authority"
  | "evidence_strength"
  | "already_approved"
  | "already_pursuing";

export interface BacklinkOpportunityIntelligenceInput {
  readonly opportunity: BacklinkOpportunity;
  readonly workflow: BacklinkWorkflow;
  readonly prospect: BacklinkProspect | null;
}

export interface BacklinkEvidencePreview {
  readonly id: string;
  readonly sourceDomain: string;
  readonly sourceUrl: string;
  readonly competitorUrl: string | null;
  readonly targetUrl: string | null;
  readonly authority: number;
  readonly competitorFrequency: number;
  readonly relationshipAccessibility: number;
  readonly estimatedEffort: number;
  readonly discoveredAt: string;
  readonly providers: readonly string[];
}

export interface BacklinkOpportunityIntelligenceItem {
  readonly opportunityId: string;
  readonly prospectId: string;
  readonly domain: string | null;
  readonly pageUrl: string | null;
  readonly category: BacklinkOpportunity["category"];
  readonly serviceId: string | null;
  readonly workflowStatus: BacklinkWorkflow["status"];
  readonly potentialValue: number;
  readonly attainability: number;
  readonly priorityScore: number;
  readonly priorityTier: BacklinkOpportunityPriorityTier;
  readonly reasonCodes: readonly BacklinkOpportunityReasonCode[];
  readonly rationale: string;
  readonly recommendedAction: string;
  readonly evidenceCount: number;
}

const TERMINAL_STATUSES = new Set<BacklinkWorkflow["status"]>([
  "won",
  "rejected",
  "expired",
]);

const LOCAL_AUTHORITY_CATEGORIES = new Set<BacklinkOpportunity["category"]>([
  "citation_directory",
  "local_partnership",
  "sponsorship_organization",
]);

function roundScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

export function computeBacklinkOpportunityPriority(
  opportunity: Pick<BacklinkOpportunity, "potentialValue" | "attainability">,
): number {
  return roundScore(opportunity.potentialValue * 0.55 + opportunity.attainability * 0.45);
}

export function classifyBacklinkOpportunityPriority(score: number): BacklinkOpportunityPriorityTier {
  if (score >= 80) return "top";
  if (score >= 65) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export function explainBacklinkOpportunity(
  opportunity: BacklinkOpportunity,
  workflow: BacklinkWorkflow,
): readonly BacklinkOpportunityReasonCode[] {
  const reasons: BacklinkOpportunityReasonCode[] = [];
  if (opportunity.potentialValue >= 75) reasons.push("high_value");
  if (opportunity.attainability >= 75) reasons.push("easy_win");
  if (opportunity.category === "competitor_link_gap") reasons.push("competitor_gap");
  if (LOCAL_AUTHORITY_CATEGORIES.has(opportunity.category)) reasons.push("local_authority");
  if (opportunity.evidenceIds.length >= 2) reasons.push("evidence_strength");
  if (workflow.status === "approved") reasons.push("already_approved");
  if (workflow.status === "pursuing") reasons.push("already_pursuing");
  return Object.freeze(reasons);
}

export function selectBacklinkEvidencePreview(
  opportunity: Pick<BacklinkOpportunity, "evidenceIds">,
  evidence: readonly BacklinkEvidenceRecord[],
  limit = 3,
): readonly BacklinkEvidencePreview[] {
  const allowedIds = new Set(opportunity.evidenceIds);
  const boundedLimit = Math.max(1, Math.min(5, Math.floor(limit)));

  return Object.freeze(
    evidence
      .filter((record) => allowedIds.has(record.id))
      .sort((a, b) =>
        b.discoveredAt.getTime() - a.discoveredAt.getTime() || a.id.localeCompare(b.id),
      )
      .slice(0, boundedLimit)
      .map((record) => Object.freeze({
        id: record.id,
        sourceDomain: record.sourceDomain,
        sourceUrl: record.sourceUrl,
        competitorUrl: record.competitorUrl,
        targetUrl: record.targetUrl,
        authority: record.authority,
        competitorFrequency: record.competitorFrequency,
        relationshipAccessibility: record.relationshipAccessibility,
        estimatedEffort: record.estimatedEffort,
        discoveredAt: record.discoveredAt.toISOString(),
        providers: Object.freeze([...record.providers].sort()),
      })),
  );
}

export function rankBacklinkOpportunities(
  items: readonly BacklinkOpportunityIntelligenceInput[],
  limit = 20,
): readonly BacklinkOpportunityIntelligenceItem[] {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));

  return Object.freeze(
    items
      .filter(({ workflow }) => !TERMINAL_STATUSES.has(workflow.status))
      .map(({ opportunity, workflow, prospect }) => {
        const priorityScore = computeBacklinkOpportunityPriority(opportunity);
        return Object.freeze({
          opportunityId: opportunity.id,
          prospectId: opportunity.prospectId,
          domain: prospect?.domain ?? null,
          pageUrl: prospect?.pageUrl ?? null,
          category: opportunity.category,
          serviceId: opportunity.serviceId,
          workflowStatus: workflow.status,
          potentialValue: opportunity.potentialValue,
          attainability: opportunity.attainability,
          priorityScore,
          priorityTier: classifyBacklinkOpportunityPriority(priorityScore),
          reasonCodes: explainBacklinkOpportunity(opportunity, workflow),
          rationale: opportunity.rationale,
          recommendedAction: workflow.nextAction?.trim() || opportunity.recommendedAction,
          evidenceCount: opportunity.evidenceIds.length,
        });
      })
      .sort((a, b) =>
        b.priorityScore - a.priorityScore ||
        b.attainability - a.attainability ||
        b.potentialValue - a.potentialValue ||
        a.opportunityId.localeCompare(b.opportunityId),
      )
      .slice(0, boundedLimit),
  );
}
