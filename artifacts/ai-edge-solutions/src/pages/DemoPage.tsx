import { useState, useEffect, useCallback } from "react";

const logoSrc = `${import.meta.env.BASE_URL}logo-transparent.png`;

const BRAND = {
  navy:   "#030612",
  blue:   "#00AEEF",
  silver: "#C0C0C0",
  gold:   "#FBBF24",
  white:  "#FFFFFF",
};

const TOTAL_SLIDES = 7;

const AGENTS = [
  { emoji: "📞", name: "Emma",   title: "AI Receptionist",          color: "#00AEEF", line: "Answers every call. Captures every lead. Never misses a beat." },
  { emoji: "💼", name: "Mason",  title: "AI Sales Director",        color: "#22C55E", line: "Qualifies leads, tracks pipeline, and surfaces your best opportunity." },
  { emoji: "📣", name: "Mia",    title: "AI Marketing Director",    color: "#A78BFA", line: "Writes, schedules, and publishes content across every platform." },
  { emoji: "🔍", name: "Alex",   title: "AI SEO Director",          color: "#F97316", line: "Ranks your business higher. Every week, automatically." },
  { emoji: "🎨", name: "Ava",    title: "AI Creative Director",     color: "#EC4899", line: "Designs branded content at scale. No brief needed." },
  { emoji: "⭐", name: "Olivia", title: "AI Customer Experience",   color: "#FBBF24", line: "Monitors reviews, replies to feedback, protects your reputation." },
  { emoji: "📊", name: "Riley",  title: "AI Business Intelligence", color: "#38BDF8", line: "Turns your data into daily decisions. Your morning score is ready." },
];

const STATS = [
  { value: "47",  label: "Calls answered by AI",     sub: "zero missed opportunities" },
  { value: "12",  label: "Leads captured overnight", sub: "while the owner slept" },
  { value: "23",  label: "Posts published this month",sub: "across Facebook + Instagram" },
];

const REVENUE_ITEMS = [
  { value: "$18,400",  label: "Revenue pipeline",        sub: "tracked by Mason in real time" },
  { value: "100%",     label: "Call answer rate",         sub: "Emma answered every single call" },
  { value: "23",       label: "Content pieces published", sub: "Mia, zero human hours" },
];

const FUTURE_ITEMS = [
  { emoji: "📅", title: "AI Booking Engine",      line: "Schedules appointments directly from any conversation — call, text, or form." },
  { emoji: "🧠", title: "AI Voice Search",        line: "Makes your business the answer when people ask their phones." },
  { emoji: "📈", title: "AI Competitor Intel",    line: "Monitors what your rivals are doing and tells you how to win." },
  { emoji: "🎙️", title: "AI Review Responder",   line: "Responds to every Google and Facebook review within minutes." },
];

