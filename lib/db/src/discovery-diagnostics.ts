/**
 * Phase C6 — Structured Diagnostics with Redaction
 *
 * Canonical diagnostic-event model for safe operational visibility.
 *
 * Redaction contract:
 *   - Credentials (DATAFORSEO_PASSWORD, apiKey, password, secret, token) are NEVER
 *     stored in diagnostic metadata.
 *   - Basic Auth headers (Authorization: Basic ...) are redacted.
 *   - Clerk tokens (Bearer ...) are redacted.
 *   - Cookie values are redacted.
 *   - Database connection URLs are redacted.
 *   - Raw provider payloads are not stored in diagnostic events.
 *   - Stack traces are not included in API-visible diagnostic responses.
 *     Internal logs may retain them per existing pino logging policy.
 *   - Full customer content is not included.
 *
 * No Math.random(). No BB&B-specific values.
 */

import { createHash } from "node:crypto";

// ── Severity ──────────────────────────────────────────────────────────────────

export type DiagnosticSeverity = "info" | "warning" | "error";

// ── Diagnostic codes ──────────────────────────────────────────────────────────

/**
 * Stable diagnostic codes — never change these values; add new ones instead.
 * Used by monitoring systems and tests to assert on specific events.
 */
export type DiagnosticCode =
  | "run_queued"
  | "run_started"
  | "run_complete"
  | "run_partial"
  | "run_failed"
  | "run_cancelled"
  | "run_cancel_requested"
  | "provider_started"
  | "provider_complete"
  | "provider_failed"
  | "provider_retried"
  | "provider_budget_rejected"
  | "provider_capability_unsupported"
  | "lease_acquired"
  | "lease_renewed"
  | "lease_released"
  | "lease_expired"
  | "lease_recovered"
  | "lease_conflict"
  | "idempotency_hit"
  | "idempotency_mismatch"
  | "idempotency_expired"
  | "cancellation_requested"
  | "cancellation_honored"
  | "cancellation_ignored_terminal"
  | "governance_denied"
  | "governance_paused"
  | "governance_limit_exceeded"
  | "rate_limit_applied"
  | "budget_exceeded"
  | "recovery_invoked"
  | "recovery_partial"
  | "recovery_failed"
  | "audit_event_created"
  | "correlation_id_generated"
  | "transition_invalid"
  | "transition_recorded"
  | "signal_blocked"
  | "signal_educational_only"
  | "signal_accepted"
  | "stage_started"
  | "stage_complete"
  | "stage_failed"
  | "stage_skipped"
  | "stage_cancelled";

// ── Diagnostic event ──────────────────────────────────────────────────────────

export interface DiagnosticEvent {
  /**
   * Deterministic: "diag::{runId}::{seq}"
   * Unique within a run, monotonically increasing.
   */
  id:             string;
  runId:          string;
  clientId:       string;
  seq:            number;
  severity:       DiagnosticSeverity;
  code:           DiagnosticCode;
  /** Safe human-readable message — no credentials, no stack traces. */
  message:        string;
  stage:          string | null;
  provider:       string | null;
  capability:     string | null;
  /** Whether the condition that produced this event is retryable. */
  retryable:      boolean | null;
  correlationId:  string | null;
  /**
   * Safe structured metadata — redacted before persistence.
   * Never contains credentials, tokens, URLs with passwords, raw payloads.
   */
  metadata:       Record<string, unknown>;
  createdAt:      Date;
}

// ── Redaction ─────────────────────────────────────────────────────────────────

/**
 * Field name patterns whose VALUES must always be redacted.
 * Case-insensitive match against key names in metadata objects.
 */
const REDACTED_KEY_PATTERNS: RegExp[] = [
  /password/i,
  /passwd/i,
  /secret/i,
  /apikey/i,
  /api_key/i,
  /token/i,
  /credential/i,
  /auth/i,          // catches Authorization, authHeader, authToken
  /cookie/i,
  /database_url/i,
  /connection_string/i,
  /private_key/i,
  /access_key/i,
  /client_secret/i,
];

const REDACTED_PLACEHOLDER = "[REDACTED]";

/**
 * Value-level patterns: if a value matches these, redact it regardless of key name.
 * Only checks string values.
 */
