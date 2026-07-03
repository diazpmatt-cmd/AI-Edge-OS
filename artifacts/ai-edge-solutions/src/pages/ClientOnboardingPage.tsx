import { useState } from "react";
import { AppShell } from "../components/app-shell";
import { useTheme } from "@/contexts/theme-context";
import { useApiFetch } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingForm {
  // Step 1
  businessName: string;
  industry: string;
  website: string;
  mainPhone: string;
  forwardingPhone: string;
  email: string;
  // Step 2
  city: string;
  state: string;
  zip: string;
  serviceRadius: string;
  // Step 3
  businessHours: string;
  emergencyService: boolean;
  appointmentRequired: boolean;
  services: string;
  // Step 4
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  brandTone: string;
  // Step 5
  modulesEnabled: string[];
}

interface DeployResult {
  success: boolean;
  client: { id: string; businessName: string; status: string };
  deployedAt: string;
  workspace: string;
  modulesActivated: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Business Info",   icon: "🏢" },
  { id: 2, label: "Service Area",    icon: "📍" },
  { id: 3, label: "Settings",        icon: "⚙️" },
  { id: 4, label: "Branding",        icon: "🎨" },
  { id: 5, label: "AI Features",     icon: "🤖" },
  { id: 6, label: "Deploy",          icon: "🚀" },
];

const INDUSTRIES = [
  "Pest Control", "HVAC", "Plumbing", "Electrical", "Lawn & Landscaping",
  "Cleaning Services", "Roofing", "Pool & Spa", "General Contractor",
  "Painting", "Flooring", "Appliance Repair", "Locksmith", "Other",
];

const BRAND_TONES = [
  { value: "professional", label: "Professional & Trustworthy" },
  { value: "friendly",     label: "Friendly & Approachable" },
  { value: "bold",         label: "Bold & Confident" },
  { value: "premium",      label: "Premium & Sophisticated" },
  { value: "urgent",       label: "Urgent & Action-Oriented" },
];

const MODULES = [
  { id: "ai_receptionist",    label: "AI Receptionist",     icon: "📞", desc: "24/7 automated call handling & IVR" },
  { id: "lead_recovery",      label: "Lead Recovery AI",    icon: "🎯", desc: "Auto follow-up on missed calls & leads" },
  { id: "call_intelligence",  label: "Call Intelligence",   icon: "📊", desc: "Call analytics, outcomes & trends" },
  { id: "review_automation",  label: "Review Automation",   icon: "⭐", desc: "Automated review requests & responses" },
  { id: "ai_visibility",      label: "AI Visibility Engine",icon: "✨", desc: "Track AI search presence across platforms" },
  { id: "publishing_center",  label: "Publishing Center",   icon: "📸", desc: "Social media scheduling & publishing" },
];

const EMPTY_FORM: OnboardingForm = {
  businessName: "", industry: "", website: "", mainPhone: "", forwardingPhone: "", email: "",
  city: "", state: "", zip: "", serviceRadius: "25",
  businessHours: "Mon–Fri 8am–6pm", emergencyService: false, appointmentRequired: false, services: "",
  logoUrl: "", primaryColor: "#00AEEF", secondaryColor: "#C0C0C0", brandTone: "professional",
  modulesEnabled: ["ai_receptionist", "lead_recovery", "call_intelligence"],
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  label, required, children, hint,
}: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}{required && <span style={{ color: "#EF4444", marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && <span style={{ fontSize: 10, color: "#475569" }}>{hint}</span>}
    </div>
  );
}

function Input({
  value, onChange, placeholder, type = "text", isDark,
}: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; isDark: boolean }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", boxSizing: "border-box",
        padding: "9px 12px", borderRadius: 8, fontSize: 13,
        background: isDark ? "rgba(255,255,255,0.05)" : "#FFFFFF",
        border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #DDE3EA",
        color: isDark ? "#E2E8F0" : "#111827",
        outline: "none", fontFamily: "inherit",
        transition: "border-color 0.15s",
      }}
      onFocus={e => { e.target.style.borderColor = "#00AEEF"; }}
      onBlur={e => { e.target.style.borderColor = isDark ? "rgba(255,255,255,0.12)" : "#DDE3EA"; }}
    />
  );
}

