import { Link } from "wouter";
import type { HealthStatus, HealthRow } from "./types";

const STATUS_CONFIG: Record<HealthStatus, { color: string; label: string; icon: string }> = {
  healthy:          { color: "#22C55E", label: "Healthy",        icon: "●" },
  warning:          { color: "#F59E0B", label: "Needs Attention", icon: "⚠" },
  critical:         { color: "#EF4444", label: "Action Required", icon: "✕" },
  pending:          { color: "#64748B", label: "Pending",         icon: "○" },
  "setup-required": { color: "#334155", label: "Setup Required",  icon: "○" },
};

function HealthRowCard({ row }: { row: HealthRow }) {
  const st = STATUS_CONFIG[row.status];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      background: "rgba(11,22,41,0.6)",
      border: "1px solid rgba(255,255,255,0.05)",
      borderLeft: `3px solid ${st.color}`,
      borderRadius: 10, padding: "12px 16px",
    }}>
      <div style={{ flexShrink: 0 }}>
        <span style={{
          fontSize: 11, fontWeight: 800, color: st.color,
          background: `${st.color}12`, border: `1px solid ${st.color}25`,
          borderRadius: 20, padding: "2px 9px",
          textTransform: "uppercase", letterSpacing: "0.5px",
          display: "inline-flex", alignItems: "center", gap: 5,
        }}>
          <span style={{ fontSize: 9 }}>{st.icon}</span> {st.label}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1" }}>{row.label}</span>
          {row.score !== undefined && (
            <span style={{ fontSize: 11, fontWeight: 800, color: st.color }}>{row.score}%</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.4 }}>{row.explanation}</div>
      </div>
      {row.link && (
        <Link to={row.link} style={{ flexShrink: 0 }}>
          <button
            aria-label={`Improve ${row.label}`}
            style={{
              padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700,
              cursor: "pointer", background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)", color: "#64748B",
              whiteSpace: "nowrap",
            }}
          >
            Improve →
          </button>
        </Link>
      )}
    </div>
  );
}

const HEALTH_ROWS: HealthRow[] = [
  {
    id: "gbp",
    label: "Google Business Profile",
    status: "healthy",
    explanation: "GBP connected and verified. Publishing active.",
    link: "/admin/local-presence",
  },
  {
    id: "local-listings",
    label: "Local Listings",
    status: "warning",
    explanation: "Apple Business Connect and Nextdoor Business pending. Bing Places verified — publishing in progress.",
    link: "/admin/local-presence",
  },
  {
    id: "lead-pipeline",
    label: "Lead Pipeline",
    status: "healthy",
    explanation: "Lead Recovery AI active. Telnyx connected and monitoring calls.",
    link: "/admin/lead-recovery",
  },
  {
    id: "ai-visibility",
    label: "AI Visibility",
    status: "critical",
    explanation: "No visibility scan completed yet. Competitor gap detected in AI-generated search results.",
    link: "/admin/ai-visibility",
  },
  {
    id: "automation",
    label: "Automation Health",
    status: "warning",
    explanation: "4 of 8 platforms connected. Content pipeline active. Social publishing queue open.",
    link: "/admin/connections",
  },
  {
    id: "reviews",
    label: "Reviews & Reputation",
    status: "pending",
    explanation: "Review monitoring not yet configured. Setup required to track and respond to new reviews.",
    link: "/admin/local-presence",
  },
];

export function BusinessHealthPanel() {
  return (
    <div
      role="region"
      aria-label="Business Health"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {HEALTH_ROWS.map(row => (
        <HealthRowCard key={row.id} row={row} />
      ))}
    </div>
  );
}
