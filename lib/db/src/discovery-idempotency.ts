/**
 * Phase C6 — Idempotent Execution Requests
 *
 * Prevents duplicate runs and provider charges from concurrent or replayed
 * manual-run requests.
 *
 * Idempotency contract:
 *   - Key is scoped by (clientId × operation × isDryRun × userSuppliedKey).
 *   - Same key + equivalent request → original result returned.
 *   - Same key + materially different input → rejected with mismatch error.
 *   - Different clients using the same key string → no collision (tenant-scoped).
 *   - Dry-run and live-run keys are isolated (isDryRun is part of the scope).
 *   - Records expire after IDEMPOTENCY_TTL_MS (default 24 hours).
 *   - Concurrent identical requests resolve atomically via ON CONFLICT DO NOTHING.
 *   - Caller-supplied run IDs are NOT trusted as idempotency keys.
 *
 * Header convention (following existing API patterns):
 *   Idempotency-Key: <caller-supplied UUID or opaque string>
 *   Max length: 128 characters. Printable ASCII only.
 *
 * No Math.random(). No secrets stored in idempotency records.
 */

import { createHash } from "node:crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default idempotency record lifetime. Records beyond this may be pruned. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Maximum allowed idempotency key length (characters). */
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

/** Regex for valid idempotency keys: printable ASCII, no control characters. */
export const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7E]{1,128}$/;

// ── Operation type ─────────────────────────────────────────────────────────────

export type IdempotencyOperation = "manual_run" | "dry_run" | "scheduled_run";

// ── Idempotency record ─────────────────────────────────────────────────────────

/**
 * Persisted record for one idempotency key claim.
 * Stored in discovery_idempotency table.
 */
export interface IdempotencyRecord {
  /**
   * Deterministic:
   *   "idem::{clientId}::{operation}::{isDryRun ? 'dry' : 'live'}::{key}"
   */
  id:               string;
  clientId:         string;
  idempotencyKey:   string;
  operation:        IdempotencyOperation;
  /**
   * SHA-256 of the material request parameters (mode, costCeiling, seeds).
   * Compared on replay to detect materially different requests with the same key.
   * NOT the raw request body — sanitized before hashing.
   */
  requestFingerprint: string;
  /**
   * Run ID assigned to this idempotency claim.
   * null for dry-run requests (no run is created).
   */
  runId:            string | null;
  isDryRun:         boolean;
  /** HTTP status code of the original response. */
  responseStatus:   number | null;
  /**
   * Safe subset of the original response body.
   * Must not contain: credentials, tokens, raw provider payloads.
   * Typically includes: runId, status, plan summary, dryRun flag.
   */
  responseBody:     Record<string, unknown> | null;
  createdAt:        Date;
  expiresAt:        Date;
}

// ── Check result ──────────────────────────────────────────────────────────────

export type IdempotencyCheckResult =
  | { found: false }
  | { found: true;  match: true;  record: IdempotencyRecord }
  | { found: true;  match: false; reason: "fingerprint_mismatch" | "expired" };

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Derives the deterministic idempotency record ID.
 *
 *   "idem::{clientId}::{operation}::{isDryRun ? 'dry' : 'live'}::{key}"
 *
 * Tenant-safe: clientId is always part of the scope.
 * Dry/live isolated: isDryRun prevents dry-run keys from blocking live runs.
 */
export function deriveIdempotencyId(
  clientId:       string,
  key:            string,
  operation:      IdempotencyOperation,
  isDryRun:       boolean,
): string {
  return `idem::${clientId}::${operation}::${isDryRun ? "dry" : "live"}::${key}`;
}

/**
 * Derives a stable request fingerprint from material request parameters.
 *
 * "Material" parameters are those that meaningfully change the operation:
 *   - mode (orchestration mode)
 *   - costCeilingUSD (budget constraint)
 *   - isDryRun (dry vs live)
 *
 * Non-material (excluded):
 *   - correlationId (unique per request — must not affect fingerprint)
 *   - timestamps
 *   - request metadata
 *
 * Returns the first 32 hex chars of SHA-256(canonicalJSON).
 * Not a secret — safe to log and store.
 */
export function deriveRequestFingerprint(params: {
  mode:           string;
  costCeilingUSD: number;
  isDryRun:       boolean;
}): string {
  const canonical = JSON.stringify({
    mode:           params.mode,
    costCeilingUSD: params.costCeilingUSD,
    isDryRun:       params.isDryRun,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

/**
 * Validates that a caller-supplied idempotency key meets format requirements.
 *
 * Returns null if valid, or an error message string if invalid.
 */
export function validateIdempotencyKey(key: unknown): string | null {
  if (typeof key !== "string") return "Idempotency-Key must be a string";
  if (key.length === 0)        return "Idempotency-Key must not be empty";
  if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return `Idempotency-Key must not exceed ${IDEMPOTENCY_KEY_MAX_LENGTH} characters`;
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return "Idempotency-Key must contain only printable ASCII characters";
  }
  return null;
}

/**
 * Returns true if the idempotency record has expired.
 * Expired records should not be used for replay but may still be audited.
 */
export function isIdempotencyExpired(record: IdempotencyRecord, now: Date = new Date()): boolean {
  return record.expiresAt.getTime() <= now.getTime();
}

/**
 * Returns true if the two fingerprints match (constant-time comparison not
 * needed here — fingerprints are not secrets).
 */
export function fingerprintMatches(a: string, b: string): boolean {
  return a === b;
}

/**
 * Derives the expiry timestamp for a new idempotency record.
 */
export function deriveIdempotencyExpiry(now: Date = new Date(), ttlMs: number = IDEMPOTENCY_TTL_MS): Date {
  return new Date(now.getTime() + ttlMs);
}
