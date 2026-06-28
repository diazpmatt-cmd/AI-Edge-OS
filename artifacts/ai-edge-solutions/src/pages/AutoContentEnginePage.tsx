import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { toast } from "sonner";

type Settings = {
  clientName: string;
  serviceAreas: string[];
  topics: string[];
  frequency: string;
  postingTimes: string[];
  platforms: string[];
  approvalMode: string;
  ctaText: string;
  usedCombos: string[];
};

type GeneratedPost = {
  id: string;
  city: string;
  topic: string;
  caption: string;
  hashtags: string[];
  imagePrompt: string;
  scheduledAt: string;
  status: string;
  aiError?: string | null;
};

type GenerateResult = {
  ok: boolean;
  created: number;
  posts: GeneratedPost[];
  updatedUsedCombos: string[];
};

const FREQUENCY_OPTIONS = [
  { value: "every_day",       label: "Every day",        desc: "14 posts over 14 days" },
  { value: "every_other_day", label: "Every other day",  desc: "7 posts over 14 days"  },
  { value: "3x_week",         label: "3 times per week", desc: "6 posts over 14 days"  },
];

const APPROVAL_OPTIONS = [
  { value: "draft_only",    label: "Draft only",      desc: "All posts saved as drafts for review" },
  { value: "auto_schedule", label: "Auto schedule",   desc: "Posts saved as scheduled (recommended)" },
];

const PLATFORM_OPTIONS = [
  { value: "facebook",  label: "Facebook",                icon: "f",  color: "#6B9EFF" },
  { value: "instagram", label: "Instagram",               icon: "✦",  color: "#FF6B9D" },
  { value: "google",    label: "Google Business Profile", icon: "G",  color: "#EA4335" },
];

const DEFAULT_TIMES = ["08:00", "12:00", "17:00"];

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatScheduled(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function TagList({
  items, onRemove, onAdd, placeholder,
}: {
  items: string[];
  onRemove: (i: number) => void;
  onAdd: (val: string) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !items.includes(v)) { onAdd(v); setInput(""); }
  };
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
              marginLeft: 2,
            }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          placeholder={placeholder}
          style={{
            flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 7, padding: "7px 12px", fontSize: 13, color: "#E2E8F0", outline: "none",
          }}
        />
        <button onClick={add} style={{
          background: "rgba(0,174,239,0.15)", border: "1px solid rgba(0,174,239,0.3)",
          borderRadius: 7, padding: "7px 14px", fontSize: 13, color: "#00AEEF", cursor: "pointer",
          fontWeight: 600,
        }}>+ Add</button>
      </div>
    </div>
  );
}