// ── Reusable slide wrapper ────────────────────────────────────────────────────
function Slide({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "80px 48px 80px",
      boxSizing: "border-box",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Glow blob (decorative) ────────────────────────────────────────────────────
function GlowBlob({ color = "#00AEEF", size = 600, top, left, right, bottom, opacity = 0.12 }:
  { color?: string; size?: number; top?: number | string; left?: number | string; right?: number | string; bottom?: number | string; opacity?: number }) {
  return (
    <div style={{
      position: "absolute", top, left, right, bottom,
      width: size, height: size,
      background: color,
      borderRadius: "50%",
      filter: `blur(${size * 0.35}px)`,
      opacity,
      pointerEvents: "none",
    }} />
  );
}

// ── Slide 0: Welcome ──────────────────────────────────────────────────────────
function SlideWelcome({ onNext }: { onNext: () => void }) {
  return (
    <Slide>
      <GlowBlob color="#00AEEF" size={700} top={-200} left="10%" opacity={0.13} />
      <GlowBlob color="#A78BFA" size={500} bottom={-150} right="5%" opacity={0.1} />

      <div style={{ textAlign: "center", maxWidth: 820, position: "relative", zIndex: 1 }}>
        <div style={{ marginBottom: 32 }}>
          <img src={logoSrc} alt="AI Edge Solutions" style={{ height: 52, width: "auto" }} />
        </div>

        <div style={{
          display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "3px",
          color: BRAND.blue, textTransform: "uppercase", marginBottom: 28,
          padding: "6px 16px", border: `1px solid ${BRAND.blue}33`, borderRadius: 20,
        }}>
          Introducing AI Edge OS
        </div>

        <h1 style={{
          fontSize: "clamp(36px, 6vw, 72px)", fontWeight: 800,
          color: BRAND.white, lineHeight: 1.08, margin: "0 0 24px",
          letterSpacing: "-1.5px",
        }}>
          The World's First<br />
          <span style={{
            background: `linear-gradient(135deg, ${BRAND.blue} 0%, #7DD3FC 50%, ${BRAND.blue} 100%)`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            AI Business Operating System
          </span>
        </h1>

        <p style={{
          fontSize: "clamp(16px, 2vw, 22px)", color: "#94A3B8",
          lineHeight: 1.55, margin: "0 auto 48px", maxWidth: 560,
        }}>
          Seven AI executives working for your business — every hour of every day,
          while you focus on what you do best.
        </p>

        <button onClick={onNext} style={{
          background: BRAND.blue, color: BRAND.white,
          border: "none", borderRadius: 50, cursor: "pointer",
          padding: "16px 40px", fontSize: 16, fontWeight: 700, letterSpacing: "0.3px",
          boxShadow: `0 0 40px ${BRAND.blue}66`,
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
          onMouseEnter={e => { (e.target as HTMLElement).style.transform = "scale(1.04)"; (e.target as HTMLElement).style.boxShadow = `0 0 60px ${BRAND.blue}99`; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.transform = "scale(1)";   (e.target as HTMLElement).style.boxShadow = `0 0 40px ${BRAND.blue}66`; }}
        >
          Begin the Demo →
        </button>

        <p style={{ marginTop: 24, fontSize: 12, color: "#475569", letterSpacing: "1px" }}>
          USE ARROW KEYS OR CLICK THE DOTS TO NAVIGATE
        </p>
      </div>
    </Slide>
  );
}

// ── Slide 1: Morning Brief ────────────────────────────────────────────────────
function SlideMorningBrief() {
  return (
    <Slide style={{ flexDirection: "row", gap: 60, alignItems: "center", justifyContent: "center" }}>
      <GlowBlob color={BRAND.gold} size={500} top={-100} left={-100} opacity={0.08} />

      {/* Left — copy */}
      <div style={{ flex: 1, maxWidth: 420 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "3px", color: BRAND.gold, textTransform: "uppercase", marginBottom: 20 }}>
          Every Morning
        </div>
        <h2 style={{ fontSize: "clamp(28px, 4vw, 52px)", fontWeight: 800, color: BRAND.white, lineHeight: 1.1, margin: "0 0 20px", letterSpacing: "-1px" }}>
          Before your first coffee, your team has already{" "}
          <span style={{ color: BRAND.gold }}>reviewed everything.</span>
        </h2>
        <p style={{ fontSize: 17, color: "#94A3B8", lineHeight: 1.65, margin: 0 }}>
          AI Edge OS delivers a personalized morning brief — business health score,
          top priority lead, overnight activity, and one recommended action.
          Ready before you wake up.
        </p>
      </div>

      {/* Right — Morning Brief mockup card */}
      <div style={{
        flex: 1, maxWidth: 400,
        background: "rgba(255,255,255,0.04)", borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(12px)",
        padding: 28, boxSizing: "border-box",
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>Monday, July 7</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.white }}>☀️ Good Morning, Matt</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#22C55E" }}>95</div>
            <div style={{ fontSize: 9, color: "#22C55E", fontWeight: 600, letterSpacing: "1px" }}>HEALTH</div>
          </div>
        </div>

        {/* Live stats */}
        {[
          { label: "📞 Calls Answered", value: "47",  badge: "🟢 LIVE" },
          { label: "🔥 Active Leads",   value: "12",  badge: "🟢 LIVE" },
          { label: "📣 Posts Published",value: "23",  badge: "🟢 LIVE" },
        ].map(s => (
          <div key={s.label} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 12px", borderRadius: 10, marginBottom: 8,
            background: "rgba(255,255,255,0.04)",
          }}>
            <span style={{ fontSize: 13, color: "#CBD5E1" }}>{s.label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: BRAND.white }}>{s.value}</span>
              <span style={{ fontSize: 9, color: "#22C55E", fontWeight: 700 }}>{s.badge}</span>
            </div>
          </div>
        ))}

        {/* Top priority */}
        <div style={{
          marginTop: 14, padding: "12px 14px", borderRadius: 12,
          background: `linear-gradient(135deg, ${BRAND.blue}22, ${BRAND.blue}08)`,
          border: `1px solid ${BRAND.blue}33`,
        }}>
          <div style={{ fontSize: 10, color: BRAND.blue, fontWeight: 700, letterSpacing: "1px", marginBottom: 4 }}>🎯 TODAY'S TOP PRIORITY</div>
          <div style={{ fontSize: 13, color: BRAND.white, fontWeight: 600 }}>New lead: (251) 555-0198 — residential treatment inquiry</div>
          <div style={{ fontSize: 11, color: "#64748B", marginTop: 3 }}>Received 2:14 AM · Call within 2 hours for best conversion</div>
        </div>
      </div>
    </Slide>
  );
}

// ── Slide 2: Meet Your AI Team ────────────────────────────────────────────────
function SlideTeam() {
  return (
    <Slide style={{ justifyContent: "flex-start", paddingTop: 72 }}>
      <GlowBlob color="#A78BFA" size={600} top={-200} right={-100} opacity={0.1} />

      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "3px", color: BRAND.blue, textTransform: "uppercase", marginBottom: 16 }}>
          Your AI Executive Team
        </div>
        <h2 style={{ fontSize: "clamp(28px, 4vw, 56px)", fontWeight: 800, color: BRAND.white, lineHeight: 1.08, margin: 0, letterSpacing: "-1px" }}>
          7 specialists. One team.<br />
          <span style={{ color: BRAND.blue }}>Working 24 / 7 / 365.</span>
        </h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, width: "100%", maxWidth: 960 }}>
        {AGENTS.map((a, i) => (
          <div key={a.name} style={{
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${a.color}33`,
            borderRadius: 14, padding: "18px 16px",
            gridColumn: i === 6 ? "2 / 4" : undefined,
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 40px ${a.color}33`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)";    (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>{a.emoji}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: BRAND.white, marginBottom: 2 }}>{a.name}</div>
            <div style={{ fontSize: 10, color: a.color, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>{a.title}</div>
            <div style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.5 }}>{a.line}</div>
          </div>
        ))}
      </div>
    </Slide>
  );
}

