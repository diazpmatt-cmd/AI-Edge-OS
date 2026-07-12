// ── PlatformStateChip ────────────────────────────────────────────────────────
// Small inline badge showing a platform's current publishing availability.
// Used in Publishing Center and Content Autopilot.
//
// COLOR RULES — Canonical Status Color System
// ─────────────────────────────────────────────
// Every platform card, chip, badge, border, and background must derive its
// color from operational STATUS only — never from platform brand colors.
//
// READY          Green   (#22C55E) — connected + publishing works
// ACTION_REQUIRED Yellow  (#F59E0B) — needs user action (connect / reconnect)
// BLOCKED        Red     (#EF4444) — fatal: no backend / API removed / disabled
// PENDING        Gray    (#94A3B8) — future feature / roadmap / not yet released

// ── Canonical Status Color Map ────────────────────────────────────────────────
// Import this in any page that needs to derive card/border/badge colors.
// Never derive colors from provider.color or p.color on status-bearing elements.

export const PLATFORM_STATUS_COLORS = {
  ready: {
    color:  "#22C55E",
    bg:     "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.2)",
    dot:    "#22C55E",
    label:  "Ready",
  },
  action_required: {
    color:  "#F59E0B",
    bg:     "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.2)",
    dot:    "#F59E0B",
    label:  "Action Required",
  },
  blocked: {
    color:  "#EF4444",
    bg:     "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.2)",
    dot:    "#EF4444",
    label:  "Blocked",
  },
  pending: {
    color:  "#94A3B8",
    bg:     "rgba(100,116,139,0.06)",
    border: "rgba(100,116,139,0.15)",
    dot:    "#64748B",
    label:  "Coming Soon",
  },
} as const;

export type PlatformUIState =
  | "ready"        // operational + connected + publish capable
  | "disconnected" // operational but not connected in the DB  → ACTION_REQUIRED
  | "pending"      // pending_approval or coming_soon          → PENDING
  | "coming_soon"; // no publish pipeline yet                  → PENDING

// Map legacy PlatformUIState strings to canonical status keys
const UI_STATE_TO_STATUS: Record<PlatformUIState, keyof typeof PLATFORM_STATUS_COLORS> = {
  ready:       "ready",
  disconnected: "action_required",
  pending:     "pending",
  coming_soon: "pending",
};

const STATE_LABEL: Record<PlatformUIState, string> = {
  ready:       "Ready",
  disconnected: "Disconnected",
  pending:     "Pending Approval",
  coming_soon: "Coming Soon",
};

interface Props {
  state: PlatformUIState;
  showConnectLink?: boolean;  // renders a "→ Connect" link when state === "disconnected"
  size?: "xs" | "sm";
}

export function PlatformStateChip({ state, showConnectLink = false, size = "xs" }: Props) {
  const statusKey = UI_STATE_TO_STATUS[state];
  const m = PLATFORM_STATUS_COLORS[statusKey];
  const label = STATE_LABEL[state];
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
      {label}
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
