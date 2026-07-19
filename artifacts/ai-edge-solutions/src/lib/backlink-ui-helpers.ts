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
  if (status === "completed") return "#22C55E";
  if (status === "failed")    return "#EF4444";
  if (status === "in_progress" || status === "running") return "#38BDF8";
  return "#64748B";
}
