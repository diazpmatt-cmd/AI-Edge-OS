// ── BB&B Growth Execution Dashboard ──────────────────────────────────────────
// Frontend only. Zero API calls. Every widget answers:
// "What should we do TODAY to get Bed Bugs & Beyond another paying customer?"

import { useState, useRef } from "react";
import { useLocation } from "wouter";

// ── Brand ─────────────────────────────────────────────────────────────────────
const B = {
  navy:    "#030612",
  panel:   "#080E1F",
  panel2:  "#0A1228",
  panel3:  "#0D1A2E",
  border:  "rgba(255,255,255,0.07)",
  blue:    "#00AEEF",
  cyan:    "#06B6D4",
  sky:     "#38BDF8",
  emerald: "#10B981",
  green:   "#22C55E",
  gold:    "#FBBF24",
  orange:  "#F97316",
  purple:  "#A78BFA",
  red:     "#F87171",
  silver:  "#94A3B8",
  white:   "#F1F5F9",
  dim:     "#64748B",
  bbbDark: "#0D2B45",
  bbbMid:  "#0077B6",
  bbbOrange:"#F26C21",
};

// ── Checklist items ────────────────────────────────────────────────────────────
const ACTION_ITEMS = [
  { id: "fb",     label: "Publish Facebook post",               icon: "📘", color: B.blue,   action: { label: "Open Publishing Center", route: "/admin/publishing",    disabled: false } },
  { id: "gbp",    label: "Publish Google Business Profile post", icon: "📍", color: B.green,  action: { label: "Open Publishing Center", route: "/admin/publishing",    disabled: false } },
  { id: "photo",  label: "Upload one completed job photo",      icon: "📸", color: B.orange, action: { label: "Open Media Engine",      route: "/admin/media-engine",  disabled: false } },
  { id: "review", label: "Request one Google review",           icon: "⭐", color: B.gold,   action: { label: "Open Review Engine",     route: "/admin/reviews",       disabled: false } },
  { id: "leads",  label: "Follow up with recovered leads",      icon: "🔥", color: B.orange, action: { label: "Open Lead Recovery",     route: "/admin/lead-recovery", disabled: false } },
  { id: "video",  label: "Record one 30-second video",          icon: "🎬", color: B.purple, action: { label: "Open Media Engine",      route: "/admin/media-engine",  disabled: false } },
  { id: "apple",  label: "Check Apple Business Connect",        icon: "🍎", color: B.silver, action: { label: "External Pending",       route: "",                     disabled: true  } },
  { id: "tiktok", label: "Check TikTok approval",               icon: "🎵", color: B.cyan,   action: { label: "External Pending",       route: "",                     disabled: true  } },
] as const;

type ActionId = typeof ACTION_ITEMS[number]["id"];

// ── Shot list items ───────────────────────────────────────────────────────────
const SHOT_ITEMS = [
  { id: "before",     label: "Before photo"                 },
  { id: "setup",      label: "Treatment setup photo"        },
  { id: "equipment",  label: "Product/equipment photo"      },
  { id: "working",    label: "Technician working photo"     },
  { id: "after",      label: "After photo"                  },
  { id: "video",      label: "10-second vertical video"     },
  { id: "permission", label: "Customer permission confirmed" },
] as const;
type ShotId = typeof SHOT_ITEMS[number]["id"];

// ── Script defaults ───────────────────────────────────────────────────────────
type ScriptKey = "review" | "missed" | "quote";
const SCRIPT_DEFAULTS: Record<ScriptKey, string> = {
  review: "Hi, this is Bed Bugs & Beyond. Thank you for trusting us with your pest control service today. If you were happy with our work, would you mind leaving us a quick Google review? It really helps our local family business.",
  missed: "Hi, this is Bed Bugs & Beyond. Sorry we missed your call. Do you still need help with bed bugs or pest control service in Baldwin County?",
  quote:  "Hi, this is Bed Bugs & Beyond. I just wanted to follow up on your pest control quote and see if you had any questions or wanted to get scheduled.",
};

// ── SEO targets ──────────────────────────────────────────────────────────────
type SeoStatus = "Target" | "In Progress" | "Needs Content";
const SEO_TARGETS: Array<{ area: string; keyword: string; status: SeoStatus }> = [
  { area: "Foley",          keyword: "bed bug treatment Foley AL",          status: "In Progress"   },
  { area: "Gulf Shores",    keyword: "bed bug exterminator Gulf Shores AL", status: "Target"        },
  { area: "Orange Beach",   keyword: "pest control Orange Beach AL",        status: "Target"        },
  { area: "Fairhope",       keyword: "bed bug removal Fairhope AL",         status: "Needs Content" },
  { area: "Daphne",         keyword: "pest control Daphne AL",              status: "Target"        },
  { area: "Spanish Fort",   keyword: "exterminator Spanish Fort AL",        status: "Needs Content" },
  { area: "Baldwin County", keyword: "bed bug treatment Baldwin County AL", status: "In Progress"   },
];
const SEO_STATUS_STYLE: Record<SeoStatus, { color: string; bg: string; border: string }> = {
  "Target":        { color: B.sky,     bg: "rgba(56,189,248,0.10)",  border: "rgba(56,189,248,0.25)"  },
  "In Progress":   { color: B.emerald, bg: "rgba(16,185,129,0.10)",  border: "rgba(16,185,129,0.25)"  },
  "Needs Content": { color: B.gold,    bg: "rgba(251,191,36,0.10)",  border: "rgba(251,191,36,0.25)"  },
};

