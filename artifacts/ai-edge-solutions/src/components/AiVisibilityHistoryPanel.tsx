/**
 * C9R-5: AI Visibility Scan History Panel.
 *
 * Displays a paginated list of AI query scan runs with:
 *   - Status badge (completed / failed / running)
 *   - Trigger source pill (manual / scheduled)
 *   - Key metrics: mention rate, query count, duration
 *   - SVG sparkline of mention rate over time (up to 20 most recent completed scans)
 *   - Accessible non-visual trend description for screen readers
 *   - Load More pagination
 *
 * Inline styles only (no Tailwind). Respects the dark/light theme token from useTheme().
 */

import React, { useState, useEffect, useCallback } from "react";
import { useTheme } from "@/contexts/theme-context";
import { useApiFetch } from "@/lib/api";

// ── Types (matching api-server AiScanHistorySummary shape) ────────────────────

interface AiScanHistorySummary {
  scanId:                 string;
  clientId:               string;
  triggerSource:          "manual" | "scheduled";
  provider:               string;
  model:                  string;
  status:                 "running" | "completed" | "failed";
  queryCount:             number;
  completedCount:         number;
  failedCount:            number;
  mentionCount:           number;
  mentionRate:            number;
  competitorMentionCount: number | null;
  citationCount:          number | null;
  startedAt:              string;
  completedAt:            string | null;
  durationMs:             number | null;
  errorMessage:           string | null;
  evidenceHref:           string;
}

interface AiScanHistoryPage {
  scans:    AiScanHistorySummary[];
  total:    number;
  page:     number;
  pageSize: number;
  hasMore:  boolean;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  clientId: string;
}

// ── Status helpers ────────────────────────────────────────────────────────────

export function statusColor(status: string): string {
  if (status === "completed") return "#22C55E";
  if (status === "failed")    return "#EF4444";
  return "#F59E0B";
}

export function statusLabel(status: string): string {
  if (status === "completed") return "Completed";
  if (status === "failed")    return "Failed";
  return "Running";
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000)   return `${ms}ms`;
  if (ms < 60000)  return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ── Sparkline helpers ─────────────────────────────────────────────────────────

interface SparkPoint { x: number; y: number; rate: number }

export function buildSparkPoints(scans: AiScanHistorySummary[], w: number, h: number): SparkPoint[] {
  const completed = [...scans]
    .filter(s => s.status === "completed")
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .slice(-20);

  if (completed.length < 2) return [];

  const rates = completed.map(s => s.mentionRate);
  const minR  = Math.min(...rates);
  const maxR  = Math.max(...rates);
  const range = maxR - minR || 0.001;
  const pad   = 4;

  return completed.map((s, i) => ({
    x: pad + (i / (completed.length - 1)) * (w - 2 * pad),
    y: h - pad - ((s.mentionRate - minR) / range) * (h - 2 * pad),
    rate: s.mentionRate,
  }));
}

