import type { DataForSEOBacklinkConfig } from "@workspace/db";
import type { AuthorityScheduledExecutionPlan } from "./authority-scheduled-execution-plan.js";

/**
 * Official DataForSEO Backlinks API pricing re-verified on 2026-08-14.
 * Source of truth at verification time: DataForSEO Backlinks API pricing page.
 * July 1, 2026 pricing update moved the API to the current pay-as-you-go rates.
 *
 * This is deliberately time-bounded. A stale pricing contract fails closed and
 * must be re-verified before any one-shot proof can be armed.
 */
export const DATAFORSEO_BACKLINKS_PROOF_PRICING = Object.freeze({
  providerId: "dataforseo_backlinks" as const,
  verifiedAt: "2026-08-14T13:30:00.000Z",
  reviewAfterMs: 30 * 24 * 60 * 60 * 1000,
  pricePerRequestUsd: 0.024,
  pricePerRowUsd: 0.000036,
  providerMaxRowsPerRequest: 1000,
  source: "dataforseo_official_backlinks_pricing_2026-08-14",
});

/** The current adapter's referring_domains pass hard-caps a single request at 200 rows. */
export const AUTHORITY_PROOF_DATAFORSEO_PROVIDER_ROW_CEILING = 200;
/** The first proof may issue exactly one HTTP attempt; retryable 5xx errors must not trigger a second billable attempt. */
export const AUTHORITY_PROOF_DATAFORSEO_HTTP_ATTEMPTS = 1;

export type AuthorityProofDerivedCostEstimate =
  | {
      readonly available: true;
      readonly estimatedCostUsd: number;
      readonly source: string;
      readonly providerRequestRows: number;
      readonly httpAttemptCount: 1;
      readonly pricingVerifiedAt: string;
    }
  | {
      readonly available: false;
      readonly reason:
        | "provider_not_allowlisted"
        | "pricing_contract_stale"
        | "result_limit_invalid"
        | "provider_row_limit_invalid";
    };

function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}

/**
 * Derive a worst-case billable estimate for the first DataForSEO request that
 * the current adapter would make. For a canonical result limit of 50, the
 * adapter asks referring_domains/live for up to min(200, 50 * 4) = 200 rows.
 * We therefore price 200 provider rows, not merely the 50 rows retained after
 * normalization/deduplication.
 */
export function deriveAuthorityProofCostEstimate(
  plan: AuthorityScheduledExecutionPlan,
  now = new Date(),
): AuthorityProofDerivedCostEstimate {
  if (plan.providerId !== DATAFORSEO_BACKLINKS_PROOF_PRICING.providerId) {
    return Object.freeze({ available: false, reason: "provider_not_allowlisted" });
  }

  const verifiedAtMs = Date.parse(DATAFORSEO_BACKLINKS_PROOF_PRICING.verifiedAt);
  if (!Number.isFinite(verifiedAtMs) || now.getTime() > verifiedAtMs + DATAFORSEO_BACKLINKS_PROOF_PRICING.reviewAfterMs) {
    return Object.freeze({ available: false, reason: "pricing_contract_stale" });
  }

  const resultLimit = plan.discovery.limit;
  if (!Number.isInteger(resultLimit) || resultLimit < 1 || resultLimit > 50) {
    return Object.freeze({ available: false, reason: "result_limit_invalid" });
  }

  const providerRequestRows = Math.min(
    AUTHORITY_PROOF_DATAFORSEO_PROVIDER_ROW_CEILING,
    resultLimit * 4,
  );
  if (
    !Number.isInteger(providerRequestRows) ||
    providerRequestRows < 1 ||
    providerRequestRows > DATAFORSEO_BACKLINKS_PROOF_PRICING.providerMaxRowsPerRequest
  ) {
    return Object.freeze({ available: false, reason: "provider_row_limit_invalid" });
  }

  const estimatedCostUsd = roundUsd(
    DATAFORSEO_BACKLINKS_PROOF_PRICING.pricePerRequestUsd +
      DATAFORSEO_BACKLINKS_PROOF_PRICING.pricePerRowUsd * providerRequestRows,
  );

  return Object.freeze({
    available: true,
    estimatedCostUsd,
    source: DATAFORSEO_BACKLINKS_PROOF_PRICING.source,
    providerRequestRows,
    httpAttemptCount: AUTHORITY_PROOF_DATAFORSEO_HTTP_ATTEMPTS,
    pricingVerifiedAt: DATAFORSEO_BACKLINKS_PROOF_PRICING.verifiedAt,
  });
}

/**
 * Build the exact provider config eligible for a future one-shot proof.
 * This does not execute anything and does not alter credentials or global env.
 * It makes the proof stricter than recurring/default provider behavior:
 * exactly one logical request and exactly one HTTP attempt.
 */
export function buildAuthorityProofDataForSEOConfig(
  base: DataForSEOBacklinkConfig,
): DataForSEOBacklinkConfig {
  return Object.freeze({
    ...base,
    maxRequestsPerRun: 1,
    retry: Object.freeze({
      ...base.retry,
      maxAttempts: AUTHORITY_PROOF_DATAFORSEO_HTTP_ATTEMPTS,
    }),
  });
}
