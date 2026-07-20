/**
 * C9R-4: AI Query Scan Service.
 *
 * Orchestrates a complete scan for one tenant:
 *   1. Resolves tenant context (business info, services, geography)
 *   2. Runs preflight validation — fails closed if services or geography are missing
 *   3. Generates deterministic query list
 *   4. Runs each query via the injected provider
 *   5. Persists scan record + individual results to DB
 *   6. Returns a full AiQueryScanSummary
 *
 * The route calls execute({ clientId, userId }) and receives the summary.
 * Reads the latest completed scan via getLatestScan({ clientId }).
 *
 * C9R-7 correction: queryActiveServiceIds now reads service_key (not the
 * non-existent service_id column), and buildTenantContext falls back to
 * clients.service_areas and clients.client_name when local_presence_profiles
 * has no row for this clientId. "my area" and "local services" are never
 * synthesised — if canonical data is unavailable the scan is refused with
 * status "preflight_failed" and no provider call is made.
 */

import {
  db as defaultDb,
  pool as defaultPool,
  localPresenceProfilesTable,
  generateAiQueries,
  type AiQueryTenantContext,
  type AiQueryProvider,
  type AiQueryResult,
  type AiQueryScanSummary,
  type AiPreflightFailureReason,
  type PersistedAiQueryScan,
  type PersistedAiQueryResult,
  type AiScanHistoryPage,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { OpenAiQueryProvider } from "./openai-ai-query-provider.js";

type Pool = typeof defaultPool;
type Db   = typeof defaultDb;

// ── Competitor row (from competitors table) ───────────────────────────────────

interface CompetitorRow {
  id: string;
  name: string;
  domain: string | null;
}

// ── Clients row (geography + name fallback) ───────────────────────────────────

interface ClientRow {
  clientName:   string;
  serviceAreas: string; // JSON array of geography strings
}

// ── Public contracts ───────────────────────────────────────────────────────────

export interface AiQueryScanInput {
  clientId:      string;
  userId:        string;
  triggerSource?: "manual" | "scheduled";
}

// ── Scan service ───────────────────────────────────────────────────────────────

export class AiQueryScanService {
  private readonly provider: AiQueryProvider;

  constructor(
    private readonly pool: Pool = defaultPool,
    private readonly db:   Db   = defaultDb,
    provider?: AiQueryProvider,
  ) {
    this.provider = provider ?? new OpenAiQueryProvider();
  }

  // ── Run a new scan ──────────────────────────────────────────────────────────

  async execute(input: AiQueryScanInput): Promise<AiQueryScanSummary> {
    const { clientId, triggerSource = "manual" } = input;
    const now = new Date().toISOString();

    // 1. Resolve tenant context
    const context = await this.buildTenantContext(clientId);

    // 2. Preflight validation — fail closed if canonical data is unavailable
    const preflight = this.validatePreflight(context);
    if (!preflight.ok) {
      console.warn(
        `[ai-query-scan] preflight_failed clientId=${clientId} reason=${preflight.reason}`,
      );
      return {
        scanId:           "",
        clientId,
        provider:         this.provider.name,
        model:            this.provider.model,
        status:           "preflight_failed",
        preflightFailure: preflight.reason,
        queryCount:       0,
        completedCount:   0,
        mentionCount:     0,
        error:            `Preflight failed: ${preflight.reason}`,
        startedAt:        now,
        completedAt:      now,
        results:          Object.freeze([]),
      };
    }

    // 3. Generate queries
    const queries = generateAiQueries(context);

    // 4. Create scan record (status = running)
    const scanId = await this.createScanRecord(clientId, queries.length, triggerSource);

    const results: AiQueryResult[] = [];
    let mentionCount           = 0;
    let competitorMentionCount = 0;
    let citationCount          = 0;

    // 5. Execute queries sequentially (avoid parallel OpenAI calls to control costs)
    for (const query of queries) {
      const result = await this.provider.execute({ query, tenantContext: context });
      results.push(result);
      if (result.businessMentioned) mentionCount++;
      competitorMentionCount += Array.isArray(result.competitorMentions) ? result.competitorMentions.length : 0;
      citationCount          += Array.isArray(result.citations)           ? result.citations.length          : 0;
      await this.persistQueryResult(scanId, clientId, result);
    }

    // 6. Update scan record (completed)
    await this.completeScanRecord(scanId, results.length, mentionCount, competitorMentionCount, citationCount, null);

    return {
      scanId,
      clientId,
      provider:       this.provider.name,
      model:          this.provider.model,
      status:         "completed",
      queryCount:     queries.length,
      completedCount: results.length,
      mentionCount,
      error:          null,
      startedAt:      new Date().toISOString(),
      completedAt:    new Date().toISOString(),
      results:        Object.freeze(results),
    };
  }

  // ── Retrieve latest completed scan ─────────────────────────────────────────

  async getLatestScan(clientId: string): Promise<{
    scan: PersistedAiQueryScan | null;
    results: readonly PersistedAiQueryResult[];
  }> {
    try {
      const { rows: scanRows } = await this.pool.query<{
        id: string; client_id: string; status: string; provider: string; model: string;
        query_count: number; completed_count: number; mention_count: number;
        error: string | null; started_at: Date; completed_at: Date | null;
      }>(
        `SELECT id, client_id, status, provider, model, query_count, completed_count,
                mention_count, error, started_at, completed_at
         FROM ai_query_scans
         WHERE client_id = $1 AND status = 'completed'
         ORDER BY started_at DESC
         LIMIT 1`,
        [clientId],
      );
      if (!scanRows.length) return { scan: null, results: [] };

      const row = scanRows[0];
      const scan: PersistedAiQueryScan = {
        id:             row.id,
        clientId:       row.client_id,
        status:         row.status,
        provider:       row.provider,
        model:          row.model,
        queryCount:     Number(row.query_count),
        completedCount: Number(row.completed_count),
        mentionCount:   Number(row.mention_count),
        error:          row.error,
        startedAt:      row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at),
        completedAt:    row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at ? String(row.completed_at) : null,
      };

      const results = await this.getResultsForScan(row.id, clientId);
      return { scan, results };
    } catch (err: any) {
      if (err?.code === "42P01") return { scan: null, results: [] };
      console.warn("[ai-query-scan] getLatestScan error:", err?.message);
      return { scan: null, results: [] };
    }
  }

  // ── Retrieve evidence for a specific scan ──────────────────────────────────

  async getScanEvidence(scanId: string, clientId: string): Promise<{
    scan: PersistedAiQueryScan | null;
    results: readonly PersistedAiQueryResult[];
  }> {
    try {
      const { rows: scanRows } = await this.pool.query<{
        id: string; client_id: string; status: string; provider: string; model: string;
        query_count: number; completed_count: number; mention_count: number;
        error: string | null; started_at: Date; completed_at: Date | null;
      }>(
        `SELECT id, client_id, status, provider, model, query_count, completed_count,
                mention_count, error, started_at, completed_at
         FROM ai_query_scans
         WHERE id = $1 AND client_id = $2
         LIMIT 1`,
        [scanId, clientId],
      );
      if (!scanRows.length) return { scan: null, results: [] };

      const row = scanRows[0];
      const scan: PersistedAiQueryScan = {
        id:             row.id,
        clientId:       row.client_id,
        status:         row.status,
        provider:       row.provider,
        model:          row.model,
        queryCount:     Number(row.query_count),
        completedCount: Number(row.completed_count),
        mentionCount:   Number(row.mention_count),
        error:          row.error,
        startedAt:      row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at),
        completedAt:    row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at ? String(row.completed_at) : null,
      };

      const results = await this.getResultsForScan(row.id, clientId);
      return { scan, results };
    } catch (err: any) {
      if (err?.code === "42P01") return { scan: null, results: [] };
      console.warn("[ai-query-scan] getScanEvidence error:", err?.message);
      return { scan: null, results: [] };
    }
  }

  // ── Private: preflight validation ─────────────────────────────────────────

  private validatePreflight(context: AiQueryTenantContext):
    | { ok: true }
    | { ok: false; reason: AiPreflightFailureReason }
  {
    if (context.activeServiceIds.length === 0) {
      return { ok: false, reason: "no_active_services" };
    }
    if (context.authorizedGeographies.length === 0) {
      return { ok: false, reason: "no_authorized_geography" };
    }
    return { ok: true };
  }

  // ── Private: build tenant context ─────────────────────────────────────────

  private async buildTenantContext(clientId: string): Promise<AiQueryTenantContext> {
    const [profiles, serviceKeys, competitors, clientRow] = await Promise.all([
      this.db.select().from(localPresenceProfilesTable)
        .where(eq(localPresenceProfilesTable.clientId, clientId))
        .limit(1),
      this.queryActiveServiceKeys(clientId),
      this.queryCompetitors(clientId),
      this.queryClientRow(clientId),
    ]);
    const profile = profiles[0] ?? null;

    // Business name: prefer local presence profile, fall back to clients table
    const businessName = profile?.businessName ?? clientRow?.clientName ?? "unknown";

    // Geography resolution order:
    //   1. local_presence_profiles.service_areas_json (parsed JSON array)
    //   2. local_presence_profiles.city + state
    //   3. clients.service_areas (canonical JSON array — always populated at seed time)
    // "my area" is NEVER synthesised. If no geography is found, authorizedGeographies
    // is empty and the preflight check will refuse the scan.
    const geographies: string[] = [];

    if (profile?.serviceAreasJson) {
      try {
        const parsed = JSON.parse(profile.serviceAreasJson);
        if (Array.isArray(parsed)) {
          geographies.push(...parsed.filter((g): g is string => typeof g === "string" && g.length > 0));
        }
      } catch { /* ignore malformed JSON */ }
    }

    if (!geographies.length && profile?.city && profile?.state) {
      geographies.push(`${profile.city}, ${profile.state}`);
    }

    if (!geographies.length && clientRow?.serviceAreas) {
      try {
        const parsed = JSON.parse(clientRow.serviceAreas);
        if (Array.isArray(parsed)) {
          geographies.push(...parsed.filter((g): g is string => typeof g === "string" && g.length > 0));
        }
      } catch { /* ignore malformed JSON */ }
    }

    return {
      clientId,
      businessName,
      businessDomain:        profile?.website ?? null,
      businessPhone:         profile?.phone ?? null,
      activeServiceIds:      Object.freeze(serviceKeys),
      authorizedGeographies: Object.freeze(geographies),
      competitors:           Object.freeze(competitors),
      prohibitedPhrases:     Object.freeze([] as string[]),
    };
  }

  // ── Private: service key resolution ───────────────────────────────────────
  // Reads service_key (text slug) from client_services.
  // The column is service_key — NOT service_id.

  private async queryActiveServiceKeys(clientId: string): Promise<string[]> {
    try {
      const { rows } = await this.pool.query<{ service_key: string }>(
        `SELECT service_key FROM client_services WHERE client_id = $1 AND is_active = TRUE ORDER BY sort_order ASC`,
        [clientId],
      );
      return rows.map(r => r.service_key);
    } catch (err: any) {
      if (err?.code === "42P01") return [];
      console.warn("[ai-query-scan] service key query warning:", err?.message, "code:", err?.code);
      return [];
    }
  }

  // ── Private: clients row (geography + name fallback) ──────────────────────

  private async queryClientRow(clientId: string): Promise<ClientRow | null> {
    try {
      const { rows } = await this.pool.query<{ client_name: string; service_areas: string }>(
        `SELECT client_name, service_areas FROM clients WHERE id = $1 LIMIT 1`,
        [clientId],
      );
      if (!rows.length) return null;
      return { clientName: rows[0].client_name, serviceAreas: rows[0].service_areas };
    } catch {
      return null;
    }
  }

  // ── Private: competitors ───────────────────────────────────────────────────

  private async queryCompetitors(clientId: string): Promise<CompetitorRow[]> {
    try {
      const { rows } = await this.pool.query<{ id: string; name: string; domain: string | null }>(
        `SELECT id, name, domain FROM competitors WHERE client_id = $1 ORDER BY confidence_score DESC LIMIT 10`,
        [clientId],
      );
      return rows;
    } catch (err: any) {
      if (err?.code === "42P01") return [];
      return [];
    }
  }

  // ── Private: persist scan record ───────────────────────────────────────────

  private async createScanRecord(
    clientId:      string,
    queryCount:    number,
    triggerSource: "manual" | "scheduled" = "manual",
  ): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO ai_query_scans
         (client_id, status, provider, model, query_count, trigger_source, started_at)
       VALUES ($1, 'running', $2, $3, $4, $5, NOW())
       RETURNING id`,
      [clientId, this.provider.name, this.provider.model, queryCount, triggerSource],
    );
    return rows[0].id;
  }

  private async completeScanRecord(
    scanId:                 string,
    completedCount:         number,
    mentionCount:           number,
    competitorMentionCount: number,
    citationCount:          number,
    error:                  string | null,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE ai_query_scans
       SET status = $2, completed_count = $3, mention_count = $4,
           competitor_mention_count = $5, citation_count = $6,
           error = $7, completed_at = NOW()
       WHERE id = $1`,
      [scanId, error ? "failed" : "completed", completedCount, mentionCount,
       competitorMentionCount, citationCount, error],
    );
  }

  // ── listHistory — scan history page ────────────────────────────────────────

  async listHistory(
    clientId: string,
    options: { page?: number; pageSize?: number; status?: string } = {},
  ): Promise<AiScanHistoryPage> {
    const page     = Math.max(1, options.page     ?? 1);
    const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 20));
    const offset   = (page - 1) * pageSize;

    const whereClauses: string[] = [`client_id = $1`];
    const params: unknown[] = [clientId];

    if (options.status) {
      params.push(options.status);
      whereClauses.push(`status = $${params.length}`);
    }

    const whereClause = whereClauses.join(" AND ");

    try {
      const { rows: countRows } = await this.pool.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM ai_query_scans WHERE ${whereClause}`,
        params,
      );
      const total = parseInt(countRows[0]?.cnt ?? "0", 10);

      params.push(pageSize);
      params.push(offset);

      const { rows } = await this.pool.query<{
        id: string; client_id: string; trigger_source: string; provider: string;
        model: string; status: string; query_count: number; completed_count: number;
        mention_count: number; competitor_mention_count: number | null;
        citation_count: number | null; error: string | null;
        started_at: Date; completed_at: Date | null;
      }>(
        `SELECT id, client_id, trigger_source, provider, model, status,
                query_count, completed_count, mention_count,
                competitor_mention_count, citation_count, error,
                started_at, completed_at
         FROM ai_query_scans
         WHERE ${whereClause}
         ORDER BY started_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      const scans = rows.map(r => {
        const startedAt   = r.started_at  instanceof Date ? r.started_at.toISOString()   : String(r.started_at);
        const completedAt = r.completed_at instanceof Date ? r.completed_at.toISOString() : r.completed_at ? String(r.completed_at) : null;
        const completedCount = Number(r.completed_count);
        const mentionCount   = Number(r.mention_count);
        const queryCount     = Number(r.query_count);
        const durationMs     = (r.completed_at && r.started_at)
          ? r.completed_at.getTime() - r.started_at.getTime()
          : null;
        return {
          scanId:                 r.id,
          clientId:               r.client_id,
          triggerSource:          (r.trigger_source ?? "manual") as "manual" | "scheduled",
          provider:               r.provider,
          model:                  r.model,
          status:                 r.status as "running" | "completed" | "failed",
          queryCount,
          completedCount,
          failedCount:            Math.max(0, queryCount - completedCount),
          mentionCount,
          mentionRate:            completedCount > 0 ? Math.round((mentionCount / completedCount) * 1000) / 1000 : 0,
          competitorMentionCount: r.competitor_mention_count !== null ? Number(r.competitor_mention_count) : null,
          citationCount:          r.citation_count           !== null ? Number(r.citation_count)           : null,
          startedAt,
          completedAt,
          durationMs,
          errorMessage:           r.error ?? null,
          evidenceHref:           `/api/ai-visibility/query-scan/evidence/${r.id}`,
        };
      });

      return { scans, total, page, pageSize, hasMore: offset + scans.length < total };
    } catch (err: any) {
      if (err?.code === "42P01") return { scans: [], total: 0, page, pageSize, hasMore: false };
      throw err;
    }
  }

  // ── Private: persist query result ─────────────────────────────────────────

  private async persistQueryResult(
    scanId: string,
    clientId: string,
    result: AiQueryResult,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_query_results
         (scan_id, client_id, query, provider, model, response_text, latency_ms,
          generated_at, success, failure_reason, business_mentioned, mention_type,
          mention_position, competitor_mentions, citations)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        scanId,
        clientId,
        result.query,
        result.provider,
        result.model,
        result.responseText,
        result.latencyMs,
        result.generatedAt,
        result.success,
        result.failureReason,
        result.businessMentioned,
        result.mentionType,
        result.mentionPosition,
        JSON.stringify(result.competitorMentions),
        JSON.stringify(result.citations),
      ],
    );
  }

  // ── Private: read results for a scan ──────────────────────────────────────

  private async getResultsForScan(
    scanId: string,
    clientId: string,
  ): Promise<readonly PersistedAiQueryResult[]> {
    const { rows } = await this.pool.query<{
      id: string; scan_id: string; client_id: string; query: string;
      provider: string; model: string; response_text: string | null;
      latency_ms: number | null; generated_at: Date | null;
      success: boolean; failure_reason: string | null;
      business_mentioned: boolean; mention_type: string | null;
      mention_position: number | null;
      competitor_mentions: unknown; citations: unknown;
      created_at: Date;
    }>(
      `SELECT id, scan_id, client_id, query, provider, model, response_text,
              latency_ms, generated_at, success, failure_reason,
              business_mentioned, mention_type, mention_position,
              competitor_mentions, citations, created_at
       FROM ai_query_results
       WHERE scan_id = $1 AND client_id = $2
       ORDER BY created_at ASC`,
      [scanId, clientId],
    );

    return Object.freeze(rows.map(r => ({
      id:                 r.id,
      scanId:             r.scan_id,
      clientId:           r.client_id,
      query:              r.query,
      provider:           r.provider,
      model:              r.model,
      responseText:       r.response_text,
      latencyMs:          r.latency_ms !== null ? Number(r.latency_ms) : null,
      generatedAt:        r.generated_at instanceof Date ? r.generated_at.toISOString() : r.generated_at ? String(r.generated_at) : null,
      success:            Boolean(r.success),
      failureReason:      r.failure_reason,
      businessMentioned:  Boolean(r.business_mentioned),
      mentionType:        r.mention_type,
      mentionPosition:    r.mention_position !== null ? Number(r.mention_position) : null,
      competitorMentions: Array.isArray(r.competitor_mentions) ? Object.freeze(r.competitor_mentions) : Object.freeze([]),
      citations:          Array.isArray(r.citations) ? Object.freeze(r.citations) : Object.freeze([]),
      createdAt:          r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    })));
  }
}
