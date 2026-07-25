import {
  AI_VISIBILITY_BOUNDS,
  type AiVisibilityAttainabilityFactors,
  type AiVisibilityCanonicalReference,
  type AiVisibilityCoverageDiagnostic,
  type AiVisibilityNormalizedInput,
  type AiVisibilityPotentialFactors,
  type AiVisibilityReadModel,
  type AiVisibilityRejectedInput,
  type AiVisibilityScoreBasis,
  type AiVisibilityWorkflowDestination,
  type ComposeAiVisibilityReadModelInput,
} from "./ai-visibility-read-model-types";
import { aiVisibilityPriority, scoreAiVisibilityOpportunity } from "./ai-visibility-prioritizer";

export const AI_VISIBILITY_WORKFLOW_PRECEDENCE = Object.freeze({
  backlink: 5,
  discovery: 4,
  local_presence: 3,
  content_autopilot: 2,
  measurement: 1,
} as const);

export const AI_VISIBILITY_DEDUPE_MERGE_POLICY = Object.freeze({
  score: "canonical backlink scores win; otherwise each weighted factor uses the maximum supported observation",
  workflow: "highest canonical workflow precedence wins",
  approval: "required when any merged observation requires approval",
  provenance: "sorted unique canonical references are retained",
});

const fnv1a = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const normalizeText = (value: string): string => value.trim().toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

/** Local-only normalization: harmless punctuation/spacing and Alabama/AL are equivalent. */
export function normalizeAiVisibilityGeography(value: string): string {
  return normalizeText(value).replace(/\balabama\b/g, "al").replace(/\s+/g, " ").trim();
}

const bounded = (value: string, limit: number): string => value.trim().slice(0, limit);
const uniqueSorted = (values: readonly string[], limit = Number.MAX_SAFE_INTEGER): string[] =>
  [...new Set(values.map(value => value.trim()).filter(Boolean))].sort().slice(0, limit);

const referenceKey = (reference: AiVisibilityCanonicalReference): string =>
  `${reference.source}|${reference.recordType}|${reference.recordId}|${reference.clientId}|${reference.observedAt}`;

function sortReferences(references: readonly AiVisibilityCanonicalReference[]): AiVisibilityCanonicalReference[] {
  const byKey = new Map<string, AiVisibilityCanonicalReference>();
  for (const reference of references) byKey.set(referenceKey(reference), { ...reference });
  return [...byKey.values()].sort((a, b) => referenceKey(a).localeCompare(referenceKey(b))).slice(0, AI_VISIBILITY_BOUNDS.references);
}

function stableInputKey(input: AiVisibilityNormalizedInput): string {
  return JSON.stringify({
    clientId: input.clientId,
    dedupeKey: normalizeText(input.dedupeKey),
    category: input.category,
    serviceId: input.serviceId,
    geography: normalizeAiVisibilityGeography(input.geography),
    title: input.title,
    whatWasObserved: input.whatWasObserved,
    whyItMatters: input.whyItMatters,
    evidence: uniqueSorted(input.evidence),
    references: sortReferences(input.references),
    workflow: input.workflow,
    humanApprovalRequired: input.humanApprovalRequired,
    lifecycle: input.lifecycle,
    scoreBasis: input.scoreBasis,
  });
}

