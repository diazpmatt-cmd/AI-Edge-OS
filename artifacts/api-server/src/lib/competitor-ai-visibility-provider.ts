/**
 * AI Edge Visibility Provider — P6.2
 *
 * Real CompetitorEnrichmentProvider for category "ai_visibility".
 *
 * Data source: ai_visibility_audits.competitors_json for the client.
 *
 * Verified competitors_json shape (from ai-visibility.ts route + client-onboarding.ts):
 *   Array<{
 *     name:            string   — business name, e.g. "Arrow Exterminators"
 *     reviewGap:       number   — negative = competitor has more reviews
 *     keywordGap:      string   — "High" | "Medium" | "Low"
 *     backlinkGap:     string   — "High" | "Medium" | "Low"
 *     aiGap:           number   — negative = competitor has higher AI presence than client
 *     opportunityScore: number  — 0–100 opportunity for the client
 *   }>
 *
 * IMPORTANT: No domain field exists in competitors_json.
 * Matching is by business name: case-insensitive substring comparison between the
 * stored entry.name and the competitor's businessName (from existingData) or domain slug.
 *
 * Score derivation (P6.2, verified formula):
 *   competitorAiScore ≈ clientAiSearchScore − aiGap
 *   (aiGap is negative when the competitor is ahead, so subtracting a negative adds)
 *   Clamped to [0, 100].
 *   This is an estimate derived from gap analysis, NOT a directly measured value.
 *   Clearly labeled in signals and methodology.
 *
 * Limitation: When no business-name match is found, score is 0 and all
 * AiVisibilityNormalized boolean fields remain null.
 */

import { randomUUID } from "crypto";
import { pool as defaultPool } from "@workspace/db";
import type { CompetitorEnrichmentProvider, EnrichmentInput } from "@workspace/db";
import type { ProviderObservation, AiVisibilityNormalized } from "@workspace/db";

type Pool = typeof defaultPool;

// ── Verified shape of each entry in ai_visibility_audits.competitors_json ────

interface AiAuditEntry {
  name:             string;
  reviewGap:        number;
  keywordGap:       string;
  backlinkGap:      string;
  aiGap:            number;
  opportunityScore: number;
}

// ── Row returned by our audit query ──────────────────────────────────────────

