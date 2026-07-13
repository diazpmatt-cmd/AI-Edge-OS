import type { GitHubClock, GitHubDiagnostic, GitHubDiagnosticCode, GitHubRateLimitObservation } from "./types";

export interface GitHubBackoff { readonly diagnostic: GitHubDiagnosticCode; readonly retryAt: string; readonly delayMs: number; }

export function calculateBackoff(input: { readonly observation: GitHubRateLimitObservation; readonly attempt: number; readonly clock: GitHubClock; readonly maximumDelayMs?: number }): GitHubBackoff {
  const now = new Date(input.clock.now()).getTime(); const cap = input.maximumDelayMs ?? 15 * 60_000;
  const signaled = Math.max((input.observation.retryAfterSeconds ?? 0) * 1000, input.observation.resetAt ? new Date(input.observation.resetAt).getTime() - now : 0);
  const fallback = Math.min(1000 * 2 ** Math.min(Math.max(input.attempt, 0), 8), cap);
  const delayMs = Math.max(1000, Math.min(Math.max(signaled, fallback), cap));
  return Object.freeze({ diagnostic: input.observation.kind === "primary" ? "rate_limited" : "secondary_rate_limited", retryAt: new Date(now + delayMs).toISOString(), delayMs });
}

export function diagnoseReconciliationLag(lastObservedAt: string | null, clock: GitHubClock, maximumLagMs = 60 * 60_000): GitHubDiagnostic | null {
  if (!lastObservedAt) return Object.freeze({ code: "lagging", evidenceId: null, detail: "no authoritative observation has been recorded" });
  const lag = new Date(clock.now()).getTime() - new Date(lastObservedAt).getTime();
  return lag > maximumLagMs ? Object.freeze({ code: "lagging", evidenceId: null, detail: "authoritative observation is outside the bounded freshness window" }) : null;
}
