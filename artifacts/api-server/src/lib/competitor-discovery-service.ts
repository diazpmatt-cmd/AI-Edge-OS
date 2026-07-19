/**
 * Competitor Discovery Service — Phase 3A / P6.1
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
 * confidenceScore=10 (SERP-only baseline).
 *
 * Phase P6.1 — Confidence Elevation:
 * After upsertMany() completes, a fire-and-forget confidence sync pass
 * elevates confidenceScore above the 10-point baseline using signal richness
 * from the extraction data (no new external API calls).
 *
 * Confidence formula (cap 70):
 *   Base:           10  SERP signal confirmed domain exists
 *   Multi-signal:  +10  keywordGapCount ≥ 3  (3+ keywords confirm the domain)
 *                  +5   keywordGapCount = 2  (2 keywords confirm)
 *   SERP position: +5   topKeywordRank ≤ 5  (top-5 visibility)
 *   Business name: +10  name was extracted, not falling back to domain string
 *   Location data: +5   city or state was populated from signal data
 *   Category:      +5   primaryCategory was populated from signal data
 */

import {
  pool    as defaultPool,
  db      as defaultDb,
  extractCompetitorsFromSignals,
  DrizzleCompetitorRepository,
} from "@workspace/db";
import type { SignalRow, NormalizedCompetitor } from "@workspace/db";

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

    // ── Step 6: Elevate confidence scores (P6.1, fire-and-forget) ────────────
    // Computes signal-richness-based confidence for each entity and persists
    // it when higher than the SERP baseline of 10. Never blocks the return.
    this.elevateConfidenceScores(clientId, entities, repo).catch(err => {
      console.error("[competitor-discovery] confidence sync error:", err);
    });

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

  // ── Private: P6.1 confidence elevation ────────────────────────────────────

  /**
   * For each extracted entity whose derived confidence exceeds the current
   * stored value, persist the elevated score via updateScores().
   *
   * This is always called fire-and-forget — errors are logged, never thrown.
   */
  private async elevateConfidenceScores(
    clientId: string,
    entities: NormalizedCompetitor[],
    repo: DrizzleCompetitorRepository,
  ): Promise<void> {
    for (const entity of entities) {
      const derived = this.deriveConfidenceScore(entity);
      if (derived > (entity.confidenceScore ?? 10)) {
        await repo.updateScores(clientId, entity.domain, {
          confidenceScore: derived,
        });
      }
    }
  }

  /**
   * Derive a confidence score from extraction signal richness.
   * No external API calls — uses only data already present on the entity.
   *
   * Formula (cap 70):
   *   Base:           10  SERP signal confirmed domain exists
   *   Multi-signal:  +10  keywordGapCount ≥ 3
   *                  +5   keywordGapCount = 2
   *   SERP position: +5   topKeywordRank ≤ 5
   *   Business name: +10  name was extracted (not a domain fallback)
   *   Location data: +5   city or state was populated
   *   Category:      +5   primaryCategory was populated
   */
  deriveConfidenceScore(entity: NormalizedCompetitor): number {
    let score = 10;
    const gaps = entity.keywordGapCount ?? 0;

    if (gaps >= 3)      score += 10;
    else if (gaps >= 2) score += 5;

    if (entity.topKeywordRank != null && entity.topKeywordRank <= 5) score += 5;

    const nameIsDomain = !entity.businessName || entity.businessName === entity.domain;
    if (!nameIsDomain) score += 10;

    if (entity.city || entity.state) score += 5;
    if (entity.primaryCategory)      score += 5;

    return Math.min(score, 70);
  }
}

// ── Module-level singleton ────────────────────────────────────────────────────
// Shared instance used by routes and discovery-execution-service fire-and-forget.
export const competitorDiscoveryService = new CompetitorDiscoveryService();
