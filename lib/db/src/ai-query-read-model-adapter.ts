/**
 * C9R-4: Pure adapter — maps persisted AI query scan results to the canonical
 * AiVisibilityReadModel observation + coverage shape.
 *
 * Design:
 * - One coverage diagnostic for the "ai_query" source (always produced).
 * - One observation per query where the business was NOT mentioned (opportunity).
 * - When business IS mentioned, no observation is created (positive outcome).
 * - If no scan results are available, coverage is "not_connected".
 */

import type {
  AiVisibilityAdapterResult,
} from "./ai-visibility-read-model-adapters";
import type {
  AiVisibilityCoverageDiagnostic,
  AiVisibilityNormalizedInput,
} from "./ai-visibility-read-model-types";
import type {
  PersistedAiQueryResult,
  PersistedAiQueryScan,
} from "./ai-query-provider-types";

// ── Score defaults for AI query observations ──────────────────────────────────

const AI_QUERY_POTENTIAL = Object.freeze({
  businessImpact:    85,
  evidenceStrength:  90,
  localImpact:       80,
  servicePriority:   75,
  urgency:           80,
});

const AI_QUERY_ATTAINABILITY = Object.freeze({
  relationshipAccess: 70,
  workflowReadiness:  75,
  effortEase:         60,
  freshness:          90,
  localRelevance:     85,
  serviceRelevance:   80,
});

// ── Adapter input ─────────────────────────────────────────────────────────────

export interface AiQueryAdapterInput {
  /** Latest completed scan for this client, or null if none exists. */
  scan: PersistedAiQueryScan | null;
  /** All results belonging to `scan`. Empty array when scan is null. */
  results: readonly PersistedAiQueryResult[];
  /** Primary geography string (e.g. "Foley, AL"). */
  geography: string;
  /** UUID from the clients table. */
  clientId: string;
  /** ISO timestamp for the observation reference. */
  observedAt: Date;
}

// ── Pure adapter ──────────────────────────────────────────────────────────────

/**
 * Adapt AI query scan results to canonical read-model observations + coverage.
 *
 * Coverage outcomes:
 * - "not_connected"  — no scan has been run yet for this tenant
 * - "available"      — at least one query mentioned the business
 * - "no_observation" — queries ran successfully but no business mentions found
 */
export function adaptAiQuerySources(input: AiQueryAdapterInput): AiVisibilityAdapterResult {
  const { scan, results, geography, clientId, observedAt } = input;

  // ── Case 1: no scan has been run ──────────────────────────────────────────
  if (!scan) {
    const coverage: AiVisibilityCoverageDiagnostic = {
      source: "ai_query",
      status: "not_connected",
      detail: "No AI query scan has been run for this client. Run a scan to detect AI search visibility.",
      observedAt: null,
    };
    return { observations: [], coverage: [coverage] };
  }

  // ── Case 2: scan exists ───────────────────────────────────────────────────
  const successfulResults = results.filter(r => r.success);
  const mentionedResults  = results.filter(r => r.businessMentioned);
  const unmentionedResults = successfulResults.filter(r => !r.businessMentioned);

  const coverageObservedAt = scan.completedAt ?? scan.startedAt;

  // Coverage status
  let status: AiVisibilityCoverageDiagnostic["status"];
  let detail: string;

  if (mentionedResults.length > 0) {
    status = "available";
    detail = `Business mentioned in ${mentionedResults.length} of ${successfulResults.length} AI queries (scan ${scan.provider}/${scan.model}, ${new Date(coverageObservedAt).toLocaleDateString()}).`;
  } else if (successfulResults.length > 0) {
    status = "no_observation";
    detail = `Business not mentioned in any of ${successfulResults.length} AI queries (scan ${scan.provider}/${scan.model}, ${new Date(coverageObservedAt).toLocaleDateString()}).`;
  } else {
    status = "not_connected";
    detail = `All ${results.length} queries failed during scan (${scan.error ?? "unknown error"}).`;
  }

  const coverage: AiVisibilityCoverageDiagnostic = {
    source: "ai_query",
    status,
    detail,
    observedAt: coverageObservedAt,
  };

  // ── Build observations for un-mentioned queries ───────────────────────────
  const observations: AiVisibilityNormalizedInput[] = unmentionedResults.map((r, idx) => {
    const competitorNames = r.competitorMentions.map(c => c.name);
    const competitorSummary = competitorNames.length > 0
      ? `Competitors mentioned: ${competitorNames.join(", ")}.`
      : "No competitors detected in response.";

    const evidence: string[] = [
      `AI query: "${r.query}"`,
      `Provider: ${r.provider} (${r.model})`,
      competitorSummary,
      `Response length: ${r.responseText?.length ?? 0} characters`,
    ];
    if (r.citations.length > 0) {
      evidence.push(`Citations in response: ${r.citations.map(c => c.domain).join(", ")}`);
    }

    return {
      clientId,
      dedupeKey: `ai_query::not_mentioned::${r.query.toLowerCase().replace(/\s+/g, "_")}`,
      category: "measurement",
      serviceId: null,
      geography,
      title: `Not cited by AI for "${r.query}"`,
      whatWasObserved: `Queried ${r.provider} with "${r.query}" — business was not mentioned in the AI response.`,
      whyItMatters: "AI search engines (ChatGPT, Gemini, Claude, Copilot) are an increasingly common first touchpoint for local service discovery. Appearing in AI responses for relevant local queries drives qualified leads.",
      evidence: Object.freeze(evidence),
      references: Object.freeze([{
        source: "ai_query" as const,
        recordType: "ai_query_result",
        recordId: r.id,
        clientId,
        observedAt: r.createdAt,
      }]),
      workflow: {
        kind: "discovery" as const,
        recordId: r.scanId,
        action: "Improve AI citation coverage: add structured data, build citations, optimize GBP.",
      },
      humanApprovalRequired: false,
      lifecycle: null,
      scoreBasis: {
        kind: "weighted" as const,
        potential: AI_QUERY_POTENTIAL,
        attainability: AI_QUERY_ATTAINABILITY,
      },
    };
  });

  return { observations, coverage: [coverage] };
}
