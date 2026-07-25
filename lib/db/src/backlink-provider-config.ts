/**
 * C8R-8 — Backlink Provider Configuration, Health, and Error Types
 *
 * Provides typed configuration and health-state modelling for all backlink data
 * providers.  Currently the only wired live provider is DataForSEO (disabled until
 * credentials are set).  The FixtureBacklinkDataProvider remains always-ready for
 * development and testing.
 *
 * ── Environment variables ──────────────────────────────────────────────────────
 *
 * Shared with the discovery engine (no new credential pairs required):
 *   DATAFORSEO_LOGIN              DataForSEO account email — required for live calls
 *   DATAFORSEO_PASSWORD           DataForSEO API password  — required for live calls
 *   DATAFORSEO_BASE_URL           API base URL (default: https://api.dataforseo.com)
 *
 * Backlink-specific feature flags and tuning:
 *   BACKLINK_DATAFORSEO_ENABLED   "true" to enable DataForSEO backlink calls (default: false)
 *   BACKLINK_PROVIDER_TIMEOUT_MS  Per-request timeout ms              (default: 30000)
 *   BACKLINK_MAX_REQUESTS_PER_RUN Max API calls per ingestion run     (default: 10)
 *   BACKLINK_RETRY_MAX            Retries after first attempt on 5xx  (default: 1)
 *   BACKLINK_RETRY_DELAY_MS       Base delay between retries ms       (default: 2000)
 *
 * ── Activation instructions (Path A, future) ──────────────────────────────────
 *   1. Ensure DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are set in environment secrets.
 *   2. Set BACKLINK_DATAFORSEO_ENABLED=true.
 *   3. (Optional) Tune BACKLINK_MAX_REQUESTS_PER_RUN to control API cost per run.
 *   4. Restart the API server.  The health endpoint will report "configured".
 *
 * ── Security guarantees ───────────────────────────────────────────────────────
 *   - parseDataForSEOBacklinkConfig returns null when credentials are absent.
 *   - The health state never exposes the password field.
 *   - BacklinkProviderError messages never contain credentials.
 *   - No secret is logged at any log level.
 */

import { buildBasicAuthHeader as _buildBasicAuthHeader } from "./dataforseo-config";

// Re-export the shared auth builder so adapters only need one import.
export const buildBacklinkAuthHeader: (login: string, password: string) => string =
  _buildBasicAuthHeader;

// ── Retry / timeout policy ────────────────────────────────────────────────────

/**
 * Retry and timeout configuration for a single provider.
 * maxAttempts is the total number of HTTP attempts (1 + retries after failure).
 */
export interface BacklinkProviderRetryPolicy {
  /** Total HTTP attempts, including the initial one.  Range 1–4. */
  maxAttempts: number;
  /** Base delay in ms between retry attempts (may be multiplied per attempt). */
  delayMs: number;
  /** Per-attempt timeout in ms before the request is aborted. */
  timeoutMs: number;
}

// ── DataForSEO Backlinks config ───────────────────────────────────────────────

/**
 * Parsed and validated configuration for the DataForSEO backlink adapter.
 * Credentials (login/password) are present but the password is never surfaced
 * outside this object.
 */
export interface DataForSEOBacklinkConfig {
  /** DataForSEO account email.  Never logged. */
  readonly login: string;
  /** DataForSEO API password.  Never logged.  Never exposed in health state. */
  readonly password: string;
  /** API base URL. Default: https://api.dataforseo.com */
  readonly baseUrl: string;
  /**
   * Master feature flag.  Must be explicitly "true" for live API calls.
   * When false the adapter throws provider_disabled immediately.
   */
  readonly enabled: boolean;
  /** Max DataForSEO Backlinks API calls per single ingestion run. */
  readonly maxRequestsPerRun: number;
  readonly retry: BacklinkProviderRetryPolicy;
}

// ── Health state ──────────────────────────────────────────────────────────────

export type BacklinkProviderHealthStatus =
  | "unconfigured"   // Required env vars absent — provider cannot function
  | "disabled"       // Credentials present but BACKLINK_DATAFORSEO_ENABLED != "true"
  | "configured";    // Credentials present AND enabled — ready for live calls

/**
 * Health snapshot for a single registered backlink provider.
 * Safe to expose in API responses: no credentials included.
 */
export interface BacklinkProviderHealthState {
  readonly provider: string;
  readonly status: BacklinkProviderHealthStatus;
  /** Human-readable explanation — present for unconfigured/disabled states. */
  readonly reason: string | null;
  /** Account login (email) — present only when status === "configured". */
  readonly login: string | null;
}

