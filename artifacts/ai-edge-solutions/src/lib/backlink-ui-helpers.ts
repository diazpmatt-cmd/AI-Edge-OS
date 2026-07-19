export const OPP_PAGE_SIZE = 20;

export const BACKLINK_OPPORTUNITY_CATEGORIES = [
  "competitor_link_gap",
  "citation_directory",
  "local_partnership",
  "sponsorship_organization",
  "niche_industry_link",
  "guest_post",
  "resource_page",
  "broken_link",
  "unlinked_mention",
  "linkable_asset_content_gap",
] as const;

export type BacklinkOpportunityCategoryFE = typeof BACKLINK_OPPORTUNITY_CATEGORIES[number] | "all";

export const BACKLINK_WORKFLOW_STATUSES = [
  "discovered",
  "reviewing",
  "approved",
  "pursuing",
  "won",
  "rejected",
  "expired",
] as const;

export type BacklinkWorkflowStatusFE = typeof BACKLINK_WORKFLOW_STATUSES[number] | "all";

export const WORKFLOW_STATUS_COLORS: Record<string, string> = {
  won:        "#22C55E",
  pursuing:   "#38BDF8",
  approved:   "#38BDF8",
  reviewing:  "#F59E0B",
  rejected:   "#EF4444",
  expired:    "#EF4444",
  discovered: "#64748B",
};

export function wfStatusColor(status: string): string {
  return WORKFLOW_STATUS_COLORS[status] ?? "#64748B";
}

export function oppCategoryLabel(category: string): string {
  return category
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── C8R-9: Scheduling & History helpers ──────────────────────────────────────

/**
 * Format an ISO timestamp as a short relative-time string.
 * Examples: "Just now", "14m ago", "3h ago", "5d ago", "Never"
 */
export function formatRelativeTime(isoTimestamp: string | Date | null | undefined): string {
  if (!isoTimestamp) return "Never";
  const d = typeof isoTimestamp === "string" ? new Date(isoTimestamp) : isoTimestamp;
  if (isNaN(d.getTime())) return "Unknown";
  const diffMs  = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60)  return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60)  return `${diffMin}m ago`;
  const diffH   = Math.floor(diffMin / 60);
  if (diffH   < 24)  return `${diffH}h ago`;
  const diffD   = Math.floor(diffH   / 24);
  if (diffD   < 30)  return `${diffD}d ago`;
  return `${Math.floor(diffD / 30)}mo ago`;
}

/** Human-friendly label for a schedule frequency. */
export function scheduleFrequencyLabel(frequency: string | null | undefined): string {
  if (!frequency) return "Not set";
  const labels: Record<string, string> = {
    daily:    "Daily",
    weekly:   "Weekly",
    biweekly: "Every 2 Weeks",
  };
  return labels[frequency] ?? frequency;
}

/** Icon, label, and colour for a scheduled run status. */
export function scheduledRunStatusConfig(
  status: string | null | undefined,
): { icon: string; label: string; color: string } {
  if (!status) return { icon: "○", label: "Not run yet", color: "#475569" };
  const map: Record<string, { icon: string; label: string; color: string }> = {
    succeeded:            { icon: "✓", label: "Succeeded",            color: "#22C55E" },
    failed:               { icon: "✕", label: "Failed",               color: "#EF4444" },
    provider_unavailable: { icon: "⚠", label: "Provider Unavailable", color: "#F59E0B" },
  };
  return map[status] ?? { icon: "○", label: status, color: "#475569" };
}

/** Format a score delta as a signed string: "+5" / "-3" / "±0" */
export function formatScoreDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "±0";
}

/**
 * Build SVG polyline "points" string from an array of numeric values.
 * Normalises values into a (width × height) viewport.
 */
export function buildSparklinePoints(
  values: readonly number[],
  width:  number,
  height: number,
): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `0,${height / 2} ${width},${height / 2}`;
  const minVal  = Math.min(...values);
  const maxVal  = Math.max(...values);
  const range   = maxVal - minVal || 1;
  const stepX   = width / (values.length - 1);
  return values
    .map((v, i) => {
      const x = Math.round(i * stepX);
      const y = Math.round(height - ((v - minVal) / range) * height);
      return `${x},${y}`;
    })
    .join(" ");
}

/** Provider health status → colour mapping. */
export function providerHealthColor(overallStatus: string | undefined): string {
  if (overallStatus === "ready")        return "#22C55E";
  if (overallStatus === "degraded")     return "#F59E0B";
  if (overallStatus === "unavailable")  return "#EF4444";
  return "#64748B";
}

export function attainabilityColor(score: number): string {
  if (score >= 70) return "#22C55E";
  if (score >= 40) return "#F59E0B";
  return "#94A3B8";
}

export function computeBacklinkScore(
  items: ReadonlyArray<{ opportunity: { attainability: number } }>,
): number {
  if (items.length === 0) return 0;
  const avg = items.reduce((s, o) => s + o.opportunity.attainability, 0) / items.length;
  return Math.min(100, Math.round(avg));
}

export function formatRunSummary(run: {
  counts_accepted?: number | null;
  counts_rejected?: number | null;
  counts_observed?: number | null;
}): string {
  const accepted = run.counts_accepted ?? 0;
  const observed = run.counts_observed ?? 0;
  const rejected = run.counts_rejected ?? 0;
  return `${accepted} accepted · ${rejected} rejected (${observed} observed)`;
}

export function isPageEnd(itemCount: number, pageSize: number): boolean {
  return itemCount < pageSize;
}

export function shortRunId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export function runStatusColor(status: string): string {
  if (status === "succeeded" || status === "completed") return "#22C55E";
  if (status === "failed")    return "#EF4444";
  if (status === "in_progress" || status === "running") return "#38BDF8";
  return "#64748B";
}