function Select({
  value, onChange, options, isDark,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; isDark: boolean }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: "100%", boxSizing: "border-box",
        padding: "9px 12px", borderRadius: 8, fontSize: 13,
        background: isDark ? "rgba(255,255,255,0.05)" : "#FFFFFF",
        border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #DDE3EA",
        color: isDark ? "#E2E8F0" : "#111827",
        outline: "none", fontFamily: "inherit", cursor: "pointer",
      }}
    >
      <option value="">Select…</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Toggle({
  checked, onChange, label, isDark,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; isDark: boolean }) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
      onClick={() => onChange(!checked)}
    >
      <div style={{
        width: 40, height: 22, borderRadius: 11,
        background: checked ? "#00AEEF" : (isDark ? "rgba(255,255,255,0.15)" : "#CBD5E1"),
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 3, left: checked ? 21 : 3,
          width: 16, height: 16, borderRadius: "50%",
          background: "#FFFFFF", transition: "left 0.2s",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        }} />
      </div>
      <span style={{ fontSize: 13, color: isDark ? "#CBD5E1" : "#374151", fontWeight: 500 }}>{label}</span>
    </div>
  );
}

// ─── Step panels ──────────────────────────────────────────────────────────────

function Step1({ form, set, isDark }: { form: OnboardingForm; set: (k: keyof OnboardingForm, v: string | boolean | string[]) => void; isDark: boolean }) {
  const gridTwo = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label="Business Name" required>
        <Input value={form.businessName} onChange={v => set("businessName", v)} placeholder="Bed Bugs & Beyond" isDark={isDark} />
      </Field>
      <Field label="Industry" required>
        <Select
          value={form.industry}
          onChange={v => set("industry", v)}
          options={INDUSTRIES.map(i => ({ value: i, label: i }))}
          isDark={isDark}
        />
      </Field>
      <Field label="Website">
        <Input value={form.website} onChange={v => set("website", v)} placeholder="https://yourbusiness.com" isDark={isDark} />
      </Field>
      <div style={gridTwo}>
        <Field label="Main Phone" required hint="Customer-facing number">
          <Input value={form.mainPhone} onChange={v => set("mainPhone", v)} placeholder="(251) 324-9090" isDark={isDark} />
        </Field>
        <Field label="Forwarding Phone" hint="Where calls transfer to">
          <Input value={form.forwardingPhone} onChange={v => set("forwardingPhone", v)} placeholder="(251) 555-0100" isDark={isDark} />
        </Field>
      </div>
      <Field label="Email">
        <Input value={form.email} onChange={v => set("email", v)} type="email" placeholder="info@yourbusiness.com" isDark={isDark} />
      </Field>
    </div>
  );
}

function Step2({ form, set, isDark }: { form: OnboardingForm; set: (k: keyof OnboardingForm, v: string | boolean | string[]) => void; isDark: boolean }) {
  const gridTwo = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label="City" required>
        <Input value={form.city} onChange={v => set("city", v)} placeholder="Gulf Shores" isDark={isDark} />
      </Field>
      <div style={gridTwo}>
        <Field label="State" required>
          <Input value={form.state} onChange={v => set("state", v)} placeholder="AL" isDark={isDark} />
        </Field>
        <Field label="Zip Code">
          <Input value={form.zip} onChange={v => set("zip", v)} placeholder="36542" isDark={isDark} />
        </Field>
      </div>
      <Field label="Service Radius (miles)" hint="How far from city center does the business operate?">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input
            type="range" min={5} max={200} step={5}
            value={parseInt(form.serviceRadius) || 25}
            onChange={e => set("serviceRadius", e.target.value)}
            style={{ flex: 1, accentColor: "#00AEEF" }}
          />
          <span style={{
            minWidth: 52, textAlign: "center", fontSize: 14, fontWeight: 700,
            color: "#00AEEF", background: "rgba(0,174,239,0.1)",
            border: "1px solid rgba(0,174,239,0.25)", borderRadius: 8, padding: "4px 8px",
          }}>
            {form.serviceRadius} mi
          </span>
        </div>
      </Field>
    </div>
  );
}

