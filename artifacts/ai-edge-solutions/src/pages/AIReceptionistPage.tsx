import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { useTheme } from "@/contexts/theme-context";

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

type TransferSafetyStatus = "blocked" | "manual_verification_required" | "verified_non_looping";

type LeadRecoveryReadiness = {
  checkedAt: string;
  clientId: string;
  telnyx: {
    apiKeyConfigured: boolean;
    publicKeyConfigured: boolean;
    fromNumber: string;
  };
  communicationEndpoint: {
    found: boolean;
    active: boolean;
    verified: boolean;
    purpose: string | null;
    ready: boolean;
  };
  aiReceptionist: {
    settingsPresent: boolean;
    businessName: string | null;
    transferConfigured: boolean;
    transferPhone: string | null;
    afterHoursMode: string | null;
    transferSafety: {
      status: TransferSafetyStatus;
      reason: string;
      sameAsTelnyxAiNumber: boolean;
      sameAsCanonicalPublicInbound: boolean;
      knownLegacyUnsafeDefaultDetected: boolean;
      canonicalPublicInboundPhone: string | null;
      manualVerificationRequired: boolean;
    };
  };
  recoveryOwnership: {
    schedulerEnabled: boolean;
    immediateWebhookOwner: boolean;
    duplicateOwnerRisk: boolean;
  };
  safetyMaintenance: {
    schemaDefaultNeutralized: boolean;
    existingTransferRowMutated: false;
  };
  readiness: {
    inboundRoutingReady: boolean;
    missedCallRecoveryReady: boolean;
    signedWebhookVerificationReady: boolean;
    receptionistTransferConfigurationReady: boolean;
    receptionistTransferSafetyVerified: boolean;
    receptionistTransferReady: boolean;
  };
};

type SimulationResult = {
  digit?: string;
  action?: string;
  response?: string;
  voice?: string;
  settings?: { businessName?: string; transferPhone?: string };
  error?: string;
};

type Tab = "overview" | "settings" | "test";

type StatusTone = "good" | "warn" | "bad" | "neutral";

const EMPTY_SETTINGS: Settings = {
  id: null,
  clientId: "",
  businessName: "My Business",
  transferPhone: "",
  greetingScript: "",
  callbackMessage: "",
  voicemailMessage: "",
  textRoutingMessage: "",
  customGreetingUrl: "",
  voiceStyle: "Polly.Joanna",
  businessHoursJson: "{}",
  afterHoursMode: "voicemail",
};

const VOICE_OPTIONS = ["Polly.Joanna", "Polly.Matthew", "Polly.Salli", "Polly.Joey", "Polly.Kendra"];
const AFTER_HOURS_OPTIONS = [
  { val: "voicemail", label: "Send to Voicemail" },
  { val: "transfer", label: "Transfer Anyway" },
  { val: "sms", label: "Send Text Only" },
  { val: "closed", label: "Play Closed Message" },
];

const TONE = {
  good: { color: "#22C55E", bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.28)" },
  warn: { color: "#F59E0B", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)" },
  bad: { color: "#EF4444", bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.30)" },
  neutral: { color: "#94A3B8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.22)" },
} satisfies Record<StatusTone, { color: string; bg: string; border: string }>;

function coerceSettings(raw: Partial<Settings> | null | undefined): Settings {
  return {
    ...EMPTY_SETTINGS,
    ...(raw ?? {}),
    businessName: raw?.businessName?.trim() || EMPTY_SETTINGS.businessName,
    transferPhone: raw?.transferPhone ?? "",
    greetingScript: raw?.greetingScript ?? "",
    callbackMessage: raw?.callbackMessage ?? "",
    voicemailMessage: raw?.voicemailMessage ?? "",
    textRoutingMessage: raw?.textRoutingMessage ?? "",
    customGreetingUrl: raw?.customGreetingUrl ?? "",
    businessHoursJson: raw?.businessHoursJson ?? "{}",
  };
}

