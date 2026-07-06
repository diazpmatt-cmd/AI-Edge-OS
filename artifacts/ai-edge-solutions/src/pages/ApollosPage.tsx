// ── Apollos Conversation Mode ─────────────────────────────────────────────────
// Frontend only. Zero API calls. Placeholder AI responses until next release.

import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";

// ── Brand ─────────────────────────────────────────────────────────────────────
const B = {
  navy:   "#030612",
  panel:  "#080E1F",
  panel2: "#0A1228",
  border: "rgba(0,174,239,0.15)",
  blue:   "#00AEEF",
  cyan:   "#06B6D4",
  green:  "#22C55E",
  gold:   "#FBBF24",
  silver: "#94A3B8",
  dim:    "#475569",
  white:  "#E2E8F0",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "apollos" | "user";
  text: string;
  time: string;
}

// ── Static data ───────────────────────────────────────────────────────────────
const OPENING_MESSAGE: Message = {
  id: "opening",
  role: "apollos",
  text: "Hello, I'm Apollos.\n\nI'm your AI Business Advisor.\n\nI can help you grow your business, analyze opportunities, build marketing campaigns, improve SEO, generate media, review performance, and coordinate your AI team.\n\nHow shall we improve your business today?",
  time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
};

const PLACEHOLDER_RESPONSE = "Conversation mode will be powered by AI in the next release.";

const TODAY_RECS = [
  {
    icon: "🔥", title: "Follow up with recovered leads",
    reason: "3 new leads captured overnight — respond before competitors do.",
    priority: "High", priorityColor: "#F97316",
    route: "/admin/lead-recovery", btnLabel: "Review Leads →",
    color: "#F97316",
  },
  {
    icon: "📣", title: "Create today's Facebook post",
    reason: "Consistent daily posts keep BB&B top of mind in Baldwin County.",
    priority: "Medium", priorityColor: "#3B82F6",
    route: "/admin/publishing", btnLabel: "Open Publisher →",
    color: "#3B82F6",
  },
  {
    icon: "💰", title: "Review revenue forecast",
    reason: "Weekly check-in — compare actuals vs. projected growth targets.",
    priority: "Medium", priorityColor: "#10B981",
    route: "/admin/profit-center", btnLabel: "View Forecast →",
    color: "#10B981",
  },
  {
    icon: "📢", title: "Build a BB&B ad campaign",
    reason: "Summer pest season peaks now — launch a targeted local ad.",
    priority: "High", priorityColor: "#A78BFA",
    route: "/admin/media-engine", btnLabel: "Open Media Engine →",
    color: "#A78BFA",
  },
] as const;

type TimelineStatus = "done" | "ready" | "pending";
const TIMELINE_STATUS_STYLE: Record<TimelineStatus, { label: string; color: string; bg: string; dot: string }> = {
  done:    { label: "Done",    color: "#22C55E", bg: "rgba(34,197,94,0.12)",   dot: "#22C55E" },
  ready:   { label: "Ready",   color: "#00AEEF", bg: "rgba(0,174,239,0.12)",   dot: "#00AEEF" },
  pending: { label: "Pending", color: "#64748B", bg: "rgba(100,116,139,0.12)", dot: "#475569" },
};

const BRIEFING_TIMELINE = [
  {
    icon: "☀️", title: "Morning Brief completed",
    desc: "Overnight signals reviewed — top 3 opportunities identified.",
    status: "done" as TimelineStatus, engine: "Morning Brief",
    route: "/admin/morning-brief", btnLabel: "View Brief",
  },
  {
    icon: "🔥", title: "Leads reviewed",
    desc: "3 recovered leads actioned — follow-up messages sent.",
    status: "done" as TimelineStatus, engine: "Lead Recovery",
    route: "/admin/lead-recovery", btnLabel: "View Leads",
  },
  {
    icon: "🎥", title: "Media campaign ready",
    desc: "Today's Facebook post drafted — awaiting final approval.",
    status: "ready" as TimelineStatus, engine: "Media Engine",
    route: "/admin/media-engine", btnLabel: "Review Campaign",
  },
  {
    icon: "💰", title: "Revenue forecast checked",
    desc: "On track — week-over-week revenue up 6% vs. last month.",
    status: "done" as TimelineStatus, engine: "Profit Center",
    route: "/admin/profit-center", btnLabel: "View Forecast",
  },
  {
    icon: "🌙", title: "End-of-day recap pending",
    desc: "Apollos will compile your daily performance summary at 6 PM.",
    status: "pending" as TimelineStatus, engine: "Apollos AI",
    route: null, btnLabel: null,
  },
] as const;