// ── Slide 3: BB&B Success Story ───────────────────────────────────────────────
function SlideBBB() {
  return (
    <Slide>
      <GlowBlob color="#0077B6" size={600} top={-150} left={-100} opacity={0.13} />
      <GlowBlob color="#F26C21" size={400} bottom={-100} right={-50} opacity={0.09} />

      {/* Client badge */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 50, padding: "8px 20px", marginBottom: 32,
      }}>
        <span style={{ fontSize: 20 }}>🐛</span>
        <span style={{ fontSize: 12, color: BRAND.silver, fontWeight: 600, letterSpacing: "1px" }}>
          CLIENT STORY — BED BUGS & BEYOND · BALDWIN COUNTY, AL
        </span>
      </div>

      <h2 style={{
        fontSize: "clamp(28px, 5vw, 62px)", fontWeight: 800, color: BRAND.white,
        lineHeight: 1.08, margin: "0 0 16px", letterSpacing: "-1.5px", textAlign: "center",
      }}>
        A local pest control company<br />
        <span style={{ color: "#0077B6" }}>got a full AI executive team.</span>
      </h2>
      <p style={{ fontSize: 18, color: "#94A3B8", marginBottom: 52, textAlign: "center", maxWidth: 520 }}>
        No new hires. No new software to learn. Just results — starting in week one.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, width: "100%", maxWidth: 820 }}>
        {STATS.map(s => (
          <div key={s.label} style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 18, padding: "28px 24px", textAlign: "center",
          }}>
            <div style={{
              fontSize: "clamp(40px, 5vw, 64px)", fontWeight: 900, color: BRAND.white,
              letterSpacing: "-2px", lineHeight: 1,
              background: `linear-gradient(135deg, ${BRAND.white} 0%, ${BRAND.blue} 100%)`,
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>{s.value}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.white, margin: "10px 0 6px" }}>{s.label}</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, fontSize: 13, color: "#475569", fontStyle: "italic" }}>
        All of the above is powered by AI Edge OS — zero additional staff.
      </div>
    </Slide>
  );
}

