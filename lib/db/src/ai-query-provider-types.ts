/**
 * C9R-4: Provider-neutral AI query interface contracts.
 * Pure types — no runtime dependencies. Implementations live in api-server.
 */

// ── Tenant context ─────────────────────────────────────────────────────────────

/** All business context needed to generate and evaluate queries for one tenant. */
export interface AiQueryTenantContext {
  clientId: string;
  businessName: string;
  /** Full domain, e.g. "bedbugsbeyond.com" or "https://bedbugsbeyond.com". */
  businessDomain: string | null;
  /** E.164 or any formatted phone string. */
  businessPhone: string | null;
  /** Active service IDs from client_services (e.g. "bed-bug-treatment"). */
  activeServiceIds: readonly string[];
  /** Authorized geographies, e.g. ["Foley, AL", "Mobile, AL"]. */
  authorizedGeographies: readonly string[];
  /** Competitors to watch in every response. */
  competitors: readonly AiQueryCompetitorContext[];
  /**
   * Phrases that must not appear in generated queries (e.g. "termite").
   * Case-insensitive substring match.
   */
  prohibitedPhrases: readonly string[];
}

export interface AiQueryCompetitorContext {
  name: string;
  domain: string | null;
}

// ── Request / result shapes ────────────────────────────────────────────────────

export interface AiQueryRequest {
  query: string;
  tenantContext: AiQueryTenantContext;
  /** Milliseconds before aborting the provider call. Default: 15_000. */
  timeoutMs?: number;
}

export interface AiQueryResult {
  provider: string;
  model: string;
  query: string;
  /** Raw response text from the AI provider, or null on failure. */
  responseText: string | null;
  generatedAt: string;
  latencyMs: number;
  success: boolean;
  failureReason: AiQueryFailureReason | null;
  businessMentioned: boolean;
  mentionType: AiMentionType | null;
  /** Character offset of the first mention in responseText, or null. */
  mentionPosition: number | null;
  competitorMentions: readonly AiQueryCompetitorMention[];
  citations: readonly AiQueryCitation[];
}

export type AiQueryFailureReason =
  | "timeout"
  | "auth_failure"
  | "rate_limit"
  | "malformed_response"
  | "provider_error"
  | "not_configured";

export type AiMentionType =
  | "exact"
  | "normalized"
  | "domain"
  | "phone"
  | "none";

export interface AiQueryCompetitorMention {
  name: string;
  domain: string | null;
  mentionType: AiMentionType;
  /** Character offset of the first mention in responseText, or null. */
  position: number | null;
}

export interface AiQueryCitation {
  url: string;
  domain: string;
  title: string | null;
  /** Character offset of the URL in responseText, or null. */
  position: number | null;
}

// ── Scan summary (aggregate of all query results for one run) ──────────────────

export interface AiQueryScanSummary {
  scanId: string;
  clientId: string;
  provider: string;
  model: string;
  status: AiQueryScanStatus;
  queryCount: number;
  completedCount: number;
  mentionCount: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  results: readonly AiQueryResult[];
}

export type AiQueryScanStatus = "running" | "completed" | "failed";

// ── Provider interface ─────────────────────────────────────────────────────────

/** Provider-neutral interface every AI query provider must implement. */
export interface AiQueryProvider {
  readonly name: string;
  readonly model: string;
  /** False when credentials are missing — callers should skip execution. */
  readonly isConfigured: boolean;
  execute(request: AiQueryRequest): Promise<AiQueryResult>;
}

// ── Persisted result shape (read from DB by adapters) ─────────────────────────

/** Row shape returned by the ai_query_results table (camelCased). */
export interface PersistedAiQueryResult {
  id: string;
  scanId: string;
  clientId: string;
  query: string;
  provider: string;
  model: string;
  responseText: string | null;
  latencyMs: number | null;
  generatedAt: string | null;
  success: boolean;
  failureReason: string | null;
  businessMentioned: boolean;
  mentionType: string | null;
  mentionPosition: number | null;
  competitorMentions: readonly AiQueryCompetitorMention[];
  citations: readonly AiQueryCitation[];
  createdAt: string;
}

/** Scan row shape returned by the ai_query_scans table (camelCased). */
export interface PersistedAiQueryScan {
  id: string;
  clientId: string;
  status: string;
  provider: string;
  model: string;
  queryCount: number;
  completedCount: number;
  mentionCount: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}
