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

// ── Optimization types ─────────────────────────────────────────────────────────

type Severity   = "Critical" | "High" | "Medium" | "Low";
type Difficulty = "Easy"     | "Moderate" | "Advanced";
type GroupName  = "quick_win" | "high_impact" | "needs_attention" | "long_term" | "optimized";
type OppTrend   = "improved" | "regressed" | "new_issue" | "resolved" | "unchanged";

interface OptOpportunity {
  id:                        string;
  snapshotId:                string;
  checkKey:                  string;
  category:                  string;
  title:                     string;
  description:               string;
  severity:                  Severity;
  priorityScore:             number;
  estimatedImpact:           number;
  implementationDifficulty:  Difficulty;
  confidence:                number;
  evidence:                  string;
  recommendedAction:         string;
  supportingGoogleGuideline: string | null;
  groupName:                 GroupName;
  trend:                     OppTrend | null;
  timeEstimate:              string | null;
  aiFixAvailable:            boolean;
  checkStatus:               string;
  resolved:                  boolean;
  resolvedAt:                string | null;
}

interface OptimizationsResponse {
  snapshotId:    string | null;
  snapshotDate:  string | null;
  opportunities: OptOpportunity[];
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

const SEVERITY_STYLE: Record<Severity, { bg: string; color: string; border: string }> = {
  Critical: { bg: "rgba(239,68,68,0.15)",   color: "#EF4444", border: "rgba(239,68,68,0.35)"   },
  High:     { bg: "rgba(245,158,11,0.15)",  color: "#F59E0B", border: "rgba(245,158,11,0.35)"  },
  Medium:   { bg: "rgba(96,165,250,0.13)",  color: "#60A5FA", border: "rgba(96,165,250,0.3)"   },
  Low:      { bg: "rgba(100,116,139,0.12)", color: "#64748B", border: "rgba(100,116,139,0.25)" },
};

const DIFFICULTY_STYLE: Record<Difficulty, { color: string; icon: string }> = {
  Easy:     { color: "#22C55E", icon: "⚡" },
  Moderate: { color: "#F59E0B", icon: "🔧" },
  Advanced: { color: "#EF4444", icon: "🔩" },
};

const TREND_META: Record<OppTrend, { icon: string; color: string; label: string }> = {
  improved:  { icon: "↑", color: "#22C55E", label: "Improved" },
  regressed: { icon: "↓", color: "#EF4444", label: "Regressed" },
  new_issue: { icon: "!", color: "#EF4444", label: "New Issue" },
  resolved:  { icon: "✓", color: "#22C55E", label: "Resolved" },
  unchanged: { icon: "→", color: "#64748B", label: "Unchanged" },
};

const GROUP_META: Record<GroupName, { label: string; icon: string; accent: string; description: string }> = {
  quick_win:       { label: "Quick Wins",            icon: "⚡", accent: "#22C55E", description: "Easy to fix, high impact" },
  high_impact:     { label: "High Impact",           icon: "🎯", accent: "#F59E0B", description: "Biggest ranking gains" },
  needs_attention: { label: "Needs Attention",       icon: "⚠️", accent: "#EF4444", description: "Critical or high severity" },
  long_term:       { label: "Long-Term",             icon: "🔮", accent: "#A78BFA", description: "Harder or lower urgency" },
  optimized:       { label: "Already Optimized",     icon: "✅", accent: "#64748B", description: "Passing checks" },
};

// ── Trend Chart ────────────────────────────────────────────────────────────────

function TrendChart({ snapshots }: { snapshots: HistorySnapshot[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const complete = snapshots
    .filter(s => s.status === "complete")
    .slice()
    .reverse();

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

  const W = 560; const H = 80; const PAD_X = 32; const PAD_Y = 12;
  const scores  = complete.map(s => s.maxScore > 0 ? Math.round((s.overallScore / s.maxScore) * 100) : 0);
  const minS    = Math.max(0, Math.min(...scores) - 10);
  const maxS    = Math.min(100, Math.max(...scores) + 10);
  const range   = maxS - minS || 10;
  const px      = (i: number) => PAD_X + (i / (complete.length - 1)) * (W - PAD_X * 2);
  const py      = (v: number) => H - PAD_Y - ((v - minS) / range) * (H - PAD_Y * 2);
  const points  = scores.map((v, i) => `${px(i)},${py(v)}`).join(" ");
  const first   = scores[0]; const last = scores[scores.length - 1]; const delta = last - first;
  const trendColor = delta > 2 ? "#22C55E" : delta < -2 ? "#EF4444" : "#60A5FA";
  const trendLabel = delta > 2 ? `▲ +${delta} pts` : delta < -2 ? `▼ ${delta} pts` : "→ Stable";
  const hovSnap  = hovered !== null ? complete[hovered] : null;
  const hovScore = hovered !== null ? scores[hovered]   : null;

  return (
    <div style={{
      background: "rgba(11,22,41,0.7)", borderRadius: 14,
      border: "1px solid rgba(45,212,191,0.1)",
      padding: "16px 20px", marginBottom: 20,
    }}>
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
            <div style={{ fontSize: 11, fontWeight: 700, color: trendColor }}>{trendLabel}</div>
          )}
          <div style={{ fontSize: 11, color: "rgba(100,116,139,0.5)" }}>
            Current: <span style={{ color: "#F1F5F9", fontWeight: 700 }}>{last}%</span>
          </div>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block", minWidth: 200 }}
          onMouseLeave={() => setHovered(null)}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={trendColor} stopOpacity="0.18" />
              <stop offset="100%" stopColor={trendColor} stopOpacity="0"    />
            </linearGradient>
          </defs>
          {[25, 50, 75].map(v => { const y = py(v); if (y < 0 || y > H) return null;
            return <line key={v} x1={PAD_X} y1={y} x2={W - PAD_X} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />; })}
          <polygon points={`${px(0)},${H} ${points} ${px(complete.length - 1)},${H}`} fill="url(#trendFill)" />
          <polyline points={points} fill="none" stroke={trendColor} strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${trendColor}55)` }} />
          {complete.map((s, i) => {
            const x = px(i); const y = py(scores[i]); const isHov = hovered === i;
            return (
              <g key={s.id}>
                <rect x={x - 14} y={0} width={28} height={H} fill="transparent"
                  onMouseEnter={() => setHovered(i)} style={{ cursor: "crosshair" }} />
                {isHov && <line x1={x} y1={PAD_Y} x2={x} y2={H - PAD_Y}
                  stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3,3" />}
                <circle cx={x} cy={y} r={isHov ? 5 : 3}
                  fill={isHov ? trendColor : "#030612"} stroke={trendColor}
                  strokeWidth={isHov ? 2 : 1.5}
                  style={{ transition: "r 0.1s, fill 0.1s", pointerEvents: "none" }} />
              </g>
            );
          })}
          {[minS, maxS].map((v, i) => (
            <text key={i} x={PAD_X - 4} y={py(v) + 4} textAnchor="end"
              fill="rgba(100,116,139,0.45)" fontSize={9} style={{ fontFamily: "system-ui" }}>{v}%</text>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ── Score Ring ─────────────────────────────────────────────────────────────────

function ScoreRing({ score, max, label, size = 120, strokeWidth = 10, accent = "#2DD4BF" }:
  { score: number; max: number; label: string; size?: number; strokeWidth?: number; accent?: string }) {
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const pct  = max > 0 ? Math.min(score / max, 1) : 0;
  const offset = circ * (1 - pct);
  const cx = size / 2;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={accent} strokeWidth={strokeWidth}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease", filter: `drop-shadow(0 0 6px ${accent}66)` }} />
        <text x={cx} y={cx - 6} textAnchor="middle" dominantBaseline="middle"
          fill="#F1F5F9" fontSize={size * 0.22} fontWeight={700}
          style={{ transform: "rotate(90deg)", transformOrigin: `${cx}px ${cx}px`, fontFamily: "system-ui" }}>
          {score}
        </text>
        <text x={cx} y={cx + size * 0.14} textAnchor="middle" dominantBaseline="middle"
          fill="rgba(148,163,184,0.7)" fontSize={size * 0.1}
          style={{ transform: "rotate(90deg)", transformOrigin: `${cx}px ${cx}px`, fontFamily: "system-ui" }}>
          / {max}
        </text>
      </svg>
      <div style={{ fontSize: 11, color: "rgba(148,163,184,0.7)", fontWeight: 600, letterSpacing: "0.4px" }}>
        {label}
      </div>
    </div>
  );
}

// ── Check Row ──────────────────────────────────────────────────────────────────

function CheckRow({ check }: { check: AuditCheck }) {
  const [expanded, setExpanded] = useState(false);
  const s = STATUS_STYLE[check.status] ?? STATUS_STYLE.error;
  const isPending = check.status === "data_pending";
  return (
    <div onClick={() => !isPending && setExpanded(e => !e)} style={{
      padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)",
      cursor: isPending ? "default" : "pointer",
      background: expanded ? "rgba(255,255,255,0.02)" : "transparent",
      transition: "background 0.1s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: PRIORITY_COLOR[check.priority] }} />
        <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: isPending ? "rgba(148,163,184,0.45)" : "rgba(226,232,240,0.9)" }}>
          {check.checkLabel}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700,
          color: isPending ? "rgba(100,116,139,0.5)" : check.score === check.maxScore ? "#22C55E" : check.score > 0 ? "#F59E0B" : "#EF4444",
          minWidth: 36, textAlign: "right" }}>
          {isPending ? "—" : `${check.score}/${check.maxScore}`}
        </div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase",
          padding: "2px 7px", borderRadius: 6, background: s.bg, color: s.color, border: `1px solid ${s.border}`, flexShrink: 0 }}>
          {s.label}
        </div>
        {!isPending && (
          <span style={{ fontSize: 10, color: "rgba(100,116,139,0.6)", marginLeft: 4 }}>{expanded ? "▲" : "▼"}</span>
        )}
      </div>
      {expanded && !isPending && (
        <div style={{ marginTop: 10, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          {check.currentValue && (
            <div style={{ fontSize: 11, color: "rgba(148,163,184,0.8)" }}>
              <span style={{ color: "rgba(100,116,139,0.7)", marginRight: 6 }}>Found:</span>
              {check.currentValue}
            </div>
          )}
          {check.recommendation && (
            <div style={{ fontSize: 11, color: "#F59E0B", background: "rgba(245,158,11,0.07)",
              borderRadius: 6, padding: "6px 10px", borderLeft: "2px solid rgba(245,158,11,0.4)" }}>
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
  const meta        = CATEGORY_META[category];
  const localChecks = checks.filter(c => c.evidenceType === "local");
  const earned      = localChecks.reduce((s, c) => s + c.score, 0);
  const possible    = localChecks.reduce((s, c) => s + c.maxScore, 0);
  const pendingCt   = checks.filter(c => c.status === "data_pending").length;
  const pct         = possible > 0 ? earned / possible : 0;
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${meta.accent}22`, overflow: "hidden", marginBottom: 10 }}>
      <div style={{ background: `${meta.accent}09`, borderBottom: `1px solid ${meta.accent}1A`,
        padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: meta.accent }}>{earned}/{possible}</div>
          <div style={{ width: 60, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ width: `${pct * 100}%`, height: "100%", borderRadius: 3, background: meta.accent, transition: "width 0.5s ease" }} />
          </div>
        </div>
      </div>
      <div style={{ background: "rgba(3,6,18,0.4)" }}>
        {checks.map(c => <CheckRow key={c.checkKey} check={c} />)}
      </div>
    </div>
  );
}