// ── Weekly content ────────────────────────────────────────────────────────────
const WEEK_DAYS = [
  { day: "Monday",    icon: "📘", theme: "Facebook post — Bed Bug ID tips",           status: "scheduled" },
  { day: "Tuesday",   icon: "📍", theme: "Google Business post — after-job photo",    status: "draft"     },
  { day: "Wednesday", icon: "🎬", theme: "30-sec video — before/after treatment",     status: "pending"   },
  { day: "Thursday",  icon: "⭐", theme: "Review request follow-up email",            status: "pending"   },
  { day: "Friday",    icon: "📊", theme: "Weekly recap + weekend promo offer",        status: "pending"   },
] as const;

type DayStatus = "scheduled" | "draft" | "pending";
const DAY_STATUS_STYLE: Record<DayStatus, { label: string; color: string; bg: string; border: string }> = {
  scheduled: { label: "Scheduled", color: B.green,  bg: "rgba(34,197,94,0.1)",  border: "rgba(34,197,94,0.25)"  },
  draft:     { label: "Draft",     color: B.gold,   bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.25)" },
  pending:   { label: "Pending",   color: B.dim,    bg: "rgba(100,116,139,0.1)",border: "rgba(100,116,139,0.2)" },
};

// ── Success wall ──────────────────────────────────────────────────────────────
const WINS = [
  { icon: "★", label: "New 5-star review",        color: B.gold,    sub: "Google · 2 days ago"   },
  { icon: "🔥", label: "Lead recovered",           color: B.orange,  sub: "Missed call → booked"  },
  { icon: "📘", label: "Facebook post published",  color: B.blue,    sub: "Reached 340 people"    },
  { icon: "🎬", label: "Commercial created",       color: B.purple,  sub: "30-sec video · live"   },
  { icon: "🌐", label: "Website updated",          color: B.emerald, sub: "New services page"     },
];