function Step3({ form, set, isDark }: { form: OnboardingForm; set: (k: keyof OnboardingForm, v: string | boolean | string[]) => void; isDark: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Field label="Business Hours" hint="e.g. Mon–Fri 8am–6pm, Sat 9am–2pm">
        <Input value={form.businessHours} onChange={v => set("businessHours", v)} placeholder="Mon–Fri 8am–6pm" isDark={isDark} />
      </Field>
      <Field label="Services Offered" hint="Comma-separated list of core services">
        <textarea
          value={form.services}
          onChange={e => set("services", e.target.value)}
          placeholder="Bed bug treatment, pest inspection, fumigation, preventive treatment…"
          rows={3}
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "9px 12px", borderRadius: 8, fontSize: 13,
            background: isDark ? "rgba(255,255,255,0.05)" : "#FFFFFF",
            border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #DDE3EA",
            color: isDark ? "#E2E8F0" : "#111827",
            outline: "none", fontFamily: "inherit", resize: "vertical",
          }}
          onFocus={e => { e.target.style.borderColor = "#00AEEF"; }}
          onBlur={e => { e.target.style.borderColor = isDark ? "rgba(255,255,255,0.12)" : "#DDE3EA"; }}
        />
      </Field>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Toggle
          checked={form.emergencyService}
          onChange={v => set("emergencyService", v)}
          label="Offers Emergency / After-Hours Service"
          isDark={isDark}
        />
        <Toggle
          checked={form.appointmentRequired}
          onChange={v => set("appointmentRequired", v)}
          label="Appointment Required (not walk-in)"
          isDark={isDark}
        />
      </div>
    </div>
  );
}

function Step4({ form, set, isDark }: { form: OnboardingForm; set: (k: keyof OnboardingForm, v: string | boolean | string[]) => void; isDark: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Field label="Logo URL" hint="Link to hosted logo image (PNG or SVG recommended)">
        <Input value={form.logoUrl} onChange={v => set("logoUrl", v)} placeholder="https://cdn.example.com/logo.png" isDark={isDark} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Primary Color">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="color"
              value={form.primaryColor}
              onChange={e => set("primaryColor", e.target.value)}
              style={{ width: 40, height: 36, borderRadius: 6, border: "none", cursor: "pointer", background: "none", padding: 0 }}
            />
            <Input value={form.primaryColor} onChange={v => set("primaryColor", v)} placeholder="#00AEEF" isDark={isDark} />
          </div>
        </Field>
        <Field label="Secondary Color">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="color"
              value={form.secondaryColor}
              onChange={e => set("secondaryColor", e.target.value)}
              style={{ width: 40, height: 36, borderRadius: 6, border: "none", cursor: "pointer", background: "none", padding: 0 }}
            />
            <Input value={form.secondaryColor} onChange={v => set("secondaryColor", v)} placeholder="#C0C0C0" isDark={isDark} />
          </div>
        </Field>
      </div>

      {/* Color preview */}
      <div style={{
        borderRadius: 10, overflow: "hidden",
        border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #DDE3EA",
      }}>
        <div style={{ height: 10, background: `linear-gradient(90deg, ${form.primaryColor}, ${form.secondaryColor})` }} />
        <div style={{ padding: "12px 14px", background: isDark ? "rgba(255,255,255,0.03)" : "#F8FAFC" }}>
          <span style={{ fontSize: 11, color: isDark ? "#64748B" : "#4B5563", fontWeight: 600 }}>Brand color preview</span>
        </div>
      </div>

      <Field label="Brand Tone">
        <Select
          value={form.brandTone}
          onChange={v => set("brandTone", v)}
          options={BRAND_TONES}
          isDark={isDark}
        />
      </Field>
    </div>
  );
}

