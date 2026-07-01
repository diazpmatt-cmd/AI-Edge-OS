import { useInsights, type Insight, type InsightSeverity } from "@/lib/insights";

// ─────────────────────────────────────────────────────────────────────────────
// Severity config — colours match the rest of the Command Center palette
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY: Record<InsightSeverity, {
  label:  string;
  icon:   string;
  color:  string;
  bg:     string;
  border: string;
  left:   string;
}> = {
  critical:    { label: "Critical",     icon: "✕", color: "#F87171", bg: "rgba(239,68,68,0.06)",    border: "rgba(239,68,68,0.18)",    left: "#EF4444" },
  warning:     { label: "Warning",      icon: "⚠", color: "#FCD34D", bg: "rgba(245,158,11,0.06)",   border: "rgba(245,158,11,0.18)",   left: "#F59E0B" },
  opportunity: { label: "Opportunity",  icon: "▲", color: "#34D399", bg: "rgba(16,185,129,0.06)",   border: "rgba(16,185,129,0.18)",   left: "#10B981" },
  info:        { label: "Info",         icon: "●", color: "#38BDF8", bg: "rgba(0,174,239,0.06)",    border: "rgba(0,174,239,0.16)",    left: "#00AEEF" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Derive a short human-readable source label from insight id / source_data
// ─────────────────────────────────────────────────────────────────────────────

function sourceLabel(insight: Insight): string {
  const id = insight.id;
  if (id.startsWith("telnyx") || id === "missed_calls" || id === "after_hours_missed") return "Telnyx Lead Recovery";
  if (id === "local_presence_gaps") return "Platform Status";
  if (id === "no_review_velocity")   return "No data available";
  if (id.startsWith("ar_") || id.startsWith("revenue"))  return "GorillaDesk Revenue";
  if (id.startsWith("job_"))         return "GorillaDesk Jobs";
  if (id.startsWith("zero_") || id.startsWith("low_") || id === "large_customer_base") return "GorillaDesk Customers";
  if (id.startsWith("lead_source") || id === "top_lead_source") return "GorillaDesk Lead Sources";
  return "GorillaDesk";
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton card for loading state
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      background: "linear-gradient(90deg, rgba(255,255,255,0.025) 25%, rgba(255,255,255,0.045) 50%, rgba(255,255,255,0.025) 75%)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 13, padding: "18px 20px", height: 96,
    }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single insight card
// ─────────────────────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: Insight }) {
  const s = SEVERITY[insight.severity];

  return (
    <div style={{
      background: s.bg,
      border: `1px solid ${s.border}`,
      borderLeft: `3px solid ${s.left}`,
      borderRadius: 13,
      padding: "16px 18px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>

      {/* ── Top row: severity badge · title · badges ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>

        {/* Severity badge */}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          background: `${s.color}18`, border: `1px solid ${s.color}30`,
          borderRadius: 20, padding: "2px 9px",
          fontSize: 9, fontWeight: 800, color: s.color,
          letterSpacing: "0.6px", textTransform: "uppercase",
          flexShrink: 0, marginTop: 1,
        }}>
          <span style={{ fontSize: 8 }}>{s.icon}</span>
          {s.label}
        </span>

        {/* Title */}
        <span style={{
          fontSize: 13, fontWeight: 800, color: "#E2E8F0",
          lineHeight: 1.35, flex: 1,
        }}>
          {insight.title}
        </span>

        {/* Estimate pill */}
        {insight.is_estimate && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)",
            borderRadius: 20, padding: "2px 9px",
            fontSize: 9, fontWeight: 700, color: "#FCD34D",
            letterSpacing: "0.5px", flexShrink: 0, marginTop: 1,
          }}>
            ~ ESTIMATE
          </span>
        )}

        {/* No data pill */}
        {!insight.data_available && (
          <span style={{
            display: "inline-flex", alignItems: "center",
            background: "rgba(71,85,105,0.2)", border: "1px solid rgba(71,85,105,0.3)",
            borderRadius: 20, padding: "2px 9px",
            fontSize: 9, fontWeight: 700, color: "#64748B",
            letterSpacing: "0.5px", flexShrink: 0, marginTop: 1,
          }}>
            NO DATA YET
          </span>
        )}
      </div>

      {/* ── Explanation ── */}
      <div style={{
        fontSize: 12, color: "#94A3B8", lineHeight: 1.6,
        paddingLeft: 2,
      }}>
        {insight.explanation}
      </div>

      {/* ── Recommended action ── */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 8,
        background: "rgba(255,255,255,0.03)", borderRadius: 8,
        padding: "10px 12px",
        border: "1px solid rgba(255,255,255,0.05)",
      }}>
        <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>💡</span>
        <span style={{ fontSize: 11, color: "#CBD5E1", lineHeight: 1.55 }}>
          {insight.recommended_action}
        </span>
      </div>

      {/* ── Footer: source indicator ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, paddingLeft: 2,
      }}>
        <span style={{ fontSize: 9, color: "#334155", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px" }}>
          Source:
        </span>
        <span style={{ fontSize: 10, color: "#475569" }}>
          {sourceLabel(insight)}
        </span>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section divider (mirrors DashboardPage pattern)
// ─────────────────────────────────────────────────────────────────────────────

function SectionDivider({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "1.1px", textTransform: "uppercase", whiteSpace: "nowrap" }}>{title}</div>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
      {right}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public panel — drop directly into DashboardPage
// ─────────────────────────────────────────────────────────────────────────────

export function AiInsightsPanel() {
  const { insights, generatedAt, dataSources, loading, error } = useInsights();

  const severityCounts = insights.reduce<Record<string, number>>((acc, i) => {
    acc[i.severity] = (acc[i.severity] ?? 0) + 1;
    return acc;
  }, {});

  const countBadges = (["critical", "warning", "opportunity", "info"] as const)
    .filter(s => severityCounts[s])
    .map(s => {
      const st = SEVERITY[s];
      return (
        <span key={s} style={{
          fontSize: 9, fontWeight: 800, color: st.color,
          background: `${st.color}12`, border: `1px solid ${st.color}25`,
          borderRadius: 20, padding: "2px 8px",
          letterSpacing: "0.5px", textTransform: "uppercase",
        }}>
          {severityCounts[s]} {st.label}
        </span>
      );
    });

  const headerRight = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {!loading && !error && countBadges}
      {generatedAt && (
        <span style={{ fontSize: 10, color: "#334155" }}>
          {new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
      {dataSources.length > 0 && (
        <span style={{ fontSize: 10, color: "#475569" }}>
          {dataSources.length} source{dataSources.length !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );

  return (
    <div style={{ marginBottom: 28 }}>
      <SectionDivider title="AI Business Insights" right={headerRight} />

      {/* Loading state — 3 skeleton cards */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div style={{
          background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)",
          borderRadius: 13, padding: "28px", textAlign: "center",
        }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>⚠</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#F87171", marginBottom: 4 }}>Insights unavailable</div>
          <div style={{ fontSize: 11, color: "#64748B" }}>{error}</div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && insights.length === 0 && (
        <div style={{
          background: "rgba(11,22,41,0.7)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 13, padding: "40px 20px", textAlign: "center",
        }}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>✨</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#475569", marginBottom: 6 }}>No insights yet</div>
          <div style={{ fontSize: 12, color: "#334155", maxWidth: 360, margin: "0 auto" }}>
            Insights appear automatically once GorillaDesk and Telnyx data is synced for a full reporting period.
          </div>
        </div>
      )}

      {/* Insight cards */}
      {!loading && !error && insights.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {insights.map(insight => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </div>
  );
}
