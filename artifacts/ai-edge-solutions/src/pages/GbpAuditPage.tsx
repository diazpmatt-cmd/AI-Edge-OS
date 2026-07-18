import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { useActiveBusiness } from "@/contexts/business-context";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────

type CheckStatus   = "pass" | "warning" | "fail" | "data_pending" | "error";
type CheckPriority = "critical" | "high" | "medium" | "low";
type CheckCategory = "information" | "media" | "reviews" | "posts" | "authority";

interface HistorySnapshot {
  id:            string;
  status:        string;
  overallScore:  number;
  maxScore:      number;
  localScore:    number;
  localMaxScore: number;
  apiScore:      number;
  apiMaxScore:   number;
  gbpConnected:  boolean;
  createdAt:     string;
  completedAt:   string | null;
}

interface AuditCheck {
  id:             string;
  snapshotId:     string;
  category:       CheckCategory;
  checkKey:       string;
  checkLabel:     string;
  evidenceType:   "local" | "gbp_api";
  status:         CheckStatus;
  score:          number;
  maxScore:       number;
  priority:       CheckPriority;
  currentValue:   string | null;
  recommendation: string | null;
}

interface AuditSnapshot {
  id:            string;
  status:        string;
  localScore:    number;
  localMaxScore: number;
  overallScore:  number;
  maxScore:      number;
  checksPassed:  number;
  checksWarning: number;
  checksFailed:  number;
  checksPending: number;
  gbpConnected:  boolean;
  locationTitle: string | null;
  locationName:  string | null;
  completedAt:   string | null;
  createdAt:     string;
}

// ── Style maps ─────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<CheckStatus, { label: string; bg: string; color: string; border: string }> = {
  pass:         { label: "Pass",        bg: "rgba(34,197,94,0.15)",   color: "#22C55E", border: "rgba(34,197,94,0.3)"   },
  warning:      { label: "Warning",     bg: "rgba(245,158,11,0.15)",  color: "#F59E0B", border: "rgba(245,158,11,0.3)"  },
  fail:         { label: "Fail",        bg: "rgba(239,68,68,0.15)",   color: "#EF4444", border: "rgba(239,68,68,0.3)"   },
  data_pending: { label: "API Needed",  bg: "rgba(100,116,139,0.12)", color: "#64748B", border: "rgba(100,116,139,0.2)" },
  error:        { label: "Error",       bg: "rgba(239,68,68,0.12)",   color: "#EF4444", border: "rgba(239,68,68,0.25)"  },
};

const PRIORITY_COLOR: Record<CheckPriority, string> = {
  critical: "#EF4444",
  high:     "#F59E0B",
  medium:   "#60A5FA",
  low:      "#64748B",
};

const CATEGORY_META: Record<CheckCategory, { label: string; icon: string; accent: string }> = {
  information: { label: "Business Information", icon: "📋", accent: "#00AEEF" },
  media:       { label: "Photos & Media",       icon: "📸", accent: "#A78BFA" },
  reviews:     { label: "Reviews",              icon: "⭐", accent: "#FBBF24" },
  posts:       { label: "Google Posts",         icon: "📝", accent: "#2DD4BF" },
  authority:   { label: "Authority & Trust",    icon: "🛡",  accent: "#22C55E" },
};

// ── Trend Chart ────────────────────────────────────────────────────────────────

