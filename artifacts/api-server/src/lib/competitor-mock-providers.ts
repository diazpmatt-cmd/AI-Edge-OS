/**
 * Competitor Mock Providers — Phase 5
 *
 * Five deterministic mock implementations of CompetitorEnrichmentProvider,
 * one per ObservationCategory. All produce is_mock=true observations so the
 * UI can clearly label them as demo data.
 *
 * Determinism guarantee: the same (domain, salt) pair always returns the same
 * integer/boolean value, so test assertions can be written against stable
 * expected values and UI scores don't flicker between page loads.
 *
 * When live providers are introduced they simply implement the same interface
 * and register themselves in the provider registry — no dashboard changes needed.
 */

import { randomUUID } from "crypto";
import type { CompetitorEnrichmentProvider, EnrichmentInput } from "@workspace/db";
import type {
  ProviderObservation,
  ObservationAttribution,
  WebsiteIntelNormalized,
  LocalPresenceNormalized,
  ReviewsNormalized,
  AuthorityNormalized,
  AiVisibilityNormalized,
} from "@workspace/db";

// ── Deterministic seeding helpers ─────────────────────────────────────────────

/** djb2 hash — always returns a value in [0, 2^31 - 1]. */
function strHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff;
  }
  return Math.abs(h);
}

/**
 * Deterministic integer in [min, max] (inclusive) for a given (domain, salt).
 * Different salts produce independent pseudo-random values for the same domain.
 */
export function seededInt(
  domain: string,
  salt: number,
  min: number,
  max: number,
): number {
  const range = max - min + 1;
  return min + (strHash(domain + ":" + salt) % range);
}

/** Deterministic boolean for (domain, salt). */
export function seededBool(domain: string, salt: number): boolean {
  return strHash(domain + ":" + salt) % 2 === 0;
}

/** Deterministic 0–100 score biased toward 20–95 (realistic range). */
function seededScore(domain: string, salt: number): number {
  return seededInt(domain, salt, 20, 95);
}

// ── Observation builder ───────────────────────────────────────────────────────

function buildObs<T>(
  input: EnrichmentInput,
  category: string,
  providerId: string,
  confidence: number,
  sourceUrl: string | null,
  normalized: T,
  raw: Record<string, unknown>,
  attribution: ObservationAttribution,
): ProviderObservation<T> {
  return {
    id:                    randomUUID(),
    clientId:              input.clientId,
    competitorId:          input.competitorId,
    domain:                input.domain,
    category:              category as never,
    providerId,
    observedAt:            new Date(),
    confidence,
    sourceUrl,
    rawObservation:        raw,
    normalizedObservation: normalized,
    attribution,
    isMock:                true,
  };
}

// ── 1. Website Intel ──────────────────────────────────────────────────────────

export class MockWebsiteIntelProvider
  implements CompetitorEnrichmentProvider<WebsiteIntelNormalized>
{
  readonly providerId  = "mock_website_intel";
  readonly displayName = "Website Intel (Mock)";
  readonly category    = "website_intel" as const;
  readonly active      = true;
  readonly isMock      = true;

  async enrich(
    input: EnrichmentInput,
  ): Promise<ProviderObservation<WebsiteIntelNormalized>> {
    const d = input.domain;
    const score           = seededScore(d, 1);
    const pageCount       = seededInt(d, 2, 10, 200);
    const hasBlog         = seededBool(d, 3);
    const hasServicePages = seededBool(d, 4);
    const freshnessDays   = seededInt(d, 5, 3, 90);
    const gradeIdx        = seededInt(d, 6, 0, 2);
    const grades          = ["good", "needs_improvement", "poor"] as const;
    const grade           = grades[gradeIdx];

    const normalized: WebsiteIntelNormalized = {
      score,
      pageCount,
      hasBlog,
      hasServicePages,
      contentFreshnessDays: freshnessDays,
      coreWebVitalsGrade:   grade ?? null,
      signals: [
        `${pageCount} pages indexed`,
        hasBlog ? "Active blog detected" : "No blog found",
        hasServicePages ? "Service pages present" : "Service pages missing",
        `Content freshness: ~${freshnessDays}d old`,
        `Core Web Vitals: ${(grade ?? "unknown").replace(/_/g, " ")}`,
      ],
    };

    return buildObs(
      input, "website_intel", this.providerId, 65, null, normalized,
      { raw_score: score, page_count: pageCount },
      { providerName: "Mock Website Intel", providerVersion: "1.0.0",
        methodology: "mock", dataFreshnessDays: null },
    );
  }
}