const LEFT_NAV_ACTIONS = [
  { icon: "📊", label: "Business Review"    },
  { icon: "🎯", label: "Campaign Builder"   },
  { icon: "🔍", label: "SEO Analysis"       },
];

const SUGGESTED_PROMPTS = [
  { icon: "🔥", text: "Review today's opportunities",        color: "#FBBF24" },
  { icon: "📣", text: "Build a Facebook campaign",           color: "#3B82F6" },
  { icon: "📍", text: "Generate a Google Business post",     color: "#4ADE80" },
  { icon: "🔍", text: "Analyze SEO",                         color: "#06B6D4" },
  { icon: "🎯", text: "Create an ad campaign",               color: "#F97316" },
  { icon: "🎬", text: "Build a commercial",                  color: "#A78BFA" },
  { icon: "📞", text: "Review missed calls",                 color: "#F87171" },
  { icon: "💰", text: "Show revenue forecast",               color: "#22C55E" },
  { icon: "🎥", text: "Launch Media Engine",                 color: "#00AEEF" },
];

const QUICK_ACTIONS = [
  { label: "☀️ Morning Brief",    route: "/admin/morning-brief", msg: null,                        color: "#FBBF24" },
  { label: "🎥 Media Engine",     route: "/admin/media-engine",  msg: null,                        color: "#00AEEF" },
  { label: "🔥 Review Leads",     route: "/admin/lead-recovery", msg: null,                        color: "#F97316" },
  { label: "📣 Create Ad",        route: "/admin/media-engine",  msg: "Create an ad campaign.",    color: "#A78BFA" },
  { label: "✍️ Draft Social Post", route: "/admin/publishing",    msg: "Draft a social media post.", color: "#06B6D4" },
  { label: "💰 Revenue Forecast", route: "/admin/profit-center", msg: null,                        color: "#10B981" },
] as const;

// status: "connected" | "preview" | "soon"
const LAUNCH_ENGINES = [
  { icon: "☀️", label: "Morning Brief",     desc: "Overnight AI summary + live signals",  status: "connected", route: "/admin/morning-brief",  color: "#FBBF24" },
  { icon: "🎥", label: "Media Engine",      desc: "AI content creation & publishing",     status: "connected", route: "/admin/media-engine",   color: "#00AEEF" },
  { icon: "🔥", label: "Lead Recovery",     desc: "Capture & follow up missed leads",     status: "connected", route: "/admin/lead-recovery",  color: "#F97316" },
  { icon: "📞", label: "AI Receptionist",   desc: "Emma — 24/7 call handling & textback", status: "soon",      route: null,                    color: "#22C55E" },
  { icon: "🔍", label: "SEO Engine",        desc: "Local search rankings & visibility",   status: "soon",      route: null,                    color: "#06B6D4" },
  { icon: "💰", label: "Revenue Forecast",  desc: "AI Profit Center & ROI dashboard",     status: "preview",   route: "/admin/profit-center",  color: "#10B981" },
  { icon: "⭐", label: "Review Engine",     desc: "Reputation management & requests",     status: "preview",   route: "/admin/reviews",        color: "#FBBF24" },
  { icon: "📤", label: "Publishing Center", desc: "Schedule & distribute all content",    status: "connected", route: "/admin/publishing",     color: "#A78BFA" },
] as const;

type LaunchStatus = "connected" | "preview" | "soon";

const STATUS_STYLE: Record<LaunchStatus, { label: string; bg: string; border: string; color: string }> = {
  connected: { label: "Connected",    bg: "rgba(34,197,94,0.10)",  border: "rgba(34,197,94,0.3)",   color: "#22C55E" },
  preview:   { label: "Preview",      bg: "rgba(0,174,239,0.10)",  border: "rgba(0,174,239,0.3)",   color: "#00AEEF" },
  soon:      { label: "Coming Soon",  bg: "rgba(100,116,139,0.10)",border: "rgba(100,116,139,0.25)",color: "#64748B" },
};

