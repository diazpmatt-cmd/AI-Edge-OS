import { createHash } from "node:crypto";
import type { BacklinkCapability } from "./backlink-types";

export type BacklinkIngestionRunStatus = "running" | "succeeded" | "failed";
export type BacklinkIngestionMode = "manual" | "scheduled";
export type BacklinkIngestionFailureStage = "provider" | "preparation" | "prospect" | "evidence" | "opportunity" | "workflow" | "initial_event" | "finalization";
export type BacklinkIngestionFailureCode = "provider_failed" | "validation_failed" | "persistence_failed" | "finalization_failed";

export const BACKLINK_CAPABILITY_VALUES: readonly BacklinkCapability[] = Object.freeze([
  "referring_domains", "link_intersections", "brand_mentions", "broken_links", "authority_metrics", "resource_page_discovery",
  "citation_directory_discovery", "partnership_organization_discovery",
]);
export const BACKLINK_REPLAY_ID_LIMIT = 100;
const CAPABILITY_SET = new Set<string>(BACKLINK_CAPABILITY_VALUES);
const INGESTION_MODE_SET = new Set<BacklinkIngestionMode>(["manual", "scheduled"]);

export interface BacklinkIngestionCounts {
  observed: number;
  accepted: number;
  rejected: number;
  mergedEvidence: number;
  prospectCount: number | null;
  evidenceCount: number | null;
  opportunityCount: number | null;
  workflowCount: number | null;
}

export interface BacklinkIngestionResultSummary extends BacklinkIngestionCounts {
  prospectIds: readonly string[];
  evidenceIds: readonly string[];
  opportunityIds: readonly string[];
  workflowIds: readonly string[];
}

export interface BacklinkIngestionRun {
  id: string;
  clientId: string;
  providerId: string;
  providerRevision: string;
  mode: BacklinkIngestionMode;
  status: BacklinkIngestionRunStatus;
  capabilities: readonly BacklinkCapability[];
  inputFingerprint: string;
  attemptCount: number;
  startedAt: Date;
  attemptStartedAt: Date;
  completedAt: Date | null;
  counts: BacklinkIngestionCounts;
  resultSummary: BacklinkIngestionResultSummary | null;
  failureStage: BacklinkIngestionFailureStage | null;
  failureCode: BacklinkIngestionFailureCode | null;
}

export interface BacklinkIngestionFingerprintInput {
  trustedClientId: string;
  providerId: string;
  providerRevision: string;
  mode: BacklinkIngestionMode;
  capabilities: readonly BacklinkCapability[];
  clientDomain: string;
  competitorDomains: readonly string[];
  serviceIds: readonly string[];
  city: string;
  region: string;
  limit: number;
  allowedServiceIds: ReadonlySet<string>;
  blockedPhrases?: readonly string[];
}

const normalizeToken = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const normalizePlace = (value: string) => normalizeToken(value).replace(/\balabama\b/g, "al").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const normalizeDomain = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  try { return new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.replace(/^www\./, ""); }
  catch { return trimmed.replace(/^www\./, "").replace(/\/$/, ""); }
};
const sortedUnique = (values: readonly string[], normalize = normalizeToken) => [...new Set(values.map(normalize).filter(Boolean))].sort();
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const normalizeBacklinkProviderId = (value: string) => normalizeToken(value).replace(/[^a-z0-9._-]+/g, "_");
export const normalizeBacklinkProviderRevision = (value: string) => normalizeToken(value).replace(/[^a-z0-9._-]+/g, "_");

export function deriveBacklinkIngestionFingerprint(input: BacklinkIngestionFingerprintInput): string {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > BACKLINK_REPLAY_ID_LIMIT) throw new Error(`limit must be between 1 and ${BACKLINK_REPLAY_ID_LIMIT}`);
  const canonical = {
    trustedClientId: input.trustedClientId.trim(),
    providerId: normalizeBacklinkProviderId(input.providerId),
    providerRevision: normalizeBacklinkProviderRevision(input.providerRevision),
    mode: input.mode,
    capabilities: sortedUnique(input.capabilities),
    clientDomain: normalizeDomain(input.clientDomain),
    competitorDomains: sortedUnique(input.competitorDomains, normalizeDomain),
    serviceIds: sortedUnique(input.serviceIds),
    city: normalizePlace(input.city),
    region: normalizePlace(input.region),
    limit: input.limit,
    allowedServiceIds: sortedUnique([...input.allowedServiceIds]),
    blockedPhrases: sortedUnique(input.blockedPhrases ?? []),
  };
  return sha256(JSON.stringify(canonical));
}

