import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";

// ── API types (only fields we use) ────────────────────────────────────────────
interface CIMetrics {
  total_calls: number; missed_calls: number; transferred_calls: number;
  sms_conversations: number; leads_captured: number; recovery_rate: number | null;
}
interface CIActivity {
  id: string; timestamp: string; caller_number: string;
  call_type: string; outcome: string; duration_secs: number | null;
}
interface CIResponse { metrics: CIMetrics; recent_activity: CIActivity[]; }

interface Lead {
  id: string; phone: string; customerName: string | null; message: string | null;
  eventType: string; status: string; createdAt: string;
}
interface LeadsResponse { leads: Lead[]; stats: { total: number; active: number; thisMonth: number }; }

interface SocialPost { id: string; status: string; platforms: string; published_at: string | null; }

// ── Helpers ────────────────────────────────────────────────────────────────────
function today(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function fmtPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return raw;
}

// ── Badge components ───────────────────────────────────────────────────────────
function LiveBadge() {
  return (
    <span style={{
      padding: "2px 7px", borderRadius: 4, fontSize: 9.5, fontWeight: 800,
      background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.35)",
      color: "#22C55E", letterSpacing: "0.4px", flexShrink: 0,
    }}>🟢 LIVE</span>
  );
}
function DemoBadge() {
  return (
    <span style={{
      padding: "2px 7px", borderRadius: 4, fontSize: 9.5, fontWeight: 800,
      background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)",
      color: "#FBBF24", letterSpacing: "0.4px", flexShrink: 0,
    }}>🟡 DEMO</span>
  );
}

// ── Business Health SVG Ring ───────────────────────────────────────────────────
function HealthRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? "#22C55E" : score >= 60 ? "#FBBF24" : "#F87171";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={10} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1s ease" }} />
      <text x={size/2} y={size/2 + 1} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size * 0.22} fontWeight={900}
        style={{ transform: `rotate(90deg) translateX(0)` }}>
      </text>
    </svg>
  );
}

