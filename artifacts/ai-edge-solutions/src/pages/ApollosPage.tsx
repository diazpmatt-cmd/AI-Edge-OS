// ── Apollos Conversation Mode ─────────────────────────────────────────────────
// Frontend only. Zero API calls. Placeholder AI responses until next release.

import { useState, useRef, useEffect } from "react";

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

const QUICK_ACTIONS = [
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
function ApollosAvatar({ size = 34 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg, rgba(0,174,239,0.18) 0%, rgba(6,182,212,0.08) 100%)",
      border: "1.5px solid rgba(0,174,239,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.52),
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
  const [messages, setMessages]     = useState<Message[]>([OPENING_MESSAGE]);
  const [input, setInput]           = useState("");
  const [responding, setResponding] = useState(false);
  const bottomRef                   = useRef<HTMLDivElement>(null);

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
        {QUICK_ACTIONS.map(a => (
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
          padding: "14px 24px", borderBottom: `1px solid ${B.border}`,
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: B.panel,
        }}>
          <ApollosAvatar size={38} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: B.white, letterSpacing: "-0.2px" }}>Apollos</div>
            <div style={{ fontSize: 11, color: B.blue, fontWeight: 600 }}>AI Business Advisor · British Executive</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: B.green, display: "inline-block" }} />
            <span style={{ fontSize: 11, color: B.green, fontWeight: 600 }}>Ready</span>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column" }}>
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
      </div>

      <style>{`@keyframes apollosBounce{0%,100%{transform:translateY(0);opacity:0.6}50%{transform:translateY(-4px);opacity:1}}`}</style>
    </div>
  );
}
