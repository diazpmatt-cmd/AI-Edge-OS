import type {
  BacklinkEvidenceCategory,
  BacklinkOpportunityCategory,
  CanonicalBacklinkEvidence,
} from "./backlink-types";

export type BacklinkProspectType = "domain" | "page" | "directory" | "organization" | "partnership" | "other";
export type BacklinkWorkflowStatus = "discovered" | "reviewing" | "approved" | "pursuing" | "won" | "rejected" | "expired";

export interface BacklinkProspect {
  id: string;
  clientId: string;
  prospectType: BacklinkProspectType;
  domain: string;
  pageUrl: string | null;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Safe evidence read model. Provider metadata remains server-side. */
export interface BacklinkEvidenceRecord {
  id: string;
  clientId: string;
  prospectId: string;
  sourceDomain: string;
  sourceUrl: string;
  targetUrl: string | null;
  competitorUrl: string | null;
  category: BacklinkEvidenceCategory;
  serviceId: string | null;
  providers: readonly string[];
  discoveredAt: Date;
  freshnessDays: number;
  localRelevance: number;
  serviceRelevance: number;
  competitorFrequency: number;
  relationshipAccessibility: number;
  editorialRequirements: number;
  estimatedEffort: number;
  authority: number;
  createdAt: Date;
}

export interface BacklinkOpportunity {
  id: string;
  clientId: string;
  prospectId: string;
  category: BacklinkOpportunityCategory;
  serviceId: string | null;
  potentialValue: number;
  attainability: number;
  rationale: string;
  recommendedAction: string;
  evidenceIds: readonly string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BacklinkWorkflow {
  id: string;
  clientId: string;
  opportunityId: string;
  status: BacklinkWorkflowStatus;
  ownerId: string | null;
  nextAction: string | null;
  dueAt: Date | null;
  outcomeSummary: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface BacklinkWorkflowEvent {
  id: string;
  clientId: string;
  workflowId: string;
  opportunityId: string;
  sequence: number;
  fromStatus: BacklinkWorkflowStatus | null;
  toStatus: BacklinkWorkflowStatus;
  actorId: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface BacklinkOpportunityListOptions {
  limit?: number;
  offset?: number;
  category?: BacklinkOpportunityCategory;
  workflowStatus?: BacklinkWorkflowStatus;
}

export interface BacklinkOpportunityListResult {
  items: Array<{ opportunity: BacklinkOpportunity; workflow: BacklinkWorkflow }>;
  limit: number;
  offset: number;
}

export interface BacklinkWorkflowTransitionInput {
  toStatus: BacklinkWorkflowStatus;
  actorId?: string | null;
  reason?: string | null;
  ownerId?: string | null;
  nextAction?: string | null;
  dueAt?: Date | null;
  outcomeSummary?: string | null;
  now?: Date;
}

export interface PersistBacklinkEvidenceInput {
  prospectId: string;
  evidence: CanonicalBacklinkEvidence;
}

export interface BacklinkRepository {
  upsertProspect(prospect: BacklinkProspect): Promise<BacklinkProspect>;
  persistEvidence(input: PersistBacklinkEvidenceInput): Promise<BacklinkEvidenceRecord>;
  upsertOpportunity(opportunity: BacklinkOpportunity): Promise<BacklinkOpportunity>;
  createInitialWorkflow(opportunityId: string, clientId: string, now?: Date): Promise<BacklinkWorkflow>;
  transitionWorkflow(opportunityId: string, clientId: string, input: BacklinkWorkflowTransitionInput): Promise<BacklinkWorkflow>;
  appendWorkflowEvent(event: BacklinkWorkflowEvent): Promise<void>;
  getProspectById(id: string, clientId: string): Promise<BacklinkProspect | null>;
  getOpportunityById(id: string, clientId: string): Promise<BacklinkOpportunity | null>;
  listOpportunities(clientId: string, options?: BacklinkOpportunityListOptions): Promise<BacklinkOpportunityListResult>;
  listEvidenceForProspect(prospectId: string, clientId: string): Promise<BacklinkEvidenceRecord[]>;
  listWorkflowEvents(opportunityId: string, clientId: string): Promise<BacklinkWorkflowEvent[]>;
}

export const BACKLINK_TEXT_LIMITS = Object.freeze({ displayName: 200, rationale: 2_000, recommendedAction: 1_000, ownerId: 200, nextAction: 1_000, outcomeSummary: 2_000, eventReason: 1_000 });
export const BACKLINK_MAX_PAGE_SIZE = 100;