export const deriveBacklinkIngestionRunId = (fingerprint: string) => `blrun::${sha256(fingerprint).slice(0, 32)}`;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const assertFiniteDate = (value: Date, field: string) => { if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error(`${field} must be a valid date`); };
const assertNonnegativeInteger = (value: unknown, field: string): number => {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${field} must be a nonnegative integer`); return value as number;
};
const assertExactKeys = (value: Record<string, unknown>, keys: readonly string[], label: string) => {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has unknown or missing keys`);
};
const sortedUniqueIds = (value: unknown, prefix: string, field: string): string[] => {
  if (!Array.isArray(value) || value.length > BACKLINK_REPLAY_ID_LIMIT || value.some(item => typeof item !== "string" || item.length > 64 || !item.startsWith(prefix)))
    throw new Error(`${field} must be a bounded canonical identifier array`);
  const canonical = [...new Set(value as string[])].sort();
  if (canonical.length !== value.length || canonical.some((id, index) => id !== value[index])) throw new Error(`${field} must be sorted and unique`);
  return canonical;
};
const arrayEquals = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, index) => value === b[index]);

export function validateBacklinkIngestionClaim<T extends {
  id: string; clientId: string; providerId: string; providerRevision: string; mode: string; capabilities: readonly string[]; inputFingerprint: string; now: Date;
}>(input: T): T & { capabilities: readonly BacklinkCapability[]; mode: BacklinkIngestionMode } {
  if (!input.clientId.trim()) throw new Error("clientId is required");
  if (input.providerId !== normalizeBacklinkProviderId(input.providerId) || input.providerId.length < 1 || input.providerId.length > 100) throw new Error("invalid providerId");
  if (input.providerRevision !== normalizeBacklinkProviderRevision(input.providerRevision) || input.providerRevision.length < 1 || input.providerRevision.length > 100) throw new Error("invalid providerRevision");
  if (!INGESTION_MODE_SET.has(input.mode as BacklinkIngestionMode)) throw new Error("invalid ingestion mode");
  if (!/^[0-9a-f]{64}$/.test(input.inputFingerprint)) throw new Error("invalid input fingerprint");
  if (input.id !== deriveBacklinkIngestionRunId(input.inputFingerprint)) throw new Error("invalid ingestion run ID");
  if (!Array.isArray(input.capabilities) || input.capabilities.length > 8 || input.capabilities.some(value => !CAPABILITY_SET.has(value))) throw new Error("invalid capabilities");
  const canonical = [...new Set(input.capabilities)].sort();
  if (!arrayEquals(canonical, input.capabilities)) throw new Error("capabilities must be sorted and unique");
  assertFiniteDate(input.now, "now");
  return { ...input, capabilities: canonical as BacklinkCapability[], mode: input.mode as BacklinkIngestionMode };
}

export function validateBacklinkRunChronology(startedAt: Date, attemptStartedAt: Date, completedAt: Date | null): void {
  assertFiniteDate(startedAt, "startedAt"); assertFiniteDate(attemptStartedAt, "attemptStartedAt");
  if (attemptStartedAt.getTime() < startedAt.getTime()) throw new Error("attemptStartedAt cannot precede startedAt");
  if (completedAt) { assertFiniteDate(completedAt, "completedAt"); if (completedAt.getTime() < attemptStartedAt.getTime()) throw new Error("completedAt cannot precede attemptStartedAt"); }
}

export function validateBacklinkIngestionCounts(counts: BacklinkIngestionCounts, successful: boolean): BacklinkIngestionCounts {
  const result: BacklinkIngestionCounts = { observed: assertNonnegativeInteger(counts.observed, "observed"), accepted: assertNonnegativeInteger(counts.accepted, "accepted"),
    rejected: assertNonnegativeInteger(counts.rejected, "rejected"), mergedEvidence: assertNonnegativeInteger(counts.mergedEvidence, "mergedEvidence"),
    prospectCount: successful ? assertNonnegativeInteger(counts.prospectCount, "prospectCount") : null,
    evidenceCount: successful ? assertNonnegativeInteger(counts.evidenceCount, "evidenceCount") : null,
    opportunityCount: successful ? assertNonnegativeInteger(counts.opportunityCount, "opportunityCount") : null,
    workflowCount: successful ? assertNonnegativeInteger(counts.workflowCount, "workflowCount") : null };
  if (result.accepted + result.rejected !== result.observed) throw new Error("accepted and rejected counts must equal observed");
  return result;
}

