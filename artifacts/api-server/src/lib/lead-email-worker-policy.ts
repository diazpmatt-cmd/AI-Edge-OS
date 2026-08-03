export const DEFAULT_CHECKPOINT_OVERLAP_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_STALE_AFTER_MS = 20 * 60 * 1000;

const MAX_SAFE_ERROR_CHARS = 300;
const MAX_GMAIL_QUERY_CHARS = 1_000;

export function buildCheckpointedGmailQuery(
  baseQuery: string,
  checkpointInternalDateMs: number | null,
  overlapMs = DEFAULT_CHECKPOINT_OVERLAP_MS,
): string {
  const normalized = baseQuery.trim();
  if (!normalized) throw new Error("GMAIL_LEAD_QUERY must not be empty");
  if (normalized.length > MAX_GMAIL_QUERY_CHARS) throw new Error("GMAIL_LEAD_QUERY is too long");
  if (!Number.isFinite(overlapMs) || overlapMs < 0 || overlapMs > 7 * 24 * 60 * 60 * 1000) {
    throw new Error("GMAIL_CHECKPOINT_OVERLAP_MS must be between 0 and 604800000");
  }
  if (checkpointInternalDateMs === null) return normalized;
  if (!Number.isFinite(checkpointInternalDateMs) || checkpointInternalDateMs < 0) {
    throw new Error("checkpointInternalDateMs must be a non-negative finite number");
  }

  const afterSeconds = Math.max(0, Math.floor((checkpointInternalDateMs - overlapMs) / 1_000));
  return `(${normalized}) after:${afterSeconds}`;
}

export function computeRetryDelayMs(
  failureCount: number,
  pollMs: number,
  maxBackoffMs: number,
): number {
  if (!Number.isInteger(failureCount) || failureCount < 1) throw new Error("failureCount must be at least 1");
  if (!Number.isFinite(pollMs) || pollMs < 1) throw new Error("pollMs must be positive");
  if (!Number.isFinite(maxBackoffMs) || maxBackoffMs < pollMs) {
    throw new Error("maxBackoffMs must be at least pollMs");
  }
  return Math.min(maxBackoffMs, pollMs * (2 ** Math.min(failureCount - 1, 6)));
}

export function sanitizeWorkerError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[redacted-token]")
    .replace(/\b(client_secret|refresh_token|access_token|id_token)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/"(client_secret|refresh_token|access_token|id_token)"\s*:\s*"[^"]+"/gi, '"$1":"[redacted]"')
    .slice(0, MAX_SAFE_ERROR_CHARS);
}

export function classifyWorkerErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("timed out") || (error instanceof Error && error.name === "AbortError")) return "GMAIL_TIMEOUT";
  if (message.includes("status 401") || message.includes("status 403")) return "GMAIL_AUTHORIZATION_FAILED";
  if (message.includes("status 429")) return "GMAIL_RATE_LIMITED";
  if (message.includes("Gmail API request failed")) return "GMAIL_API_FAILED";
  if (message.includes("DATABASE_URL") || message.includes("database") || message.includes("ECONNREFUSED")) return "DATABASE_FAILED";
  return "LEAD_EMAIL_POLL_FAILED";
}

export function nextCheckpointInternalDateMs(
  currentCheckpointMs: number | null,
  processedInternalDatesMs: readonly number[],
): number | null {
  const valid = processedInternalDatesMs.filter((value) => Number.isFinite(value) && value >= 0);
  if (!valid.length) return currentCheckpointMs;
  const candidate = Math.max(...valid);
  return currentCheckpointMs === null ? candidate : Math.max(currentCheckpointMs, candidate);
}

export function isWorkerStale(
  lastSuccessfulPollAt: Date | null,
  now = new Date(),
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
): boolean {
  if (!Number.isFinite(staleAfterMs) || staleAfterMs < 1) throw new Error("staleAfterMs must be positive");
  if (!lastSuccessfulPollAt) return true;
  return now.getTime() - lastSuccessfulPollAt.getTime() > staleAfterMs;
}
