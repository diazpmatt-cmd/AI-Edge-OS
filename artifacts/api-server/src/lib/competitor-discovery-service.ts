/**
 * Competitor Discovery Service — Phase 3A
 *
 * Reads the most recent discovery snapshot for a tenant, maps every signal
 * that carries competitor domain data into NormalizedCompetitor entities,
 * deduplicates by domain, and upserts them into the competitors table.
 *
 * Rules:
 * - NEVER creates new provider integrations or API calls.
 * - NEVER modifies the discovery pipeline.
 * - Uses ONLY existing discovery_signals rows as input.
 * - Fails independently — caller must fire-and-forget or handle errors.
 * - Tenant-isolated: every query is scoped to (client_id).
 *
 * Phase 3D — Provenance:
 * Every upserted entity carries discoveredProvider="dataforseo_serp",
 * providerMetadata={snapshotId, keyword}, firstSeenAt, lastSeenAt, and
 * confidenceScore=10 (SERP-only baseline). Future engines raise the score.
 */

import {
  pool    as defaultPool,
  db      as defaultDb,
  extractCompetitorsFromSignals,
  DrizzleCompetitorRepository,
} from "@workspace/db";
import type { SignalRow } from "@workspace/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExtractionResult {
  clientId:        string;
  snapshotId:      string | null;
  extracted:       number;    // competitor signals found in signals table
  inserted:        number;    // net new rows created in competitors table
  updated:         number;    // existing rows updated (upsert hit)
  skipped:         number;    // signals that yielded no usable domain
  duplicateGroups: number;    // domain groups merged during dedup
  processingTimeMs: number;
}

// ── DB type aliases ───────────────────────────────────────────────────────────
type Pool    = typeof defaultPool;
type Db      = typeof defaultDb;

// ── Signal query row from DB ──────────────────────────────────────────────────
interface RawSignalRow {
  id:                string;
  snapshot_id:       string;
  client_id:         string;
  signal_type:       string;
  normalized_value:  string;
  competitor_rank:   number | null;
  raw_provider_data: Record<string, unknown>;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CompetitorDiscoveryService {
  private readonly pool: Pool;
  private readonly db:   Db;

  constructor(p?: Pool, d?: Db) {
    this.pool = p ?? defaultPool;
    this.db   = d ?? defaultDb;
  }

  /**
   * Extract competitor entities from the most recent discovery run for a client.
   *
   * Phase 3E — Duplicate resolution:
   * normalizeDomain() strips protocol, www, trailing slash before dedup.
   * "www.abcpest.com", "https://abcpest.com/", "abcpest.com" all → "abcpest.com".
   *
   * Phase 3D — Provenance:
   * discoveredProvider is always set so upsertMany() can merge provider arrays.
   * firstSeenAt is preserved by COALESCE on conflict — never overwritten.
   */
  async extractCompetitorsFromLatestRun(clientId: string): Promise<ExtractionResult> {
    const startedAt = Date.now();

    // ── Step 1: Resolve latest completed snapshot ─────────────────────────────
    const snapRes = await this.pool.query<{ id: string }>(
      `SELECT id FROM discovery_snapshots
       WHERE client_id = $1 AND status IN ('complete', 'partial')
       ORDER BY created_at DESC LIMIT 1`,
      [clientId],
    );

    if (snapRes.rows.length === 0) {
      return {
        clientId, snapshotId: null,
        extracted: 0, inserted: 0, updated: 0, skipped: 0,
        duplicateGroups: 0,
        processingTimeMs: Date.now() - startedAt,
      };
    }

    const snapshotId = snapRes.rows[0]!.id;

    // ── Step 2: Query all signals with competitor domain data ─────────────────
    // Broad filter: grab any signal that has a competitor domain we can extract.
    // competitor_rank IS NOT NULL is the primary flag; the jsonb fallbacks
    // ensure we also pick up pre-existing signals stored differently.
    const sigRes = await this.pool.query<RawSignalRow>(
      `SELECT id, snapshot_id, client_id, signal_type,
              normalized_value, competitor_rank, raw_provider_data
       FROM discovery_signals
       WHERE client_id = $1
         AND snapshot_id = $2
         AND (
           competitor_rank IS NOT NULL
           OR (raw_provider_data->>'topCompetitorDomain') IS NOT NULL
           OR jsonb_typeof(raw_provider_data->'competitorDomains') = 'array'
         )`,
      [clientId, snapshotId],
    );

    if (sigRes.rows.length === 0) {
      return {
        clientId, snapshotId,
        extracted: 0, inserted: 0, updated: 0, skipped: 0,
        duplicateGroups: 0,
        processingTimeMs: Date.now() - startedAt,
      };
    }

    // ── Step 3: Map DB rows → SignalRow (extractor interface) ─────────────────
    const signalRows: SignalRow[] = sigRes.rows.map(r => ({
      clientId:        r.client_id,
      snapshotId:      r.snapshot_id,
      normalizedValue: r.normalized_value,
      signalType:      r.signal_type,
      competitorRank:  r.competitor_rank,
      rawProviderData: r.raw_provider_data ?? {},
    }));

    const rawCount = signalRows.length;

    // ── Step 4: Extract + dedup (Phase 3E) ────────────────────────────────────
    // extractCompetitorsFromSignals: O(N) scan, merges by normalized domain.
    // Returns one NormalizedCompetitor per unique (clientId, domain).
    const entities = extractCompetitorsFromSignals(signalRows);

    const skipped        = rawCount - entities.length;
    // A "duplicate group" is any domain seen in more than one signal.
    const duplicateGroups = entities.filter(e => (e.keywordGapCount ?? 0) > 1).length;

    if (entities.length === 0) {
      return {
        clientId, snapshotId,
        extracted: rawCount, inserted: 0, updated: 0, skipped,
        duplicateGroups: 0,
        processingTimeMs: Date.now() - startedAt,
      };
    }

    // ── Step 5: Upsert into competitors table ─────────────────────────────────
    const repo     = new DrizzleCompetitorRepository(this.db);
    const returned = await repo.upsertMany(entities);

    // Distinguish inserts from updates by comparing createdAt ≈ updatedAt.
    // Rows where updated_at == created_at were just inserted; otherwise updated.
    // (Both are set to NOW() on insert; on conflict updatedAt is bumped alone.)
    let inserted = 0;
    let updated  = 0;
    for (const row of returned) {
      const diff = Math.abs(row.updatedAt.getTime() - row.createdAt.getTime());
      if (diff < 500) {
        inserted++;
      } else {
        updated++;
      }
    }

    return {
      clientId,
      snapshotId,
      extracted:       rawCount,
      inserted,
      updated,
      skipped,
      duplicateGroups,
      processingTimeMs: Date.now() - startedAt,
    };
  }
}

// ── Module-level singleton ────────────────────────────────────────────────────
// Shared instance used by routes and discovery-execution-service fire-and-forget.
export const competitorDiscoveryService = new CompetitorDiscoveryService();
