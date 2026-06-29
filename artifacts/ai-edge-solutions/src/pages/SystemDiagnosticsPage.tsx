import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type HealthStatus = "healthy" | "warning" | "failed";

type PlatformHealth = {
  status: HealthStatus;
  detail: string;
  connectedAt: string | null;
  locationTitle?: string | null;
  cachedAt?: string | null;
  cooldownUntil?: string | null;
  refreshCooldownUntil?: string | null;
};

type HealthData = {
  platforms: {
    facebook: PlatformHealth;
    instagram: PlatformHealth;
    google_business: PlatformHealth;
    tiktok: PlatformHealth;
    youtube: PlatformHealth;
    telnyx: PlatformHealth;
  };
  postCounts: { draft: number; scheduled: number; pending: number; published: number; failed: number; partial: number };
  recentPosts: Array<{
    id: string; status: string; platforms: string[]; caption: string;
    scheduledAt: string | null; publishedAt: string | null; errorMessage: string | null; createdAt: string;
  }>;
  recentErrors: Array<{
    id: string; ts: string; platform: string; status: string; severity: string; message: string; caption: string;
  }>;
  aiEngine: {
    active: boolean; clientName: string | null; frequency: string | null; platforms: string[];
    scheduledCount: number; nextScheduledPost: string | null; totalPosts: number; lastUpdated: string | null;
  };
  checkedAt: string;
};

type LogEntry = {
  id: string;
  ts: string;
  level: "info" | "warn" | "error";
  tag: string;
  message: string;
};

type LogsData = { logs: LogEntry[]; total: number };

// ── Constants ─────────────────────────────────────────────────────────────────

