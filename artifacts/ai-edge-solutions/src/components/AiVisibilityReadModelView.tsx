import React, { useState } from "react";

// ── Frontend-local types (mirror API response shape) ──────────────────────────

export type RMCoverageStatus =
  | "available" | "not_connected" | "not_implemented"
  | "not_tenant_safe" | "no_observation";

export type RMPriority    = "critical" | "high" | "medium" | "low";
export type RMCategory    = "local_presence" | "citation_directory" | "review_intelligence"
                          | "discovery" | "backlink" | "content" | "measurement";
export type RMWorkflowKind = "local_presence" | "discovery" | "backlink" | "content_autopilot" | "measurement";
export type RMSource       = "local_presence" | "google_business" | "discovery" | "backlink"
                           | "reviews" | "content" | "google_search_console" | "google_analytics";

export interface RMCoverageDiagnostic {
  source: RMSource;
  status: RMCoverageStatus;
  detail: string;
  observedAt: string | null;
}

export interface RMRecommendation {
  id: string;
  clientId: string;
  category: RMCategory;
  serviceId: string | null;
  geography: string;
  title: string;
  priority: RMPriority;
  whatWasObserved: readonly string[];
  whyItMatters: readonly string[];
  evidence: readonly string[];
  references: readonly { source: string; recordType: string; recordId: string; clientId: string; observedAt: string }[];
  workflow: { kind: RMWorkflowKind; recordId: string; action: string };
  humanApprovalRequired: boolean;
  lifecycle: null | { preparation: string; approval: string; dispatch: string; delivery: string };
  potentialValue: number;
  attainability: number;
  potentialFactors: null | Record<string, unknown>;
  attainabilityFactors: null | Record<string, unknown>;
  basis: "weighted" | "canonical_backlink";
}

export interface RMRejectedInput {
  dedupeKey: string;
  code: string;
  reason: string;
  references?: readonly unknown[];
}

export interface RMReadModel {
  id: string;
  clientId: string;
  generatedAt: string;
  recommendations: readonly RMRecommendation[];
  coverage: readonly RMCoverageDiagnostic[];
  rejected: readonly RMRejectedInput[];
  summary: {
    recommendationCount: number;
    rejectedCount: number;
    availableSourceCount: number;
    unavailableSourceCount: number;
  };
}

// ── Pure helpers (exported for tests) ─────────────────────────────────────────

export function getCoverageStatusConfig(status: string): {
  color: string; label: string; icon: string; bgColor: string;
} {
  switch (status) {
    case "available":       return { color: "#22C55E", bgColor: "rgba(34,197,94,0.08)",   label: "Available",      icon: "✓" };
    case "not_connected":   return { color: "#F59E0B", bgColor: "rgba(245,158,11,0.08)",  label: "Not Connected",  icon: "⚡" };
    case "not_implemented": return { color: "#6366F1", bgColor: "rgba(99,102,241,0.08)",  label: "Coming Soon",    icon: "🔜" };
    case "not_tenant_safe": return { color: "#00AEEF", bgColor: "rgba(0,174,239,0.08)",   label: "Setup Required", icon: "🔐" };
    case "no_observation":  return { color: "#64748B", bgColor: "rgba(100,116,139,0.08)", label: "No Data Yet",    icon: "○" };
    default:                return { color: "#64748B", bgColor: "rgba(100,116,139,0.08)", label: status,           icon: "?" };
  }
}

export function getPriorityConfig(priority: string): { color: string; label: string; icon: string } {
  switch (priority) {
    case "critical": return { color: "#EF4444", label: "Critical", icon: "🚨" };
    case "high":     return { color: "#F59E0B", label: "High",     icon: "🔥" };
    case "medium":   return { color: "#3B82F6", label: "Medium",   icon: "⚡" };
    case "low":      return { color: "#6B7280", label: "Low",      icon: "💡" };
    default:         return { color: "#6B7280", label: priority,   icon: "•"  };
  }
}

