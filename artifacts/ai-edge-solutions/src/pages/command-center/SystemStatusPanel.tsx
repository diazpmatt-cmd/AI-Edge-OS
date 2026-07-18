import { Link } from "wouter";

interface ModuleStatus {
  id: string;
  name: string;
  icon: string;
  status: "active" | "in-progress" | "pending" | "monitoring" | "partial";
  statusLabel: string;
  summary: string;
  link: string;
}

const STATUS_COLOR: Record<string, string> = {
  active:      "#22C55E",
  "in-progress": "#3B82F6",
  pending:     "#EF4444",
  monitoring:  "#3B82F6",
  partial:     "#F59E0B",
};

const MODULES: ModuleStatus[] = [
  { id: "lead-recovery",  name: "Lead Recovery AI",    icon: "📞", status: "active",      statusLabel: "Active",       summary: "Telnyx connected · Monitoring calls",       link: "/admin/lead-recovery"     },
  { id: "local-presence", name: "Local Presence",      icon: "📍", status: "in-progress", statusLabel: "In Progress",  summary: "Bing verified · 2 platforms pending",       link: "/admin/local-presence"    },
  { id: "ai-visibility",  name: "AI Visibility",       icon: "✨", status: "pending",     statusLabel: "Pending Scan", summary: "No scan data yet",                          link: "/admin/ai-visibility"     },
  { id: "connections",    name: "Connected Accounts",  icon: "🔗", status: "partial",     statusLabel: "Partial",      summary: "4 of 8 platforms connected",                link: "/admin/connections"       },
  { id: "publishing",     name: "Publishing Center",   icon: "📸", status: "active",      statusLabel: "Ready",        summary: "Queue open · AI content ready",             link: "/admin/social-publishing" },
  { id: "auto-content",   name: "Auto Content Engine", icon: "🤖", status: "active",      statusLabel: "Active",       summary: "Content pipeline running",                  link: "/admin/auto-content"      },
  { id: "diagnostics",    name: "System Diagnostics",  icon: "🛰", status: "monitoring",  statusLabel: "Monitoring",   summary: "All core systems nominal",                  link: "/admin/diagnostics"       },
];

export function SystemStatusPanel() {
  return (
    <div role="region" aria-label="System Status">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        {MODULES.map(mod => {
          const color = STATUS_COLOR[mod.status] ?? "#64748B";
          return (
            <div key={mod.id} style={{
              background: "rgba(11,22,41,0.65)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderTop: `2px solid ${color}35`,
              borderRadius: 12, padding: "14px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{mod.icon}</span>
                <span style={{
                  fontSize: 8, fontWeight: 800, color,
                  background: `${color}14`, border: `1px solid ${color}28`,
                  borderRadius: 20, padding: "2px 8px", letterSpacing: "0.5px",
                  textTransform: "uppercase",
                }}>{mod.statusLabel}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1", marginBottom: 5 }}>{mod.name}</div>
              <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.4, marginBottom: 8 }}>{mod.summary}</div>
              <Link to={mod.link}>
                <button
                  aria-label={`Open ${mod.name}`}
                  style={{
                    width: "100%", padding: "5px 0", borderRadius: 7, fontSize: 10, fontWeight: 700,
                    cursor: "pointer", background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)", color: "#475569",
                  }}
                >Open →</button>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
