// ── Local Presence — Provider Adapter Contracts ─────────────────────────────
// Pure types and pure mapping functions. No database or HTTP access in this file.
// Adapter implementations that require I/O live in artifacts/api-server/src/lib/.

import type { GbpAuditSnapshot } from "./schema/gbp-audit";

// ── Capability declaration ────────────────────────────────────────────────────
// Describes what a given provider's adapter is capable of doing.
// Each entry in LOCAL_PRESENCE_PROVIDERS carries a `capabilities` field.

export interface ProviderAdapterCapabilities {
  syncSupported: boolean;
  writeSupported: boolean;
  fetchHours: boolean;
  fetchPhotos: boolean;
  fetchReviews: boolean;
  fetchCategories: boolean;
  oauthRequired: boolean;
}

// ── Normalized types ──────────────────────────────────────────────────────────

export interface NormalizedListingIssue {
  severity: "critical" | "high" | "medium" | "low";
  code: string;
  message: string;
}

export interface NormalizedListingUpdate {
  score: number;
  healthScore: number;
  status: string;
  verificationStatus: string;
  issues: NormalizedListingIssue[];
  lastSyncAt: Date;
}

// ── GBP snapshot → normalized channel update ─────────────────────────────────
// Pure function — derives local presence channel health from a completed GBP
// audit snapshot. Called at read time by LocalPresenceRepository.getDashboard().
// No side effects, no I/O.

export function mapGbpSnapshotToChannelUpdate(
  snapshot: GbpAuditSnapshot,
): NormalizedListingUpdate {
  const issues: NormalizedListingIssue[] = [];

  if (!snapshot.gbpConnected) {
    issues.push({
      severity: "critical",
      code: "gbp_not_connected",
      message: "Google Business Profile is not connected via OAuth",
    });
  }

  if (snapshot.checksFailed > 0) {
    issues.push({
      severity: "high",
      code: "gbp_checks_failed",
      message: `${snapshot.checksFailed} audit check${snapshot.checksFailed > 1 ? "s" : ""} failed`,
    });
  }

  if (snapshot.checksWarning > 0) {
    issues.push({
      severity: "medium",
      code: "gbp_checks_warning",
      message: `${snapshot.checksWarning} audit check${snapshot.checksWarning > 1 ? "s" : ""} need attention`,
    });
  }

  const isComplete = snapshot.status === "complete";
  const score = isComplete ? snapshot.overallScore : 0;

  return {
    score,
    healthScore: score,
    status: snapshot.gbpConnected && isComplete ? "connected" : "setup_in_progress",
    verificationStatus: snapshot.gbpConnected ? "verified" : "pending",
    issues,
    lastSyncAt: (snapshot.completedAt ?? snapshot.updatedAt) as Date,
  };
}

// ── Fallback for clients with no audit run ────────────────────────────────────

export const NO_GBP_AUDIT_UPDATE: NormalizedListingUpdate = {
  score: 0,
  healthScore: 0,
  status: "not_started",
  verificationStatus: "not_started",
  issues: [
    {
      severity: "high",
      code: "no_audit_run",
      message: "No GBP audit has been run yet — trigger a scan to populate this score",
    },
  ],
  lastSyncAt: new Date(0),
};
