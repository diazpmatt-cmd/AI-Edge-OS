/**
 * Phase C5 — Provider Cost Ledger
 *
 * In-memory accumulation of provider cost records during a discovery run.
 * Records estimated and actual costs, request counts, retry counts, and error
 * kinds per provider × capability × run.
 *
 * Persistence:
 *   bootstrapCostTable(pool) — creates discovery_provider_costs idempotently.
 *   saveCostRecords(records, pool) — writes records; idempotent on PK conflict.
 *
 * Rules:
 *   - Record IDs are deterministic (no Math.random()): cost::{runId}::{provider}::{capability}::{attempt}
 *   - clientId is embedded in every record — tenant isolation enforced.
 *   - actualCostUSD may be null (provider does not always return a billing figure).
 *   - Never stores credentials, auth headers, or any secret material.
 *   - No BB&B-specific values. No live API calls in tests.
 */

import type pg from "pg";
import type { ProviderSource } from "./discovery-types";
import type { ProviderCapability } from "./discovery-capability";
import type { DataForSEOErrorKind } from "./dataforseo-config";

type Pool = InstanceType<(typeof pg)["Pool"]>;

// ── Record type ────────────────────────────────────────────────────────────────

export interface ProviderCostRecord {
  /**
   * Deterministic PK: "cost::{runId}::{provider}::{capability}::{attempt}"
   * Idempotent: ON CONFLICT DO NOTHING on insert.
   */
  id:               string;
  runId:            string;
  clientId:         string;
  provider:         ProviderSource;
  capability:       ProviderCapability;
  /** API endpoint or operation class, e.g. "keywords_data/search_volume/live". */
  endpoint:         string;
  estimatedCostUSD: number;
  /** null when the provider does not report a billing figure. */
  actualCostUSD:    number | null;
  requestCount:     number;
  retryCount:       number;
  success:          boolean;
  /** null on success. */
  errorKind:        DataForSEOErrorKind | null;
  recordedAt:       Date;
}

// ── ID derivation ─────────────────────────────────────────────────────────────

/**
 * Derive a deterministic, tenant-scoped cost record ID.
 * Idempotent: same inputs always produce the same ID.
 */
export function deriveCostRecordId(
  runId:      string,
  provider:   string,
  capability: string,
  attempt:    number,
): string {
  return `cost::${runId}::${provider}::${capability}::${attempt}`;
}

// ── In-memory accumulator ─────────────────────────────────────────────────────

/**
 * In-memory cost accumulator for a single discovery run.
 * Instantiate once per run. Call record() after each provider call.
 * Call toReport() to build the response diagnostics block.
 */
export class CostLedger {
  private readonly _records: ProviderCostRecord[] = [];

  record(rec: ProviderCostRecord): void {
    this._records.push(rec);
  }

  getRecords(): readonly ProviderCostRecord[] {
    return this._records;
  }

  totalEstimatedUSD(): number {
    return this._records.reduce((sum, r) => sum + r.estimatedCostUSD, 0);
  }

  totalActualUSD(): number {
    return this._records.reduce(
      (sum, r) => sum + (r.actualCostUSD ?? r.estimatedCostUSD),
      0,
    );
  }

  toReport(): {
    totalEstimatedUSD: number;
    totalActualUSD:    number;
    recordCount:       number;
    byProvider:        Record<string, { estimatedUSD: number; requestCount: number; success: boolean }>;
  } {
    const byProvider: Record<string, { estimatedUSD: number; requestCount: number; success: boolean }> = {};

    for (const r of this._records) {
      const key   = String(r.provider);
      const entry = byProvider[key] ?? { estimatedUSD: 0, requestCount: 0, success: true };
      entry.estimatedUSD += r.estimatedCostUSD;
      entry.requestCount += r.requestCount;
      entry.success       = entry.success && r.success;
      byProvider[key]     = entry;
    }

    return {
      totalEstimatedUSD: Math.round(this.totalEstimatedUSD() * 1_000_000) / 1_000_000,
      totalActualUSD:    Math.round(this.totalActualUSD()    * 1_000_000) / 1_000_000,
      recordCount:       this._records.length,
      byProvider,
    };
  }
}

// ── Table bootstrap ───────────────────────────────────────────────────────────

/**
 * Idempotent raw-SQL bootstrap for discovery_provider_costs.
 * Safe to call on every server start: CREATE TABLE IF NOT EXISTS.
 * Uses raw SQL (not drizzle push) to avoid conflicts with existing schema.
 *
 * Call from the API server's bootstrap sequence alongside bootstrapDiscoveryTables.
 */
export async function bootstrapCostTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS discovery_provider_costs (
      id                 TEXT             PRIMARY KEY,
      run_id             TEXT             NOT NULL,
      client_id          TEXT             NOT NULL,
      provider           TEXT             NOT NULL,
      capability         TEXT             NOT NULL,
      endpoint           TEXT             NOT NULL,
      estimated_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
      actual_cost_usd    DOUBLE PRECISION,
      request_count      INTEGER          NOT NULL DEFAULT 0,
      retry_count        INTEGER          NOT NULL DEFAULT 0,
      success            BOOLEAN          NOT NULL,
      error_kind         TEXT,
      recorded_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_disc_costs_run_client
      ON discovery_provider_costs (run_id, client_id)
  `);
}

// ── Persistence ───────────────────────────────────────────────────────────────

/**
 * Persist a set of cost records to discovery_provider_costs.
 * Idempotent: ON CONFLICT (id) DO NOTHING.
 * clientId is stored with every row — never writes cross-tenant records.
 * Call after a live run completes (not during dry-run mode).
 */
export async function saveCostRecords(
  records: readonly ProviderCostRecord[],
  pool:    Pool,
): Promise<void> {
  if (records.length === 0) return;

  for (const r of records) {
    await pool.query(
      `INSERT INTO discovery_provider_costs
         (id, run_id, client_id, provider, capability, endpoint,
          estimated_cost_usd, actual_cost_usd,
          request_count, retry_count, success, error_kind, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO NOTHING`,
      [
        r.id,
        r.runId,
        r.clientId,
        String(r.provider),
        String(r.capability),
        r.endpoint,
        r.estimatedCostUSD,
        r.actualCostUSD,
        r.requestCount,
        r.retryCount,
        r.success,
        r.errorKind,
        r.recordedAt,
      ],
    );
  }
}
