import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { AppShell } from "../components/app-shell";

// ─── Types ────────────────────────────────────────────────────────────────────
type StepStatus = "complete" | "in-progress" | "pending";

interface Step {
  id: number;
  title: string;
  description: string;
  status: StepStatus;
  content: () => ReactNode;
}

// ─── Demo data ────────────────────────────────────────────────────────────────
const CLIENT = {
  name: "Bed Bugs & Beyond",
  industry: "Pest Control",
  phone: "(251) 324-9090",
  email: "info@bedbugsbeyond.com",
  website: "https://aiedgesolutions.online",
  address: "Gulf Shores, AL 36542",
  serviceArea: "Baldwin County, Alabama",
  package: "Edge Pro",
  startDate: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  completionPct: 42,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: StepStatus }) {
  const map: Record<StepStatus, { label: string; bg: string; color: string; dot: string }> = {
    complete:    { label: "Complete",    bg: "rgba(16,185,129,0.12)", color: "#10B981", dot: "#10B981" },
    "in-progress": { label: "In Progress", bg: "rgba(0,174,239,0.12)",  color: "#00AEEF", dot: "#00AEEF" },
    pending:     { label: "Pending",     bg: "rgba(100,116,139,0.15)", color: "#64748B", dot: "#475569" },
  };
  const s = map[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 20,
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, letterSpacing: "0.4px",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

function ProgressBar({ value, max, color = "#00AEEF" }: { value: number; max: number; color?: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 99 }}>
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: color, transition: "width 0.5s ease", boxShadow: `0 0 8px ${color}60` }} />
    </div>
  );
}

function ActionBtn({ label, to, variant = "secondary" }: { label: string; to?: string; variant?: "primary" | "secondary" }) {
  const [, navigate] = useLocation();
  const isPrimary = variant === "primary";
  return (
    <button
      onClick={() => to && navigate(to)}
      style={{
        padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
        border: isPrimary ? "none" : "1px solid rgba(0,174,239,0.3)",
        background: isPrimary ? "#00AEEF" : "rgba(0,174,239,0.07)",
        color: isPrimary ? "#FFF" : "#00AEEF",
        transition: "all 0.15s",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget;
        el.style.opacity = "0.85";
        el.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget;
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      }}
    >
      {label}
    </button>
  );
}

// ─── Step content renderers ───────────────────────────────────────────────────

function Step1Content() {
  const fields = [
    { label: "Business Name",  value: CLIENT.name },
    { label: "Industry",       value: CLIENT.industry },
    { label: "Phone",          value: CLIENT.phone },
    { label: "Email",          value: CLIENT.email },
    { label: "Website",        value: CLIENT.website },
    { label: "Address",        value: CLIENT.address },
    { label: "Service Area",   value: CLIENT.serviceArea },
    { label: "Business Hours", value: "Mon–Fri 7am–6pm, Sat 8am–2pm" },
  ];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px" }}>
        {fields.map(f => (
          <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px" }}>{f.label}</span>
            <span style={{ fontSize: 13, color: "#E2E8F0", fontWeight: 500 }}>{f.value}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, padding: "8px 12px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, fontSize: 12, color: "#10B981" }}>
        ✓ Business profile is complete and saved.
      </div>
    </div>
  );
}

function Step2Content() {
  const platforms = [
    { name: "Facebook",               status: "connected" as const, icon: "f" },
    { name: "Instagram",              status: "connected" as const, icon: "📷" },
    { name: "Google Business Profile",status: "connected" as const, icon: "G" },
    { name: "YouTube",                status: "pending"   as const, icon: "▶" },
    { name: "Apple Business Connect", status: "missing"   as const, icon: "🍎" },
    { name: "Bing Places",            status: "missing"   as const, icon: "B" },
  ];
  const colors = { connected: "#10B981", pending: "#00AEEF", missing: "#64748B" };
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {platforms.map(p => (
          <div key={p.name} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "9px 14px", borderRadius: 9,
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, width: 20, textAlign: "center" }}>{p.icon}</span>
              <span style={{ fontSize: 13, color: "#CBD5E1", fontWeight: 500 }}>{p.name}</span>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.4px",
              color: colors[p.status], textTransform: "capitalize",
            }}>{p.status}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <ActionBtn label="Open Connected Accounts" to="/admin/connections" />
        <ActionBtn label="Connect Platforms" to="/admin/connections" variant="primary" />
      </div>
    </div>
  );
}

