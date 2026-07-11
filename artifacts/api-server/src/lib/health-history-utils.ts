// Pure, testable helper functions for Integration Health History.
// No database imports — these can be unit-tested without mocking DB.

// How long an unchanged status can remain before a heartbeat is written.
export const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// ── Sanitization ──────────────────────────────────────────────────────────────

/**
 * Redact token-shaped strings from provider error detail text.
 * Never logs the original value; returns a safe, truncated string.
 *
 * Covers:
 *   - Google access tokens  (ya29.*)
 *   - Google refresh tokens (1//*)
 *   - Meta/Facebook tokens  (EAA* family)
 *   - Generic Bearer header values
 *   - access_token / refresh_token / client_secret / api_key / authorization key=value pairs
 */
export function sanitizeDetail(raw: string): string {
  return raw
    .replace(/ya29\.[A-Za-z0-9_\-.]{10,}/g, "[redacted]")
    .replace(/1\/\/[A-Za-z0-9_\-.]{10,}/g, "[redacted]")
    .replace(/EAA[A-Za-z]{0,4}[A-Za-z0-9]{10,}/g, "[redacted]")
    .replace(/Bearer\s+\S{8,}/gi, "Bearer [redacted]")
    .replace(
      /(?:access_token|refresh_token|client_secret|api_key|authorization)\s*[=:]\s*\S{8,}/gi,
      "[redacted]",
    )
    .slice(0, 300);
}

// ── Score mapping ─────────────────────────────────────────────────────────────

export function healthScore(status: string): number {
  if (status === "healthy") return 100;
  if (status === "warning") return 50;
  return 0;
}

// ── Allowlist metadata ────────────────────────────────────────────────────────

/**
 * Extract only known-safe, non-sensitive fields for JSONB storage.
 * Uses an allowlist: nothing passes unless explicitly named here.
 *
 * Fields reviewed and confirmed safe:
 *   google_business.locationTitle — business display name, no credentials
 *   google_business.cooldownUntil — timestamp, no credentials
 *   youtube.uploadScopeGranted    — boolean, no credentials
 *   youtube.uploadPermissionVerified — boolean, no credentials
 *   youtube.channelName           — display name, no credentials
 *   tiktok.publishReady           — boolean, no credentials
 */
export function safeMeta(
  provider: string,
  ph: Record<string, unknown>,
): Record<string, unknown> {
  const m: Record<string, unknown> = {};

  if (provider === "google_business") {
    if (typeof ph.locationTitle === "string")
      m.locationTitle = ph.locationTitle.slice(0, 100);
    if (ph.cooldownUntil != null) m.cooldownUntil = ph.cooldownUntil;
  }

  if (provider === "youtube") {
    if (ph.uploadScopeGranted !== undefined)
      m.uploadScopeGranted = ph.uploadScopeGranted;
    if (ph.uploadPermissionVerified !== undefined)
      m.uploadPermissionVerified = ph.uploadPermissionVerified;
    if (typeof ph.channelName === "string")
      m.channelName = ph.channelName.slice(0, 100);
  }

  if (provider === "tiktok") {
    if (ph.publishReady !== undefined) m.publishReady = ph.publishReady;
  }

  return m;
}

// ── Deduplication decision (pure, no DB) ──────────────────────────────────────

export interface LastHealthRecord {
  status: string;
  error_message: string | null;
  health_score: number | null;
  checked_at: Date;
  metadata: Record<string, unknown> | null;
}

export interface PendingInsert {
  provider: string;
  status: string;
  checkedAt: Date;
  lastSuccessAt: Date | null;
  errorMessage: string | null;
  healthScore: number;
  metadata: Record<string, unknown>;
  isHeartbeat: boolean;
}

/**
 * Decide whether a new history row should be written for a given provider.
 *
 * Rules:
 *   1. No prior record              → insert immediately
 *   2. State changed                → insert immediately
 *   3. State unchanged, < 15 min    → skip (still fresh)
 *   4. State unchanged, >= 15 min   → insert heartbeat (continuity for charts)
 *
 * Returns null when no insert is needed.
 */
export function decideInsert(
  provider: string,
  ph: Record<string, unknown>,
  last: LastHealthRecord | undefined,
  checkedAt: Date,
): PendingInsert | null {
  const currentStatus = String(ph.status);
  const currentError =
    ph.status !== "healthy"
      ? sanitizeDetail(String(ph.detail ?? ""))
      : null;
  const currentScore = healthScore(currentStatus);
  const currentMeta = safeMeta(provider, ph);

  const row: PendingInsert = {
    provider,
    status: currentStatus,
    checkedAt,
    lastSuccessAt: ph.status === "healthy" ? checkedAt : null,
    errorMessage: currentError,
    healthScore: currentScore,
    metadata: currentMeta,
    isHeartbeat: false,
  };

  if (!last) return row; // Rule 1

  const unchanged =
    last.status === currentStatus &&
    (last.error_message ?? null) === (currentError ?? null) &&
    (last.health_score ?? null) === currentScore &&
    JSON.stringify(last.metadata ?? {}) === JSON.stringify(currentMeta);

  if (!unchanged) return row; // Rule 2

  const heartbeatCutoff = new Date(checkedAt.getTime() - HEARTBEAT_INTERVAL_MS);
  if (new Date(last.checked_at) <= heartbeatCutoff) {
    return { ...row, isHeartbeat: true }; // Rule 4
  }

  return null; // Rule 3 — skip
}

// ── Limit validation ──────────────────────────────────────────────────────────

/**
 * Parse and validate the ?limit= query parameter.
 * Accepts only finite positive integers; clamps to 500; defaults to 100.
 */
export function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 100;
  return Math.min(Math.floor(n), 500);
}
