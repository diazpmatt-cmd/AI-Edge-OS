// ── Client Onboarding Engine V1 ───────────────────────────────────────────────
// Frontend only. Zero API calls. Preview panel updates live from form state.

import { useState } from "react";

// ── Brand ─────────────────────────────────────────────────────────────────────
const B = {
  navy:    "#030612",
  panel:   "#080E1F",
  panel2:  "#0A1228",
  border:  "rgba(255,255,255,0.08)",
  blue:    "#00AEEF",
  cyan:    "#06B6D4",
  sky:     "#38BDF8",
  emerald: "#10B981",
  gold:    "#FBBF24",
  purple:  "#A78BFA",
  orange:  "#F97316",
  silver:  "#94A3B8",
  white:   "#F1F5F9",
  dim:     "#64748B",
};

// ── Templates ─────────────────────────────────────────────────────────────────
const TEMPLATES = [
  { id: "pest",       label: "🐛 Pest Control",          industry: "Pest Control",         services: "Termite Treatment, Bed Bug Elimination, General Pest Control, Rodent Control" },
  { id: "home",       label: "🔧 Home Services",          industry: "Home Services",         services: "Plumbing, HVAC, Electrical, General Repairs" },
  { id: "restaurant", label: "🍽️ Local Restaurant",       industry: "Restaurant & Food",     services: "Dine-In, Takeout, Catering, Private Events" },
  { id: "beauty",     label: "💅 Beauty / Wellness",      industry: "Beauty & Wellness",     services: "Hair Styling, Nail Care, Skincare, Massage Therapy" },
  { id: "etsy",       label: "🧶 Etsy / Handmade",        industry: "E-Commerce / Handmade", services: "Custom Orders, Wholesale, Workshops, Gift Wrapping" },
  { id: "general",    label: "🏢 General Small Business", industry: "General Business",      services: "Consultation, Products, Services, Customer Support" },
] as const;

// ── Modules ───────────────────────────────────────────────────────────────────
const MODULES = [
  { id: "workspace",    label: "Client Workspace",     icon: "🏢", color: B.sky     },
  { id: "receptionist", label: "AI Receptionist",      icon: "📞", color: B.blue    },
  { id: "leads",        label: "Lead Recovery",        icon: "🔥", color: B.orange  },
  { id: "media",        label: "Media Engine",         icon: "🎥", color: B.blue    },
  { id: "reviews",      label: "Review Engine",        icon: "⭐", color: B.gold    },
  { id: "local",        label: "Local Presence Engine",icon: "📍", color: B.cyan    },
  { id: "publishing",   label: "Publishing Center",    icon: "📤", color: B.purple  },
  { id: "revenue",      label: "Revenue Forecast",     icon: "💰", color: B.emerald },
  { id: "apollos",      label: "Apollos Briefing",     icon: "🧠", color: B.purple  },
] as const;

type ModuleId = typeof MODULES[number]["id"];

// ── BB&B defaults ─────────────────────────────────────────────────────────────
const BBB = {
  businessName:    "Bed Bugs & Beyond",
  industry:        "Pest Control",
  phone:           "",
  forwardingPhone: "",
  website:         "bedbugsandbeyond.com",
  serviceArea:     "Baldwin County, AL",
  hours:           "Mon–Fri 7AM–6PM, Sat 8AM–3PM",
  services:        "Bed Bug Elimination, Rodent Control, General Pest Control, Home Inspections",
  brandColors:     "#0D2B45, #0077B6, #F26C21",
};