// ── 2. Local Presence ─────────────────────────────────────────────────────────

export class MockLocalPresenceProvider
  implements CompetitorEnrichmentProvider<LocalPresenceNormalized>
{
  readonly providerId  = "mock_local_presence";
  readonly displayName = "Local Presence (Mock)";
  readonly category    = "local_presence" as const;
  readonly active      = true;
  readonly isMock      = true;

  async enrich(
    input: EnrichmentInput,
  ): Promise<ProviderObservation<LocalPresenceNormalized>> {
    const d = input.domain;
    const score         = seededScore(d, 10);
    const gbpVerified   = seededBool(d, 11);
    const citationCount = seededInt(d, 12, 5, 150);
    const napScore      = seededInt(d, 13, 40, 100);
    const dirCount      = seededInt(d, 14, 2, 7);
    const allDirs       = ["Yelp", "BBB", "Angi", "HomeAdvisor", "Nextdoor", "Google", "Thumbtack", "Houzz"];
    const dirs          = allDirs.slice(0, dirCount);

    const normalized: LocalPresenceNormalized = {
      score,
      gbpVerified,
      citationCount,
      napConsistencyScore:     napScore,
      localDirectoriesPresent: dirs,
      signals: [
        gbpVerified ? "GBP verified" : "GBP not verified",
        `${citationCount} citations found`,
        `NAP consistency ${napScore}/100`,
        `Listed: ${dirs.slice(0, 3).join(", ")}${dirs.length > 3 ? ` +${dirs.length - 3}` : ""}`,
      ],
    };

    return buildObs(
      input, "local_presence", this.providerId, 60, null, normalized,
      { raw_score: score, citation_count: citationCount },
      { providerName: "Mock Local Presence", providerVersion: "1.0.0",
        methodology: "mock", dataFreshnessDays: null },
    );
  }
}

// ── 3. Reviews ────────────────────────────────────────────────────────────────

export class MockReviewsProvider
  implements CompetitorEnrichmentProvider<ReviewsNormalized>
{
  readonly providerId  = "mock_reviews";
  readonly displayName = "Reviews (Mock)";
  readonly category    = "reviews" as const;
  readonly active      = true;
  readonly isMock      = true;

  async enrich(
    input: EnrichmentInput,
  ): Promise<ProviderObservation<ReviewsNormalized>> {
    const d = input.domain;
    const score     = seededScore(d, 20);
    const count     = seededInt(d, 21, 20, 800);
    const ratingRaw = seededInt(d, 22, 32, 50); // 3.2–5.0 × 10
    const rating    = ratingRaw / 10;
    const velocity  = seededInt(d, 23, 1, 20) / 10; // 0.1–2.0/month
    const sentiment = seededInt(d, 24, 50, 95);

    const normalized: ReviewsNormalized = {
      score,
      reviewCount:            count,
      avgRating:              rating,
      reviewVelocityPerMonth: velocity,
      sentimentScore:         sentiment,
      platformBreakdown: [
        { platform: "Google", count: Math.round(count * 0.65), rating },
        { platform: "Yelp",   count: Math.round(count * 0.20), rating: Math.max(1, rating - 0.3) },
        { platform: "BBB",    count: Math.round(count * 0.15), rating: null },
      ],
      signals: [
        `${count} reviews across platforms`,
        `${rating.toFixed(1)}★ average rating`,
        `~${velocity.toFixed(1)} new reviews/month`,
        `Sentiment score ${sentiment}/100`,
      ],
    };

    return buildObs(
      input, "reviews", this.providerId, 70, null, normalized,
      { raw_score: score, review_count: count, avg_rating: rating },
      { providerName: "Mock Reviews", providerVersion: "1.0.0",
        methodology: "mock", dataFreshnessDays: null },
    );
  }
}