function validateInput(
  input: AiVisibilityNormalizedInput,
  scope: ComposeAiVisibilityReadModelInput["scope"],
): AiVisibilityRejectedInput | null {
  const references = sortReferences(input.references);
  const base = { dedupeKey: input.dedupeKey, references };
  if (input.clientId !== scope.clientId || references.some(reference => reference.clientId !== scope.clientId)) {
    return { ...base, code: "tenant_mismatch", reason: "Observation or canonical reference does not belong to the trusted client." };
  }
  if (!input.dedupeKey.trim() || !input.title.trim() || !input.whatWasObserved.trim() || !input.whyItMatters.trim()
    || !input.workflow.recordId.trim() || !input.workflow.action.trim() || references.length === 0
    || references.some(reference => !reference.recordId.trim() || !Number.isFinite(Date.parse(reference.observedAt)))) {
    return { ...base, code: "invalid_input", reason: "Required bounded explanation, workflow, or canonical reference data is missing or invalid." };
  }
  if (input.serviceId !== null && !scope.activeServiceIds.includes(input.serviceId)) {
    return { ...base, code: "unsupported_service", reason: `Service ${input.serviceId} is not supported by the active service registry.` };
  }
  const geography = normalizeAiVisibilityGeography(input.geography);
  const allowed = new Set(scope.authorizedGeographies.map(normalizeAiVisibilityGeography));
  if (!geography || !allowed.has(geography)) {
    return { ...base, code: "outside_authorized_geography", reason: `${input.geography || "Missing geography"} is outside the authorized service geography.` };
  }
  const searchable = normalizeText([input.title, input.whatWasObserved, input.whyItMatters, ...input.evidence].join(" "));
  const prohibited = scope.prohibitedPhrases.map(normalizeText).filter(Boolean).find(phrase => searchable.includes(phrase));
  if (prohibited) {
    return { ...base, code: "prohibited_positioning", reason: `Opportunity contains prohibited positioning: ${prohibited}.` };
  }
  return null;
}

function mergeNumericFactors<T extends object>(values: readonly T[]): T {
  const merged: Record<string, number> = {};
  for (const value of values) {
    for (const [key, component] of Object.entries(value as Record<string, number>)) merged[key] = Math.max(merged[key] ?? 0, component);
  }
  return merged as T;
}

function mergeScoreBasis(inputs: readonly AiVisibilityNormalizedInput[]): AiVisibilityScoreBasis {
  const canonical = inputs.filter(input => input.scoreBasis.kind === "canonical_backlink")
    .sort((a, b) => {
      const aScore = a.scoreBasis.kind === "canonical_backlink" ? a.scoreBasis : { potentialValue: 0, attainability: 0 };
      const bScore = b.scoreBasis.kind === "canonical_backlink" ? b.scoreBasis : { potentialValue: 0, attainability: 0 };
      return bScore.potentialValue - aScore.potentialValue || bScore.attainability - aScore.attainability || stableInputKey(a).localeCompare(stableInputKey(b));
    });
  if (canonical.length) {
    const selected = canonical[0].scoreBasis;
    if (selected.kind !== "canonical_backlink") throw new Error("canonical backlink score selection failed");
    return {
      kind: "canonical_backlink",
      potentialValue: selected.potentialValue,
      attainability: selected.attainability,
    };
  }
  const weighted = inputs.map(input => input.scoreBasis).filter((basis): basis is Extract<AiVisibilityScoreBasis, { kind: "weighted" }> => basis.kind === "weighted");
  return {
    kind: "weighted",
    potential: mergeNumericFactors<AiVisibilityPotentialFactors>(weighted.map(basis => basis.potential)),
    attainability: mergeNumericFactors<AiVisibilityAttainabilityFactors>(weighted.map(basis => basis.attainability)),
  };
}

function chooseWorkflow(inputs: readonly AiVisibilityNormalizedInput[]): AiVisibilityWorkflowDestination {
  return [...inputs].sort((a, b) => {
    const precedence = AI_VISIBILITY_WORKFLOW_PRECEDENCE[b.workflow.kind] - AI_VISIBILITY_WORKFLOW_PRECEDENCE[a.workflow.kind];
    return precedence || stableInputKey(a).localeCompare(stableInputKey(b));
  })[0].workflow;
}