function Step3Content() {
  const fields = [
    { label: "Business Number", value: CLIENT.phone },
    { label: "Telnyx Number",   value: "+1 (251) 555-0192" },
    { label: "Forward Number",  value: CLIENT.phone },
    { label: "SMS",             value: "Enabled ✓" },
    { label: "Voice",           value: "Enabled ✓" },
  ];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px", marginBottom: 14 }}>
        {fields.map(f => (
          <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px" }}>{f.label}</span>
            <span style={{ fontSize: 13, color: "#E2E8F0", fontWeight: 500 }}>{f.value}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ padding: "6px 12px", background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)", borderRadius: 7, fontSize: 11, color: "#00AEEF", fontWeight: 600 }}>
          📞 Lead Recovery Linked
        </div>
        <div style={{ padding: "6px 12px", background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)", borderRadius: 7, fontSize: 11, color: "#00AEEF", fontWeight: 600 }}>
          🎙 AI Receptionist Linked
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <ActionBtn label="Open Lead Recovery" to="/admin/lead-recovery" />
        <ActionBtn label="Open AI Receptionist" to="/admin/ai-receptionist" />
      </div>
    </div>
  );
}

function Step4Content() {
  const scores = [
    { label: "Overall Score",       value: 64, color: "#00AEEF" },
    { label: "Local Presence",      value: 58, color: "#8B5CF6" },
    { label: "AI Visibility",       value: 71, color: "#10B981" },
    { label: "Review Strength",     value: 52, color: "#F59E0B" },
    { label: "Opportunity Score",   value: 83, color: "#EC4899" },
  ];
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        {scores.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: "#94A3B8", width: 150, flexShrink: 0 }}>{s.label}</span>
            <div style={{ flex: 1 }}>
              <ProgressBar value={s.value} max={100} color={s.color} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: s.color, width: 36, textAlign: "right" }}>{s.value}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <ActionBtn label="Open Assessment" to="/admin/assessments" />
        <ActionBtn label="Re-run Assessment" to="/admin/assessments" variant="primary" />
      </div>
    </div>
  );
}

