/**
 * C9R-6: Tenant-safe review intelligence types.
 *
 * Defines the ReviewImportResult discriminated union used by the GBP Review
 * Summary Importer to communicate rich outcome state back to the execution
 * service, and the V1 target-review-count policy.
 */

// ── V1 Target Review Count Policy ────────────────────────────────────────────
//
// V1 policy: a minimum of 50 verified reviews is the baseline target for a
// local service business with a Google Business Profile. This threshold is
// appropriate for a primary service market and is intentionally conservative
// so clients see a motivating gap without an unreachable ceiling.
//
// Future phases may derive per-category or per-geography targets from market
// benchmarks; today the constant is the single source of truth.

export const TENANT_SAFE_REVIEW_TARGET_COUNT_V1 = 50;

/**
 * Returns the V1 target review count for a given client.
 * Pure function — no I/O, no side effects.
 */
export function computeTargetReviewCount(_clientId: string): number {
  return TENANT_SAFE_REVIEW_TARGET_COUNT_V1;
}

// ── ReviewImportInput ─────────────────────────────────────────────────────────

export interface ReviewImportInput {
  /** UUID from the clients table. */
  clientId: string;
  /** Clerk userId — used to look up the GBP social connection. */
  userId: string;
  /** Primary geography string derived from the AI Visibility authorized scope. */
  geography: string;
}

// ── ReviewImportResult ────────────────────────────────────────────────────────
//
// Returned by GbpReviewSummaryImporter.importForClient(). The execution service
// maps this to an AiVisibilityAdapterResult via adaptReviewImportResult().

export type ReviewImportResult =
  | {
      kind: "available";
      summaries: ReviewImportSummary[];
    }
  | {
      kind: "no_observation";
      reason: string;
    }
  | {
      kind: "disconnected";
      reason: string;
    }
  | {
      kind: "unauthorized";
      reason: string;
    }
  | {
      kind: "provider_error";
      error: string;
    };

export interface ReviewImportSummary {
  id: string;
  clientId: string;
  platform: string;
  reviewCount: number;
  averageRating: number;
  targetReviewCount: number;
  observedAt: Date;
  geography: string;
}

// ── Repository interface ──────────────────────────────────────────────────────

export interface TenantSafeReviewRepository {
  /** Upsert a review summary for (clientId, platform, geography). */
  upsert(row: ReviewImportSummary): Promise<ReviewImportSummary>;
  /** Return all persisted summaries for a client, ordered by observedAt DESC. */
  findByClientId(clientId: string): Promise<ReviewImportSummary[]>;
}