function normalizeCoverage(coverage: readonly AiVisibilityCoverageDiagnostic[]): AiVisibilityCoverageDiagnostic[] {
  const statusOrder = { no_observation: 1, not_connected: 2, unauthorized: 3, provider_error: 4, not_implemented: 5, not_tenant_safe: 6, available: 7 } as const;
  const bySource = new Map<string, AiVisibilityCoverageDiagnostic>();
  for (const item of coverage) {
    const normalized = {
      ...item,
      detail: bounded(item.detail, AI_VISIBILITY_BOUNDS.coverageDetail),
      observedAt: item.observedAt && Number.isFinite(Date.parse(item.observedAt)) ? item.observedAt : null,
    };
    const current = bySource.get(item.source);
    if (!current || statusOrder[normalized.status] > statusOrder[current.status]
      || (statusOrder[normalized.status] === statusOrder[current.status] && normalized.detail.localeCompare(current.detail) < 0)) {
      bySource.set(item.source, normalized);
    }
  }
  return [...bySource.values()].sort((a, b) => a.source.localeCompare(b.source));
}

export function composeAiVisibilityReadModel(input: ComposeAiVisibilityReadModelInput): AiVisibilityReadModel {
  if (!input.scope.clientId.trim()) throw new Error("trusted clientId is required");
  if (!Number.isFinite(input.generatedAt.getTime())) throw new Error("generatedAt must be valid");

  const sorted = [...input.observations].sort((a, b) => stableInputKey(a).localeCompare(stableInputKey(b)));
  const rejected: AiVisibilityRejectedInput[] = [];
  const accepted: AiVisibilityNormalizedInput[] = [];
  for (const observation of sorted) {
    const rejection = validateInput(observation, input.scope);
    if (rejection) rejected.push(rejection);
    else accepted.push(observation);
  }

  const groups = new Map<string, AiVisibilityNormalizedInput[]>();
  for (const observation of accepted) {
    const key = normalizeText(observation.dedupeKey);
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  }

  const recommendations = [...groups.entries()].map(([dedupeKey, group]) => {
    const primary = [...group].sort((a, b) => stableInputKey(a).localeCompare(stableInputKey(b)))[0];
    const score = scoreAiVisibilityOpportunity(mergeScoreBasis(group));
    return {
      id: `aivo::${fnv1a(`${input.scope.clientId}|${dedupeKey}`)}`,
      clientId: input.scope.clientId,
      category: primary.category,
      serviceId: primary.serviceId,
      geography: primary.geography,
      title: bounded(primary.title, AI_VISIBILITY_BOUNDS.title),
      priority: aiVisibilityPriority(score.potentialValue),
      whatWasObserved: uniqueSorted(group.map(item => bounded(item.whatWasObserved, AI_VISIBILITY_BOUNDS.explanation))),
      whyItMatters: uniqueSorted(group.map(item => bounded(item.whyItMatters, AI_VISIBILITY_BOUNDS.explanation))),
      evidence: uniqueSorted(group.flatMap(item => item.evidence.map(value => bounded(value, AI_VISIBILITY_BOUNDS.explanation))), AI_VISIBILITY_BOUNDS.evidenceItems),
      references: sortReferences(group.flatMap(item => item.references)),
      workflow: chooseWorkflow(group),
      humanApprovalRequired: group.some(item => item.humanApprovalRequired),
      lifecycle: group.map(item => item.lifecycle).find((value): value is NonNullable<typeof value> => value !== null) ?? null,
      ...score,
    };
  }).sort((a, b) => b.potentialValue - a.potentialValue || b.attainability - a.attainability || a.id.localeCompare(b.id));

  const coverage = normalizeCoverage(input.coverage);
  const availableSourceCount = coverage.filter(item => item.status === "available").length;
  const generatedAt = input.generatedAt.toISOString();
  return {
    id: `aivrm::${fnv1a(`${input.scope.clientId}|${generatedAt}|${recommendations.map(item => item.id).join("|")}`)}`,
    clientId: input.scope.clientId,
    generatedAt,
    recommendations,
    coverage,
    rejected: rejected.sort((a, b) => a.dedupeKey.localeCompare(b.dedupeKey) || a.code.localeCompare(b.code)),
    summary: {
      recommendationCount: recommendations.length,
      rejectedCount: rejected.length,
      availableSourceCount,
      unavailableSourceCount: coverage.length - availableSourceCount,
    },
  };
}
