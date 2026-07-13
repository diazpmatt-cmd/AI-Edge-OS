import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema";
import {
  backlinkEvidenceTable, backlinkOpportunitiesTable, backlinkProspectsTable,
  backlinkWorkflowEventsTable, backlinkWorkflowsTable,
  type BacklinkEvidenceRow, type BacklinkOpportunityRow, type BacklinkProspectRow,
  type BacklinkWorkflowEventRow, type BacklinkWorkflowRow,
} from "./schema/backlinks";
import { assertBacklinkWorkflowTransition, isTerminalBacklinkWorkflowStatus } from "./backlink-lifecycle";
import type {
  BacklinkEvidenceRecord, BacklinkOpportunity, BacklinkOpportunityListOptions, BacklinkOpportunityListResult,
  BacklinkProspect, BacklinkRepository, BacklinkWorkflow, BacklinkWorkflowEvent,
  BacklinkWorkflowTransitionInput, PersistBacklinkEvidenceInput,
} from "./backlink-persistence-types";
import { BACKLINK_MAX_PAGE_SIZE, BACKLINK_TEXT_LIMITS } from "./backlink-persistence-types";

type Db = NodePgDatabase<typeof schema>;
const key = (clientId: string, id: string) => `${clientId}|${id}`;
const clampPage = (value: number | undefined, fallback: number) => Math.max(0, Math.min(BACKLINK_MAX_PAGE_SIZE, Math.floor(value ?? fallback)));
const bounded = (value: string | null | undefined, limit: number, field: string): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed.length > limit) throw new Error(`${field} exceeds ${limit} characters`);
  return trimmed || null;
};
const score = (value: number, field: string) => {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${field} must be between 0 and 100`);
  return Math.round(value);
};
const ensureTenant = (clientId: string) => { if (!clientId.trim()) throw new Error("clientId is required"); };

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
export const deriveBacklinkProspectId = (clientId: string, domain: string, pageUrl: string | null) => `blpr::${fnv1a(`${clientId}|${domain.toLowerCase()}|${pageUrl ?? ""}`)}`;
export const deriveBacklinkOpportunityId = (clientId: string, prospectId: string, category: string, serviceId: string | null) => `blop::${fnv1a(`${clientId}|${prospectId}|${category}|${serviceId ?? ""}`)}`;
export const deriveBacklinkWorkflowId = (clientId: string, opportunityId: string) => `blwf::${fnv1a(`${clientId}|${opportunityId}`)}`;
export const deriveBacklinkWorkflowEventId = (workflowId: string, sequence: number) => `blwe::${fnv1a(`${workflowId}|${sequence}`)}`;

function validateProspect(value: BacklinkProspect): BacklinkProspect {
  ensureTenant(value.clientId);
  if (!value.id || !value.domain.trim()) throw new Error("prospect id and domain are required");
  return { ...value, domain: value.domain.toLowerCase().replace(/^www\./, ""), displayName: bounded(value.displayName, BACKLINK_TEXT_LIMITS.displayName, "displayName") };
}
function validateOpportunity(value: BacklinkOpportunity): BacklinkOpportunity {
  ensureTenant(value.clientId);
  if (!value.id || !value.prospectId) throw new Error("opportunity id and prospectId are required");
  return { ...value, potentialValue: score(value.potentialValue, "potentialValue"), attainability: score(value.attainability, "attainability"),
    rationale: bounded(value.rationale, BACKLINK_TEXT_LIMITS.rationale, "rationale") ?? "",
    recommendedAction: bounded(value.recommendedAction, BACKLINK_TEXT_LIMITS.recommendedAction, "recommendedAction") ?? "",
    evidenceIds: Object.freeze([...new Set(value.evidenceIds)].sort()) };
}
function validateTransition(input: BacklinkWorkflowTransitionInput) {
  return { ...input,
    actorId: bounded(input.actorId, BACKLINK_TEXT_LIMITS.ownerId, "actorId"),
    reason: bounded(input.reason, BACKLINK_TEXT_LIMITS.eventReason, "reason"),
    ownerId: bounded(input.ownerId, BACKLINK_TEXT_LIMITS.ownerId, "ownerId"),
    nextAction: bounded(input.nextAction, BACKLINK_TEXT_LIMITS.nextAction, "nextAction"),
    outcomeSummary: bounded(input.outcomeSummary, BACKLINK_TEXT_LIMITS.outcomeSummary, "outcomeSummary") };
}

const prospectFromRow = (r: BacklinkProspectRow): BacklinkProspect => ({ ...r, prospectType: r.prospectType as BacklinkProspect["prospectType"] });
const evidenceFromRow = (r: BacklinkEvidenceRow): BacklinkEvidenceRecord => ({
  id: r.id, clientId: r.clientId, prospectId: r.prospectId, sourceDomain: r.sourceDomain, sourceUrl: r.sourceUrl,
  targetUrl: r.targetUrl, competitorUrl: r.competitorUrl, category: r.category as BacklinkEvidenceRecord["category"], serviceId: r.serviceId,
  providers: Array.isArray(r.providers) ? r.providers.filter((x): x is string => typeof x === "string").sort() : [],
  discoveredAt: r.discoveredAt, freshnessDays: r.freshnessDays, localRelevance: r.localRelevance, serviceRelevance: r.serviceRelevance,
  competitorFrequency: r.competitorFrequency, relationshipAccessibility: r.relationshipAccessibility,
  editorialRequirements: r.editorialRequirements, estimatedEffort: r.estimatedEffort, authority: r.authority, createdAt: r.createdAt,
});
const opportunityFromRow = (r: BacklinkOpportunityRow): BacklinkOpportunity => ({ ...r,
  category: r.category as BacklinkOpportunity["category"], evidenceIds: Array.isArray(r.evidenceIds) ? r.evidenceIds.filter((x): x is string => typeof x === "string").sort() : [] });
const workflowFromRow = (r: BacklinkWorkflowRow): BacklinkWorkflow => ({ ...r, status: r.status as BacklinkWorkflow["status"] });
const eventFromRow = (r: BacklinkWorkflowEventRow): BacklinkWorkflowEvent => ({ ...r,
  fromStatus: r.fromStatus as BacklinkWorkflowEvent["fromStatus"], toStatus: r.toStatus as BacklinkWorkflowEvent["toStatus"] });

/** Deterministic credential-free implementation used by the contract suite. */
export class InMemoryBacklinkRepository implements BacklinkRepository {
  private prospects = new Map<string, BacklinkProspect>();
  private evidence = new Map<string, BacklinkEvidenceRecord>();
  private opportunities = new Map<string, BacklinkOpportunity>();
  private workflows = new Map<string, BacklinkWorkflow>();
  private events = new Map<string, BacklinkWorkflowEvent>();

  async upsertProspect(input: BacklinkProspect) {
    const value = validateProspect(input); const k = key(value.clientId, value.id);
    const crossTenant = [...this.prospects.values()].find(x => x.id === value.id && x.clientId !== value.clientId);
    if (crossTenant) throw new Error("cross-tenant prospect ID collision");
    const existing = this.prospects.get(k); const result = existing ? { ...existing, ...value, createdAt: existing.createdAt } : value;
    this.prospects.set(k, structuredClone(result)); return structuredClone(result);
  }

  async persistEvidence({ prospectId, evidence }: PersistBacklinkEvidenceInput) {
    ensureTenant(evidence.clientId);
    if (!this.prospects.has(key(evidence.clientId, prospectId))) throw new Error("prospect not found for client");
    const k = key(evidence.clientId, evidence.id); const existing = this.evidence.get(k); if (existing) return structuredClone(existing);
    if ([...this.evidence.values()].some(x => x.id === evidence.id && x.clientId !== evidence.clientId)) throw new Error("cross-tenant evidence ID collision");
    const record: BacklinkEvidenceRecord = { ...evidence, prospectId, providers: [...evidence.providers].sort(), discoveredAt: new Date(evidence.discoveredAt), createdAt: new Date() };
    delete (record as unknown as Record<string, unknown>).providerMetadata;
    this.evidence.set(k, structuredClone(record)); return structuredClone(record);
  }

  async upsertOpportunity(input: BacklinkOpportunity) {
    const value = validateOpportunity(input);
    if (!this.prospects.has(key(value.clientId, value.prospectId))) throw new Error("prospect not found for client");
    for (const evidenceId of value.evidenceIds) if (!this.evidence.has(key(value.clientId, evidenceId))) throw new Error("evidence not found for client");
    const k = key(value.clientId, value.id); const existing = this.opportunities.get(k);
    if ([...this.opportunities.values()].some(x => x.id === value.id && x.clientId !== value.clientId)) throw new Error("cross-tenant opportunity ID collision");
    const result = existing ? { ...existing, ...value, createdAt: existing.createdAt } : value;
    this.opportunities.set(k, structuredClone(result)); return structuredClone(result);
  }

  async createInitialWorkflow(opportunityId: string, clientId: string, now = new Date()) {
    if (!this.opportunities.has(key(clientId, opportunityId))) throw new Error("opportunity not found for client");
    const id = deriveBacklinkWorkflowId(clientId, opportunityId); const k = key(clientId, id); const existing = this.workflows.get(k); if (existing) return structuredClone(existing);
    const workflow: BacklinkWorkflow = { id, clientId, opportunityId, status: "discovered", ownerId: null, nextAction: null, dueAt: null, outcomeSummary: null, version: 1, createdAt: now, updatedAt: now, completedAt: null };
    const event: BacklinkWorkflowEvent = { id: deriveBacklinkWorkflowEventId(id, 1), clientId, workflowId: id, opportunityId, sequence: 1, fromStatus: null, toStatus: "discovered", actorId: null, reason: "workflow_created", createdAt: now };
    this.workflows.set(k, structuredClone(workflow)); this.events.set(key(clientId, event.id), structuredClone(event)); return structuredClone(workflow);
  }

  async transitionWorkflow(opportunityId: string, clientId: string, raw: BacklinkWorkflowTransitionInput) {
    const input = validateTransition(raw); const id = deriveBacklinkWorkflowId(clientId, opportunityId); const k = key(clientId, id);
    const current = this.workflows.get(k); if (!current) throw new Error("workflow not found for client");
    assertBacklinkWorkflowTransition(current.status, input.toStatus); const now = input.now ?? new Date(); const version = current.version + 1;
    const next: BacklinkWorkflow = { ...current, status: input.toStatus, ownerId: input.ownerId === undefined ? current.ownerId : input.ownerId,
      nextAction: input.nextAction === undefined ? current.nextAction : input.nextAction, dueAt: input.dueAt === undefined ? current.dueAt : input.dueAt,
      outcomeSummary: input.outcomeSummary === undefined ? current.outcomeSummary : input.outcomeSummary, version, updatedAt: now,
      completedAt: isTerminalBacklinkWorkflowStatus(input.toStatus) ? now : null };
    const event: BacklinkWorkflowEvent = { id: deriveBacklinkWorkflowEventId(id, version), clientId, workflowId: id, opportunityId, sequence: version,
      fromStatus: current.status, toStatus: input.toStatus, actorId: input.actorId ?? null, reason: input.reason ?? null, createdAt: now };
    this.workflows.set(k, structuredClone(next)); this.events.set(key(clientId, event.id), structuredClone(event)); return structuredClone(next);
  }

  async appendWorkflowEvent(event: BacklinkWorkflowEvent) {
    if (!this.workflows.has(key(event.clientId, event.workflowId)) || !this.opportunities.has(key(event.clientId, event.opportunityId))) throw new Error("cross-tenant workflow association denied");
    const k = key(event.clientId, event.id); if (!this.events.has(k)) this.events.set(k, structuredClone(event));
  }
  async getProspectById(id: string, clientId: string) { return structuredClone(this.prospects.get(key(clientId, id)) ?? null); }
  async getOpportunityById(id: string, clientId: string) { return structuredClone(this.opportunities.get(key(clientId, id)) ?? null); }
  async listEvidenceForProspect(prospectId: string, clientId: string) { return [...this.evidence.values()].filter(x => x.clientId === clientId && x.prospectId === prospectId).sort((a,b) => b.discoveredAt.getTime()-a.discoveredAt.getTime() || a.id.localeCompare(b.id)).map(value => structuredClone(value)); }
  async listWorkflowEvents(opportunityId: string, clientId: string) { return [...this.events.values()].filter(x => x.clientId === clientId && x.opportunityId === opportunityId).sort((a,b) => a.sequence-b.sequence || a.id.localeCompare(b.id)).map(value => structuredClone(value)); }
  async listOpportunities(clientId: string, options: BacklinkOpportunityListOptions = {}): Promise<BacklinkOpportunityListResult> {
    const limit = Math.max(1, clampPage(options.limit, 20)); const offset = clampPage(options.offset, 0);
    const rows = [...this.opportunities.values()].filter(o => o.clientId === clientId && (!options.category || o.category === options.category))
      .map(opportunity => ({ opportunity, workflow: this.workflows.get(key(clientId, deriveBacklinkWorkflowId(clientId, opportunity.id))) }))
      .filter((x): x is { opportunity: BacklinkOpportunity; workflow: BacklinkWorkflow } => Boolean(x.workflow) && (!options.workflowStatus || x.workflow?.status === options.workflowStatus))
      .sort((a,b) => b.opportunity.attainability-a.opportunity.attainability || b.opportunity.potentialValue-a.opportunity.potentialValue || a.opportunity.id.localeCompare(b.opportunity.id));
    return { items: structuredClone(rows.slice(offset, offset + limit)), limit, offset };
  }
}

/** Production Drizzle implementation. Every predicate includes record ID and clientId. */
export class DrizzleBacklinkRepository implements BacklinkRepository {
  constructor(private readonly db: Db) {}

  async upsertProspect(input: BacklinkProspect) {
    const value = validateProspect(input);
    await this.db.insert(backlinkProspectsTable).values(value).onConflictDoNothing({ target: backlinkProspectsTable.id });
    await this.db.update(backlinkProspectsTable).set({ prospectType: value.prospectType, domain: value.domain, pageUrl: value.pageUrl, displayName: value.displayName, updatedAt: value.updatedAt })
      .where(and(eq(backlinkProspectsTable.id, value.id), eq(backlinkProspectsTable.clientId, value.clientId)));
    const found = await this.getProspectById(value.id, value.clientId); if (!found) throw new Error("cross-tenant prospect ID collision"); return found;
  }

  async persistEvidence({ prospectId, evidence }: PersistBacklinkEvidenceInput) {
    const prospect = await this.getProspectById(prospectId, evidence.clientId); if (!prospect) throw new Error("prospect not found for client");
    await this.db.insert(backlinkEvidenceTable).values({ ...evidence, prospectId, providers: [...evidence.providers].sort(), providerMetadata: evidence.providerMetadata,
      discoveredAt: new Date(evidence.discoveredAt) }).onConflictDoNothing({ target: backlinkEvidenceTable.id });
    const [row] = await this.db.select().from(backlinkEvidenceTable).where(and(eq(backlinkEvidenceTable.id, evidence.id), eq(backlinkEvidenceTable.clientId, evidence.clientId))).limit(1);
    if (!row) throw new Error("cross-tenant evidence ID collision"); return evidenceFromRow(row);
  }

  async upsertOpportunity(input: BacklinkOpportunity) {
    const value = validateOpportunity(input); if (!await this.getProspectById(value.prospectId, value.clientId)) throw new Error("prospect not found for client");
    for (const evidenceId of value.evidenceIds) { const [row] = await this.db.select({ id: backlinkEvidenceTable.id }).from(backlinkEvidenceTable).where(and(eq(backlinkEvidenceTable.id, evidenceId), eq(backlinkEvidenceTable.clientId, value.clientId))).limit(1); if (!row) throw new Error("evidence not found for client"); }
    await this.db.insert(backlinkOpportunitiesTable).values({ ...value, evidenceIds: [...value.evidenceIds] }).onConflictDoNothing({ target: backlinkOpportunitiesTable.id });
    await this.db.update(backlinkOpportunitiesTable).set({ category: value.category, serviceId: value.serviceId, potentialValue: value.potentialValue, attainability: value.attainability,
      rationale: value.rationale, recommendedAction: value.recommendedAction, evidenceIds: [...value.evidenceIds], updatedAt: value.updatedAt })
      .where(and(eq(backlinkOpportunitiesTable.id, value.id), eq(backlinkOpportunitiesTable.clientId, value.clientId)));
    const found = await this.getOpportunityById(value.id, value.clientId); if (!found) throw new Error("cross-tenant opportunity ID collision"); return found;
  }

  async createInitialWorkflow(opportunityId: string, clientId: string, now = new Date()) {
    if (!await this.getOpportunityById(opportunityId, clientId)) throw new Error("opportunity not found for client");
    const id = deriveBacklinkWorkflowId(clientId, opportunityId);
    return this.db.transaction(async tx => {
      await tx.insert(backlinkWorkflowsTable).values({ id, clientId, opportunityId, status: "discovered", version: 1, createdAt: now, updatedAt: now }).onConflictDoNothing({ target: backlinkWorkflowsTable.id });
      await tx.insert(backlinkWorkflowEventsTable).values({ id: deriveBacklinkWorkflowEventId(id, 1), clientId, workflowId: id, opportunityId, sequence: 1, fromStatus: null, toStatus: "discovered", reason: "workflow_created", createdAt: now }).onConflictDoNothing({ target: backlinkWorkflowEventsTable.id });
      const [row] = await tx.select().from(backlinkWorkflowsTable).where(and(eq(backlinkWorkflowsTable.id, id), eq(backlinkWorkflowsTable.clientId, clientId))).limit(1);
      if (!row) throw new Error("cross-tenant workflow association denied"); return workflowFromRow(row);
    });
  }

  async transitionWorkflow(opportunityId: string, clientId: string, raw: BacklinkWorkflowTransitionInput) {
    const input = validateTransition(raw); const id = deriveBacklinkWorkflowId(clientId, opportunityId); const now = input.now ?? new Date();
    return this.db.transaction(async tx => {
      const [currentRow] = await tx.select().from(backlinkWorkflowsTable).where(and(eq(backlinkWorkflowsTable.id, id), eq(backlinkWorkflowsTable.opportunityId, opportunityId), eq(backlinkWorkflowsTable.clientId, clientId))).for("update").limit(1);
      if (!currentRow) throw new Error("workflow not found for client"); const current = workflowFromRow(currentRow); assertBacklinkWorkflowTransition(current.status, input.toStatus); const version = current.version + 1;
      const [updated] = await tx.update(backlinkWorkflowsTable).set({ status: input.toStatus, ownerId: input.ownerId === undefined ? current.ownerId : input.ownerId,
        nextAction: input.nextAction === undefined ? current.nextAction : input.nextAction, dueAt: input.dueAt === undefined ? current.dueAt : input.dueAt,
        outcomeSummary: input.outcomeSummary === undefined ? current.outcomeSummary : input.outcomeSummary, version, updatedAt: now,
        completedAt: isTerminalBacklinkWorkflowStatus(input.toStatus) ? now : null })
        .where(and(eq(backlinkWorkflowsTable.id, id), eq(backlinkWorkflowsTable.opportunityId, opportunityId), eq(backlinkWorkflowsTable.clientId, clientId), eq(backlinkWorkflowsTable.version, current.version))).returning();
      if (!updated) throw new Error("workflow transition conflict");
      await tx.insert(backlinkWorkflowEventsTable).values({ id: deriveBacklinkWorkflowEventId(id, version), clientId, workflowId: id, opportunityId, sequence: version,
        fromStatus: current.status, toStatus: input.toStatus, actorId: input.actorId, reason: input.reason, createdAt: now });
      return workflowFromRow(updated);
    });
  }

  async appendWorkflowEvent(event: BacklinkWorkflowEvent) {
    const [workflow] = await this.db.select({ id: backlinkWorkflowsTable.id }).from(backlinkWorkflowsTable).where(and(eq(backlinkWorkflowsTable.id, event.workflowId), eq(backlinkWorkflowsTable.opportunityId, event.opportunityId), eq(backlinkWorkflowsTable.clientId, event.clientId))).limit(1);
    if (!workflow) throw new Error("cross-tenant workflow association denied");
    await this.db.insert(backlinkWorkflowEventsTable).values(event).onConflictDoNothing({ target: backlinkWorkflowEventsTable.id });
  }
  async getProspectById(id: string, clientId: string) { const [r] = await this.db.select().from(backlinkProspectsTable).where(and(eq(backlinkProspectsTable.id,id),eq(backlinkProspectsTable.clientId,clientId))).limit(1); return r ? prospectFromRow(r) : null; }
  async getOpportunityById(id: string, clientId: string) { const [r] = await this.db.select().from(backlinkOpportunitiesTable).where(and(eq(backlinkOpportunitiesTable.id,id),eq(backlinkOpportunitiesTable.clientId,clientId))).limit(1); return r ? opportunityFromRow(r) : null; }
  async listEvidenceForProspect(prospectId: string, clientId: string) { const rows = await this.db.select().from(backlinkEvidenceTable).where(and(eq(backlinkEvidenceTable.prospectId,prospectId),eq(backlinkEvidenceTable.clientId,clientId))).orderBy(desc(backlinkEvidenceTable.discoveredAt),asc(backlinkEvidenceTable.id)); return rows.map(evidenceFromRow); }
  async listWorkflowEvents(opportunityId: string, clientId: string) { const rows = await this.db.select().from(backlinkWorkflowEventsTable).where(and(eq(backlinkWorkflowEventsTable.opportunityId,opportunityId),eq(backlinkWorkflowEventsTable.clientId,clientId))).orderBy(asc(backlinkWorkflowEventsTable.sequence),asc(backlinkWorkflowEventsTable.id)); return rows.map(eventFromRow); }
  async listOpportunities(clientId: string, options: BacklinkOpportunityListOptions = {}): Promise<BacklinkOpportunityListResult> {
    const limit = Math.max(1, clampPage(options.limit,20)); const offset = clampPage(options.offset,0);
    const conditions = [eq(backlinkOpportunitiesTable.clientId,clientId),eq(backlinkWorkflowsTable.clientId,clientId)];
    if (options.category) conditions.push(eq(backlinkOpportunitiesTable.category,options.category)); if (options.workflowStatus) conditions.push(eq(backlinkWorkflowsTable.status,options.workflowStatus));
    const rows = await this.db.select({ opportunity: backlinkOpportunitiesTable, workflow: backlinkWorkflowsTable }).from(backlinkOpportunitiesTable)
      .innerJoin(backlinkWorkflowsTable,and(eq(backlinkWorkflowsTable.opportunityId,backlinkOpportunitiesTable.id),eq(backlinkWorkflowsTable.clientId,backlinkOpportunitiesTable.clientId)))
      .where(and(...conditions)).orderBy(desc(backlinkOpportunitiesTable.attainability),desc(backlinkOpportunitiesTable.potentialValue),asc(backlinkOpportunitiesTable.id)).limit(limit).offset(offset);
    return { items: rows.map(r => ({ opportunity: opportunityFromRow(r.opportunity), workflow: workflowFromRow(r.workflow) })), limit, offset };
  }
}