// ── 4. Authority ──────────────────────────────────────────────────────────────

export class MockAuthorityProvider
  implements CompetitorEnrichmentProvider<AuthorityNormalized>
{
  readonly providerId  = "mock_authority";
  readonly displayName = "Authority (Mock)";
  readonly category    = "authority" as const;
  readonly active      = true;
  readonly isMock      = true;

  async enrich(
    input: EnrichmentInput,
  ): Promise<ProviderObservation<AuthorityNormalized>> {
    const d = input.domain;
    const score          = seededScore(d, 30);
    const domainAuth     = seededInt(d, 31, 10, 65);
    const backlinks      = seededInt(d, 32, 50, 5000);
    const referringDoms  = seededInt(d, 33, 10, 500);
    const trustFlow      = seededInt(d, 34, 5, 60);

    const normalized: AuthorityNormalized = {
      score,
      domainAuthority:  domainAuth,
      backlinkCount:    backlinks,
      referringDomains: referringDoms,
      trustFlow,
      signals: [
        `Domain Authority ${domainAuth}`,
        `${backlinks.toLocaleString()} backlinks`,
        `${referringDoms} referring domains`,
        `Trust Flow ${trustFlow}`,
      ],
    };

    return buildObs(
      input, "authority", this.providerId, 60, null, normalized,
      { raw_score: score, domain_authority: domainAuth, backlink_count: backlinks },
      { providerName: "Mock Authority", providerVersion: "1.0.0",
        methodology: "mock", dataFreshnessDays: null },
    );
  }
}

// ── 5. AI Visibility ──────────────────────────────────────────────────────────

export class MockAiVisibilityProvider
  implements CompetitorEnrichmentProvider<AiVisibilityNormalized>
{
  readonly providerId  = "mock_ai_visibility";
  readonly displayName = "AI Visibility (Mock)";
  readonly category    = "ai_visibility" as const;
  readonly active      = true;
  readonly isMock      = true;

  async enrich(
    input: EnrichmentInput,
  ): Promise<ProviderObservation<AiVisibilityNormalized>> {
    const d = input.domain;
    const score         = seededScore(d, 40);
    const appearsInAI   = seededBool(d, 41);
    const aiFreq        = seededInt(d, 42, 5, 80);
    const localPacks    = seededBool(d, 43);
    const schemaPresent = seededBool(d, 44);

    const normalized: AiVisibilityNormalized = {
      score,
      appearsInAiAnswers:   appearsInAI,
      aiAnswerFrequency:    aiFreq,
      featuredInLocalPacks: localPacks,
      schemaMarkupPresent:  schemaPresent,
      signals: [
        appearsInAI ? "Appears in AI-generated answers" : "Not found in AI answers",
        `AI answer frequency ${aiFreq}%`,
        localPacks ? "Featured in local packs" : "Not in local packs",
        schemaPresent ? "Structured data detected" : "No schema markup found",
      ],
    };

    return buildObs(
      input, "ai_visibility", this.providerId, 55, null, normalized,
      { raw_score: score, appears_in_ai_answers: appearsInAI, ai_frequency: aiFreq },
      { providerName: "Mock AI Visibility", providerVersion: "1.0.0",
        methodology: "mock", dataFreshnessDays: null },
    );
  }
}

// ── Exported provider set ─────────────────────────────────────────────────────

export const ALL_MOCK_PROVIDERS = [
  new MockWebsiteIntelProvider(),
  new MockLocalPresenceProvider(),
  new MockReviewsProvider(),
  new MockAuthorityProvider(),
  new MockAiVisibilityProvider(),
] as const;
