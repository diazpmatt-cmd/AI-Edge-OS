import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────

type Settings = {
  clientName: string;
  industry: string;
  serviceAreas: string[];
  topics: string[];
  frequency: string;
  postingTimes: string[];
  platforms: string[];
  approvalMode: string;
  ctaText: string;
  ctaPreference: string;
  toneStyle: string[];
  postAngles: string[];
  autoGenerateEnabled: boolean;
  enginePaused: boolean;
  usedCombos: string[];
  lastGeneratedAt: string | null;
};

type GeneratedPost = {
  id: string; city: string; topic: string; angle: string;
  caption: string; hashtags: string[]; imagePrompt: string;
  scheduledAt: string; status: string; aiError?: string | null;
};

type GenerateResult = {
  ok: boolean; created: number; posts: GeneratedPost[]; updatedUsedCombos: string[];
};

type QueuePost = {
  id: string; city: string | null; topic: string | null; angle: string | null;
  caption: string; captionFacebook: string | null; captionGoogle: string | null;
  platforms: string[]; scheduledAt: string | null; status: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const FREQUENCY_OPTIONS = [
  { value: "every_day",       label: "Every day",        desc: "14 posts over 14 days" },
  { value: "every_other_day", label: "Every other day",  desc: "7 posts over 14 days"  },
  { value: "3x_week",         label: "3× per week",      desc: "6 posts over 14 days"  },
];

const PLATFORM_OPTIONS = [
  { value: "facebook",         label: "Facebook",  icon: "f", color: "#6B9EFF" },
  { value: "instagram",        label: "Instagram", icon: "✦", color: "#FF6B9D" },
  { value: "google",           label: "Google",    icon: "G", color: "#EA4335" },
];

const APPROVAL_OPTIONS = [
  { value: "auto_schedule", label: "Auto schedule", desc: "Posts saved as scheduled (recommended)" },
  { value: "draft_only",    label: "Draft only",    desc: "All posts saved as drafts for review" },
];

const TONE_OPTIONS = [
  { value: "professional",   label: "Professional" },
  { value: "educational",    label: "Educational" },
  { value: "urgent",         label: "Urgent" },
  { value: "friendly",       label: "Friendly" },
  { value: "conversational", label: "Conversational" },
  { value: "humorous",       label: "Humorous" },
];

const ANGLE_OPTIONS = [
  { value: "educational", label: "Educational", desc: "Teach about the pest/service" },
  { value: "warning",     label: "Warning",     desc: "Alert about risks & dangers" },
  { value: "promotional", label: "Promotional", desc: "Highlight offers or deals" },
  { value: "seasonal",    label: "Seasonal",    desc: "Tie to season or weather" },
  { value: "faq",         label: "FAQ",         desc: "Answer common questions" },
  { value: "testimonial", label: "Testimonial", desc: "Social proof & reviews" },
  { value: "prevention",  label: "Prevention",  desc: "Tips to avoid problems" },
  { value: "emergency",   label: "Emergency",   desc: "Urgent call-to-action" },
];

const INDUSTRY_OPTIONS = [
  { value: "pest_control",  label: "Pest Control" },
  { value: "hvac",          label: "HVAC" },
  { value: "plumbing",      label: "Plumbing" },
  { value: "cleaning",      label: "Cleaning" },
  { value: "landscaping",   label: "Landscaping" },
  { value: "electrical",    label: "Electrical" },
  { value: "roofing",       label: "Roofing" },
];

const CTA_OPTIONS = [
  { value: "call_now",   label: "Call Now",   desc: "Drive phone calls" },
  { value: "learn_more", label: "Learn More", desc: "Drive website visits" },
  { value: "book_now",   label: "Book Now",   desc: "Drive appointments" },
];

const DEFAULT_SETTINGS: Settings = {
  clientName: "", industry: "pest_control",
  serviceAreas: [], topics: [], frequency: "every_other_day",
  postingTimes: ["08:00", "12:00", "17:00"], platforms: ["facebook", "google"],
  approvalMode: "auto_schedule", ctaText: "",
  ctaPreference: "call_now", toneStyle: ["professional", "friendly"],
  postAngles: ["educational", "warning", "promotional", "seasonal", "faq", "prevention"],
  autoGenerateEnabled: false, enginePaused: false, usedCombos: [], lastGeneratedAt: null,
};

const BED_BUGS_PRESET: Settings = {
  clientName: "Bed Bugs & Beyond",
  industry: "pest_control",
  serviceAreas: [
    "Foley, AL", "Gulf Shores, AL", "Orange Beach, AL", "Fairhope, AL",
    "Daphne, AL", "Spanish Fort, AL", "Loxley, AL", "Summerdale, AL",
    "Elberta, AL", "Lillian, AL", "Perdido Beach, AL",
  ],
  topics: [
    "Bed Bugs", "Roaches", "Ants", "Fleas", "Ticks",
    "Rats", "Mice", "Wasps", "Spiders", "Mosquitoes", "Moles",
  ],
  frequency: "every_other_day",
  postingTimes: ["08:00", "12:00", "17:00"],
  platforms: ["facebook", "google"],
  approvalMode: "auto_schedule",
  ctaText: "Call Now \u2014 (251) 324-9090",
  ctaPreference: "call_now",
  toneStyle: ["professional", "educational", "urgent", "friendly"],
  postAngles: ["educational", "warning", "promotional", "seasonal", "faq", "prevention", "emergency"],
  autoGenerateEnabled: true,
  enginePaused: false,
  usedCombos: [],
  lastGeneratedAt: null,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function fmtAge(iso: string | null) {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TagList({ items, onRemove, onAdd, placeholder }: {
  items: string[]; onRemove: (i: number) => void; onAdd: (v: string) => void; placeholder: string;
}) {
  const [input, setInput] = useState("");
  const add = () => { const v = input.trim(); if (v && !items.includes(v)) { onAdd(v); setInput(""); } };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {items.map((item, i) => (
          <span key={i} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: "rgba(0,174,239,0.10)", border: "1px solid rgba(0,174,239,0.25)",
            borderRadius: 6, padding: "3px 8px 3px 10px", fontSize: 12.5, color: "#C8E8FF",
          }}>
            {item}
            <button onClick={() => onRemove(i)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(200,232,255,0.5)", fontSize: 14, lineHeight: 1, padding: 0,
            }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()} placeholder={placeholder}
          style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "7px 12px", fontSize: 13, color: "#E2E8F0", outline: "none" }} />
        <button onClick={add} style={{ background: "rgba(0,174,239,0.15)", border: "1px solid rgba(0,174,239,0.3)", borderRadius: 7, padding: "7px 14px", fontSize: 13, color: "#00AEEF", cursor: "pointer", fontWeight: 600 }}>+ Add</button>
      </div>
    </div>
  );
}

function AnglePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
      background: active ? "rgba(0,174,239,0.15)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${active ? "rgba(0,174,239,0.4)" : "rgba(255,255,255,0.08)"}`,
      color: active ? "#00AEEF" : "#475569",
    }}>{label}</button>
  );
}

const STATUS_COLOR: Record<string, string> = {
  scheduled: "#00AEEF", draft: "#94A3B8", published: "#10B981", failed: "#EF4444", pending: "#F59E0B",
};

const ANGLE_COLOR: Record<string, string> = {
  educational: "#6B9EFF", warning: "#F59E0B", promotional: "#10B981", seasonal: "#A78BFA",
  faq: "#00AEEF", testimonial: "#FF6B9D", prevention: "#34D399", emergency: "#EF4444",
};

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AutoContentEnginePage() {
  const authFetch = useApiFetch();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [newTime, setNewTime] = useState("08:00");
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  const { isLoading } = useQuery<Settings>({
    queryKey: ["auto-content-settings"],
    queryFn: () => authFetch<Settings>("/auto-content/settings"),
    onSuccess: (d: Settings) => setSettings(d),
  } as any);

  const queueQuery = useQuery<{ posts: QueuePost[]; total: number }>({
    queryKey: ["auto-content-queue"],
    queryFn: () => authFetch<{ posts: QueuePost[]; total: number }>("/auto-content/queue?limit=50"),
    refetchInterval: 30000,
  });

  const set = <K extends keyof Settings>(key: K, val: Settings[K]) =>
    setSettings(prev => ({ ...prev, [key]: val }));

  const toggleArr = (key: "platforms" | "toneStyle" | "postAngles", v: string) => {
    const arr = settings[key] as string[];
    set(key as any, arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  };

  const saveMut = useMutation({
    mutationFn: (s: Settings) => authFetch("/auto-content/settings", { method: "PUT", body: JSON.stringify(s) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["auto-content-settings"] }); toast.success("Settings saved."); },
    onError: () => toast.error("Failed to save settings."),
  });

  const presetMut = useMutation({
    mutationFn: (s: Settings) => authFetch("/auto-content/settings", { method: "PUT", body: JSON.stringify(s) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auto-content-settings"] });
      toast.success("Bed Bugs & Beyond preset loaded and saved.");
    },
    onError: () => toast.error("Failed to save preset."),
  });

  const loadPreset = () => {
    const preset = { ...BED_BUGS_PRESET };
    setSettings(preset);
    presetMut.mutate(preset);
  };

  const generateMut = useMutation({
    mutationFn: (payload: Settings & { count?: number }) =>
      authFetch<GenerateResult>("/auto-content/generate", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (res, vars) => {
      setResult(res);
      setSettings(prev => ({ ...prev, usedCombos: res.updatedUsedCombos }));
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      qc.invalidateQueries({ queryKey: ["auto-content-queue"] });
      const label = vars.count ? `${res.created} posts` : `${res.created} posts (14 days)`;
      toast.success(`${label} created in Publishing Center!`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Generation failed."),
  });

  const clearQueueMut = useMutation({
    mutationFn: () => authFetch("/auto-content/queue", { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["auto-content-queue"] }); toast.success("Queue cleared."); },
    onError: () => toast.error("Failed to clear queue."),
  });

  const pauseMut = useMutation({
    mutationFn: () => authFetch("/auto-content/pause", { method: "POST" }),
    onSuccess: () => { setSettings(p => ({ ...p, enginePaused: true })); toast.success("Engine paused."); },
  });

  const resumeMut = useMutation({
    mutationFn: () => authFetch("/auto-content/resume", { method: "POST" }),
    onSuccess: () => { setSettings(p => ({ ...p, enginePaused: false })); toast.success("Engine resumed."); },
  });

  const deletePostMut = useMutation({
    mutationFn: (id: string) => authFetch(`/social-posts/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["auto-content-queue"] }); toast.success("Post deleted."); },
    onError: () => toast.error("Failed to delete post."),
  });

  const publishNowMut = useMutation({
    mutationFn: (id: string) => authFetch(`/social-posts/${id}/publish`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["auto-content-queue"] }); toast.success("Post published!"); },
    onError: (e: any) => toast.error(e?.message ?? "Publish failed."),
  });

  const anyPending = generateMut.isPending || clearQueueMut.isPending || pauseMut.isPending || resumeMut.isPending || presetMut.isPending;

  const totalCombos = settings.serviceAreas.length * settings.topics.length;
  const usedCount = settings.usedCombos.length;
  const progressPct = totalCombos > 0 ? Math.min(100, Math.round((usedCount / totalCombos) * 100)) : 0;
  const queueTotal = queueQuery.data?.total ?? 0;
  const nextPost = queueQuery.data?.posts[0];

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14, padding: 20, marginBottom: 16,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11.5, fontWeight: 700, color: "#64748B", textTransform: "uppercase",
    letterSpacing: "0.5px", marginBottom: 7, display: "block",
  };
  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 7, padding: "9px 12px", fontSize: 13.5, color: "#E2E8F0", outline: "none",
    width: "100%", boxSizing: "border-box",
  };

  const engineStatus = generateMut.isPending
    ? "running"
    : !settings.autoGenerateEnabled
      ? "disabled"
      : settings.enginePaused
        ? "paused"
        : queueTotal === 0
          ? "configured"
          : "active";

  const statusColors = {
    running:    { dot: "#00AEEF", bg: "rgba(0,174,239,0.1)",   border: "rgba(0,174,239,0.3)",    label: "Running",    pulse: true  },
    active:     { dot: "#10B981", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)",  label: "Active",     pulse: false },
    configured: { dot: "#6B9EFF", bg: "rgba(107,158,255,0.08)",border: "rgba(107,158,255,0.22)", label: "Configured", pulse: false },
    paused:     { dot: "#F59E0B", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)",  label: "Paused",     pulse: false },
    disabled:   { dot: "#EF4444", bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.2)",    label: "Disabled",   pulse: false },
  };
  const sc = statusColors[engineStatus];

  return (
    <AppShell>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px", overflowX: "hidden", width: "100%", boxSizing: "border-box" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "#4A90D9", marginBottom: 6, fontWeight: 600, letterSpacing: "0.3px" }}>
            <span style={{ cursor: "pointer", opacity: 0.7 }} onClick={() => navigate("/admin/social-publishing")}>
              Publishing Center
            </span>
            <span style={{ margin: "0 6px", opacity: 0.4 }}>›</span>
            Auto Content Engine
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: "#FFFFFF", margin: 0, letterSpacing: "-0.3px" }}>
                🤖 Auto Content Engine
              </h1>
              <p style={{ fontSize: 13.5, color: "#64748B", margin: "4px 0 0" }}>
                AI-powered local posts — rotating city, topic, and angle automatically.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                onClick={loadPreset}
                disabled={presetMut.isPending || saveMut.isPending}
                style={{
                  background: "linear-gradient(135deg, rgba(0,174,239,0.18) 0%, rgba(0,112,184,0.18) 100%)",
                  border: "1px solid rgba(0,174,239,0.45)",
                  borderRadius: 9, padding: "10px 18px", fontSize: 13, color: "#00AEEF",
                  cursor: presetMut.isPending ? "not-allowed" : "pointer",
                  fontWeight: 700, display: "flex", alignItems: "center", gap: 7,
                  opacity: presetMut.isPending ? 0.7 : 1,
                }}>
                <span style={{ fontSize: 15 }}>🐛</span>
                {presetMut.isPending ? "Loading preset…" : "Load Bed Bugs & Beyond Preset"}
              </button>
              <button onClick={() => saveMut.mutate(settings)} disabled={saveMut.isPending || presetMut.isPending}
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, padding: "10px 20px", fontSize: 13.5, color: "#CBD5E1", cursor: "pointer", fontWeight: 600 }}>
                {saveMut.isPending ? "Saving…" : "💾 Save Settings"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Engine Status Banner ── */}
        <div style={{
          marginBottom: 24, borderRadius: 14, padding: "16px 22px",
          background: sc.bg, border: `1px solid ${sc.border}`,
          display: "flex", alignItems: "center", flexWrap: "wrap", gap: 20,
        }}>
          {/* Status badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>
            <div style={{ position: "relative", width: 12, height: 12, flexShrink: 0 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: sc.dot }} />
              {sc.pulse && (
                <div style={{
                  position: "absolute", inset: 0, borderRadius: "50%", background: sc.dot,
                  animation: "pulse 1.4s ease-in-out infinite", opacity: 0.5,
                }} />
              )}
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: sc.dot, textTransform: "uppercase", letterSpacing: "0.6px" }}>
              {sc.label}
            </span>
            {settings.clientName && (
              <span style={{ fontSize: 13, color: "#64748B" }}>— {settings.clientName}</span>
            )}
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", flex: 1, justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: queueTotal > 0 ? "#E2E8F0" : "#475569", lineHeight: 1 }}>{queueTotal}</div>
              <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.4px", marginTop: 3 }}>Queued Posts</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: nextPost ? "#E2E8F0" : "#475569" }}>
                {nextPost?.scheduledAt ? fmtDate(nextPost.scheduledAt) : "None scheduled"}
              </div>
              <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.4px", marginTop: 3 }}>Next Post</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: settings.lastGeneratedAt ? "#64748B" : "#334155" }}>
                {settings.lastGeneratedAt ? fmtAge(settings.lastGeneratedAt) : "Never"}
              </div>
              <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.4px", marginTop: 3 }}>Last Generated</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{settings.frequency.replace(/_/g, " ")}</div>
              <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.4px", marginTop: 3 }}>Frequency</div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
            {engineStatus !== "paused" ? (
              <button onClick={() => pauseMut.mutate()} disabled={anyPending || engineStatus === "running"}
                style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: anyPending ? "not-allowed" : "pointer", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", color: "#F59E0B" }}>
                ⏸ Pause
              </button>
            ) : (
              <button onClick={() => resumeMut.mutate()} disabled={anyPending}
                style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: anyPending ? "not-allowed" : "pointer", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981" }}>
                ▶ Resume
              </button>
            )}
          </div>
        </div>
        <style>{`@keyframes pulse { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(2.2);opacity:0} }`}</style>

        {isLoading ? (
          <div style={{ color: "#4A90D9", fontSize: 14, padding: "40px 0", textAlign: "center" }}>Loading settings…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 320px)", gap: 24, alignItems: "start" }}>

            {/* ── LEFT: Settings Panel ── */}
            <div style={{ minWidth: 0 }}>

              {/* Client */}
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0", marginBottom: 14 }}>Client Profile</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={labelStyle}>Business Name</label>
                    <input value={settings.clientName} onChange={e => set("clientName", e.target.value)} style={inputStyle} placeholder="e.g. Bed Bugs & Beyond" />
                  </div>
                  <div>
                    <label style={labelStyle}>Industry</label>
                    <select value={settings.industry} onChange={e => set("industry", e.target.value)}
                      style={{ ...inputStyle, cursor: "pointer" }}>
                      {INDUSTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Default CTA Text</label>
                  <input value={settings.ctaText} onChange={e => set("ctaText", e.target.value)} style={inputStyle} placeholder="e.g. Call Now — (251) 324-9090" />
                </div>
              </div>

              {/* Tone Style */}
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0", marginBottom: 12 }}>Tone Style</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {TONE_OPTIONS.map(t => {
                    const active = settings.toneStyle.includes(t.value);
                    return (
                      <button key={t.value} onClick={() => toggleArr("toneStyle", t.value)} style={{
                        padding: "6px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                        background: active ? "rgba(0,174,239,0.12)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${active ? "rgba(0,174,239,0.35)" : "rgba(255,255,255,0.08)"}`,
                        color: active ? "#00AEEF" : "#475569",
                      }}>{active ? "✓ " : ""}{t.label}</button>
                    );
                  })}
                </div>
              </div>

              {/* CTA Preference */}
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0", marginBottom: 12 }}>CTA Preference</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {CTA_OPTIONS.map(o => {
                    const active = settings.ctaPreference === o.value;
                    return (
                      <label key={o.value} style={{
                        flex: "1 1 140px", display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
                        background: active ? "rgba(0,174,239,0.08)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${active ? "rgba(0,174,239,0.3)" : "rgba(255,255,255,0.06)"}`,
                        borderRadius: 9, padding: "9px 12px",
                      }}>
                        <input type="radio" checked={active} onChange={() => set("ctaPreference", o.value)}
                          style={{ marginTop: 2, accentColor: "#00AEEF" }} />
                        <div>
                          <div style={{ fontSize: 13, color: "#E2E8F0", fontWeight: 600 }}>{o.label}</div>
                          <div style={{ fontSize: 11, color: "#64748B" }}>{o.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Service Areas */}
              <div style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0" }}>Service Areas</div>
                  <span style={{ fontSize: 11.5, color: "#64748B" }}>{settings.serviceAreas.length} cities</span>
                </div>
                <TagList
                  items={settings.serviceAreas}
                  onRemove={i => set("serviceAreas", settings.serviceAreas.filter((_, idx) => idx !== i))}
                  onAdd={v => set("serviceAreas", [...settings.serviceAreas, v])}
                  placeholder="e.g. Foley, AL"
                />
              </div>

              {/* Topics */}
              <div style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0" }}>Service / Pest Topics</div>
                  <span style={{ fontSize: 11.5, color: "#64748B" }}>{settings.topics.length} topics</span>
                </div>
                <TagList
                  items={settings.topics}
                  onRemove={i => set("topics", settings.topics.filter((_, idx) => idx !== i))}
                  onAdd={v => set("topics", [...settings.topics, v])}
                  placeholder="e.g. Termites"
                />
              </div>

              {/* Post Angles */}
              <div style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0" }}>Post Angles</div>
                  <span style={{ fontSize: 11.5, color: "#64748B" }}>{settings.postAngles.length} active</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                  {ANGLE_OPTIONS.map(a => {
                    const active = settings.postAngles.includes(a.value);
                    const col = ANGLE_COLOR[a.value] ?? "#94A3B8";
                    return (
                      <button key={a.value} onClick={() => toggleArr("postAngles", a.value)} style={{
                        textAlign: "left", padding: "8px 12px", borderRadius: 9, cursor: "pointer",
                        background: active ? `${col}14` : "rgba(255,255,255,0.03)",
                        border: `1px solid ${active ? `${col}44` : "rgba(255,255,255,0.07)"}`,
                      }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: active ? col : "#475569", marginBottom: 2 }}>
                          {active ? "✓ " : ""}{a.label}
                        </div>
                        <div style={{ fontSize: 10.5, color: "#334155" }}>{a.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Schedule */}
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0", marginBottom: 14 }}>Posting Schedule</div>
                <label style={labelStyle}>Frequency</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                  {FREQUENCY_OPTIONS.map(opt => (
                    <label key={opt.value} style={{
                      display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer",
                      background: settings.frequency === opt.value ? "rgba(0,174,239,0.08)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${settings.frequency === opt.value ? "rgba(0,174,239,0.3)" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: 9, padding: "9px 14px",
                    }}>
                      <input type="radio" name="frequency" value={opt.value} checked={settings.frequency === opt.value}
                        onChange={() => set("frequency", opt.value)} style={{ marginTop: 2, accentColor: "#00AEEF" }} />
                      <div>
                        <div style={{ fontSize: 13, color: "#E2E8F0", fontWeight: 600 }}>{opt.label}</div>
                        <div style={{ fontSize: 11.5, color: "#64748B" }}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <label style={labelStyle}>Posting Times (rotated in order)</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {settings.postingTimes.map(t => (
                    <span key={t} style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      background: "rgba(0,174,239,0.10)", border: "1px solid rgba(0,174,239,0.25)",
                      borderRadius: 20, padding: "5px 12px", fontSize: 13, color: "#00AEEF", fontWeight: 600,
                    }}>
                      {fmtTime(t)}
                      {settings.postingTimes.length > 1 && (
                        <button onClick={() => set("postingTimes", settings.postingTimes.filter(x => x !== t))}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(0,174,239,0.5)", fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
                      )}
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
                    style={{ ...inputStyle, width: "auto", flex: 1 }} />
                  <button onClick={() => {
                    if (newTime && !settings.postingTimes.includes(newTime)) {
                      set("postingTimes", [...settings.postingTimes, newTime].sort());
                    }
                  }} style={{ background: "rgba(0,174,239,0.15)", border: "1px solid rgba(0,174,239,0.3)", borderRadius: 7, padding: "7px 14px", fontSize: 13, color: "#00AEEF", cursor: "pointer", fontWeight: 600 }}>
                    + Add Time
                  </button>
                </div>
              </div>

              {/* Platforms */}
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0", marginBottom: 14 }}>Platforms</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {PLATFORM_OPTIONS.map(p => {
                    const active = settings.platforms.includes(p.value);
                    return (
                      <button key={p.value} onClick={() => toggleArr("platforms", p.value)} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
                        background: active ? `${p.color}20` : "rgba(255,255,255,0.04)",
                        border: `1px solid ${active ? p.color : "rgba(255,255,255,0.08)"}`,
                        borderRadius: 10, cursor: "pointer",
                        color: active ? p.color : "#64748B", fontSize: 13.5, fontWeight: 600,
                      }}>
                        <span style={{ width: 22, height: 22, borderRadius: "50%", background: active ? `${p.color}22` : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: active ? p.color : "#64748B" }}>{p.icon}</span>
                        {p.label} {active && <span style={{ fontSize: 12, opacity: 0.7 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Approval Mode */}
              <div style={cardStyle}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0", marginBottom: 12 }}>Approval Mode</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {APPROVAL_OPTIONS.map(opt => (
                    <label key={opt.value} style={{
                      display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer",
                      background: settings.approvalMode === opt.value ? "rgba(0,174,239,0.08)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${settings.approvalMode === opt.value ? "rgba(0,174,239,0.3)" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: 9, padding: "9px 14px",
                    }}>
                      <input type="radio" name="approvalMode" value={opt.value} checked={settings.approvalMode === opt.value}
                        onChange={() => set("approvalMode", opt.value)} style={{ marginTop: 2, accentColor: "#00AEEF" }} />
                      <div>
                        <div style={{ fontSize: 13, color: "#E2E8F0", fontWeight: 600 }}>{opt.label}</div>
                        <div style={{ fontSize: 11.5, color: "#64748B" }}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

            </div>

            {/* ── RIGHT: Controls + Queue ── */}
            <div style={{ position: "sticky", top: 24, minWidth: 0 }}>

              {/* Combo Coverage */}
              <div style={cardStyle}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginBottom: 8 }}>Combo Coverage</div>
                <div style={{ fontSize: 11.5, color: "#64748B", marginBottom: 8 }}>
                  {usedCount} of {totalCombos} city × topic combinations used
                </div>
                <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 100, height: 5, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 100, width: `${progressPct}%`, background: "linear-gradient(90deg, #00AEEF, #0070B8)", transition: "width 0.4s" }} />
                </div>
                {totalCombos > 0 && <div style={{ fontSize: 11, color: "#64748B", marginTop: 6 }}>{totalCombos - usedCount} remaining before cycle resets</div>}
                {usedCount > 0 && (
                  <button onClick={() => set("usedCombos", [])}
                    style={{ marginTop: 8, background: "none", border: "none", cursor: "pointer", fontSize: 11.5, color: "#4A90D9", padding: 0, fontWeight: 600 }}>
                    ↺ Reset combo history
                  </button>
                )}
              </div>

              {/* Manual Controls */}
              <div style={{ ...cardStyle, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", marginBottom: 12 }}>Manual Controls</div>

                <button
                  onClick={() => generateMut.mutate({ ...settings, count: 5 })}
                  disabled={generateMut.isPending || anyPending}
                  style={{
                    width: "100%", padding: "11px 0", marginBottom: 8,
                    background: generateMut.isPending ? "rgba(0,174,239,0.15)" : "rgba(0,174,239,0.12)",
                    border: "1px solid rgba(0,174,239,0.3)", borderRadius: 10,
                    fontSize: 13.5, fontWeight: 700, color: "#00AEEF", cursor: generateMut.isPending ? "not-allowed" : "pointer",
                  }}>
                  {generateMut.isPending ? "⏳ Generating…" : "⚡ Generate Next 5 Posts"}
                </button>

                <button
                  onClick={() => generateMut.mutate(settings)}
                  disabled={generateMut.isPending || anyPending}
                  style={{
                    width: "100%", padding: "13px 0", marginBottom: 12,
                    background: generateMut.isPending ? "rgba(0,174,239,0.2)" : "linear-gradient(135deg, #0070B8 0%, #00AEEF 100%)",
                    border: "none", borderRadius: 10, cursor: generateMut.isPending ? "not-allowed" : "pointer",
                    fontSize: 14, fontWeight: 800, color: "#FFFFFF",
                    boxShadow: generateMut.isPending ? "none" : "0 3px 14px rgba(0,174,239,0.28)",
                  }}>
                  {generateMut.isPending ? "⏳ Generating…" : "⚡ Generate Next 14 Days"}
                </button>

                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => clearQueueMut.mutate()} disabled={anyPending}
                    style={{ flex: 1, minWidth: 100, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#EF4444" }}>
                    🗑 Clear Queue
                  </button>
                  {settings.enginePaused ? (
                    <button onClick={() => resumeMut.mutate()} disabled={anyPending}
                      style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#10B981" }}>
                      ▶ Resume
                    </button>
                  ) : (
                    <button onClick={() => pauseMut.mutate()} disabled={anyPending}
                      style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#F59E0B" }}>
                      ⏸ Pause
                    </button>
                  )}
                </div>

                <p style={{ fontSize: 11, color: "#475569", textAlign: "center", margin: "10px 0 0" }}>
                  Posts saved as {settings.approvalMode === "draft_only" ? "drafts" : "scheduled"} · angles rotate automatically
                </p>
              </div>

            </div>
          </div>
        )}

        {/* ── AI Queue Inspector (full-width) ── */}
        <div style={{ ...cardStyle, marginTop: 8, marginBottom: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#E2E8F0" }}>AI Queue Inspector</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                {queueTotal} post{queueTotal !== 1 ? "s" : ""} queued — click any row to expand captions
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => queueQuery.refetch()}
                style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94A3B8" }}>
                ↺ Refresh
              </button>
              <button onClick={() => navigate("/admin/social-publishing")}
                style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.25)", color: "#00AEEF" }}>
                Open Publishing Center →
              </button>
            </div>
          </div>

          {queueQuery.isLoading ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#475569", fontSize: 13 }}>Loading queue…</div>
          ) : !queueQuery.data?.posts.length ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#475569", marginBottom: 6 }}>Queue is empty</div>
              <div style={{ fontSize: 12.5, color: "#334155" }}>Use "Generate Next 5 Posts" or "Generate Next 14 Days" to fill it.</div>
            </div>
          ) : (
            <>
              {/* Scrollable table wrapper — only this div scrolls, not the page */}
              <div style={{ overflowX: "auto", borderRadius: 10, margin: "0 -2px" }}>
              <div style={{ minWidth: 860 }}>

              {/* Table header */}
              <div style={{
                display: "grid", gridTemplateColumns: "88px 148px 100px 110px 95px 115px 164px",
                gap: 6, padding: "6px 14px 8px",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px",
              }}>
                <span>Status</span>
                <span>Scheduled</span>
                <span>City</span>
                <span>Topic</span>
                <span>Angle</span>
                <span>Platforms</span>
                <span style={{ textAlign: "right" }}>Actions</span>
              </div>

              {/* Rows */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {queueQuery.data.posts.map((p, idx) => {
                  const anglCol = ANGLE_COLOR[p.angle ?? ""] ?? "#94A3B8";
                  const statCol = STATUS_COLOR[p.status] ?? "#94A3B8";
                  const isExpanded = expandedPostId === p.id;
                  const isOdd = idx % 2 === 1;
                  return (
                    <div key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      {/* Main row */}
                      <div
                        onClick={() => setExpandedPostId(isExpanded ? null : p.id)}
                        style={{
                          display: "grid", gridTemplateColumns: "88px 148px 100px 110px 95px 115px 164px",
                          gap: 6, padding: "10px 14px", cursor: "pointer", alignItems: "center",
                          background: isExpanded
                            ? "rgba(0,174,239,0.06)"
                            : isOdd ? "rgba(255,255,255,0.012)" : "transparent",
                          transition: "background 0.15s",
                        }}
                      >
                        {/* Status */}
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                          background: `${statCol}18`, color: statCol, border: `1px solid ${statCol}30`,
                          whiteSpace: "nowrap", display: "inline-block", textAlign: "center",
                        }}>
                          {p.status}
                        </span>

                        {/* Scheduled */}
                        <span style={{ fontSize: 11.5, color: "#64748B", whiteSpace: "nowrap" }}>
                          {p.scheduledAt ? fmtDate(p.scheduledAt) : "—"}
                        </span>

                        {/* City */}
                        <span style={{ fontSize: 12, color: "#CBD5E1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.city?.split(",")[0] ?? "—"}
                        </span>

                        {/* Topic */}
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#E2E8F0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.topic ?? "—"}
                        </span>

                        {/* Angle */}
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                          background: `${anglCol}18`, color: anglCol, border: `1px solid ${anglCol}30`,
                          whiteSpace: "nowrap", display: "inline-block", textAlign: "center",
                        }}>
                          {p.angle ?? "—"}
                        </span>

                        {/* Platforms */}
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {p.platforms.map(pl => {
                            const opt = PLATFORM_OPTIONS.find(o => o.value === pl);
                            return opt ? (
                              <span key={pl} style={{
                                fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
                                background: `${opt.color}18`, color: opt.color, border: `1px solid ${opt.color}30`,
                              }}>{opt.label}</span>
                            ) : null;
                          })}
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => navigate("/admin/social-publishing")}
                            style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "rgba(107,158,255,0.1)", border: "1px solid rgba(107,158,255,0.25)", color: "#6B9EFF" }}>
                            Edit
                          </button>
                          <button
                            onClick={() => publishNowMut.mutate(p.id)}
                            disabled={publishNowMut.isPending}
                            style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: publishNowMut.isPending ? "not-allowed" : "pointer", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#10B981" }}>
                            Publish
                          </button>
                          <button
                            onClick={() => { if (confirm("Delete this post?")) deletePostMut.mutate(p.id); }}
                            disabled={deletePostMut.isPending}
                            style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: deletePostMut.isPending ? "not-allowed" : "pointer", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#EF4444" }}>
                            Delete
                          </button>
                          <span style={{ fontSize: 12, color: "#334155", marginLeft: 4, userSelect: "none" }}>
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        </div>
                      </div>

                      {/* Expanded caption detail */}
                      {isExpanded && (
                        <div style={{
                          padding: "14px 20px 18px",
                          background: "rgba(0,174,239,0.03)",
                          borderTop: "1px solid rgba(0,174,239,0.08)",
                        }}>
                          {p.captionFacebook || p.captionGoogle ? (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                                  <span style={{ fontSize: 10, fontWeight: 800, color: "#6B9EFF", background: "rgba(107,158,255,0.15)", borderRadius: 8, padding: "2px 8px", border: "1px solid rgba(107,158,255,0.3)" }}>
                                    Facebook Caption
                                  </span>
                                </div>
                                <p style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
                                  {p.captionFacebook ?? p.caption}
                                </p>
                              </div>
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                                  <span style={{ fontSize: 10, fontWeight: 800, color: "#EA4335", background: "rgba(234,67,53,0.12)", borderRadius: 8, padding: "2px 8px", border: "1px solid rgba(234,67,53,0.25)" }}>
                                    Google Business Caption
                                  </span>
                                </div>
                                <p style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
                                  {p.captionGoogle ?? "—"}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Caption</div>
                              <p style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{p.caption}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>{/* end minWidth wrapper */}
              </div>{/* end overflowX:auto wrapper */}

              {queueTotal > 50 && (
                <div style={{ textAlign: "center", padding: "14px 0 4px", fontSize: 12, color: "#475569" }}>
                  Showing 50 of {queueTotal} — view all in{" "}
                  <span style={{ color: "#4A90D9", cursor: "pointer" }} onClick={() => navigate("/admin/social-publishing")}>
                    Publishing Center
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Results ── */}
        {result && (
          <div style={{ marginTop: 32 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#FFFFFF" }}>✅ {result.created} Posts Created</div>
                <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>
                  Saved as <span style={{ color: "#00AEEF" }}>{result.posts[0]?.status === "draft" ? "drafts" : "scheduled posts"}</span> in Publishing Center
                </div>
              </div>
              <button onClick={() => navigate("/admin/social-publishing")}
                style={{ background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.25)", borderRadius: 9, padding: "10px 20px", fontSize: 13.5, color: "#00AEEF", cursor: "pointer", fontWeight: 600 }}>
                View in Publishing Center →
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {result.posts.map((p, i) => {
                const anglCol = ANGLE_COLOR[p.angle] ?? "#94A3B8";
                return (
                  <div key={p.id ?? i} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 12, background: `${anglCol}18`, color: anglCol, border: `1px solid ${anglCol}33` }}>{p.angle}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0" }}>{p.topic}</span>
                      <span style={{ fontSize: 12, color: "#64748B" }}>— {p.city}</span>
                      <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#64748B" }}>{fmtDate(p.scheduledAt)}</span>
                      {p.aiError && <span style={{ fontSize: 10, color: "#F59E0B", background: "rgba(245,158,11,0.1)", padding: "2px 8px", borderRadius: 10 }}>⚠ fallback</span>}
                    </div>
                    <p style={{ fontSize: 13, color: "#CBD5E1", margin: "0 0 8px", lineHeight: 1.5 }}>{p.caption}</p>
                    {p.hashtags?.length > 0 && (
                      <p style={{ fontSize: 11, color: "#4A90D9", margin: "0 0 6px" }}>{p.hashtags.join(" ")}</p>
                    )}
                    {p.imagePrompt && (
                      <div style={{ fontSize: 11, color: "#475569", background: "rgba(255,255,255,0.03)", borderRadius: 7, padding: "6px 10px" }}>
                        📸 {p.imagePrompt}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}