export function getCategoryConfig(category: string): { color: string; label: string; icon: string } {
  switch (category) {
    case "local_presence":      return { color: "#00AEEF", label: "Local Presence",      icon: "📍" };
    case "citation_directory":  return { color: "#22C55E", label: "Citation Directory",  icon: "📋" };
    case "review_intelligence": return { color: "#FBBF24", label: "Review Intelligence", icon: "⭐" };
    case "discovery":           return { color: "#8B5CF6", label: "Discovery",           icon: "🔍" };
    case "backlink":            return { color: "#F59E0B", label: "Authority & Backlink", icon: "🔗" };
    case "content":             return { color: "#FB923C", label: "Content",             icon: "📝" };
    case "measurement":         return { color: "#6366F1", label: "Measurement",         icon: "📊" };
    default:                    return { color: "#94A3B8", label: category,              icon: "•"  };
  }
}

export function getWorkflowRoute(kind: string): string {
  switch (kind) {
    case "local_presence":    return "/admin/local-presence";
    case "discovery":         return "/admin/competitor-intelligence";
    case "backlink":          return "/admin/authority-engine";
    case "content_autopilot": return "/admin/content-autopilot";
    case "measurement":       return "/admin/ai-visibility";
    default:                  return "/admin/ai-visibility";
  }
}

export function getWorkflowLabel(kind: string): string {
  switch (kind) {
    case "local_presence":    return "Local Presence Engine";
    case "discovery":         return "Competitor Intelligence";
    case "backlink":          return "Authority & Backlink Engine";
    case "content_autopilot": return "Content Autopilot";
    case "measurement":       return "AI Visibility Engine";
    default:                  return "AI Visibility Engine";
  }
}

export function getSourceLabel(source: string): string {
  const map: Record<string, string> = {
    local_presence:        "Local Presence",
    google_business:       "Google Business",
    discovery:             "Discovery Engine",
    backlink:              "Authority & Backlinks",
    reviews:               "Review Intelligence",
    content:               "Content Autopilot",
    google_search_console: "Search Console",
    google_analytics:      "Google Analytics",
  };
  return map[source] ?? source.replace(/_/g, " ");
}

export function groupRecommendationsByPriority(
  recs: readonly RMRecommendation[],
): Record<string, RMRecommendation[]> {
  const groups: Record<string, RMRecommendation[]> = { critical: [], high: [], medium: [], low: [] };
  for (const rec of recs) {
    const key = rec.priority in groups ? rec.priority : "low";
    groups[key].push(rec as RMRecommendation);
  }
  return groups;
}

export function countAvailableSources(coverage: readonly RMCoverageDiagnostic[]): number {
  return coverage.filter(c => c.status === "available").length;
}

