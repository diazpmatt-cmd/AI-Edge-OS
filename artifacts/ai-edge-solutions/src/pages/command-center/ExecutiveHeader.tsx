import { useMemo } from "react";
import { useUser } from "@clerk/react";
import { Link } from "wouter";
import type { HealthStatus } from "./types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

const STATUS_CONFIG: Record<HealthStatus, { label: string; color: string; dot: string }> = {
  healthy:        { label: "Healthy",        color: "#22C55E", dot: "#22C55E" },
  warning:        { label: "Needs Attention", color: "#F59E0B", dot: "#F59E0B" },
  critical:       { label: "Action Required", color: "#EF4444", dot: "#EF4444" },
  pending:        { label: "Initializing",   color: "#64748B", dot: "#64748B" },
  "setup-required": { label: "Setup Required", color: "#94A3B8", dot: "#94A3B8" },
};

interface Props {
  businessName?: string;
  healthStatus: HealthStatus;
  aiStatus: "active" | "limited" | "offline";
  activeAutomations: number;
  topPriorityAction?: string;
  topPriorityLink?: string;
  lastRefreshed?: string;
}

export function ExecutiveHeader({
  businessName,
  healthStatus,
  aiStatus,
  activeAutomations,
  topPriorityAction,
  topPriorityLink,
  lastRefreshed,
}: Props) {
  const { user } = useUser();
  const firstName = user?.firstName ?? "there";
  const displayName = businessName ?? "AI Edge OS";

  const statusCfg = STATUS_CONFIG[healthStatus];

  const aiColors: Record<string, { color: string; label: string }> = {
    active:  { color: "#22C55E", label: "AI Active" },
    limited: { color: "#F59E0B", label: "AI Limited" },
    offline: { color: "#EF4444", label: "AI Offline" },
  };
  const aiCfg = aiColors[aiStatus];

  const refreshLabel = useMemo(() => {
    if (!lastRefreshed) return null;
    try {
      const d = new Date(lastRefreshed);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch { return null; }
  }, [lastRefreshed]);

  return (
    <header
      aria-label="Executive Command Header"
      style={{
        background: "linear-gradient(135deg, rgba(11,22,41,0.97) 0%, rgba(3,6,18,0.92) 100%)",
        border: "1px solid rgba(0,174,239,0.12)",
        borderRadius: 16,
        padding: "22px 28px",
        marginBottom: 24,
        boxShadow: "0 0 60px rgba(0,174,239,0.05)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>

        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "#64748B", fontWeight: 500 }}>
              {greeting()},
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8" }}>
              {firstName}
            </span>
          </div>

          <h1 style={{
            fontSize: 22, fontWeight: 900, color: "#E2E8F0",
            letterSpacing: "-0.5px", margin: 0, lineHeight: 1.15,
          }}>
            {displayName}
          </h1>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#475569" }}>{formatDate()}</span>
            {refreshLabel && (
              <>
                <span style={{ fontSize: 11, color: "#334155" }}>·</span>
                <span style={{ fontSize: 11, color: "#334155" }}>Synced {refreshLabel}</span>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: `${statusCfg.color}10`,
            border: `1px solid ${statusCfg.color}30`,
            borderRadius: 10, padding: "8px 14px",
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: statusCfg.dot,
              boxShadow: `0 0 6px ${statusCfg.dot}60`,
            }} />
            <div>
              <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.7px" }}>Business Health</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: statusCfg.color }}>{statusCfg.label}</div>
            </div>
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: `${aiCfg.color}10`,
            border: `1px solid ${aiCfg.color}30`,
            borderRadius: 10, padding: "8px 14px",
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: aiCfg.color,
              boxShadow: `0 0 6px ${aiCfg.color}60`,
              animation: aiStatus === "active" ? "pulse 2s infinite" : undefined,
            }} />
            <div>
              <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.7px" }}>AI Status</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: aiCfg.color }}>{aiCfg.label}</div>
            </div>
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "rgba(0,174,239,0.08)",
            border: "1px solid rgba(0,174,239,0.2)",
            borderRadius: 10, padding: "8px 14px",
          }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <div>
              <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.7px" }}>Automations</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#00AEEF" }}>
                {activeAutomations} Active
              </div>
            </div>
          </div>
        </div>
      </div>

      {topPriorityAction && (
        <div style={{
          marginTop: 16,
          background: "rgba(0,174,239,0.06)",
          border: "1px solid rgba(0,174,239,0.15)",
          borderRadius: 10, padding: "10px 16px",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 800, color: "#00AEEF",
            background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.25)",
            borderRadius: 20, padding: "2px 9px", letterSpacing: "0.7px",
            textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0,
          }}>Top Priority</span>
          <span style={{ fontSize: 12, color: "#CBD5E1", flex: 1 }}>{topPriorityAction}</span>
          {topPriorityLink && (
            <Link to={topPriorityLink}>
              <button style={{
                background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.3)",
                borderRadius: 7, color: "#00AEEF", fontSize: 11, fontWeight: 700,
                padding: "4px 12px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              }}>
                Take Action →
              </button>
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
