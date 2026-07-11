// ── PlatformStateChip ────────────────────────────────────────────────────────
// Small inline badge showing a platform's current publishing availability.
// Used in Publishing Center and Content Autopilot.

export type PlatformUIState =
  | "ready"        // operational + connected + publish capable
  | "disconnected" // operational but not connected in the DB
  | "pending"      // pending_approval — backend exists, platform review in progress
  | "coming_soon"; // coming_soon — publish pipeline not yet implemented

const STATE_META: Record<PlatformUIState, { label: string; color: string; bg: string; border: string }> = {
  ready:        { label: "Ready",           color: "#22C55E", bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.2)"   },
  disconnected: { label: "Disconnected",    color: "#F59E0B", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)"  },
  pending:      { label: "Pending Approval",color: "#F59E0B", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)"  },
  coming_soon:  { label: "Coming Soon",     color: "#64748B", bg: "rgba(100,116,139,0.06)", border: "rgba(100,116,139,0.15)"},
};

interface Props {
  state: PlatformUIState;
  showConnectLink?: boolean;  // renders a "→ Connect" link when state === "disconnected"
  size?: "xs" | "sm";
}

export function PlatformStateChip({ state, showConnectLink = false, size = "xs" }: Props) {
  const m = STATE_META[state];
  const fs = size === "xs" ? 9 : 10.5;

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: fs, fontWeight: 700, letterSpacing: "0.25px",
      color: m.color,
      background: m.bg,
      border: `1px solid ${m.border}`,
      borderRadius: 6, padding: size === "xs" ? "1px 6px" : "2px 8px",
      whiteSpace: "nowrap" as const,
      verticalAlign: "middle",
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: m.color, flexShrink: 0,
      }} />
      {m.label}
      {showConnectLink && state === "disconnected" && (
        <a
          href="/admin/connections"
          style={{ color: "#00AEEF", textDecoration: "none", fontWeight: 800, marginLeft: 2 }}
          onClick={e => e.stopPropagation()}
        >
          → Connect
        </a>
      )}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

import type { SocialProvider } from "@/lib/social-providers";

export function resolvePlatformUIState(
  provider: SocialProvider,
  isConnected: boolean,
): PlatformUIState {
  if (provider.status === "pending_approval") return "pending";
  if (provider.status === "coming_soon")      return "coming_soon";
  if (isConnected)                            return "ready";
  return "disconnected";
}