// ── Slide 4: Revenue Impact ───────────────────────────────────────────────────
function SlideRevenue() {
  return (
    <Slide>
      <GlowBlob color="#22C55E" size={500} top={-100} right={-50} opacity={0.09} />

      <div style={{ textAlign: "center", marginBottom: 52 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "3px", color: "#22C55E", textTransform: "uppercase", marginBottom: 16 }}>
          The Bottom Line
        </div>
        <h2 style={{ fontSize: "clamp(28px, 4.5vw, 58px)", fontWeight: 800, color: BRAND.white, lineHeight: 1.1, margin: 0, letterSpacing: "-1px" }}>
          What does an AI executive team<br />
          <span style={{ color: "#22C55E" }}>actually deliver?</span>
        </h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, width: "100%", maxWidth: 860 }}>
        {REVENUE_ITEMS.map(r => (
          <div key={r.label} style={{
            background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: 20, padding: "36px 28px", textAlign: "center",
          }}>
            <div style={{
              fontSize: "clamp(36px, 4.5vw, 58px)", fontWeight: 900, letterSpacing: "-2px", lineHeight: 1,
              color: "#22C55E",
            }}>{r.value}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.white, margin: "12px 0 8px" }}>{r.label}</div>
            <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>{r.sub}</div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 40, padding: "18px 32px",
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14, maxWidth: 580, textAlign: "center",
      }}>
        <span style={{ fontSize: 15, color: "#CBD5E1", lineHeight: 1.6 }}>
          The average AI Edge client recovers their entire investment within the first{" "}
          <strong style={{ color: BRAND.white }}>30 days</strong> — from leads that would have otherwise been lost.
        </span>
      </div>
    </Slide>
  );
}

