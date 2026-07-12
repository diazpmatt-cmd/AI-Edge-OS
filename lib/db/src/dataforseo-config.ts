/**
 * Phase C4 — DataForSEO Configuration and Health
 *
 * Typed configuration for the DataForSEO adapter.
 * All values are read from environment variables — no hardcoded credentials.
 * No secret is ever logged or returned in health payloads.
 *
 * Environment variables:
 *   DATAFORSEO_LOGIN              — DataForSEO account email/login (required)
 *   DATAFORSEO_PASSWORD           — DataForSEO API password (required)
 *   DATAFORSEO_BASE_URL           — API base URL (default: https://api.dataforseo.com)
 *   DATAFORSEO_TIMEOUT_MS         — Per-request timeout in ms (default: 30000)
 *   DATAFORSEO_MAX_QUERIES_PER_RUN — Max SERP API calls per discovery run (default: 5)
 *   DATAFORSEO_MAX_RESULTS_PER_QUERY — Results depth per SERP call (default: 10)
 *   DATAFORSEO_MAX_KEYWORDS_PER_BATCH — Max keywords per volume batch (default: 700)
 *   DISCOVERY_DATAFORSEO_ENABLED  — "true" to enable live calls (default: false)
 *
 * Safety:
 *   - parseDataForSEOConfig returns null when credentials are absent.
 *   - The adapter throws a typed "provider_unconfigured" error when config is null.
 *   - The adapter throws a typed "provider_disabled" error when enabled=false.
 *   - Neither error propagates beyond the pipeline's Stage 2 try/catch.
 */

// ── Configuration type ────────────────────────────────────────────────────────

export interface DataForSEOConfig {
  /** DataForSEO account email. Never logged. */
  readonly login: string;
  /** DataForSEO API password. Never logged. */
  readonly password: string;
  /** API base URL. Default: https://api.dataforseo.com */
  readonly baseUrl: string;
  /** Per-request timeout in milliseconds. Default: 30000. */
  readonly timeoutMs: number;
  /**
   * Maximum number of SERP API calls per discovery run.
   * Each SERP call costs ~$0.002. Default: 5 (conservative).
   * Hard cap — planner will never exceed this.
   */
  readonly maxQueriesPerRun: number;
  /**
   * Organic result depth per SERP call (equivalent to "depth" in DataForSEO).
   * Range: 10–100. Default: 10 (cheapest tier).
   */
  readonly maxResultsPerQuery: number;
  /**
   * Maximum number of keywords per keyword volume batch call.
   * DataForSEO allows up to 700 per batch. Default: 700.
   */
  readonly maxKeywordsPerBatch: number;
  /**
   * Feature flag. Must be explicitly set to "true" to enable live API calls.
   * Default: false — adapter returns "provider_disabled" when false.
   */
  readonly enabled: boolean;
}

// ── Health state ──────────────────────────────────────────────────────────────

/**
 * Health state for the DataForSEO integration.
 *
 * "unconfigured" — DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD are not set.
 * "disabled"     — Credentials are set but DISCOVERY_DATAFORSEO_ENABLED != "true".
 * "configured"   — Credentials are present AND enabled=true. Ready for live calls.
 *
 * Note: "configured" does not imply the credentials are valid — that is only
 * confirmed by an actual API call (which may return auth_error).
 */
export type DataForSEOHealthState =
  | { status: "unconfigured"; reason: string }
  | { status: "disabled";     reason: string }
  | { status: "configured";   login: string; baseUrl: string };

// ── Error categories ──────────────────────────────────────────────────────────

/**
 * Typed error category for every possible DataForSEO failure mode.
 * The adapter converts all raw HTTP/parsing errors into one of these categories.
 * The pipeline's Stage 2 try/catch records the category string in ProviderFailure.error.
 */
export type DataForSEOErrorKind =
  | "provider_unconfigured" // no credentials in env
  | "provider_disabled"     // DISCOVERY_DATAFORSEO_ENABLED != "true"
  | "timeout"               // request exceeded timeoutMs
  | "auth_error"            // 401 or 403 — invalid credentials
  | "quota_exceeded"        // 402 — account balance exhausted
  | "rate_limited"          // 429 — too many requests
  | "malformed_response"    // response doesn't match expected shape
  | "provider_error"        // 5xx from DataForSEO
  | "task_error"            // DataForSEO task-level error (status_code != 20000)
  | "no_results"            // task succeeded but returned 0 results
  | "budget_rejected";      // BudgetGuard blocked the call before it was made