function buildPolyline(pts: SparkPoint[]): string {
  return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

// ── Trend computation (mirrors server-side normalizeScanHistoryToTrendPoints) ─

type TrendDirection = "up" | "down" | "stable" | "insufficient_data";

export function deriveTrend(scans: AiScanHistorySummary[]): TrendDirection {
  const completed = scans.filter(s => s.status === "completed");
  if (completed.length < 2) return "insufficient_data";
  const first = completed[completed.length - 1].mentionRate;  // oldest
  const last  = completed[0].mentionRate;                      // newest (sorted DESC)
  if (first === 0) return last > 0 ? "up" : "insufficient_data";
  const change = ((last - first) / first) * 100;
  if (change > 5)  return "up";
  if (change < -5) return "down";
  return "stable";
}

const TREND_LABELS: Record<TrendDirection, string> = {
  up:                 "Trending up",
  down:               "Trending down",
  stable:             "Stable",
  insufficient_data:  "Not enough data",
};
const TREND_COLORS: Record<TrendDirection, string> = {
  up:                "#22C55E",
  down:              "#EF4444",
  stable:            "#F59E0B",
  insufficient_data: "#64748B",
};

// ── Main component ────────────────────────────────────────────────────────────

export default function AiVisibilityHistoryPanel({ clientId }: Props) {
  const { theme }                   = useTheme();
  const isDark                      = theme === "dark";
  const apiFetch                    = useApiFetch();

  const [scans,     setScans]       = useState<AiScanHistorySummary[]>([]);
  const [total,     setTotal]       = useState(0);
  const [hasMore,   setHasMore]     = useState(false);
  const [page,      setPage]        = useState(1);
  const [loading,   setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error,     setError]       = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const PAGE_SIZE = 15;

  const t = {
    text:   isDark ? "#E2E8F0"             : "#111827",
    text2:  isDark ? "#94A3B8"             : "#6B7280",
    card:   isDark ? "rgba(11,22,41,0.8)"  : "#FFFFFF",
    border: isDark ? "rgba(255,255,255,0.07)" : "#E5E7EB",
    row:    isDark ? "rgba(255,255,255,0.03)" : "#F9FAFB",
  };

  // ── Fetch page 1 whenever filter or clientId changes ──────────────────────

  const fetchPage = useCallback(async (pageNum: number, replace: boolean) => {
    if (replace) setLoading(true);
    else         setLoadingMore(true);
    setError(null);

    const params = new URLSearchParams({
      page:     String(pageNum),
      pageSize: String(PAGE_SIZE),
    });
    if (statusFilter) params.set("status", statusFilter);

    try {
      const data = await apiFetch<AiScanHistoryPage>(
        `/ai-visibility/read-model/${clientId}/history?${params.toString()}`,
      );
      setTotal(data.total);
      setHasMore(data.hasMore);
      setPage(pageNum);
      if (replace) setScans(data.scans);
      else         setScans(prev => [...prev, ...data.scans]);
    } catch {
      setError("Failed to load scan history.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [clientId, statusFilter, apiFetch]);

  useEffect(() => {
    void fetchPage(1, true);
  }, [fetchPage]);

  // ── Trend ─────────────────────────────────────────────────────────────────

  const trend      = deriveTrend(scans);
  const trendColor = TREND_COLORS[trend];

  // ── Sparkline data ────────────────────────────────────────────────────────

  const SW = 240, SH = 52;
  const sparkPts    = buildSparkPoints(scans, SW, SH);
  const polyline    = buildPolyline(sparkPts);
  const hasSpark    = sparkPts.length >= 2;

  // ── Accessible summary for screen readers ─────────────────────────────────

  const latestCompleted = scans.find(s => s.status === "completed");
  const a11ySummary = latestCompleted
    ? `AI query scan history for this business. ${total} scan${total !== 1 ? "s" : ""} total. ` +
      `Latest completed scan: ${(latestCompleted.mentionRate * 100).toFixed(0)}% mention rate ` +
      `across ${latestCompleted.completedCount} queries. Trend: ${TREND_LABELS[trend]}.`
    : `AI query scan history. ${total} scan${total !== 1 ? "s" : ""} recorded.`;

  // ── Styles ────────────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: t.card,
    border:     `1px solid ${t.border}`,
    borderRadius: 14,
  };

  // ── Loading / error / empty states ───────────────────────────────────────

  if (loading) return (
    <div style={{ padding: 40, textAlign: "center", color: t.text2, fontSize: 13 }}>
      Loading scan history…
    </div>
  );

  if (error) return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "#EF4444", marginBottom: 12 }}>{error}</div>
      <button
        onClick={() => fetchPage(1, true)}
        style={{ background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.35)", borderRadius: 8, padding: "8px 16px", color: "#00AEEF", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
      >
        Retry
      </button>
    </div>
  );

  if (!loading && scans.length === 0) return (
    <div style={{ ...card, padding: 48, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 8 }}>No scan history yet</div>
      <div style={{ fontSize: 13, color: t.text2, maxWidth: 320, margin: "0 auto" }}>
        Run your first AI query scan from the <strong>AI Query</strong> tab to start tracking how AI search platforms respond to queries about this business.
      </div>
    </div>
  );

  return (
    <div>
      {/* Screen-reader accessible summary */}
      <p className="sr-only" aria-live="polite">{a11ySummary}</p>

      {/* ── Header row: sparkline + trend + filters ── */}
      <div style={{ ...card, padding: "18px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>

        {/* Sparkline */}
        {hasSpark ? (
          <div aria-hidden="true">
            <svg width={SW} height={SH} style={{ display: "block" }}>
              {/* Area fill */}
              <defs>
                <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#00AEEF" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#00AEEF" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <polygon
                points={`${sparkPts[0].x.toFixed(1)},${SH} ${polyline} ${sparkPts[sparkPts.length-1].x.toFixed(1)},${SH}`}
                fill="url(#spark-fill)"
              />
              <polyline
                points={polyline}
                fill="none"
                stroke="#00AEEF"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Last point dot */}
              {sparkPts.length > 0 && (
                <circle
                  cx={sparkPts[sparkPts.length - 1].x}
                  cy={sparkPts[sparkPts.length - 1].y}
                  r="3"
                  fill="#00AEEF"
                />
              )}
            </svg>
          </div>
        ) : (
          <div style={{ width: SW, height: SH, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 11, color: t.text2 }}>Not enough data for trend</span>
          </div>
        )}

        {/* Trend badge + stats */}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 800, color: trendColor,
              background: `${trendColor}14`, border: `1px solid ${trendColor}30`,
              padding: "2px 9px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.4px",
            }}>
              {trend === "up" ? "↑" : trend === "down" ? "↓" : trend === "stable" ? "→" : "—"} {TREND_LABELS[trend]}
            </span>
          </div>
          <div style={{ fontSize: 12, color: t.text2 }}>
            {total} scan{total !== 1 ? "s" : ""} recorded
            {latestCompleted && ` · Latest: ${(latestCompleted.mentionRate * 100).toFixed(0)}% mention rate`}
          </div>
        </div>

        {/* Status filter */}
        <div style={{ display: "flex", gap: 6 }}>
          {(["", "completed", "failed"] as const).map(val => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              style={{
                fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 20, cursor: "pointer",
                background: statusFilter === val ? "rgba(0,174,239,0.15)" : "transparent",
                border: `1px solid ${statusFilter === val ? "rgba(0,174,239,0.5)" : t.border}`,
                color: statusFilter === val ? "#00AEEF" : t.text2,
                transition: "all 0.15s",
              }}
            >
              {val === "" ? "All" : val === "completed" ? "Completed" : "Failed"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scan list ── */}
      <div style={{ ...card, overflow: "hidden" }}>
        {scans.map((scan, idx) => {
          const sc = statusColor(scan.status);
          return (
            <div
              key={scan.scanId}
              style={{
                padding: "14px 20px",
                borderBottom: idx < scans.length - 1 ? `1px solid ${t.border}` : "none",
                background: idx % 2 === 0 ? t.card : t.row,
                display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
              }}
            >
              {/* Status dot + source pill */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 68 }}>
                <span style={{
                  fontSize: 9, fontWeight: 800, color: sc,
                  background: `${sc}14`, border: `1px solid ${sc}30`,
                  padding: "2px 7px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.4px",
                  whiteSpace: "nowrap",
                }}>
                  {statusLabel(scan.status)}
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  color:       scan.triggerSource === "scheduled" ? "#3B82F6" : "#94A3B8",
                  background:  scan.triggerSource === "scheduled" ? "rgba(59,130,246,0.1)" : "rgba(148,163,184,0.1)",
                  border:      `1px solid ${scan.triggerSource === "scheduled" ? "rgba(59,130,246,0.25)" : "rgba(148,163,184,0.2)"}`,
                  padding: "2px 7px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.4px",
                  whiteSpace: "nowrap",
                }}>
                  {scan.triggerSource === "scheduled" ? "🕐 Auto" : "▶ Manual"}
                </span>
              </div>

              {/* Date */}
              <div style={{ minWidth: 130 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>
                  {formatDate(scan.startedAt)}
                </div>
                <div style={{ fontSize: 10, color: t.text2, marginTop: 2 }}>
                  {scan.provider} · {formatDuration(scan.durationMs)}
                </div>
              </div>

              {/* Mention rate */}
              <div style={{ minWidth: 90 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: scan.mentionRate > 0.3 ? "#22C55E" : scan.mentionRate > 0.1 ? "#F59E0B" : t.text2 }}>
                  {(scan.mentionRate * 100).toFixed(0)}%
                </div>
                <div style={{ fontSize: 10, color: t.text2 }}>Mention rate</div>
              </div>

              {/* Queries */}
              <div style={{ minWidth: 80 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{scan.completedCount}/{scan.queryCount}</div>
                <div style={{ fontSize: 10, color: t.text2 }}>Queries done</div>
              </div>

              {/* Mentions */}
              <div style={{ minWidth: 70 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{scan.mentionCount}</div>
                <div style={{ fontSize: 10, color: t.text2 }}>Mentions</div>
              </div>

              {/* Competitor / citations */}
              {(scan.competitorMentionCount !== null || scan.citationCount !== null) && (
                <div style={{ display: "flex", gap: 16, minWidth: 130 }}>
                  {scan.competitorMentionCount !== null && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{scan.competitorMentionCount}</div>
                      <div style={{ fontSize: 10, color: t.text2 }}>Competitor refs</div>
                    </div>
                  )}
                  {scan.citationCount !== null && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{scan.citationCount}</div>
                      <div style={{ fontSize: 10, color: t.text2 }}>Citations</div>
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {scan.errorMessage && (
                <div style={{ flex: 1, minWidth: 100 }}>
                  <div style={{ fontSize: 11, color: "#EF4444", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                    {scan.errorMessage}
                  </div>
                </div>
              )}

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Evidence link */}
              {scan.status === "completed" && (
                <a
                  href="#"
                  onClick={e => { e.preventDefault(); }}
                  aria-label={`View evidence for scan from ${formatDate(scan.startedAt)}`}
                  style={{
                    fontSize: 11, fontWeight: 700, color: "#00AEEF",
                    background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.25)",
                    padding: "5px 11px", borderRadius: 8, textDecoration: "none",
                    whiteSpace: "nowrap", cursor: "default",
                    opacity: 0.6,
                  }}
                >
                  View Evidence
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Load More ── */}
      {hasMore && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          <button
            onClick={() => fetchPage(page + 1, false)}
            disabled={loadingMore}
            style={{
              background: "rgba(0,174,239,0.10)", border: "1px solid rgba(0,174,239,0.35)",
              borderRadius: 10, padding: "9px 22px", cursor: loadingMore ? "wait" : "pointer",
              color: "#00AEEF", fontSize: 12, fontWeight: 700,
              opacity: loadingMore ? 0.7 : 1,
            }}
          >
            {loadingMore ? "Loading…" : `Load more (${total - scans.length} remaining)`}
          </button>
        </div>
      )}
    </div>
  );
}