function Step5({ form, set, isDark }: { form: OnboardingForm; set: (k: keyof OnboardingForm, v: string | boolean | string[]) => void; isDark: boolean }) {
  const toggle = (id: string) => {
    const current = form.modulesEnabled;
    const next = current.includes(id) ? current.filter(m => m !== id) : [...current, id];
    set("modulesEnabled", next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 13, color: isDark ? "#94A3B8" : "#374151", margin: "0 0 8px", lineHeight: 1.5 }}>
        Select which AI Edge modules to activate for this client. You can change these after deployment.
      </p>
      {MODULES.map(m => {
        const active = form.modulesEnabled.includes(m.id);
        return (
          <div
            key={m.id}
            onClick={() => toggle(m.id)}
            style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "14px 16px", borderRadius: 10, cursor: "pointer",
              background: active
                ? (isDark ? "rgba(0,174,239,0.08)" : "#EFF6FF")
                : (isDark ? "rgba(255,255,255,0.02)" : "#F8FAFC"),
              border: active
                ? `1px solid ${isDark ? "rgba(0,174,239,0.3)" : "#BFDBFE"}`
                : `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "#DDE3EA"}`,
              transition: "all 0.15s",
            }}
          >
            <div style={{
              width: 38, height: 38, borderRadius: 9, flexShrink: 0,
              background: active ? "rgba(0,174,239,0.15)" : (isDark ? "rgba(255,255,255,0.05)" : "#EEF2F7"),
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, transition: "background 0.15s",
            }}>
              {m.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: active ? "#00AEEF" : (isDark ? "#E2E8F0" : "#111827"), marginBottom: 2 }}>
                {m.label}
              </div>
              <div style={{ fontSize: 11, color: isDark ? "#64748B" : "#4B5563" }}>
                {m.desc}
              </div>
            </div>
            <div style={{
              width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
              background: active ? "#00AEEF" : "transparent",
              border: active ? "2px solid #00AEEF" : `2px solid ${isDark ? "rgba(255,255,255,0.2)" : "#CBD5E1"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}>
              {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FFFFFF" }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Step6Deploy({
  form, isDark, deploying, deployed, deployResult, onDeploy,
}: {
  form: OnboardingForm;
  isDark: boolean;
  deploying: boolean;
  deployed: boolean;
  deployResult: DeployResult | null;
  onDeploy: () => void;
}) {
  const cardBg = isDark ? "rgba(255,255,255,0.03)" : "#F8FAFC";
  const cardBorder = isDark ? "rgba(255,255,255,0.07)" : "#DDE3EA";
  const labelColor = isDark ? "#64748B" : "#4B5563";
  const valueColor = isDark ? "#E2E8F0" : "#111827";

  if (deployed && deployResult) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "20px 0" }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: "rgba(16,185,129,0.15)", border: "2px solid #10B981",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32,
        }}>
          ✅
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: isDark ? "#FFFFFF" : "#111827", marginBottom: 6 }}>
            {deployResult.client.businessName} is Live!
          </div>
          <div style={{ fontSize: 13, color: isDark ? "#94A3B8" : "#374151" }}>
            Client workspace deployed successfully
          </div>
        </div>

        <div style={{ width: "100%", background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 12, padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              ["Client ID",       deployResult.client.id.slice(0, 12) + "…"],
              ["Workspace",       deployResult.workspace],
              ["Deployed At",     new Date(deployResult.deployedAt).toLocaleTimeString()],
              ["Modules Active",  `${deployResult.modulesActivated.length} modules`],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 10, fontWeight: 700, color: labelColor, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: valueColor }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ width: "100%", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            ✓ Modules Activated
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {deployResult.modulesActivated.map(id => {
              const m = MODULES.find(x => x.id === id);
              return m ? (
                <span key={id} style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20,
                  background: "rgba(16,185,129,0.12)", color: "#10B981",
                  border: "1px solid rgba(16,185,129,0.25)",
                }}>
                  {m.icon} {m.label}
                </span>
              ) : null;
            })}
          </div>
        </div>
      </div>
    );
  }

  const rows: [string, string][] = [
    ["Business",        form.businessName || "—"],
    ["Industry",        form.industry || "—"],
    ["Phone",           form.mainPhone || "—"],
    ["Forwarding",      form.forwardingPhone || "—"],
    ["Email",           form.email || "—"],
    ["Location",        [form.city, form.state, form.zip].filter(Boolean).join(", ") || "—"],
    ["Service Radius",  form.serviceRadius ? `${form.serviceRadius} miles` : "—"],
    ["Business Hours",  form.businessHours || "—"],
    ["Emergency Svc",   form.emergencyService ? "Yes" : "No"],
    ["Appt Required",   form.appointmentRequired ? "Yes" : "No"],
    ["Brand Tone",      BRAND_TONES.find(t => t.value === form.brandTone)?.label || "—"],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Summary table */}
      <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${cardBorder}`, fontSize: 10, fontWeight: 700, color: labelColor, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Deployment Summary
        </div>
        {rows.map(([k, v], i) => (
          <div key={k} style={{
            display: "flex", justifyContent: "space-between", gap: 12,
            padding: "9px 14px",
            background: i % 2 === 0 ? "transparent" : (isDark ? "rgba(255,255,255,0.015)" : "#F8FAFC"),
            borderBottom: i < rows.length - 1 ? `1px solid ${cardBorder}` : "none",
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: labelColor }}>{k}</span>
            <span style={{ fontSize: 11, color: valueColor, textAlign: "right", maxWidth: "60%" }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Modules */}
      <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 12, padding: "12px 14px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: labelColor, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
          Modules to Activate ({form.modulesEnabled.length})
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {form.modulesEnabled.length === 0
            ? <span style={{ fontSize: 12, color: isDark ? "#64748B" : "#9CA3AF" }}>No modules selected</span>
            : form.modulesEnabled.map(id => {
                const m = MODULES.find(x => x.id === id);
                return m ? (
                  <span key={id} style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20,
                    background: "rgba(0,174,239,0.1)", color: "#00AEEF",
                    border: "1px solid rgba(0,174,239,0.25)",
                  }}>
                    {m.icon} {m.label}
                  </span>
                ) : null;
              })
          }
        </div>
      </div>

      {/* Deploy button */}
      <button
        onClick={onDeploy}
        disabled={deploying || !form.businessName || !form.mainPhone}
        style={{
          width: "100%", padding: "15px", borderRadius: 12, fontSize: 15, fontWeight: 800,
          cursor: (deploying || !form.businessName || !form.mainPhone) ? "not-allowed" : "pointer",
          border: "none",
          background: (deploying || !form.businessName || !form.mainPhone)
            ? (isDark ? "rgba(255,255,255,0.08)" : "#E2E8F0")
            : "linear-gradient(135deg, #00AEEF, #0080CC)",
          color: (deploying || !form.businessName || !form.mainPhone)
            ? (isDark ? "#475569" : "#9CA3AF")
            : "#FFFFFF",
          letterSpacing: "0.3px",
          boxShadow: (deploying || !form.businessName || !form.mainPhone) ? "none" : "0 4px 20px rgba(0,174,239,0.35)",
          transition: "all 0.2s",
        }}
      >
        {deploying ? "⚙️  Deploying Client…" : "🚀  Deploy Client"}
      </button>

      {(!form.businessName || !form.mainPhone) && (
        <p style={{ fontSize: 11, color: "#EF4444", textAlign: "center", margin: 0 }}>
          Business Name and Main Phone are required before deploying.
        </p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ClientOnboardingPage() {
  const { colors: t, isDark } = useTheme();
  const apiFetch = useApiFetch();

  const [step, setStep]           = useState(1);
  const [form, setForm]           = useState<OnboardingForm>(EMPTY_FORM);
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed]   = useState(false);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [error, setError]         = useState<string | null>(null);

  function set(key: keyof OnboardingForm, value: string | boolean | string[]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleDeploy() {
    if (!form.businessName || !form.mainPhone) return;
    setDeploying(true);
    setError(null);
    try {
      // Create the onboarding record
      const created = await apiFetch<{ id: string }>("/client-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          emergencyService:    form.emergencyService,
          appointmentRequired: form.appointmentRequired,
          modulesEnabled:      form.modulesEnabled,
        }),
      });
      // Deploy it
      const result = await apiFetch<DeployResult>(`/client-onboarding/${created.id}/deploy`, {
        method: "POST",
      });
      setDeployResult(result);
      setDeployed(true);
    } catch (err: any) {
      setError(err.message || "Deploy failed. Please try again.");
    } finally {
      setDeploying(false);
    }
  }

  function resetWizard() {
    setForm(EMPTY_FORM);
    setStep(1);
    setDeployed(false);
    setDeployResult(null);
    setError(null);
  }

  const canAdvance = () => {
    if (step === 1) return form.businessName.trim() !== "" && form.mainPhone.trim() !== "";
    return true;
  };

  const STEP_CONTENT: Record<number, React.ReactNode> = {
    1: <Step1 form={form} set={set} isDark={isDark} />,
    2: <Step2 form={form} set={set} isDark={isDark} />,
    3: <Step3 form={form} set={set} isDark={isDark} />,
    4: <Step4 form={form} set={set} isDark={isDark} />,
    5: <Step5 form={form} set={set} isDark={isDark} />,
    6: <Step6Deploy form={form} isDark={isDark} deploying={deploying} deployed={deployed} deployResult={deployResult} onDeploy={handleDeploy} />,
  };

  return (
    <AppShell>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)", borderRadius: 20, padding: "4px 14px", marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: "#00AEEF", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>👤 Client Onboarding</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: t.text, letterSpacing: "-0.5px", margin: "0 0 6px" }}>
            Client Onboarding Engine
          </h1>
          <p style={{ fontSize: 14, color: t.text2, margin: 0 }}>
            Deploy a new business into AI Edge in minutes — complete profile, features, and automation.
          </p>
        </div>

        {/* ── Step indicator ── */}
        <div style={{ display: "flex", gap: 0, marginBottom: 28, overflowX: "auto" }}>
          {STEPS.map((s, i) => {
            const done    = s.id < step;
            const active  = s.id === step;
            return (
              <div
                key={s.id}
                style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}
              >
                <div
                  onClick={() => { if (done) setStep(s.id); }}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                    cursor: done ? "pointer" : "default", flex: 1, padding: "0 4px",
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: done ? 14 : 16,
                    background: done
                      ? "#10B981"
                      : active
                        ? "#00AEEF"
                        : (isDark ? "rgba(255,255,255,0.06)" : "#EEF2F7"),
                    border: active
                      ? "2px solid #00AEEF"
                      : done
                        ? "2px solid #10B981"
                        : `2px solid ${isDark ? "rgba(255,255,255,0.1)" : "#DDE3EA"}`,
                    color: (done || active) ? "#FFFFFF" : (isDark ? "#475569" : "#94A3B8"),
                    fontWeight: 800, fontSize: 13,
                    boxShadow: active ? "0 0 12px rgba(0,174,239,0.4)" : "none",
                    transition: "all 0.2s",
                    flexShrink: 0,
                  }}>
                    {done ? "✓" : s.icon}
                  </div>
                  <div style={{
                    fontSize: 9, fontWeight: 700, textAlign: "center", lineHeight: 1.2,
                    color: active ? "#00AEEF" : done ? "#10B981" : (isDark ? "#475569" : "#94A3B8"),
                    textTransform: "uppercase", letterSpacing: "0.4px", whiteSpace: "nowrap",
                  }}>
                    {s.label}
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{
                    height: 2, flex: 0, width: 16, flexShrink: 0, margin: "0 -2px",
                    marginBottom: 16,
                    background: done
                      ? "#10B981"
                      : (isDark ? "rgba(255,255,255,0.06)" : "#E2E8F0"),
                    transition: "background 0.3s",
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Card ── */}
        <div style={{
          background: t.card,
          border: isDark ? "1px solid rgba(255,255,255,0.07)" : `1px solid ${t.border}`,
          borderRadius: 16,
          boxShadow: isDark ? "0 4px 32px rgba(0,0,0,0.3)" : t.shadow,
          overflow: "hidden",
        }}>
          {/* Card header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "16px 20px",
            borderBottom: isDark ? "1px solid rgba(255,255,255,0.06)" : `1px solid ${t.border}`,
            background: isDark ? "rgba(0,174,239,0.04)" : "#F8FAFC",
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            }}>
              {STEPS[step - 1].icon}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: t.text }}>
                Step {step} of {STEPS.length} — {STEPS[step - 1].label}
              </div>
              <div style={{ fontSize: 11, color: t.text3 }}>
                {step === 1 && "Core business information for AI Edge setup"}
                {step === 2 && "Define where this business serves customers"}
                {step === 3 && "Operating hours, services, and capabilities"}
                {step === 4 && "Visual identity and communication style"}
                {step === 5 && "Choose which AI modules to activate"}
                {step === 6 && "Review and deploy the client workspace"}
              </div>
            </div>
            <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "#00AEEF" }}>
              {Math.round(((step - 1) / STEPS.length) * 100)}%
            </div>
          </div>

          {/* Card body */}
          <div style={{ padding: "24px 20px" }}>
            {STEP_CONTENT[step]}
          </div>

          {/* Error */}
          {error && (
            <div style={{ margin: "0 20px 16px", padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 12, color: "#EF4444" }}>
              {error}
            </div>
          )}

          {/* Card footer — nav buttons */}
          {!deployed && (
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "14px 20px",
              borderTop: isDark ? "1px solid rgba(255,255,255,0.06)" : `1px solid ${t.border}`,
              background: isDark ? "rgba(0,0,0,0.1)" : "#F8FAFC",
            }}>
              <button
                onClick={() => { if (step > 1) setStep(s => s - 1); }}
                disabled={step === 1}
                style={{
                  padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: step === 1 ? "not-allowed" : "pointer",
                  border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #DDE3EA",
                  background: "transparent",
                  color: step === 1 ? (isDark ? "#334155" : "#CBD5E1") : (isDark ? "#94A3B8" : "#374151"),
                }}
              >
                ← Back
              </button>

              {step < 6 && (
                <button
                  onClick={() => { if (canAdvance()) setStep(s => s + 1); }}
                  disabled={!canAdvance()}
                  style={{
                    padding: "9px 24px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                    cursor: canAdvance() ? "pointer" : "not-allowed",
                    border: "none",
                    background: canAdvance() ? "linear-gradient(135deg, #00AEEF, #0080CC)" : (isDark ? "rgba(255,255,255,0.08)" : "#E2E8F0"),
                    color: canAdvance() ? "#FFFFFF" : (isDark ? "#475569" : "#9CA3AF"),
                    boxShadow: canAdvance() ? "0 2px 12px rgba(0,174,239,0.3)" : "none",
                  }}
                >
                  Continue →
                </button>
              )}
            </div>
          )}

          {/* New client button after deploy */}
          {deployed && (
            <div style={{ padding: "14px 20px", borderTop: isDark ? "1px solid rgba(255,255,255,0.06)" : `1px solid ${t.border}`, display: "flex", justifyContent: "center" }}>
              <button
                onClick={resetWizard}
                style={{
                  padding: "9px 24px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: "pointer", border: "none",
                  background: "linear-gradient(135deg, #00AEEF, #0080CC)", color: "#FFFFFF",
                  boxShadow: "0 2px 12px rgba(0,174,239,0.3)",
                }}
              >
                + Onboard Another Client
              </button>
            </div>
          )}
        </div>

      </div>
    </AppShell>
  );
}