/**
 * Typed error thrown by the DataForSEO adapter.
 * Always caught by the pipeline's Stage 2 try/catch — never propagates further.
 */
export class DataForSEOError extends Error {
  readonly kind: DataForSEOErrorKind;
  readonly statusCode: number | null;

  constructor(kind: DataForSEOErrorKind, message: string, statusCode: number | null = null) {
    super(`[dataforseo:${kind}] ${message}`);
    this.name  = "DataForSEOError";
    this.kind  = kind;
    this.statusCode = statusCode;
  }
}

// ── Config parser ─────────────────────────────────────────────────────────────

/**
 * Parse DataForSEO configuration from environment variables.
 *
 * Returns null if either DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD is absent.
 * Never throws. Never logs secrets.
 *
 * Pass a custom env dict in tests to avoid reading from process.env.
 */
export function parseDataForSEOConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): DataForSEOConfig | null {
  const login    = env["DATAFORSEO_LOGIN"];
  const password = env["DATAFORSEO_PASSWORD"];
  if (!login || !password) return null;

  const timeoutMs          = parseInt(env["DATAFORSEO_TIMEOUT_MS"]            ?? "30000",  10);
  const maxQueriesPerRun   = parseInt(env["DATAFORSEO_MAX_QUERIES_PER_RUN"]   ?? "5",      10);
  const maxResultsPerQuery = parseInt(env["DATAFORSEO_MAX_RESULTS_PER_QUERY"] ?? "10",     10);
  const maxKeywordsPerBatch= parseInt(env["DATAFORSEO_MAX_KEYWORDS_PER_BATCH"]?? "700",    10);
  const enabledStr         = (env["DISCOVERY_DATAFORSEO_ENABLED"] ?? "false").toLowerCase();

  return {
    login,
    password,
    baseUrl:              env["DATAFORSEO_BASE_URL"] ?? "https://api.dataforseo.com",
    timeoutMs:            Number.isFinite(timeoutMs)           ? timeoutMs          : 30000,
    maxQueriesPerRun:     Number.isFinite(maxQueriesPerRun)    ? Math.max(1, maxQueriesPerRun)   : 5,
    maxResultsPerQuery:   Number.isFinite(maxResultsPerQuery)  ? Math.max(10, Math.min(100, maxResultsPerQuery)) : 10,
    maxKeywordsPerBatch:  Number.isFinite(maxKeywordsPerBatch) ? Math.max(1, Math.min(700, maxKeywordsPerBatch)) : 700,
    enabled:              enabledStr === "true",
  };
}

/**
 * Derive the health state from the parsed configuration.
 * Never exposes the password in the returned object.
 */
export function getDataForSEOHealthState(
  config: DataForSEOConfig | null,
): DataForSEOHealthState {
  if (!config) {
    return {
      status: "unconfigured",
      reason: "DATAFORSEO_LOGIN and/or DATAFORSEO_PASSWORD environment variables are not set.",
    };
  }
  if (!config.enabled) {
    return {
      status: "disabled",
      reason: "DISCOVERY_DATAFORSEO_ENABLED is not set to 'true'. Set it to enable live discovery calls.",
    };
  }
  return {
    status:  "configured",
    login:   config.login,
    baseUrl: config.baseUrl,
  };
}

/**
 * Build the HTTP Basic Auth header value for DataForSEO.
 * Uses login:password encoded as base64.
 * Result is safe to include in HTTP headers — never log it.
 */
export function buildBasicAuthHeader(login: string, password: string): string {
  const token = Buffer.from(`${login}:${password}`).toString("base64");
  return `Basic ${token}`;
}

/**
 * Estimate the cost of a discovery run in USD.
 * Based on DataForSEO public pricing (subject to change).
 * Used for dry-run reporting only — not for billing.
 */
export function estimateCostUSD(keywordBatches: number, serpCalls: number): number {
  // DataForSEO pricing (approximate, as of 2026):
  // Keywords Data: ~$0.0005 per keyword (batch)
  // SERP Organic (depth=10): ~$0.002 per task
  const KEYWORD_BATCH_COST = 0.0005;
  const SERP_CALL_COST     = 0.002;
  return (keywordBatches * KEYWORD_BATCH_COST) + (serpCalls * SERP_CALL_COST);
}
