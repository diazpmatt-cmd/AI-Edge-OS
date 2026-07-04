import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { useTheme } from "@/contexts/theme-context";

// ─────────────────────────────────────────────────────────────────────────────
// Types + Constants
// ─────────────────────────────────────────────────────────────────────────────

type Settings = {
  id: string | null;
  clientId: string;
  businessName: string;
  transferPhone: string;
  greetingScript: string;
  callbackMessage: string;
  voicemailMessage: string;
  textRoutingMessage: string;
  customGreetingUrl: string;
  voiceStyle: string;
  businessHoursJson: string;
  afterHoursMode: string;
};

const DEFAULT_SETTINGS: Settings = {
  id:                 null,
  clientId:           "default",
  businessName:       "Bed Bugs & Beyond",
  transferPhone:      "+12513249090",
  greetingScript:     "Hi, thank you for calling Bed Bugs and Beyond Pest Control. To speak directly with us, press 1. To request a callback, press 2. To leave a voicemail, press 3. To receive a text with our info, press 4.",
  callbackMessage:    "Thank you! We have received your callback request and will call you back as soon as possible. Have a great day!",
  voicemailMessage:   "Please leave your name, phone number, and a brief description of the pest issue after the beep. Press star or hang up when finished.",
  textRoutingMessage: "Hi! This is Bed Bugs & Beyond. You requested our info via text. Visit us at bedbugsbeyond.com or call (251) 324-9090. Reply with any questions!",
  customGreetingUrl:  "",
  voiceStyle:         "Polly.Joanna",
  businessHoursJson:  "{}",
  afterHoursMode:     "voicemail",
};

const TELNYX_NUMBER  = "+1 (251) 286-3200";
const VOICE_OPTIONS  = ["Polly.Joanna", "Polly.Matthew", "Polly.Salli", "Polly.Joey", "Polly.Kendra"];
const AFTER_HOURS_OPTIONS = [
  { val: "voicemail",    label: "Send to Voicemail" },
  { val: "transfer",     label: "Transfer Anyway"   },
  { val: "sms",          label: "Send Text Only"    },
  { val: "closed",       label: "Play Closed Message" },
];