function HealthScore({ score }: { score: number }) {
  const color = score >= 80 ? "#22C55E" : score >= 60 ? "#FBBF24" : "#F87171";
  const label = score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 55 ? "Fair" : "Needs Attention";
  return (
    <div style={{ position: "relative", width: 120, height: 120, flexShrink: 0 }}>
      <HealthRing score={score} size={120} />
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

// ── Agent Card ─────────────────────────────────────────────────────────────────
function AgentCard({ emoji, name, title, color, metrics, recommendation, live }: {
  emoji: string; name: string; title: string; color: string;
  metrics: { label: string; value: string | number }[];
  recommendation: string; live: boolean;
}) {
  return (
    <div style={{
      padding: "16px 18px", borderRadius: 14,
      background: "rgba(255,255,255,0.02)", border: `1px solid ${color}22`,
      display: "flex", flexDirection: "column", gap: 12,
      borderTop: `2px solid ${color}55`,
    }}>
      {/* Agent header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
            background: `linear-gradient(135deg, ${color}22 0%, ${color}0A 100%)`,
            border: `1.5px solid ${color}44`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}>{emoji}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#E2E8F0", lineHeight: 1 }}>{name}</div>
            <div style={{ fontSize: 10.5, color: color, fontWeight: 600, marginTop: 2 }}>{title}</div>
          </div>
        </div>
        {live ? <LiveBadge /> : <DemoBadge />}
      </div>

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(metrics.length, 3)}, 1fr)`, gap: 8 }}>
        {metrics.map((m, i) => (
          <div key={i} style={{
            padding: "8px 10px", borderRadius: 9,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 18, fontWeight: 900, color, lineHeight: 1 }}>{m.value}</div>
            <div style={{ fontSize: 9.5, color: "#475569", marginTop: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Recommendation */}
      <div style={{
        padding: "9px 12px", borderRadius: 9,
        background: `${color}08`, border: `1px solid ${color}1A`,
        fontSize: 11.5, color: "#94A3B8", lineHeight: 1.5,
      }}>
        <span style={{ color, fontWeight: 700 }}>💡 Rec: </span>{recommendation}
      </div>
    </div>
  );
}

// ── Apollos Voice Card ────────────────────────────────────────────────────────
const APOLLOS_SCRIPT = [
  "Hi, I'm Apollos. Good morning, Matt. Welcome back to AI Edge OS.",
  "While you were away, your AI team continued working on your business.",
  "Would you like your morning briefing?",
];

const ACCENT_OPTIONS = [
  { id: "british",    label: "British Executive",   lang: "en-GB", pitch: 0.92, rate: 0.98 },
  { id: "american",   label: "American Professional",lang: "en-US", pitch: 1.0,  rate: 0.92 },
  { id: "australian", label: "Australian Executive", lang: "en-AU", pitch: 0.98, rate: 0.90 },
];

function ApollosCard() {
  const [playing, setPlaying]           = useState(false);
  const [accentId, setAccentId]         = useState("british");
  const [lineIndex, setLineIndex]       = useState<number | null>(null);
  const [supported, setSupported]       = useState(true);
  const [showScript, setShowScript]     = useState(false);
  const utterQueueRef                   = useRef<SpeechSynthesisUtterance[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
    }
  }, []);

  function stop() {
    window.speechSynthesis?.cancel();
    setPlaying(false);
    setLineIndex(null);
    utterQueueRef.current = [];
  }

  function play() {
    if (!supported) { setShowScript(true); return; }
    stop();
    const accent = ACCENT_OPTIONS.find(a => a.id === accentId) ?? ACCENT_OPTIONS[0];
    const voices = window.speechSynthesis.getVoices();

    const PREFERRED_BRITISH_MALE = ["Daniel", "Google UK English Male", "Microsoft Ryan Online (Natural)", "Microsoft George"];
    const isMale = (v: SpeechSynthesisVoice) =>
      v.name.toLowerCase().includes("male") ||
      PREFERRED_BRITISH_MALE.some(n => v.name.toLowerCase().includes(n.toLowerCase()));

    // Priority 1: preferred British male by exact name order
    let match: SpeechSynthesisVoice | null =
      PREFERRED_BRITISH_MALE.reduce<SpeechSynthesisVoice | null>((found, name) => {
        if (found) return found;
        return voices.find(v => v.lang.startsWith(accent.lang) && v.name.toLowerCase().includes(name.toLowerCase())) ?? null;
      }, null);

    // Priority 2: any British male voice (lang match + male heuristic)
    if (!match) match = voices.find(v => v.lang.startsWith(accent.lang) && isMale(v)) ?? null;

    // Priority 3: any English male voice
    if (!match) match = voices.find(v => v.lang.startsWith("en") && isMale(v)) ?? null;

    // Priority 4: any voice matching the accent lang (original fallback)
    if (!match) match = voices.find(v => v.lang.startsWith(accent.lang)) ?? null;

    utterQueueRef.current = APOLLOS_SCRIPT.map((line, i) => {
      const u = new SpeechSynthesisUtterance(line);
      u.lang  = accent.lang;
      u.pitch = accent.pitch;
      u.rate  = accent.rate;
      if (match) u.voice = match;
      u.onstart = () => { setPlaying(true); setLineIndex(i); };
      u.onend   = () => {
        if (i === APOLLOS_SCRIPT.length - 1) {
          setPlaying(false);
          setLineIndex(null);
        } else {
          // 350ms pause between sentences before queuing the next
          setTimeout(() => {
            const next = utterQueueRef.current[i + 1];
            if (next) window.speechSynthesis.speak(next);
          }, 350);
        }
      };
      return u;
    });

    // Speak only the first utterance; onend chains the rest
    window.speechSynthesis.speak(utterQueueRef.current[0]);
    setPlaying(true);
    setLineIndex(0);
  }

  const accent = ACCENT_OPTIONS.find(a => a.id === accentId)!;

  return (
    <div style={{
      marginBottom: 24,
      background: "linear-gradient(135deg, #080E1F 0%, #0A1228 50%, #080E1F 100%)",
      border: "1px solid rgba(0,174,239,0.25)",
      borderRadius: 16,
      padding: "22px 26px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Glow */}
      <div style={{
        position: "absolute", top: -40, left: -40, width: 200, height: 200,
        borderRadius: "50%", background: "radial-gradient(circle, rgba(0,174,239,0.08) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 18, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Avatar */}
          <div style={{
            width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
            background: "linear-gradient(135deg, #00AEEF22 0%, #06B6D408 100%)",
            border: "2px solid rgba(0,174,239,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, position: "relative",
          }}>
            🎙️
            {playing && (
              <span style={{
                position: "absolute", bottom: 0, right: 0,
                width: 14, height: 14, borderRadius: "50%",
                background: "#22C55E", border: "2px solid #080E1F",
                animation: "pulse 1.2s infinite",
              }} />
            )}
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#E2E8F0", letterSpacing: "-0.3px" }}>Apollos</div>
            <div style={{ fontSize: 11, color: "#00AEEF", fontWeight: 600, marginTop: 1 }}>AI Voice Executive · {accent.label}</div>
          </div>
        </div>

        {/* Coming Soon badges */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { label: "ElevenLabs HD", icon: "🔊" },
            { label: "OpenAI Voice",  icon: "🤖" },
            { label: "MP3 Export",    icon: "📁" },
          ].map(b => (
            <div key={b.label} style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.8px",
              background: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.18)",
              color: "#64748B", borderRadius: 10, padding: "3px 9px",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              {b.icon} {b.label} · <span style={{ color: "#FBBF24" }}>COMING SOON</span>
            </div>
          ))}
        </div>
      </div>

      {/* Script lines */}
      <div style={{ marginBottom: 18, display: "flex", flexDirection: "column", gap: 8 }}>
        {APOLLOS_SCRIPT.map((line, i) => (
          <div key={i} style={{
            padding: "10px 14px", borderRadius: 10,
            background: lineIndex === i ? "rgba(0,174,239,0.10)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${lineIndex === i ? "rgba(0,174,239,0.35)" : "rgba(255,255,255,0.05)"}`,
            display: "flex", alignItems: "flex-start", gap: 10,
            transition: "all 0.3s ease",
          }}>
            <span style={{
              fontSize: 10, fontWeight: 800, color: lineIndex === i ? "#00AEEF" : "#334155",
              background: lineIndex === i ? "rgba(0,174,239,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${lineIndex === i ? "rgba(0,174,239,0.3)" : "rgba(255,255,255,0.06)"}`,
              borderRadius: 6, padding: "1px 6px", flexShrink: 0, marginTop: 1,
              transition: "all 0.3s ease",
            }}>{i + 1}</span>
            <span style={{
              fontSize: 13, color: lineIndex === i ? "#E2E8F0" : "#64748B",
              fontStyle: "italic", lineHeight: 1.55,
              transition: "color 0.3s ease",
            }}>"{line}"</span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {/* Play / Stop button */}
        {!playing ? (
          <button onClick={play} style={{
            background: "linear-gradient(135deg, #00AEEF 0%, #06B6D4 100%)",
            border: "none", borderRadius: 10, padding: "10px 22px",
            fontSize: 13, fontWeight: 700, color: "#030612", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 7, letterSpacing: "0.2px",
            boxShadow: "0 4px 14px rgba(0,174,239,0.3)",
          }}>
            ▶ {supported ? "Play Apollos Intro" : "Show Script"}
          </button>
        ) : (
          <button onClick={stop} style={{
            background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.35)",
            borderRadius: 10, padding: "10px 22px",
            fontSize: 13, fontWeight: 700, color: "#F87171", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 7,
          }}>
            ■ Stop
          </button>
        )}

        {/* Accent selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>Accent:</span>
          <div style={{ display: "flex", gap: 6 }}>
            {ACCENT_OPTIONS.map(a => (
              <button key={a.id} onClick={() => { if (playing) stop(); setAccentId(a.id); }} style={{
                fontSize: 10, fontWeight: 700, padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                border: `1px solid ${accentId === a.id ? "rgba(0,174,239,0.55)" : "rgba(255,255,255,0.08)"}`,
                background: accentId === a.id ? "rgba(0,174,239,0.12)" : "rgba(255,255,255,0.02)",
                color: accentId === a.id ? "#00AEEF" : "#475569",
                transition: "all 0.15s",
              }}>{a.label}</button>
            ))}
          </div>
        </div>

        {/* Script toggle */}
        <button onClick={() => setShowScript(s => !s)} style={{
          fontSize: 10, fontWeight: 700, padding: "5px 10px", borderRadius: 8, cursor: "pointer",
          border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)",
          color: "#475569", marginLeft: "auto",
        }}>
          {showScript ? "Hide Script" : "Show Script"} 📄
        </button>
      </div>

      {/* Script text fallback */}
      {(showScript || !supported) && (
        <div style={{
          marginTop: 14, padding: "14px 16px", borderRadius: 10,
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        }}>
          {!supported && (
            <div style={{ fontSize: 10, color: "#FBBF24", fontWeight: 700, marginBottom: 8 }}>
              ⚠️ speechSynthesis not available in this browser — showing script only
            </div>
          )}
          {APOLLOS_SCRIPT.map((line, i) => (
            <div key={i} style={{ fontSize: 13, color: "#94A3B8", fontStyle: "italic", marginBottom: 6, lineHeight: 1.6 }}>
              <span style={{ color: "#475569" }}>[{i + 1}]</span> "{line}"
            </div>
          ))}
        </div>
      )}

      {/* Pulse animation */}
      <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.3)} }`}</style>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function MorningBriefPage() {
  const apiFetch = useApiFetch();

  const ciQuery = useQuery<CIResponse>({
    queryKey: ["morning-ci"],
    queryFn:  () => apiFetch("/api/call-intelligence?period=30days"),
    staleTime: 60_000, retry: 1,
  });
  const leadsQuery = useQuery<LeadsResponse>({
    queryKey: ["morning-leads"],
    queryFn:  () => apiFetch("/api/leads"),
    staleTime: 60_000, retry: 1,
  });
  const postsQuery = useQuery<SocialPost[] | { posts: SocialPost[] }>({
    queryKey: ["morning-posts"],
    queryFn:  () => apiFetch("/api/social-posts"),
    staleTime: 60_000, retry: 1,
  });

  const ci      = ciQuery.data;
  const leads   = leadsQuery.data;
  const rawPosts = postsQuery.data;
  const posts: SocialPost[] = rawPosts
    ? (Array.isArray(rawPosts) ? rawPosts : (rawPosts as any).posts ?? [])
    : [];

  const loading = ciQuery.isLoading || leadsQuery.isLoading || postsQuery.isLoading;

  // ── Live flags ───────────────────────────────────────────────────────────────
  const hasLiveCalls  = (ci?.metrics.total_calls ?? 0) > 0;
  const hasLiveLeads  = (leads?.stats.total ?? 0) > 0;
  const hasLivePosts  = posts.length > 0;

  // ── Derived live values ──────────────────────────────────────────────────────
  const callsAnswered  = hasLiveCalls ? (ci!.metrics.total_calls - ci!.metrics.missed_calls) : 0;
  const missedCalls    = hasLiveCalls ? ci!.metrics.missed_calls : 0;
  const totalLeads     = hasLiveLeads ? leads!.stats.total : 0;
  const activeLeads    = hasLiveLeads ? leads!.stats.active : 0;
  const publishedPosts = hasLivePosts ? posts.filter(p => p.status === "published").length : 0;
  const draftPosts     = hasLivePosts ? posts.filter(p => p.status === "draft").length : 0;

  // Business health score (derived from live signals)
  const healthScore = Math.min(100, 72
    + (hasLiveCalls  ? 8  : 0)
    + (hasLiveLeads  ? 8  : 0)
    + (hasLivePosts  ? 7  : 0)
  );

  // ── Hot lead for top priority ────────────────────────────────────────────────
  const hotLead = hasLiveLeads
    ? leads!.leads.find(l => l.status === "new") ?? null
    : null;

  // ── Attention items ──────────────────────────────────────────────────────────
  const attentionItems: { icon: string; text: string; color: string; live: boolean }[] = [];
  if (hasLiveCalls && missedCalls > 0) {
    attentionItems.push({
      icon: "📞", color: "#F87171", live: true,
      text: `${missedCalls} missed call${missedCalls > 1 ? "s" : ""} — no callback logged yet`,
    });
  }
  if (hasLiveLeads && activeLeads > 0) {
    attentionItems.push({
      icon: "🔥", color: "#FBBF24", live: true,
      text: `${activeLeads} lead${activeLeads > 1 ? "s" : ""} in 'new' status — needs follow-up today`,
    });
  }
  if (hasLivePosts && draftPosts > 0) {
    attentionItems.push({
      icon: "✏️", color: "#60A5FA", live: true,
      text: `${draftPosts} social post${draftPosts > 1 ? "s" : ""} waiting to be published`,
    });
  }
  const shownAttention = attentionItems.slice(0, 3);

  // ── Agent configs ────────────────────────────────────────────────────────────
  const emmaMetrics = hasLiveCalls
    ? [
        { label: "Calls Answered", value: callsAnswered },
        { label: "Missed Calls",   value: missedCalls },
        { label: "Leads Captured", value: ci!.metrics.leads_captured },
      ]
    : [
        { label: "Calls Answered",  value: "—" },
        { label: "Missed Recovered",value: "—" },
        { label: "Leads Captured",  value: "—" },
      ];

  const emmaRec = hasLiveCalls && missedCalls > 0
    ? `${missedCalls} caller${missedCalls > 1 ? "s" : ""} reached voicemail — send a follow-up text today`
    : hasLiveCalls
    ? "All recent calls handled — no missed calls to recover"
    : "Enable textback on missed calls to recover leads automatically";

  const masonMetrics = hasLiveLeads
    ? [
        { label: "Total Leads",  value: totalLeads },
        { label: "Active",       value: activeLeads },
        { label: "This Month",   value: leads!.stats.thisMonth },
      ]
    : [
        { label: "Hot Leads",  value: "—" },
        { label: "Pipeline",   value: "—" },
        { label: "This Month", value: "—" },
      ];

  const masonRec = hasLiveLeads && hotLead
    ? `Follow up with ${fmtPhone(hotLead.phone)} — new lead since ${new Date(hotLead.createdAt).toLocaleDateString()}`
    : hasLiveLeads
    ? "All active leads contacted — focus on closing"
    : "Wire GorillaDesk sync to see live revenue pipeline";

  const miaMetrics = hasLivePosts
    ? [
        { label: "Published",  value: publishedPosts },
        { label: "Drafts",     value: draftPosts },
        { label: "Platforms",  value: "FB + IG" },
      ]
    : [
        { label: "Posts Published", value: "—" },
        { label: "Reach",           value: "—" },
        { label: "Engagement",      value: "—" },
      ];

  const miaRec = hasLivePosts && draftPosts > 0
    ? `${draftPosts} draft${draftPosts > 1 ? "s" : ""} waiting — review and publish before noon for peak engagement`
    : hasLivePosts
    ? "All posts published — good cadence maintained"
    : "Generate this week's social content from the Auto Content Engine";

  return (
    <AppShell>
      {/* ── Apollos Voice Card ────────────────────────────────────────────────── */}
      <ApollosCard />

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        {/* Greeting row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 20, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: "#E2E8F0", lineHeight: 1.1 }}>
                ☀️ Good Morning, Matt
              </h1>
              {loading && <span style={{ fontSize: 12, color: "#60A5FA" }}>⟳ Loading live data…</span>}
            </div>
            <div style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>{today()}</div>

            {/* AI Team status */}
            <div style={{
              marginTop: 14, padding: "10px 14px", borderRadius: 10, display: "inline-flex",
              alignItems: "center", gap: 10,
              background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)",
            }}>
              <span style={{ fontSize: 16 }}>🟢</span>
              <span style={{ fontSize: 12.5, color: "#86EFAC", fontWeight: 600 }}>
                Your AI team worked while you slept — here's what happened overnight.
              </span>
            </div>
          </div>

          {/* Business Health ring */}
          <div style={{
            padding: "16px 20px", borderRadius: 16,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px" }}>
              Business Health
            </div>
            <HealthScore score={healthScore} />
            <div style={{ fontSize: 11, color: "#64748B", textAlign: "center", maxWidth: 110, lineHeight: 1.4 }}>
              Based on {[hasLiveCalls && "calls", hasLiveLeads && "leads", hasLivePosts && "content"].filter(Boolean).join(", ") || "demo baseline"}
            </div>
          </div>
        </div>

        {/* Dashboard Health bar */}
        <div style={{
          padding: "9px 14px", borderRadius: 10,
          background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.5px" }}>Dashboard Health:</span>
          <span style={{ fontSize: 11, color: hasLiveCalls  ? "#22C55E" : "#FBBF24", fontWeight: 600 }}>{hasLiveCalls  ? "🟢" : "🟡"} Emma {hasLiveCalls ? "LIVE" : "DEMO"}</span>
          <span style={{ fontSize: 11, color: hasLiveLeads  ? "#22C55E" : "#FBBF24", fontWeight: 600 }}>{hasLiveLeads  ? "🟢" : "🟡"} Mason {hasLiveLeads ? "LIVE" : "DEMO"}</span>
          <span style={{ fontSize: 11, color: hasLivePosts  ? "#22C55E" : "#FBBF24", fontWeight: 600 }}>{hasLivePosts  ? "🟢" : "🟡"} Mia {hasLivePosts ? "LIVE" : "DEMO"}</span>
          <span style={{ fontSize: 11, color: "#FBBF24", fontWeight: 600 }}>🟡 Alex DEMO</span>
          <span style={{ fontSize: 11, color: "#FBBF24", fontWeight: 600 }}>🟡 Ava DEMO</span>
          <span style={{ fontSize: 11, color: "#FBBF24", fontWeight: 600 }}>🟡 Olivia DEMO</span>
          <span style={{ fontSize: 11, color: hasLiveCalls || hasLiveLeads ? "#22C55E" : "#FBBF24", fontWeight: 600 }}>
            {hasLiveCalls || hasLiveLeads ? "🟢" : "🟡"} Riley {hasLiveCalls || hasLiveLeads ? "LIVE" : "DEMO"}
          </span>
        </div>
      </div>

      {/* ── AI Executive Team ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#00AEEF", marginBottom: 14 }}>
          🤝 AI Executive Team — Overnight Report
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>

          {/* Emma */}
          <AgentCard
            emoji="👋" name="Emma" title="AI Receptionist" color="#00AEEF" live={hasLiveCalls}
            metrics={emmaMetrics}
            recommendation={emmaRec}
          />

          {/* Mason */}
          <AgentCard
            emoji="💰" name="Mason" title="Sales Director" color="#22C55E" live={hasLiveLeads}
            metrics={masonMetrics}
            recommendation={masonRec}
          />

          {/* Mia */}
          <AgentCard
            emoji="📣" name="Mia" title="Marketing Director" color="#F472B6" live={hasLivePosts}
            metrics={miaMetrics}
            recommendation={miaRec}
          />

          {/* Alex — DEMO */}
          <AgentCard
            emoji="🌎" name="Alex" title="SEO Director" color="#34D399" live={false}
            metrics={[
              { label: "Keywords Ranked", value: 47 },
              { label: "Avg Position",    value: 14.2 },
              { label: "Visibility",      value: "↑ 6%" },
            ]}
            recommendation="Target 'bed bug treatment Baldwin County' — high intent, low competition"
          />

          {/* Ava — DEMO */}
          <AgentCard
            emoji="🎨" name="Ava" title="Creative Director" color="#A78BFA" live={false}
            metrics={[
              { label: "Graphics Ready",  value: 3 },
              { label: "Videos",          value: 1 },
              { label: "Needs Approval",  value: 2 },
            ]}
            recommendation="Two new social graphics ready for review — approve before Mia schedules this week"
          />

          {/* Olivia — DEMO */}
          <AgentCard
            emoji="⭐" name="Olivia" title="Customer Experience" color="#FBBF24" live={false}
            metrics={[
              { label: "Google Reviews",  value: "4.8★" },
              { label: "Review Opps",     value: 3 },
              { label: "Response Rate",   value: "92%" },
            ]}
            recommendation="3 completed jobs ready for review requests — send ask via text today"
          />

          {/* Riley */}
          <AgentCard
            emoji="📊" name="Riley" title="Business Intelligence" color="#60A5FA"
            live={hasLiveCalls || hasLiveLeads}
            metrics={
              hasLiveCalls || hasLiveLeads
                ? [
                    { label: "AI Calls",    value: hasLiveCalls  ? ci!.metrics.total_calls : "—" },
                    { label: "Leads",       value: hasLiveLeads  ? leads!.stats.total      : "—" },
                    { label: "Health",      value: `${healthScore}/100` },
                  ]
                : [
                    { label: "Rev Trend",  value: "↑ 12%" },
                    { label: "Lead Trend", value: "↑ 8%" },
                    { label: "Health",     value: "87/100" },
                  ]
            }
            recommendation={
              hasLiveCalls && hasLiveLeads
                ? `${ci!.metrics.total_calls} total AI calls + ${leads!.stats.total} leads captured. Business is generating pipeline — keep AI active.`
                : hasLiveCalls
                ? `${ci!.metrics.total_calls} calls processed. Wire GorillaDesk to complete the revenue picture.`
                : "Connect GorillaDesk + increase call volume to unlock full BI reporting"
            }
          />
        </div>
      </div>

      {/* ── Today's Top Priority ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#F87171", marginBottom: 12 }}>
          🎯 Today's Top Priority
        </div>
        <div style={{
          padding: "24px 28px", borderRadius: 16, textAlign: "center",
          background: "linear-gradient(135deg, rgba(248,113,113,0.06) 0%, rgba(251,146,60,0.04) 100%)",
          border: "1.5px solid rgba(248,113,113,0.25)",
          position: "relative", overflow: "hidden",
        }}>
          {/* Background glow */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: 16,
            background: "radial-gradient(ellipse at 50% 0%, rgba(248,113,113,0.07) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              {hotLead ? <LiveBadge /> : <DemoBadge />}
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#FED7AA", marginBottom: 8, lineHeight: 1.4 }}>
              {hotLead
                ? `Follow up with ${fmtPhone(hotLead.phone)} before noon.`
                : "Call the after-hours bed bug lead before 10:00 AM."}
            </div>
            <div style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.6 }}>
              {hotLead
                ? `New lead captured ${new Date(hotLead.createdAt).toLocaleDateString()} · Status: ${hotLead.status} · ${hotLead.message ? hotLead.message.slice(0, 80) : "Voice call inquiry"}`
                : "Caller requested a bed bug estimate after hours yesterday. Highest closing probability of the day."}
            </div>
            {hotLead && (
              <div style={{ marginTop: 10, fontSize: 11, color: "#F87171", fontWeight: 600 }}>
                Source: {hotLead.eventType.replace(/_/g, " ")}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Revenue Opportunity ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#22C55E", marginBottom: 12 }}>
          💰 Today's Revenue Opportunity
        </div>
        <div style={{
          padding: "22px 28px", borderRadius: 16,
          background: "linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(0,174,239,0.04) 100%)",
          border: "1.5px solid rgba(34,197,94,0.22)",
          display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <DemoBadge />
              <span style={{ fontSize: 11, color: "#475569" }}>Revenue estimate — booking data not yet wired</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#22C55E", lineHeight: 1, marginBottom: 6 }}>
              $1,200 – $2,800
            </div>
            <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>
              Estimated available from{" "}
              <span style={{ color: "#94A3B8" }}>
                {hasLiveLeads ? `${totalLeads} active lead${totalLeads > 1 ? "s" : ""}` : "pending leads"}
                {hasLiveCalls && missedCalls > 0 ? ` + ${missedCalls} missed call${missedCalls > 1 ? "s" : ""}` : ""}
              </span>
              {" "}in pipeline today.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
            {[
              { label: "Bed bug treatment",   est: "$350–450" },
              { label: "Roach service",        est: "$180–250" },
              { label: "Inspection + consult", est: "$95–150" },
            ].map((s, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
                padding: "6px 12px", borderRadius: 8,
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <span style={{ fontSize: 12, color: "#94A3B8" }}>{s.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#22C55E" }}>{s.est}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Needs Your Attention ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "#FBBF24", marginBottom: 12 }}>
          ⚠️ Needs Your Attention
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shownAttention.map((item, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12,
              background: "rgba(255,255,255,0.02)", border: `1px solid ${item.color}22`,
              borderLeft: `3px solid ${item.color}`,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
              <span style={{ fontSize: 13, color: "#CBD5E1", flex: 1, lineHeight: 1.5 }}>{item.text}</span>
              {item.live ? <LiveBadge /> : <DemoBadge />}
            </div>
          ))}
        </div>
      </div>

      {/* ── Start My Day Button ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 36 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <button disabled style={{
            padding: "16px 48px", borderRadius: 14, fontSize: 16, fontWeight: 800,
            background: "rgba(0,174,239,0.06)", border: "1.5px solid rgba(0,174,239,0.2)",
            color: "rgba(0,174,239,0.35)", cursor: "not-allowed", letterSpacing: "0.3px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            🚀 Start My Day
            <span style={{
              padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 900,
              background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)",
              color: "#FBBF24", letterSpacing: "0.6px",
            }}>COMING SOON</span>
          </button>
          <div style={{ fontSize: 11, color: "#334155" }}>
            One click to open your priority calls, posts, and follow-ups
          </div>
        </div>
      </div>

      {/* ── AI Executive Team Status ─────────────────────────────────────────── */}
      <div style={{
        padding: "16px 20px", borderRadius: 14,
        background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.06)",
        marginBottom: 8,
      }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 14 }}>
          AI Edge Executive Team Status
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-around" }}>
          {[
            { emoji: "👋", name: "Emma",   title: "Receptionist", live: hasLiveCalls  },
            { emoji: "💰", name: "Mason",  title: "Sales",        live: hasLiveLeads  },
            { emoji: "📣", name: "Mia",    title: "Marketing",    live: hasLivePosts  },
            { emoji: "🌎", name: "Alex",   title: "SEO",          live: false         },
            { emoji: "🎨", name: "Ava",    title: "Creative",     live: false         },
            { emoji: "⭐", name: "Olivia", title: "Reviews",      live: false         },
            { emoji: "📊", name: "Riley",  title: "Intelligence", live: hasLiveCalls || hasLiveLeads },
          ].map(agent => (
            <div key={agent.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 64 }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: agent.live
                  ? "rgba(34,197,94,0.1)"
                  : "rgba(255,255,255,0.03)",
                border: agent.live
                  ? "1.5px solid rgba(34,197,94,0.4)"
                  : "1.5px solid rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                position: "relative",
              }}>
                {agent.emoji}
                {/* Status dot */}
                <div style={{
                  position: "absolute", bottom: 1, right: 1, width: 10, height: 10,
                  borderRadius: "50%", border: "1.5px solid #030612",
                  background: agent.live ? "#22C55E" : "#FBBF24",
                }} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#CBD5E1", textAlign: "center" }}>{agent.name}</div>
              <div style={{ fontSize: 9.5, color: "#475569", textAlign: "center" }}>{agent.title}</div>
              <div style={{
                fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                background: agent.live ? "rgba(34,197,94,0.08)" : "rgba(251,191,36,0.08)",
                border: `1px solid ${agent.live ? "rgba(34,197,94,0.25)" : "rgba(251,191,36,0.25)"}`,
                color: agent.live ? "#22C55E" : "#FBBF24",
              }}>{agent.live ? "LIVE" : "DEMO"}</div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
