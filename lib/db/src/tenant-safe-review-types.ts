/**
 * C9R-6: Tenant-safe review intelligence types.
 *
 * Defines the ReviewImportResult discriminated union used by the GBP Review
 * Summary Importer to communicate rich outcome state back to the execution
 * service, and the V1 target-review-count policy.
 */

// ── V1 Target Review Count Policy ────────────────────────────────────────────
//
// V1 policy: no universal benchmark is assumed. The target is null unless
// explicitly configured for the tenant. Recommendations that depend on a
// review gap (actual vs. target) are only generated when a non-null target
// exists. Returning null for an unknown target is preferable to inventing an
// unsupported industry figure.
//
// Future phases may set a per-client configured target, or derive one from
// market data. For V1, the function always returns null.

/**
 * Returns the V1 target review count for a given client.
 * Returns null when no defensible target is available.
 * Pure function — no I/O, no side effects.
 */
export function computeTargetReviewCount(_clientId: string): number | null {
  return null;
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
  /** Null when no defensible target is available for V1. */
  targetReviewCount: number | null;
  observedAt: Date;
  geography: string;
  /** The GBP social connection id that authorized this import. */
  sourceConnectionId?: string;
}

// ── Repository interface ──────────────────────────────────────────────────────

export interface TenantSafeReviewRepository {
  /** Upsert a review summary for (clientId, platform, geography). */
  upsert(row: ReviewImportSummary): Promise<ReviewImportSummary>;
  /** Return all persisted summaries for a client, ordered by observedAt DESC. */
  findByClientId(clientId: string): Promise<ReviewImportSummary[]>;
}