function TrendChart({ snapshots }: { snapshots: HistorySnapshot[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const complete = snapshots
    .filter(s => s.status === "complete")
    .slice()
    .reverse(); // oldest → newest

  if (complete.length < 2) {
    return (
      <div style={{
        background: "rgba(11,22,41,0.7)", borderRadius: 14,
        border: "1px solid rgba(45,212,191,0.1)",
        padding: "16px 20px", marginBottom: 20,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <span style={{ fontSize: 18 }}>📈</span>
        <div style={{ fontSize: 12, color: "rgba(100,116,139,0.6)" }}>
          Run at least 2 audits to see the score trend chart.
        </div>
      </div>
    );
  }

  const W = 560;
  const H = 80;
  const PAD_X = 32;
  const PAD_Y = 12;

  const scores = complete.map(s =>
    s.maxScore > 0 ? Math.round((s.overallScore / s.maxScore) * 100) : 0
  );
  const minS = Math.max(0, Math.min(...scores) - 10);
  const maxS = Math.min(100, Math.max(...scores) + 10);
  const range = maxS - minS || 10;

  const px = (i: number) => PAD_X + (i / (complete.length - 1)) * (W - PAD_X * 2);
  const py = (v: number) => H - PAD_Y - ((v - minS) / range) * (H - PAD_Y * 2);

  const points = scores.map((v, i) => `${px(i)},${py(v)}`).join(" ");

  const first  = scores[0];
  const last   = scores[scores.length - 1];
  const delta  = last - first;
  const trendColor = delta > 2 ? "#22C55E" : delta < -2 ? "#EF4444" : "#60A5FA";
  const trendLabel = delta > 2 ? `▲ +${delta} pts` : delta < -2 ? `▼ ${delta} pts` : "→ Stable";

  const hovSnap  = hovered !== null ? complete[hovered] : null;
  const hovScore = hovered !== null ? scores[hovered] : null;

  return (
    <div style={{
      background: "rgba(11,22,41,0.7)", borderRadius: 14,
      border: "1px solid rgba(45,212,191,0.1)",
      padding: "16px 20px", marginBottom: 20,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", color: "rgba(148,163,184,0.5)", textTransform: "uppercase" }}>
          Score Trend — Last {complete.length} Audits
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {hovSnap ? (
            <div style={{ fontSize: 11, color: "rgba(148,163,184,0.7)" }}>
              {new Date(hovSnap.createdAt).toLocaleDateString()} —{" "}
              <span style={{ fontWeight: 700, color: "#F1F5F9" }}>{hovScore}%</span>
            </div>
          ) : (
            <div style={{ fontSize: 11, fontWeight: 700, color: trendColor }}>
              {trendLabel}
            </div>
          )}
          <div style={{ fontSize: 11, color: "rgba(100,116,139,0.5)" }}>
            Current: <span style={{ color: "#F1F5F9", fontWeight: 700 }}>{last}%</span>
          </div>
        </div>
      </div>

      {/* SVG chart */}
      <div style={{ overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: H, display: "block", minWidth: 200 }}
          onMouseLeave={() => setHovered(null)}
        >
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={trendColor} stopOpacity="0.18" />
              <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {[25, 50, 75].map(v => {
            const y = py(v);
            if (y < 0 || y > H) return null;
            return (
              <line key={v} x1={PAD_X} y1={y} x2={W - PAD_X} y2={y}
                stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
            );
          })}

          {/* Area fill */}
          <polygon
            points={`${px(0)},${H} ${points} ${px(complete.length - 1)},${H}`}
            fill="url(#trendFill)"
          />

          {/* Line */}
          <polyline
            points={points}
            fill="none"
            stroke={trendColor}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${trendColor}55)` }}
          />

          {/* Data points + hover areas */}
          {complete.map((s, i) => {
            const x = px(i);
            const y = py(scores[i]);
            const isHov = hovered === i;
            return (
              <g key={s.id}>
                {/* Invisible wide hover target */}
                <rect
                  x={x - 14} y={0} width={28} height={H}
                  fill="transparent"
                  onMouseEnter={() => setHovered(i)}
                  style={{ cursor: "crosshair" }}
                />
                {/* Vertical hover line */}
                {isHov && (
                  <line x1={x} y1={PAD_Y} x2={x} y2={H - PAD_Y}
                    stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3,3" />
                )}
                {/* Dot */}
                <circle
                  cx={x} cy={y} r={isHov ? 5 : 3}
                  fill={isHov ? trendColor : "#030612"}
                  stroke={trendColor}
                  strokeWidth={isHov ? 2 : 1.5}
                  style={{ transition: "r 0.1s, fill 0.1s", pointerEvents: "none" }}
                />
              </g>
            );
          })}

          {/* Y-axis labels */}
          {[minS, maxS].map((v, i) => (
            <text
              key={i}
              x={PAD_X - 4} y={py(v) + 4}
              textAnchor="end"
              fill="rgba(100,116,139,0.45)"
              fontSize={9}
              style={{ fontFamily: "system-ui" }}
            >
              {v}%
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ── Score Ring (SVG) ───────────────────────────────────────────────────────────

function ScoreRing({
  score, max, label, size = 120, strokeWidth = 10, accent = "#2DD4BF",
}: {
  score: number; max: number; label: string;
  size?: number; strokeWidth?: number; accent?: string;
}) {
  const r      = (size - strokeWidth * 2) / 2;
  const circ   = 2 * Math.PI * r;
  const pct    = max > 0 ? Math.min(score / max, 1) : 0;
  const offset = circ * (1 - pct);
  const cx     = size / 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={cx} cy={cx} r={r}
          fill="none" stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={cx} cy={cx} r={r}
          fill="none" stroke={accent}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease", filter: `drop-shadow(0 0 6px ${accent}66)` }}
        />
        {/* Score text — re-rotate to display upright */}
        <text
          x={cx} y={cx - 6}
          textAnchor="middle" dominantBaseline="middle"
          fill="#F1F5F9" fontSize={size * 0.22} fontWeight={700}
          style={{ transform: "rotate(90deg)", transformOrigin: `${cx}px ${cx}px`, fontFamily: "system-ui" }}
        >
          {score}
        </text>
        <text
          x={cx} y={cx + size * 0.14}
          textAnchor="middle" dominantBaseline="middle"
          fill="rgba(148,163,184,0.7)" fontSize={size * 0.1}
          style={{ transform: "rotate(90deg)", transformOrigin: `${cx}px ${cx}px`, fontFamily: "system-ui" }}
        >
          / {max}
        </text>
      </svg>
      <div style={{ fontSize: 11, color: "rgba(148,163,184,0.7)", fontWeight: 600, letterSpacing: "0.4px" }}>
        {label}
      </div>
    </div>
  );
}

// ── Check Row ─────────────────────────────────────────────────────────────────

function CheckRow({ check }: { check: AuditCheck }) {
  const [expanded, setExpanded] = useState(false);
  const s = STATUS_STYLE[check.status] ?? STATUS_STYLE.error;
  const isPending = check.status === "data_pending";

  return (
    <div
      onClick={() => !isPending && setExpanded(e => !e)}
      style={{
        padding: "10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        cursor: isPending ? "default" : "pointer",
        background: expanded ? "rgba(255,255,255,0.02)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Priority dot */}
        <div style={{
          width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
          background: PRIORITY_COLOR[check.priority],
        }} />

        {/* Label */}
        <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: isPending ? "rgba(148,163,184,0.45)" : "rgba(226,232,240,0.9)" }}>
          {check.checkLabel}
        </div>

        {/* Score */}
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: isPending ? "rgba(100,116,139,0.5)" : check.score === check.maxScore ? "#22C55E" : check.score > 0 ? "#F59E0B" : "#EF4444",
          minWidth: 36, textAlign: "right",
        }}>
          {isPending ? "—" : `${check.score}/${check.maxScore}`}
        </div>

        {/* Status badge */}
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.5px",
          textTransform: "uppercase", padding: "2px 7px", borderRadius: 6,
          background: s.bg, color: s.color, border: `1px solid ${s.border}`,
          flexShrink: 0,
        }}>
          {s.label}
        </div>

        {/* Expand chevron */}
        {!isPending && (
          <span style={{ fontSize: 10, color: "rgba(100,116,139,0.6)", marginLeft: 4 }}>
            {expanded ? "▲" : "▼"}
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && !isPending && (
        <div style={{ marginTop: 10, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          {check.currentValue && (
            <div style={{ fontSize: 11, color: "rgba(148,163,184,0.8)" }}>
              <span style={{ color: "rgba(100,116,139,0.7)", marginRight: 6 }}>Found:</span>
              {check.currentValue}
            </div>
          )}
          {check.recommendation && (
            <div style={{
              fontSize: 11, color: "#F59E0B",
              background: "rgba(245,158,11,0.07)", borderRadius: 6,
              padding: "6px 10px", borderLeft: "2px solid rgba(245,158,11,0.4)",
            }}>
              💡 {check.recommendation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Category Panel ─────────────────────────────────────────────────────────────

function CategoryPanel({ category, checks }: { category: CheckCategory; checks: AuditCheck[] }) {
  const meta       = CATEGORY_META[category];
  const localChecks = checks.filter(c => c.evidenceType === "local");
  const earned     = localChecks.reduce((s, c) => s + c.score, 0);
  const possible   = localChecks.reduce((s, c) => s + c.maxScore, 0);
  const pendingCt  = checks.filter(c => c.status === "data_pending").length;
  const pct        = possible > 0 ? earned / possible : 0;

  return (
    <div style={{
      borderRadius: 12, border: `1px solid ${meta.accent}22`,
      overflow: "hidden", marginBottom: 10,
    }}>
      {/* Header */}
      <div style={{
        background: `${meta.accent}09`,
        borderBottom: `1px solid ${meta.accent}1A`,
        padding: "10px 14px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 16 }}>{meta.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: meta.accent, letterSpacing: "0.5px", textTransform: "uppercase" }}>
            {meta.label}
          </div>
          {pendingCt > 0 && (
            <div style={{ fontSize: 9.5, color: "rgba(100,116,139,0.6)", marginTop: 1 }}>
              {pendingCt} check{pendingCt > 1 ? "s" : ""} need GBP API
            </div>
          )}
        </div>
        {/* Mini score bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: meta.accent }}>
            {earned}/{possible}
          </div>
          <div style={{ width: 60, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{
              width: `${pct * 100}%`, height: "100%", borderRadius: 3,
              background: meta.accent,
              transition: "width 0.5s ease",
            }} />
          </div>
        </div>
      </div>

      {/* Check rows */}
      <div style={{ background: "rgba(3,6,18,0.4)" }}>
        {checks.map(c => <CheckRow key={c.checkKey} check={c} />)}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GbpAuditPage() {
  const { activeBusiness } = useActiveBusiness();
  const apiFetch           = useApiFetch();
  const qc                 = useQueryClient();

  const clientId = activeBusiness?.id ?? "default";

  // ── Latest audit fetch ──────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery<{ snapshot: AuditSnapshot | null; checks: AuditCheck[] }>({
    queryKey: ["gbp-audit-latest", clientId],
    queryFn:  () => apiFetch(`/gbp/audit/latest?clientId=${encodeURIComponent(clientId)}`),
    staleTime: 60_000,
    retry: false,
  });

  // ── History fetch (for trend chart) ────────────────────────────────────────
  const { data: historyData } = useQuery<{ snapshots: HistorySnapshot[] }>({
    queryKey: ["gbp-audit-history", clientId],
    queryFn:  () => apiFetch(`/gbp/audit/history?clientId=${encodeURIComponent(clientId)}&limit=30`),
    staleTime: 60_000,
    retry: false,
  });

  // ── Run audit mutation ──────────────────────────────────────────────────────
  const { mutate: runAudit, isPending: isRunning } = useMutation({
    mutationFn: () => apiFetch("/gbp/audit/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    }),
    onSuccess: () => {
      toast.success("GBP audit complete");
      qc.invalidateQueries({ queryKey: ["gbp-audit-latest", clientId] });
      qc.invalidateQueries({ queryKey: ["gbp-audit-history", clientId] });
    },
    onError: () => toast.error("Audit failed — check console for details"),
  });

  const snap   = data?.snapshot ?? null;
  const checks = data?.checks ?? [];

  // Group checks by category in display order
  const CATEGORY_ORDER: CheckCategory[] = ["information", "media", "reviews", "posts", "authority"];
  const byCategory = CATEGORY_ORDER.map(cat => ({
    category: cat,
    checks:   checks.filter(c => c.category === cat),
  }));

  // ── Score percentage for ring (based on local evidence only) ───────────────
  const localPct = snap && snap.localMaxScore > 0
    ? Math.round((snap.localScore / snap.localMaxScore) * 100)
    : 0;

  const scoreColor =
    localPct >= 80 ? "#22C55E" :
    localPct >= 55 ? "#F59E0B" :
    localPct >= 30 ? "#FB923C" : "#EF4444";

  const lastRun = snap?.completedAt
    ? new Date(snap.completedAt).toLocaleString()
    : null;

  return (
    <AppShell>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px 60px" }}>

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", color: "#2DD4BF", textTransform: "uppercase" }}>
                  📍 Local Presence Engine
                </div>
                <span style={{ color: "rgba(100,116,139,0.5)", fontSize: 11 }}>›</span>
                <div style={{ fontSize: 11, color: "rgba(148,163,184,0.5)", letterSpacing: "0.4px" }}>
                  GBP Audit & Optimization
                </div>
              </div>
              <h1 style={{ margin: "6px 0 4px", fontSize: 22, fontWeight: 800, color: "#F1F5F9", letterSpacing: "-0.3px" }}>
                Google Business Profile Health
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: "rgba(148,163,184,0.65)", lineHeight: 1.5 }}>
                Canonical GBP health score. 25 checks across 5 categories.
                Phase 1 evaluates 10 checks (41 pts) from local data — connect the GBP Business Information API to unlock all 100 points.
              </p>
            </div>

            <button
              onClick={() => runAudit()}
              disabled={isRunning}
              style={{
                padding: "9px 20px", borderRadius: 9, border: "none", cursor: isRunning ? "not-allowed" : "pointer",
                background: isRunning ? "rgba(45,212,191,0.15)" : "rgba(45,212,191,0.2)",
                color: "#2DD4BF", fontSize: 12, fontWeight: 700, letterSpacing: "0.4px",
                boxShadow: isRunning ? "none" : "0 0 14px rgba(45,212,191,0.2)",
                transition: "all 0.15s", flexShrink: 0,
              }}
            >
              {isRunning ? "⟳ Running..." : "⚡ Run Audit"}
            </button>
          </div>
        </div>

        {/* ── Score overview ───────────────────────────────────────────────── */}
        {snap && (
          <div style={{
            background: "rgba(11,22,41,0.7)", borderRadius: 14,
            border: "1px solid rgba(45,212,191,0.15)",
            padding: "20px 24px", marginBottom: 20,
            display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap",
          }}>
            {/* Score ring */}
            <ScoreRing score={snap.localScore} max={snap.localMaxScore} label="Local Score" accent={scoreColor} size={110} strokeWidth={9} />

            {/* Divider */}
            <div style={{ width: 1, height: 80, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />

            {/* Stats grid */}
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 12 }}>
              {[
                { label: "Passed",       value: snap.checksPassed,  color: "#22C55E" },
                { label: "Warning",      value: snap.checksWarning, color: "#F59E0B" },
                { label: "Failed",       value: snap.checksFailed,  color: "#EF4444" },
                { label: "Need GBP API", value: snap.checksPending, color: "#64748B" },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(148,163,184,0.55)", marginTop: 3, fontWeight: 600, letterSpacing: "0.3px" }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 80, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />

            {/* GBP connection status */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 160 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: snap.gbpConnected ? "#22C55E" : "#EF4444",
                  boxShadow: snap.gbpConnected ? "0 0 6px #22C55E" : "none",
                }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: snap.gbpConnected ? "#22C55E" : "#EF4444" }}>
                  {snap.gbpConnected ? "GBP Connected" : "GBP Not Connected"}
                </span>
              </div>
              {snap.locationTitle && (
                <div style={{ fontSize: 11, color: "rgba(148,163,184,0.65)", paddingLeft: 15 }}>
                  {snap.locationTitle}
                </div>
              )}
              {lastRun && (
                <div style={{ fontSize: 10, color: "rgba(100,116,139,0.6)", paddingLeft: 15 }}>
                  Last run: {lastRun}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Score trend chart ────────────────────────────────────────────── */}
        {snap && (
          <TrendChart snapshots={historyData?.snapshots ?? []} />
        )}

        {/* ── Phase 2 unlock callout ───────────────────────────────────────── */}
        {snap && snap.checksPending > 0 && (
          <div style={{
            background: "rgba(100,116,139,0.07)", borderRadius: 10,
            border: "1px solid rgba(100,116,139,0.18)",
            padding: "12px 16px", marginBottom: 20,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>🔒</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(148,163,184,0.9)" }}>
                {snap.checksPending} checks need the GBP Business Information API
              </div>
              <div style={{ fontSize: 11, color: "rgba(100,116,139,0.7)", marginTop: 2 }}>
                Phase 2 will connect the full GBP API to unlock photo verification, hours, categories, description, response rate, and more — unlocking all 59 remaining points.
              </div>
            </div>
          </div>
        )}

        {/* ── Loading state ────────────────────────────────────────────────── */}
        {isLoading && (
          <div style={{ textAlign: "center", padding: 60, color: "rgba(148,163,184,0.5)", fontSize: 13 }}>
            Loading audit data…
          </div>
        )}

        {/* ── Error state ──────────────────────────────────────────────────── */}
        {isError && (
          <div style={{
            background: "rgba(239,68,68,0.08)", borderRadius: 10,
            border: "1px solid rgba(239,68,68,0.2)", padding: "14px 18px",
            color: "#EF4444", fontSize: 12, marginBottom: 20,
          }}>
            Failed to load audit data. Make sure the API server is running.
          </div>
        )}

        {/* ── No audit yet ─────────────────────────────────────────────────── */}
        {!isLoading && !isError && !snap && (
          <div style={{
            textAlign: "center", padding: "50px 20px",
            background: "rgba(11,22,41,0.5)", borderRadius: 14,
            border: "1px dashed rgba(45,212,191,0.2)",
          }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>🏥</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(226,232,240,0.8)", marginBottom: 8 }}>
              No audit yet
            </div>
            <div style={{ fontSize: 12, color: "rgba(148,163,184,0.55)", marginBottom: 20 }}>
              Run your first GBP Health Audit to see how your Google Business Profile scores across 25 checks.
            </div>
            <button
              onClick={() => runAudit()}
              disabled={isRunning}
              style={{
                padding: "10px 24px", borderRadius: 9, border: "none", cursor: "pointer",
                background: "rgba(45,212,191,0.25)", color: "#2DD4BF", fontSize: 13,
                fontWeight: 700, boxShadow: "0 0 20px rgba(45,212,191,0.2)",
              }}
            >
              {isRunning ? "⟳ Running audit…" : "⚡ Run First Audit"}
            </button>
          </div>
        )}

        {/* ── Check categories ─────────────────────────────────────────────── */}
        {!isLoading && !isError && checks.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", color: "rgba(148,163,184,0.5)", textTransform: "uppercase", marginBottom: 12 }}>
              Audit Results — Click any check to expand
            </div>
            {byCategory.map(({ category, checks: catChecks }) =>
              catChecks.length > 0 ? (
                <CategoryPanel key={category} category={category} checks={catChecks} />
              ) : null
            )}
          </div>
        )}

        {/* ── Priority legend ──────────────────────────────────────────────── */}
        {checks.length > 0 && (
          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "rgba(100,116,139,0.5)", fontWeight: 600, letterSpacing: "0.4px" }}>
              PRIORITY
            </span>
            {(["critical", "high", "medium", "low"] as CheckPriority[]).map(p => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: PRIORITY_COLOR[p] }} />
                <span style={{ fontSize: 10, color: "rgba(148,163,184,0.5)", textTransform: "capitalize" }}>{p}</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </AppShell>
  );
}
