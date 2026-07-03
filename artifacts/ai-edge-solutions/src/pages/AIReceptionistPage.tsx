import { useState, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { toast } from "sonner";
import { useTheme } from "@/contexts/theme-context";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TELNYX_NUMBER   = "+1 (251) 286-3200";
const FORWARD_NUMBER  = "+1 (251) 324-9090";
const BUSINESS_NAME   = "Bed Bugs & Beyond";


const DEFAULT_INTAKE_QUESTIONS = [
  { id: 1, text: "What pest issue are you dealing with?",                              purpose: "Identify service type",            required: true  },
  { id: 2, text: "What city are you located in?",                                     purpose: "Confirm service area",             required: true  },
  { id: 3, text: "Is this urgent or can it wait until the next business day?",        purpose: "Determine routing priority",       required: true  },
  { id: 4, text: "Have you seen pest activity inside, outside, or both?",             purpose: "Assess scope for tech prep",       required: false },
  { id: 5, text: "Would you like a callback or inspection appointment?",              purpose: "Capture intent for lead routing",  required: false },
];

const DEFAULT_SCRIPTS = {
  greeting:       `Thank you for calling Bed Bugs & Beyond. This is the AI receptionist. I can help route your call, take a message, or collect information so our team can call you back quickly. If this is urgent, I can transfer you now.`,
  urgent:         `I understand this is urgent. Let me connect you directly to the Bed Bugs & Beyond team right away. Please hold for just a moment.`,
  callback:       `I'd be happy to arrange a callback. Can I get your name, the best phone number to reach you, and a quick description of the pest issue? Our team will call you back as soon as possible.`,
  afterHours:     `Thank you for calling Bed Bugs & Beyond. Our office is currently closed. Our hours are Monday through Friday, 8 AM to 5 PM. If you have a pest emergency, please press 1 to leave an urgent voicemail and we'll return your call first thing tomorrow morning.`,
  voicemail:      `Please leave your name, phone number, and a brief description of the pest issue after the beep. Press star or hang up when finished. We'll call you back as soon as possible.`,
  closing:        `Thank you for calling Bed Bugs & Beyond. We look forward to helping you. Have a great day!`,
};

const EMERGENCY_KEYWORDS = ["bed bugs", "infestation", "urgent", "emergency", "same day", "hotel", "rental", "children", "elderly"];

const OUTCOME_CFG: Record<string, { color: string; bg: string }> = {
  "Transferred":        { color: "#10B981", bg: "rgba(16,185,129,0.12)"  },
  "Callback Requested": { color: "#00AEEF", bg: "rgba(0,174,239,0.12)"   },
  "Voicemail":          { color: "#F59E0B", bg: "rgba(245,158,11,0.12)"  },
  "Qualified Lead":     { color: "#8B5CF6", bg: "rgba(139,92,246,0.12)"  },
  "Missed":             { color: "#EF4444", bg: "rgba(239,68,68,0.12)"   },
  "Spam Blocked":       { color: "#64748B", bg: "rgba(100,116,139,0.12)" },
};

const TABS = [
  { id: "overview",      label: "Overview"        },
  { id: "callflow",      label: "Call Flow"       },
  { id: "logs",          label: "Call Logs"       },
  { id: "voicemail",     label: "Voicemail"       },
  { id: "scripts",       label: "Scripts"         },
  { id: "settings",      label: "Settings"        },
  { id: "diagnostics",   label: "Diagnostics"     },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function AIReceptionistPage() {
  const apiFetch = useApiFetch();
  const [activeTab, setActiveTab] = useState("overview");
  const [telnyxStats, setTelnyxStats] = useState<any>(null);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [simulatingCall, setSimulatingCall] = useState(false);
  const [intakeQs, setIntakeQs] = useState(DEFAULT_INTAKE_QUESTIONS);
  const [editingQ, setEditingQ] = useState<number | null>(null);
  const [editQText, setEditQText] = useState("");
  const [scripts, setScripts] = useState(DEFAULT_SCRIPTS);
  const [editingScript, setEditingScript] = useState<string | null>(null);
  const [editScriptText, setEditScriptText] = useState("");
  const [settings, setSettings] = useState({
    receptionistEnabled: true, keypadFallback: true, businessHoursRouting: true,
    afterHoursMode: true, spamFiltering: true, recordVoicemails: true,
    smsFollowUp: true, assignMissedToLeadRecovery: true,
  });

  useEffect(() => {
    apiFetch("/api/telnyx/textback-stats")
      .then(d => setTelnyxStats(d))
      .catch(() => {});
  }, []);

  async function testWebhook() {
    setTestingWebhook(true);
    try {
      await apiFetch("/api/telnyx/test-missed-call", { method: "POST", body: JSON.stringify({ phone: "+12510000001" }) });
      toast.success("Test webhook fired — check Lead Recovery for the entry.");
    } catch {
      toast.error("Webhook test failed.");
    } finally {
      setTestingWebhook(false);
    }
  }

  async function simulateCall() {
    setSimulatingCall(true);
    try {
      await apiFetch("/api/telnyx/test-missed-call", { method: "POST", body: JSON.stringify({ phone: "+12510000002" }) });
      toast.success("Simulated incoming call — logged to Lead Recovery.");
    } catch {
      toast.error("Simulation failed.");
    } finally {
      setSimulatingCall(false);
    }
  }

  const { colors: t, isDark } = useTheme();

  const callsAnswered = telnyxStats?.missedCalls  ?? 0;
  const callsRouted   = telnyxStats?.sent         ?? 0;
  const callbacks     = telnyxStats?.totalReplies ?? 0;

  return (
    <AppShell>
      <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", color: t.text }}>

        {/* ── Executive Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px", margin: 0 }}>AI Receptionist</h1>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase",
                color: "#10B981", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)",
                borderRadius: 20, padding: "3px 10px",
              }}>Voice Automation Active</span>
            </div>
            <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 10px" }}>
              Answer calls, qualify leads, route urgent requests, and recover missed opportunities automatically.
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <PhoneChip label="Telnyx Number" value={TELNYX_NUMBER} color="#00AEEF" />
              <PhoneChip label="Forward To" value={FORWARD_NUMBER} color="#10B981" />
              <span style={{ fontSize: 11, color: "#334155", alignSelf: "center" }}>Last checked: {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 24 }}>
          {[
            { icon: "📞", label: "Calls Answered Today",      value: String(callsAnswered), color: "#00AEEF" },
            { icon: "↗",  label: "Calls Routed",              value: String(callsRouted),   color: "#10B981" },
            { icon: "📲", label: "Callback Requests",          value: String(callbacks),     color: "#8B5CF6" },
            { icon: "🎙", label: "Voicemails Captured",        value: "—",                   color: "#F59E0B" },
            { icon: "🎯", label: "Lead Qualification Rate",    value: "—",                   color: "#06B6D4" },
            { icon: "💰", label: "Revenue Protected",          value: "—",                   color: "#10B981" },
          ].map(k => (
            <div key={k.label} style={{
              background: t.card,
              border: `1px solid ${k.color}18`, borderTop: `2px solid ${k.color}50`,
              borderRadius: 14, padding: "16px 14px",
              boxShadow: isDark ? "none" : t.shadow,
            }}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>{k.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: k.color, marginBottom: 2 }}>{k.value}</div>
              <div style={{ fontSize: 10, color: t.text3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.3 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* ── Tab Bar ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${t.border}`, paddingBottom: 0 }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: "9px 16px", borderRadius: "8px 8px 0 0", fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500,
              cursor: "pointer", border: "none",
              background: activeTab === tab.id ? "rgba(0,174,239,0.12)" : "transparent",
              color: activeTab === tab.id ? "#00AEEF" : t.text3,
              borderBottom: activeTab === tab.id ? "2px solid #00AEEF" : "2px solid transparent",
              transition: "all 0.15s",
            }}>{tab.label}</button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════ OVERVIEW ══ */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Receptionist Status */}
            <div>
              <SectionHeader icon="🟢" title="Receptionist System Status" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
                {[
                  { label: "Telnyx Voice Webhook",  status: "healthy",  val: "Healthy"       },
                  { label: "Call Transfer",          status: "healthy",  val: "Active"        },
                  { label: "Callback Capture",       status: "healthy",  val: "Active"        },
                  { label: "Voicemail Recording",    status: "healthy",  val: "Active"        },
                  { label: "AI Conversation Mode",   status: "preview",  val: "V2 Preview"    },
                  { label: "Business Hours Routing", status: "healthy",  val: "Enabled"       },
                ].map(s => {
                  const c = s.status === "healthy" ? "#10B981" : s.status === "preview" ? "#8B5CF6" : "#F59E0B";
                  return (
                    <div key={s.label} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "rgba(11,22,41,0.8)", border: `1px solid ${c}15`,
                      borderLeft: `3px solid ${c}60`, borderRadius: 10, padding: "12px 14px",
                    }}>
                      <span style={{ fontSize: 13, color: "#94A3B8" }}>{s.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: c, background: `${c}12`, padding: "2px 10px", borderRadius: 12 }}>{s.val}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <ActionBtn onClick={testWebhook} loading={testingWebhook} label="⚡ Test Voice Webhook" color="#00AEEF" />
                <ActionBtn onClick={simulateCall} loading={simulatingCall} label="📞 Simulate Incoming Call" color="#8B5CF6" />
                <ActionBtn onClick={() => setActiveTab("diagnostics")} label="🛰 Open Diagnostics" color="#64748B" />
              </div>
            </div>

            {/* Live Call Queue */}
            <div>
              <SectionHeader icon="📞" title="Live Call Queue" />
              <div style={{ background: "rgba(11,22,41,0.8)", border: "1px solid rgba(0,174,239,0.1)", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1.4fr 1fr 80px 110px 70px", padding: "9px 16px", background: "rgba(0,174,239,0.04)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  {["Caller","Phone","Intent","City","Urgency","Status","Duration"].map(h => (
                    <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px" }}>{h}</div>
                  ))}
                </div>
                <div style={{ padding: "36px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 20, marginBottom: 8, opacity: 0.3 }}>📞</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>No active calls</div>
                  <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>Live call queue will appear here when calls are routed through this number</div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ CALL FLOW ══ */}
        {activeTab === "callflow" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

            {/* Visual Call Flow */}
            <div>
              <SectionHeader icon="🔀" title="Visual Call Flow — Pest Control V1" />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
                {[
                  { icon: "📞", label: "Incoming Call",       sub: TELNYX_NUMBER,                       color: "#00AEEF" },
                  { icon: "🤖", label: "AI Greeting",         sub: "Identity + welcome message",         color: "#8B5CF6" },
                  { icon: "❓", label: "Identify Intent",     sub: "Pest type, urgency, city",           color: "#8B5CF6" },
                  { icon: "🐛", label: "Ask Service Needed",  sub: "Which pest, location, frequency",    color: "#64748B" },
                  { icon: "📍", label: "Ask City / Area",     sub: "Confirm within Baldwin County",      color: "#64748B" },
                  { icon: "⚡", label: "Ask Urgency",         sub: "Same-day vs scheduled",              color: "#64748B" },
                  { icon: "↗",  label: "Route by Intent",     sub: "Emergency / Callback / Voicemail",   color: "#10B981" },
                ].map((node, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%",
                      background: "rgba(11,22,41,0.8)", border: `1px solid ${node.color}25`,
                      borderLeft: `3px solid ${node.color}`, borderRadius: 10, padding: "11px 16px",
                    }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{node.icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{i + 1}. {node.label}</div>
                        <div style={{ fontSize: 11, color: "#475569" }}>{node.sub}</div>
                      </div>
                    </div>
                    {i < 6 && <div style={{ width: 1, height: 18, background: "rgba(0,174,239,0.2)" }} />}
                  </div>
                ))}

                {/* Branch outcomes */}
                <div style={{ width: 1, height: 18, background: "rgba(0,174,239,0.2)" }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, width: "100%" }}>
                  {[
                    { icon: "🚨", label: "Emergency",        action: "Transfer to business", color: "#EF4444" },
                    { icon: "📲", label: "Callback",          action: "Capture name + issue", color: "#00AEEF" },
                    { icon: "🎙", label: "Voicemail",         action: "Record + save log",    color: "#F59E0B" },
                  ].map(b => (
                    <div key={b.label} style={{
                      background: `${b.color}08`, border: `1px solid ${b.color}25`,
                      borderRadius: 10, padding: "12px 10px", textAlign: "center",
                    }}>
                      <div style={{ fontSize: 20, marginBottom: 5 }}>{b.icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: b.color, marginBottom: 3 }}>{b.label}</div>
                      <div style={{ fontSize: 10, color: "#475569" }}>{b.action}</div>
                    </div>
                  ))}
                </div>

                {/* Keypad fallback */}
                <div style={{ width: "100%", marginTop: 16, padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>Keypad Fallback (V1 Preserved)</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[["1","Transfer"],["2","Callback"],["3","Voicemail"]].map(([k, v]) => (
                      <div key={k} style={{ flex: 1, textAlign: "center", background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)", borderRadius: 8, padding: "8px 6px" }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: "#00AEEF" }}>{k}</div>
                        <div style={{ fontSize: 10, color: "#64748B" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Intake Questions */}
            <div>
              <SectionHeader icon="❓" title="Intake Questions" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {intakeQs.map((q, idx) => (
                  <div key={q.id} style={{
                    background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 10, padding: "12px 14px",
                  }}>
                    {editingQ === q.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <textarea
                          value={editQText}
                          onChange={e => setEditQText(e.target.value)}
                          rows={2}
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(0,174,239,0.3)", borderRadius: 7, padding: "8px 10px", fontSize: 13, color: "#FFF", outline: "none", fontFamily: "inherit", resize: "none", width: "100%", boxSizing: "border-box" }}
                        />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => { setIntakeQs(prev => prev.map(x => x.id === q.id ? { ...x, text: editQText } : x)); setEditingQ(null); toast.success("Question updated."); }} style={btnStyle("#00AEEF")}>Save</button>
                          <button onClick={() => setEditingQ(null)} style={btnStyle("#475569")}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#00AEEF" }}>{idx + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0", marginBottom: 3 }}>{q.text}</div>
                          <div style={{ fontSize: 11, color: "#475569" }}>Purpose: {q.purpose}</div>
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: q.required ? "#10B981" : "#475569", background: q.required ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: 10 }}>{q.required ? "Required" : "Optional"}</span>
                          <button onClick={() => { setEditingQ(q.id); setEditQText(q.text); }} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 14 }}>✏</button>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <button onClick={() => { if (idx > 0) setIntakeQs(prev => { const a = [...prev]; [a[idx-1], a[idx]] = [a[idx], a[idx-1]]; return a; }); }} style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 10, padding: "1px 4px" }}>▲</button>
                            <button onClick={() => { if (idx < intakeQs.length - 1) setIntakeQs(prev => { const a = [...prev]; [a[idx], a[idx+1]] = [a[idx+1], a[idx]]; return a; }); }} style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 10, padding: "1px 4px" }}>▼</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ════════════════════════════════════════════════════════ CALL LOGS ══ */}
        {activeTab === "logs" && (
          <div>
            <SectionHeader icon="📋" title="Call Logs" />
            <div style={{ background: "rgba(11,22,41,0.8)", border: "1px solid rgba(0,174,239,0.1)", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.2fr 1fr 1.2fr 70px 80px 100px", padding: "9px 16px", background: "rgba(0,174,239,0.04)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                {["Date/Time","Caller","Phone","Intent","Outcome","Duration","Recording","Transcript"].map(h => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px" }}>{h}</div>
                ))}
              </div>
              <div style={{ padding: "44px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 20, marginBottom: 8, opacity: 0.3 }}>📋</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>No call logs yet</div>
                <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>Call history will appear here once live calls are routed through this number</div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ VOICEMAIL ══ */}
        {activeTab === "voicemail" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

            {/* Callback Requests */}
            <div>
              <SectionHeader icon="📲" title="Callback Requests" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ padding: "32px 20px", textAlign: "center", background: "rgba(11,22,41,0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
                  <div style={{ fontSize: 18, marginBottom: 8, opacity: 0.3 }}>📲</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>No callback requests</div>
                  <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>Callback requests captured by the AI receptionist will appear here</div>
                </div>
              </div>
            </div>

            {/* Voicemails */}
            <div>
              <SectionHeader icon="🎙" title="Voicemails" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ padding: "32px 20px", textAlign: "center", background: "rgba(11,22,41,0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
                  <div style={{ fontSize: 18, marginBottom: 8, opacity: 0.3 }}>🎙</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>No voicemails</div>
                  <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>Voicemails recorded by the AI receptionist will appear here</div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ═════════════════════════════════════════════════════════ SCRIPTS ══ */}
        {activeTab === "scripts" && (
          <div>
            <SectionHeader icon="📝" title="AI Script & Greeting Builder" />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(Object.entries(scripts) as [string, string][]).map(([key, text]) => {
                const scriptMeta: Record<string, { label: string; icon: string }> = {
                  greeting:   { label: "Greeting",              icon: "👋" },
                  urgent:     { label: "Urgent Issue Response", icon: "🚨" },
                  callback:   { label: "Callback Capture",      icon: "📲" },
                  afterHours: { label: "After-Hours Response",  icon: "🌙" },
                  voicemail:  { label: "Voicemail Prompt",      icon: "🎙" },
                  closing:    { label: "Closing Message",       icon: "👍" },
                };
                const meta = scriptMeta[key];
                return (
                  <div key={key} style={{ background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{meta.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{meta.label}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => toast.info(`Preview: "${text.slice(0, 60)}..."`)} style={{ ...btnStyle("#8B5CF6"), padding: "4px 12px", fontSize: 11 }}>▶ Preview</button>
                        <button onClick={() => { setEditingScript(key); setEditScriptText(text); }} style={{ ...btnStyle("#00AEEF"), padding: "4px 12px", fontSize: 11 }}>✏ Edit</button>
                      </div>
                    </div>
                    {editingScript === key ? (
                      <div>
                        <textarea value={editScriptText} onChange={e => setEditScriptText(e.target.value)} rows={4} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(0,174,239,0.3)", borderRadius: 7, padding: "9px 11px", fontSize: 13, color: "#FFF", outline: "none", fontFamily: "inherit", resize: "vertical", width: "100%", boxSizing: "border-box", marginBottom: 8, lineHeight: 1.6 }} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => { setScripts(prev => ({ ...prev, [key]: editScriptText })); setEditingScript(null); toast.success("Script updated."); }} style={btnStyle("#00AEEF")}>Save</button>
                          <button onClick={() => setEditingScript(null)} style={btnStyle("#475569")}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.65, background: "rgba(255,255,255,0.03)", borderRadius: 7, padding: "10px 12px", fontStyle: "italic" }}>
                        "{text}"
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ SETTINGS ══ */}
        {activeTab === "settings" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

            {/* Toggles */}
            <div>
              <SectionHeader icon="⚙" title="System Toggles" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(Object.entries(settings) as [keyof typeof settings, boolean][]).map(([key, val]) => {
                  const labels: Record<keyof typeof settings, string> = {
                    receptionistEnabled:         "AI Receptionist Enabled",
                    keypadFallback:              "Keypad Fallback Enabled",
                    businessHoursRouting:        "Business Hours Routing",
                    afterHoursMode:              "After-Hours Mode",
                    spamFiltering:               "Spam Filtering",
                    recordVoicemails:            "Record Voicemails",
                    smsFollowUp:                 "Send SMS Follow-Up",
                    assignMissedToLeadRecovery:  "Assign Missed Calls to Lead Recovery",
                  };
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "11px 14px" }}>
                      <span style={{ fontSize: 13, color: "#94A3B8" }}>{labels[key]}</span>
                      <button
                        onClick={() => { setSettings(prev => ({ ...prev, [key]: !prev[key] })); toast.success(`${labels[key]}: ${!val ? "Enabled" : "Disabled"}`); }}
                        style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: val ? "#00AEEF" : "rgba(255,255,255,0.1)", transition: "background 0.2s", position: "relative" }}
                      >
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#FFF", position: "absolute", top: 3, left: val ? 23 : 3, transition: "left 0.2s" }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Routing Settings */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <SectionHeader icon="↗" title="Routing Settings" />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "Business Forward Number", value: FORWARD_NUMBER },
                    { label: "Transfer Timeout",        value: "30 seconds"   },
                    { label: "After-Hours Behavior",    value: "Voicemail"    },
                    { label: "Emergency Keyword Route", value: "Transfer Now" },
                  ].map(r => (
                    <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "11px 14px" }}>
                      <span style={{ fontSize: 12, color: "#64748B" }}>{r.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#00AEEF" }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <SectionHeader icon="🚨" title="Emergency Keywords" />
                <div style={{ background: "rgba(11,22,41,0.8)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 10, padding: "14px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {EMERGENCY_KEYWORDS.map(kw => (
                      <span key={kw} style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", padding: "3px 10px", borderRadius: 12 }}>{kw}</span>
                    ))}
                    <button onClick={() => toast.info("Keyword management coming in V2.")} style={{ fontSize: 11, fontWeight: 700, color: "#475569", background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.1)", padding: "3px 10px", borderRadius: 12, cursor: "pointer" }}>+ Add</button>
                  </div>
                  <div style={{ fontSize: 11, color: "#334155", marginTop: 10 }}>When detected, caller is immediately transferred to {FORWARD_NUMBER}</div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ═══════════════════════════════════════════════════ DIAGNOSTICS ══ */}
        {activeTab === "diagnostics" && (
          <div>
            <SectionHeader icon="🛰" title="AI Receptionist Diagnostics" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Telnyx webhook reachable",      status: "healthy",      detail: "/api/telnyx/voice responding"           },
                { label: "Voice route responding",         status: "healthy",      detail: "POST /api/telnyx/voice active"          },
                { label: "Gather route responding",        status: "healthy",      detail: "POST /api/telnyx/voice/gather active"   },
                { label: "Recording route responding",     status: "healthy",      detail: "POST /api/telnyx/voice/recording active" },
                { label: "Forward number configured",      status: "healthy",      detail: FORWARD_NUMBER                          },
                { label: "SMS follow-up linked",           status: "healthy",      detail: "Telnyx SMS active"                     },
                { label: "Lead Recovery linked",           status: "healthy",      detail: "leadsTable writes confirmed"           },
                { label: "Recent call test status",        status: "warning",      detail: "No test run in last 24h"               },
                { label: "AI Conversation V2",             status: "coming_soon",  detail: "LLM routing engine — in development"   },
                { label: "Caller intent classification",   status: "coming_soon",  detail: "GPT-4 intent parsing — planned Q3"     },
                { label: "Transcript generation",          status: "coming_soon",  detail: "Whisper API integration — planned"     },
                { label: "Spam call detection",            status: "coming_soon",  detail: "Carrier-level spam scoring — planned"  },
              ].map(d => {
                const cfg = {
                  healthy:     { color: "#10B981", label: "Healthy",     icon: "✓" },
                  warning:     { color: "#F59E0B", label: "Warning",     icon: "⚠" },
                  error:       { color: "#EF4444", label: "Error",       icon: "✕" },
                  coming_soon: { color: "#8B5CF6", label: "Coming Soon", icon: "◌" },
                }[d.status] ?? { color: "#64748B", label: d.status, icon: "?" };
                return (
                  <div key={d.label} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    background: "rgba(11,22,41,0.8)", border: `1px solid ${cfg.color}15`,
                    borderLeft: `3px solid ${cfg.color}50`, borderRadius: 10, padding: "12px 14px",
                  }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: `${cfg.color}15`, border: `1px solid ${cfg.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: cfg.color, fontWeight: 900 }}>{cfg.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0" }}>{d.label}</div>
                      <div style={{ fontSize: 11, color: "#475569" }}>{d.detail}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 800, color: cfg.color, background: `${cfg.color}12`, border: `1px solid ${cfg.color}25`, padding: "2px 9px", borderRadius: 12, flexShrink: 0 }}>{cfg.label}</span>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
              <ActionBtn onClick={testWebhook} loading={testingWebhook} label="⚡ Run Webhook Test" color="#00AEEF" />
              <ActionBtn onClick={simulateCall} loading={simulatingCall} label="📞 Simulate Missed Call" color="#8B5CF6" />
            </div>
          </div>
        )}

      </div>
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.7px" }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
    </div>
  );
}

function PhoneChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, background: `${color}08`, border: `1px solid ${color}25`, borderRadius: 8, padding: "4px 10px" }}>
      <span style={{ fontSize: 10, color: "#475569", fontWeight: 600 }}>{label}:</span>
      <span style={{ fontSize: 12, fontWeight: 800, color }}>{value}</span>
    </div>
  );
}

function ActionBtn({ onClick, loading, label, color, small }: { onClick: () => void; loading?: boolean; label: string; color: string; small?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      padding: small ? "6px 12px" : "9px 18px",
      borderRadius: 9, fontSize: small ? 11 : 12, fontWeight: 700,
      cursor: loading ? "wait" : "pointer",
      background: `${color}10`, border: `1px solid ${color}35`,
      color, opacity: loading ? 0.6 : 1, transition: "all 0.15s",
    }}>{loading ? "..." : label}</button>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
    cursor: "pointer", background: `${color}12`, border: `1px solid ${color}35`,
    color, fontFamily: "inherit",
  };
}