interface AuditRow {
  id:                   string;
  ai_search_score:      number;
  overall_score:        number;
  competitor_gap_score: number;
  competitors_json:     string;
  created_at:           Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalize a business name or domain slug to a minimal token string.
 * Strips TLDs, protocol, www, common business-type words, and punctuation.
 */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\.[a-z]{2,}(\/.*)?$/, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\b(inc|llc|ltd|co|pest|control|exterminators?|exterminating|services?)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true when an entry.name is plausibly the same business as the given
 * competitor. Matches against both businessName (preferred) and domain slug.
 *
 * Strategy: if the normalized tokens share a substring of ≥ 4 characters, it is
 * a likely match. This handles "Arrow Exterminators" ↔ "arrowexterminators.com".
 */
export function isLikelyMatch(
  entryName:    string,
  domain:       string,
  businessName: string | null | undefined,
): boolean {
  const normEntry = normalizeName(entryName);
  if (!normEntry) return false;

  if (businessName) {
    const normBusiness = normalizeName(businessName);
    if (normBusiness && (normEntry.includes(normBusiness) || normBusiness.includes(normEntry))) {
      return true;
    }
  }

  const normDomain = normalizeName(domain);
  if (normDomain && (normEntry.includes(normDomain) || normDomain.includes(normEntry))) {
    return true;
  }

  return false;
}

/**
 * Derive a competitor's estimated AI visibility score from the audit gap data.
 *
 * Formula: competitorScore = clientAiSearchScore − aiGap
 *   aiGap < 0  →  competitor leads the client (subtracting a negative adds the gap)
 *   aiGap = 0  →  tied with client
 *   aiGap > 0  →  client leads (competitor score is lower)
 *
 * Result is clamped to [0, 100].
 *
 * This is an ESTIMATE, not a directly measured value.
 */
export function deriveCompetitorAiScore(clientAiSearchScore: number, aiGap: number): number {
  return Math.max(0, Math.min(100, clientAiSearchScore - aiGap));
}

/**
 * Shared helper: applies the AI Edge Visibility independent-source confidence
 * increment (+5) to an existing confidence score, capped at the system maximum of 70.
 *
 * Called by CompetitorEnrichmentService after a confirmed real match.
 * Exported so the implementation lives in one place — no confidence arithmetic
 * should be duplicated elsewhere.
 */
export function applyAiVisibilityConfidenceBoost(current: number): number {
  return Math.min(70, current + 5);
}

/**
 * Type guard for AiAuditEntry.
 * Ensures we never throw on unexpected shapes in competitors_json.
 */
function isAiAuditEntry(v: unknown): v is AiAuditEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e["name"]             === "string" &&
    typeof e["aiGap"]            === "number" &&
    typeof e["keywordGap"]       === "string" &&
    typeof e["backlinkGap"]      === "string" &&
    typeof e["opportunityScore"] === "number"
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class AiEdgeVisibilityProvider
  implements CompetitorEnrichmentProvider<AiVisibilityNormalized>
{
  readonly providerId  = "ai_edge_visibility";
  readonly displayName = "AI Edge Visibility";
  readonly category    = "ai_visibility" as const;
  readonly active      = true;
  readonly isMock      = false;

  constructor(private readonly pool: Pool) {}

  /**
   * Outer enrich wraps the inner logic so all unexpected throws are caught.
   * The provider contract requires this never propagates to the caller.
   */
  async enrich(
    input: EnrichmentInput,
  ): Promise<ProviderObservation<AiVisibilityNormalized>> {
    try {
      return await this.doEnrich(input);
    } catch (err) {
      console.error("[ai-edge-visibility-provider] unexpected error:", err);
      return this.sparseObservation(input, null, "Provider error during enrichment");
    }
  }

  // ── Private implementation ─────────────────────────────────────────────────

  private async doEnrich(
    input: EnrichmentInput,
  ): Promise<ProviderObservation<AiVisibilityNormalized>> {
    const { clientId, domain } = input;
    const businessName =
      typeof input.existingData["businessName"] === "string"
        ? input.existingData["businessName"]
        : null;

    // ── Query most recent audit for this client ──────────────────────────────
    const res = await this.pool.query<AuditRow>(
      `SELECT id, ai_search_score, overall_score, competitor_gap_score,
              competitors_json, created_at
       FROM ai_visibility_audits
       WHERE client_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [clientId],
    );

    if (!res.rows.length) {
      return this.sparseObservation(input, null, "No AI visibility audit found for this client");
    }

    const audit = res.rows[0]!;
    const observedAt = audit.created_at;

    // ── Parse competitors_json safely ────────────────────────────────────────
    let entries: unknown[];
    try {
      const raw = JSON.parse(audit.competitors_json ?? "[]");
      entries = Array.isArray(raw) ? raw : [];
    } catch {
      return this.sparseObservation(input, observedAt, "competitors_json is malformed");
    }

    // ── Find matching competitor entry ───────────────────────────────────────
    const match = entries.find(
      (e): e is AiAuditEntry =>
        isAiAuditEntry(e) && isLikelyMatch(e.name, domain, businessName),
    );

    if (!match) {
      return this.sparseObservation(
        input,
        observedAt,
        "Competitor domain not found in AI visibility audit",
      );
    }

    // ── Derive score ─────────────────────────────────────────────────────────
    const derivedScore = deriveCompetitorAiScore(audit.ai_search_score, match.aiGap);
    const ageDays = Math.round(
      (Date.now() - observedAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    const gapLabel =
      match.aiGap < 0
        ? `competitor leads by ${Math.abs(match.aiGap)} pts`
        : match.aiGap > 0
        ? `client leads by ${match.aiGap} pts`
        : "tied with client";

    const normalized: AiVisibilityNormalized = {
      score:                derivedScore,
      appearsInAiAnswers:   null,
      aiAnswerFrequency:    null,
      featuredInLocalPacks: null,
      schemaMarkupPresent:  null,
      signals: [
        `AI visibility: ~${derivedScore}/100 (estimated from gap analysis)`,
        `AI gap vs client: ${gapLabel}`,
        `Keyword gap tier: ${match.keywordGap}`,
        `Backlink gap tier: ${match.backlinkGap}`,
        `Opportunity score: ${match.opportunityScore}`,
      ],
    };

    return {
      id:           randomUUID(),
      clientId:     input.clientId,
      competitorId: input.competitorId,
      domain:       input.domain,
      category:     "ai_visibility",
      providerId:   this.providerId,
      observedAt,
      confidence:   60,
      sourceUrl:    null,
      rawObservation: {
        auditId:             audit.id,
        matchedName:         match.name,
        aiGap:               match.aiGap,
        keywordGap:          match.keywordGap,
        backlinkGap:         match.backlinkGap,
        opportunityScore:    match.opportunityScore,
        clientAiSearchScore: audit.ai_search_score,
        derivedScore,
        hasMatch:            true,
      },
      normalizedObservation: normalized,
      attribution: {
        providerName:      "AI Edge Visibility",
        providerVersion:   "1.0.0",
        methodology:       "gap_derived_estimate",
        dataFreshnessDays: ageDays,
      },
      isMock: false,
    };
  }

  private sparseObservation(
    input:     EnrichmentInput,
    observedAt: Date | null,
    reason:    string,
  ): ProviderObservation<AiVisibilityNormalized> {
    return {
      id:           randomUUID(),
      clientId:     input.clientId,
      competitorId: input.competitorId,
      domain:       input.domain,
      category:     "ai_visibility",
      providerId:   this.providerId,
      observedAt:   observedAt ?? new Date(),
      confidence:   20,
      sourceUrl:    null,
      rawObservation: {
        hasMatch:     false,
        reason,
        derivedScore: null,
      },
      normalizedObservation: {
        score:                0,
        appearsInAiAnswers:   null,
        aiAnswerFrequency:    null,
        featuredInLocalPacks: null,
        schemaMarkupPresent:  null,
        signals:              [`No AI visibility data available: ${reason}`],
      },
      attribution: {
        providerName:      "AI Edge Visibility",
        providerVersion:   "1.0.0",
        methodology:       "gap_derived_estimate",
        dataFreshnessDays: null,
      },
      isMock: false,
    };
  }
}