const TABS = [
  { id: "overview",  label: "Overview"  },
  { id: "callflow",  label: "Call Flow" },
  { id: "settings",  label: "⚙ Settings" },
  { id: "test",      label: "🧪 Test"   },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function AIReceptionistPage() {
  const apiFetch = useApiFetch();
  const { colors: t, isDark } = useTheme();

  const [activeTab, setActiveTab] = useState("overview");
  const [settings, setSettings]   = useState<Settings>(DEFAULT_SETTINGS);
  const [form, setForm]           = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  const [testDigit, setTestDigit] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [smsTo, setSmsTo]         = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState<string | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const data = await apiFetch<Settings>("/api/ai-receptionist/settings?clientId=default");
      const merged = { ...DEFAULT_SETTINGS, ...data };
      setSettings(merged);
      setForm(merged);
    } catch {
      // keep defaults
    } finally {
      setSettingsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const saved = await apiFetch<Settings>("/api/ai-receptionist/settings?clientId=default", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName:       form.businessName,
          transferPhone:      form.transferPhone,
          greetingScript:     form.greetingScript,
          callbackMessage:    form.callbackMessage,
          voicemailMessage:   form.voicemailMessage,
          textRoutingMessage: form.textRoutingMessage,
          customGreetingUrl:  form.customGreetingUrl || null,
          voiceStyle:         form.voiceStyle,
          afterHoursMode:     form.afterHoursMode,
        }),
      });
      const merged = { ...DEFAULT_SETTINGS, ...saved };
      setSettings(merged);
      setForm(merged);
      showToast("Settings saved — live on next call");
    } catch {
      showToast("Failed to save settings", false);
    } finally {
      setSaving(false);
    }
  };

  const testCallFlow = async (digit: string) => {
    setTestDigit(digit);
    setTestLoading(true);
    setTestResult(null);
    try {
      const data = await apiFetch<any>("/api/ai-receptionist/test-call-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digit, clientId: "default" }),
      });
      setTestResult(data);
    } catch {
      setTestResult({ error: "Test failed — check API server" });
    } finally {
      setTestLoading(false);
    }
  };

  const sendTestSms = async () => {
    if (!smsTo) return;
    setSmsSending(true);
    setSmsResult(null);
    try {
      const data = await apiFetch<any>("/api/ai-receptionist/test-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: smsTo, clientId: "default" }),
      });
      setSmsResult(data.ok ? `✅ SMS sent (ID: ${data.messageId ?? "ok"})` : `❌ ${data.error}`);
    } catch {
      setSmsResult("❌ Send failed — check Telnyx key");
    } finally {
      setSmsSending(false);
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: isDark ? "#0B1629" : "#F8FAFC",
    border: `1px solid ${isDark ? "rgba(0,174,239,0.12)" : "#E2E8F0"}`,
    borderRadius: 12, padding: "20px 22px",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    background: isDark ? "#060E1E" : "#fff",
    border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
    color: t.text, borderRadius: 8, padding: "9px 12px",
    fontSize: 14, outline: "none", fontFamily: "inherit",
  };

  const label = (text: string, sub?: string) => (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{text}</div>
      {sub && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>{sub}</div>}
    </div>
  );

  const sectionHead = (icon: string, title: string) => (
    <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>
      <span>{icon}</span>{title}
    </div>
  );

  const changed = JSON.stringify(form) !== JSON.stringify(settings);

  return (
    <AppShell>
      <div style={{ padding: "24px 28px", maxWidth: 1100, margin: "0 auto", fontFamily: "'Inter', -apple-system, sans-serif", color: t.text }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
              <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>AI Receptionist</h1>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#22C55E", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 20, padding: "3px 10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Active</span>
            </div>
            <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>
              Configure call routing, messages, and Press 4 text routing for {settings.businessName}.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: isDark ? "#0A1020" : "#F1F5F9", border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`, borderRadius: 10, padding: "8px 14px" }}>
            <span style={{ fontSize: 11, color: "#6B7280" }}>Telnyx Number</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#00AEEF", fontFamily: "monospace" }}>{TELNYX_NUMBER}</span>
          </div>
        </div>

        {/* Tab Bar */}
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`, marginBottom: 24 }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: "9px 16px", border: "none", borderRadius: "8px 8px 0 0",
              fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500,
              cursor: "pointer",
              background: activeTab === tab.id ? "rgba(0,174,239,0.1)" : "transparent",
              color: activeTab === tab.id ? "#00AEEF" : "#6B7280",
              borderBottom: activeTab === tab.id ? "2px solid #00AEEF" : "2px solid transparent",
            }}>{tab.label}</button>
          ))}
        </div>

        {/* ══ OVERVIEW ════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
              {[
                { icon: "📞", label: "IVR Options",    value: "4", color: "#3B82F6" },
                { icon: "↗",  label: "Press 1: Transfer", value: "Live",   color: "#3B82F6" },
                { icon: "📲", label: "Press 2: Callback", value: "Active", color: "#3B82F6" },
                { icon: "🎙", label: "Press 3: Voicemail", value: "Active", color: "#F59E0B" },
                { icon: "💬", label: "Press 4: Text",   value: "Active", color: "#3B82F6" },
              ].map(k => (
                <div key={k.label} style={{ ...card, display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ fontSize: 18 }}>{k.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, lineHeight: 1.3 }}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* System status */}
            <div style={card}>
              {sectionHead("🟢", "System Status")}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {[
                  ["Voice Webhook", "Healthy",  "#22C55E"],
                  ["Call Transfer",  "Live",     "#3B82F6"],
                  ["Callback IVR",   "Active",   "#3B82F6"],
                  ["Voicemail",      "Active",   "#3B82F6"],
                  ["Press 4 Text",   "Active",   "#3B82F6"],
                  ["Business Hours", "Enabled",  "#22C55E"],
                ].map(([label, val, c]) => (
                  <div key={label} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: isDark ? "#0A1020" : "#F8FAFC",
                    border: `1px solid ${c}20`, borderLeft: `3px solid ${c}`,
                    borderRadius: 8, padding: "10px 12px",
                  }}>
                    <span style={{ fontSize: 12, color: "#9CA3AF" }}>{label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: c }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick config summary */}
            <div style={card}>
              {sectionHead("⚡", "Live Configuration")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  ["Business Name",    settings.businessName],
                  ["Transfer Number",  settings.transferPhone],
                  ["Voice Style",      settings.voiceStyle],
                  ["After Hours Mode", settings.afterHoursMode],
                  ["Custom Greeting",  settings.customGreetingUrl ? "Custom audio set" : "Using TTS script"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${isDark ? "#1E2D48" : "#F1F5F9"}` }}>
                    <span style={{ fontSize: 12, color: "#6B7280" }}>{k}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{v}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setActiveTab("settings")} style={{
                marginTop: 14, background: "#00AEEF", border: "none", color: "#fff",
                borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}>Edit Settings →</button>
            </div>
          </div>
        )}

        {/* ══ CALL FLOW ═══════════════════════════════════════════════════════ */}
        {activeTab === "callflow" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

            {/* Visual flow */}
            <div style={card}>
              {sectionHead("🔀", "Visual Call Flow")}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
                {[
                  { icon: "📞", label: "Incoming Call",    sub: TELNYX_NUMBER,                  color: "#00AEEF" },
                  { icon: "🤖", label: "AI Greeting",       sub: "Custom audio or TTS script",   color: "#3B82F6" },
                  { icon: "⌨",  label: "IVR Menu — Press 1–4", sub: "Caller selects option",    color: "#6B7280" },
                ].map((node, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%",
                      background: isDark ? "#060E1E" : "#F1F5F9",
                      border: `1px solid ${node.color}30`, borderLeft: `3px solid ${node.color}`,
                      borderRadius: 10, padding: "11px 16px",
                    }}>
                      <span style={{ fontSize: 18 }}>{node.icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{i + 1}. {node.label}</div>
                        <div style={{ fontSize: 11, color: "#6B7280" }}>{node.sub}</div>
                      </div>
                    </div>
                    {i < 2 && <div style={{ width: 1, height: 16, background: "rgba(0,174,239,0.25)" }} />}
                  </div>
                ))}

                <div style={{ width: 1, height: 16, background: "rgba(0,174,239,0.25)" }} />

                {/* 4 branches */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%" }}>
                  {[
                    { key: "1", icon: "↗",  label: "Press 1",   action: "Live Transfer",   color: "#22C55E", sub: settings.transferPhone },
                    { key: "2", icon: "📲", label: "Press 2",   action: "Callback",          color: "#00AEEF", sub: "Log lead + confirm" },
                    { key: "3", icon: "🎙", label: "Press 3",   action: "Voicemail",         color: "#F59E0B", sub: "Record + save" },
                    { key: "4", icon: "💬", label: "Press 4",   action: "Continue by Text",  color: "#06B6D4", sub: "SMS auto-sent" },
                  ].map(b => (
                    <div key={b.key} style={{
                      background: `${b.color}0D`, border: `1px solid ${b.color}30`,
                      borderRadius: 10, padding: "12px 14px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 18 }}>{b.icon}</span>
                        <span style={{ fontSize: 18, fontWeight: 900, color: b.color }}>{b.key}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: b.color }}>{b.action}</div>
                      <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>{b.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Press 4 detail */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ ...card, borderColor: "#06B6D430" }}>
                {sectionHead("💬", "Press 4 — Continue by Text")}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                  {[
                    ["Trigger",          "Caller presses 4 during IVR"],
                    ["Action",           "SMS sent to caller immediately"],
                    ["Message source",   "Settings → Text Routing Message"],
                    ["Call log",         "call_type = text_routing"],
                    ["Outcome",          "outcome = sms_sent"],
                    ["SMS log",          "sms_conversations (outbound)"],
                    ["Lead log",         "source = text_routing"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: `1px solid ${isDark ? "#1E2D48" : "#F1F5F9"}` }}>
                      <span style={{ color: "#6B7280", flexShrink: 0 }}>{k}</span>
                      <span style={{ fontWeight: 600, textAlign: "right", color: "#06B6D4" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={card}>
                {sectionHead("📋", "IVR Greeting Preview")}
                <div style={{
                  background: isDark ? "#060E1E" : "#F8FAFC",
                  border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                  borderRadius: 8, padding: "14px 16px",
                  fontSize: 13, lineHeight: 1.7, color: t.text,
                  fontStyle: "italic",
                }}>
                  "{settings.customGreetingUrl
                    ? "🎵 Custom audio greeting plays"
                    : (settings.greetingScript || DEFAULT_SETTINGS.greetingScript)}"
                </div>
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 8 }}>
                  Voice: <strong>{settings.voiceStyle}</strong>
                  {settings.customGreetingUrl && <span style={{ marginLeft: 10, color: "#22C55E" }}>✓ Custom audio URL set</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ SETTINGS ════════════════════════════════════════════════════════ */}
        {activeTab === "settings" && (
          <div>
            {settingsLoading ? (
              <div style={{ textAlign: "center", padding: 60, color: "#6B7280" }}>Loading settings…</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Business identity */}
                <div style={card}>
                  {sectionHead("🏢", "Business Identity")}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      {label("Business Name")}
                      <input value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      {label("Transfer Phone Number", "Press 1 routes here")}
                      <input value={form.transferPhone} onChange={e => setForm(f => ({ ...f, transferPhone: e.target.value }))} placeholder="+12513249090" style={{ ...inputStyle, fontFamily: "monospace" }} />
                    </div>
                  </div>
                </div>

                {/* Voice + greeting */}
                <div style={card}>
                  {sectionHead("🎙", "Voice & Greeting")}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div>
                        {label("Voice Style", "Used for TTS responses")}
                        <select value={form.voiceStyle} onChange={e => setForm(f => ({ ...f, voiceStyle: e.target.value }))} style={{ ...inputStyle }}>
                          {VOICE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        {label("Custom Greeting Audio URL", "Overrides the text greeting")}
                        <input value={form.customGreetingUrl} onChange={e => setForm(f => ({ ...f, customGreetingUrl: e.target.value }))} placeholder="https://… (leave blank to use TTS)" style={inputStyle} />
                      </div>
                    </div>
                    <div>
                      {label("Greeting Script", "Read aloud if no custom audio URL is set")}
                      <textarea rows={3} value={form.greetingScript} onChange={e => setForm(f => ({ ...f, greetingScript: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
                    </div>
                  </div>
                </div>

                {/* IVR messages */}
                <div style={card}>
                  {sectionHead("⌨", "IVR Response Messages")}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div>
                      {label("Press 2 — Callback Message", "Played after caller presses 2")}
                      <textarea rows={2} value={form.callbackMessage} onChange={e => setForm(f => ({ ...f, callbackMessage: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
                    </div>
                    <div>
                      {label("Press 3 — Voicemail Prompt", "Played before recording begins")}
                      <textarea rows={2} value={form.voicemailMessage} onChange={e => setForm(f => ({ ...f, voicemailMessage: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
                    </div>
                    <div>
                      {label("Press 4 — Text Routing Message", "SMS sent to caller when they press 4")}
                      <textarea rows={3} value={form.textRoutingMessage} onChange={e => setForm(f => ({ ...f, textRoutingMessage: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
                      <div style={{ fontSize: 11, color: "#6B7280", marginTop: 5 }}>{form.textRoutingMessage.length} characters</div>
                    </div>
                  </div>
                </div>

                {/* Business hours */}
                <div style={card}>
                  {sectionHead("🕐", "After-Hours Mode")}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {AFTER_HOURS_OPTIONS.map(opt => (
                      <button key={opt.val} onClick={() => setForm(f => ({ ...f, afterHoursMode: opt.val }))} style={{
                        border: `2px solid ${form.afterHoursMode === opt.val ? "#00AEEF" : (isDark ? "#1E2D48" : "#E2E8F0")}`,
                        background: form.afterHoursMode === opt.val ? "#00AEEF15" : "transparent",
                        color: form.afterHoursMode === opt.val ? "#00AEEF" : "#6B7280",
                        borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                      }}>{opt.label}</button>
                    ))}
                  </div>
                </div>

                {/* Save bar */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: changed ? (isDark ? "#0A1A0A" : "#F0FDF4") : (isDark ? "#0A1020" : "#F8FAFC"),
                  border: `1px solid ${changed ? "#22C55E44" : (isDark ? "#1E2D48" : "#E2E8F0")}`,
                  borderRadius: 10, padding: "14px 20px",
                }}>
                  <div style={{ fontSize: 13, color: changed ? "#22C55E" : "#6B7280" }}>
                    {changed ? "⚡ Unsaved changes — save to apply on next call" : "✓ Settings up to date"}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    {changed && (
                      <button onClick={() => setForm(settings)} style={{
                        background: "transparent", border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                        color: "#6B7280", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                      }}>Discard</button>
                    )}
                    <button onClick={saveSettings} disabled={saving || !changed} style={{
                      background: (saving || !changed) ? "#22C55E66" : "#22C55E",
                      border: "none", color: "#fff", borderRadius: 8, padding: "9px 24px",
                      fontSize: 13, fontWeight: 700, cursor: (saving || !changed) ? "not-allowed" : "pointer",
                    }}>{saving ? "Saving…" : "Save Settings"}</button>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* ══ TEST ════════════════════════════════════════════════════════════ */}
        {activeTab === "test" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

            {/* Call flow simulator */}
            <div style={card}>
              {sectionHead("📞", "Simulate Call Flow")}
              <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 18px", lineHeight: 1.6 }}>
                Click a digit to preview what the caller hears — responses use your current saved settings.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
                {[
                  { digit: "1", icon: "↗",  label: "Live Transfer",    color: "#22C55E" },
                  { digit: "2", icon: "📲", label: "Callback",          color: "#00AEEF" },
                  { digit: "3", icon: "🎙", label: "Voicemail",         color: "#F59E0B" },
                  { digit: "4", icon: "💬", label: "Continue by Text",  color: "#06B6D4" },
                ].map(opt => (
                  <button key={opt.digit} onClick={() => testCallFlow(opt.digit)} disabled={testLoading} style={{
                    background: testDigit === opt.digit ? `${opt.color}20` : (isDark ? "#060E1E" : "#F8FAFC"),
                    border: `2px solid ${testDigit === opt.digit ? opt.color : (isDark ? "#1E2D48" : "#E2E8F0")}`,
                    borderRadius: 10, padding: "16px 12px", cursor: "pointer", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 24 }}>{opt.icon}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: opt.color, marginTop: 4 }}>{opt.digit}</div>
                    <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{opt.label}</div>
                  </button>
                ))}
              </div>

              {testLoading && (
                <div style={{ textAlign: "center", padding: "14px 0", color: "#6B7280", fontSize: 13 }}>Simulating…</div>
              )}
              {testResult && !testLoading && (
                <div style={{
                  background: isDark ? "#060E1E" : "#F8FAFC",
                  border: `1px solid ${testResult.error ? "#EF444444" : "#00AEEF44"}`,
                  borderRadius: 10, padding: "14px 16px",
                }}>
                  {testResult.error ? (
                    <div style={{ fontSize: 13, color: "#EF4444" }}>{testResult.error}</div>
                  ) : (<>
                    <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
                      Press {testDigit} → {testResult.action}
                    </div>
                    <div style={{ fontSize: 13, color: t.text, lineHeight: 1.6, fontStyle: "italic" }}>
                      "{testResult.response}"
                    </div>
                    <div style={{ fontSize: 11, color: "#6B7280", marginTop: 8 }}>
                      Voice: {testResult.voice} · Transfer: {testResult.settings?.transferPhone}
                    </div>
                  </>)}
                </div>
              )}
            </div>

            {/* SMS tester */}
            <div style={card}>
              {sectionHead("💬", "Test Press 4 SMS")}
              <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 18px", lineHeight: 1.6 }}>
                Send a real SMS to any number using your current Text Routing Message. Uses live Telnyx API.
              </p>
              <div style={{ marginBottom: 14 }}>
                {label("Send to Phone Number", "Must be a real mobile number")}
                <input
                  type="tel" value={smsTo} placeholder="+12513249090"
                  onChange={e => setSmsTo(e.target.value)}
                  style={{ ...inputStyle, fontFamily: "monospace" }}
                />
              </div>
              <div style={{ marginBottom: 18 }}>
                {label("Message Preview")}
                <div style={{
                  background: isDark ? "#060E1E" : "#F1F5F9",
                  border: `1px solid ${isDark ? "#1E2D48" : "#E2E8F0"}`,
                  borderRadius: 8, padding: "12px 14px",
                  fontSize: 13, color: "#6B7280", lineHeight: 1.6, whiteSpace: "pre-wrap",
                }}>{settings.textRoutingMessage || DEFAULT_SETTINGS.textRoutingMessage}</div>
              </div>
              <button onClick={sendTestSms} disabled={smsSending || !smsTo} style={{
                background: (smsSending || !smsTo) ? "#06B6D466" : "#06B6D4",
                border: "none", color: "#fff", borderRadius: 8, padding: "10px 22px",
                fontSize: 13, fontWeight: 700, cursor: (smsSending || !smsTo) ? "not-allowed" : "pointer", width: "100%",
              }}>{smsSending ? "Sending…" : "💬 Send Test SMS"}</button>
              {smsResult && (
                <div style={{
                  marginTop: 14, borderRadius: 8, padding: "10px 14px",
                  background: smsResult.startsWith("✅") ? "#22C55E22" : "#EF444422",
                  color: smsResult.startsWith("✅") ? "#22C55E" : "#EF4444",
                  fontSize: 13, fontWeight: 600,
                }}>{smsResult}</div>
              )}
            </div>

          </div>
        )}

      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2000,
          background: toast.ok ? "#22C55E" : "#EF4444",
          color: "#fff", padding: "12px 20px", borderRadius: 10,
          fontSize: 14, fontWeight: 600, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>{toast.msg}</div>
      )}
    </AppShell>
  );
}