function transferSafetyCopy(readiness: LeadRecoveryReadiness | null): { title: string; detail: string; tone: StatusTone } {
  if (!readiness) {
    return { title: "Transfer safety not yet verified", detail: "Load readiness evidence before treating Press 1 as live.", tone: "neutral" };
  }

  const safety = readiness.aiReceptionist.transferSafety;
  if (safety.status === "verified_non_looping") {
    return {
      title: "Transfer destination verified non-looping",
      detail: `Press 1 is configured to ${readiness.aiReceptionist.transferPhone ?? "the saved destination"}, distinct from the canonical public inbound number.`,
      tone: "good",
    };
  }

  if (safety.knownLegacyUnsafeDefaultDetected) {
    return {
      title: "Transfer blocked — legacy public forwarding number detected",
      detail: "The saved destination matches the historical BB&B public line that may forward back into the AI number. Do not perform a live transfer test until the destination is corrected and re-verified.",
      tone: "bad",
    };
  }

  if (safety.sameAsTelnyxAiNumber) {
    return {
      title: "Transfer blocked — destination is the AI number",
      detail: "Press 1 cannot transfer back to the same Telnyx AI number. Choose a separate human destination before live testing.",
      tone: "bad",
    };
  }

  if (safety.sameAsCanonicalPublicInbound) {
    return {
      title: "Transfer blocked — destination is the public inbound line",
      detail: "The public inbound number may route back into AI Edge. Choose a separate human destination before live testing.",
      tone: "bad",
    };
  }

  if (safety.status === "manual_verification_required") {
    return {
      title: "Transfer destination needs routing verification",
      detail: `The saved destination ${readiness.aiReceptionist.transferPhone ?? ""} is configured, but AI Edge does not yet have a canonical public inbound number to prove the route cannot loop.`,
      tone: "warn",
    };
  }

  return {
    title: "Transfer not configured",
    detail: "Save a separate human transfer destination, then verify its routing before a controlled live call test.",
    tone: "warn",
  };
}

function statusLabel(ok: boolean, good = "Ready", bad = "Needs attention") {
  return { label: ok ? good : bad, tone: ok ? ("good" as const) : ("warn" as const) };
}

function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  const style = TONE[tone];
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      border: `1px solid ${style.border}`,
      background: style.bg,
      color: style.color,
      borderRadius: 999,
      padding: "4px 9px",
      fontSize: 11,
      fontWeight: 800,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function safeMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  return error.message || fallback;
}

