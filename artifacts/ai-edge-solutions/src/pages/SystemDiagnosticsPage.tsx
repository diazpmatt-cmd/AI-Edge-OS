import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { AppShell } from "@/components/app-shell";
import { useTheme } from "@/contexts/theme-context";
import { useApiFetch } from "@/lib/api";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type HealthStatus = "healthy" | "warning" | "failed";

type PlatformHealth = {
  status: HealthStatus;
  detail: string;
  connectedAt: string | null;
  locationTitle?: string | null;
  locationId?: string | null;
  accountId?: string | null;
  address?: string | null;
  cachedAt?: string | null;
  cooldownUntil?: string | null;
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
    active: boolean; clientName: string | null; industry: string | null;
    frequency: string | null; platforms: string[]; toneStyle: string[]; postAngles: string[];
    autoGenerateEnabled: boolean; enginePaused: boolean;
    scheduledCount: number; draftCount: number;
    nextScheduledPost: string | null; totalPosts: number;
    lastGeneratedAt: string | null; lastUpdated: string | null;
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

type BkStatus = "healthy" | "warning" | "never";
type BkTypeStatus = { status: BkStatus; lastBackupAt: string | null; sizeBytes: number; filename: string | null };
type BkStatusData = { status: Record<string, BkTypeStatus>; history: BkHistoryItem[] };
type BkHistoryItem = { filename: string; type: string; sizeBytes: number; createdAt: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const HEALTH_COLOR: Record<HealthStatus, { dot: string; bg: string; border: string; label: string }> = {
  healthy: { dot: "#22C55E", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.2)", label: "Healthy" },
  warning: { dot: "#F59E0B", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", label: "Warning" },
  failed:  { dot: "#EF4444", bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.2)",  label: "Failed" },
};

const LOG_LEVEL_STYLE: Record<string, { bg: string; color: string }> = {
  info:  { bg: "rgba(59,130,246,0.1)",   color: "#3B82F6" },
  warn:  { bg: "rgba(245,158,11,0.12)",  color: "#F59E0B" },
  error: { bg: "rgba(239,68,68,0.12)",   color: "#EF4444" },
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  draft:     { bg: "rgba(196,181,253,0.1)", color: "#C4B5FD" },
  scheduled: { bg: "rgba(245,158,11,0.1)",  color: "#F59E0B" },
  pending:   { bg: "rgba(245,158,11,0.1)",  color: "#F59E0B" },
  published: { bg: "rgba(34,197,94,0.1)",  color: "#22C55E" },
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
  const { colors: t } = useTheme();
  const authFetch = useApiFetch();
  const { getToken } = useAuth();
  const qc = useQueryClient();

  const [logTab, setLogTab] = useState("all");
  const [logPaused, setLogPaused] = useState(false);
  const [newestLogId, setNewestLogId] = useState<string | null>(null);
  const [, setTick] = useState(0); // forces re-render for countdown display
  const logsRef = useRef<HTMLDivElement>(null);
  const [bkRunning, setBkRunning] = useState<Record<string, boolean>>({});

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

  // "Use Cached Location" — reads cache from DB without any Google API call
  const useCachedLocation = useMutation({
    mutationFn: () => authFetch<{ hasCache: boolean; locationTitle: string | null; locationId: string | null; accountId: string | null; cachedAt: string | null }>("/social-connections/google-business-cache"),
    onSuccess: (d) => {
      if (!d.hasCache) { toast.warning("No cached GBP location yet — click Refresh Location when cooldown expires."); return; }
      toast.success(`Using cached GBP location: ${d.locationTitle ?? "unknown"} (ID: ${d.locationId ?? "?"})`);
      qc.invalidateQueries({ queryKey: ["diagnostics_health"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Cache read failed"),
  });

  type AiAnalytics = {
    averageContentScore: number | null;
    duplicateRiskCount: { high: number; medium: number; low: number };
    queueQuality: "excellent" | "good" | "fair" | "poor" | "empty";
    totalPostsInQueue: number;
    bestNextPost: { city: string | null; topic: string | null; angle: string | null; score: number; bestPlatform: string | null } | null;
  };
  const { data: aiAnalytics } = useQuery<AiAnalytics>({
    queryKey: ["ai-analytics-diag"],
    queryFn: () => authFetch<AiAnalytics>("/auto-content/analytics"),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  type ImageStats = {
    total: number; tagged: number; untagged: number; coverageScore: number;
    topicCounts: Record<string, number>; suggestions: string[];
  };
  const { data: imageStats } = useQuery<ImageStats>({
    queryKey: ["image-assets-stats-diag"],
    queryFn: () => authFetch<ImageStats>("/image-assets/stats"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  type ContentInsights = {
    hasRealData: boolean;
    avgEngagementScore: number | null;
    topTopic: string | null;
    topCity: string | null;
    topAngle: string | null;
    topPlatform: string | null;
    bestPostingTime: string | null;
    totalPosts: number;
    postsWithPerf: number;
    insights: string[];
  };
  const { data: contentInsights } = useQuery<ContentInsights>({
    queryKey: ["content-insights-diag"],
    queryFn: () => authFetch<ContentInsights>("/auto-content/insights"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  type TextbackStats = {
    sent: number; failed: number; missedCalls: number;
    quoteRequests: number; appointmentRequests: number; emergencyRequests: number;
    totalReplies: number; responseRate: number;
  };
  const { data: textbackStats, refetch: refetchTextback } = useQuery<TextbackStats>({
    queryKey: ["textback-stats-diag"],
    queryFn: () => authFetch<TextbackStats>("/telnyx/textback-stats"),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const regenQueueMut = useMutation({
    mutationFn: () => authFetch<{ ok: boolean; created: number }>("/auto-content/generate", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: (d) => { toast.success(`Queue regenerated: ${d.created} posts created`); qc.invalidateQueries({ queryKey: ["diagnostics_health"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Regen failed"),
  });

  const clearQueueDiag = useMutation({
    mutationFn: () => authFetch<{ ok: boolean }>("/auto-content/queue", { method: "DELETE" }),
    onSuccess: () => { toast.success("AI queue cleared."); qc.invalidateQueries({ queryKey: ["diagnostics_health"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Clear failed"),
  });

  const forceGenerateMut = useMutation({
    mutationFn: () => authFetch<{ ok: boolean; created: number }>("/auto-content/generate", { method: "POST", body: JSON.stringify({ count: 5 }) }),
    onSuccess: (d) => { toast.success(`Generated ${d.created} posts now`); qc.invalidateQueries({ queryKey: ["diagnostics_health"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Generate failed"),
  });

  const testVoiceCall = useMutation({
    mutationFn: (selection: string) => authFetch<{ ok: boolean; call: any; followUp: any }>("/telnyx/test-voice-call", { method: "POST", body: JSON.stringify({ phone: "+15550000003", selection }) }),
    onSuccess: (_, sel) => {
      const labels: Record<string, string> = { "1": "live transfer", "2": "callback request", "3": "voicemail" };
      toast.success(`Voice call simulated → option ${sel} (${labels[sel] ?? sel})`);
      qc.invalidateQueries({ queryKey: ["diagnostics_logs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Voice test failed"),
  });

  const testCallbackReq = useMutation({
    mutationFn: () => authFetch<{ ok: boolean }>("/telnyx/test-callback-request", { method: "POST", body: JSON.stringify({ phone: "+15550000004" }) }),
    onSuccess: () => { toast.success("Callback request lead logged"); qc.invalidateQueries({ queryKey: ["diagnostics_logs"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Callback test failed"),
  });

  const testVoicemail = useMutation({
    mutationFn: () => authFetch<{ ok: boolean }>("/telnyx/test-voicemail", { method: "POST", body: JSON.stringify({ phone: "+15550000005" }) }),
    onSuccess: () => { toast.success("Voicemail lead logged"); qc.invalidateQueries({ queryKey: ["diagnostics_logs"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Voicemail test failed"),
  });

  const testTextback = useMutation({
    mutationFn: (skipDedup: boolean) => authFetch<{ ok: boolean; sent: boolean; skipped?: boolean; reason?: string; messageId?: string; error?: string }>(
      "/telnyx/test-textback", { method: "POST", body: JSON.stringify({ phone: "+15550000006", skipDedup }) }
    ),
    onSuccess: (d) => {
      if (d.skipped) { toast.info(`Dedup active — ${d.reason}`); return; }
      if (d.sent) { toast.success(`Text-back sent${d.messageId ? ` — ID: ${d.messageId}` : " (no API key — DB logged only)"}`); }
      else { toast.warning(`Text-back failed: ${d.error}`); }
      refetchTextback();
      qc.invalidateQueries({ queryKey: ["diagnostics_logs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Text-back test failed"),
  });

  const testTextbackReply = useMutation({
    mutationFn: (reply: string) => authFetch<{ ok: boolean; parsed: string }>(
      "/telnyx/test-textback-reply", { method: "POST", body: JSON.stringify({ phone: "+15550000007", reply }) }
    ),
    onSuccess: (d) => { toast.success(`Reply logged: ${d.parsed}`); refetchTextback(); qc.invalidateQueries({ queryKey: ["diagnostics_logs"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Reply test failed"),
  });

  // ── Backup Center queries & mutations ──
  const { data: bkData, refetch: refetchBk } = useQuery<BkStatusData>({
    queryKey: ["backup_center_status"],
    queryFn: () => authFetch<BkStatusData>("/backups/status"),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const runBackup = async (type: "code" | "database" | "assets" | "full") => {
    setBkRunning(p => ({ ...p, [type]: true }));
    const labels: Record<string, string> = { code: "Code", database: "Database", assets: "Assets", full: "Full System" };
    const tid = toast.loading(`Running ${labels[type]} backup…`);
    try {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${BASE}/api/backups/${type}`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Backup failed");
      toast.success(`${labels[type]} backup complete — ${json.filename ?? ""}`, { id: tid });
      refetchBk();
    } catch (e: any) {
      toast.error(e?.message ?? "Backup failed", { id: tid });
    } finally {
      setBkRunning(p => ({ ...p, [type]: false }));
    }
  };

  const downloadBkFile = async (filename: string) => {
    try {
      const token = await getToken().catch(() => null);
      const res = await fetch(`${BASE}/api/backups/download/${encodeURIComponent(filename)}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) { toast.error("Download failed"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch { toast.error("Download failed"); }
  };

  const deleteBkFile = async (filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      const token = await getToken().catch(() => null);
      await fetch(`${BASE}/api/backups/${encodeURIComponent(filename)}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      toast.success("Backup deleted");
      refetchBk();
    } catch { toast.error("Delete failed"); }
  };

  const anyMutPending = retryFailed.isPending || clearGBPCache.isPending || refreshGBPLoc.isPending || forceHealthCheck.isPending || refreshTokens.isPending || useCachedLocation.isPending || regenQueueMut.isPending || clearQueueDiag.isPending || forceGenerateMut.isPending;

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
            <h1 style={{ fontSize: 26, fontWeight: 900, color: t.text, margin: 0, letterSpacing: "-0.5px" }}>
              🛰 System Diagnostics
            </h1>
            <p style={{ fontSize: 13, color: t.text2, margin: "4px 0 0" }}>
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
                  {key === "google_business" && (() => {
                    const gbp = ph as PlatformHealth | undefined;
                    const cd = gbp?.cooldownUntil;
                    const inCooldown = !!(cd && secsLeft(cd) > 0);
                    return (
                      <>
                        {gbp?.locationTitle && (
                          <div style={{ marginTop: 5, padding: "5px 8px", borderRadius: 7, background: "rgba(66,133,244,0.08)", border: "1px solid rgba(66,133,244,0.15)" }}>
                            <div style={{ fontSize: 10, color: "#6B9EFF", fontWeight: 700, marginBottom: 1, textTransform: "uppercase", letterSpacing: "0.04em" }}>Cached Location</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>{gbp.locationTitle}</div>
                            {gbp.address && <div style={{ fontSize: 10, color: "#64748B", marginTop: 1 }}>{gbp.address}</div>}
                            <div style={{ fontSize: 10, color: "#475569", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {gbp.cachedAt && <span>Cached {fmtDate(gbp.cachedAt)}</span>}
                              {gbp.locationId && <span style={{ color: "#334155" }}>ID: {gbp.locationId}</span>}
                            </div>
                          </div>
                        )}
                        {inCooldown && (
                          <div style={{ marginTop: 4, fontSize: 10.5, color: "#EF4444", display: "flex", alignItems: "center", gap: 5 }}>
                            <span>⛔</span>
                            <span>Cooldown: {(() => { const s = secsLeft(cd!); return `${Math.floor(s/60)}m ${String(s%60).padStart(2,"0")}s`; })()}</span>
                          </div>
                        )}
                        {gbp?.locationTitle && !inCooldown && (
                          <div style={{ marginTop: 3, fontSize: 10, color: "#22C55E" }}>✓ Publishing uses cache — no API calls</div>
                        )}
                      </>
                    );
                  })()}
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

        {/* GBP cache status card */}
        {(() => {
          const gbp = health?.platforms.google_business;
          if (!gbp) return null;
          const cd = gbp.cooldownUntil;
          const inCooldown = !!(cd && secsLeft(cd) > 0);
          const hasCache = !!(gbp.locationTitle || gbp.locationId);

          const secs = cd ? secsLeft(cd) : 0;
          const mins = Math.floor(secs / 60);
          const remSecs = secs % 60;
          const countdown = mins > 0 ? `${mins}m ${String(remSecs).padStart(2, "0")}s` : `${secs}s`;

          return (
            <div style={{
              marginBottom: 16, borderRadius: 12,
              border: `1px solid ${inCooldown ? "rgba(239,68,68,0.25)" : "rgba(66,133,244,0.2)"}`,
              background: inCooldown ? "rgba(239,68,68,0.05)" : "rgba(66,133,244,0.05)",
              overflow: "hidden",
            }}>
              {/* Top bar */}
              <div style={{
                padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
                borderBottom: `1px solid ${inCooldown ? "rgba(239,68,68,0.12)" : "rgba(66,133,244,0.12)"}`,
              }}>
                <span style={{ fontSize: 15 }}>📍</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: inCooldown ? "#EF4444" : "#4285F4" }}>
                    {inCooldown ? "⛔ GBP Quota Cooldown Active" : "Google Business Profile Cache"}
                  </span>
                  {inCooldown && (
                    <span style={{ marginLeft: 10, fontSize: 11, color: "#64748B" }}>
                      Refresh Location disabled · publishing uses cache below
                    </span>
                  )}
                </div>
                {inCooldown && (
                  <span style={{ fontSize: 18, fontWeight: 900, fontFamily: "monospace", color: "#EF4444", minWidth: 64, textAlign: "right" }}>
                    {countdown}
                  </span>
                )}
              </div>

              {/* Cache details */}
              <div style={{ padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: "8px 20px" }}>
                {hasCache ? (
                  <>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>
                      <span style={{ color: "#64748B", marginRight: 4 }}>Location</span>
                      <span style={{ color: "#E2E8F0", fontWeight: 600 }}>{gbp.locationTitle ?? "—"}</span>
                      {gbp.locationId && <span style={{ color: "#475569" }}> (ID: {gbp.locationId})</span>}
                    </div>
                    {gbp.accountId && (
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>
                        <span style={{ color: "#64748B", marginRight: 4 }}>Account ID</span>
                        <span style={{ color: "#E2E8F0" }}>{gbp.accountId}</span>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>
                      <span style={{ color: "#64748B", marginRight: 4 }}>Cached</span>
                      <span style={{ color: "#22C55E" }}>{gbp.cachedAt ? fmtDate(gbp.cachedAt) : "unknown"}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#22C55E" }}>✓ Publishing uses this cache — no API calls needed</div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: "#F59E0B" }}>
                    ⚠ No cached location yet. Click "Refresh GBP Location" to fetch from Google.
                  </div>
                )}
              </div>

              {/* Action row */}
              <div style={{ padding: "8px 14px 10px", display: "flex", gap: 8, borderTop: `1px solid rgba(255,255,255,0.04)` }}>
                <button
                  onClick={() => useCachedLocation.mutate()}
                  disabled={!hasCache || anyMutPending || useCachedLocation.isPending}
                  style={{
                    padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                    background: hasCache ? "rgba(34,197,94,0.12)" : "rgba(100,116,139,0.1)",
                    border: `1px solid ${hasCache ? "rgba(34,197,94,0.3)" : "rgba(100,116,139,0.2)"}`,
                    color: hasCache ? "#22C55E" : "#475569",
                    cursor: hasCache && !anyMutPending ? "pointer" : "not-allowed",
                    opacity: (!hasCache || anyMutPending) ? 0.55 : 1,
                  }}
                >
                  {useCachedLocation.isPending ? "Checking…" : "✓ Use Cached Location"}
                </button>
                <button
                  onClick={() => { if (!inCooldown) refreshGBPLoc.mutate(); }}
                  disabled={inCooldown || anyMutPending || refreshGBPLoc.isPending}
                  title={inCooldown ? `Cooldown active — ${countdown} remaining` : "Fetch latest GBP account + location from Google"}
                  style={{
                    padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                    background: inCooldown ? "rgba(100,116,139,0.08)" : "rgba(66,133,244,0.1)",
                    border: `1px solid ${inCooldown ? "rgba(100,116,139,0.15)" : "rgba(66,133,244,0.3)"}`,
                    color: inCooldown ? "#475569" : "#4285F4",
                    cursor: (inCooldown || anyMutPending) ? "not-allowed" : "pointer",
                    opacity: (inCooldown || anyMutPending) ? 0.55 : 1,
                  }}
                >
                  {refreshGBPLoc.isPending ? "Fetching…" : inCooldown ? `⏳ Refresh Location (${minsLeft(cd!)}m)` : "↻ Refresh Location"}
                </button>
              </div>
            </div>
          );
        })()}

        {/* Other action buttons */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            {
              label: "Refresh Tokens",
              desc: "Re-check Google auth token",
              icon: "🔑",
              color: "#00AEEF",
              action: () => refreshTokens.mutate(),
              pending: refreshTokens.isPending,
            },
            {
              label: "Retry Failed Posts",
              desc: `Reset ${health?.postCounts.failed ?? 0} failed → scheduled`,
              icon: "🔄",
              color: "#22C55E",
              action: () => retryFailed.mutate(),
              pending: retryFailed.isPending,
            },
            {
              label: "Force Health Check",
              desc: "Re-scan all connections",
              icon: "🩺",
              color: "#F59E0B",
              action: () => forceHealthCheck.mutate(),
              pending: forceHealthCheck.isPending,
            },
            {
              label: "Clear GBP Cache",
              desc: "Wipe cached location — next publish re-fetches",
              icon: "🗑",
              color: "#EF4444",
              action: () => clearGBPCache.mutate(),
              pending: clearGBPCache.isPending,
            },
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.action}
              disabled={btn.pending || anyMutPending}
              style={{
                flex: "1 1 160px", maxWidth: 210,
                padding: "12px 16px", borderRadius: 12, textAlign: "left",
                background: `${btn.color}11`, border: `1px solid ${btn.color}33`,
                cursor: (btn.pending || anyMutPending) ? "not-allowed" : "pointer",
                opacity: (btn.pending || anyMutPending) ? 0.55 : 1,
                transition: "all 0.18s",
              }}
            >
              <div style={{ fontSize: 18, marginBottom: 5 }}>{btn.icon}</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: btn.color, marginBottom: 3 }}>
                {btn.pending ? "Working…" : btn.label}
              </div>
              <div style={{ fontSize: 10.5, color: "#475569", lineHeight: 1.3 }}>{btn.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── SECTION: Voice Receptionist V1 ── */}
      <div style={SECTION_STYLE}>
        <div style={SECTION_TITLE}><span>☎</span> Voice Receptionist V1 — Simulator</div>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 16, lineHeight: 1.6 }}>
          Simulate inbound calls to test the IVR menu flow and lead logging. All events appear in the Telnyx log tab below.
          <br />
          <span style={{ color: "#00AEEF", fontWeight: 600 }}>
            Webhook URL for Telnyx portal: <code style={{ background: "rgba(0,174,239,0.08)", padding: "1px 6px", borderRadius: 4 }}>POST /api/telnyx/voice</code>
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Simulate Call → Press 1", desc: "Live transfer to business number", icon: "📞", sel: "1", color: "#22C55E" },
            { label: "Simulate Call → Press 2", desc: "Callback request lead logged", icon: "📋", sel: "2", color: "#00AEEF" },
            { label: "Simulate Call → Press 3", desc: "Voicemail recorded + lead logged", icon: "🎙", sel: "3", color: "#3B82F6" },
          ].map(btn => (
            <button
              key={btn.sel}
              onClick={() => testVoiceCall.mutate(btn.sel)}
              disabled={testVoiceCall.isPending}
              style={{
                flex: "1 1 200px", maxWidth: 240, padding: "12px 16px",
                borderRadius: 12, textAlign: "left", cursor: testVoiceCall.isPending ? "not-allowed" : "pointer",
                background: `${btn.color}11`, border: `1px solid ${btn.color}33`,
                opacity: testVoiceCall.isPending ? 0.55 : 1, transition: "all 0.18s",
              }}
            >
              <div style={{ fontSize: 18, marginBottom: 5 }}>{btn.icon}</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: btn.color, marginBottom: 3 }}>
                {testVoiceCall.isPending ? "Simulating…" : btn.label}
              </div>
              <div style={{ fontSize: 10.5, color: "#475569", lineHeight: 1.3 }}>{btn.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {[
            { label: "Fire Test: Callback Request", icon: "📋", color: "#00AEEF", action: () => testCallbackReq.mutate(), pending: testCallbackReq.isPending },
            { label: "Fire Test: Voicemail Lead", icon: "🎙", color: "#3B82F6", action: () => testVoicemail.mutate(), pending: testVoicemail.isPending },
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.action}
              disabled={btn.pending}
              style={{
                flex: "1 1 180px", maxWidth: 220, padding: "10px 14px",
                borderRadius: 10, textAlign: "left", cursor: btn.pending ? "not-allowed" : "pointer",
                background: `${btn.color}0D`, border: `1px solid ${btn.color}22`,
                opacity: btn.pending ? 0.55 : 1, transition: "all 0.18s",
              }}
            >
              <span style={{ fontSize: 14 }}>{btn.icon}</span>
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: btn.color }}>
                {btn.pending ? "Logging…" : btn.label}
              </span>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "rgba(0,174,239,0.04)", border: "1px solid rgba(0,174,239,0.1)" }}>
          <div style={{ fontSize: 10.5, color: "#475569", lineHeight: 1.7 }}>
            <strong style={{ color: "#94A3B8" }}>IVR Flow:</strong> Caller dials (251) 286-3200 →
            Greeting plays → Press 1: forward to (254) 324-9090 · Press 2: callback lead logged · Press 3: voicemail recorded
            <br />
            <strong style={{ color: "#94A3B8" }}>Event types saved to DB:</strong>{" "}
            <code style={{ color: "#00AEEF" }}>telnyx_voice_call</code> ·{" "}
            <code style={{ color: "#00AEEF" }}>telnyx_callback_request</code> ·{" "}
            <code style={{ color: "#00AEEF" }}>telnyx_voicemail</code>
          </div>
        </div>
      </div>

      {/* ── SECTION: Missed Call Recovery ── */}
      <div style={SECTION_STYLE}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <div style={SECTION_TITLE as any}><span>📲</span> Missed Call Recovery — Text-Back V1</div>
          <button onClick={() => refetchTextback()} style={{ fontSize: 10.5, padding: "3px 10px", borderRadius: 7, cursor: "pointer", background: "rgba(0,174,239,0.07)", border: "1px solid rgba(0,174,239,0.2)", color: "#00AEEF", fontWeight: 700 }}>↻ Refresh</button>
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Missed Calls",    value: textbackStats?.missedCalls    ?? "—", color: "#F59E0B", icon: "📵" },
            { label: "Text-Backs Sent", value: textbackStats?.sent           ?? "—", color: "#22C55E", icon: "📤" },
            { label: "Failed Sends",    value: textbackStats?.failed         ?? "—", color: "#EF4444", icon: "❌" },
            { label: "Response Rate",   value: textbackStats ? `${textbackStats.responseRate}%` : "—", color: "#00AEEF", icon: "📊" },
            { label: "Quote Requests",  value: textbackStats?.quoteRequests  ?? "—", color: "#3B82F6", icon: "💲" },
            { label: "Appointments",    value: textbackStats?.appointmentRequests ?? "—", color: "#06B6D4", icon: "📅" },
            { label: "Emergencies",     value: textbackStats?.emergencyRequests   ?? "—", color: "#EF4444", icon: "🚨" },
            { label: "Total Replies",   value: textbackStats?.totalReplies   ?? "—", color: "#C0C0C0", icon: "💬" },
          ].map(s => (
            <div key={s.label} style={{ background: `${s.color}0D`, border: `1px solid ${s.color}22`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Test buttons */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>Simulate Text-Back</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              onClick={() => testTextback.mutate(false)}
              disabled={testTextback.isPending}
              style={{ padding: "9px 14px", borderRadius: 9, cursor: testTextback.isPending ? "not-allowed" : "pointer", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", opacity: testTextback.isPending ? 0.55 : 1, transition: "all 0.18s" }}
            >
              <span style={{ fontSize: 13 }}>📤</span>
              <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: "#22C55E" }}>{testTextback.isPending ? "Sending…" : "Send Text-Back (with dedup)"}</span>
            </button>
            <button
              onClick={() => testTextback.mutate(true)}
              disabled={testTextback.isPending}
              style={{ padding: "9px 14px", borderRadius: 9, cursor: testTextback.isPending ? "not-allowed" : "pointer", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", opacity: testTextback.isPending ? 0.55 : 1, transition: "all 0.18s" }}
            >
              <span style={{ fontSize: 13 }}>⚡</span>
              <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: "#F59E0B" }}>{testTextback.isPending ? "Sending…" : "Force Send (skip dedup)"}</span>
            </button>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>Simulate Customer Reply</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              { reply: "1", label: "Reply: 1 (Quote)",       color: "#3B82F6", icon: "💲" },
              { reply: "2", label: "Reply: 2 (Appointment)", color: "#06B6D4", icon: "📅" },
              { reply: "3", label: "Reply: 3 (Emergency)",   color: "#EF4444", icon: "🚨" },
            ].map(btn => (
              <button
                key={btn.reply}
                onClick={() => testTextbackReply.mutate(btn.reply)}
                disabled={testTextbackReply.isPending}
                style={{ padding: "9px 14px", borderRadius: 9, cursor: testTextbackReply.isPending ? "not-allowed" : "pointer", background: `${btn.color}0D`, border: `1px solid ${btn.color}22`, opacity: testTextbackReply.isPending ? 0.55 : 1, transition: "all 0.18s" }}
              >
                <span style={{ fontSize: 13 }}>{btn.icon}</span>
                <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: btn.color }}>{testTextbackReply.isPending ? "Logging…" : btn.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Flow reference */}
        <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(0,174,239,0.04)", border: "1px solid rgba(0,174,239,0.1)" }}>
          <div style={{ fontSize: 10.5, color: "#475569", lineHeight: 1.7 }}>
            <strong style={{ color: "#94A3B8" }}>Flow:</strong> Missed call detected →
            dedup check (15 min window) → outbound SMS via Telnyx API →
            customer replies 1/2/3 → lead status updated
            <br />
            <strong style={{ color: "#94A3B8" }}>Event types:</strong>{" "}
            <code style={{ color: "#00AEEF" }}>missed_call</code> ·{" "}
            <code style={{ color: "#00AEEF" }}>telnyx_textback_sent</code> ·{" "}
            <code style={{ color: "#00AEEF" }}>telnyx_textback_failed</code> ·{" "}
            <code style={{ color: "#00AEEF" }}>telnyx_sms_reply</code>
          </div>
        </div>
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
          <div style={{ color: "#22C55E", fontSize: 13, fontWeight: 600, padding: "8px 0" }}>
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
                background: logPaused ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
                border: logPaused ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(34,197,94,0.3)",
                color: logPaused ? "#EF4444" : "#22C55E",
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
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12, marginBottom: 14 }}>
              {(() => {
                const ae = health.aiEngine;
                const status = !ae.active ? "Not Configured" : ae.enginePaused ? "Paused" : ae.autoGenerateEnabled ? "Active" : "Disabled";
                const statusColor = !ae.active ? "#475569" : ae.enginePaused ? "#F59E0B" : ae.autoGenerateEnabled ? "#22C55E" : "#EF4444";
                return [
                  {
                    label: "Engine",
                    value: status,
                    sub: ae.clientName ? `${ae.clientName}${ae.industry ? ` · ${ae.industry.replace(/_/g, " ")}` : ""}` : "—",
                    color: statusColor,
                  },
                  {
                    label: "Schedule",
                    value: ae.frequency?.replace(/_/g, " ") ?? "—",
                    sub: ae.platforms.join(", ") || "no platforms",
                    color: "#00AEEF",
                  },
                  {
                    label: "Queue Size",
                    value: String(ae.scheduledCount),
                    sub: `${ae.draftCount} draft · ${ae.totalPosts} total`,
                    color: "#F59E0B",
                  },
                  {
                    label: "Next Scheduled",
                    value: ae.nextScheduledPost ? fmtDate(ae.nextScheduledPost) : "None",
                    sub: "upcoming post",
                    color: "#C0C0C0",
                  },
                  {
                    label: "Last Generated",
                    value: ae.lastGeneratedAt ? fmtDate(ae.lastGeneratedAt) : "Never",
                    sub: ae.postAngles.length ? `angles: ${ae.postAngles.slice(0, 3).join(", ")}…` : "no angles set",
                    color: "#6B9EFF",
                  },
                  {
                    label: "Tone Style",
                    value: ae.toneStyle.length ? ae.toneStyle.join(", ") : "—",
                    sub: ae.lastUpdated ? `Config updated ${fmtDate(ae.lastUpdated)}` : "engine settings",
                    color: "#475569",
                  },
                ].map(card => (
                  <div key={card.label} style={{
                    background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12, padding: "14px 16px",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6 }}>{card.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: card.color, marginBottom: 3, wordBreak: "break-word" }}>{card.value}</div>
                    <div style={{ fontSize: 10.5, color: "#334155" }}>{card.sub}</div>
                  </div>
                ));
              })()}
            </div>

            {/* AI Engine Analytics */}
            {aiAnalytics && (
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 10, marginBottom: 14, padding: "14px 0",
                borderTop: "1px solid rgba(0,174,239,0.08)",
              }}>
                {(() => {
                  const qa = aiAnalytics;
                  const qualityColor: Record<string, string> = {
                    excellent: "#22C55E", good: "#6B9EFF", fair: "#F59E0B", poor: "#EF4444", empty: "#475569",
                  };
                  const scoreCol = qa.averageContentScore != null
                    ? qa.averageContentScore >= 85 ? "#22C55E" : qa.averageContentScore >= 70 ? "#6B9EFF" : qa.averageContentScore >= 50 ? "#F59E0B" : "#EF4444"
                    : "#475569";
                  return [
                    {
                      label: "Avg Content Score",
                      value: qa.averageContentScore != null ? `${qa.averageContentScore}/100` : "—",
                      sub: qa.totalPostsInQueue > 0 ? `across ${qa.totalPostsInQueue} queued posts` : "no posts scored yet",
                      color: scoreCol,
                      icon: "🎯",
                    },
                    {
                      label: "Queue Quality",
                      value: qa.queueQuality === "empty" ? "No Posts" : qa.queueQuality.charAt(0).toUpperCase() + qa.queueQuality.slice(1),
                      sub: qa.duplicateRiskCount.high > 0 ? `${qa.duplicateRiskCount.high} high-risk posts` : `${qa.duplicateRiskCount.low} low-risk posts`,
                      color: qualityColor[qa.queueQuality] ?? "#475569",
                      icon: "✦",
                    },
                    {
                      label: "Duplicate Risk",
                      value: `${qa.duplicateRiskCount.high} High`,
                      sub: `${qa.duplicateRiskCount.medium} medium · ${qa.duplicateRiskCount.low} low`,
                      color: qa.duplicateRiskCount.high > 0 ? "#EF4444" : qa.duplicateRiskCount.medium > 0 ? "#F59E0B" : "#22C55E",
                      icon: "⚠",
                    },
                    {
                      label: "Best Next Post",
                      value: qa.bestNextPost ? `${qa.bestNextPost.city?.split(",")[0] ?? "?"} · ${qa.bestNextPost.topic ?? "?"}` : "—",
                      sub: qa.bestNextPost ? `${qa.bestNextPost.angle} · ${qa.bestNextPost.bestPlatform ?? "—"} · score ${qa.bestNextPost.score}` : "generate posts to see suggestion",
                      color: "#00AEEF",
                      icon: "⚡",
                    },
                  ].map(card => (
                    <div key={card.label} style={{
                      background: "rgba(0,174,239,0.04)", border: "1px solid rgba(0,174,239,0.1)",
                      borderRadius: 10, padding: "12px 14px",
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6 }}>
                        {card.icon} {card.label}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: card.color, marginBottom: 3, wordBreak: "break-word" }}>{card.value}</div>
                      <div style={{ fontSize: 10.5, color: "#334155", lineHeight: 1.4 }}>{card.sub}</div>
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* Diagnostics action buttons */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 14 }}>
              {[
                { label: "Regenerate Queue", icon: "🔄", color: "#00AEEF", action: () => regenQueueMut.mutate(), pending: regenQueueMut.isPending, desc: "Rebuild 14-day queue using current settings" },
                { label: "Clear Queue",       icon: "🗑",  color: "#EF4444", action: () => clearQueueDiag.mutate(), pending: clearQueueDiag.isPending, desc: "Delete all scheduled & draft posts" },
                { label: "Force Generate Now", icon: "⚡",  color: "#22C55E", action: () => forceGenerateMut.mutate(), pending: forceGenerateMut.isPending, desc: "Generate 5 posts immediately" },
              ].map(btn => (
                <button key={btn.label} onClick={btn.action} disabled={btn.pending || anyMutPending}
                  style={{
                    flex: "1 1 160px", maxWidth: 200, padding: "11px 14px", borderRadius: 10, textAlign: "left",
                    background: `${btn.color}11`, border: `1px solid ${btn.color}33`,
                    cursor: (btn.pending || anyMutPending) ? "not-allowed" : "pointer",
                    opacity: (btn.pending || anyMutPending) ? 0.5 : 1,
                  }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{btn.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: btn.color, marginBottom: 2 }}>
                    {btn.pending ? "Working…" : btn.label}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#475569", lineHeight: 1.3 }}>{btn.desc}</div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ color: "#334155", fontSize: 12 }}>Loading…</div>
        )}
      </div>
      {/* ── SECTION 7: Image Engine ── */}
      <div style={SECTION_STYLE}>
        <div style={SECTION_TITLE}><span>🖼</span> Image Engine</div>
        {imageStats ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
              {[
                { label: "Total Assets",    value: imageStats.total,         sub: "uploaded images",   color: "#00AEEF" },
                { label: "Tagged Assets",   value: imageStats.tagged,        sub: "with topic / city", color: "#22C55E" },
                { label: "Untagged Assets", value: imageStats.untagged,      sub: "need tagging",      color: imageStats.untagged > 0 ? "#F59E0B" : "#22C55E" },
                {
                  label: "Coverage Score",
                  value: `${imageStats.coverageScore}%`,
                  sub: imageStats.coverageScore >= 80 ? "Excellent coverage" : imageStats.coverageScore >= 50 ? "Good — add more images" : "Low — upload more",
                  color: imageStats.coverageScore >= 80 ? "#22C55E" : imageStats.coverageScore >= 50 ? "#F59E0B" : "#EF4444",
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

            {/* AI Coverage Suggestions */}
            {imageStats.suggestions.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
                  AI Coverage Suggestions
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {imageStats.suggestions.slice(0, 4).map((s, i) => (
                    <div key={i} style={{
                      fontSize: 12, color: "#CBD5E1", lineHeight: 1.5,
                      background: "rgba(0,174,239,0.04)", border: "1px solid rgba(0,174,239,0.1)",
                      borderRadius: 8, padding: "7px 11px",
                    }}>
                      <span style={{ color: "#00AEEF", fontWeight: 800, marginRight: 5 }}>→</span>{s}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <a href="#" onClick={e => { e.preventDefault(); window.location.href = window.location.href.replace("/diagnostics", "/image-assets"); }}
              style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: "#00AEEF", textDecoration: "none", padding: "7px 14px", borderRadius: 8, background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)" }}>
              → Manage Images
            </a>
          </>
        ) : (
          <div style={{ color: "#334155", fontSize: 12 }}>Loading image stats…</div>
        )}
      </div>

      {/* ── Section 8: Content Performance ── */}
      <div style={{ background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#FFFFFF", marginBottom: 4 }}>Section 8 — Content Performance</div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 16 }}>AI learning loop — engagement scores and top-performing content patterns</div>

        {contentInsights ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
              {[
                { label: "Total Posts",       value: contentInsights.totalPosts,                                   color: "#00AEEF", sub: "all statuses" },
                { label: "With Performance",  value: contentInsights.postsWithPerf,                                 color: "#22C55E", sub: "logged metrics" },
                { label: "Avg Engagement",    value: contentInsights.avgEngagementScore != null ? `${contentInsights.avgEngagementScore}%` : "—", color: contentInsights.avgEngagementScore != null && contentInsights.avgEngagementScore >= 5 ? "#22C55E" : "#F59E0B", sub: "real data only" },
              ].map(card => (
                <div key={card.label} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6 }}>{card.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: card.color, marginBottom: 3 }}>{card.value}</div>
                  <div style={{ fontSize: 10.5, color: "#334155" }}>{card.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                { label: "Top Topic",    value: contentInsights.topTopic    ?? "—", icon: "📝" },
                { label: "Top City",     value: contentInsights.topCity     ?? "—", icon: "📍" },
                { label: "Top Angle",    value: contentInsights.topAngle    ?? "—", icon: "🎯" },
                { label: "Top Platform", value: contentInsights.topPlatform ?? "—", icon: "📱" },
                { label: "Best Time",    value: contentInsights.bestPostingTime ?? "—", icon: "⏰" },
                { label: "Data Quality", value: contentInsights.hasRealData ? "Real Engagement" : "Content Score Proxy", icon: contentInsights.hasRealData ? "✅" : "⚡" },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", gap: 10, alignItems: "center", background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginTop: 2 }}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {contentInsights.insights.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>AI Insights</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {contentInsights.insights.map((s, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#CBD5E1", lineHeight: 1.5, background: "rgba(0,174,239,0.04)", border: "1px solid rgba(0,174,239,0.1)", borderRadius: 8, padding: "7px 11px" }}>
                      <span style={{ color: "#00AEEF", fontWeight: 800, marginRight: 5 }}>→</span>{s}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ color: "#334155", fontSize: 12 }}>Loading content performance…</div>
        )}
      </div>

      {/* ── Section 9: Local Presence Engine ── */}
      <div style={{ background: "rgba(11,22,41,0.85)", border: "1px solid rgba(0,174,239,0.18)", borderRadius: 16, padding: "24px 28px", marginBottom: 16, backdropFilter: "blur(8px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 20 }}>📍</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.01em" }}>Local Presence Engine</span>
          <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 20, padding: "2px 8px", letterSpacing: "0.06em" }}>V1</span>
          <a href="/admin/local-presence" style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#00AEEF", textDecoration: "none", background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)", borderRadius: 8, padding: "4px 10px" }}>
            Open Dashboard ↗
          </a>
        </div>

        {/* Channel status grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 16 }}>
          {[
            { name: "Google Business Profile", icon: "G",  color: "#EA4335", status: "healthy"  as const, detail: "Connected · Bed Bugs & Beyond" },
            { name: "Apple Business Connect",  icon: "🍎", color: "#A2AAAD", status: "warning"  as const, detail: "Setup pending — not yet claimed" },
            { name: "Bing Places for Business",icon: "B",  color: "#00ADEF", status: "warning"  as const, detail: "Setup pending — not yet claimed" },
            { name: "Nextdoor Business",        icon: "N",  color: "#8DC641", status: "warning"  as const, detail: "Setup pending — not yet claimed" },
          ].map(({ name, icon, color, status, detail }) => {
            const st = { healthy: { dot: "#22C55E", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.2)", label: "Connected" }, warning: { dot: "#F59E0B", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", label: "Pending" } }[status];
            return (
              <div key={name} style={{ background: st.bg, border: `1px solid ${st.border}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: `${color}18`, border: `1px solid ${color}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color, flexShrink: 0 }}>
                    {icon}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>{name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "#94A3B8" }}>{detail}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Visibility score bar */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.8px", textTransform: "uppercase" }}>Local Visibility Score</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#F59E0B" }}>36 / 100 <span style={{ fontSize: 10, color: "#475569", fontWeight: 400 }}>— 3 channels pending setup</span></span>
          </div>
          <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: "36%", background: "linear-gradient(90deg, #F59E0B, #00AEEF)", borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>
            Complete Apple, Bing, and Nextdoor setup to reach 100% local channel coverage.
          </div>
        </div>
      </div>

      {/* ── Section 10: Backup Center V1 ── */}
      <div style={{ background: "rgba(11,22,41,0.85)", border: "1px solid rgba(0,174,239,0.18)", borderRadius: 16, padding: "24px 28px", marginBottom: 16, backdropFilter: "blur(8px)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>🛡️</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.01em" }}>Backup Center</span>
              <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(0,174,239,0.15)", color: "#00AEEF", border: "1px solid rgba(0,174,239,0.3)", borderRadius: 20, padding: "2px 8px", letterSpacing: "0.06em" }}>V1</span>
            </div>
            <div style={{ fontSize: 12, color: "#64748B" }}>Automated backups for code, database, and image assets. All files stored on server — download anytime.</div>
          </div>
          <button
            onClick={() => runBackup("full")}
            disabled={!!bkRunning["full"]}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: bkRunning["full"] ? "rgba(59,130,246,0.2)" : "linear-gradient(135deg,#3B82F6,#6D28D9)",
              color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px",
              fontSize: 13, fontWeight: 700, cursor: bkRunning["full"] ? "not-allowed" : "pointer",
              boxShadow: bkRunning["full"] ? "none" : "0 4px 18px rgba(59,130,246,0.4)",
              whiteSpace: "nowrap", transition: "all 0.2s",
            }}
          >
            <span style={{ fontSize: 16 }}>{bkRunning["full"] ? "⏳" : "⚡"}</span>
            {bkRunning["full"] ? "Running Full Backup…" : "Full Backup"}
          </button>
        </div>

        {/* ── 4 Status Cards ── */}
        {(() => {
          const cards: Array<{ key: "code" | "database" | "assets" | "full"; label: string; icon: string; desc: string; btnLabel: string; accent: string; accentBg: string }> = [
            { key: "code",     label: "Code Backup",     icon: "💻", desc: "Full project source (excludes node_modules, .git, dist)", btnLabel: "Backup Code",     accent: "#00AEEF", accentBg: "rgba(0,174,239,0.08)"   },
            { key: "database", label: "Database Backup", icon: "🗄️", desc: "Exports social_posts, image_assets, settings & connections", btnLabel: "Backup Database", accent: "#22C55E", accentBg: "rgba(34,197,94,0.08)"  },
            { key: "assets",   label: "Asset Backup",    icon: "🖼️", desc: "Image metadata + files from object storage as ZIP",   btnLabel: "Backup Images",   accent: "#F59E0B", accentBg: "rgba(245,158,11,0.08)"  },
            { key: "full",     label: "Full System",     icon: "🔐", desc: "Runs all 3 backups + writes manifest.json",           btnLabel: "Full Backup",     accent: "#3B82F6", accentBg: "rgba(59,130,246,0.08)"   },
          ];
          const statusStyle: Record<BkStatus, { dot: string; label: string; border: string }> = {
            healthy: { dot: "#22C55E", label: "Healthy",  border: "rgba(34,197,94,0.25)" },
            warning: { dot: "#F59E0B", label: "Warning",  border: "rgba(245,158,11,0.25)" },
            never:   { dot: "#475569", label: "No backup", border: "rgba(71,85,105,0.25)" },
          };
          const fmtSize = (b: number) => b > 1_000_000 ? `${(b/1_000_000).toFixed(1)} MB` : b > 1000 ? `${(b/1024).toFixed(0)} KB` : `${b} B`;
          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginBottom: 28 }}>
              {cards.map(c => {
                const info: BkTypeStatus = bkData?.status?.[c.key] ?? { status: "never", lastBackupAt: null, sizeBytes: 0, filename: null };
                const ss = statusStyle[info.status];
                const running = !!bkRunning[c.key];
                return (
                  <div key={c.key} style={{ background: c.accentBg, border: `1px solid ${ss.border}`, borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, position: "relative", overflow: "hidden" }}>
                    {/* Glow bar */}
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${c.accent},transparent)`, opacity: info.status === "healthy" ? 1 : 0.3 }} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 20 }}>{c.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{c.label}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: ss.dot, boxShadow: `0 0 6px ${ss.dot}` }} />
                        <span style={{ fontSize: 10, fontWeight: 600, color: ss.dot }}>{ss.label}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.5 }}>{c.desc}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>
                        Last: <span style={{ color: info.lastBackupAt ? "#CBD5E1" : "#475569" }}>
                          {info.lastBackupAt ? new Date(info.lastBackupAt).toLocaleString() : "—"}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>
                        Size: <span style={{ color: info.sizeBytes > 0 ? c.accent : "#475569", fontWeight: 600 }}>
                          {info.sizeBytes > 0 ? fmtSize(info.sizeBytes) : "—"}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <button
                        onClick={() => runBackup(c.key)}
                        disabled={running}
                        style={{
                          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                          background: running ? "rgba(255,255,255,0.05)" : `linear-gradient(135deg,${c.accent}CC,${c.accent}88)`,
                          color: running ? "#64748B" : "#fff", border: `1px solid ${running ? "rgba(255,255,255,0.08)" : c.accent + "55"}`,
                          borderRadius: 8, padding: "8px 10px", fontSize: 12, fontWeight: 700,
                          cursor: running ? "not-allowed" : "pointer", transition: "all 0.2s",
                          boxShadow: running ? "none" : `0 2px 10px ${c.accent}33`,
                        }}
                      >
                        {running ? "⏳ Running…" : `▶ ${c.btnLabel}`}
                      </button>
                      {info.filename && (
                        <button
                          onClick={() => downloadBkFile(info.filename!)}
                          title={`Download: ${info.filename}`}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: "rgba(255,255,255,0.05)", color: "#94A3B8",
                            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                            padding: "8px 10px", fontSize: 13, cursor: "pointer", flexShrink: 0,
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,174,239,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "#00AEEF"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLButtonElement).style.color = "#94A3B8"; }}
                        >
                          ⬇
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── Backup History ── */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 12 }}>
            Backup History &nbsp;<span style={{ fontSize: 11, fontWeight: 400, color: "#475569", textTransform: "none" }}>— last 10 files</span>
          </div>
          {!bkData || bkData.history.length === 0 ? (
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "20px 16px", fontSize: 12, color: "#475569", textAlign: "center" }}>
              No backups yet — click a backup button above to create your first one.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {bkData.history.map(b => {
                const typeIcons: Record<string, string> = { code: "💻", database: "🗄️", assets: "🖼️", full: "🔐", other: "📄" };
                const typeColors: Record<string, string> = { code: "#00AEEF", database: "#22C55E", assets: "#F59E0B", full: "#3B82F6", other: "#94A3B8" };
                const icon = typeIcons[b.type] ?? "📄";
                const color = typeColors[b.type] ?? "#94A3B8";
                const sizeLabel = b.sizeBytes > 1_000_000 ? `${(b.sizeBytes/1_000_000).toFixed(1)} MB` : b.sizeBytes > 1000 ? `${(b.sizeBytes/1024).toFixed(0)} KB` : `${b.sizeBytes} B`;
                return (
                  <div key={b.filename} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.03)", borderRadius: 9, padding: "10px 14px", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ fontSize: 16 }}>{icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#E2E8F0", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.filename}</div>
                      <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                        <span style={{ color, fontWeight: 600, textTransform: "capitalize" }}>{b.type}</span>
                        &nbsp;·&nbsp;{new Date(b.createdAt).toLocaleString()}
                        &nbsp;·&nbsp;<span style={{ color }}>{sizeLabel}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => downloadBkFile(b.filename)}
                      style={{ background: "rgba(0,174,239,0.1)", color: "#00AEEF", border: "1px solid rgba(0,174,239,0.25)", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
                    >
                      ⬇ Download
                    </button>
                    <button
                      onClick={() => deleteBkFile(b.filename)}
                      style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer", flexShrink: 0 }}
                    >
                      🗑
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

    </AppShell>
  );
}