// ── Optimization: Stats Bar ────────────────────────────────────────────────────

function OptimizationStats({ opps }: { opps: OptOpportunity[] }) {
  const actionable    = opps.filter(o => o.checkStatus !== "data_pending");
  const maxScore      = actionable.length * 100;
  const totalImpact   = actionable.reduce((s, o) => s + o.estimatedImpact, 0);
  const optScore      = maxScore > 0 ? Math.round((totalImpact / maxScore) * 100) : 0;

  const notOpt       = opps.filter(o => o.groupName !== "optimized");
  const criticalCt   = notOpt.filter(o => o.severity === "Critical").length;
  const highCt       = notOpt.filter(o => o.severity === "High").length;
  const rankImprove  = Math.min(100, criticalCt * 10 + highCt * 5);
  const hasRevGap    = notOpt.some(o => ["review_count","average_rating","review_velocity"].includes(o.checkKey));
  const custImpact   = Math.min(100, criticalCt * 12 + highCt * 6 + (hasRevGap ? 12 : 0));

  const scoreColor =
    optScore >= 75 ? "#22C55E" :
    optScore >= 50 ? "#F59E0B" :
    optScore >= 25 ? "#FB923C" : "#EF4444";

  return (
    <div style={{
      background: "rgba(11,22,41,0.7)", borderRadius: 14,
      border: "1px solid rgba(45,212,191,0.15)",
      padding: "18px 22px", marginBottom: 20,
      display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
    }}>
      <ScoreRing score={optScore} max={100} label="Opt Score" accent={scoreColor} size={100} strokeWidth={8} />
      <div style={{ width: 1, height: 70, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 16 }}>
        {[
          { label: "Critical Issues",          value: criticalCt,               color: "#EF4444", suffix: "" },
          { label: "High Issues",              value: highCt,                   color: "#F59E0B", suffix: "" },
          { label: "Est. Ranking Uplift",      value: rankImprove,              color: "#60A5FA", suffix: "%" },
          { label: "Est. Customer Impact",     value: custImpact,               color: "#2DD4BF", suffix: "%" },
        ].map(s => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>
              {s.value}{s.suffix}
            </div>
            <div style={{ fontSize: 10, color: "rgba(148,163,184,0.55)", marginTop: 3, fontWeight: 600, letterSpacing: "0.3px" }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Optimization: Opportunity Card ────────────────────────────────────────────

function OpportunityCard({
  opp, rank, onToggleResolved,
}: {
  opp:              OptOpportunity;
  rank?:            number;
  onToggleResolved: (id: string, resolved: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev   = SEVERITY_STYLE[opp.severity];
  const diff  = DIFFICULTY_STYLE[opp.implementationDifficulty];
  const trend = opp.trend ? TREND_META[opp.trend] : null;
  const isOptimized = opp.groupName === "optimized";

  return (
    <div style={{
      borderRadius: 10,
      border: opp.resolved
        ? "1px solid rgba(34,197,94,0.2)"
        : isOptimized
        ? "1px solid rgba(100,116,139,0.18)"
        : `1px solid ${sev.border}`,
      background: opp.resolved
        ? "rgba(34,197,94,0.04)"
        : "rgba(11,22,41,0.55)",
      marginBottom: 8,
      overflow: "hidden",
      opacity: opp.resolved && !isOptimized ? 0.7 : 1,
      transition: "opacity 0.2s",
    }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10 }}
      >
        {rank !== undefined && (
          <div style={{
            width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
            background: "rgba(45,212,191,0.15)", border: "1px solid rgba(45,212,191,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 800, color: "#2DD4BF",
          }}>
            {rank}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Tag row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.4px", textTransform: "uppercase",
              color: "rgba(100,116,139,0.6)", background: "rgba(100,116,139,0.08)",
              padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(100,116,139,0.15)" }}>
              {opp.category}
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.4px", textTransform: "uppercase",
              padding: "2px 7px", borderRadius: 4, background: sev.bg, color: sev.color, border: `1px solid ${sev.border}` }}>
              {opp.severity}
            </span>
            {opp.aiFixAvailable && (
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.3px",
                padding: "2px 6px", borderRadius: 4,
                background: "rgba(167,139,250,0.12)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.25)" }}>
                ✨ AI Fix
              </span>
            )}
            {trend && (
              <span style={{ fontSize: 9, fontWeight: 700, color: trend.color }}>
                {trend.icon} {trend.label}
              </span>
            )}
            {opp.resolved && !isOptimized && (
              <span style={{ fontSize: 9, fontWeight: 700, color: "#22C55E" }}>✓ Resolved</span>
            )}
          </div>

          {/* Title */}
          <div style={{ fontSize: 13, fontWeight: 700, color: isOptimized ? "rgba(226,232,240,0.6)" : "rgba(226,232,240,0.92)", lineHeight: 1.3 }}>
            {opp.title}
          </div>
        </div>

        {/* Impact + expand */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#F1F5F9" }}>{opp.priorityScore}</div>
            <div style={{ fontSize: 9, color: "rgba(100,116,139,0.5)", letterSpacing: "0.3px" }}>PRIORITY</div>
          </div>
          <span style={{ fontSize: 10, color: "rgba(100,116,139,0.5)" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: "0 14px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Description */}
          <div style={{ fontSize: 12, color: "rgba(148,163,184,0.8)", lineHeight: 1.55, paddingTop: 2 }}>
            {opp.description}
          </div>

          {/* Evidence */}
          <div style={{
            background: "rgba(255,255,255,0.03)", borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.06)", padding: "8px 10px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(100,116,139,0.6)", letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 4 }}>
              Current State
            </div>
            <div style={{ fontSize: 12, color: "rgba(226,232,240,0.75)" }}>{opp.evidence}</div>
          </div>

          {/* Recommended action */}
          {opp.recommendedAction && (
            <div style={{
              background: "rgba(245,158,11,0.07)", borderRadius: 6,
              border: "1px solid rgba(245,158,11,0.2)", padding: "8px 10px",
              borderLeft: "2px solid rgba(245,158,11,0.5)",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(245,158,11,0.7)", letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 4 }}>
                Recommended Action
              </div>
              <div style={{ fontSize: 12, color: "rgba(226,232,240,0.8)", lineHeight: 1.5 }}>
                {opp.recommendedAction}
              </div>
            </div>
          )}

          {/* Footer row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: diff.color }}>
              {diff.icon} {opp.implementationDifficulty}
            </span>
            {opp.timeEstimate && (
              <span style={{ fontSize: 10, color: "rgba(100,116,139,0.6)" }}>
                ⏱ {opp.timeEstimate}
              </span>
            )}
            <span style={{ fontSize: 10, color: "rgba(100,116,139,0.55)" }}>
              Impact: {opp.estimatedImpact}/100
            </span>
            <span style={{ fontSize: 10, color: "rgba(100,116,139,0.55)" }}>
              Confidence: {opp.confidence}%
            </span>
            {opp.supportingGoogleGuideline && (
              <a
                href={opp.supportingGoogleGuideline}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 10, color: "#60A5FA", textDecoration: "none", marginLeft: "auto" }}
              >
                📌 Google Guide →
              </a>
            )}
          </div>

          {/* Resolve button (only for non-auto-resolved) */}
          {!isOptimized && (
            <button
              onClick={e => { e.stopPropagation(); onToggleResolved(opp.id, !opp.resolved); }}
              style={{
                alignSelf: "flex-start",
                padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                background: opp.resolved ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                color: opp.resolved ? "#EF4444" : "#22C55E",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.3px",
              }}
            >
              {opp.resolved ? "↩ Mark Unresolved" : "✓ Mark Resolved"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Optimization: Group Section ────────────────────────────────────────────────

function GroupSection({
  groupName, opps, onToggleResolved, defaultOpen = true,
}: {
  groupName:        GroupName;
  opps:             OptOpportunity[];
  onToggleResolved: (id: string, resolved: boolean) => void;
  defaultOpen?:     boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = GROUP_META[groupName];
  if (opps.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: open ? 10 : 0,
          cursor: "pointer", padding: "8px 0",
        }}
      >
        <span style={{ fontSize: 15 }}>{meta.icon}</span>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: meta.accent, letterSpacing: "0.4px", textTransform: "uppercase" }}>
            {meta.label}
          </span>
          <span style={{ fontSize: 10, color: "rgba(100,116,139,0.55)", marginLeft: 8 }}>
            {meta.description}
          </span>
        </div>
        <div style={{
          fontSize: 10, fontWeight: 700, color: meta.accent,
          background: `${meta.accent}18`, border: `1px solid ${meta.accent}30`,
          padding: "2px 8px", borderRadius: 10,
        }}>
          {opps.length}
        </div>
        <span style={{ fontSize: 10, color: "rgba(100,116,139,0.5)" }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && opps.map(o => (
        <OpportunityCard key={o.id} opp={o} onToggleResolved={onToggleResolved} />
      ))}
    </div>
  );
}

// ── Optimization: Top 5 Panel ──────────────────────────────────────────────────

function TopActionsPanel({
  opps, onToggleResolved,
}: {
  opps:             OptOpportunity[];
  onToggleResolved: (id: string, resolved: boolean) => void;
}) {
  const top5 = opps
    .filter(o => o.groupName !== "optimized")
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5);

  if (top5.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", color: "rgba(148,163,184,0.5)",
        textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span>★</span> Top 5 Recommended Actions
      </div>
      {top5.map((o, i) => (
        <OpportunityCard key={o.id} opp={o} rank={i + 1} onToggleResolved={onToggleResolved} />
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GbpAuditPage() {
  const { activeBusiness } = useActiveBusiness();
  const apiFetch           = useApiFetch();
  const qc                 = useQueryClient();
  const [activeTab, setActiveTab] = useState<"audit" | "optimization">("audit");

  const clientId = activeBusiness?.id ?? "default";

  const { data, isLoading, isError } = useQuery<{ snapshot: AuditSnapshot | null; checks: AuditCheck[] }>({
    queryKey: ["gbp-audit-latest", clientId],
    queryFn:  () => apiFetch(`/gbp/audit/latest?clientId=${encodeURIComponent(clientId)}`),
    staleTime: 60_000, retry: false,
  });

  const { data: historyData } = useQuery<{ snapshots: HistorySnapshot[] }>({
    queryKey: ["gbp-audit-history", clientId],
    queryFn:  () => apiFetch(`/gbp/audit/history?clientId=${encodeURIComponent(clientId)}&limit=30`),
    staleTime: 60_000, retry: false,
  });

  const { data: optData, isLoading: optLoading } = useQuery<OptimizationsResponse>({
    queryKey: ["gbp-audit-optimizations", clientId],
    queryFn:  () => apiFetch(`/gbp/audit/optimizations?clientId=${encodeURIComponent(clientId)}`),
    staleTime: 60_000, retry: false,
    enabled:  activeTab === "optimization",
  });

  const { mutate: runAudit, isPending: isRunning } = useMutation({
    mutationFn: () => apiFetch("/gbp/audit/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    }),
    onSuccess: () => {
      toast.success("GBP audit complete");
      qc.invalidateQueries({ queryKey: ["gbp-audit-latest",        clientId] });
      qc.invalidateQueries({ queryKey: ["gbp-audit-history",       clientId] });
      qc.invalidateQueries({ queryKey: ["gbp-audit-optimizations", clientId] });
    },
    onError: () => toast.error("Audit failed — check console for details"),
  });

  const { mutate: toggleResolved } = useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
      apiFetch(`/gbp/audit/optimizations/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ resolved }),
      }),
    onSuccess: (_, { resolved }) => {
      toast.success(resolved ? "Marked as resolved" : "Marked as unresolved");
      qc.invalidateQueries({ queryKey: ["gbp-audit-optimizations", clientId] });
    },
    onError: () => toast.error("Failed to update opportunity"),
  });

  const snap   = data?.snapshot ?? null;
  const checks = data?.checks   ?? [];
  const opps   = optData?.opportunities ?? [];

  const CATEGORY_ORDER: CheckCategory[] = ["information", "media", "reviews", "posts", "authority"];
  const byCategory = CATEGORY_ORDER.map(cat => ({
    category: cat,
    checks:   checks.filter(c => c.category === cat),
  }));

  const localPct = snap && snap.localMaxScore > 0
    ? Math.round((snap.localScore / snap.localMaxScore) * 100)
    : 0;
  const scoreColor =
    localPct >= 80 ? "#22C55E" :
    localPct >= 55 ? "#F59E0B" :
    localPct >= 30 ? "#FB923C" : "#EF4444";
  const lastRun = snap?.completedAt ? new Date(snap.completedAt).toLocaleString() : null;

  const oppsByGroup = {
    quick_win:       opps.filter(o => o.groupName === "quick_win"),
    high_impact:     opps.filter(o => o.groupName === "high_impact"),
    needs_attention: opps.filter(o => o.groupName === "needs_attention"),
    long_term:       opps.filter(o => o.groupName === "long_term"),
    optimized:       opps.filter(o => o.groupName === "optimized"),
  };

  const handleToggleResolved = (id: string, resolved: boolean) => toggleResolved({ id, resolved });

  return (
    <AppShell>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px 60px" }}>

        {/* Page header */}
        <div style={{ marginBottom: 20 }}>
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
                Canonical GBP health score. 25 checks across 5 categories. Phase 3: actionable optimization engine.
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

        {/* Score overview */}
        {snap && (
          <div style={{
            background: "rgba(11,22,41,0.7)", borderRadius: 14,
            border: "1px solid rgba(45,212,191,0.15)",
            padding: "20px 24px", marginBottom: 16,
            display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap",
          }}>
            <ScoreRing score={snap.localScore} max={snap.localMaxScore} label="Local Score" accent={scoreColor} size={110} strokeWidth={9} />
            <div style={{ width: 1, height: 80, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 12 }}>
              {[
                { label: "Passed",       value: snap.checksPassed,  color: "#22C55E" },
                { label: "Warning",      value: snap.checksWarning, color: "#F59E0B" },
                { label: "Failed",       value: snap.checksFailed,  color: "#EF4444" },
                { label: "Need GBP API", value: snap.checksPending, color: "#64748B" },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: "rgba(148,163,184,0.55)", marginTop: 3, fontWeight: 600, letterSpacing: "0.3px" }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ width: 1, height: 80, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 160 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%",
                  background: snap.gbpConnected ? "#22C55E" : "#EF4444",
                  boxShadow: snap.gbpConnected ? "0 0 6px #22C55E" : "none" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: snap.gbpConnected ? "#22C55E" : "#EF4444" }}>
                  {snap.gbpConnected ? "GBP Connected" : "GBP Not Connected"}
                </span>
              </div>
              {snap.locationTitle && (
                <div style={{ fontSize: 11, color: "rgba(148,163,184,0.65)", paddingLeft: 15 }}>{snap.locationTitle}</div>
              )}
              {lastRun && (
                <div style={{ fontSize: 10, color: "rgba(100,116,139,0.6)", paddingLeft: 15 }}>Last run: {lastRun}</div>
              )}
            </div>
          </div>
        )}

        {/* Tab bar */}
        {snap && (
          <div style={{
            display: "flex", gap: 4, marginBottom: 20,
            background: "rgba(11,22,41,0.5)", borderRadius: 10, padding: 4,
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            {([
              { key: "audit",        label: "📊 Audit Results"       },
              { key: "optimization", label: "🎯 Optimization Engine"  },
            ] as { key: "audit" | "optimization"; label: string }[]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: 1, padding: "8px 14px", borderRadius: 7, border: "none",
                  cursor: "pointer", fontSize: 12, fontWeight: 700,
                  transition: "all 0.15s",
                  background:  activeTab === tab.key ? "rgba(45,212,191,0.15)" : "transparent",
                  color:       activeTab === tab.key ? "#2DD4BF"              : "rgba(100,116,139,0.7)",
                  boxShadow:   activeTab === tab.key ? "0 0 10px rgba(45,212,191,0.1)" : "none",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Loading / Error states */}
        {isLoading && (
          <div style={{ textAlign: "center", padding: 60, color: "rgba(148,163,184,0.5)", fontSize: 13 }}>
            Loading audit data…
          </div>
        )}
        {isError && (
          <div style={{ background: "rgba(239,68,68,0.08)", borderRadius: 10,
            border: "1px solid rgba(239,68,68,0.2)", padding: "14px 18px",
            color: "#EF4444", fontSize: 12, marginBottom: 20 }}>
            Failed to load audit data. Make sure the API server is running.
          </div>
        )}

        {/* No audit yet */}
        {!isLoading && !isError && !snap && (
          <div style={{ textAlign: "center", padding: "50px 20px",
            background: "rgba(11,22,41,0.5)", borderRadius: 14,
            border: "1px dashed rgba(45,212,191,0.2)" }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>🏥</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(226,232,240,0.8)", marginBottom: 8 }}>No audit yet</div>
            <div style={{ fontSize: 12, color: "rgba(148,163,184,0.55)", marginBottom: 20 }}>
              Run your first GBP Health Audit to see how your Google Business Profile scores across 25 checks.
            </div>
            <button onClick={() => runAudit()} disabled={isRunning}
              style={{ padding: "10px 24px", borderRadius: 9, border: "none", cursor: "pointer",
                background: "rgba(45,212,191,0.25)", color: "#2DD4BF", fontSize: 13,
                fontWeight: 700, boxShadow: "0 0 20px rgba(45,212,191,0.2)" }}>
              {isRunning ? "⟳ Running audit…" : "⚡ Run First Audit"}
            </button>
          </div>
        )}

        {/* ── AUDIT RESULTS TAB ────────────────────────────────────────────── */}
        {snap && activeTab === "audit" && (
          <>
            <TrendChart snapshots={historyData?.snapshots ?? []} />

            {snap.checksPending > 0 && (
              <div style={{ background: "rgba(100,116,139,0.07)", borderRadius: 10,
                border: "1px solid rgba(100,116,139,0.18)", padding: "12px 16px", marginBottom: 20,
                display: "flex", alignItems: "center", gap: 12 }}>
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

            {checks.length > 0 && (
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

            {checks.length > 0 && (
              <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, color: "rgba(100,116,139,0.5)", fontWeight: 600, letterSpacing: "0.4px" }}>PRIORITY</span>
                {(["critical", "high", "medium", "low"] as CheckPriority[]).map(p => (
                  <div key={p} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: PRIORITY_COLOR[p] }} />
                    <span style={{ fontSize: 10, color: "rgba(148,163,184,0.5)", textTransform: "capitalize" }}>{p}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── OPTIMIZATION ENGINE TAB ──────────────────────────────────────── */}
        {snap && activeTab === "optimization" && (
          <>
            {optLoading && (
              <div style={{ textAlign: "center", padding: 60, color: "rgba(148,163,184,0.5)", fontSize: 13 }}>
                Generating optimization analysis…
              </div>
            )}

            {!optLoading && opps.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px",
                background: "rgba(11,22,41,0.5)", borderRadius: 14,
                border: "1px dashed rgba(45,212,191,0.2)", marginBottom: 20 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(226,232,240,0.8)", marginBottom: 8 }}>
                  No optimization data yet
                </div>
                <div style={{ fontSize: 12, color: "rgba(148,163,184,0.55)", marginBottom: 16 }}>
                  Run a new audit to generate your optimization plan.
                </div>
                <button onClick={() => runAudit()} disabled={isRunning}
                  style={{ padding: "9px 20px", borderRadius: 9, border: "none", cursor: "pointer",
                    background: "rgba(45,212,191,0.2)", color: "#2DD4BF", fontSize: 12, fontWeight: 700 }}>
                  {isRunning ? "⟳ Running…" : "⚡ Run Audit"}
                </button>
              </div>
            )}

            {!optLoading && opps.length > 0 && (
              <>
                {/* Stats */}
                <OptimizationStats opps={opps} />

                {/* Top 5 actions */}
                <TopActionsPanel opps={opps} onToggleResolved={handleToggleResolved} />

                {/* Divider */}
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", color: "rgba(148,163,184,0.5)",
                  textTransform: "uppercase", marginBottom: 16 }}>
                  All Opportunities — By Group
                </div>

                {/* Group sections */}
                <GroupSection groupName="quick_win"       opps={oppsByGroup.quick_win}       onToggleResolved={handleToggleResolved} defaultOpen={true}  />
                <GroupSection groupName="high_impact"     opps={oppsByGroup.high_impact}     onToggleResolved={handleToggleResolved} defaultOpen={true}  />
                <GroupSection groupName="needs_attention" opps={oppsByGroup.needs_attention} onToggleResolved={handleToggleResolved} defaultOpen={true}  />
                <GroupSection groupName="long_term"       opps={oppsByGroup.long_term}       onToggleResolved={handleToggleResolved} defaultOpen={false} />
                <GroupSection groupName="optimized"       opps={oppsByGroup.optimized}       onToggleResolved={handleToggleResolved} defaultOpen={false} />
              </>
            )}
          </>
        )}

      </div>
    </AppShell>
  );
}