// ── Reusable micro-components ──────────────────────────────────────────────────
function FieldLabel({ children, required }: { children: string; required?: boolean }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, color: B.silver, letterSpacing: "0.4px", textTransform: "uppercase", marginBottom: 5, display: "flex", alignItems: "center", gap: 3 }}>
      {children}
      {required && <span style={{ color: "#F87171", fontSize: 11, fontWeight: 900, lineHeight: 1 }}>*</span>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", boxSizing: "border-box",
        background: B.panel2, border: `1px solid ${B.border}`,
        borderRadius: 8, padding: "8px 12px",
        fontSize: 12.5, color: B.white, outline: "none",
        fontFamily: "inherit", transition: "border-color 0.15s",
      }}
      onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "rgba(56,189,248,0.4)"; }}
      onBlur={e  => { (e.target as HTMLInputElement).style.borderColor = B.border; }}
    />
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ClientOnboardingPage() {
  const [form, setForm]       = useState({ ...BBB });
  const [modules, setModules] = useState<Record<ModuleId, boolean>>({
    workspace: true, receptionist: true, leads: true, media: true,
    reviews: true, local: true, publishing: true, revenue: true, apollos: true,
  });
  const [template, setTemplate]             = useState<string>("pest");
  const [logoName, setLogoName]             = useState<string>("");
  const [saved, setSaved]                   = useState(false);
  const [previewGenerated, setPreviewGenerated] = useState(false);

  function setField(field: keyof typeof BBB, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    setSaved(false);
    setPreviewGenerated(false);
  }

  function applyTemplate(id: string) {
    const t = TEMPLATES.find(t => t.id === id);
    if (!t) return;
    setTemplate(id);
    setForm(f => ({ ...f, industry: t.industry, services: t.services }));
    setPreviewGenerated(false);
    setSaved(false);
  }

  function toggleModule(id: ModuleId) {
    setModules(m => ({ ...m, [id]: !m[id] }));
    setPreviewGenerated(false);
  }

  const activeModules = MODULES.filter(m => modules[m.id]);
  const serviceList   = (form.services || "").split(",").map(s => s.trim()).filter(Boolean);
  const colorList     = (form.brandColors || "").split(",").map(c => c.trim()).filter(Boolean);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: B.navy, color: B.white, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(135deg, #080E1F 0%, #0A1228 60%, #030612 100%)",
        borderBottom: `1px solid ${B.border}`, padding: "26px 36px 22px",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: "linear-gradient(135deg, rgba(56,189,248,0.25) 0%, rgba(0,174,239,0.15) 100%)",
          border: "1px solid rgba(56,189,248,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
        }}>🚀</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 21, fontWeight: 800, color: B.white, letterSpacing: "-0.3px" }}>
            Client Onboarding Engine
          </div>
          <div style={{ fontSize: 12, color: B.dim, marginTop: 3, maxWidth: 620 }}>
            Set up a new client workspace, AI receptionist, lead recovery, media, reviews, and local visibility from one guided flow.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "1px",
            background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.35)",
            color: B.sky, borderRadius: 8, padding: "4px 12px",
          }}>V1 · FRONTEND PREVIEW ONLY</span>
          <span style={{
            fontSize: 8.5, fontWeight: 700, letterSpacing: "0.5px",
            background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)",
            color: B.gold, borderRadius: 6, padding: "3px 10px",
          }}>⚠️ No live data · No AI calls · No provisioning</span>
        </div>
      </div>

      {/* ── Body: 2-column grid ── */}
      <div style={{ padding: "28px 36px", display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "start" }}>

        {/* ════ LEFT COLUMN ════════════════════════════════════════════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── 1. Template Selector ── */}
          <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "20px 22px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: B.sky, letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 14 }}>
              📋 Select a Template
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {TEMPLATES.map(t => {
                const active = template === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t.id)}
                    style={{
                      background: active ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${active ? "rgba(56,189,248,0.5)" : B.border}`,
                      borderRadius: 10, padding: "10px 8px", fontSize: 11.5, fontWeight: 600,
                      color: active ? B.sky : B.silver, cursor: "pointer", textAlign: "center",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={e => { if (!active) { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "rgba(56,189,248,0.25)"; b.style.color = B.white; } }}
                    onMouseLeave={e => { if (!active) { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = B.border; b.style.color = B.silver; } }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            {/* BB&B Golden Template badge */}
            {template === "pest" && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: "0.5px",
                  background: "linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(245,158,11,0.12) 100%)",
                  border: "1px solid rgba(251,191,36,0.45)",
                  color: B.gold, borderRadius: 8, padding: "5px 12px",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  ⭐ BB&B Golden Template — Pest Control defaults loaded
                </span>
                <span style={{ fontSize: 10, color: B.dim }}>Pre-filled with Bed Bugs &amp; Beyond data</span>
              </div>
            )}
          </div>

          {/* ── 2. Client Setup Form ── */}
          <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "20px 22px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: B.sky, letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 18 }}>
              🏢 Client Setup
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <FieldLabel required>Business Name</FieldLabel>
                <TextInput value={form.businessName} onChange={v => setField("businessName", v)} placeholder="e.g. Bed Bugs & Beyond" />
              </div>
              <div>
                <FieldLabel required>Industry</FieldLabel>
                <TextInput value={form.industry} onChange={v => setField("industry", v)} placeholder="e.g. Pest Control" />
              </div>
              <div>
                <FieldLabel required>Main Phone Number</FieldLabel>
                <TextInput value={form.phone} onChange={v => setField("phone", v)} placeholder="(XXX) XXX-XXXX" />
              </div>
              <div>
                <FieldLabel required>Forwarding Phone Number</FieldLabel>
                <TextInput value={form.forwardingPhone} onChange={v => setField("forwardingPhone", v)} placeholder="(XXX) XXX-XXXX" />
              </div>
              <div>
                <FieldLabel>Website</FieldLabel>
                <TextInput value={form.website} onChange={v => setField("website", v)} placeholder="yoursite.com" />
              </div>
              <div>
                <FieldLabel required>Service Area</FieldLabel>
                <TextInput value={form.serviceArea} onChange={v => setField("serviceArea", v)} placeholder="e.g. Baldwin County, AL" />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <FieldLabel>Business Hours</FieldLabel>
                <TextInput value={form.hours} onChange={v => setField("hours", v)} placeholder="e.g. Mon–Fri 8AM–6PM" />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <FieldLabel>Services Offered</FieldLabel>
                <TextInput value={form.services} onChange={v => setField("services", v)} placeholder="Comma-separated list of services" />
              </div>
              <div>
                <FieldLabel>Brand Colors (hex)</FieldLabel>
                <TextInput value={form.brandColors} onChange={v => setField("brandColors", v)} placeholder="#000000, #FFFFFF" />
              </div>
              {/* Logo Upload Placeholder */}
              <div>
                <FieldLabel>Logo Upload</FieldLabel>
                <label style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: B.panel2, border: "1px dashed rgba(56,189,248,0.3)",
                  borderRadius: 8, padding: "8px 12px", cursor: "pointer",
                }}>
                  <span style={{ fontSize: 14 }}>🖼️</span>
                  <span style={{ fontSize: 11.5, color: logoName ? B.sky : B.dim }}>
                    {logoName || "Click to upload logo…"}
                  </span>
                  <input
                    type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => setLogoName(e.target.files?.[0]?.name || "")}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* ── 3. Setup Modules Checklist ── */}
          <div style={{ background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16, padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: B.sky, letterSpacing: "1.2px", textTransform: "uppercase" }}>
                ✅ Setup Modules
              </div>
              <span style={{ fontSize: 10.5, color: B.dim }}>{activeModules.length} / {MODULES.length} active</span>
            </div>
            {/* Progress Meter */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 9.5, color: B.dim, fontWeight: 600 }}>Setup Progress</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: activeModules.length === MODULES.length ? B.emerald : B.sky }}>
                  {Math.round((activeModules.length / MODULES.length) * 100)}%
                </span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 99,
                  width: `${Math.round((activeModules.length / MODULES.length) * 100)}%`,
                  background: activeModules.length === MODULES.length
                    ? `linear-gradient(90deg, ${B.emerald}, #34D399)`
                    : `linear-gradient(90deg, ${B.blue}, ${B.sky})`,
                  transition: "width 0.3s ease",
                }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {MODULES.map(mod => {
                const on = modules[mod.id];
                return (
                  <button
                    key={mod.id}
                    onClick={() => toggleModule(mod.id)}
                    style={{
                      background: on ? `${mod.color}14` : "rgba(255,255,255,0.02)",
                      border: `1px solid ${on ? `${mod.color}45` : B.border}`,
                      borderRadius: 10, padding: "10px 12px",
                      cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                      display: "flex", alignItems: "center", gap: 8,
                    }}
                  >
                    {/* Checkbox */}
                    <span style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      background: on ? mod.color : "rgba(255,255,255,0.05)",
                      border: `1px solid ${on ? mod.color : "rgba(255,255,255,0.15)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, color: "#000", fontWeight: 900,
                    }}>{on ? "✓" : ""}</span>
                    <span style={{ fontSize: 11, color: on ? B.white : B.dim, fontWeight: on ? 600 : 400, lineHeight: 1.3 }}>
                      {mod.icon} {mod.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Action Buttons ── */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setSaved(true)}
              style={{
                flex: 1, background: saved ? "rgba(16,185,129,0.12)" : "rgba(56,189,248,0.1)",
                border: `1px solid ${saved ? "rgba(16,185,129,0.35)" : "rgba(56,189,248,0.3)"}`,
                borderRadius: 10, padding: "11px 0", fontSize: 13, fontWeight: 700,
                color: saved ? B.emerald : B.sky, cursor: "pointer", transition: "all 0.2s",
              }}
            >
              {saved ? "✓ Draft Saved" : "💾 Save Draft Setup"}
            </button>
            <button
              onClick={() => setPreviewGenerated(true)}
              style={{
                flex: 1,
                background: "linear-gradient(135deg, rgba(0,174,239,0.18) 0%, rgba(6,182,212,0.12) 100%)",
                border: "1px solid rgba(0,174,239,0.4)", borderRadius: 10, padding: "11px 0",
                fontSize: 13, fontWeight: 700, color: B.blue, cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(0,174,239,0.28) 0%, rgba(6,182,212,0.2) 100%)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(0,174,239,0.18) 0%, rgba(6,182,212,0.12) 100%)"; }}
            >
              🔍 Generate Client Preview
            </button>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <button
                  disabled
                  title="Coming soon — provisioning not yet available"
                  style={{
                    flex: 1, background: "rgba(255,255,255,0.02)", border: `1px solid ${B.border}`,
                    borderRadius: 10, padding: "11px 0", fontSize: 12, fontWeight: 700,
                    color: B.dim, cursor: "not-allowed",
                  }}
                >
                  🚀 Provision Client
                  <span style={{ display: "block", fontSize: 8, fontWeight: 800, color: B.gold, letterSpacing: "0.5px", marginTop: 2 }}>COMING SOON</span>
                </button>
                <span style={{
                  fontSize: 8, fontWeight: 800, letterSpacing: "0.5px", whiteSpace: "nowrap",
                  background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)",
                  color: B.gold, borderRadius: 7, padding: "4px 8px",
                }}>⏳ Provisioning<br/>Coming Soon</span>
              </div>
              <div style={{
                fontSize: 9.5, color: B.dim, lineHeight: 1.5,
                background: "rgba(255,255,255,0.02)", border: `1px solid ${B.border}`,
                borderRadius: 8, padding: "8px 10px",
              }}>
                Live provisioning will later create workspace, Telnyx setup, AI receptionist, lead recovery, local presence, media, and review automation.
              </div>
            </div>
          </div>
        </div>

        {/* ════ RIGHT COLUMN — Preview Panel ══════════════════════════════ */}
        <div style={{
          background: B.panel, border: `1px solid ${B.border}`, borderRadius: 16,
          padding: "20px 22px", position: "sticky", top: 28,
        }}>
          {/* Panel header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: B.sky, letterSpacing: "1.2px", textTransform: "uppercase" }}>
              👁 Setup Preview
            </div>
            <span style={{
              fontSize: 8, fontWeight: 800, letterSpacing: "0.5px", borderRadius: 6, padding: "2px 7px",
              background: previewGenerated ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${previewGenerated ? "rgba(16,185,129,0.3)" : B.border}`,
              color: previewGenerated ? B.emerald : B.dim,
            }}>{previewGenerated ? "GENERATED" : "LIVE"}</span>
          </div>

          {/* Business identity card */}
          <div style={{
            background: "linear-gradient(135deg, rgba(56,189,248,0.07) 0%, rgba(0,174,239,0.04) 100%)",
            border: "1px solid rgba(56,189,248,0.15)", borderRadius: 12, padding: "14px 16px", marginBottom: 14,
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: B.white, marginBottom: 2 }}>
              {form.businessName || "—"}
            </div>
            <div style={{ fontSize: 11, color: B.sky, marginBottom: 10 }}>{form.industry || "—"}</div>
            {[
              { icon: "📞", val: form.phone },
              { icon: "🔀", val: form.forwardingPhone ? `Fwd → ${form.forwardingPhone}` : "" },
              { icon: "🌐", val: form.website },
              { icon: "📍", val: form.serviceArea },
              { icon: "🕐", val: form.hours },
            ].map(r => r.val ? (
              <div key={r.icon} style={{ display: "flex", gap: 7, fontSize: 10.5, color: B.silver, marginBottom: 3 }}>
                <span style={{ flexShrink: 0 }}>{r.icon}</span>
                <span>{r.val}</span>
              </div>
            ) : null)}
          </div>

          {/* Services */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: B.dim, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 7 }}>Services</div>
            {serviceList.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {serviceList.map(s => (
                  <span key={s} style={{
                    fontSize: 10, background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.2)",
                    color: B.sky, borderRadius: 6, padding: "2px 7px",
                  }}>{s}</span>
                ))}
              </div>
            ) : <span style={{ fontSize: 10.5, color: B.dim }}>—</span>}
          </div>

          {/* Brand colors */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: B.dim, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 7 }}>Brand Colors</div>
            {colorList.length > 0 ? (
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                {colorList.map(c => (
                  <div key={c} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, background: c, border: "1px solid rgba(255,255,255,0.15)" }} />
                    <span style={{ fontSize: 9.5, color: B.dim }}>{c}</span>
                  </div>
                ))}
              </div>
            ) : <span style={{ fontSize: 10.5, color: B.dim }}>—</span>}
          </div>

          {/* Logo */}
          {logoName && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: B.dim, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 5 }}>Logo</div>
              <span style={{ fontSize: 10.5, color: B.emerald }}>✓ {logoName}</span>
            </div>
          )}

          {/* Active modules */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: B.dim, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>
              Active Modules ({activeModules.length}/{MODULES.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {MODULES.map(mod => {
                const on = modules[mod.id];
                return (
                  <div key={mod.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: on ? B.silver : B.dim }}>
                      {mod.icon} {mod.label}
                    </span>
                    <span style={{
                      fontSize: 8, fontWeight: 700, borderRadius: 5, padding: "1px 6px",
                      color: on ? mod.color : B.dim,
                      background: on ? `${mod.color}14` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${on ? `${mod.color}30` : "rgba(255,255,255,0.06)"}`,
                    }}>{on ? "ON" : "OFF"}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Provision status pill */}
          <div style={{
            marginTop: 8, padding: "10px 12px", borderRadius: 10,
            background: "rgba(255,255,255,0.02)", border: `1px dashed ${B.border}`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 10, color: B.dim, marginBottom: 3 }}>One-click provisioning</div>
            <div style={{ fontSize: 9, fontWeight: 800, color: B.gold, letterSpacing: "0.5px" }}>COMING SOON</div>
          </div>
        </div>
      </div>
    </div>
  );
}