// ── Error types ───────────────────────────────────────────────────────────────

export type BacklinkProviderErrorKind =
  | "provider_unconfigured"   // Missing required env vars
  | "provider_disabled"       // BACKLINK_DATAFORSEO_ENABLED != "true"
  | "timeout"                 // Request exceeded timeoutMs
  | "auth_error"              // HTTP 401/403 — invalid credentials
  | "quota_exceeded"          // HTTP 402 — account balance exhausted
  | "rate_limited"            // HTTP 429 — too many requests
  | "malformed_response"      // Response body is not the expected shape
  | "provider_error"          // HTTP 5xx from the provider
  | "no_results";             // Provider returned 0 items (non-fatal)

/**
 * Typed error thrown by backlink provider adapters.
 * Always caught by the ingestion pipeline's provider-stage try/catch.
 * Never propagates beyond BacklinkIngestionFailureStage "provider".
 */
export class BacklinkProviderError extends Error {
  readonly kind: BacklinkProviderErrorKind;
  readonly statusCode: number | null;

  constructor(
    kind: BacklinkProviderErrorKind,
    message: string,
    statusCode: number | null = null,
  ) {
    super(`[backlink_provider:${kind}] ${message}`);
    this.name       = "BacklinkProviderError";
    this.kind       = kind;
    this.statusCode = statusCode;
  }
}

// ── Config parser ─────────────────────────────────────────────────────────────

/**
 * Parse DataForSEO backlink configuration from environment variables.
 *
 * Returns null when DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD is absent.
 * Never throws.  Never logs secrets.
 *
 * Pass a custom env dict in tests to avoid reading from process.env.
 */
export function parseDataForSEOBacklinkConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): DataForSEOBacklinkConfig | null {
  const login    = env["DATAFORSEO_LOGIN"];
  const password = env["DATAFORSEO_PASSWORD"];
  if (!login || !password) return null;

  const timeoutRaw         = parseInt(env["BACKLINK_PROVIDER_TIMEOUT_MS"]  ?? "30000", 10);
  const maxRequestsRaw     = parseInt(env["BACKLINK_MAX_REQUESTS_PER_RUN"] ?? "10",    10);
  const retryMaxRaw        = parseInt(env["BACKLINK_RETRY_MAX"]             ?? "1",     10);
  const retryDelayRaw      = parseInt(env["BACKLINK_RETRY_DELAY_MS"]        ?? "2000",  10);
  const enabledStr         = (env["BACKLINK_DATAFORSEO_ENABLED"] ?? "false").toLowerCase();

  const timeoutMs         = Number.isFinite(timeoutRaw)     ? Math.max(5_000, timeoutRaw)               : 30_000;
  const maxRequestsPerRun = Number.isFinite(maxRequestsRaw) ? Math.max(1, Math.min(50, maxRequestsRaw)) : 10;
  const retryMax          = Number.isFinite(retryMaxRaw)    ? Math.max(0, Math.min(3, retryMaxRaw))     : 1;
  const retryDelayMs      = Number.isFinite(retryDelayRaw)  ? Math.max(100, retryDelayRaw)              : 2_000;

  return {
    login,
    password,
    baseUrl:            env["DATAFORSEO_BASE_URL"] ?? "https://api.dataforseo.com",
    enabled:            enabledStr === "true",
    maxRequestsPerRun,
    retry: {
      maxAttempts: retryMax + 1,
      delayMs:     retryDelayMs,
      timeoutMs,
    },
  };
}

// ── Health deriver ────────────────────────────────────────────────────────────

/**
 * Derive the health state for the DataForSEO backlink provider from the parsed config.
 * Safe for API responses — password is never included.
 */
export function getDataForSEOBacklinkHealthState(
  config: DataForSEOBacklinkConfig | null,
): BacklinkProviderHealthState {
  if (!config) {
    return {
      provider: "dataforseo_backlinks",
      status:   "unconfigured",
      reason:   "DATAFORSEO_LOGIN and/or DATAFORSEO_PASSWORD are not set. " +
                "Set both environment variables and BACKLINK_DATAFORSEO_ENABLED=true to activate live backlink discovery.",
      login:    null,
    };
  }
  if (!config.enabled) {
    return {
      provider: "dataforseo_backlinks",
      status:   "disabled",
      reason:   "Credentials are present but BACKLINK_DATAFORSEO_ENABLED is not set to 'true'. " +
                "Set BACKLINK_DATAFORSEO_ENABLED=true to enable live backlink discovery.",
      login:    null,
    };
  }
  return {
    provider: "dataforseo_backlinks",
    status:   "configured",
    reason:   null,
    login:    config.login,
  };
}