// ── Slide 5: Start My Day ─────────────────────────────────────────────────────
function SlideStartMyDay() {
  return (
    <Slide>
      {/* Full bleed animated glow center */}
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
      }}>
        <div style={{
          width: 700, height: 700, borderRadius: "50%",
          background: `radial-gradient(circle, ${BRAND.blue}1A 0%, transparent 70%)`,
          animation: "pulse 3s ease-in-out infinite",
        }} />
      </div>

      <style>{`@keyframes pulse { 0%,100% { transform:scale(1); opacity:0.6; } 50% { transform:scale(1.08); opacity:1; } }`}</style>

      <div style={{ textAlign: "center", maxWidth: 680, position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "3px", color: BRAND.blue, textTransform: "uppercase", marginBottom: 24 }}>
          One Button. Your Entire Day Unlocked.
        </div>

        <h2 style={{
          fontSize: "clamp(36px, 6vw, 72px)", fontWeight: 900, color: BRAND.white,
          lineHeight: 1.05, margin: "0 0 20px", letterSpacing: "-2px",
        }}>
          Your team is ready.<br />
          <span style={{
            background: `linear-gradient(135deg, ${BRAND.blue}, #7DD3FC)`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Are you?
          </span>
        </h2>

        <p style={{ fontSize: 18, color: "#94A3B8", lineHeight: 1.65, margin: "0 auto 48px", maxWidth: 480 }}>
          One tap tells your seven AI executives to brief you on everything that matters —
          leads, calls, content, revenue, and reputation.
        </p>

        {/* The Button */}
        <div style={{ position: "relative", display: "inline-block" }}>
          <button disabled style={{
            background: `linear-gradient(135deg, ${BRAND.blue} 0%, #0284C7 100%)`,
            color: BRAND.white, border: "none", borderRadius: 60,
            padding: "22px 64px", fontSize: 22, fontWeight: 800, letterSpacing: "-0.3px",
            cursor: "default", opacity: 0.9,
            boxShadow: `0 0 60px ${BRAND.blue}55, 0 20px 60px rgba(0,0,0,0.4)`,
          }}>
            🚀 Start My Day
          </button>
          <div style={{
            position: "absolute", top: -10, right: -10,
            background: BRAND.gold, color: "#030612",
            fontSize: 9, fontWeight: 900, letterSpacing: "1.5px",
            padding: "4px 10px", borderRadius: 20,
          }}>
            COMING SOON
          </div>
        </div>

        <div style={{ marginTop: 24, fontSize: 13, color: "#475569" }}>
          This feature goes live for all clients Q3 2026.
        </div>
      </div>
    </Slide>
  );
}

// ── Slide 6: Future Vision ────────────────────────────────────────────────────
function SlideFuture() {
  return (
    <Slide>
      <GlowBlob color="#A78BFA" size={500} top={-150} left={-100} opacity={0.1} />
      <GlowBlob color={BRAND.blue}  size={400} bottom={-100} right={-80} opacity={0.09} />

      <div style={{ textAlign: "center", marginBottom: 44 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "3px", color: "#A78BFA", textTransform: "uppercase", marginBottom: 16 }}>
          The Roadmap
        </div>
        <h2 style={{ fontSize: "clamp(28px, 4.5vw, 58px)", fontWeight: 800, color: BRAND.white, lineHeight: 1.1, margin: "0 0 16px", letterSpacing: "-1px" }}>
          This is just<br />
          <span style={{ color: "#A78BFA" }}>the beginning.</span>
        </h2>
        <p style={{ fontSize: 17, color: "#94A3B8", maxWidth: 480, margin: "0 auto" }}>
          The AI advantage compounds every day. The earlier you start, the further ahead you'll be.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, width: "100%", maxWidth: 720, marginBottom: 44 }}>
        {FUTURE_ITEMS.map(f => (
          <div key={f.title} style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(167,139,250,0.2)",
            borderRadius: 16, padding: "24px 22px", display: "flex", gap: 16, alignItems: "flex-start",
          }}>
            <div style={{ fontSize: 28, flexShrink: 0 }}>{f.emoji}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.white, marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.6 }}>{f.line}</div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 18, color: BRAND.white, fontWeight: 700, marginBottom: 20 }}>
          Ready to give your business an AI executive team?
        </p>
        <a href="https://aiedgesolutions.online/#contact" style={{
          display: "inline-block",
          background: BRAND.blue, color: BRAND.white,
          textDecoration: "none", borderRadius: 50,
          padding: "14px 36px", fontSize: 15, fontWeight: 700,
          boxShadow: `0 0 40px ${BRAND.blue}55`,
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.04)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
        >
          Get Started Today →
        </a>
        <div style={{ marginTop: 14, fontSize: 12, color: "#475569" }}>
          aiedgesolutions.online
        </div>
      </div>
    </Slide>
  );
}