export default function AutoContentEnginePage() {
  const authFetch = useApiFetch();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const [settings, setSettings] = useState<Settings>({
    clientName: "Bed Bugs & Beyond",
    serviceAreas: [],
    topics: [],
    frequency: "every_other_day",
    postingTimes: [...DEFAULT_TIMES],
    platforms: ["facebook"],
    approvalMode: "auto_schedule",
    ctaText: "Call Now \u2014 (251) 324-9090",
    usedCombos: [],
  });

  const [newTime, setNewTime] = useState("08:00");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const { isLoading } = useQuery<Settings>({
    queryKey: ["auto-content-settings"],
    queryFn: () => authFetch<Settings>("/auto-content/settings"),
    onSuccess: (data) => setSettings(data),
  } as any);

  const saveMut = useMutation({
    mutationFn: (s: Settings) => authFetch("/auto-content/settings", {
      method: "PUT",
      body: JSON.stringify(s),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auto-content-settings"] });
      toast.success("Settings saved.");
    },
    onError: () => toast.error("Failed to save settings."),
  });

  const set = <K extends keyof Settings>(key: K, val: Settings[K]) =>
    setSettings(prev => ({ ...prev, [key]: val }));

  const togglePlatform = (p: string) =>
    set("platforms", settings.platforms.includes(p)
      ? settings.platforms.filter(x => x !== p)
      : [...settings.platforms, p]);

  const addTime = () => {
    if (newTime && !settings.postingTimes.includes(newTime)) {
      const sorted = [...settings.postingTimes, newTime].sort();
      set("postingTimes", sorted);
    }
  };

  const removeTime = (t: string) =>
    set("postingTimes", settings.postingTimes.filter(x => x !== t));

  const handleGenerate = async () => {
    if (!settings.serviceAreas.length || !settings.topics.length) {
      toast.error("Add at least one service area and one topic before generating.");
      return;
    }
    if (!settings.platforms.length) {
      toast.error("Select at least one platform.");
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const res = await authFetch<GenerateResult>("/auto-content/generate", {
        method: "POST",
        body: JSON.stringify(settings),
      });
      setResult(res);
      setSettings(prev => ({ ...prev, usedCombos: res.updatedUsedCombos }));
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      toast.success(`${res.created} posts created in Publishing Center!`);
    } catch (err: any) {
      toast.error(err?.message ?? "Generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const totalCombos = settings.serviceAreas.length * settings.topics.length;
  const usedCount = settings.usedCombos.length;
  const progressPct = totalCombos > 0 ? Math.min(100, Math.round((usedCount / totalCombos) * 100)) : 0;

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 7, padding: "9px 12px", fontSize: 13.5, color: "#E2E8F0", outline: "none",
    width: "100%", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.5px",
    marginBottom: 6, display: "block",
  };
  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14, padding: 24, marginBottom: 20,
  };

  return (
    <AppShell>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: "#4A90D9", marginBottom: 6, fontWeight: 600, letterSpacing: "0.3px" }}>
            <span
              style={{ cursor: "pointer", opacity: 0.7 }}
              onClick={() => navigate("/admin/social-publishing")}
            >Publishing Center</span>
            <span style={{ margin: "0 6px", opacity: 0.4 }}>›</span>
            Auto Content Engine
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: "#FFFFFF", margin: 0, letterSpacing: "-0.3px" }}>
                🤖 Auto Content Engine
              </h1>
              <p style={{ fontSize: 14, color: "#64748B", margin: "4px 0 0" }}>
                Generate AI-written local posts from your service areas, pest topics, and schedule.
              </p>
            </div>
            <button
              onClick={() => saveMut.mutate(settings)}
              disabled={saveMut.isPending}
              style={{
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 9, padding: "10px 20px", fontSize: 13.5, color: "#CBD5E1",
                cursor: "pointer", fontWeight: 600,
              }}
            >
              {saveMut.isPending ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div style={{ color: "#4A90D9", fontSize: 14, padding: "40px 0", textAlign: "center" }}>Loading settings…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>

            {/* ── Left column: Settings ── */}
            <div>

              {/* Client */}
              <div style={cardStyle}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#E2E8F0", marginBottom: 16 }}>Client</div>
                <label style={labelStyle}>Business Name</label>
                <input
                  value={settings.clientName}
                  onChange={e => set("clientName", e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. Bed Bugs & Beyond"
                />
                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>Default CTA</label>
                  <input
                    value={settings.ctaText}
                    onChange={e => set("ctaText", e.target.value)}
                    style={inputStyle}
                    placeholder="e.g. Call Now — (251) 324-9090"
                  />
                </div>
              </div>

              {/* Service Areas */}
              <div style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#E2E8F0" }}>Service Areas</div>
                  <span style={{ fontSize: 12, color: "#64748B" }}>{settings.serviceAreas.length} cities</span>
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#E2E8F0" }}>Service / Pest Topics</div>
                  <span style={{ fontSize: 12, color: "#64748B" }}>{settings.topics.length} topics</span>
                </div>
                <TagList
                  items={settings.topics}
                  onRemove={i => set("topics", settings.topics.filter((_, idx) => idx !== i))}
                  onAdd={v => set("topics", [...settings.topics, v])}
                  placeholder="e.g. Termites"
                />
              </div>

              {/* Schedule */}
              <div style={cardStyle}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#E2E8F0", marginBottom: 16 }}>Posting Schedule</div>

                <label style={labelStyle}>Frequency</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {FREQUENCY_OPTIONS.map(opt => (
                    <label key={opt.value} style={{
                      display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer",
                      background: settings.frequency === opt.value ? "rgba(0,174,239,0.08)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${settings.frequency === opt.value ? "rgba(0,174,239,0.3)" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: 9, padding: "10px 14px",
                    }}>
                      <input
                        type="radio"
                        name="frequency"
                        value={opt.value}
                        checked={settings.frequency === opt.value}
                        onChange={() => set("frequency", opt.value)}
                        style={{ marginTop: 2, accentColor: "#00AEEF" }}
                      />
                      <div>
                        <div style={{ fontSize: 13.5, color: "#E2E8F0", fontWeight: 600 }}>{opt.label}</div>
                        <div style={{ fontSize: 12, color: "#64748B", marginTop: 1 }}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>

                <label style={labelStyle}>Posting Times (rotate in order)</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {settings.postingTimes.map(t => (
                    <span key={t} style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      background: "rgba(0,174,239,0.10)", border: "1px solid rgba(0,174,239,0.25)",
                      borderRadius: 20, padding: "5px 12px", fontSize: 13, color: "#00AEEF", fontWeight: 600,
                    }}>
                      {formatTime(t)}
                      {settings.postingTimes.length > 1 && (
                        <button onClick={() => removeTime(t)} style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: "rgba(0,174,239,0.5)", fontSize: 15, lineHeight: 1, padding: 0,
                        }}>×</button>
                      )}
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="time"
                    value={newTime}
                    onChange={e => setNewTime(e.target.value)}
                    style={{ ...inputStyle, width: "auto", flex: 1 }}
                  />
                  <button onClick={addTime} style={{
                    background: "rgba(0,174,239,0.15)", border: "1px solid rgba(0,174,239,0.3)",
                    borderRadius: 7, padding: "7px 14px", fontSize: 13, color: "#00AEEF", cursor: "pointer", fontWeight: 600,
                  }}>+ Add Time</button>
                </div>
              </div>

              {/* Platforms */}
              <div style={cardStyle}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#E2E8F0", marginBottom: 16 }}>Platforms</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {PLATFORM_OPTIONS.map(p => {
                    const active = settings.platforms.includes(p.value);
                    return (
                      <button
                        key={p.value}
                        onClick={() => togglePlatform(p.value)}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
                          background: active ? `rgba(${p.color === "#6B9EFF" ? "107,158,255" : p.color === "#FF6B9D" ? "255,107,157" : "234,67,53"},0.12)` : "rgba(255,255,255,0.04)",
                          border: `1px solid ${active ? p.color : "rgba(255,255,255,0.08)"}`,
                          borderRadius: 10, cursor: "pointer",
                          color: active ? p.color : "#64748B", fontSize: 13.5, fontWeight: 600,
                          transition: "all 0.15s",
                        }}
                      >
                        <span style={{
                          width: 22, height: 22, borderRadius: "50%",
                          background: active ? `${p.color}22` : "rgba(255,255,255,0.06)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 900, color: active ? p.color : "#64748B",
                        }}>{p.icon}</span>
                        {p.label}
                        {active && <span style={{ fontSize: 12, opacity: 0.7 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Approval Mode */}
              <div style={cardStyle}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#E2E8F0", marginBottom: 16 }}>Approval Mode</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {APPROVAL_OPTIONS.map(opt => (
                    <label key={opt.value} style={{
                      display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer",
                      background: settings.approvalMode === opt.value ? "rgba(0,174,239,0.08)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${settings.approvalMode === opt.value ? "rgba(0,174,239,0.3)" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: 9, padding: "10px 14px",
                    }}>
                      <input
                        type="radio"
                        name="approvalMode"
                        value={opt.value}
                        checked={settings.approvalMode === opt.value}
                        onChange={() => set("approvalMode", opt.value)}
                        style={{ marginTop: 2, accentColor: "#00AEEF" }}
                      />
                      <div>
                        <div style={{ fontSize: 13.5, color: "#E2E8F0", fontWeight: 600 }}>{opt.label}</div>
                        <div style={{ fontSize: 12, color: "#64748B", marginTop: 1 }}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

            </div>

            {/* ── Right column: Generate + stats ── */}
            <div style={{ position: "sticky", top: 24 }}>

              {/* Combo progress */}
              <div style={{ ...cardStyle, marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0", marginBottom: 10 }}>Combo Coverage</div>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>
                  {usedCount} of {totalCombos} city × topic combinations used
                </div>
                <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 100, height: 6, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 100,
                    width: `${progressPct}%`,
                    background: "linear-gradient(90deg, #00AEEF, #0070B8)",
                    transition: "width 0.4s",
                  }} />
                </div>
                {totalCombos > 0 && (
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 6 }}>
                    {totalCombos - usedCount} remaining before cycle resets
                  </div>
                )}
                {usedCount > 0 && (
                  <button
                    onClick={() => set("usedCombos", [])}
                    style={{
                      marginTop: 10, background: "none", border: "none", cursor: "pointer",
                      fontSize: 11.5, color: "#4A90D9", padding: 0, fontWeight: 600,
                    }}
                  >↺ Reset combo history</button>
                )}
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  width: "100%", padding: "16px 0",
                  background: generating
                    ? "rgba(0,174,239,0.2)"
                    : "linear-gradient(135deg, #0070B8 0%, #00AEEF 100%)",
                  border: "none", borderRadius: 12, cursor: generating ? "not-allowed" : "pointer",
                  fontSize: 15.5, fontWeight: 800, color: "#FFFFFF",
                  letterSpacing: "-0.2px", marginBottom: 12,
                  boxShadow: generating ? "none" : "0 4px 20px rgba(0,174,239,0.3)",
                  transition: "all 0.2s",
                }}
              >
                {generating ? "⏳ Generating…" : "⚡ Generate Next 14 Days"}
              </button>

              <p style={{ fontSize: 11.5, color: "#475569", textAlign: "center", margin: "0 0 20px" }}>
                Creates {FREQUENCY_OPTIONS.find(f => f.value === settings.frequency)?.desc.split(" ")[0] ?? "?"} posts as{" "}
                {settings.approvalMode === "draft_only" ? "drafts" : "scheduled"} in Publishing Center
              </p>

              {/* Info card */}
              <div style={{
                background: "rgba(0,174,239,0.06)", border: "1px solid rgba(0,174,239,0.15)",
                borderRadius: 10, padding: "14px 16px", fontSize: 12.5, color: "#7DBFDF", lineHeight: 1.6,
              }}>
                <div style={{ fontWeight: 700, color: "#00AEEF", marginBottom: 6 }}>How it works</div>
                AI generates unique captions for each city × topic combination. Posts are created with your scheduled times rotating automatically. Duplicate combos are avoided until all have been used, then the cycle resets.
              </div>
            </div>

          </div>
        )}

        {/* ── Results ── */}
        {result && (
          <div style={{ marginTop: 32 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 20, flexWrap: "wrap", gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#FFFFFF" }}>
                  ✅ {result.created} Posts Created
                </div>
                <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>
                  Saved to Publishing Center as{" "}
                  <span style={{ color: "#00AEEF" }}>
                    {result.posts[0]?.status === "draft" ? "drafts" : "scheduled posts"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => navigate("/admin/social-publishing")}
                style={{
                  background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.3)",
                  borderRadius: 9, padding: "10px 20px", fontSize: 13.5, color: "#00AEEF",
                  cursor: "pointer", fontWeight: 700,
                }}
              >View in Publishing Center →</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {result.posts.map((post, i) => (
                <div key={post.id ?? i} style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 12, padding: "16px 20px",
                  borderLeft: post.aiError ? "3px solid #F59E0B" : "3px solid rgba(0,174,239,0.4)",
                }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{
                      background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.3)",
                      borderRadius: 5, padding: "2px 9px", fontSize: 11.5, color: "#00AEEF", fontWeight: 700,
                    }}>{post.city}</span>
                    <span style={{
                      background: "rgba(192,192,192,0.08)", border: "1px solid rgba(192,192,192,0.15)",
                      borderRadius: 5, padding: "2px 9px", fontSize: 11.5, color: "#C0C0C0", fontWeight: 600,
                    }}>{post.topic}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11.5, color: "#64748B" }}>
                      {formatScheduled(post.scheduledAt)}
                    </span>
                    <span style={{
                      background: post.status === "scheduled" ? "rgba(0,174,239,0.10)" : "rgba(148,163,184,0.10)",
                      border: `1px solid ${post.status === "scheduled" ? "rgba(0,174,239,0.25)" : "rgba(148,163,184,0.2)"}`,
                      borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700,
                      color: post.status === "scheduled" ? "#00AEEF" : "#94A3B8",
                      textTransform: "uppercase", letterSpacing: "0.3px",
                    }}>{post.status}</span>
                  </div>
                  <p style={{ fontSize: 13, color: "#CBD5E1", margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {post.caption}
                  </p>
                  {post.hashtags?.length > 0 && (
                    <p style={{ fontSize: 12, color: "#4A90D9", margin: "6px 0 0", lineHeight: 1.5 }}>
                      {post.hashtags.join(" ")}
                    </p>
                  )}
                  {post.imagePrompt && (
                    <div style={{
                      marginTop: 8, fontSize: 11.5, color: "#475569", fontStyle: "italic",
                      borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 6,
                    }}>
                      📷 {post.imagePrompt}
                    </div>
                  )}
                  {post.aiError && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#F59E0B" }}>
                      ⚠ Used fallback caption (AI error: {post.aiError})
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}