// ── Scorecard ────────────────────────────────────────────────────────────────
const SCORECARD_GOALS = { calls: 25, leads: 10, jobs: 5, reviews: 5, posts: 5, media: 5 } as const;
type ScorecardKey = keyof typeof SCORECARD_GOALS;
function getScorecardStatus(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "Excellent Week",    color: "#22C55E" };
  if (score >= 70) return { label: "Strong Week",       color: "#10B981" };
  if (score >= 40) return { label: "Building Momentum", color: "#FBBF24" };
  return              { label: "Needs Work",           color: "#F87171" };
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children, accent = B.blue }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "22px 24px", marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: accent, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 16 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BBBExecutionPage() {
  const [, navigate] = useLocation();

  const [checked, setChecked] = useState<Record<ActionId, boolean>>({
    fb: false, gbp: false, photo: false, review: false,
    leads: false, video: false, apple: false, tiktok: false,
  });

  const completedCount = Object.values(checked).filter(Boolean).length;
  const totalActions   = ACTION_ITEMS.length;
  const pct            = Math.round((completedCount / totalActions) * 100);
  const missionDone    = completedCount === totalActions;

  function toggle(id: ActionId) {
    setChecked(c => ({ ...c, [id]: !c[id] }));
  }

  const [copied, setCopied]             = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [notes, setNotes]               = useState<Record<ActionId, string>>({
    fb: "", gbp: "", photo: "", review: "", leads: "", video: "", apple: "", tiktok: "",
  });
  const [showSummary, setShowSummary]   = useState(false);

  // Shot list state
  const [shotChecked, setShotChecked] = useState<Record<ShotId, boolean>>({
    before: false, setup: false, equipment: false, working: false,
    after: false, video: false, permission: false,
  });
  function toggleShot(id: ShotId) { setShotChecked(s => ({ ...s, [id]: !s[id] })); }
  const shotCount = Object.values(shotChecked).filter(Boolean).length;

  // Outreach script state
  const [activeScript, setActiveScript] = useState<ScriptKey>("review");
  const [scriptTexts, setScriptTexts]   = useState<Record<ScriptKey, string>>({ ...SCRIPT_DEFAULTS });
  const [scriptCopied, setScriptCopied] = useState(false);
  function copyScript() {
    const text = scriptTexts[activeScript];
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setScriptCopied(true);
        setTimeout(() => setScriptCopied(false), 2500);
      }).catch(() => {});
    }
  }

  // Review push tracker state
  const [reviewStats, setReviewStats] = useState({ asked: 0, received: 0, goal: 10 });
  function setReviewStat(key: "asked" | "received" | "goal", val: number) {
    setReviewStats(s => ({ ...s, [key]: isNaN(val) ? 0 : Math.max(0, val) }));
  }

  // Weekly Scorecard state
  const [scorecard, setScorecard] = useState<Record<ScorecardKey, number>>({
    calls: 0, leads: 0, jobs: 0, reviews: 0, posts: 0, media: 0,
  });
  function setScorecardStat(key: ScorecardKey, val: number) {
    setScorecard(s => ({ ...s, [key]: isNaN(val) ? 0 : Math.max(0, val) }));
  }
  const weeklyScore = Math.round(
    (Object.keys(SCORECARD_GOALS) as ScorecardKey[]).reduce((sum, k) => {
      return sum + Math.min(scorecard[k] / SCORECARD_GOALS[k], 1) * (100 / 6);
    }, 0)
  );

  const checklistRef = useRef<HTMLDivElement>(null);

  const nextBestAction = (() => {
    if (reviewStats.received < 2)  return { text: "Ask one completed customer for a Google review.",        icon: "⭐", color: B.gold,    route: "/admin/reviews"       };
    if (shotCount === 0)            return { text: "Capture one before/after photo or short job video.",     icon: "📸", color: B.orange,  route: "/admin/media-engine"  };
    if (completedCount < 4)        return { text: "Complete the highest-impact growth checklist item.",      icon: "✅", color: B.green,   route: "checklist"            };
    if (weeklyScore < 70)          return { text: "Publish one local content post for a target city.",      icon: "📍", color: B.sky,     route: "/admin/publishing"    };
    return                               { text: "Keep momentum going: follow up every new lead today.",    icon: "🔥", color: B.orange,  route: "/admin/lead-recovery" };
  })();

  function handleTakeAction() {
    if (nextBestAction.route === "checklist") {
      checklistRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      navigate(nextBestAction.route);
    }
  }

  function setNote(id: ActionId, val: string) {
    setNotes(n => ({ ...n, [id]: val }));
  }

  // Dynamic plan — includes per-item notes when filled
  const actionPlanText = [
    "Bed Bugs & Beyond — Today's Growth Action Plan",
    "",
    "Mission:",
    "Get one more booked inspection.",
    "",
    "Actions:",
    ...ACTION_ITEMS.map(item => {
      const box  = checked[item.id] ? "[x]" : "[ ]";
      const note = notes[item.id].trim();
      return note ? `${box} ${item.label}\n    Note: ${note}` : `${box} ${item.label}`;
    }),
    "",
    "Goal:",
    "Every completed task moves Bed Bugs & Beyond closer to another booked job.",
  ].join("\n");

  function copyActionPlan() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(actionPlanText).then(() => {
        setCopied(true);
        setShowFallback(false);
        setTimeout(() => setCopied(false), 2500);
      }).catch(() => {
        setShowFallback(true);
      });
    } else {
      setShowFallback(f => !f);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: B.navy, color: B.white, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div style={{
        background: `linear-gradient(135deg, ${B.bbbDark} 0%, #0A1A2E 60%, ${B.navy} 100%)`,
        borderBottom: `1px solid ${B.border}`, padding: "26px 36px 22px",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: 12, flexShrink: 0,
          background: `linear-gradient(135deg, rgba(242,108,33,0.3) 0%, rgba(0,119,182,0.2) 100%)`,
          border: `1px solid rgba(242,108,33,0.4)`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
        }}>🎯</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 21, fontWeight: 800, color: B.white, letterSpacing: "-0.3px" }}>
            Growth Execution Dashboard
          </div>
          <div style={{ fontSize: 12, color: B.dim, marginTop: 3 }}>
            Bed Bugs &amp; Beyond · Baldwin County, AL — What to do TODAY to book another job
          </div>
        </div>
        {/* Actions progress pill in header */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700,
            background: completedCount > 0 ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${completedCount > 0 ? "rgba(34,197,94,0.3)" : B.border}`,
            color: completedCount > 0 ? B.green : B.silver,
            borderRadius: 8, padding: "4px 12px",
          }}>
            {completedCount}/{totalActions} Actions Complete
          </span>
          <div style={{ height: 5, width: 120, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 99,
              width: `${pct}%`,
              background: missionDone ? `linear-gradient(90deg, ${B.green}, #4ADE80)` : `linear-gradient(90deg, ${B.bbbOrange}, ${B.gold})`,
              transition: "width 0.35s ease",
            }} />
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "28px 36px", maxWidth: 1100, margin: "0 auto" }}>

        {/* ── TODAY'S MISSION ── */}
        <div style={{
          background: `linear-gradient(135deg, ${B.bbbDark} 0%, #0A1E35 60%, ${B.panel} 100%)`,
          border: `1px solid rgba(242,108,33,0.3)`, borderRadius: 18,
          padding: "28px 32px", marginBottom: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20,
        }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, color: B.bbbOrange, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10 }}>
              🎯 Today's Mission
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: B.white, letterSpacing: "-0.5px", marginBottom: 8 }}>
              Get one more booked inspection.
            </div>
            <div style={{ fontSize: 13, color: B.silver, maxWidth: 520 }}>
              Every action below moves Bed Bugs &amp; Beyond closer to another paying customer. Check them off as you go.
            </div>
          </div>
          {/* Progress circle */}
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{
              width: 90, height: 90, borderRadius: "50%",
              background: missionDone
                ? `conic-gradient(${B.green} 100%, rgba(255,255,255,0.05) 0%)`
                : `conic-gradient(${B.bbbOrange} ${pct}%, rgba(255,255,255,0.05) 0%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.4s ease",
              boxShadow: missionDone ? `0 0 24px rgba(34,197,94,0.4)` : `0 0 18px rgba(242,108,33,0.3)`,
            }}>
              <div style={{
                width: 70, height: 70, borderRadius: "50%",
                background: B.bbbDark,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexDirection: "column",
              }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: missionDone ? B.green : B.white, lineHeight: 1 }}>
                  {missionDone ? "1" : "0"}
                </div>
                <div style={{ fontSize: 9, color: B.dim, marginTop: 2 }}>/ 1</div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: B.dim, marginTop: 8 }}>Inspections Booked</div>
          </div>
        </div>

        {/* ── 2-column grid ── */}
        <div ref={checklistRef} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

          {/* ── TODAY'S ACTIONS ── */}
          <Section title="✅ Today's Actions" accent={B.green}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: B.dim }}>{completedCount} of {totalActions} completed</span>
              <div style={{ height: 5, flex: 1, maxWidth: 100, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden", marginLeft: 10 }}>
                <div style={{
                  height: "100%", borderRadius: 99,
                  width: `${pct}%`,
                  background: pct === 100 ? `linear-gradient(90deg, ${B.green}, #4ADE80)` : `linear-gradient(90deg, ${B.blue}, ${B.sky})`,
                  transition: "width 0.3s ease",
                }} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {ACTION_ITEMS.map(item => {
                const done = checked[item.id];
                return (
                  <div key={item.id} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {/* Toggle row */}
                    <div
                      onClick={() => toggle(item.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        background: done ? `${item.color}10` : "rgba(255,255,255,0.02)",
                        border: `1px solid ${done ? `${item.color}35` : B.border}`,
                        borderRadius: 10, padding: "10px 12px",
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                    >
                      <span style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                        background: done ? item.color : "rgba(255,255,255,0.04)",
                        border: `1.5px solid ${done ? item.color : "rgba(255,255,255,0.15)"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, color: "#000", fontWeight: 900, transition: "all 0.15s",
                      }}>{done ? "✓" : ""}</span>
                      <span style={{ fontSize: 13 }}>{item.icon}</span>
                      <span style={{
                        fontSize: 12, fontWeight: done ? 600 : 400,
                        color: done ? B.silver : B.white,
                        textDecoration: done ? "line-through" : "none",
                        transition: "all 0.15s",
                      }}>{item.label}</span>
                      {done && <span style={{ marginLeft: "auto", fontSize: 10, color: B.green, fontWeight: 700 }}>Done ✓</span>}
                    </div>
                    {/* Action button */}
                    {(() => {
                      const act = item.action as { label: string; route: string; disabled: boolean };
                      return (
                        <button
                          disabled={act.disabled}
                          onClick={e => { e.stopPropagation(); if (!act.disabled && act.route) navigate(act.route); }}
                          style={{
                            alignSelf: "flex-start",
                            background: act.disabled ? "rgba(255,255,255,0.03)" : `${item.color}0F`,
                            border: `1px solid ${act.disabled ? "rgba(255,255,255,0.07)" : `${item.color}35`}`,
                            borderRadius: 6, padding: "3px 10px",
                            fontSize: 10.5, fontWeight: 700,
                            color: act.disabled ? B.dim : item.color,
                            cursor: act.disabled ? "not-allowed" : "pointer",
                            transition: "all 0.15s",
                            opacity: act.disabled ? 0.6 : 1,
                          }}
                        >
                          {act.label}{!act.disabled && " →"}
                        </button>
                      );
                    })()}
                    {/* Notes field */}
                    <input
                      type="text"
                      value={notes[item.id]}
                      onChange={e => setNote(item.id, e.target.value)}
                      onClick={e => e.stopPropagation()}
                      placeholder="Add result or reminder…"
                      style={{
                        width: "100%", boxSizing: "border-box" as const,
                        background: notes[item.id] ? `${item.color}08` : "rgba(255,255,255,0.02)",
                        border: `1px solid ${notes[item.id] ? `${item.color}40` : "rgba(255,255,255,0.05)"}`,
                        borderRadius: 7, padding: "5px 10px",
                        fontSize: 11, color: B.silver, fontFamily: "inherit",
                        outline: "none", transition: "border-color 0.15s",
                      }}
                      onFocus={e => { (e.target as HTMLInputElement).style.borderColor = `${item.color}60`; }}
                      onBlur={e => { (e.target as HTMLInputElement).style.borderColor = notes[item.id] ? `${item.color}40` : "rgba(255,255,255,0.05)"; }}
                    />
                  </div>
                );
              })}
            </div>

            {/* ── Copy Action Plan button ── */}
            <div style={{ marginTop: 14 }}>
              <button
                onClick={copyActionPlan}
                style={{
                  width: "100%",
                  background: copied
                    ? "rgba(16,185,129,0.12)"
                    : "rgba(56,189,248,0.08)",
                  border: `1px solid ${copied ? "rgba(16,185,129,0.35)" : "rgba(56,189,248,0.25)"}`,
                  borderRadius: 10, padding: "10px 0",
                  fontSize: 12.5, fontWeight: 700,
                  color: copied ? B.emerald : B.sky,
                  cursor: "pointer", transition: "all 0.2s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
                onMouseEnter={e => { if (!copied) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(56,189,248,0.14)"; } }}
                onMouseLeave={e => { if (!copied) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(56,189,248,0.08)"; } }}
              >
                {copied ? "✓ Copied!" : "📋 Copy Today's Action Plan"}
              </button>

              {/* Fallback textarea */}
              {showFallback && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10.5, color: B.gold, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>⚠️</span>
                    <span>Clipboard unavailable — select all and copy manually (Ctrl+A, Ctrl+C)</span>
                  </div>
                  <textarea
                    readOnly
                    value={actionPlanText}
                    onFocus={e => e.target.select()}
                    rows={18}
                    style={{
                      width: "100%", boxSizing: "border-box",
                      background: B.panel2, border: `1px solid rgba(251,191,36,0.3)`,
                      borderRadius: 8, padding: "10px 12px",
                      fontSize: 11.5, color: B.silver, lineHeight: 1.6,
                      resize: "none", fontFamily: "monospace", outline: "none",
                    }}
                  />
                </div>
              )}
            </div>

            {/* ── Apollos Daily Summary ── */}
            <div style={{ marginTop: 6 }}>
              <button
                onClick={() => setShowSummary(s => !s)}
                style={{
                  width: "100%",
                  background: showSummary ? "rgba(139,92,246,0.12)" : "rgba(139,92,246,0.07)",
                  border: `1px solid rgba(139,92,246,${showSummary ? "0.45" : "0.25"})`,
                  borderRadius: 10, padding: "10px 0",
                  fontSize: 12.5, fontWeight: 700,
                  color: "#C4B5FD",
                  cursor: "pointer", transition: "all 0.2s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                🤖 {showSummary ? "Hide Apollos Summary" : "Generate Apollos Daily Summary"}
              </button>

              {showSummary && (
                <div style={{
                  marginTop: 10,
                  background: "rgba(139,92,246,0.06)",
                  border: "1px solid rgba(139,92,246,0.25)",
                  borderRadius: 10, padding: "14px 16px",
                  display: "flex", flexDirection: "column", gap: 10,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#C4B5FD", display: "flex", alignItems: "center", gap: 7 }}>
                    <span>🤖</span>
                    <span>Apollos Summary</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 11.5, color: B.silver, lineHeight: 1.65 }}>
                    Today's focus is to complete the highest-impact growth actions for Bed Bugs &amp; Beyond.
                    Prioritize reviews, follow-up, visibility updates, and one piece of content that can
                    generate another booked inspection.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {[
                      { label: "Completed",  value: completedCount,             color: B.emerald, icon: "✅" },
                      { label: "Remaining",  value: totalActions - completedCount, color: B.gold,    icon: "⏳" },
                      { label: "Progress",   value: `${pct}%`,                  color: B.sky,     icon: "📈" },
                    ].map(stat => (
                      <div key={stat.label} style={{
                        background: `${stat.color}0D`,
                        border: `1px solid ${stat.color}30`,
                        borderRadius: 8, padding: "8px 10px",
                        display: "flex", flexDirection: "column", gap: 3, alignItems: "center",
                      }}>
                        <span style={{ fontSize: 14 }}>{stat.icon}</span>
                        <span style={{ fontSize: 16, fontWeight: 800, color: stat.color }}>{stat.value}</span>
                        <span style={{ fontSize: 9.5, color: B.dim, textTransform: "uppercase", letterSpacing: "0.05em" }}>{stat.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* ── LEAD GOALS + APOLLOS + SUCCESS WALL ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* ── LEAD GOALS ── */}
            <Section title="📊 Lead Goals" accent={B.cyan}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "Today's Calls",    value: "3",      icon: "📞", color: B.blue    },
                  { label: "Today's Leads",    value: "1",      icon: "🔥", color: B.orange  },
                  { label: "Quotes Sent",      value: "0",      icon: "📋", color: B.cyan    },
                  { label: "Jobs Booked",      value: "0",      icon: "✅", color: B.green   },
                  { label: "Revenue Estimate", value: "$0",     icon: "💰", color: B.gold    },
                ].map(m => (
                  <div key={m.label} style={{
                    background: `${m.color}0D`, border: `1px solid ${m.color}25`,
                    borderRadius: 10, padding: "12px 14px",
                  }}>
                    <div style={{ fontSize: 11, color: B.dim, marginBottom: 4 }}>{m.icon} {m.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>
            </Section>

            {/* ── APOLLOS FOCUS ── */}
            <Section title="🧠 Apollos Focus" accent={B.purple}>
              <div style={{
                background: "linear-gradient(135deg, rgba(167,139,250,0.08) 0%, rgba(6,182,212,0.05) 100%)",
                border: "1px solid rgba(167,139,250,0.2)", borderRadius: 12,
                padding: "14px 16px", marginBottom: 12,
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: B.purple, letterSpacing: "0.5px", marginBottom: 8 }}>
                  APOLLOS RECOMMENDATION
                </div>
                <div style={{ fontSize: 13.5, color: B.white, lineHeight: 1.65, fontStyle: "italic" }}>
                  "Today's highest ROI activity is requesting reviews from completed customers."
                </div>
              </div>
              <button
                onClick={() => navigate("/admin/apollos")}
                style={{
                  width: "100%",
                  background: "linear-gradient(135deg, rgba(167,139,250,0.15) 0%, rgba(6,182,212,0.1) 100%)",
                  border: "1px solid rgba(167,139,250,0.35)", borderRadius: 10,
                  padding: "10px 0", fontSize: 13, fontWeight: 700,
                  color: B.purple, cursor: "pointer", transition: "all 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(167,139,250,0.25) 0%, rgba(6,182,212,0.18) 100%)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(167,139,250,0.15) 0%, rgba(6,182,212,0.1) 100%)"; }}
              >
                🚀 Go — Open Apollos
              </button>
            </Section>

            {/* ── SUCCESS WALL ── */}
            <Section title="🏆 Success Wall — Recent Wins" accent={B.gold}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {WINS.map((w, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: `${w.color}0A`, border: `1px solid ${w.color}25`,
                    borderRadius: 10, padding: "10px 14px",
                  }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{w.icon}</span>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: B.white }}>{w.label}</div>
                      <div style={{ fontSize: 10.5, color: B.dim, marginTop: 1 }}>{w.sub}</div>
                    </div>
                    <span style={{
                      marginLeft: "auto", fontSize: 8, fontWeight: 800,
                      background: `${w.color}15`, border: `1px solid ${w.color}30`,
                      color: w.color, borderRadius: 5, padding: "2px 7px",
                    }}>WIN</span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>

        {/* ── THIS WEEK'S BB&B FOCUS ── */}
        <div style={{ padding: "0 36px", marginBottom: 20 }}>
          <div style={{
            background: B.panel, border: `1px solid ${B.border}`,
            borderRadius: 16, padding: "22px 24px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: B.bbbOrange, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 16 }}>
              📅 This Week's BB&amp;B Focus
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {[
                { icon: "⭐", text: "Get more reviews",                       color: B.gold    },
                { icon: "📍", text: "Publish consistent local content",       color: B.green   },
                { icon: "🔥", text: "Follow up with every recovered lead",    color: B.orange  },
                { icon: "📸", text: "Build trust with before/after photos",   color: B.cyan    },
                { icon: "🍎", text: "Finish Apple + TikTok approvals",        color: B.silver  },
              ].map(f => (
                <div key={f.text} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: `${f.color}08`, border: `1px solid ${f.color}20`,
                  borderRadius: 10, padding: "9px 14px",
                }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{f.icon}</span>
                  <span style={{ fontSize: 12.5, color: B.white, fontWeight: 500 }}>{f.text}</span>
                  <span style={{
                    marginLeft: "auto", width: 6, height: 6, borderRadius: "50%",
                    background: f.color, flexShrink: 0, opacity: 0.7,
                  }} />
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate("/admin/apollos")}
              style={{
                width: "100%",
                background: "linear-gradient(135deg, rgba(242,108,33,0.12) 0%, rgba(251,191,36,0.08) 100%)",
                border: "1px solid rgba(242,108,33,0.35)",
                borderRadius: 10, padding: "10px 0",
                fontSize: 13, fontWeight: 700,
                color: B.bbbOrange, cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(242,108,33,0.22) 0%, rgba(251,191,36,0.15) 100%)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(242,108,33,0.12) 0%, rgba(251,191,36,0.08) 100%)"; }}
            >
              🧠 Open Apollos Strategy
            </button>
          </div>
        </div>

        {/* ── THIS WEEK'S CONTENT ── */}
        <Section title="📅 This Week's Content" accent={B.sky}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
            {WEEK_DAYS.map(d => {
              const s = DAY_STATUS_STYLE[d.status];
              return (
                <div key={d.day} style={{
                  background: B.panel2, border: `1px solid ${B.border}`,
                  borderRadius: 12, padding: "14px 14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: B.silver }}>{d.day}</span>
                    <span style={{ fontSize: 7.5, fontWeight: 800, color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 5, padding: "2px 6px" }}>{s.label}</span>
                  </div>
                  <div style={{ fontSize: 18, marginBottom: 6 }}>{d.icon}</div>
                  <div style={{ fontSize: 11, color: B.dim, lineHeight: 1.5 }}>{d.theme}</div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── TWO-COLUMN: OUTREACH SCRIPTS + SHOT LIST ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, padding: "0 36px", marginBottom: 20 }}>

          {/* ── OUTREACH SCRIPTS ── */}
          <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "22px 24px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: B.bbbMid, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 16 }}>
              📞 Ready-to-Use Outreach Scripts
            </div>

            {/* Tab buttons */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {([
                { key: "review" as ScriptKey, label: "Review Request",    color: B.gold    },
                { key: "missed" as ScriptKey, label: "Missed Call",       color: B.orange  },
                { key: "quote"  as ScriptKey, label: "Quote Follow-Up",   color: B.emerald },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveScript(tab.key); setScriptCopied(false); }}
                  style={{
                    flex: 1,
                    background: activeScript === tab.key ? `${tab.color}18` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${activeScript === tab.key ? `${tab.color}45` : "rgba(255,255,255,0.07)"}`,
                    borderRadius: 8, padding: "6px 4px",
                    fontSize: 10, fontWeight: 700,
                    color: activeScript === tab.key ? tab.color : B.dim,
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Editable textarea */}
            <textarea
              value={scriptTexts[activeScript]}
              onChange={e => setScriptTexts(t => ({ ...t, [activeScript]: e.target.value }))}
              rows={5}
              style={{
                width: "100%", boxSizing: "border-box" as const,
                background: "rgba(255,255,255,0.02)",
                border: `1px solid rgba(255,255,255,0.08)`,
                borderRadius: 10, padding: "12px 14px",
                fontSize: 12, color: B.white, lineHeight: 1.65,
                fontFamily: "inherit", outline: "none", resize: "vertical",
                marginBottom: 10, transition: "border-color 0.15s",
              }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = "rgba(255,255,255,0.18)"; }}
              onBlur={e  => { (e.target as HTMLTextAreaElement).style.borderColor = "rgba(255,255,255,0.08)"; }}
            />

            {/* Copy Script button */}
            <button
              onClick={copyScript}
              style={{
                width: "100%",
                background: scriptCopied ? "rgba(16,185,129,0.12)" : "rgba(0,174,239,0.08)",
                border: `1px solid ${scriptCopied ? "rgba(16,185,129,0.35)" : "rgba(0,174,239,0.25)"}`,
                borderRadius: 10, padding: "9px 0",
                fontSize: 12, fontWeight: 700,
                color: scriptCopied ? B.emerald : B.blue,
                cursor: "pointer", transition: "all 0.2s",
              }}
            >
              {scriptCopied ? "✓ Copied!" : "📋 Copy Script"}
            </button>
          </div>

          {/* ── JOB CONTENT SHOT LIST ── */}
          <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "22px 24px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: B.purple, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 4 }}>
              📸 Job Content Shot List
            </div>
            <div style={{ fontSize: 11, color: B.dim, marginBottom: 14 }}>
              {shotCount} of {SHOT_ITEMS.length} captured
            </div>

            {/* Progress bar */}
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden", marginBottom: 14 }}>
              <div style={{
                height: "100%", borderRadius: 99,
                width: `${Math.round((shotCount / SHOT_ITEMS.length) * 100)}%`,
                background: shotCount === SHOT_ITEMS.length
                  ? `linear-gradient(90deg, ${B.green}, #4ADE80)`
                  : `linear-gradient(90deg, ${B.purple}, #C4B5FD)`,
                transition: "width 0.3s ease",
              }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {SHOT_ITEMS.map(shot => {
                const done = shotChecked[shot.id];
                return (
                  <div
                    key={shot.id}
                    onClick={() => toggleShot(shot.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: done ? "rgba(167,139,250,0.08)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${done ? "rgba(167,139,250,0.3)" : B.border}`,
                      borderRadius: 9, padding: "8px 12px",
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    <span style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      background: done ? B.purple : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${done ? B.purple : "rgba(255,255,255,0.15)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, color: "#fff", fontWeight: 900, transition: "all 0.15s",
                    }}>{done ? "✓" : ""}</span>
                    <span style={{
                      fontSize: 12, color: done ? B.silver : B.white,
                      textDecoration: done ? "line-through" : "none",
                      fontWeight: done ? 500 : 400, transition: "all 0.15s",
                    }}>{shot.label}</span>
                    {done && <span style={{ marginLeft: "auto", fontSize: 9, color: B.purple, fontWeight: 700 }}>✓</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── TWO-COLUMN: WEEKLY SCORECARD + NEXT BEST ACTION ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, padding: "0 36px", marginBottom: 20 }}>

          {/* ── WEEKLY GROWTH SCORECARD ── */}
          <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "22px 24px" }}>
            {(() => {
              const st = getScorecardStatus(weeklyScore);
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: B.emerald, letterSpacing: "1.5px", textTransform: "uppercase" }}>
                      📊 Weekly Growth Scorecard
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 24, fontWeight: 900, color: st.color }}>{weeklyScore}</span>
                      <div>
                        <div style={{ fontSize: 9, color: B.dim }}>/ 100</div>
                        <div style={{ fontSize: 9, fontWeight: 800, color: st.color }}>{st.label}</div>
                      </div>
                    </div>
                  </div>

                  {/* Score bar */}
                  <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden", marginBottom: 16 }}>
                    <div style={{
                      height: "100%", borderRadius: 99, width: `${weeklyScore}%`,
                      background: weeklyScore >= 90 ? `linear-gradient(90deg,${B.green},#4ADE80)` :
                                  weeklyScore >= 70 ? `linear-gradient(90deg,${B.emerald},#34D399)` :
                                  weeklyScore >= 40 ? `linear-gradient(90deg,${B.gold},${B.orange})` :
                                                     `linear-gradient(90deg,${B.red},#FB7185)`,
                      transition: "width 0.3s ease",
                    }} />
                  </div>

                  {/* Metric inputs */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {([
                      { key: "calls"   as ScorecardKey, label: "Calls",       icon: "📞", color: B.blue    },
                      { key: "leads"   as ScorecardKey, label: "Leads",       icon: "🔥", color: B.orange  },
                      { key: "jobs"    as ScorecardKey, label: "Jobs Booked", icon: "✅", color: B.green   },
                      { key: "reviews" as ScorecardKey, label: "Reviews",     icon: "⭐", color: B.gold    },
                      { key: "posts"   as ScorecardKey, label: "Posts",       icon: "📍", color: B.sky     },
                      { key: "media"   as ScorecardKey, label: "Media",       icon: "🎬", color: B.purple  },
                    ]).map(f => {
                      const goal = SCORECARD_GOALS[f.key];
                      const val  = scorecard[f.key];
                      const pctM = Math.min(val / goal, 1);
                      return (
                        <div key={f.key} style={{
                          background: `${f.color}08`, border: `1px solid ${f.color}22`,
                          borderRadius: 10, padding: "8px 10px",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 10, color: B.dim }}>{f.icon} {f.label}</span>
                            <span style={{ fontSize: 9, color: pctM >= 1 ? f.color : B.dim }}>{val}/{goal}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button onClick={() => setScorecardStat(f.key, val - 1)} style={{ width: 20, height: 20, borderRadius: 5, background: "rgba(255,255,255,0.04)", border: `1px solid ${B.border}`, color: B.silver, fontSize: 13, cursor: "pointer", flexShrink: 0, lineHeight: 1 }}>−</button>
                            <input
                              type="number" min={0} value={val}
                              onChange={e => setScorecardStat(f.key, parseInt(e.target.value, 10))}
                              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 16, fontWeight: 800, color: f.color, textAlign: "center" as const, fontFamily: "inherit", minWidth: 0 }}
                            />
                            <button onClick={() => setScorecardStat(f.key, val + 1)} style={{ width: 20, height: 20, borderRadius: 5, background: "rgba(255,255,255,0.04)", border: `1px solid ${B.border}`, color: B.silver, fontSize: 13, cursor: "pointer", flexShrink: 0, lineHeight: 1 }}>+</button>
                          </div>
                          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden", marginTop: 5 }}>
                            <div style={{ height: "100%", width: `${pctM * 100}%`, background: f.color, borderRadius: 99, transition: "width 0.2s ease" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>

          {/* ── NEXT BEST ACTION ── */}
          <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: nextBestAction.color, letterSpacing: "1.5px", textTransform: "uppercase" }}>
              🎯 Next Best Action
            </div>

            {/* Recommendation card */}
            <div style={{
              flex: 1,
              background: `${nextBestAction.color}0A`,
              border: `1px solid ${nextBestAction.color}30`,
              borderRadius: 14, padding: "20px 18px",
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 14, textAlign: "center" as const,
            }}>
              <span style={{ fontSize: 40 }}>{nextBestAction.icon}</span>
              <p style={{
                margin: 0, fontSize: 14, fontWeight: 600, color: B.white,
                lineHeight: 1.6, maxWidth: 260,
              }}>
                {nextBestAction.text}
              </p>
            </div>

            {/* State context */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "Checklist",  value: `${completedCount}/8`, color: B.green   },
                { label: "Reviews",    value: `${reviewStats.received} wk`, color: B.gold    },
                { label: "Score",      value: `${weeklyScore}%`,     color: B.emerald },
              ].map(s => (
                <div key={s.label} style={{
                  background: `${s.color}0D`, border: `1px solid ${s.color}25`,
                  borderRadius: 8, padding: "7px 8px", textAlign: "center" as const,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: B.dim, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Take Action button */}
            <button
              onClick={handleTakeAction}
              style={{
                width: "100%",
                background: `linear-gradient(135deg, ${nextBestAction.color}22 0%, ${nextBestAction.color}10 100%)`,
                border: `1px solid ${nextBestAction.color}40`,
                borderRadius: 10, padding: "11px 0",
                fontSize: 13, fontWeight: 800, color: nextBestAction.color,
                cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `linear-gradient(135deg, ${nextBestAction.color}35 0%, ${nextBestAction.color}18 100%)`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `linear-gradient(135deg, ${nextBestAction.color}22 0%, ${nextBestAction.color}10 100%)`; }}
            >
              Take Action →
            </button>
          </div>
        </div>

        {/* ── TWO-COLUMN: SEO TARGETS + REVIEW TRACKER ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, padding: "0 36px", marginBottom: 20 }}>

          {/* ── LOCAL SEO TARGETS ── */}
          <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "22px 24px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: B.sky, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 16 }}>
              📍 Local SEO Targets
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {SEO_TARGETS.map(t => {
                const ss = SEO_STATUS_STYLE[t.status];
                return (
                  <div key={t.area} style={{
                    background: "rgba(255,255,255,0.02)", border: `1px solid ${B.border}`,
                    borderRadius: 10, padding: "10px 12px",
                    display: "flex", flexDirection: "column", gap: 5,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: B.white }}>{t.area}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: "0.4px",
                        color: ss.color, background: ss.bg, border: `1px solid ${ss.border}`,
                        borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" as const,
                      }}>{t.status}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: B.dim, fontStyle: "italic" }}>{t.keyword}</div>
                    <button
                      onClick={() => navigate("/admin/publishing")}
                      style={{
                        alignSelf: "flex-start",
                        background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.22)",
                        borderRadius: 6, padding: "3px 10px",
                        fontSize: 10, fontWeight: 700, color: B.sky,
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                    >
                      Create Content →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── REVIEW PUSH TRACKER ── */}
          <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "22px 24px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: B.gold, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 16 }}>
              ⭐ Review Push Tracker
            </div>

            {/* Number inputs */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              {([
                { key: "asked"    as const, label: "Customers asked today",       color: B.blue    },
                { key: "received" as const, label: "Reviews received this week",  color: B.emerald },
                { key: "goal"     as const, label: "Review goal this month",      color: B.gold    },
              ]).map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 10.5, color: B.dim, marginBottom: 5 }}>{f.label}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={() => setReviewStat(f.key, reviewStats[f.key] - 1)}
                      style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(255,255,255,0.04)", border: `1px solid ${B.border}`, color: B.silver, fontSize: 16, cursor: "pointer", flexShrink: 0 }}
                    >−</button>
                    <input
                      type="number" min={0}
                      value={reviewStats[f.key]}
                      onChange={e => setReviewStat(f.key, parseInt(e.target.value, 10))}
                      style={{
                        flex: 1, background: `${f.color}0D`, border: `1px solid ${f.color}30`,
                        borderRadius: 8, padding: "7px 10px",
                        fontSize: 20, fontWeight: 800, color: f.color,
                        textAlign: "center" as const, outline: "none", fontFamily: "inherit",
                      }}
                    />
                    <button
                      onClick={() => setReviewStat(f.key, reviewStats[f.key] + 1)}
                      style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(255,255,255,0.04)", border: `1px solid ${B.border}`, color: B.silver, fontSize: 16, cursor: "pointer", flexShrink: 0 }}
                    >+</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            {(() => {
              const pctReview = reviewStats.goal > 0
                ? Math.min(100, Math.round((reviewStats.received / reviewStats.goal) * 100))
                : 0;
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: B.dim }}>Monthly review progress</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: pctReview >= 100 ? B.green : B.gold }}>{pctReview}%</span>
                  </div>
                  <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 99,
                      width: `${pctReview}%`,
                      background: pctReview >= 100
                        ? `linear-gradient(90deg, ${B.green}, #4ADE80)`
                        : `linear-gradient(90deg, ${B.gold}, ${B.orange})`,
                      transition: "width 0.3s ease",
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: B.dim, marginTop: 5 }}>
                    {reviewStats.received} received · {Math.max(0, reviewStats.goal - reviewStats.received)} remaining
                  </div>
                </div>
              );
            })()}

            {/* Reminder */}
            <div style={{
              background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.18)",
              borderRadius: 10, padding: "10px 14px",
              fontSize: 11, color: B.silver, lineHeight: 1.6, fontStyle: "italic",
            }}>
              "Reviews help BB&amp;B rank higher, build trust, and convert more local searchers into booked jobs."
            </div>
          </div>
        </div>

        {/* ── Bottom banner ── */}
        <div style={{
          background: `linear-gradient(135deg, ${B.bbbDark} 0%, #0A2035 50%, ${B.panel} 100%)`,
          border: `1px solid rgba(242,108,33,0.25)`, borderRadius: 14,
          padding: "18px 28px", display: "flex", alignItems: "center", gap: 18,
        }}>
          <span style={{ fontSize: 28, flexShrink: 0 }}>🎯</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: B.white, marginBottom: 3 }}>
              Every completed task moves Bed Bugs &amp; Beyond closer to another booked job.
            </div>
            <div style={{ fontSize: 11, color: B.dim }}>
              {completedCount === 0
                ? "Start with the first action — momentum builds from here."
                : completedCount === totalActions
                  ? "🎉 All actions complete! Great execution today."
                  : `${completedCount} of ${totalActions} done — keep going, you're ${pct}% through today's plan.`}
            </div>
          </div>
          {completedCount > 0 && (
            <div style={{ marginLeft: "auto", flexShrink: 0, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: B.bbbOrange }}>{pct}%</div>
              <div style={{ fontSize: 9, color: B.dim }}>Today's Plan</div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