// ── Slide registry ────────────────────────────────────────────────────────────
type SlideProps = { onNext: () => void };
const SLIDE_DEFS: Array<{ label: string; render: (p: SlideProps) => React.ReactNode }> = [
  { label: "Welcome",        render: p => <SlideWelcome {...p} /> },
  { label: "Morning Brief",  render: p => <SlideMorningBrief /> },
  { label: "AI Team",        render: p => <SlideTeam /> },
  { label: "BB&B Story",     render: p => <SlideBBB /> },
  { label: "Revenue Impact", render: p => <SlideRevenue /> },
  { label: "Start My Day",   render: p => <SlideStartMyDay /> },
  { label: "Future Vision",  render: p => <SlideFuture /> },
];

// ── Main Demo Page ─────────────────────────────────────────────────────────────
export default function DemoPage() {
  const [slide, setSlide] = useState(0);

  const go = useCallback((next: number) => {
    if (next < 0 || next >= TOTAL_SLIDES) return;
    setSlide(next);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") go(slide + 1);
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   go(slide - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [go, slide]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: BRAND.navy, overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
    }}>
      {/* ── Slides ── */}
      {SLIDE_DEFS.map((s, i) => (
        <div key={i} style={{
          position: "absolute", inset: 0,
          opacity:   i === slide ? 1 : 0,
          transform: i === slide ? "translateY(0px)" : i < slide ? "translateY(-32px)" : "translateY(32px)",
          transition: "opacity 0.65s cubic-bezier(0.4,0,0.2,1), transform 0.65s cubic-bezier(0.4,0,0.2,1)",
          pointerEvents: i === slide ? "auto" : "none",
        }}>
          {s.render({ onNext: () => go(slide + 1) })}
        </div>
      ))}

      {/* ── Top progress bar ── */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 2, background: "rgba(0,174,239,0.15)", zIndex: 100 }}>
        <div style={{
          height: "100%", background: BRAND.blue,
          width: `${((slide + 1) / TOTAL_SLIDES) * 100}%`,
          transition: "width 0.65s cubic-bezier(0.4,0,0.2,1)",
        }} />
      </div>

      {/* ── Logo top-left ── */}
      <div style={{ position: "fixed", top: 18, left: 24, zIndex: 100 }}>
        <img src={logoSrc} alt="AI Edge Solutions" style={{ height: 30, width: "auto", opacity: 0.85 }} />
      </div>

      {/* ── Slide label top-right ── */}
      <div style={{ position: "fixed", top: 20, right: 52, zIndex: 100, fontSize: 10, color: "#475569", fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase" }}>
        {slide + 1} / {TOTAL_SLIDES} — {SLIDE_DEFS[slide].label}
      </div>

      {/* ── Navigation dots (right side) ── */}
      <div style={{ position: "fixed", right: 20, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 10, zIndex: 100 }}>
        {SLIDE_DEFS.map((s, i) => (
          <button key={i} title={s.label} onClick={() => go(i)} style={{
            width: i === slide ? 8 : 6, height: i === slide ? 8 : 6,
            borderRadius: "50%", border: "none", cursor: "pointer", padding: 0,
            background: i === slide ? BRAND.blue : "rgba(255,255,255,0.25)",
            transform: i === slide ? "scale(1.3)" : "scale(1)",
            transition: "all 0.3s ease",
            outline: "none",
          }} />
        ))}
      </div>

      {/* ── Bottom navigation ── */}
      <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 12, zIndex: 100 }}>
        {slide > 0 && (
          <button onClick={() => go(slide - 1)} style={{
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
            color: BRAND.silver, borderRadius: 50, padding: "10px 24px",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            ← Back
          </button>
        )}
        {slide < TOTAL_SLIDES - 1 && (
          <button onClick={() => go(slide + 1)} style={{
            background: BRAND.blue, border: "none",
            color: BRAND.white, borderRadius: 50, padding: "10px 28px",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
            boxShadow: `0 4px 20px ${BRAND.blue}55`,
          }}>
            Next →
          </button>
        )}
        {slide === TOTAL_SLIDES - 1 && (
          <button onClick={() => go(0)} style={{
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
            color: BRAND.silver, borderRadius: 50, padding: "10px 24px",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>
            ↺ Restart
          </button>
        )}
      </div>
    </div>
  );
}