export default function AIReceptionistPage() {
  const apiFetch = useApiFetch();
  const { colors: t, isDark } = useTheme();

  const [tab, setTab] = useState<Tab>("overview");
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS);
  const [form, setForm] = useState<Settings>(EMPTY_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [readiness, setReadiness] = useState<LeadRecoveryReadiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [readinessError, setReadinessError] = useState<string | null>(null);

  const [testDigit, setTestDigit] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<SimulationResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const response = await apiFetch<Partial<Settings>>("/ai-receptionist/settings");
      const next = coerceSettings(response);
      setSettings(next);
      setForm(next);
    } catch (error) {
      setSettingsError(safeMessage(error, "AI Receptionist settings are unavailable."));
      setSettings(EMPTY_SETTINGS);
      setForm(EMPTY_SETTINGS);
    } finally {
      setSettingsLoading(false);
    }
  }, [apiFetch]);

  const loadReadiness = useCallback(async () => {
    setReadinessLoading(true);
    setReadinessError(null);
    try {
      const response = await apiFetch<LeadRecoveryReadiness>("/lead-recovery/readiness");
      setReadiness(response);
    } catch (error) {
      setReadiness(null);
      setReadinessError(safeMessage(error, "Lead Recovery readiness evidence is unavailable."));
    } finally {
      setReadinessLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadSettings();
    void loadReadiness();
  }, [loadReadiness, loadSettings]);

  const saveSettings = useCallback(async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const saved = await apiFetch<Partial<Settings>>("/ai-receptionist/settings", {
        method: "PUT",
        body: JSON.stringify({
          businessName: form.businessName,
          transferPhone: form.transferPhone,
          greetingScript: form.greetingScript,
          callbackMessage: form.callbackMessage,
          voicemailMessage: form.voicemailMessage,
          textRoutingMessage: form.textRoutingMessage,
          customGreetingUrl: form.customGreetingUrl || null,
          voiceStyle: form.voiceStyle,
          afterHoursMode: form.afterHoursMode,
        }),
      });
      const next = coerceSettings(saved);
      setSettings(next);
      setForm(next);
      setSaveMessage("Settings saved. Readiness rechecked against the persisted configuration.");
      await loadReadiness();
    } catch (error) {
      setSaveMessage(safeMessage(error, "Failed to save settings."));
    } finally {
      setSaving(false);
    }
  }, [apiFetch, form, loadReadiness]);

  const simulateCallFlow = useCallback(async (digit: string) => {
    setTestDigit(digit);
    setTestLoading(true);
    setTestResult(null);
    try {
      const result = await apiFetch<SimulationResult>("/ai-receptionist/test-call-flow", {
        method: "POST",
        body: JSON.stringify({ digit }),
      });
      setTestResult(result);
    } catch (error) {
      setTestResult({ error: safeMessage(error, "Simulation failed.") });
    } finally {
      setTestLoading(false);
    }
  }, [apiFetch]);

  const panel: CSSProperties = {
    background: isDark ? "#0B1629" : "#F8FAFC",
    border: `1px solid ${isDark ? "rgba(0,174,239,0.14)" : "#E2E8F0"}`,
    borderRadius: 14,
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: isDark ? "#060E1E" : "#FFFFFF",
    border: `1px solid ${isDark ? "#1E2D48" : "#CBD5E1"}`,
    color: t.text,
    borderRadius: 9,
    padding: "10px 12px",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  };

  const transferCopy = transferSafetyCopy(readiness);
  const transferTone = TONE[transferCopy.tone];

  const controlledTestReady = Boolean(
    readiness?.readiness.inboundRoutingReady &&
    readiness?.readiness.missedCallRecoveryReady &&
    readiness?.readiness.signedWebhookVerificationReady &&
    readiness?.readiness.receptionistTransferReady &&
    !readiness?.recoveryOwnership.duplicateOwnerRisk,
  );

  const overallStatus = readinessLoading
    ? { label: "Checking readiness", tone: "neutral" as const }
    : readinessError
      ? { label: "Readiness unavailable", tone: "bad" as const }
      : controlledTestReady
        ? { label: "Ready for controlled live test", tone: "good" as const }
        : { label: "Live test blocked", tone: "warn" as const };

  const systemRows = useMemo(() => {
    if (!readiness) return [];
    const transfer = readiness.aiReceptionist.transferSafety;
    return [
      {
        label: "Telnyx endpoint",
        ...statusLabel(readiness.communicationEndpoint.ready, "Verified", "Not ready"),
        detail: readiness.communicationEndpoint.found
          ? `${readiness.telnyx.fromNumber} · ${readiness.communicationEndpoint.purpose ?? "voice_sms"}`
          : "No tenant endpoint found",
      },
      {
        label: "Missed-call recovery",
        ...statusLabel(readiness.readiness.missedCallRecoveryReady),
        detail: readiness.recoveryOwnership.duplicateOwnerRisk
          ? "Scheduler ownership conflicts with immediate webhook recovery"
          : "Immediate webhook is the recovery owner",
      },
      {
        label: "Signed Telnyx webhooks",
        ...statusLabel(readiness.readiness.signedWebhookVerificationReady, "Configured", "Public key missing"),
        detail: "Inbound webhook authenticity gate",
      },
      {
        label: "Press 1 configuration",
        ...statusLabel(readiness.readiness.receptionistTransferConfigurationReady, "Configured", "Not configured"),
        detail: readiness.aiReceptionist.transferPhone ?? "No saved transfer destination",
      },
      {
        label: "Press 1 routing safety",
        labelValue: transfer.status,
        label: "Press 1 routing safety",
        tone: transfer.status === "verified_non_looping" ? "good" as const : transfer.status === "blocked" ? "bad" as const : "warn" as const,
        detail: transfer.reason.replace(/_/g, " "),
      },
    ];
  }, [readiness]);

  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  return (
    <AppShell>
      <div style={{ padding: "26px 30px", maxWidth: 1120, margin: "0 auto", color: t.text }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
          <div>
            <div style={{ color: "#38BDF8", fontSize: 11, fontWeight: 850, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
              Lead Recovery · Evidence-backed configuration
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>📞 AI Receptionist</h1>
            <p style={{ color: t.text2, fontSize: 13, margin: "7px 0 0", maxWidth: 720, lineHeight: 1.55 }}>
              Configure the receptionist and verify its routing state from production evidence. This page does not claim a route is live until the readiness API proves it.
            </p>
          </div>
          <StatusPill label={overallStatus.label} tone={overallStatus.tone} />
        </div>

        <div style={{ ...panel, padding: 16, marginBottom: 18, borderColor: transferTone.border, background: transferTone.bg }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ fontSize: 21 }}>{transferCopy.tone === "good" ? "✅" : transferCopy.tone === "bad" ? "⛔" : "⚠️"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: transferTone.color, fontWeight: 850, marginBottom: 4 }}>{transferCopy.title}</div>
              <div style={{ color: isDark ? "#CBD5E1" : "#475569", fontSize: 12.5, lineHeight: 1.55 }}>{transferCopy.detail}</div>
            </div>
          </div>
        </div>

        {(readinessError || settingsError) && (
          <div style={{ ...panel, padding: 14, marginBottom: 18, borderColor: "rgba(239,68,68,0.32)" }}>
            {readinessError && <div style={{ color: "#F87171", fontSize: 12, marginBottom: settingsError ? 5 : 0 }}>Readiness: {readinessError}</div>}
            {settingsError && <div style={{ color: "#F87171", fontSize: 12 }}>Settings: {settingsError}</div>}
            <button
              type="button"
              onClick={() => { void loadSettings(); void loadReadiness(); }}
              style={{ marginTop: 10, border: 0, borderRadius: 8, background: "#00AEEF", color: "white", padding: "7px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
            >
              Retry evidence checks
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {([
            ["overview", "Overview"],
            ["settings", "Settings"],
            ["test", "Safe Simulation"],
          ] as Array<[Tab, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                border: `1px solid ${tab === id ? "#00AEEF" : (isDark ? "#334155" : "#CBD5E1")}`,
                background: tab === id ? "rgba(0,174,239,0.12)" : "transparent",
                color: tab === id ? "#38BDF8" : t.text2,
                borderRadius: 9,
                padding: "8px 14px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 750,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
              <div style={{ ...panel, padding: 17 }}>
                <div style={{ color: "#64748B", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Telnyx AI number</div>
                <div style={{ color: "#38BDF8", fontSize: 17, fontWeight: 850, marginTop: 6, fontFamily: "monospace" }}>{readiness?.telnyx.fromNumber ?? "Checking…"}</div>
              </div>
              <div style={{ ...panel, padding: 17 }}>
                <div style={{ color: "#64748B", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Saved transfer</div>
                <div style={{ color: readiness?.aiReceptionist.transferConfigured ? t.text : "#F59E0B", fontSize: 17, fontWeight: 850, marginTop: 6, fontFamily: "monospace" }}>{readiness?.aiReceptionist.transferPhone ?? "Not configured"}</div>
              </div>
              <div style={{ ...panel, padding: 17 }}>
                <div style={{ color: "#64748B", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Recovery owner</div>
                <div style={{ color: readiness?.recoveryOwnership.duplicateOwnerRisk ? "#EF4444" : "#22C55E", fontSize: 17, fontWeight: 850, marginTop: 6 }}>{readiness ? (readiness.recoveryOwnership.duplicateOwnerRisk ? "Conflict" : "Webhook") : "Checking…"}</div>
              </div>
              <div style={{ ...panel, padding: 17 }}>
                <div style={{ color: "#64748B", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Last readiness check</div>
                <div style={{ color: t.text, fontSize: 13, fontWeight: 750, marginTop: 8 }}>{readiness ? new Date(readiness.checkedAt).toLocaleString() : readinessLoading ? "Checking…" : "Unavailable"}</div>
              </div>
            </div>

            <div style={{ ...panel, overflow: "hidden" }}>
              <div style={{ padding: "15px 18px", borderBottom: `1px solid ${isDark ? "#1E293B" : "#E2E8F0"}`, fontWeight: 850 }}>Production readiness evidence</div>
              {readinessLoading ? (
                <div style={{ padding: 22, color: "#94A3B8" }}>Checking Telnyx, endpoint, webhook, scheduler, and transfer evidence…</div>
              ) : systemRows.length === 0 ? (
                <div style={{ padding: 22, color: "#94A3B8" }}>No readiness evidence available.</div>
              ) : (
                <div>
                  {systemRows.map(row => {
                    const displayLabel = row.labelValue ?? row.label;
                    return (
                      <div key={row.label} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) auto minmax(240px, 1.3fr)", gap: 14, alignItems: "center", padding: "13px 18px", borderBottom: `1px solid ${isDark ? "rgba(30,41,59,0.75)" : "#E2E8F0"}` }}>
                        <div style={{ fontSize: 13, fontWeight: 750 }}>{row.label}</div>
                        <StatusPill label={displayLabel === row.label ? (row as { label: string; labelValue?: string; tone: StatusTone }).labelValue ?? "" : displayLabel} tone={row.tone} />
                        <div style={{ color: "#94A3B8", fontSize: 12, textAlign: "right" }}>{row.detail}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ ...panel, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 850 }}>Live phone test gate</div>
                  <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 4, maxWidth: 720 }}>
                    A controlled live call should happen only after inbound routing, missed-call recovery, webhook verification, scheduler ownership, and transfer routing safety are all verified.
                  </div>
                </div>
                <StatusPill label={controlledTestReady ? "Gate open" : "Gate closed"} tone={controlledTestReady ? "good" : "warn"} />
              </div>
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div style={{ display: "grid", gap: 16 }}>
            {settingsLoading ? (
              <div style={{ ...panel, padding: 24, color: "#94A3B8" }}>Loading tenant settings…</div>
            ) : (
              <>
                <div style={{ ...panel, padding: 20 }}>
                  <div style={{ fontWeight: 850, marginBottom: 15 }}>Business & transfer routing</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
                    <div>
                      <label style={{ display: "block", color: "#94A3B8", fontSize: 11, fontWeight: 800, marginBottom: 6 }}>Business name</label>
                      <input value={form.businessName} onChange={event => setForm(current => ({ ...current, businessName: event.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ display: "block", color: "#94A3B8", fontSize: 11, fontWeight: 800, marginBottom: 6 }}>Press 1 transfer destination</label>
                      <input aria-label="Press 1 transfer destination" value={form.transferPhone} onChange={event => setForm(current => ({ ...current, transferPhone: event.target.value }))} placeholder="+1XXXXXXXXXX" style={{ ...inputStyle, fontFamily: "monospace" }} />
                      <div style={{ color: transferTone.color, fontSize: 11, marginTop: 6 }}>{transferCopy.title}</div>
                    </div>
                  </div>
                </div>

                <div style={{ ...panel, padding: 20 }}>
                  <div style={{ fontWeight: 850, marginBottom: 15 }}>Voice & greeting</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={{ display: "block", color: "#94A3B8", fontSize: 11, fontWeight: 800, marginBottom: 6 }}>Voice style</label>
                      <select value={form.voiceStyle} onChange={event => setForm(current => ({ ...current, voiceStyle: event.target.value }))} style={inputStyle}>
                        {VOICE_OPTIONS.map(voice => <option key={voice} value={voice}>{voice}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", color: "#94A3B8", fontSize: 11, fontWeight: 800, marginBottom: 6 }}>Custom greeting audio URL</label>
                      <input value={form.customGreetingUrl} onChange={event => setForm(current => ({ ...current, customGreetingUrl: event.target.value }))} placeholder="Optional HTTPS audio URL" style={inputStyle} />
                    </div>
                  </div>
                  <label style={{ display: "block", color: "#94A3B8", fontSize: 11, fontWeight: 800, marginBottom: 6 }}>Greeting script</label>
                  <textarea rows={4} value={form.greetingScript} onChange={event => setForm(current => ({ ...current, greetingScript: event.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
                </div>

                <div style={{ ...panel, padding: 20 }}>
                  <div style={{ fontWeight: 850, marginBottom: 15 }}>IVR messages</div>
                  <div style={{ display: "grid", gap: 14 }}>
                    <div>
                      <label style={{ display: "block", color: "#94A3B8", fontSize: 11, fontWeight: 800, marginBottom: 6 }}>Press 2 callback message</label>
                      <textarea rows={2} value={form.callbackMessage} onChange={event => setForm(current => ({ ...current, callbackMessage: event.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
                    </div>
                    <div>
                      <label style={{ display: "block", color: "#94A3B8", fontSize: 11, fontWeight: 800, marginBottom: 6 }}>Press 3 voicemail message</label>
                      <textarea rows={2} value={form.voicemailMessage} onChange={event => setForm(current => ({ ...current, voicemailMessage: event.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
                    </div>
                    <div>
                      <label style={{ display: "block", color: "#94A3B8", fontSize: 11, fontWeight: 800, marginBottom: 6 }}>Press 4 text-routing message</label>
                      <textarea rows={3} value={form.textRoutingMessage} onChange={event => setForm(current => ({ ...current, textRoutingMessage: event.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
                    </div>
                  </div>
                </div>

                <div style={{ ...panel, padding: 20 }}>
                  <div style={{ fontWeight: 850, marginBottom: 12 }}>After-hours mode</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {AFTER_HOURS_OPTIONS.map(option => (
                      <button
                        key={option.val}
                        type="button"
                        onClick={() => setForm(current => ({ ...current, afterHoursMode: option.val }))}
                        style={{
                          border: `1px solid ${form.afterHoursMode === option.val ? "#00AEEF" : (isDark ? "#334155" : "#CBD5E1")}`,
                          background: form.afterHoursMode === option.val ? "rgba(0,174,239,0.12)" : "transparent",
                          color: form.afterHoursMode === option.val ? "#38BDF8" : t.text2,
                          borderRadius: 8,
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 750,
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ ...panel, padding: 16, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ color: saveMessage?.startsWith("API ") || saveMessage?.startsWith("Failed") ? "#F87171" : "#94A3B8", fontSize: 12 }}>
                    {saveMessage ?? (dirty ? "Unsaved changes" : "Settings match the last loaded server state")}
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveSettings()}
                    disabled={saving || !dirty}
                    style={{ border: 0, borderRadius: 8, background: saving || !dirty ? "#334155" : "#00AEEF", color: "white", padding: "9px 16px", cursor: saving || !dirty ? "not-allowed" : "pointer", fontWeight: 850, fontSize: 12 }}
                  >
                    {saving ? "Saving…" : "Save settings"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "test" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ ...panel, padding: 18, borderColor: "rgba(56,189,248,0.28)" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ fontSize: 22 }}>🧪</div>
                <div>
                  <div style={{ fontWeight: 850, marginBottom: 4 }}>Safe call-flow simulation only</div>
                  <div style={{ color: "#94A3B8", fontSize: 12.5, lineHeight: 1.55 }}>
                    These buttons simulate IVR response selection through AI Edge. They do not place a phone call and do not send an SMS. Production live-SMS testing is intentionally not exposed from this screen.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ ...panel, padding: 20 }}>
              <div style={{ fontWeight: 850, marginBottom: 13 }}>Simulate an IVR selection</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                {[
                  ["1", "↗", "Transfer response"],
                  ["2", "📲", "Callback response"],
                  ["3", "🎙", "Voicemail response"],
                  ["4", "💬", "Text-routing response"],
                ].map(([digit, icon, label]) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => void simulateCallFlow(digit)}
                    disabled={testLoading}
                    style={{ border: `1px solid ${testDigit === digit ? "#00AEEF" : (isDark ? "#334155" : "#CBD5E1")}`, background: testDigit === digit ? "rgba(0,174,239,0.10)" : "transparent", color: t.text, borderRadius: 10, padding: "14px 10px", cursor: testLoading ? "not-allowed" : "pointer" }}
                  >
                    <div style={{ fontSize: 22 }}>{icon}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#38BDF8", marginTop: 4 }}>Press {digit}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{label}</div>
                  </button>
                ))}
              </div>

              {testLoading && <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 14 }}>Running server-side simulation…</div>}
              {testResult && !testLoading && (
                <div style={{ marginTop: 16, border: `1px solid ${testResult.error ? "rgba(239,68,68,0.35)" : "rgba(56,189,248,0.30)"}`, background: testResult.error ? "rgba(239,68,68,0.06)" : "rgba(56,189,248,0.06)", borderRadius: 10, padding: 14 }}>
                  {testResult.error ? (
                    <div style={{ color: "#F87171", fontSize: 12 }}>{testResult.error}</div>
                  ) : (
                    <>
                      <div style={{ color: "#38BDF8", fontSize: 11, fontWeight: 850, textTransform: "uppercase", marginBottom: 7 }}>Press {testDigit} → {testResult.action}</div>
                      <div style={{ color: t.text, fontSize: 13, lineHeight: 1.6 }}>{testResult.response}</div>
                      {testResult.settings?.transferPhone && (
                        <div style={{ color: "#94A3B8", fontSize: 11, marginTop: 8 }}>Saved transfer destination: {testResult.settings.transferPhone}</div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div style={{ ...panel, padding: 18 }}>
              <div style={{ fontWeight: 850, marginBottom: 5 }}>What still needs a real phone</div>
              <div style={{ color: "#94A3B8", fontSize: 12.5, lineHeight: 1.55 }}>
                Once the production readiness gate is open, a human-controlled daytime call is still required to prove ringing/answering, Press 1 routing, one missed call → one text-back, callback/voicemail behavior, and inbound SMS end to end.
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