const HISTORY_PLACEHOLDER = [
  { icon: "💬", label: "BB&B Morning Brief",  sub: "Yesterday" },
  { icon: "📊", label: "Revenue Analysis",    sub: "Mon"       },
  { icon: "📣", label: "Facebook Campaign",   sub: "Last week" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function nowTime() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ApollosAvatar({ size = 34, glowing = false }: { size?: number; glowing?: boolean }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, rgba(0,174,239,0.22) 0%, rgba(6,182,212,0.10) 100%)",
      border: `1.5px solid ${glowing ? "rgba(0,174,239,0.75)" : "rgba(0,174,239,0.45)"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.52),
      boxShadow: glowing
        ? "0 0 14px rgba(0,174,239,0.55), 0 0 32px rgba(0,174,239,0.20)"
        : "0 0 8px rgba(0,174,239,0.15)",
      transition: "box-shadow 0.4s ease, border-color 0.4s ease",
    }}>🎙️</div>
  );
}

function ComingSoon() {
  return (
    <span style={{
      fontSize: 8, fontWeight: 800, letterSpacing: "0.8px",
      background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)",
      color: "#FBBF24", borderRadius: 8, padding: "1px 6px",
    }}>SOON</span>
  );
}

function Bubble({ msg }: { msg: Message }) {
  const isApollos = msg.role === "apollos";
  return (
    <div style={{
      display: "flex", gap: 10, alignItems: "flex-start",
      flexDirection: isApollos ? "row" : "row-reverse",
      marginBottom: 20,
    }}>
      {isApollos ? (
        <ApollosAvatar size={34} />
      ) : (
        <div style={{
          width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
        }}>👤</div>
      )}
      <div style={{
        maxWidth: "72%", display: "flex", flexDirection: "column",
        alignItems: isApollos ? "flex-start" : "flex-end", gap: 4,
      }}>
        <div style={{
          padding: "12px 16px",
          borderRadius: isApollos ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
          background: isApollos
            ? "linear-gradient(135deg, #0A1632 0%, #0D1A3A 100%)"
            : "linear-gradient(135deg, rgba(0,174,239,0.18) 0%, rgba(6,182,212,0.12) 100%)",
          border: `1px solid ${isApollos ? "rgba(0,174,239,0.15)" : "rgba(0,174,239,0.3)"}`,
          fontSize: 13.5, color: B.white, lineHeight: 1.75, whiteSpace: "pre-wrap",
        }}>
          {isApollos && (
            <div style={{
              fontSize: 9.5, fontWeight: 700, color: B.blue,
              letterSpacing: "1px", marginBottom: 7, textTransform: "uppercase",
            }}>Apollos</div>
          )}
          {msg.text}
        </div>
        <div style={{ fontSize: 10, color: B.dim }}>{msg.time}</div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ApollosPage() {
  const [, navigate]                = useLocation();
  const [messages, setMessages]     = useState<Message[]>([OPENING_MESSAGE]);
  const [input, setInput]           = useState("");
  const [responding, setResponding] = useState(false);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [recsOpen, setRecsOpen]         = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const bottomRef                   = useRef<HTMLDivElement>(null);
  const voiceUtterRef               = useRef<SpeechSynthesisUtterance[]>([]);

  const INTRO_SCRIPT = [
    "Hi, I'm Apollos.",
    "I'm your AI Business Advisor.",
    "How shall we improve your business today?",
  ];

  function stopVoice() {
    window.speechSynthesis?.cancel();
    setVoicePlaying(false);
    voiceUtterRef.current = [];
  }

  function playVoiceIntro() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    stopVoice();
    const voices = window.speechSynthesis.getVoices();
    const PREF_NAMES = ["Daniel", "Google UK English Male", "Microsoft Ryan Online (Natural)", "Microsoft George"];
    const isMale = (v: SpeechSynthesisVoice) =>
      v.name.toLowerCase().includes("male") ||
      PREF_NAMES.some(n => v.name.toLowerCase().includes(n.toLowerCase()));

    let voice: SpeechSynthesisVoice | null =
      PREF_NAMES.reduce<SpeechSynthesisVoice | null>((found, name) =>
        found ?? (voices.find(v => v.lang.startsWith("en-GB") && v.name.toLowerCase().includes(name.toLowerCase())) ?? null)
      , null);
    if (!voice) voice = voices.find(v => v.lang.startsWith("en-GB") && isMale(v)) ?? null;
    if (!voice) voice = voices.find(v => v.lang.startsWith("en") && isMale(v)) ?? null;
    if (!voice) voice = voices.find(v => v.lang.startsWith("en-GB")) ?? null;

    voiceUtterRef.current = INTRO_SCRIPT.map((line, i) => {
      const u = new SpeechSynthesisUtterance(line);
      u.lang = "en-GB"; u.pitch = 0.92; u.rate = 0.98;
      if (voice) u.voice = voice;
      u.onstart = () => setVoicePlaying(true);
      u.onend = () => {
        if (i === INTRO_SCRIPT.length - 1) { setVoicePlaying(false); voiceUtterRef.current = []; }
        else setTimeout(() => { const next = voiceUtterRef.current[i + 1]; if (next) window.speechSynthesis.speak(next); }, 350);
      };
      return u;
    });
    window.speechSynthesis.speak(voiceUtterRef.current[0]);
    setVoicePlaying(true);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || responding) return;

    const userMsg: Message = { id: uid(), role: "user", text: trimmed, time: nowTime() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setResponding(true);

    // Placeholder — no fetch, no axios, no backend
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: uid(), role: "apollos",
        text: PLACEHOLDER_RESPONSE,
        time: nowTime(),
      }]);
      setResponding(false);
    }, 650);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  const canSend = input.trim().length > 0 && !responding;

  return (
    <div style={{
      display: "flex", height: "calc(100vh - 0px)", overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
      color: B.white, background: B.navy,
    }}>

      {/* ══ LEFT PANEL ════════════════════════════════════════════════════════ */}
      <div style={{
        width: 220, flexShrink: 0, background: B.panel,
        borderRight: `1px solid ${B.border}`,
        display: "flex", flexDirection: "column",
        padding: "16px 12px", gap: 4, overflowY: "auto",
      }}>
        {/* New conversation */}
        <button
          onClick={() => { setMessages([OPENING_MESSAGE]); setInput(""); setResponding(false); }}
          style={{
            width: "100%",
            background: "linear-gradient(135deg, #00AEEF 0%, #06B6D4 100%)",
            border: "none", borderRadius: 10, padding: "10px 14px",
            fontSize: 12.5, fontWeight: 700, color: "#030612",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            marginBottom: 12, boxShadow: "0 4px 12px rgba(0,174,239,0.25)",
          }}>
          ✨ New Conversation
        </button>

        {/* Quick actions */}
        <div style={{ fontSize: 9, fontWeight: 700, color: B.dim, letterSpacing: "1.5px", textTransform: "uppercase", padding: "0 4px", marginBottom: 4 }}>
          Quick Actions
        </div>
        {LEFT_NAV_ACTIONS.map(a => (
          <button key={a.label} onClick={() => send(a.label)} style={{
            width: "100%", background: "transparent", border: "1px solid transparent",
            borderRadius: 8, padding: "8px 10px", fontSize: 12, color: B.silver,
            cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8,
          }}
          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(255,255,255,0.04)"; b.style.borderColor = "rgba(0,174,239,0.2)"; }}
          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.borderColor = "transparent"; }}>
            <span>{a.icon}</span>{a.label}
          </button>
        ))}

        {/* History */}
        <div style={{ fontSize: 9, fontWeight: 700, color: B.dim, letterSpacing: "1.5px", textTransform: "uppercase", padding: "14px 4px 6px" }}>
          Recent
        </div>
        {HISTORY_PLACEHOLDER.map(h => (
          <div key={h.label} style={{
            padding: "8px 10px", borderRadius: 8, marginBottom: 3,
            background: "rgba(255,255,255,0.01)", border: `1px solid ${B.border}`,
            cursor: "pointer", opacity: 0.6,
          }}>
            <div style={{ fontSize: 11.5, color: B.silver, fontWeight: 600 }}>{h.icon} {h.label}</div>
            <div style={{ fontSize: 9.5, color: B.dim, marginTop: 2 }}>{h.sub}</div>
          </div>
        ))}

        <div style={{ marginTop: 6, padding: "7px 10px", borderRadius: 8, border: "1px dashed rgba(255,255,255,0.06)", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: B.dim }}>History sync</div>
          <div style={{ fontSize: 8, color: B.gold, fontWeight: 800, letterSpacing: "0.5px" }}>COMING SOON</div>
        </div>
      </div>

      {/* ══ CENTER PANEL ══════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

        {/* Chat header */}
        <div style={{
          padding: "12px 24px", borderBottom: `1px solid ${B.border}`,
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: B.panel,
          flexWrap: "wrap",
        }}>
          <ApollosAvatar size={38} glowing={voicePlaying} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: B.white, letterSpacing: "-0.2px" }}>Apollos</span>
              {/* AI Coming Soon badge */}
              <span style={{
                fontSize: 8, fontWeight: 800, letterSpacing: "1px",
                background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)",
                color: "#A78BFA", borderRadius: 8, padding: "2px 7px",
              }}>🤖 AI COMING SOON</span>
              {/* Frontend Preview Only badge */}
              <span style={{
                fontSize: 8, fontWeight: 800, letterSpacing: "1px",
                background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.28)",
                color: "#FBBF24", borderRadius: 8, padding: "2px 7px",
              }}>👁 FRONTEND PREVIEW</span>
            </div>
            <div style={{ fontSize: 11, color: B.blue, fontWeight: 600, marginTop: 2 }}>AI Business Advisor · British Executive</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {/* Voice intro button */}
            {!voicePlaying ? (
              <button onClick={playVoiceIntro} style={{
                background: "rgba(0,174,239,0.10)", border: "1px solid rgba(0,174,239,0.3)",
                borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700,
                color: B.blue, cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              }}>▶ Hear Intro</button>
            ) : (
              <button onClick={stopVoice} style={{
                background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.3)",
                borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700,
                color: "#F87171", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              }}>■ Stop</button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: B.green, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: B.green, fontWeight: 600 }}>Ready</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column" }}>

          {/* ── Today's Apollos Recommendations ── */}
          <div style={{ marginBottom: 20 }}>
            <button onClick={() => setRecsOpen(o => !o)} style={{
              width: "100%", background: "none", border: "none", padding: "0 0 10px 0",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 13 }}>🧠</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: B.blue, letterSpacing: "1.2px", textTransform: "uppercase" }}>
                Today's Apollos Recommendations
              </span>
              <span style={{ fontSize: 9, color: B.dim }}>— {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: B.dim, transition: "transform 0.25s", display: "inline-block", transform: recsOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>▾</span>
            </button>
            <div style={{ overflow: "hidden", maxHeight: recsOpen ? "800px" : "0px", transition: "max-height 0.3s ease", }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, paddingBottom: 4 }}>
              {TODAY_RECS.map(r => (
                <div key={r.title} style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)",
                  border: `1px solid rgba(255,255,255,0.07)`,
                  borderLeft: `3px solid ${r.color}`,
                  borderRadius: 12, padding: "13px 14px",
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  {/* Card header */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 16 }}>{r.icon}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: B.white, lineHeight: 1.35 }}>{r.title}</span>
                    </div>
                    <span style={{
                      flexShrink: 0, fontSize: 8, fontWeight: 800, letterSpacing: "0.6px",
                      background: `${r.priorityColor}18`, border: `1px solid ${r.priorityColor}40`,
                      color: r.priorityColor, borderRadius: 6, padding: "2px 6px",
                    }}>{r.priority}</span>
                  </div>
                  {/* Reason */}
                  <div style={{ fontSize: 11, color: B.dim, lineHeight: 1.5 }}>{r.reason}</div>
                  {/* Action */}
                  <button
                    onClick={() => navigate(r.route)}
                    style={{
                      alignSelf: "flex-start", background: `${r.color}14`,
                      border: `1px solid ${r.color}30`, borderRadius: 8,
                      padding: "5px 11px", fontSize: 10.5, fontWeight: 700,
                      color: r.color, cursor: "pointer", transition: "all 0.15s",
                    }}
                    onMouseEnter={ev => { (ev.currentTarget as HTMLButtonElement).style.background = `${r.color}26`; }}
                    onMouseLeave={ev => { (ev.currentTarget as HTMLButtonElement).style.background = `${r.color}14`; }}
                  >
                    {r.btnLabel}
                  </button>
                </div>
              ))}
            </div>
            </div>
          </div>

          {/* ── Today's Briefing Timeline ── */}
          <div style={{ marginBottom: 20 }}>
            <button onClick={() => setTimelineOpen(o => !o)} style={{
              width: "100%", background: "none", border: "none", padding: "0 0 10px 0",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 13 }}>📋</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: B.blue, letterSpacing: "1.2px", textTransform: "uppercase" }}>
                Today's Briefing Timeline
              </span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: B.dim, transition: "transform 0.25s", display: "inline-block", transform: timelineOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>▾</span>
            </button>
            <div style={{ overflow: "hidden", maxHeight: timelineOpen ? "1200px" : "0px", transition: "max-height 0.3s ease" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {BRIEFING_TIMELINE.map((item, idx) => {
                const s = TIMELINE_STATUS_STYLE[item.status];
                const isLast = idx === BRIEFING_TIMELINE.length - 1;
                return (
                  <div key={item.title} style={{ display: "flex", gap: 12, position: "relative" }}>
                    {/* Connector line */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 20 }}>
                      <div style={{
                        width: 12, height: 12, borderRadius: "50%", marginTop: 14,
                        background: s.dot, flexShrink: 0,
                        boxShadow: item.status !== "pending" ? `0 0 6px ${s.dot}88` : "none",
                      }} />
                      {!isLast && <div style={{ width: 2, flex: 1, minHeight: 20, background: "rgba(255,255,255,0.06)", marginTop: 4, marginBottom: 0 }} />}
                    </div>
                    {/* Card */}
                    <div style={{
                      flex: 1, background: "rgba(255,255,255,0.02)",
                      border: `1px solid rgba(255,255,255,0.06)`,
                      borderRadius: 10, padding: "10px 12px",
                      marginBottom: isLast ? 0 : 8,
                      opacity: item.status === "pending" ? 0.65 : 1,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ fontSize: 14 }}>{item.icon}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: B.white }}>{item.title}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          <span style={{ fontSize: 8.5, color: B.dim }}>{item.engine}</span>
                          <span style={{
                            fontSize: 8, fontWeight: 800, letterSpacing: "0.5px",
                            background: s.bg, color: s.color, borderRadius: 6,
                            padding: "2px 6px", border: `1px solid ${s.color}40`,
                          }}>{s.label}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: B.dim, lineHeight: 1.5, marginBottom: item.route ? 8 : 0 }}>{item.desc}</div>
                      {item.route && item.btnLabel && (
                        <button
                          onClick={() => navigate(item.route as string)}
                          style={{
                            background: `${s.color}12`, border: `1px solid ${s.color}30`,
                            borderRadius: 7, padding: "4px 10px", fontSize: 10, fontWeight: 700,
                            color: s.color, cursor: "pointer", transition: "all 0.15s",
                          }}
                          onMouseEnter={ev => { (ev.currentTarget as HTMLButtonElement).style.background = `${s.color}24`; }}
                          onMouseLeave={ev => { (ev.currentTarget as HTMLButtonElement).style.background = `${s.color}12`; }}
                        >
                          {item.btnLabel} →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </div>

          {messages.map(m => <Bubble key={m.id} msg={m} />)}

          {/* Typing indicator */}
          {responding && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 18 }}>
              <ApollosAvatar size={34} />
              <div style={{
                padding: "13px 18px", borderRadius: "4px 14px 14px 14px",
                background: "linear-gradient(135deg, #0A1632 0%, #0D1A3A 100%)",
                border: `1px solid ${B.border}`,
                display: "flex", alignItems: "center", gap: 5,
              }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: "50%", background: B.blue,
                    display: "inline-block",
                    animation: `apollosBounce 1.2s infinite ${i * 0.2}s`,
                  }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── Quick Actions ── */}
        <div style={{
          padding: "8px 24px 0",
          background: B.panel,
          borderTop: `1px solid ${B.border}`,
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: B.dim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 7 }}>
            Quick Actions
          </div>
          <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 10, scrollbarWidth: "none" }}>
            {QUICK_ACTIONS.map(qa => (
              <button
                key={qa.label}
                onClick={() => {
                  if (qa.msg) {
                    setMessages(prev => [...prev, { id: String(Date.now()), role: "user" as const, text: qa.msg!, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
                  }
                  navigate(qa.route);
                }}
                style={{
                  flexShrink: 0, whiteSpace: "nowrap",
                  background: `${qa.color}12`,
                  border: `1px solid ${qa.color}30`,
                  borderRadius: 20, padding: "5px 13px",
                  fontSize: 11.5, fontWeight: 600, color: qa.color,
                  cursor: "pointer", transition: "all 0.15s",
                }}
                onMouseEnter={ev => { (ev.currentTarget as HTMLButtonElement).style.background = `${qa.color}24`; (ev.currentTarget as HTMLButtonElement).style.borderColor = `${qa.color}55`; }}
                onMouseLeave={ev => { (ev.currentTarget as HTMLButtonElement).style.background = `${qa.color}12`; (ev.currentTarget as HTMLButtonElement).style.borderColor = `${qa.color}30`; }}
              >
                {qa.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input bar */}
        <div style={{ padding: "14px 24px 16px", borderTop: `1px solid ${B.border}`, background: B.panel, flexShrink: 0 }}>
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-end",
            background: B.panel2, border: `1px solid ${B.border}`,
            borderRadius: 14, padding: "10px 14px",
          }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask Apollos anything about your business..."
              rows={1}
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                resize: "none", fontSize: 13.5, color: B.white, lineHeight: 1.55,
                fontFamily: "inherit", paddingTop: 2,
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, paddingBottom: 2 }}>
              {/* Voice */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <button disabled style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                  color: B.dim, cursor: "not-allowed", fontSize: 15,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>🎤</button>
                <ComingSoon />
              </div>
              {/* Attach */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <button disabled style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                  color: B.dim, cursor: "not-allowed", fontSize: 15,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>📎</button>
                <ComingSoon />
              </div>
              {/* Send */}
              <button
                onClick={() => send(input)}
                disabled={!canSend}
                style={{
                  width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                  background: canSend
                    ? "linear-gradient(135deg, #00AEEF 0%, #06B6D4 100%)"
                    : "rgba(255,255,255,0.04)",
                  border: `1px solid ${canSend ? "#00AEEF" : "rgba(255,255,255,0.08)"}`,
                  color: canSend ? "#030612" : B.dim,
                  cursor: canSend ? "pointer" : "not-allowed",
                  fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s",
                  boxShadow: canSend ? "0 4px 12px rgba(0,174,239,0.3)" : "none",
                }}>➤</button>
            </div>
          </div>
          <div style={{ fontSize: 10, color: B.dim, marginTop: 7, textAlign: "center" }}>
            Enter to send · Shift+Enter for new line · Full AI integration coming in next release
          </div>
        </div>
      </div>

      {/* ══ RIGHT PANEL ═══════════════════════════════════════════════════════ */}
      <div style={{
        width: 240, flexShrink: 0, background: B.panel,
        borderLeft: `1px solid ${B.border}`,
        padding: "20px 14px", overflowY: "auto",
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: B.dim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>
          Suggested Prompts
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {SUGGESTED_PROMPTS.map(p => (
            <button key={p.text} onClick={() => send(p.text)} style={{
              width: "100%", background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10,
              padding: "10px 12px", fontSize: 12, color: B.silver,
              cursor: "pointer", textAlign: "left", lineHeight: 1.4,
              display: "flex", alignItems: "flex-start", gap: 8, transition: "all 0.15s",
            }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = `${p.color}12`; b.style.borderColor = `${p.color}35`; b.style.color = B.white; }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(255,255,255,0.02)"; b.style.borderColor = "rgba(255,255,255,0.06)"; b.style.color = B.silver; }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{p.icon}</span>
              <span>{p.text}</span>
            </button>
          ))}
        </div>

        <div style={{ margin: "20px 0 12px", height: 1, background: B.border }} />

        <div style={{ fontSize: 9, fontWeight: 700, color: B.dim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10 }}>
          Active Context
        </div>
        {[
          { icon: "🐛", label: "BB&B",              sub: "Demo client"   },
          { icon: "📍", label: "Baldwin County, AL", sub: "Service area" },
          { icon: "🏷️", label: "Pest Control",       sub: "Industry"     },
        ].map(c => (
          <div key={c.label} style={{
            display: "flex", gap: 8, alignItems: "flex-start",
            padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}>
            <span style={{ fontSize: 13 }}>{c.icon}</span>
            <div>
              <div style={{ fontSize: 11.5, color: B.white, fontWeight: 600 }}>{c.label}</div>
              <div style={{ fontSize: 10, color: B.dim }}>{c.sub}</div>
            </div>
          </div>
        ))}

        <div style={{ marginTop: 16, padding: "8px 10px", borderRadius: 8, background: "rgba(0,174,239,0.05)", border: `1px solid ${B.border}`, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: B.dim, marginBottom: 3 }}>Live business context</div>
          <div style={{ fontSize: 8, color: B.gold, fontWeight: 800, letterSpacing: "0.5px" }}>COMING SOON</div>
        </div>

        {/* ── Launch Panel ── */}
        <div style={{ margin: "22px 0 10px", height: 1, background: B.border }} />
        <div style={{ fontSize: 9, fontWeight: 700, color: B.dim, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 12 }}>
          Launch an AI Edge Engine
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {LAUNCH_ENGINES.map(e => {
            const s = STATUS_STYLE[e.status as LaunchStatus];
            const canLaunch = e.status !== "soon" && e.route !== null;
            return (
              <div key={e.label} style={{
                background: "rgba(255,255,255,0.02)",
                border: `1px solid rgba(255,255,255,0.06)`,
                borderLeft: `2px solid ${e.color}44`,
                borderRadius: 10, padding: "10px 11px",
              }}>
                {/* Card header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14 }}>{e.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: B.white }}>{e.label}</span>
                  </div>
                  <span style={{
                    fontSize: 7.5, fontWeight: 800, letterSpacing: "0.6px",
                    background: s.bg, border: `1px solid ${s.border}`,
                    color: s.color, borderRadius: 7, padding: "1px 5px", flexShrink: 0,
                  }}>{s.label}</span>
                </div>
                {/* Description */}
                <div style={{ fontSize: 10, color: B.dim, lineHeight: 1.4, marginBottom: 8 }}>{e.desc}</div>
                {/* Action button */}
                {canLaunch ? (
                  <button
                    onClick={() => navigate(e.route as string)}
                    style={{
                      width: "100%", background: `${e.color}14`,
                      border: `1px solid ${e.color}33`, borderRadius: 7,
                      padding: "5px 0", fontSize: 10.5, fontWeight: 700,
                      color: e.color, cursor: "pointer", transition: "all 0.15s",
                    }}
                    onMouseEnter={ev => { (ev.currentTarget as HTMLButtonElement).style.background = `${e.color}24`; }}
                    onMouseLeave={ev => { (ev.currentTarget as HTMLButtonElement).style.background = `${e.color}14`; }}
                  >
                    {e.status === "preview" ? "Open Preview →" : "Launch →"}
                  </button>
                ) : (
                  <button disabled style={{
                    width: "100%", background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)", borderRadius: 7,
                    padding: "5px 0", fontSize: 10.5, fontWeight: 700,
                    color: B.dim, cursor: "not-allowed",
                  }}>Coming Soon</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`@keyframes apollosBounce{0%,100%{transform:translateY(0);opacity:0.6}50%{transform:translateY(-4px);opacity:1}}`}</style>
    </div>
  );
}