function Step5Content() {
  type PlatformStatus = "complete" | "in-progress" | "pending";
  const items: { label: string; status: PlatformStatus; note?: string }[] = [
    { label: "Google Business Profile", status: "complete",   note: "Connected & verified" },
    { label: "Apple Business Connect",  status: "in-progress",note: "Setup in progress — claim pending" },
    { label: "Bing Places",             status: "in-progress", note: "Setup in progress — verification pending" },
    { label: "Nextdoor Business",       status: "in-progress", note: "Setup in progress — page claim pending" },
  ];
  const styleMap: Record<PlatformStatus, { bg: string; border: string; icon: string; iconColor: string; labelColor: string }> = {
    complete:    { bg: "rgba(16,185,129,0.06)",  border: "rgba(16,185,129,0.2)",  icon: "✓", iconColor: "#10B981", labelColor: "#10B981" },
    "in-progress":{ bg: "rgba(0,174,239,0.06)", border: "rgba(0,174,239,0.2)",   icon: "⟳", iconColor: "#00AEEF", labelColor: "#CBD5E1" },
    pending:     { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.06)",icon: "○", iconColor: "#374151", labelColor: "#94A3B8" },
  };
  const done = items.filter(i => i.status === "complete").length;
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {items.map(item => {
          const s = styleMap[item.status];
          return (
            <div key={item.label} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              padding: "8px 12px", borderRadius: 8,
              background: s.bg, border: `1px solid ${s.border}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14, color: s.iconColor }}>{s.icon}</span>
                <div>
                  <div style={{ fontSize: 13, color: s.labelColor, fontWeight: item.status === "complete" ? 600 : 400 }}>{item.label}</div>
                  {item.note && <div style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>{item.note}</div>}
                </div>
              </div>
              {item.status === "in-progress" && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#00AEEF", background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.25)", borderRadius: 20, padding: "2px 8px", whiteSpace: "nowrap" }}>
                  Setup In Progress
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "#475569" }}>Progress</span>
          <span style={{ fontSize: 11, color: "#00AEEF", fontWeight: 700 }}>{done} / {items.length} complete</span>
        </div>
        <ProgressBar value={done} max={items.length} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <ActionBtn label="Open Local Presence Engine" to="/admin/local-presence" variant="primary" />
        <ActionBtn label="🍎 Open Apple Setup" to="/admin/local-presence" />
        <ActionBtn label="🔵 Open Bing Setup" to="/admin/local-presence" />
        <ActionBtn label="🟢 Open Nextdoor Setup" to="/admin/local-presence" />
      </div>
    </div>
  );
}

function Step6Content() {
  const [settings, setSettings] = useState([
    { label: "Lead Recovery AI",       enabled: false },
    { label: "AI Receptionist",        enabled: false },
    { label: "Review Automation",      enabled: false },
    { label: "Publishing Automation",  enabled: false },
    { label: "Follow-Up Campaigns",    enabled: false },
  ]);
  function toggle(i: number) {
    setSettings(prev => prev.map((s, idx) => idx === i ? { ...s, enabled: !s.enabled } : s));
  }
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {settings.map((s, i) => (
          <div key={s.label} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderRadius: 9,
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <span style={{ fontSize: 13, color: "#CBD5E1", fontWeight: 500 }}>{s.label}</span>
            <button
              onClick={() => toggle(i)}
              style={{
                width: 42, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                background: s.enabled ? "#00AEEF" : "rgba(255,255,255,0.1)",
                position: "relative", transition: "background 0.2s",
              }}
            >
              <span style={{
                position: "absolute", top: 3, left: s.enabled ? 23 : 3, width: 16, height: 16,
                borderRadius: "50%", background: "#FFF", transition: "left 0.2s",
              }} />
            </button>
          </div>
        ))}
      </div>
      <ActionBtn label="Configure Automations" to="/admin/lead-recovery" variant="primary" />
    </div>
  );
}

function Step7Content() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const items = [
    "All integrations connected",
    "Assessment completed",
    "Automation enabled",
    "Alerts reviewed",
    "First campaign launched",
  ];
  const allDone = items.every(i => checked[i]);
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {items.map(item => (
          <label key={item} style={{
            display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
            padding: "8px 12px", borderRadius: 8,
            background: checked[item] ? "rgba(16,185,129,0.06)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${checked[item] ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.06)"}`,
            transition: "all 0.15s",
          }}>
            <input
              type="checkbox"
              checked={!!checked[item]}
              onChange={() => setChecked(prev => ({ ...prev, [item]: !prev[item] }))}
              style={{ width: 15, height: 15, accentColor: "#00AEEF", cursor: "pointer" }}
            />
            <span style={{ fontSize: 13, color: checked[item] ? "#10B981" : "#94A3B8", fontWeight: checked[item] ? 600 : 400 }}>
              {item}
            </span>
          </label>
        ))}
      </div>
      <button
        style={{
          width: "100%", padding: "14px", borderRadius: 10, border: "none",
          background: allDone
            ? "linear-gradient(135deg, #00AEEF, #0077BB)"
            : "rgba(255,255,255,0.06)",
          color: allDone ? "#FFF" : "#475569",
          fontSize: 15, fontWeight: 800, cursor: allDone ? "pointer" : "not-allowed",
          letterSpacing: "0.3px", transition: "all 0.3s",
          boxShadow: allDone ? "0 0 30px rgba(0,174,239,0.4)" : "none",
        }}
      >
        🚀 Activate Client
      </button>
      {!allDone && (
        <p style={{ textAlign: "center", fontSize: 11, color: "#374151", marginTop: 8 }}>
          Complete all checklist items to activate.
        </p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ClientOnboardingPage() {
  const [expanded, setExpanded] = useState<number | null>(1);
  const [activationChecked, setActivationChecked] = useState<Record<string, boolean>>({});

  const steps: Step[] = [
    {
      id: 1, status: "complete",
      title: "Business Profile",
      description: "Basic business information for AI Edge setup.",
      content: Step1Content,
    },
    {
      id: 2, status: "in-progress",
      title: "Connect Accounts",
      description: "Link social media and directory platforms to enable automation.",
      content: Step2Content,
    },
    {
      id: 3, status: "complete",
      title: "Phone & SMS Setup",
      description: "Configure call forwarding, Telnyx number, and SMS automation.",
      content: Step3Content,
    },
    {
      id: 4, status: "complete",
      title: "Business Assessment",
      description: "Review AI-generated scores across local presence, visibility, and reviews.",
      content: Step4Content,
    },
    {
      id: 5, status: "in-progress",
      title: "Local Presence Setup",
      description: "Submit and verify business listings on Google, Apple, Bing, and Nextdoor.",
      content: Step5Content,
    },
    {
      id: 6, status: "pending",
      title: "Automation Settings",
      description: "Enable lead recovery, AI receptionist, review automation, and publishing.",
      content: Step6Content,
    },
    {
      id: 7, status: "pending",
      title: "Launch Ready",
      description: "Final verification and client activation checklist.",
      content: Step7Content,
    },
  ];

  const completedCount = steps.filter(s => s.status === "complete").length;

  const activationItems = [
    "Accounts connected",
    "Phone system active",
    "AI receptionist active",
    "Lead recovery active",
    "Assessment complete",
    "Local presence setup",
    "AI visibility reviewed",
    "First campaign published",
  ];
  const activationDone = activationItems.filter(i => activationChecked[i]).length;
  const allActivated = activationDone === activationItems.length;

  return (
    <AppShell>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: "#FFF", letterSpacing: "-0.5px", marginBottom: 4 }}>
              Client Onboarding
            </h1>
            <p style={{ fontSize: 14, color: "#475569", marginBottom: 0 }}>
              Set up AI Edge services, connect platforms, configure automation, and launch successfully.
            </p>
          </div>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px",
            borderRadius: 20, background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.3)",
            color: "#00AEEF", fontSize: 12, fontWeight: 700, letterSpacing: "0.3px", flexShrink: 0,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#00AEEF", boxShadow: "0 0 6px #00AEEF" }} />
            Onboarding In Progress
          </span>
        </div>

        {/* Client info strip */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12,
          padding: "14px 20px", borderRadius: 12,
          background: "rgba(11,22,41,0.7)", border: "1px solid rgba(0,174,239,0.1)",
        }} className="onboarding-strip">
          {[
            { label: "Client",      value: CLIENT.name },
            { label: "Package",     value: CLIENT.package },
            { label: "Start Date",  value: CLIENT.startDate },
            { label: "Completion",  value: `${CLIENT.completionPct}%` },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: item.label === "Completion" ? "#00AEEF" : "#E2E8F0" }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 32 }} className="onboarding-kpis">
        {[
          { label: "Steps Completed",       value: `${completedCount} / ${steps.length}`, color: "#10B981", icon: "✓" },
          { label: "Completion %",          value: `${CLIENT.completionPct}%`,             color: "#00AEEF", icon: "◎" },
          { label: "Platforms Connected",   value: "3 / 6",                                color: "#8B5CF6", icon: "⚡" },
          { label: "Launch Status",         value: "In Progress",                          color: "#F59E0B", icon: "🚀" },
        ].map(card => (
          <div key={card.label} style={{
            padding: "18px 20px", borderRadius: 14,
            background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)",
            borderTop: `2px solid ${card.color}40`,
            boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 4px 20px rgba(0,0,0,0.3)`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>{card.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px" }}>{card.label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: card.color, letterSpacing: "-0.5px" }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* ── Progress bar (overall) ─────────────────────────────────────── */}
      <div style={{ marginBottom: 32, padding: "16px 20px", borderRadius: 12, background: "rgba(11,22,41,0.6)", border: "1px solid rgba(0,174,239,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>Overall Onboarding Progress</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#00AEEF" }}>{CLIENT.completionPct}%</span>
        </div>
        <ProgressBar value={CLIENT.completionPct} max={100} />
      </div>

      {/* ── Step Wizard ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#E2E8F0", letterSpacing: "-0.3px" }}>Setup Wizard</h2>
          <p style={{ fontSize: 12, color: "#475569" }}>Complete each step to go live. Click a step to expand details and actions.</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map(step => {
            const isOpen = expanded === step.id;
            const ContentComponent = step.content;
            const statusColors: Record<StepStatus, string> = {
              complete: "#10B981", "in-progress": "#00AEEF", pending: "#374151",
            };
            return (
              <div key={step.id} style={{
                borderRadius: 14,
                background: isOpen ? "rgba(11,22,41,0.95)" : "rgba(11,22,41,0.6)",
                border: isOpen
                  ? `1px solid ${statusColors[step.status]}40`
                  : "1px solid rgba(255,255,255,0.06)",
                overflow: "hidden",
                transition: "all 0.2s",
                boxShadow: isOpen ? `0 0 20px ${statusColors[step.status]}12` : "none",
              }}>
                {/* Step header */}
                <button
                  onClick={() => setExpanded(isOpen ? null : step.id)}
                  style={{
                    width: "100%", padding: "14px 18px",
                    display: "flex", alignItems: "center", gap: 14,
                    background: "transparent", border: "none", cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {/* Number badge */}
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: step.status === "complete"
                      ? "rgba(16,185,129,0.15)"
                      : step.status === "in-progress"
                        ? "rgba(0,174,239,0.15)"
                        : "rgba(255,255,255,0.06)",
                    border: `1px solid ${statusColors[step.status]}40`,
                    fontSize: step.status === "complete" ? 13 : 12,
                    color: statusColors[step.status],
                    fontWeight: 800,
                  }}>
                    {step.status === "complete" ? "✓" : step.id}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0", marginBottom: 2 }}>
                      Step {step.id} — {step.title}
                    </div>
                    <div style={{ fontSize: 12, color: "#475569" }}>{step.description}</div>
                  </div>

                  <StatusBadge status={step.status} />

                  <span style={{ color: "#475569", fontSize: 14, marginLeft: 8, flexShrink: 0, transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}>
                    ▾
                  </span>
                </button>

                {/* Step body */}
                {isOpen && (
                  <div style={{
                    padding: "0 18px 18px",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    paddingTop: 16,
                  }}>
                    <ContentComponent />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Two-col bottom row ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 0 }} className="onboarding-bottom">

        {/* Completion Summary */}
        <div style={{
          padding: "22px 24px", borderRadius: 14,
          background: "rgba(11,22,41,0.8)", border: "1px solid rgba(0,174,239,0.1)",
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "#E2E8F0", marginBottom: 16 }}>Completion Summary</h3>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
              ✓ Completed
            </div>
            {["Business setup", "Phone setup", "Assessment"].map(item => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <span style={{ color: "#10B981", fontSize: 13 }}>✓</span>
                <span style={{ fontSize: 12, color: "#CBD5E1" }}>{item}</span>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
              ○ Remaining
            </div>
            {["Connect Apple Business", "Connect Bing Places", "Enable automations", "Launch first campaign"].map(item => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <span style={{ color: "#F59E0B", fontSize: 11 }}>○</span>
                <span style={{ fontSize: 12, color: "#94A3B8" }}>{item}</span>
              </div>
            ))}
          </div>

          <div style={{
            padding: "10px 14px", borderRadius: 9,
            background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)",
            fontSize: 12, color: "#D97706",
          }}>
            ⏱ Estimated time remaining: <strong style={{ color: "#F59E0B" }}>45–90 minutes</strong>
          </div>
        </div>

        {/* Activation Checklist */}
        <div style={{
          padding: "22px 24px", borderRadius: 14,
          background: "rgba(11,22,41,0.8)", border: `1px solid ${allActivated ? "rgba(16,185,129,0.3)" : "rgba(0,174,239,0.1)"}`,
          boxShadow: allActivated ? "0 0 30px rgba(16,185,129,0.1)" : "none",
          transition: "all 0.4s",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "#E2E8F0" }}>Activation Checklist</h3>
            {allActivated
              ? <span style={{ fontSize: 11, fontWeight: 700, color: "#10B981", padding: "4px 10px", background: "rgba(16,185,129,0.12)", borderRadius: 20 }}>🚀 Launch Ready</span>
              : <span style={{ fontSize: 11, color: "#475569" }}>{activationDone} / {activationItems.length} done</span>
            }
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {activationItems.map(item => {
              const done = !!activationChecked[item];
              return (
                <label key={item} style={{
                  display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                  padding: "7px 10px", borderRadius: 8,
                  background: done ? "rgba(16,185,129,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${done ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.05)"}`,
                  transition: "all 0.15s",
                }}>
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => setActivationChecked(prev => ({ ...prev, [item]: !prev[item] }))}
                    style={{ width: 14, height: 14, accentColor: "#00AEEF", cursor: "pointer", flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 12, color: done ? "#10B981" : "#94A3B8", fontWeight: done ? 600 : 400 }}>
                    {item}
                  </span>
                </label>
              );
            })}
          </div>

          {allActivated && (
            <div style={{
              marginTop: 14, padding: "12px 16px", borderRadius: 10,
              background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)",
              textAlign: "center", fontSize: 13, fontWeight: 700, color: "#10B981",
            }}>
              🎉 Client is Launch Ready!
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .onboarding-strip { grid-template-columns: 1fr 1fr !important; }
          .onboarding-kpis  { grid-template-columns: 1fr 1fr !important; }
          .onboarding-bottom { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 580px) {
          .onboarding-strip { grid-template-columns: 1fr !important; }
          .onboarding-kpis  { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </AppShell>
  );
}
