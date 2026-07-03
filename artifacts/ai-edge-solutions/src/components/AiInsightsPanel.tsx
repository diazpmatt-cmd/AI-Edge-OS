import { useInsights, type Insight, type InsightSeverity } from "@/lib/insights";
import { useTheme } from "@/contexts/theme-context";

// ─────────────────────────────────────────────────────────────────────────────
// Severity config — dark mode (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_DARK: Record<InsightSeverity, {
  label:       string;
  icon:        string;
  color:       string;
  bg:          string;
  border:      string;
  left:        string;
  badgeBg:     string;
  badgeBorder: string;
  badgeText:   string;
}> = {
  critical:    { label: "Critical",    icon: "✕", color: "#F87171", bg: "rgba(239,68,68,0.06)",   border: "rgba(239,68,68,0.18)",   left: "#EF4444", badgeBg: "rgba(239,68,68,0.12)",   badgeBorder: "rgba(239,68,68,0.25)",   badgeText: "#F87171" },
  warning:     { label: "Warning",     icon: "⚠", color: "#FCD34D", bg: "rgba(245,158,11,0.06)",  border: "rgba(245,158,11,0.18)",  left: "#F59E0B", badgeBg: "rgba(245,158,11,0.12)",  badgeBorder: "rgba(245,158,11,0.25)",  badgeText: "#FCD34D" },
  opportunity: { label: "Opportunity", icon: "▲", color: "#34D399", bg: "rgba(16,185,129,0.06)",  border: "rgba(16,185,129,0.18)",  left: "#10B981", badgeBg: "rgba(16,185,129,0.12)",  badgeBorder: "rgba(16,185,129,0.25)",  badgeText: "#34D399" },
  info:        { label: "Info",        icon: "●", color: "#38BDF8", bg: "rgba(0,174,239,0.06)",   border: "rgba(0,174,239,0.16)",   left: "#00AEEF", badgeBg: "rgba(0,174,239,0.12)",   badgeBorder: "rgba(0,174,239,0.25)",   badgeText: "#38BDF8" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Severity config — light mode (high-contrast per spec)
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_LIGHT: Record<InsightSeverity, {
  label:       string;
  icon:        string;
  color:       string;
  bg:          string;
  border:      string;
  left:        string;
  badgeBg:     string;
  badgeBorder: string;
  badgeText:   string;
}> = {
  critical:    { label: "Critical",    icon: "✕", color: "#B91C1C", bg: "#FEF2F2",   border: "#FECACA", left: "#EF4444", badgeBg: "#FEE2E2",   badgeBorder: "#FECACA", badgeText: "#991B1B" },
  warning:     { label: "Warning",     icon: "⚠", color: "#92400E", bg: "#FFFBEB",   border: "#F59E0B", left: "#F59E0B", badgeBg: "#FEF3C7",   badgeBorder: "#FDE68A", badgeText: "#92400E" },
  opportunity: { label: "Opportunity", icon: "▲", color: "#065F46", bg: "#F0FDF4",   border: "#10B981", left: "#10B981", badgeBg: "#D1FAE5",   badgeBorder: "#A7F3D0", badgeText: "#065F46" },
  info:        { label: "Info",        icon: "●", color: "#1D4ED8", bg: "#EFF6FF",   border: "#3B82F6", left: "#3B82F6", badgeBg: "#DBEAFE",   badgeBorder: "#BFDBFE", badgeText: "#1D4ED8" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Source label
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
// Skeleton card
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonCard({ isDark }: { isDark: boolean }) {
  return (
    <div style={{
      background: isDark
        ? "linear-gradient(90deg, rgba(255,255,255,0.025) 25%, rgba(255,255,255,0.045) 50%, rgba(255,255,255,0.025) 75%)"
        : "linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)",
      border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #DDE3EA",
      borderRadius: 13, padding: "18px 20px", height: 96,
    }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single insight card
// ─────────────────────────────────────────────────────────────────────────────

function InsightCard({ insight, isDark }: { insight: Insight; isDark: boolean }) {
  const s = isDark ? SEVERITY_DARK[insight.severity] : SEVERITY_LIGHT[insight.severity];

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

      {/* ── Top row: severity badge · title · pills ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>

        {/* Severity badge */}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          background: s.badgeBg, border: `1px solid ${s.badgeBorder}`,
          borderRadius: 20, padding: "2px 9px",
          fontSize: 9, fontWeight: 800, color: s.badgeText,
          letterSpacing: "0.6px", textTransform: "uppercase",
          flexShrink: 0, marginTop: 1,
        }}>
          <span style={{ fontSize: 8 }}>{s.icon}</span>
          {s.label}
        </span>

        {/* Title */}
        <span style={{
          fontSize: 13,
          fontWeight: 700,
          color: isDark ? "#E2E8F0" : "#111827",
          lineHeight: 1.35, flex: 1,
        }}>
          {insight.title}
        </span>

        {/* Estimate pill */}
        {insight.is_estimate && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: isDark ? "rgba(245,158,11,0.1)" : "#FEF3C7",
            border: isDark ? "1px solid rgba(245,158,11,0.25)" : "1px solid #FDE68A",
            borderRadius: 20, padding: "2px 9px",
            fontSize: 9, fontWeight: 700,
            color: isDark ? "#FCD34D" : "#92400E",
            letterSpacing: "0.5px", flexShrink: 0, marginTop: 1,
          }}>
            ~ ESTIMATE
          </span>
        )}

        {/* No data pill */}
        {!insight.data_available && (
          <span style={{
            display: "inline-flex", alignItems: "center",
            background: isDark ? "rgba(71,85,105,0.2)" : "#F1F5F9",
            border: isDark ? "1px solid rgba(71,85,105,0.3)" : "1px solid #CBD5E1",
            borderRadius: 20, padding: "2px 9px",
            fontSize: 9, fontWeight: 700,
            color: isDark ? "#64748B" : "#4B5563",
            letterSpacing: "0.5px", flexShrink: 0, marginTop: 1,
          }}>
            NO DATA YET
          </span>
        )}
      </div>

      {/* ── Explanation ── */}
      <div style={{
        fontSize: 12,
        fontWeight: isDark ? 400 : 500,
        color: isDark ? "#94A3B8" : "#1F2937",
        lineHeight: 1.6,
        paddingLeft: 2,
      }}>
        {insight.explanation}
      </div>

      {/* ── Recommended action ── */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 8,
        background: isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF",
        borderRadius: 8,
        padding: "10px 12px",
        border: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid #E5E7EB",
      }}>
        <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>💡</span>
        <span style={{
          fontSize: 11,
          fontWeight: isDark ? 400 : 500,
          color: isDark ? "#CBD5E1" : "#111827",
          lineHeight: 1.55,
        }}>
          {insight.recommended_action}
        </span>
      </div>

      {/* ── Footer: source ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 2 }}>
        <span style={{
          fontSize: 9,
          color: isDark ? "#334155" : "#111827",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.6px",
        }}>
          Source:
        </span>
        <span style={{
          fontSize: 10,
          fontWeight: isDark ? 400 : 600,
          color: isDark ? "#475569" : "#374151",
        }}>
          {sourceLabel(insight)}
        </span>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section divider
// ─────────────────────────────────────────────────────────────────────────────

function SectionDivider({ title, right, isDark }: { title: string; right?: React.ReactNode; isDark: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 700,
        color: isDark ? "#475569" : "#374151",
        letterSpacing: "1.1px", textTransform: "uppercase", whiteSpace: "nowrap",
      }}>
        {title}
      </div>
      <div style={{ flex: 1, height: 1, background: isDark ? "rgba(255,255,255,0.05)" : "#E5E7EB" }} />
      {right}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public panel
// ─────────────────────────────────────────────────────────────────────────────

export function AiInsightsPanel() {
  const { isDark } = useTheme();
  const { insights, generatedAt, dataSources, loading, error } = useInsights();

  const severityCounts = insights.reduce<Record<string, number>>((acc, i) => {
    acc[i.severity] = (acc[i.severity] ?? 0) + 1;
    return acc;
  }, {});

  const countBadges = (["critical", "warning", "opportunity", "info"] as const)
    .filter(s => severityCounts[s])
    .map(s => {
      const sd = SEVERITY_DARK[s];
      const sl = SEVERITY_LIGHT[s];
      return (
        <span key={s} style={{
          fontSize: 9, fontWeight: 800,
          color: isDark ? sd.color : sl.badgeText,
          background: isDark ? `${sd.color}12` : sl.badgeBg,
          border: isDark ? `1px solid ${sd.color}25` : `1px solid ${sl.badgeBorder}`,
          borderRadius: 20, padding: "2px 8px",
          letterSpacing: "0.5px", textTransform: "uppercase",
        }}>
          {severityCounts[s]} {sd.label}
        </span>
      );
    });

  const headerRight = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {!loading && !error && countBadges}
      {generatedAt && (
        <span style={{
          fontSize: 10,
          fontWeight: isDark ? 400 : 600,
          color: isDark ? "#334155" : "#4B5563",
        }}>
          {new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
      {dataSources.length > 0 && (
        <span style={{
          fontSize: 10,
          fontWeight: isDark ? 400 : 600,
          color: isDark ? "#475569" : "#374151",
        }}>
          {dataSources.length} source{dataSources.length !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );

  return (
    <div style={{ marginBottom: 28 }}>
      <SectionDivider title="AI Business Insights" right={headerRight} isDark={isDark} />

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SkeletonCard isDark={isDark} />
          <SkeletonCard isDark={isDark} />
          <SkeletonCard isDark={isDark} />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{
          background: isDark ? "rgba(239,68,68,0.05)" : "#FEF2F2",
          border: isDark ? "1px solid rgba(239,68,68,0.15)" : "1px solid #FECACA",
          borderRadius: 13, padding: "28px", textAlign: "center",
        }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>⚠</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? "#F87171" : "#B91C1C", marginBottom: 4 }}>
            Insights unavailable
          </div>
          <div style={{ fontSize: 11, color: isDark ? "#64748B" : "#4B5563" }}>{error}</div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && insights.length === 0 && (
        <div style={{
          background: isDark ? "rgba(11,22,41,0.7)" : "#F8FAFC",
          border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #E2E8F0",
          borderRadius: 13, padding: "40px 20px", textAlign: "center",
        }}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>✨</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? "#475569" : "#374151", marginBottom: 6 }}>
            No insights yet
          </div>
          <div style={{ fontSize: 12, fontWeight: isDark ? 400 : 500, color: isDark ? "#334155" : "#4B5563", maxWidth: 360, margin: "0 auto" }}>
            Insights appear automatically once GorillaDesk and Telnyx data is synced for a full reporting period.
          </div>
        </div>
      )}

      {/* Cards */}
      {!loading && !error && insights.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {insights.map(insight => (
            <InsightCard key={insight.id} insight={insight} isDark={isDark} />
          ))}
        </div>
      )}
    </div>
  );
}