const SUMMARY_KEYS = Object.freeze(["observed", "accepted", "rejected", "mergedEvidence", "prospectCount", "evidenceCount", "opportunityCount", "workflowCount",
  "prospectIds", "evidenceIds", "opportunityIds", "workflowIds"]);

export function validateStoredBacklinkReplaySummary(value: unknown): BacklinkIngestionResultSummary {
  if (!isRecord(value)) throw new Error("replay summary must be an object"); assertExactKeys(value, SUMMARY_KEYS, "replay summary");
  const prospectIds = sortedUniqueIds(value.prospectIds, "blpr::", "prospectIds");
  const evidenceIds = sortedUniqueIds(value.evidenceIds, "blev::", "evidenceIds");
  const opportunityIds = sortedUniqueIds(value.opportunityIds, "blop::", "opportunityIds");
  const workflowIds = sortedUniqueIds(value.workflowIds, "blwf::", "workflowIds");
  const summary: BacklinkIngestionResultSummary = { observed: assertNonnegativeInteger(value.observed, "observed"), accepted: assertNonnegativeInteger(value.accepted, "accepted"),
    rejected: assertNonnegativeInteger(value.rejected, "rejected"), mergedEvidence: assertNonnegativeInteger(value.mergedEvidence, "mergedEvidence"),
    prospectCount: assertNonnegativeInteger(value.prospectCount, "prospectCount"), evidenceCount: assertNonnegativeInteger(value.evidenceCount, "evidenceCount"),
    opportunityCount: assertNonnegativeInteger(value.opportunityCount, "opportunityCount"), workflowCount: assertNonnegativeInteger(value.workflowCount, "workflowCount"),
    prospectIds: Object.freeze(prospectIds), evidenceIds: Object.freeze(evidenceIds), opportunityIds: Object.freeze(opportunityIds), workflowIds: Object.freeze(workflowIds) };
  if (summary.prospectCount !== prospectIds.length || summary.evidenceCount !== evidenceIds.length || summary.opportunityCount !== opportunityIds.length || summary.workflowCount !== workflowIds.length)
    throw new Error("replay summary counts do not match identifiers");
  validateBacklinkIngestionCounts(summary, true);
  if (summary.observed > BACKLINK_REPLAY_ID_LIMIT || summary.mergedEvidence > summary.accepted) throw new Error("replay summary counts exceed bounded input");
  return Object.freeze(summary);
}

interface PersistencePlanView {
  prospects: readonly { id: string; clientId: string }[];
  evidence: readonly { prospectId: string; evidence: { id: string; clientId: string } }[];
  opportunities: readonly { id: string; clientId: string; prospectId: string; evidenceIds: readonly string[] }[];
  workflows: readonly { id: string; clientId: string; opportunityId: string }[];
  initialEvents: readonly { id: string; clientId: string; workflowId: string; opportunityId: string }[];
  summary: unknown;
}