export function formatScore(v: number): string {
  return `${Math.round(Math.max(0, Math.min(100, v)))}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ThemeColors {
  text: string; text2: string; text3?: string;
  border: string; card: string; cardSubtle?: string;
  [key: string]: string | undefined;
}

interface Props {
  model: RMReadModel | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  isDark: boolean;
  colors: ThemeColors;
}

export default function AiVisibilityReadModelView({ model, loading, error, onRetry, isDark, colors: t }: Props) {
  const [expandedRec,  setExpandedRec]  = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  const card: React.CSSProperties = {
    background:   isDark ? "rgba(11,22,41,0.8)" : "#FFFFFF",
    border:       isDark ? "1px solid rgba(255,255,255,0.07)" : "1px solid #E5E7EB",
    borderRadius: 14,
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div data-testid="rm-loading" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            ...card, padding: "18px 20px",
            animation: "pulse 1.5s ease-in-out infinite",
            opacity: 1 - i * 0.15,
          }}>
            <div style={{ height: 12, width: `${70 - i * 10}%`, borderRadius: 6, background: isDark ? "rgba(255,255,255,0.07)" : "#E5E7EB", marginBottom: 10 }} />
            <div style={{ height: 9, width: "50%", borderRadius: 6, background: isDark ? "rgba(255,255,255,0.04)" : "#F3F4F6" }} />
          </div>
        ))}
        <style>{`@keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}`}</style>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div data-testid="rm-error" style={{
        ...card, padding: "24px 22px",
        borderLeft: "3px solid #EF4444",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#EF4444", marginBottom: 4 }}>⚠ Failed to load AI visibility data</div>
          <div style={{ fontSize: 12, color: t.text2 }}>{error}</div>
        </div>
        <button
          onClick={onRetry}
          data-testid="rm-retry-btn"
          style={{
            padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            color: "#EF4444", cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          ↺ Retry
        </button>
      </div>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────────────
  if (!model || model.recommendations.length === 0) {
    const availableCount = model ? countAvailableSources(model.coverage) : 0;
    return (
      <div data-testid="rm-empty" style={{ ...card, padding: "36px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 8 }}>
          {availableCount > 0 ? "No recommendations at this time" : "Connecting your data sources"}
        </div>
        <div style={{ fontSize: 13, color: t.text2, maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
          {availableCount > 0
            ? "All observed signals meet your authorized scope — great work. Run engines to generate fresh observations."
            : "Connect Local Presence, Authority, and Content engines to start generating AI visibility recommendations."}
        </div>
        {model && model.summary.rejectedCount > 0 && (
          <div style={{ marginTop: 16, fontSize: 12, color: "#6B7280" }}>
            {model.summary.rejectedCount} observations filtered by scope rules.
          </div>
        )}
      </div>
    );
  }

  // ── Data ─────────────────────────────────────────────────────────────────────
  const { summary, coverage, rejected } = model;
  const grouped = groupRecommendationsByPriority(model.recommendations);
  const priorityOrder: RMPriority[] = ["critical", "high", "medium", "low"];

  return (
    <div data-testid="rm-view">

      {/* ── Summary bar ────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap",
      }}>
        {[
          { label: "Recommendations", value: summary.recommendationCount, color: "#00AEEF" },
          { label: "Sources Active",  value: summary.availableSourceCount, color: "#22C55E" },
          { label: "Sources Offline", value: summary.unavailableSourceCount, color: "#F59E0B" },
          { label: "Filtered",        value: summary.rejectedCount,         color: "#64748B" },
        ].map(s => (
          <div key={s.label} style={{
            ...card, padding: "12px 18px",
            borderTop: `2px solid ${s.color}50`,
            display: "flex", flexDirection: "column", gap: 3, minWidth: 100,
          }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: isDark ? "#475569" : "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</div>
          </div>
        ))}
        <div style={{ ...card, padding: "12px 18px", display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.text2 }}>Generated</div>
          <div style={{ fontSize: 11, color: t.text }}>
            {new Date(model.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </div>
        </div>
      </div>

      {/* ── Recommendations by priority ─────────────────────────────────────── */}
      {priorityOrder.map(priority => {
        const recs = grouped[priority];
        if (!recs.length) return null;
        const pc = getPriorityConfig(priority);
        return (
          <div key={priority} style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11 }}>{pc.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: pc.color, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                {pc.label} Priority — {recs.length} {recs.length === 1 ? "item" : "items"}
              </span>
              <div style={{ flex: 1, height: 1, background: isDark ? "rgba(255,255,255,0.05)" : "#E5E7EB" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {recs.map(rec => {
                const cc = getCategoryConfig(rec.category);
                const isExpanded = expandedRec === rec.id;
                const route = getWorkflowRoute(rec.workflow.kind);
                const wfLabel = getWorkflowLabel(rec.workflow.kind);
                return (
                  <div key={rec.id} data-testid={`rec-card-${rec.id}`} style={{
                    ...card, padding: "16px 18px",
                    borderLeft: `3px solid ${pc.color}70`,
                  }}>
                    {/* Top row: badges + title */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 800, color: pc.color,
                          background: `${pc.color}12`, border: `1px solid ${pc.color}30`,
                          padding: "2px 8px", borderRadius: 20, textTransform: "uppercase",
                          letterSpacing: "0.4px", whiteSpace: "nowrap",
                        }}>
                          {pc.icon} {pc.label}
                        </span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: cc.color,
                          background: `${cc.color}12`, border: `1px solid ${cc.color}25`,
                          padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap",
                        }}>
                          {cc.icon} {cc.label}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, lineHeight: 1.4, marginBottom: 4 }}>{rec.title}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {rec.geography && rec.geography !== "unspecified" && (
                            <span style={{ fontSize: 9, color: isDark ? "#64748B" : "#9CA3AF", background: isDark ? "rgba(255,255,255,0.04)" : "#F3F4F6", padding: "2px 8px", borderRadius: 20 }}>
                              📍 {rec.geography}
                            </span>
                          )}
                          {rec.serviceId && (
                            <span style={{ fontSize: 9, color: isDark ? "#64748B" : "#9CA3AF", background: isDark ? "rgba(255,255,255,0.04)" : "#F3F4F6", padding: "2px 8px", borderRadius: 20 }}>
                              🛠 {rec.serviceId.replace(/_/g, " ")}
                            </span>
                          )}
                          {rec.humanApprovalRequired && (
                            <span style={{ fontSize: 9, color: "#FBBF24", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", padding: "2px 8px", borderRadius: 20 }}>
                              👤 Needs Approval
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Score mini-display */}
                      <div style={{ flexShrink: 0, textAlign: "right" }}>
                        <div style={{ fontSize: 20, fontWeight: 900, color: pc.color, lineHeight: 1 }}>{formatScore(rec.potentialValue)}</div>
                        <div style={{ fontSize: 8, color: isDark ? "#475569" : "#9CA3AF", textTransform: "uppercase" }}>potential</div>
                      </div>
                    </div>

                    {/* Score bars */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 8, fontWeight: 700, color: isDark ? "#475569" : "#9CA3AF", textTransform: "uppercase" }}>Potential Value</span>
                          <span style={{ fontSize: 8, fontWeight: 800, color: "#00AEEF" }}>{formatScore(rec.potentialValue)}</span>
                        </div>
                        <div style={{ height: 3, background: isDark ? "rgba(255,255,255,0.06)" : "#E5E7EB", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${rec.potentialValue}%`, background: "#00AEEF", borderRadius: 2 }} />
                        </div>
                      </div>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 8, fontWeight: 700, color: isDark ? "#475569" : "#9CA3AF", textTransform: "uppercase" }}>Attainability</span>
                          <span style={{ fontSize: 8, fontWeight: 800, color: "#22C55E" }}>{formatScore(rec.attainability)}</span>
                        </div>
                        <div style={{ height: 3, background: isDark ? "rgba(255,255,255,0.06)" : "#E5E7EB", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${rec.attainability}%`, background: "#22C55E", borderRadius: 2 }} />
                        </div>
                      </div>
                    </div>

                    {/* Why it matters */}
                    {rec.whyItMatters.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: isDark ? "#64748B" : "#6B7280", lineHeight: 1.5 }}>
                          → {rec.whyItMatters[0]}
                        </div>
                        {isExpanded && rec.whyItMatters.slice(1).map((w, j) => (
                          <div key={j} style={{ fontSize: 11, color: isDark ? "#64748B" : "#6B7280", lineHeight: 1.5, marginTop: 4 }}>
                            → {w}
                          </div>
                        ))}
                        {isExpanded && rec.whatWasObserved.length > 0 && (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid #F3F4F6" }}>
                            <div style={{ fontSize: 8, fontWeight: 700, color: isDark ? "#475569" : "#9CA3AF", textTransform: "uppercase", marginBottom: 4, letterSpacing: "0.5px" }}>Observations</div>
                            {rec.whatWasObserved.slice(0, 3).map((o, j) => (
                              <div key={j} style={{ fontSize: 10, color: isDark ? "#64748B" : "#6B7280", lineHeight: 1.4, marginTop: 3 }}>• {o}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Footer: expand + workflow link */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      {(rec.whyItMatters.length > 1 || rec.whatWasObserved.length > 0) ? (
                        <button
                          onClick={() => setExpandedRec(isExpanded ? null : rec.id)}
                          data-testid={`rec-expand-${rec.id}`}
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            fontSize: 10, color: isDark ? "#475569" : "#9CA3AF", fontWeight: 600,
                            padding: 0,
                          }}
                        >
                          {isExpanded ? "▲ less" : "▼ more detail"}
                        </button>
                      ) : <span />}
                      <a
                        href={route}
                        data-testid={`rec-wf-link-${rec.id}`}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          fontSize: 10, fontWeight: 700, color: "#00AEEF",
                          background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.25)",
                          borderRadius: 8, padding: "5px 12px", textDecoration: "none",
                        }}
                      >
                        → {wfLabel}
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ── Coverage Diagnostics ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ whiteSpace: "nowrap" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: isDark ? "#475569" : "#4B5563", letterSpacing: "1px", textTransform: "uppercase" }}>
              Coverage Diagnostics
            </div>
            <div style={{ fontSize: 9, color: isDark ? "#334155" : "#9CA3AF", marginTop: 1 }}>
              Data source availability for AI visibility analysis
            </div>
          </div>
          <div style={{ flex: 1, height: 1, background: isDark ? "rgba(255,255,255,0.05)" : "#E5E7EB" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {coverage.map(c => {
            const sc = getCoverageStatusConfig(c.status);
            const label = getSourceLabel(c.source);
            return (
              <div key={c.source} data-testid={`coverage-${c.source}`} style={{
                ...card, padding: "14px 16px",
                borderTop: `2px solid ${sc.color}50`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: t.text, lineHeight: 1.3 }}>{label}</div>
                  <span style={{
                    fontSize: 8, fontWeight: 800, color: sc.color,
                    background: sc.bgColor, border: `1px solid ${sc.color}30`,
                    padding: "2px 7px", borderRadius: 20, whiteSpace: "nowrap", marginLeft: 6,
                    textTransform: "uppercase", letterSpacing: "0.4px",
                  }}>
                    {sc.icon} {sc.label}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: isDark ? "#64748B" : "#6B7280", lineHeight: 1.4 }}>{c.detail}</div>
                {c.status === "not_connected" && (
                  <a
                    href={getWorkflowRoute(c.source as RMWorkflowKind)}
                    style={{
                      display: "inline-block", marginTop: 8,
                      fontSize: 9, fontWeight: 700, color: "#F59E0B",
                      textDecoration: "none",
                    }}
                  >
                    Connect →
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Rejected observations panel ─────────────────────────────────────── */}
      {rejected.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setShowRejected(v => !v)}
            data-testid="rm-rejected-toggle"
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              background: isDark ? "rgba(255,255,255,0.02)" : "#F9FAFB",
              border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #E5E7EB",
              borderRadius: 10, padding: "10px 16px", cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: isDark ? "#475569" : "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {showRejected ? "▲" : "▼"} {rejected.length} filtered observation{rejected.length !== 1 ? "s" : ""} — scope rules applied
            </span>
          </button>
          {showRejected && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {rejected.map((r, i) => (
                <div key={i} style={{
                  ...card, padding: "10px 14px",
                  display: "flex", gap: 10, alignItems: "flex-start",
                }}>
                  <span style={{
                    fontSize: 8, fontWeight: 800, color: "#EF4444",
                    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                    padding: "2px 7px", borderRadius: 20, textTransform: "uppercase",
                    letterSpacing: "0.4px", whiteSpace: "nowrap", marginTop: 1,
                  }}>
                    {r.code.replace(/_/g, " ")}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: t.text, marginBottom: 2 }}>{r.dedupeKey}</div>
                    <div style={{ fontSize: 10, color: isDark ? "#64748B" : "#6B7280" }}>{r.reason}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