const HEALTH_COLOR: Record<HealthStatus, { dot: string; bg: string; border: string; label: string }> = {
  healthy: { dot: "#10B981", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.2)", label: "Healthy" },
  warning: { dot: "#F59E0B", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", label: "Warning" },
  failed:  { dot: "#EF4444", bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.2)",  label: "Failed" },
};

const LOG_LEVEL_STYLE: Record<string, { bg: string; color: string }> = {
  info:  { bg: "rgba(0,174,239,0.1)",    color: "#00AEEF" },
  warn:  { bg: "rgba(245,158,11,0.12)",  color: "#F59E0B" },
  error: { bg: "rgba(239,68,68,0.12)",   color: "#EF4444" },
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  draft:     { bg: "rgba(148,163,184,0.1)", color: "#94A3B8" },
  scheduled: { bg: "rgba(0,174,239,0.1)",   color: "#00AEEF" },
  pending:   { bg: "rgba(245,158,11,0.1)",  color: "#F59E0B" },
  published: { bg: "rgba(16,185,129,0.1)",  color: "#10B981" },
  partial:   { bg: "rgba(245,158,11,0.1)",  color: "#F59E0B" },
  failed:    { bg: "rgba(239,68,68,0.1)",   color: "#EF4444" },
};

const PLATFORM_DISPLAY: Record<string, { label: string; icon: string; color: string }> = {
  facebook:       { label: "Facebook",        icon: "f",  color: "#6B9EFF" },
  instagram:      { label: "Instagram",       icon: "✦",  color: "#FF6B9D" },
  google_business:{ label: "Google Business", icon: "G",  color: "#EA4335" },
  tiktok:         { label: "TikTok",          icon: "♪",  color: "#69C9D0" },
  youtube:        { label: "YouTube",         icon: "▶",  color: "#FF0000" },
  telnyx:         { label: "Telnyx",          icon: "☎",  color: "#00A699" },
};

const LOG_TABS = [
  { id: "all",        label: "All" },
  { id: "publishing", label: "Publishing" },
  { id: "oauth",      label: "OAuth" },
  { id: "api",        label: "API" },
  { id: "ai",         label: "AI Engine" },
  { id: "telnyx",     label: "Telnyx" },
  { id: "system",     label: "System" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTs(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  } catch { return ts; }
}

function fmtDate(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return ts; }
}

function suggestFix(msg: string): string {
  const u = msg.toUpperCase();
  if (/QUOTA.*COOLDOWN|COOLDOWN.*ACTIVE|COOLDOWN ACTIVATED/.test(u)) return "Google quota exceeded. Publishing will use the cached GBP location automatically. Wait for the cooldown to expire, then click 'Refresh GBP Location' to re-fetch from the API.";
  if (/QUOTA|429/.test(u)) return "Google API quota exceeded — check System Diagnostics for cooldown status. Publishing continues using the cached location if available.";
  if (/UNAUTHENTICATED|401/.test(u)) return "Token is invalid — reconnect in Connected Accounts.";
  if (/403/.test(u)) return "Permission denied — check API scopes in Connected Accounts.";
  if (/404/.test(u)) return "Resource not found — click Refresh GBP Location to clear stale cache.";
  if (/INSTAGRAM|IG/.test(u) && /IMAGE|URL/.test(u)) return "Instagram requires a public image URL — select Facebook + Instagram together.";
  if (/NO.*PAGE/.test(u)) return "No Facebook Page found — connect a Page via the Facebook OAuth flow.";
  if (/NO.*ACCOUNT/.test(u)) return "No GBP account found — make sure the Google account has a Business Profile.";
  if (/NETWORK|FETCH|TIMEOUT/.test(u)) return "Network error — check connectivity and retry.";
  return "Check the Live Logs → Publishing tab for more detail.";
}

function minsLeft(ts: string): number {
  return Math.max(0, Math.ceil((new Date(ts).getTime() - Date.now()) / 60000));
}

function secsLeft(ts: string): number {
  return Math.max(0, Math.ceil((new Date(ts).getTime() - Date.now()) / 1000));
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SystemDiagnosticsPage() {
  const authFetch = useApiFetch();
  const qc = useQueryClient();

  const [logTab, setLogTab] = useState("all");
  const [logPaused, setLogPaused] = useState(false);
  const [newestLogId, setNewestLogId] = useState<string | null>(null);
  const [, setTick] = useState(0); // forces re-render for countdown display
  const logsRef = useRef<HTMLDivElement>(null);

  // Re-render every second so countdown timers stay live
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Health query (30s poll) ──
  const { data: health, isLoading: healthLoading, dataUpdatedAt } = useQuery<HealthData>({
    queryKey: ["diagnostics_health"],
    queryFn: () => authFetch<HealthData>("/diagnostics/health"),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // ── Logs query (5s poll) ──
  const { data: logsData } = useQuery<LogsData>({
    queryKey: ["diagnostics_logs", logTab],
    queryFn: () => authFetch<LogsData>(`/diagnostics/logs?tab=${logTab}&limit=150`),
    refetchInterval: logPaused ? false : 5_000,
    staleTime: 0,
  });

  // Track newest log id to show "new entries" badge
  useEffect(() => {
    if (logsData?.logs?.[0]?.id && logsData.logs[0].id !== newestLogId) {
      setNewestLogId(logsData.logs[0].id);
    }
  }, [logsData]);

  // ── Action mutations ──
  const retryFailed = useMutation({
    mutationFn: () => authFetch<{ ok: boolean; retried: number; message: string }>("/diagnostics/retry-failed", { method: "POST" }),
    onSuccess: (d) => { toast.success(d.message); qc.invalidateQueries({ queryKey: ["diagnostics_health"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Retry failed"),
  });

  const clearGBPCache = useMutation({
    mutationFn: () => authFetch<{ ok: boolean; message: string }>("/diagnostics/clear-gbp-cache", { method: "POST" }),
    onSuccess: (d) => { toast.success(d.message); qc.invalidateQueries({ queryKey: ["diagnostics_health"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Clear cache failed"),
  });

  const refreshGBPLoc = useMutation({
    mutationFn: () => authFetch<{ ok: boolean; locationTitle: string }>("/social-connections/google-business-refresh-location", { method: "POST" }),
    onSuccess: (d) => { toast.success(`GBP location refreshed: ${d.locationTitle}`); qc.invalidateQueries({ queryKey: ["diagnostics_health"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Refresh failed"),
  });

  const forceHealthCheck = useMutation({
    mutationFn: () => authFetch<{ ok: boolean }>("/diagnostics/force-health-check", { method: "POST" }),
    onSuccess: () => { toast.success("Health check triggered"); qc.invalidateQueries({ queryKey: ["diagnostics_health"] }); qc.invalidateQueries({ queryKey: ["diagnostics_logs"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Health check failed"),
  });

  const refreshTokens = useMutation({
    mutationFn: () => authFetch<{ ok: boolean }>("/social-connections/google-business-status"),
    onSuccess: () => { toast.success("Token check complete — see OAuth tab in Live Logs"); qc.invalidateQueries({ queryKey: ["diagnostics_health"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Token refresh failed"),
  });

  const anyMutPending = retryFailed.isPending || clearGBPCache.isPending || refreshGBPLoc.isPending || forceHealthCheck.isPending || refreshTokens.isPending;

  const SECTION_STYLE: React.CSSProperties = {
    background: "rgba(11,22,41,0.7)",
    border: "1px solid rgba(0,174,239,0.1)",
    borderRadius: 16,
    padding: "24px 28px",
    marginBottom: 24,
    backdropFilter: "blur(8px)",
  };

  const SECTION_TITLE: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "1.2px",
    textTransform: "uppercase",
    color: "#00AEEF",
    marginBottom: 18,
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  return (
    <AppShell>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: "#FFFFFF", margin: 0, letterSpacing: "-0.5px" }}>
              🛰 System Diagnostics
            </h1>
            <p style={{ fontSize: 13, color: "#475569", margin: "4px 0 0" }}>
              Real-time health monitoring, logs, and control actions
            </p>
          </div>
          {dataUpdatedAt > 0 && (
            <div style={{ fontSize: 11, color: "#334155", background: "rgba(0,174,239,0.05)", border: "1px solid rgba(0,174,239,0.1)", borderRadius: 8, padding: "4px 12px" }}>
              Last checked {fmtTs(new Date(dataUpdatedAt).toISOString())}
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 1: Integration Health Monitor ── */}
      <div style={SECTION_STYLE}>
        <div style={SECTION_TITLE}>
          <span>◉</span> Integration Health Monitor
          {healthLoading && <span style={{ fontSize: 10, color: "#475569", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>Loading…</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {(Object.entries(PLATFORM_DISPLAY) as [keyof typeof PLATFORM_DISPLAY, typeof PLATFORM_DISPLAY[string]][]).map(([key, meta]) => {
            const ph = health?.platforms[key as keyof typeof health.platforms] as PlatformHealth | undefined;
            const st = ph?.status ?? "failed";
            const hc = HEALTH_COLOR[st];
            return (
              <div key={key} style={{
                background: hc.bg, border: `1px solid ${hc.border}`,
                borderRadius: 12, padding: "14px 16px",
                display: "flex", alignItems: "flex-start", gap: 12,
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: `${meta.color}22`, border: `1px solid ${meta.color}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 900, color: meta.color,
                }}>
                  {meta.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{meta.label}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
                      background: hc.bg, color: hc.dot, border: `1px solid ${hc.border}`,
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: hc.dot, display: "inline-block" }} />
                      {hc.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.4 }}>
                    {ph?.detail ?? "Not connected"}
                  </div>
                  {key === "google_business" && ph?.locationTitle && (
                    <div style={{ fontSize: 10.5, color: "#4285F4", marginTop: 3 }}>📍 {ph.locationTitle}</div>
                  )}
                  {ph?.connectedAt && (
                    <div style={{ fontSize: 10, color: "#334155", marginTop: 4 }}>
                      Connected {fmtDate(ph.connectedAt)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SECTION 4: Quick Actions ── */}
      <div style={SECTION_STYLE}>
        <div style={SECTION_TITLE}><span>⚡</span> Quick Actions</div>

        {/* GBP quota cooldown banner */}
        {(() => {
          const gbp = health?.platforms.google_business;
          const quotaCd = gbp?.cooldownUntil;
          const refreshCd = gbp?.refreshCooldownUntil;
          const activeCd = quotaCd ?? refreshCd;
          if (!activeCd) return null;
          const isQuota = !!quotaCd;
          const secs = secsLeft(activeCd);
          const mins = Math.floor(secs / 60);
          const remainingSecs = secs % 60;
          const countdown = mins > 0
            ? `${mins}m ${String(remainingSecs).padStart(2, "0")}s`
            : `${secs}s`;
          return (
            <div style={{
              marginBottom: 14, padding: "10px 14px", borderRadius: 10,
              background: isQuota ? "rgba(239,68,68,0.07)" : "rgba(245,158,11,0.07)",
              border: `1px solid ${isQuota ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)"}`,
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            }}>
              <span style={{ fontSize: 16 }}>{isQuota ? "⛔" : "⏳"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: isQuota ? "#EF4444" : "#F59E0B", marginBottom: 2 }}>
                  {isQuota ? "Google Quota Cooldown Active" : "Refresh GBP Location — Cooldown Active"}
                </div>
                <div style={{ fontSize: 11, color: "#64748B" }}>
                  {isQuota
                    ? `Google API quota exceeded. Refresh GBP Location is disabled for ${countdown}. Publishing continues using the cached location.`
                    : `Refresh recently used. Button re-enables in ${countdown}. Publishing uses cached location.`}
                </div>
              </div>
              <div style={{
                fontSize: 20, fontWeight: 900, fontFamily: "monospace",
                color: isQuota ? "#EF4444" : "#F59E0B", minWidth: 70, textAlign: "right",
              }}>
                {countdown}
              </div>
            </div>
          );
        })()}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(() => {
            const gbp = health?.platforms.google_business;
            const gbpCooldownTs = gbp?.cooldownUntil ?? gbp?.refreshCooldownUntil ?? null;
            const gbpInCooldown = !!(gbpCooldownTs && secsLeft(gbpCooldownTs) > 0);
            const cachedAt = gbp?.cachedAt;

            const buttons = [
              {
                label: "Refresh Tokens",
                desc: "Re-check Google auth token",
                icon: "🔑",
                color: "#00AEEF",
                action: () => refreshTokens.mutate(),
                pending: refreshTokens.isPending,
                disabled: false,
              },
              {
                label: gbpInCooldown
                  ? `GBP Cooldown (${minsLeft(gbpCooldownTs!)}m)`
                  : "Refresh GBP Location",
                desc: gbpInCooldown
                  ? (gbp?.cooldownUntil ? "Quota cooldown — try again later" : "Recently used — 10 min cooldown")
                  : cachedAt
                    ? `Cached ${fmtDate(cachedAt)} — click to re-fetch`
                    : "Force-fetch GBP account + location",
                icon: gbpInCooldown ? "⏳" : "📍",
                color: gbpInCooldown ? "#64748B" : "#4285F4",
                action: () => refreshGBPLoc.mutate(),
                pending: refreshGBPLoc.isPending,
                disabled: gbpInCooldown,
              },
              {
                label: "Retry Failed Posts",
                desc: `Reset ${health?.postCounts.failed ?? 0} failed → scheduled`,
                icon: "🔄",
                color: "#10B981",
                action: () => retryFailed.mutate(),
                pending: retryFailed.isPending,
                disabled: false,
              },
              {
                label: "Force Health Check",
                desc: "Re-scan all connections",
                icon: "🩺",
                color: "#F59E0B",
                action: () => forceHealthCheck.mutate(),
                pending: forceHealthCheck.isPending,
                disabled: false,
              },
              {
                label: "Clear GBP Cache",
                desc: "Wipe cached location — next publish re-fetches",
                icon: "🗑",
                color: "#EF4444",
                action: () => clearGBPCache.mutate(),
                pending: clearGBPCache.isPending,
                disabled: false,
              },
            ];

            return buttons.map(btn => (
              <button
                key={btn.label}
                onClick={btn.disabled ? undefined : btn.action}
                disabled={btn.pending || anyMutPending || btn.disabled}
                style={{
                  flex: "1 1 180px", maxWidth: 220,
                  padding: "12px 16px", borderRadius: 12, textAlign: "left",
                  background: `${btn.color}11`, border: `1px solid ${btn.color}33`,
                  cursor: (btn.pending || anyMutPending || btn.disabled) ? "not-allowed" : "pointer",
                  opacity: (btn.pending || anyMutPending || btn.disabled) ? 0.55 : 1,
                  transition: "all 0.18s",
                }}
              >
                <div style={{ fontSize: 18, marginBottom: 5 }}>{btn.icon}</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: btn.color, marginBottom: 3 }}>
                  {btn.pending ? "Working…" : btn.label}
                </div>
                <div style={{ fontSize: 10.5, color: "#475569", lineHeight: 1.3 }}>{btn.desc}</div>
              </button>
            ));
          })()}
        </div>

        {/* GBP cache age row */}
        {health?.platforms.google_business?.cachedAt && (
          <div style={{ marginTop: 12, fontSize: 10.5, color: "#334155", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#10B981" }}>●</span>
            GBP location cached {fmtDate(health.platforms.google_business.cachedAt)}
            {health.platforms.google_business.locationTitle && (
              <span style={{ color: "#4285F4" }}>— {health.platforms.google_business.locationTitle}</span>
            )}
            · Publishing uses cache automatically
          </div>
        )}
      </div>

      {/* ── SECTION 2: Error Center ── */}
      <div style={SECTION_STYLE}>
        <div style={SECTION_TITLE}>
          <span>⚠</span> Error Center
          {health?.recentErrors.length ? (
            <span style={{ fontSize: 10.5, color: "#EF4444", fontWeight: 700, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 20, padding: "1px 8px" }}>
              {health.recentErrors.length} error{health.recentErrors.length !== 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
        {!health?.recentErrors.length ? (
          <div style={{ color: "#10B981", fontSize: 13, fontWeight: 600, padding: "8px 0" }}>
            ✓ No recent errors — all posts published cleanly.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {health.recentErrors.map(err => (
              <div key={err.id} style={{
                background: err.severity === "error" ? "rgba(239,68,68,0.05)" : "rgba(245,158,11,0.05)",
                border: `1px solid ${err.severity === "error" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)"}`,
                borderRadius: 10, padding: "12px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{
                    fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 20, flexShrink: 0, marginTop: 2,
                    background: err.severity === "error" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                    color: err.severity === "error" ? "#EF4444" : "#F59E0B",
                    border: `1px solid ${err.severity === "error" ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"}`,
                    textTransform: "uppercase", letterSpacing: "0.5px",
                  }}>
                    {err.status}
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8" }}>{fmtDate(err.ts)}</span>
                      <span style={{ fontSize: 11, color: "#475569" }}>·</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#C0C0C0" }}>{err.platform || "—"}</span>
                      {err.caption && <span style={{ fontSize: 10.5, color: "#334155", fontStyle: "italic" }}>"{err.caption}…"</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.5, marginBottom: 6, fontFamily: "monospace" }}>
                      {err.message.slice(0, 240)}
                    </div>
                    <div style={{ fontSize: 11, color: "#60A5FA", lineHeight: 1.4 }}>
                      💡 {suggestFix(err.message)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SECTION 3: Live Logs ── */}
      <div style={SECTION_STYLE}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={SECTION_TITLE as any}><span>📡</span> Live Logs</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10.5, color: "#334155" }}>
              {logsData?.total ?? 0} entries
            </span>
            <button
              onClick={() => setLogPaused(p => !p)}
              style={{
                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 8, cursor: "pointer",
                background: logPaused ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
                border: logPaused ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(16,185,129,0.3)",
                color: logPaused ? "#EF4444" : "#10B981",
              }}
            >
              {logPaused ? "▶ Resume" : "⏸ Pause"}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
          {LOG_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setLogTab(tab.id)}
              style={{
                fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 8, cursor: "pointer",
                background: logTab === tab.id ? "rgba(0,174,239,0.15)" : "transparent",
                border: logTab === tab.id ? "1px solid rgba(0,174,239,0.35)" : "1px solid rgba(255,255,255,0.06)",
                color: logTab === tab.id ? "#00AEEF" : "#475569",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Log list */}
        <div
          ref={logsRef}
          style={{
            height: 320, overflowY: "auto", borderRadius: 10,
            background: "#030612", border: "1px solid rgba(0,174,239,0.08)",
            fontFamily: "'Courier New', monospace", fontSize: 11, lineHeight: 1.6,
          }}
        >
          {!logsData?.logs.length ? (
            <div style={{ padding: "24px 16px", color: "#334155", textAlign: "center", fontSize: 12 }}>
              {logPaused ? "⏸ Paused — no entries" : "⏳ Waiting for log entries… (updates every 5s)"}
            </div>
          ) : (
            logsData.logs.map((entry, i) => {
              const ls = LOG_LEVEL_STYLE[entry.level] ?? LOG_LEVEL_STYLE.info;
              return (
                <div key={entry.id} style={{
                  display: "flex", gap: 8, padding: "4px 12px", alignItems: "flex-start",
                  borderBottom: "1px solid rgba(255,255,255,0.025)",
                  background: i === 0 ? "rgba(0,174,239,0.03)" : "transparent",
                }}>
                  <span style={{ color: "#334155", flexShrink: 0, fontSize: 10.5, paddingTop: 1 }}>{fmtTs(entry.ts)}</span>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, padding: "2px 6px", borderRadius: 5, flexShrink: 0, marginTop: 1,
                    background: ls.bg, color: ls.color, textTransform: "uppercase", letterSpacing: "0.4px",
                  }}>{entry.level}</span>
                  <span style={{
                    fontSize: 9.5, fontWeight: 600, padding: "2px 6px", borderRadius: 5, flexShrink: 0, marginTop: 1,
                    background: "rgba(255,255,255,0.04)", color: "#475569",
                  }}>{entry.tag}</span>
                  <span style={{ color: "#94A3B8", flex: 1, wordBreak: "break-all" }}>{entry.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── SECTION 5: Publishing Queue ── */}
      <div style={SECTION_STYLE}>
        <div style={SECTION_TITLE}><span>📋</span> Publishing Queue</div>

        {/* Status summary pills */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          {health ? (
            (["draft", "scheduled", "pending", "published", "partial", "failed"] as const).map(s => {
              const count = health.postCounts[s] ?? 0;
              const ss = STATUS_STYLE[s];
              return (
                <div key={s} style={{
                  display: "flex", alignItems: "center", gap: 7,
                  background: ss.bg, border: `1px solid ${ss.color}33`,
                  borderRadius: 20, padding: "5px 14px",
                }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: ss.color }}>{count}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: ss.color, textTransform: "capitalize" }}>{s}</span>
                </div>
              );
            })
          ) : (
            <div style={{ color: "#334155", fontSize: 12 }}>Loading…</div>
          )}
        </div>

        {/* Recent posts table */}
        {health?.recentPosts.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Status", "Platforms", "Caption", "Scheduled / Published", "Error"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#475569", fontWeight: 700, fontSize: 10.5, letterSpacing: "0.5px", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {health.recentPosts.slice(0, 20).map(p => {
                  const ss = STATUS_STYLE[p.status] ?? STATUS_STYLE.draft;
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                      <td style={{ padding: "6px 10px" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                          background: ss.bg, color: ss.color, textTransform: "capitalize",
                        }}>{p.status}</span>
                      </td>
                      <td style={{ padding: "6px 10px", color: "#6B7280" }}>
                        {p.platforms.map(pl => PLATFORM_DISPLAY[pl]?.icon ?? pl).join(" ")}
                      </td>
                      <td style={{ padding: "6px 10px", color: "#94A3B8", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.caption || "—"}
                      </td>
                      <td style={{ padding: "6px 10px", color: "#475569", whiteSpace: "nowrap" }}>
                        {p.publishedAt ? fmtDate(p.publishedAt) : p.scheduledAt ? fmtDate(p.scheduledAt) : "—"}
                      </td>
                      <td style={{ padding: "6px 10px", color: "#EF4444", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.errorMessage ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ color: "#334155", fontSize: 12, padding: "8px 0" }}>No posts yet.</div>
        )}
      </div>

      {/* ── SECTION 6: AI Engine Status ── */}
      <div style={SECTION_STYLE}>
        <div style={SECTION_TITLE}><span>🤖</span> AI Engine Status</div>
        {health?.aiEngine ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {[
              {
                label: "Engine",
                value: health.aiEngine.active ? "Active" : "Not Configured",
                sub: health.aiEngine.clientName ?? "—",
                color: health.aiEngine.active ? "#10B981" : "#475569",
              },
              {
                label: "Schedule",
                value: health.aiEngine.frequency?.replace(/_/g, " ") ?? "—",
                sub: `${health.aiEngine.platforms.join(", ") || "no platforms"}`,
                color: "#00AEEF",
              },
              {
                label: "Queue Size",
                value: String(health.aiEngine.scheduledCount),
                sub: `${health.aiEngine.totalPosts} total posts`,
                color: "#F59E0B",
              },
              {
                label: "Next Scheduled",
                value: health.aiEngine.nextScheduledPost ? fmtDate(health.aiEngine.nextScheduledPost) : "None",
                sub: "upcoming post",
                color: "#C0C0C0",
              },
              {
                label: "Last Config Update",
                value: health.aiEngine.lastUpdated ? fmtDate(health.aiEngine.lastUpdated) : "Never",
                sub: "engine settings",
                color: "#475569",
              },
            ].map(card => (
              <div key={card.label} style={{
                background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12, padding: "14px 16px",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: card.color, marginBottom: 3 }}>{card.value}</div>
                <div style={{ fontSize: 10.5, color: "#334155" }}>{card.sub}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "#334155", fontSize: 12 }}>Loading…</div>
        )}
      </div>
    </AppShell>
  );
}
