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
      display: "flex", alignItems: "center", gap: 14,
      background: "linear-gradient(135deg, rgba(11,22,41,0.92), rgba(3,6,18,0.80))",
      border: "1px solid rgba(255,255,255,0.06)",
      borderLeft: `3px solid ${st.color}`,
      borderRadius: 12, padding: "13px 18px",
      transition: "border-color 0.15s",
    }}>
      <div style={{ flexShrink: 0 }}>
        <span style={{
          fontSize: 10, fontWeight: 800, color: st.color,
          background: `${st.color}14`, border: `1px solid ${st.color}28`,
          borderRadius: 20, padding: "2px 10px",
          textTransform: "uppercase", letterSpacing: "0.6px",
          display: "inline-flex", alignItems: "center", gap: 5,
        }}>
          <span style={{ fontSize: 9 }}>{st.icon}</span> {st.label}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>{row.label}</span>
          {row.score !== undefined && (
            <span style={{
              fontSize: 11, fontWeight: 800, color: st.color,
              background: `${st.color}10`, border: `1px solid ${st.color}25`,
              borderRadius: 8, padding: "0px 6px",
            }}>{row.score}%</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.45 }}>{row.explanation}</div>
      </div>
      {row.link && (
        <Link to={row.link} style={{ flexShrink: 0 }}>
          <button
            aria-label={`Improve ${row.label}`}
            style={{
              padding: "5px 13px", borderRadius: 8, fontSize: 10, fontWeight: 700,
              cursor: "pointer", background: "rgba(0,174,239,0.06)",
              border: "1px solid rgba(0,174,239,0.22)", color: "#00AEEF",
              whiteSpace: "nowrap", letterSpacing: "0.3px",
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
    label: "Business Edge Profile",
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
    label: "AI Edge Visibility",
    status: "critical",
    explanation: "No visibility scan completed yet. BBB scores 18/100 in AI search. Run a report to unlock recommendations.",
    link: "/admin/ai-visibility",
  },
  {
    id: "competitor-intel",
    label: "Competitive Edge Intelligence",
    status: "warning",
    explanation: "Discovery engine ready. Configure DataForSEO credentials in Secrets Vault to run live competitor scans.",
    link: "/admin/competitor-intelligence",
  },
  {
    id: "authority-engine",
    label: "Edge Authority",
    status: "critical",
    score: 29,
    explanation: "Citation gap: 3 listed vs competitor avg 30+. Schema.org not configured. 8 high-priority actions ready.",
    link: "/admin/authority-engine",
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
