/**
 * Pure helpers for Google Business Profile API quota / rate-limit tracking.
 *
 * These functions have no side-effects and carry no database dependencies —
 * they can be imported and tested without a running DB or HTTP server.
 *
 * The structured GbpCooldown record replaces the previous flat
 * `cooldownUntil / google429At / google429Endpoint / google429Reason` fields
 * stored in social_connections.metadata.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

/** Which GBP endpoint category raised the error. */
export type GbpEndpointCategory =
  | "Account Management API"
  | "Business Information API"
  | "Local Posts API";

/** Classified error type from the provider response body. */
export type GbpErrorType =
  | "rate_limit"           // per-minute or per-second throttle
  | "daily_quota"          // per-day quota exhausted
  | "project_quota_zero"   // project quota explicitly set to 0
  | "access_denied"        // 403 or 401: scope / IAM issue
  | "api_disabled"         // API not enabled on the project
  | "unknown";             // 429 without enough detail to classify

/** Structured record of a GBP quota / rate-limit event. */
export interface GbpCooldown {
  /** ISO timestamp when the cooldown started (first hit). */
  startedAt: string;
  /** ISO timestamp when the cooldown expires. */
  expiresAt: string;
  /** Raw provider error text (truncated, no tokens). */
  reason: string;
  /** Which endpoint category raised the error. */
  endpoint: GbpEndpointCategory;
  /** Google service hostname (e.g. mybusinessaccountmanagement.googleapis.com). */
  service: string;
  /** Total number of 429 hits tracked against this record (for diagnostics). */
  attemptCount: number;
  /** Value of the Retry-After response header in seconds, if provided. */
  retryAfterSec: number | null;
  /** Classified error type. */
  errorType: GbpErrorType;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default cooldown durations by error type (seconds). */
export const GBP_COOLDOWN_DEFAULTS: Record<GbpErrorType, number> = {
  rate_limit:          120,    // 2 min — per-minute limits reset quickly
  daily_quota:        3600,    // 1 h — daily quotas may not reset instantly
  project_quota_zero: 86400,   // 24 h — requires manual GCP action
  access_denied:      86400,   // 24 h — requires OAuth or IAM fix
  api_disabled:       86400,   // 24 h — requires enabling API in GCP
  unknown:             900,    // 15 min — conservative default
};

// ── readGbpCooldown ───────────────────────────────────────────────────────────

/**
 * Read the active GbpCooldown from a metadata object.
 *
 * Returns null when:
 * - no cooldown record exists, or
 * - the cooldown has already expired (auto-clears on read).
 *
 * Handles legacy flat-field format for backwards compatibility.
 */
export function readGbpCooldown(metadata: Record<string, unknown>): GbpCooldown | null {
  // New structured format
  if (metadata.gbpCooldown && typeof metadata.gbpCooldown === "object") {
    const c = metadata.gbpCooldown as GbpCooldown;
    if (new Date(c.expiresAt) > new Date()) return c;
    return null; // expired
  }

  // Legacy flat format (backwards compatibility — convert on read)
  const legacyExpiry = metadata.cooldownUntil as string | undefined;
  if (legacyExpiry && new Date(legacyExpiry) > new Date()) {
    return {
      startedAt:     (metadata.google429At as string | undefined) ?? legacyExpiry,
      expiresAt:     legacyExpiry,
      reason:        (metadata.google429Reason as string | undefined) ?? "unknown (legacy record)",
      endpoint:      "Account Management API",
      service:       "mybusinessaccountmanagement.googleapis.com",
      attemptCount:  1,
      retryAfterSec: null,
      errorType:     "unknown",
    };
  }

  return null;
}

// ── classifyGbpError ──────────────────────────────────────────────────────────

/**
 * Classify a Google API error from HTTP status and response body text.
 *
 * Classification is conservative: only upgrades from "unknown" when there is
 * clear evidence in the response body.
 */
export function classifyGbpError(responseBody: string, httpStatus: number): GbpErrorType {
  if (httpStatus === 403 || httpStatus === 401) {
    if (/API.*disabled|not.*enabled|SERVICE_DISABLED/i.test(responseBody)) return "api_disabled";
    return "access_denied";
  }

  if (httpStatus === 429) {
    if (/per.?day|daily.?quota|quota.*per.*day/i.test(responseBody))   return "daily_quota";
    if (/quota.*\b0\b|limit.*\b0\b/i.test(responseBody))               return "project_quota_zero";
    if (/per.?minute|requests per minute|rate.?limit/i.test(responseBody)) return "rate_limit";
    return "unknown"; // 429 without enough body detail
  }

  return "unknown";
}

// ── buildGbpCooldownRecord ────────────────────────────────────────────────────

/**
 * Build an updated GbpCooldown record from a new error event.
 *
 * Rules:
 * - Does NOT push the expiresAt deadline forward if an active cooldown already
 *   exists (prevents endless timer resets on blind retries).
 * - Increments attemptCount.
 * - Uses Retry-After header when provided.
 * - Falls back to GBP_COOLDOWN_DEFAULTS otherwise.
 */
export function buildGbpCooldownRecord(opts: {
  existing:          GbpCooldown | null;
  responseBody:      string;
  retryAfterHeader:  string | null;
  httpStatus:        number;
  endpoint:          GbpEndpointCategory;
  service:           string;
}): GbpCooldown {
  const errorType    = classifyGbpError(opts.responseBody, opts.httpStatus);
  const retryAfterSec = opts.retryAfterHeader
    ? (parseInt(opts.retryAfterHeader, 10) || null)
    : null;
  const cooldownSecs = retryAfterSec ?? GBP_COOLDOWN_DEFAULTS[errorType] ?? 900;
  const now          = new Date();

  // Preserve existing deadline — do not reset on repeated hits
  const expiresAt =
    opts.existing && new Date(opts.existing.expiresAt) > now
      ? opts.existing.expiresAt
      : new Date(now.getTime() + cooldownSecs * 1000).toISOString();

  return {
    startedAt:     opts.existing?.startedAt ?? now.toISOString(),
    expiresAt,
    reason:        opts.responseBody.slice(0, 500),
    endpoint:      opts.endpoint,
    service:       opts.service,
    attemptCount:  (opts.existing?.attemptCount ?? 0) + 1,
    retryAfterSec,
    errorType,
  };
}

// ── stripLegacyCooldownFields ─────────────────────────────────────────────────

/**
 * Remove legacy flat cooldown fields from a metadata object, leaving the rest
 * intact for a migration-safe update.
 */
export function stripLegacyCooldownFields(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const { cooldownUntil, google429At, google429Endpoint, google429Reason, ...rest } = metadata;
  void cooldownUntil; void google429At; void google429Endpoint; void google429Reason;
  return rest;
}