export function validateBacklinkPersistencePlan(runId: string, clientId: string, plan: PersistencePlanView): BacklinkIngestionResultSummary {
  if (!clientId.trim() || !/^blrun::[0-9a-f]{32}$/.test(runId)) throw new Error("invalid run or client identity");
  const prospects = new Map(plan.prospects.map(value => { if (value.clientId !== clientId || !value.id.startsWith("blpr::")) throw new Error("cross-tenant or invalid prospect"); return [value.id, value]; }));
  if (prospects.size !== plan.prospects.length) throw new Error("duplicate prospect ID");
  const evidence = new Map(plan.evidence.map(value => { if (value.evidence.clientId !== clientId || !value.evidence.id.startsWith("blev::") || !prospects.has(value.prospectId)) throw new Error("cross-tenant or invalid evidence"); return [value.evidence.id, value]; }));
  if (evidence.size !== plan.evidence.length) throw new Error("duplicate evidence ID");
  const opportunities = new Map(plan.opportunities.map(value => { if (value.clientId !== clientId || !value.id.startsWith("blop::") || !prospects.has(value.prospectId)
      || value.evidenceIds.some(id => !evidence.has(id))) throw new Error("cross-tenant or invalid opportunity"); return [value.id, value]; }));
  if (opportunities.size !== plan.opportunities.length) throw new Error("duplicate opportunity ID");
  const workflows = new Map(plan.workflows.map(value => { if (value.clientId !== clientId || !value.id.startsWith("blwf::") || !opportunities.has(value.opportunityId))
      throw new Error("cross-tenant or invalid workflow"); return [value.id, value]; }));
  if (workflows.size !== plan.workflows.length) throw new Error("duplicate workflow ID");
  const events = new Map(plan.initialEvents.map(value => { const workflow = workflows.get(value.workflowId); if (value.clientId !== clientId || !value.id.startsWith("blwe::")
      || !workflow || !opportunities.has(value.opportunityId) || workflow.opportunityId !== value.opportunityId) throw new Error("cross-tenant or invalid workflow event"); return [value.id, value]; }));
  if (events.size !== plan.initialEvents.length || events.size !== workflows.size) throw new Error("invalid initial event set");
  const candidate = validateStoredBacklinkReplaySummary(plan.summary);
  const derived = { prospectIds: [...prospects.keys()].sort(), evidenceIds: [...evidence.keys()].sort(), opportunityIds: [...opportunities.keys()].sort(), workflowIds: [...workflows.keys()].sort() };
  if (!arrayEquals(candidate.prospectIds, derived.prospectIds) || !arrayEquals(candidate.evidenceIds, derived.evidenceIds)
    || !arrayEquals(candidate.opportunityIds, derived.opportunityIds) || !arrayEquals(candidate.workflowIds, derived.workflowIds)) throw new Error("replay summary identifiers do not match plan");
  if (candidate.mergedEvidence !== evidence.size) throw new Error("merged evidence count does not match plan");
  return Object.freeze({ observed: candidate.observed, accepted: candidate.accepted, rejected: candidate.rejected, mergedEvidence: candidate.mergedEvidence,
    prospectCount: prospects.size, evidenceCount: evidence.size, opportunityCount: opportunities.size, workflowCount: workflows.size,
    prospectIds: Object.freeze(derived.prospectIds), evidenceIds: Object.freeze(derived.evidenceIds), opportunityIds: Object.freeze(derived.opportunityIds), workflowIds: Object.freeze(derived.workflowIds) });
}

const RUN_TRANSITIONS: Readonly<Record<BacklinkIngestionRunStatus, ReadonlySet<BacklinkIngestionRunStatus>>> = Object.freeze({
  running: new Set<BacklinkIngestionRunStatus>(["succeeded", "failed"]),
  succeeded: new Set<BacklinkIngestionRunStatus>(),
  failed: new Set<BacklinkIngestionRunStatus>(["running"]),
});

export const canTransitionBacklinkIngestionRun = (from: BacklinkIngestionRunStatus, to: BacklinkIngestionRunStatus) => RUN_TRANSITIONS[from].has(to);
export function assertBacklinkIngestionRunTransition(from: BacklinkIngestionRunStatus, to: BacklinkIngestionRunStatus): void {
  if (!canTransitionBacklinkIngestionRun(from, to)) throw new Error(`invalid backlink ingestion run transition: ${from} -> ${to}`);
}
export const isTerminalBacklinkIngestionRun = (status: BacklinkIngestionRunStatus) => status === "succeeded";

export const BACKLINK_INGESTION_FAILURE_STAGES: readonly BacklinkIngestionFailureStage[] = Object.freeze([
  "provider", "preparation", "prospect", "evidence", "opportunity", "workflow", "initial_event", "finalization",
]);
export const BACKLINK_INGESTION_FAILURE_CODES: readonly BacklinkIngestionFailureCode[] = Object.freeze([
  "provider_failed", "validation_failed", "persistence_failed", "finalization_failed",
]);

export function validateBacklinkIngestionFailure(stage: unknown, code: unknown): asserts stage is BacklinkIngestionFailureStage {
  if (!BACKLINK_INGESTION_FAILURE_STAGES.includes(stage as BacklinkIngestionFailureStage)
    || !BACKLINK_INGESTION_FAILURE_CODES.includes(code as BacklinkIngestionFailureCode)) throw new Error("invalid ingestion failure classification");
}

export class BacklinkIngestionPersistenceError extends Error {
  constructor(readonly stage: Exclude<BacklinkIngestionFailureStage, "provider" | "preparation">) {
    super("backlink ingestion persistence failed");
    this.name = "BacklinkIngestionPersistenceError";
  }
}