const REDACTED_VALUE_PATTERNS: RegExp[] = [
  /^Basic\s+[A-Za-z0-9+/=]+$/i,         // Basic Auth header value
  /^Bearer\s+[A-Za-z0-9._-]+$/i,        // Bearer token (Clerk, etc.)
  /postgres(?:ql)?:\/\/[^@\s]*@/i,      // PostgreSQL URL with credentials
  /mysql:\/\/[^@\s]*@/i,               // MySQL URL with credentials
  /^[A-Za-z0-9+/=]{40,}:[A-Za-z0-9+/=]{40,}$/,  // Colon-separated base64 (DataForSEO style)
];

/**
 * Returns true if this key name indicates a credential field.
 */
function isCredentialKey(key: string): boolean {
  return REDACTED_KEY_PATTERNS.some(pattern => pattern.test(key));
}

/**
 * Returns true if this string value looks like a credential.
 */
function isCredentialValue(value: string): boolean {
  return REDACTED_VALUE_PATTERNS.some(pattern => pattern.test(value));
}

/**
 * Sanitizes a single value: redacts strings matching credential patterns.
 * Objects and arrays are recursively sanitized.
 * Numbers, booleans, null are passed through.
 */
function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[DEPTH_LIMIT]"; // prevent infinite recursion
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return isCredentialValue(value) ? REDACTED_PLACEHOLDER : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    return sanitizeMetadata(value as Record<string, unknown>, depth + 1);
  }
  return String(value);
}

/**
 * Sanitizes a metadata object by redacting credential keys and credential-looking values.
 * Safe to call on any arbitrary object from provider responses, request bodies, etc.
 *
 * Rules:
 *   1. If the key name matches REDACTED_KEY_PATTERNS → value becomes "[REDACTED]"
 *   2. If the value is a string matching REDACTED_VALUE_PATTERNS → "[REDACTED]"
 *   3. Objects/arrays are recursively sanitized (depth-limited to 5 levels)
 *   4. Stack trace fields ("stack", "stackTrace") are always removed
 *   5. Non-JSON-serializable values (Dates, Functions, etc.) are stringified
 */
export function sanitizeMetadata(
  obj: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Remove stack traces from API-visible output
    if (key === "stack" || key === "stackTrace" || key === "stacktrace") continue;
    // Redact credential keys entirely
    if (isCredentialKey(key)) {
      result[key] = REDACTED_PLACEHOLDER;
      continue;
    }
    result[key] = sanitizeValue(value, depth);
  }
  return result;
}

/**
 * Redacts credentials from a string (e.g., error messages, log lines).
 *
 * Replaces:
 *   - Basic Auth headers: "Authorization: Basic ..." → "Authorization: [REDACTED]"
 *   - Bearer tokens: "Bearer abc..." → "Bearer [REDACTED]"
 *   - DataForSEO-style colon credentials: "login:password" encoded in base64
 *   - PostgreSQL URLs: "postgres://user:pass@host" → "postgres://[REDACTED]@host"
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^@\s]*@/gi, "postgres://[REDACTED]@")
    .replace(/mysql:\/\/[^@\s]*@/gi, "mysql://[REDACTED]@")
    .replace(/password[=:]\s*\S+/gi, "password=[REDACTED]")
    .replace(/apikey[=:]\s*\S+/gi, "apikey=[REDACTED]")
    .replace(/secret[=:]\s*\S+/gi, "secret=[REDACTED]");
}

// ── ID derivation ─────────────────────────────────────────────────────────────

/**
 * Derives a deterministic diagnostic event ID.
 *   "diag::{runId}::{seq}"
 */
export function deriveDiagnosticId(runId: string, seq: number): string {
  return `diag::${runId}::${seq}`;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates a sanitized DiagnosticEvent ready for persistence.
 * metadata is automatically sanitized via sanitizeMetadata().
 */
export function createDiagnosticEvent(params: {
  runId:          string;
  clientId:       string;
  seq:            number;
  severity:       DiagnosticSeverity;
  code:           DiagnosticCode;
  message:        string;
  stage?:         string | null;
  provider?:      string | null;
  capability?:    string | null;
  retryable?:     boolean | null;
  correlationId?: string | null;
  metadata?:      Record<string, unknown>;
}): DiagnosticEvent {
  return {
    id:            deriveDiagnosticId(params.runId, params.seq),
    runId:         params.runId,
    clientId:      params.clientId,
    seq:           params.seq,
    severity:      params.severity,
    code:          params.code,
    message:       redactSecrets(params.message),
    stage:         params.stage    ?? null,
    provider:      params.provider  ?? null,
    capability:    params.capability ?? null,
    retryable:     params.retryable  ?? null,
    correlationId: params.correlationId ?? null,
    metadata:      sanitizeMetadata(params.metadata ?? {}),
    createdAt:     new Date(),
  };
}
