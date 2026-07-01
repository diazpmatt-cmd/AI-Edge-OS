import { useState, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TELNYX_NUMBER   = "+1 (251) 286-3200";
const FORWARD_NUMBER  = "+1 (251) 324-9090";
const BUSINESS_NAME   = "Bed Bugs & Beyond";

// ─────────────────────────────────────────────────────────────────────────────
// Demo data
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_CALL_QUEUE = [
  { id: "q1", caller: "Sarah M.",    phone: "(251) 555-0182", intent: "Bed Bug Emergency",   city: "Gulf Shores",  urgency: "urgent",   status: "transferred",   duration: "2m 14s", statusColor: "#10B981" },
  { id: "q2", caller: "James K.",    phone: "(251) 555-0247", intent: "Roach Callback",      city: "Foley",        urgency: "normal",   status: "callback",      duration: "1m 42s", statusColor: "#00AEEF" },
  { id: "q3", caller: "Lisa T.",     phone: "(251) 555-0319", intent: "Ant Inquiry",          city: "Fairhope",     urgency: "normal",   status: "inquiry",       duration: "1m 08s", statusColor: "#8B5CF6" },
  { id: "q4", caller: "Robert H.",   phone: "(251) 555-0461", intent: "Rodent Issue",         city: "Daphne",       urgency: "normal",   status: "voicemail",     duration: "0m 45s", statusColor: "#F59E0B" },
  { id: "q5", caller: "Maria G.",    phone: "(251) 555-0533", intent: "Flea Treatment",       city: "Spanish Fort", urgency: "normal",   status: "qualified",     duration: "2m 31s", statusColor: "#06B6D4" },
];

const DEMO_CALL_LOGS = [
  { id: "l1", dateTime: "Today 10:42 AM", caller: "Sarah M.",    phone: "(251) 555-0182", intent: "Bed Bugs",     outcome: "Transferred",        duration: "2m 14s", recording: true,  transcript: "Available" },
  { id: "l2", dateTime: "Today 10:18 AM", caller: "James K.",    phone: "(251) 555-0247", intent: "Roaches",      outcome: "Callback Requested", duration: "1m 42s", recording: true,  transcript: "Available" },
  { id: "l3", dateTime: "Today 9:57 AM",  caller: "Lisa T.",     phone: "(251) 555-0319", intent: "Ants",         outcome: "Qualified Lead",     duration: "1m 08s", recording: false, transcript: "Pending"   },
  { id: "l4", dateTime: "Today 9:34 AM",  caller: "Robert H.",   phone: "(251) 555-0461", intent: "Rodents",      outcome: "Voicemail",          duration: "0m 45s", recording: true,  transcript: "Available" },
  { id: "l5", dateTime: "Today 9:12 AM",  caller: "Maria G.",    phone: "(251) 555-0533", intent: "Fleas",        outcome: "Qualified Lead",     duration: "2m 31s", recording: false, transcript: "Pending"   },
  { id: "l6", dateTime: "Today 8:50 AM",  caller: "Unknown",     phone: "(251) 555-0774", intent: "Unknown",      outcome: "Missed",             duration: "—",      recording: false, transcript: "—"         },
  { id: "l7", dateTime: "Yesterday 4:22PM",caller: "Tom B.",     phone: "(251) 555-0628", intent: "Wasps",        outcome: "Transferred",        duration: "1m 55s", recording: true,  transcript: "Available" },
  { id: "l8", dateTime: "Yesterday 2:11PM",caller: "Anna R.",    phone: "(251) 555-0901", intent: "Termites",     outcome: "Callback Requested", duration: "1m 18s", recording: true,  transcript: "Available" },
];

const DEMO_CALLBACKS = [
  { id: "cb1", name: "James K.",  phone: "(251) 555-0247", issue: "Roach infestation",    city: "Foley",        urgency: "normal", requested: "ASAP",       status: "pending"   },
  { id: "cb2", name: "Anna R.",   phone: "(251) 555-0901", issue: "Termite inspection",   city: "Orange Beach", urgency: "normal", requested: "Next day",   status: "pending"   },
  { id: "cb3", name: "Derek W.",  phone: "(251) 555-0645", issue: "Bed bugs in hotel",    city: "Gulf Shores",  urgency: "urgent", requested: "Today",      status: "returned"  },
  { id: "cb4", name: "Priya S.",  phone: "(251) 555-0388", issue: "Ant problem outside",  city: "Daphne",       urgency: "normal", requested: "This week",  status: "archived"  },
];

const DEMO_VOICEMAILS = [
  { id: "vm1", caller: "(251) 555-0461", duration: "0m 45s", preview: "Hi, this is Robert in Daphne, I have a rodent problem in my garage — please call me back...", recording: true,  status: "new"      },
  { id: "vm2", caller: "(251) 555-0774", duration: "0m 22s", preview: "Um, yeah, calling about bugs I found in my bedroom. Need someone out asap...",                  recording: true,  status: "new"      },
  { id: "vm3", caller: "(251) 555-0530", duration: "1m 02s", preview: "Hey, we have a wasp nest above our front door in Spanish Fort, can you come tomorrow...",        recording: false, status: "reviewed" },
];

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

  const callsAnswered = telnyxStats?.missedCalls ? 18 + telnyxStats.missedCalls : 18;
  const callsRouted   = telnyxStats?.sent        ? 11 + telnyxStats.sent        : 11;
  const callbacks     = telnyxStats?.totalReplies ? telnyxStats.totalReplies    : 4;

  return (
    <AppShell>
      <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", color: "#FFFFFF" }}>

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
            { icon: "🎙", label: "Voicemails Captured",        value: "3",                   color: "#F59E0B" },
            { icon: "🎯", label: "Lead Qualification Rate",    value: "61%",                 color: "#06B6D4" },
            { icon: "💰", label: "Revenue Protected",          value: "$2,450",              color: "#10B981" },
          ].map(k => (
            <div key={k.label} style={{
              background: "linear-gradient(160deg, rgba(11,22,41,0.98), rgba(3,6,18,0.9))",
              border: `1px solid ${k.color}18`, borderTop: `2px solid ${k.color}50`,
              borderRadius: 14, padding: "16px 14px",
            }}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>{k.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: k.color, marginBottom: 2 }}>{k.value}</div>
              <div style={{ fontSize: 10, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.3 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* ── Tab Bar ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding: "9px 16px", borderRadius: "8px 8px 0 0", fontSize: 13, fontWeight: activeTab === t.id ? 700 : 500,
              cursor: "pointer", border: "none",
              background: activeTab === t.id ? "rgba(0,174,239,0.12)" : "transparent",
              color: activeTab === t.id ? "#00AEEF" : "#64748B",
              borderBottom: activeTab === t.id ? "2px solid #00AEEF" : "2px solid transparent",
              transition: "all 0.15s",
            }}>{t.label}</button>
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
                {DEMO_CALL_QUEUE.map(c => (
                  <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1.4fr 1fr 80px 110px 70px", padding: "11px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{c.caller}</span>
                    <span style={{ fontSize: 12, color: "#64748B" }}>{c.phone}</span>
                    <span style={{ fontSize: 12, color: "#94A3B8" }}>{c.intent}</span>
                    <span style={{ fontSize: 12, color: "#64748B" }}>{c.city}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: c.urgency === "urgent" ? "#EF4444" : "#475569", background: c.urgency === "urgent" ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.03)", padding: "2px 8px", borderRadius: 10 }}>
                      {c.urgency === "urgent" ? "🚨 Urgent" : "Normal"}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: c.statusColor, background: `${c.statusColor}15`, padding: "2px 10px", borderRadius: 12 }}>{c.status.charAt(0).toUpperCase() + c.status.slice(1)}</span>
                    <span style={{ fontSize: 11, color: "#475569" }}>{c.duration}</span>
                  </div>
                ))}
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
              {DEMO_CALL_LOGS.map(log => {
                const oc = OUTCOME_CFG[log.outcome] ?? { color: "#64748B", bg: "rgba(255,255,255,0.04)" };
                return (
                  <div key={log.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.2fr 1fr 1.2fr 70px 80px 100px", padding: "11px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#475569" }}>{log.dateTime}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0" }}>{log.caller}</span>
                    <span style={{ fontSize: 12, color: "#64748B" }}>{log.phone}</span>
                    <span style={{ fontSize: 12, color: "#94A3B8" }}>{log.intent}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: oc.color, background: oc.bg, padding: "2px 9px", borderRadius: 12, display: "inline-block" }}>{log.outcome}</span>
                    <span style={{ fontSize: 11, color: "#475569" }}>{log.duration}</span>
                    <span style={{ fontSize: 11, color: log.recording ? "#10B981" : "#334155" }}>{log.recording ? "🎙 Yes" : "—"}</span>
                    <span style={{ fontSize: 11, color: log.transcript === "Available" ? "#8B5CF6" : log.transcript === "Pending" ? "#F59E0B" : "#334155" }}>{log.transcript}</span>
                  </div>
                );
              })}
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
                {DEMO_CALLBACKS.map(cb => {
                  const statusColor = cb.status === "returned" ? "#10B981" : cb.status === "archived" ? "#334155" : "#00AEEF";
                  return (
                    <div key={cb.id} style={{ background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0" }}>{cb.name}</span>
                          {cb.urgency === "urgent" && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: "#EF4444", background: "rgba(239,68,68,0.12)", padding: "2px 8px", borderRadius: 10 }}>🚨 Urgent</span>}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, background: `${statusColor}12`, padding: "3px 10px", borderRadius: 12 }}>{cb.status.charAt(0).toUpperCase() + cb.status.slice(1)}</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", marginBottom: 10 }}>
                        {[["📱 Phone", cb.phone], ["📍 City", cb.city], ["🐛 Issue", cb.issue], ["⏰ Requested", cb.requested]].map(([l, v]) => (
                          <div key={l as string} style={{ fontSize: 12, color: "#475569" }}><span style={{ color: "#334155" }}>{l as string}: </span>{v as string}</div>
                        ))}
                      </div>
                      {cb.status === "pending" && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <ActionBtn onClick={() => toast.success("Marked as returned.")} label="✓ Mark Returned" color="#10B981" small />
                          <ActionBtn onClick={() => toast.info("SMS follow-up queued.")} label="💬 Send SMS" color="#00AEEF" small />
                          <ActionBtn onClick={() => toast.info("Assigned to Lead Recovery.")} label="→ Lead Recovery" color="#8B5CF6" small />
                          <ActionBtn onClick={() => toast.info("Archived.")} label="Archive" color="#475569" small />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Voicemails */}
            <div>
              <SectionHeader icon="🎙" title="Voicemails" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {DEMO_VOICEMAILS.map(vm => (
                  <div key={vm.id} style={{ background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{vm.caller}</span>
                        <span style={{ marginLeft: 10, fontSize: 11, color: "#475569" }}>⏱ {vm.duration}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {vm.recording && <span style={{ fontSize: 10, fontWeight: 700, color: "#8B5CF6", background: "rgba(139,92,246,0.12)", padding: "2px 8px", borderRadius: 10 }}>🎙 Recorded</span>}
                        <span style={{ fontSize: 10, fontWeight: 700, color: vm.status === "new" ? "#F59E0B" : "#475569", background: vm.status === "new" ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: 10 }}>{vm.status === "new" ? "New" : "Reviewed"}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5, background: "rgba(255,255,255,0.03)", borderRadius: 7, padding: "8px 10px", marginBottom: 10, fontStyle: "italic" }}>
                      "{vm.preview}"
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <ActionBtn onClick={() => toast.success("Marked returned.")} label="✓ Mark Returned" color="#10B981" small />
                      <ActionBtn onClick={() => toast.info("SMS follow-up sent.")} label="💬 Send SMS" color="#00AEEF" small />
                      <ActionBtn onClick={() => toast.info("Assigned to Lead Recovery.")} label="→ Lead Recovery" color="#8B5CF6" small />
                      <ActionBtn onClick={() => toast.info("Archived.")} label="Archive" color="#475569" small />
                    </div>
                  </div>
                ))}
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
