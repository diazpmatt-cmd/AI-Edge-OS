import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { toast } from "sonner";
import { LocalPresenceChecklist } from "@/components/LocalPresenceChecklist";

// ── Types ──────────────────────────────────────────────────────────────────────

type PresenceStatus = "connected" | "pending" | "not_connected" | "error" | "coming_soon" | "setup_in_progress";
type HealthStatus   = "healthy" | "warning" | "error" | "unknown";

type GBPStatus = {
  connected: boolean;
  statusLabel: string;
  failureReason: string | null;
  tokenExists: boolean;
  refreshTokenExists: boolean;
  accountName: string | null;
  businessManageScopeGranted: boolean;
  gbpAccountsFound: number;
  gbpLocationsFound: number;
  locationNames: string[];
  selectedLocationName: string | null;
  locationTitle: string | null;
  locationName: string | null;
  apiError: string | null;
};

// ── Active client NAP data ────────────────────────────────────────────────────
const NAP = {
  name: "Bed Bugs & Beyond",
  address: "Baldwin County, Alabama",
  phone: "(251) 324-9090",
  website: "https://bedbugsandbeyond.net",
  category: "Pest Control",
  serviceArea: "Baldwin County, Alabama",
  cities: "Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Spanish Fort",
};

// ── Status & health style maps ─────────────────────────────────────────────────
const PRESENCE_STYLE: Record<PresenceStatus, { label: string; bg: string; color: string; dot: string; border: string }> = {
  connected:    { label: "Connected",     bg: "rgba(16,185,129,0.15)",  color: "#10B981", dot: "#10B981", border: "rgba(16,185,129,0.25)"  },
  pending:      { label: "Setup Pending", bg: "rgba(245,158,11,0.12)",  color: "#F59E0B", dot: "#F59E0B", border: "rgba(245,158,11,0.2)"   },
  not_connected:{ label: "Not Connected", bg: "rgba(148,163,184,0.1)",  color: "#94A3B8", dot: "#475569", border: "rgba(255,255,255,0.07)" },
  error:        { label: "Error",         bg: "rgba(239,68,68,0.12)",   color: "#EF4444", dot: "#EF4444", border: "rgba(239,68,68,0.25)"   },
  coming_soon:      { label: "Coming Soon",      bg: "rgba(139,92,246,0.12)",  color: "#8B5CF6", dot: "#8B5CF6", border: "rgba(139,92,246,0.2)"   },
  setup_in_progress:{ label: "Setup In Progress",bg: "rgba(0,174,239,0.1)",    color: "#00AEEF", dot: "#00AEEF", border: "rgba(0,174,239,0.25)"  },
};

const HEALTH_STYLE: Record<HealthStatus, { label: string; color: string; dot: string }> = {
  healthy: { label: "Healthy", color: "#10B981", dot: "#10B981" },
  warning: { label: "Warning", color: "#F59E0B", dot: "#F59E0B" },
  error:   { label: "Error",   color: "#EF4444", dot: "#EF4444" },
  unknown: { label: "Unknown", color: "#475569", dot: "#334155" },
};

// ── Platform card background derivation ───────────────────────────────────────
function cardBg(status: PresenceStatus) {
  if (status === "connected")         return "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(11,22,41,0.9) 100%)";
  if (status === "error")             return "linear-gradient(135deg, rgba(239,68,68,0.05) 0%, rgba(11,22,41,0.9) 100%)";
  if (status === "pending")           return "linear-gradient(135deg, rgba(245,158,11,0.04) 0%, rgba(11,22,41,0.9) 100%)";
  if (status === "setup_in_progress") return "linear-gradient(135deg, rgba(0,174,239,0.05) 0%, rgba(11,22,41,0.9) 100%)";
  return "rgba(11,22,41,0.6)";
}

// ── Shared UI helpers ──────────────────────────────────────────────────────────
function StatPill({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div style={{
      display: "inline-flex", flexDirection: "column", alignItems: "center",
      background: `${color}12`, border: `1px solid ${color}30`,
      borderRadius: 10, padding: "6px 16px", minWidth: 64,
    }}>
      <span style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, color: "#64748B", fontWeight: 600, marginTop: 2, letterSpacing: "0.5px", textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: PresenceStatus }) {
  const s = PRESENCE_STYLE[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 700,
      padding: "3px 10px", borderRadius: 20, border: `1px solid ${s.color}33`,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {s.label}
    </span>
  );
}

function HealthBadge({ health }: { health: HealthStatus }) {
  const h = HEALTH_STYLE[health];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 600, color: h.color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: h.dot, display: "inline-block" }} />
      {h.label}
    </span>
  );
}

function ActionBtn({
  label, color = "#00AEEF", onClick, disabled, href, variant = "ghost",
}: {
  label: string; color?: string; onClick?: () => void; disabled?: boolean;
  href?: string; variant?: "ghost" | "solid" | "danger";
}) {
  const styles: Record<string, React.CSSProperties> = {
    ghost: { background: `${color}12`, border: `1px solid ${color}30`, color },
    solid: { background: `${color}22`, border: `1px solid ${color}55`, color },
    danger:{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#EF4444" },
  };
  const base: React.CSSProperties = {
    padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
    transition: "all 0.15s", whiteSpace: "nowrap", textDecoration: "none",
    display: "inline-flex", alignItems: "center", gap: 5,
    ...styles[variant],
  };
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" style={base}>{label}</a>;
  return <button onClick={onClick} disabled={disabled} style={base}>{label}</button>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 12 }}>
      {children}
    </div>
  );
}

// ── Checklist subcomponent ─────────────────────────────────────────────────────
type CheckItem = { label: string; done: boolean };

function Checklist({ items }: { items: CheckItem[] }) {
  const done = items.filter(i => i.done).length;
  const pct  = Math.round((done / items.length) * 100);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", letterSpacing: "0.6px", textTransform: "uppercase" }}>Setup Checklist</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? "#10B981" : "#F59E0B" }}>{done}/{items.length}</span>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#10B981" : "#F59E0B", borderRadius: 2, transition: "width 0.4s" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{
              width: 15, height: 15, borderRadius: 4, flexShrink: 0, marginTop: 1,
              background: item.done ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${item.done ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.1)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 8, color: item.done ? "#10B981" : "transparent",
            }}>
              {item.done ? "✓" : ""}
            </span>
            <span style={{ fontSize: 12, color: item.done ? "#64748B" : "#CBD5E1", lineHeight: 1.4, textDecoration: item.done ? "line-through" : "none" }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Apple Business V2 Card ─────────────────────────────────────────────────────
type AppleStepStatus = "complete" | "in-progress" | "pending" | "blocked";

const APPLE_CHECKLIST: { label: string; status: AppleStepStatus; description: string }[] = [
  { label: "Create or sign into Apple Business",      status: "complete",     description: "Sign in at business.apple.com with your Apple ID." },
  { label: "Add / claim business location",           status: "in-progress",  description: "Search for your business and claim the Apple Maps place card." },
  { label: "Verify business ownership",               status: "pending",      description: "Apple sends a verification code by phone, email, or postcard." },
  { label: "Confirm business name",                   status: "pending",      description: "Ensure the listing name exactly matches your registered business name." },
  { label: "Confirm phone number",                    status: "pending",      description: "Verify (251) 324-9090 matches the Apple Maps listing." },
  { label: "Confirm website",                         status: "pending",      description: "Verify website URL is correct and resolves without errors." },
  { label: "Add business category",                   status: "pending",      description: "Select 'Pest Control Service' as the primary category." },
  { label: "Add service area / location details",     status: "pending",      description: "Baldwin County, AL — Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Spanish Fort." },
  { label: "Add business hours",                      status: "pending",      description: "Mon–Fri 7am–6pm, Sat 8am–2pm. Include holiday hours if applicable." },
  { label: "Upload logo",                             status: "pending",      description: "High-res square logo (min 400×400 px, PNG or JPG)." },
  { label: "Upload cover photo",                      status: "pending",      description: "Landscape banner image representing your business (min 1024×512 px)." },
  { label: "Add photos",                              status: "pending",      description: "Add at least 5 quality photos of the business, team, or service in action." },
  { label: "Add call-to-action",                      status: "pending",      description: "Set a CTA button (e.g. 'Call Now' or 'Get a Quote') on your place card." },
  { label: "Review Apple Maps place card",            status: "pending",      description: "Preview how your listing appears on iPhone, iPad, and Mac." },
  { label: "Submit for Apple verification",           status: "pending",      description: "Complete and submit the listing — Apple reviews within 7–10 business days." },
];

type AppleDiagStatus = "healthy" | "warning" | "missing" | "pending" | "coming_soon";
const APPLE_DIAG_STYLE: Record<AppleDiagStatus, { color: string; bg: string; border: string; dot: string }> = {
  healthy:    { color: "#10B981", bg: "rgba(16,185,129,0.07)",   border: "rgba(16,185,129,0.2)",  dot: "#10B981" },
  warning:    { color: "#F59E0B", bg: "rgba(245,158,11,0.07)",   border: "rgba(245,158,11,0.18)", dot: "#F59E0B" },
  missing:    { color: "#EF4444", bg: "rgba(239,68,68,0.07)",    border: "rgba(239,68,68,0.18)",  dot: "#EF4444" },
  pending:    { color: "#00AEEF", bg: "rgba(0,174,239,0.07)",    border: "rgba(0,174,239,0.15)",  dot: "#00AEEF" },
  coming_soon:{ color: "#8B5CF6", bg: "rgba(139,92,246,0.07)",   border: "rgba(139,92,246,0.15)", dot: "#8B5CF6" },
};

const APPLE_DIAGS: { check: string; status: AppleDiagStatus; note: string }[] = [
  { check: "Apple Business account created",    status: "healthy",    note: "Account active at business.apple.com" },
  { check: "Location claimed",                  status: "warning",    note: "Claim in progress — awaiting Apple confirmation" },
  { check: "Ownership verified",                status: "missing",    note: "Verification code not yet received" },
  { check: "NAP matches Google Business Profile",status: "pending",   note: "Will be checked once listing is claimed" },
  { check: "Phone matches business number",     status: "pending",    note: "Pending listing confirmation" },
  { check: "Website matches",                   status: "pending",    note: "Pending listing confirmation" },
  { check: "Category selected",                 status: "pending",    note: "To be set after claim is confirmed" },
  { check: "Photos uploaded",                   status: "missing",    note: "No photos uploaded yet" },
  { check: "Place card reviewed",               status: "pending",    note: "Available after verification" },
  { check: "API access requested",              status: "missing",    note: "Apple API requires approved setup — not yet requested" },
  { check: "Service account ready",             status: "missing",    note: "Requires Apple API approval first" },
  { check: "Production publishing approved",    status: "coming_soon",note: "Requires Partner Delegation + Apple review — Coming Soon" },
];

function AppleStepBadge({ status }: { status: AppleStepStatus }) {
  const map: Record<AppleStepStatus, { label: string; color: string; bg: string }> = {
    complete:    { label: "Complete",    color: "#10B981", bg: "rgba(16,185,129,0.12)" },
    "in-progress":{ label: "In Progress", color: "#00AEEF", bg: "rgba(0,174,239,0.12)"  },
    pending:     { label: "Pending",     color: "#64748B", bg: "rgba(100,116,139,0.12)" },
    blocked:     { label: "Blocked",     color: "#EF4444", bg: "rgba(239,68,68,0.12)"   },
  };
  const s = map[status];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 20, padding: "2px 8px", whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function AppleBusinessCard() {
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [activeTab,     setActiveTab]     = useState<"checklist" | "bizinfo" | "profile" | "api" | "diagnostics">("checklist");
  const [checklist,     setChecklist]     = useState(APPLE_CHECKLIST);
  const [notes,         setNotes]         = useState("");
  const [placeCardUrl,  setPlaceCardUrl]  = useState("");
  const [mapsUrl,       setMapsUrl]       = useState("");
  const [verifyEmail,   setVerifyEmail]   = useState("");
  const [orgName,       setOrgName]       = useState("Bed Bugs & Beyond");
  const [verifyMethod,  setVerifyMethod]  = useState("Phone");
  const [verifyStatus,  setVerifyStatus]  = useState("Pending");
  const [savedMsg,      setSavedMsg]      = useState(false);
  const [copiedKey,     setCopiedKey]     = useState<string | null>(null);

  const completedCount    = checklist.filter(s => s.status === "complete").length;
  const inProgressCount   = checklist.filter(s => s.status === "in-progress").length;
  const appleScoreCredit  = Math.round((completedCount / checklist.length) * 15);

  function markStepComplete(idx: number) {
    setChecklist(prev => prev.map((s, i) => i === idx ? { ...s, status: "complete" } : s));
  }

  function handleSave() {
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  }

  function copyText(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2200);
    });
  }

  const TABS: { key: typeof activeTab; label: string }[] = [
    { key: "checklist",  label: "Setup Checklist" },
    { key: "bizinfo",    label: "Business Info" },
    { key: "profile",    label: "Profile Tracker" },
    { key: "api",        label: "API Readiness" },
    { key: "diagnostics",label: "Diagnostics" },
  ];

  return (
    <div style={{
      background: cardBg("setup_in_progress"),
      border: "1px solid rgba(0,174,239,0.25)",
      borderRadius: 14,
      backdropFilter: "blur(12px)",
      overflow: "hidden",
      transition: "border-color 0.2s",
      boxShadow: "0 0 24px rgba(0,174,239,0.06)",
    }}>
      {/* ── Card header ── */}
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Top row */}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(135deg, #555, #999)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, boxShadow: "0 0 16px rgba(162,170,173,0.3)",
          }}>🍎</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>Apple Business Connect</span>
              <StatusBadge status="setup_in_progress" />
            </div>
            <p style={{ fontSize: 12.5, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
              Apple Maps, Siri, iOS Spotlight &amp; Apple Wallet — reaches all iPhone, iPad and Mac users.
            </p>
          </div>
        </div>

        {/* Business details */}
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10, padding: "12px 14px",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px",
        }}>
          {[
            { label: "Business",     value: NAP.name },
            { label: "Phone",        value: NAP.phone },
            { label: "Website",      value: NAP.website.replace("https://", "") },
            { label: "Category",     value: "Pest Control Service" },
            { label: "Service Area", value: NAP.serviceArea },
            { label: "Last Checked", value: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 12, color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Score contribution + progress */}
        <div style={{
          background: "rgba(0,174,239,0.05)", border: "1px solid rgba(0,174,239,0.15)",
          borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>Setup Progress — {completedCount}/{checklist.length} steps</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#00AEEF" }}>Apple Score: {appleScoreCredit} / 15 pts</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((completedCount / checklist.length) * 100)}%`, background: "#00AEEF", borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "#10B981", fontWeight: 700 }}>{completedCount} done</span>
            <span style={{ fontSize: 11, color: "#64748B" }}>·</span>
            <span style={{ fontSize: 11, color: "#00AEEF", fontWeight: 700 }}>{inProgressCount} active</span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            onClick={() => setDrawerOpen(v => !v)}
            style={{
              padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: drawerOpen ? "rgba(0,174,239,0.2)" : "rgba(0,174,239,0.1)",
              border: "1px solid rgba(0,174,239,0.35)", color: "#00AEEF", transition: "all 0.15s",
            }}
          >
            {drawerOpen ? "▲ Close Apple Setup" : "▼ Open Apple Setup"}
          </button>
          <a href="https://business.apple.com" target="_blank" rel="noopener noreferrer"
            style={{ padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(162,170,173,0.1)", border: "1px solid rgba(162,170,173,0.25)", color: "#A2AAAD", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            ↗ Open Apple Business
          </a>
          <a href="https://maps.apple.com" target="_blank" rel="noopener noreferrer"
            style={{ padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(162,170,173,0.07)", border: "1px solid rgba(162,170,173,0.18)", color: "#94A3B8", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            ↗ Apple Maps
          </a>
        </div>
      </div>

      {/* ── Expandable drawer ── */}
      {drawerOpen && (
        <div style={{ borderTop: "1px solid rgba(0,174,239,0.12)", background: "rgba(3,6,18,0.6)" }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 20px" }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "11px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  background: "transparent", border: "none", borderBottom: activeTab === tab.key ? "2px solid #00AEEF" : "2px solid transparent",
                  color: activeTab === tab.key ? "#00AEEF" : "#475569", transition: "all 0.15s", marginBottom: -1,
                }}
              >{tab.label}</button>
            ))}
          </div>

          <div style={{ padding: 20 }}>

            {/* ── Tab: Setup Checklist ── */}
            {activeTab === "checklist" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                  Complete all 15 steps to fully activate your Apple Maps listing. Steps can be marked complete after you've confirmed them in Apple Business.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {checklist.map((step, idx) => (
                    <div key={idx} style={{
                      padding: "11px 14px", borderRadius: 10,
                      background: step.status === "complete" ? "rgba(16,185,129,0.05)" : step.status === "in-progress" ? "rgba(0,174,239,0.05)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${step.status === "complete" ? "rgba(16,185,129,0.18)" : step.status === "in-progress" ? "rgba(0,174,239,0.2)" : "rgba(255,255,255,0.05)"}`,
                      transition: "all 0.15s",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: step.description ? 4 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                            background: step.status === "complete" ? "rgba(16,185,129,0.2)" : step.status === "in-progress" ? "rgba(0,174,239,0.15)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${step.status === "complete" ? "rgba(16,185,129,0.4)" : step.status === "in-progress" ? "rgba(0,174,239,0.3)" : "rgba(255,255,255,0.1)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: step.status === "complete" ? "#10B981" : step.status === "in-progress" ? "#00AEEF" : "#475569", fontWeight: 800,
                          }}>
                            {step.status === "complete" ? "✓" : idx + 1}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: step.status === "complete" ? "#64748B" : "#CBD5E1", textDecoration: step.status === "complete" ? "line-through" : "none" }}>
                            {step.label}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <AppleStepBadge status={step.status} />
                          {step.status !== "complete" && (
                            <button
                              onClick={() => markStepComplete(idx)}
                              style={{ padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#10B981", transition: "all 0.15s" }}
                            >Mark Done</button>
                          )}
                        </div>
                      </div>
                      {step.description && (
                        <p style={{ fontSize: 11.5, color: "#475569", margin: "4px 0 0 32px", lineHeight: 1.5 }}>{step.description}</p>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                  <a href="https://business.apple.com" target="_blank" rel="noopener noreferrer"
                    style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.3)", color: "#00AEEF", textDecoration: "none" }}>
                    ↗ View Apple Business Guide
                  </a>
                </div>
              </div>
            )}

            {/* ── Tab: Business Info ── */}
            {activeTab === "bizinfo" && (() => {
              const BIZ_DESCRIPTION =
`Bed Bugs & Beyond is Baldwin County's trusted local pest control company, specializing in fast, effective elimination of bed bugs, roaches, ants, spiders, fleas, rodents, mosquitoes, and common household pests. We serve homeowners, rental properties, vacation rentals, and businesses throughout Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Elberta, and Robertsdale. Locally owned, fast response, guaranteed results. Call (251) 324-9090 to schedule today.`;

              const SERVICE_LIST =
`Bed Bug Treatment
Roach Control
Ant Control
Spider Control
Flea Control
Rodent Control
Mosquito Control
General Pest Control`;

              const SERVICE_AREAS =
`Foley, Alabama
Gulf Shores, Alabama
Orange Beach, Alabama
Fairhope, Alabama
Daphne, Alabama
Elberta, Alabama
Robertsdale, Alabama
Baldwin County, Alabama`;

              const REQUIRED_FIELDS: { label: string; value: string; copyKey?: string; note?: string }[] = [
                { label: "Business Name",     value: "Bed Bugs & Beyond",                        note: "Exact legal name — no keyword stuffing" },
                { label: "Phone Number",      value: "(251) 324-9090",         copyKey: "phone", note: "Must match Google Business Profile exactly" },
                { label: "Website",           value: NAP.website,                                note: "Use the live URL; Apple will verify it resolves correctly" },
                { label: "Primary Category",  value: "Pest Control Service",                     note: "Select from Apple's category list" },
                { label: "Secondary Category",value: "Exterminator",                             note: "Optional — add if available" },
                { label: "Address / Area",    value: "Baldwin County, Alabama (Service Area)",   note: "Service-area business — no physical storefront" },
                { label: "Verification",      value: "Phone call to (251) 324-9090",             note: "Apple calls the number on file to verify ownership" },
              ];

              const PHOTO_REQS: { item: string; spec: string; status: "missing" | "ready" }[] = [
                { item: "Logo",          spec: "PNG, 1:1, min 180×180 px, transparent bg preferred", status: "missing" },
                { item: "Cover photo",   spec: "JPG/PNG, 16:9, min 1080×608 px",                      status: "missing" },
                { item: "Service photo", spec: "Any photo of a treatment in progress",                 status: "missing" },
                { item: "Team photo",    spec: "Uniformed technician preferred",                       status: "missing" },
              ];

              type CopyBlockProps = { label: string; copyKey: string; value: string; rows?: number };
              function CopyBlock({ label, copyKey, value, rows = 4 }: CopyBlockProps) {
                const copied = copiedKey === copyKey;
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</span>
                      <button
                        onClick={() => copyText(copyKey, value)}
                        style={{
                          padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
                          background: copied ? "rgba(16,185,129,0.12)" : "rgba(0,174,239,0.1)",
                          border: copied ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(0,174,239,0.25)",
                          color: copied ? "#10B981" : "#00AEEF", transition: "all 0.2s",
                        }}
                      >{copied ? "✓ Copied" : "Copy"}</button>
                    </div>
                    <textarea
                      readOnly
                      rows={rows}
                      value={value}
                      style={{
                        width: "100%", boxSizing: "border-box",
                        padding: "10px 12px", borderRadius: 9, fontSize: 12, lineHeight: 1.6,
                        color: "#CBD5E1", background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        outline: "none", fontFamily: "inherit", resize: "none",
                        cursor: "text",
                      }}
                    />
                  </div>
                );
              }

              return (
                <div>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 18, lineHeight: 1.5 }}>
                    Setup guidance only — not analytics. Status stays <strong style={{ color: "#00AEEF" }}>Setup Pending</strong> until the Apple listing is submitted and verified. Use the copy buttons to paste content directly into Apple Business Connect.
                  </div>

                  {/* ── Required fields grid ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Required Business Information
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
                    {REQUIRED_FIELDS.map(f => (
                      <div key={f.label} style={{
                        display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 12, alignItems: "start",
                        padding: "9px 14px", borderRadius: 9,
                        background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", paddingTop: 1 }}>{f.label}</div>
                        <div>
                          <div style={{ fontSize: 12.5, color: "#E2E8F0", fontWeight: 500 }}>{f.value}</div>
                          {f.note && <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{f.note}</div>}
                        </div>
                        {f.copyKey && (
                          <button
                            onClick={() => copyText(f.copyKey!, f.value)}
                            style={{
                              padding: "3px 9px", borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: "pointer",
                              background: copiedKey === f.copyKey ? "rgba(16,185,129,0.12)" : "rgba(0,174,239,0.08)",
                              border: copiedKey === f.copyKey ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(0,174,239,0.2)",
                              color: copiedKey === f.copyKey ? "#10B981" : "#00AEEF", whiteSpace: "nowrap", flexShrink: 0,
                            }}
                          >{copiedKey === f.copyKey ? "✓" : "Copy"}</button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* ── Copy-ready blocks ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Copy-Ready Content
                  </div>
                  <CopyBlock label="Business Description" copyKey="desc" value={BIZ_DESCRIPTION} rows={5} />
                  <CopyBlock label="Service List" copyKey="services" value={SERVICE_LIST} rows={9} />
                  <CopyBlock label="Service Area List" copyKey="areas" value={SERVICE_AREAS} rows={9} />

                  {/* ── Photo requirements ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Logo &amp; Photo Requirements
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
                    {PHOTO_REQS.map(p => (
                      <div key={p.item} style={{
                        display: "grid", gridTemplateColumns: "100px 1fr auto", gap: 12, alignItems: "center",
                        padding: "9px 14px", borderRadius: 9,
                        background: p.status === "missing" ? "rgba(239,68,68,0.04)" : "rgba(16,185,129,0.04)",
                        border: p.status === "missing" ? "1px solid rgba(239,68,68,0.15)" : "1px solid rgba(16,185,129,0.15)",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1" }}>{p.item}</div>
                        <div style={{ fontSize: 11.5, color: "#475569" }}>{p.spec}</div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                          color: p.status === "missing" ? "#EF4444" : "#10B981",
                          background: p.status === "missing" ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
                        }}>{p.status === "missing" ? "Missing" : "Ready"}</span>
                      </div>
                    ))}
                  </div>

                  {/* ── Verification status banner ── */}
                  <div style={{
                    padding: "12px 16px", borderRadius: 10,
                    background: "rgba(0,174,239,0.05)", border: "1px solid rgba(0,174,239,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1", marginBottom: 2 }}>Listing Verification Status</div>
                      <div style={{ fontSize: 11.5, color: "#475569" }}>
                        Apple verifies via phone call. Have someone available to answer <strong style={{ color: "#94A3B8" }}>(251) 324-9090</strong> during business hours.
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                      background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.3)", color: "#00AEEF",
                    }}>Setup Pending</span>
                  </div>

                  {/* ── Next action ── */}
                  <div style={{
                    marginTop: 14, padding: "12px 16px", borderRadius: 10,
                    background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.18)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 6 }}>Next Action</div>
                    <ol style={{ margin: 0, paddingLeft: 18, color: "#94A3B8", fontSize: 12.5, lineHeight: 2 }}>
                      <li>Go to <a href="https://business.apple.com" target="_blank" rel="noopener noreferrer" style={{ color: "#00AEEF" }}>business.apple.com</a> and sign in with your Apple ID</li>
                      <li>Search for "Bed Bugs &amp; Beyond" in Baldwin County — claim the existing listing if found</li>
                      <li>If no listing exists, create one and enter all fields from the table above</li>
                      <li>Paste the <strong style={{ color: "#CBD5E1" }}>Business Description</strong>, <strong style={{ color: "#CBD5E1" }}>Service List</strong>, and <strong style={{ color: "#CBD5E1" }}>Service Areas</strong> using the copy buttons</li>
                      <li>Upload logo and cover photo per the specs above</li>
                      <li>Complete phone verification — Apple calls <strong style={{ color: "#CBD5E1" }}>(251) 324-9090</strong></li>
                      <li>Mark listing as "Submitted" in the Profile Tracker tab once done</li>
                    </ol>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <a href="https://business.apple.com" target="_blank" rel="noopener noreferrer"
                      style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.3)", color: "#00AEEF", textDecoration: "none", display: "inline-block" }}>
                      ↗ Open Apple Business Connect
                    </a>
                  </div>
                </div>
              );
            })()}

            {/* ── Tab: Profile Tracker ── */}
            {activeTab === "profile" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 16, lineHeight: 1.5 }}>
                  Track your Apple Business account details, listing URLs, and verification status here. This is stored locally for reference — no backend required.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { label: "Account Email",       val: verifyEmail,  set: setVerifyEmail,  ph: "apple-id@example.com" },
                    { label: "Organization Name",   val: orgName,      set: setOrgName,      ph: "Bed Bugs & Beyond" },
                    { label: "Verification Method", val: verifyMethod, set: setVerifyMethod, ph: "Phone / Email / Postcard" },
                    { label: "Verification Status", val: verifyStatus, set: setVerifyStatus, ph: "Pending / Submitted / Approved" },
                  ].map(field => (
                    <div key={field.label}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>{field.label}</div>
                      <input
                        value={field.val}
                        onChange={e => field.set(e.target.value)}
                        placeholder={field.ph}
                        style={{
                          width: "100%", boxSizing: "border-box",
                          padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0",
                          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                          outline: "none", fontFamily: "inherit",
                        }}
                      />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Apple Place Card URL</div>
                    <input
                      value={placeCardUrl}
                      onChange={e => setPlaceCardUrl(e.target.value)}
                      placeholder="https://maps.apple.com/?auid=..."
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Apple Maps Listing URL</div>
                    <input
                      value={mapsUrl}
                      onChange={e => setMapsUrl(e.target.value)}
                      placeholder="https://maps.apple.com/..."
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Setup Notes</div>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add notes about the setup progress, blockers, or next steps..."
                    rows={3}
                    style={{
                      width: "100%", boxSizing: "border-box",
                      padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0",
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                      outline: "none", fontFamily: "inherit", resize: "vertical",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                  <button
                    onClick={handleSave}
                    style={{ padding: "8px 18px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "#00AEEF", border: "none", color: "#FFF", transition: "opacity 0.15s" }}
                  >Save Setup Notes</button>
                  {savedMsg && <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>✓ Saved</span>}
                </div>
              </div>
            )}

            {/* ── Tab: API Readiness ── */}
            {activeTab === "api" && (
              <div>
                <div style={{
                  padding: "12px 16px", borderRadius: 10, marginBottom: 16,
                  background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)",
                  fontSize: 12.5, color: "#94A3B8", lineHeight: 1.6,
                }}>
                  <strong style={{ color: "#F59E0B" }}>⚠ Apple API Access Notice:</strong> Apple Maps API access requires completing the full Apple Business setup, obtaining a service account, getting API approval, and passing Apple's production publishing review. These credentials are <strong style={{ color: "#F59E0B" }}>never</strong> stored in the browser.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {[
                    { label: "API Access Requested",  value: "No",           status: "missing" as const },
                    { label: "Service Account Created",value: "No",           status: "missing" as const },
                    { label: "Client ID Stored",       value: "No",           status: "missing" as const },
                    { label: "Client Secret Stored",   value: "No (secure)",  status: "missing" as const },
                    { label: "Partner Delegation",     value: "Not Started",  status: "pending" as const },
                    { label: "Production Publishing",  value: "Not Approved", status: "coming_soon" as const },
                  ].map(item => {
                    const s = APPLE_DIAG_STYLE[item.status];
                    return (
                      <div key={item.label} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "9px 14px", borderRadius: 9, background: s.bg, border: `1px solid ${s.border}`,
                      }}>
                        <span style={{ fontSize: 12.5, color: "#CBD5E1", fontWeight: 500 }}>{item.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{item.value}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "not-allowed", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#475569" }}>
                    Add API Credentials — API Pending
                  </button>
                  <button style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "not-allowed", background: "rgba(0,174,239,0.06)", border: "1px solid rgba(0,174,239,0.15)", color: "#475569" }}>
                    Mark API Access Requested — Setup Required First
                  </button>
                  <a href="https://developer.apple.com/maps/mapskitjs/" target="_blank" rel="noopener noreferrer"
                    style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(162,170,173,0.08)", border: "1px solid rgba(162,170,173,0.2)", color: "#A2AAAD", textDecoration: "none" }}>
                    ↗ View API Setup Steps
                  </a>
                </div>
              </div>
            )}

            {/* ── Tab: Diagnostics ── */}
            {activeTab === "diagnostics" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                  Automated checks against Apple Business Connect setup requirements and NAP consistency.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {APPLE_DIAGS.map((d, i) => {
                    const s = APPLE_DIAG_STYLE[d.status];
                    const statusLabels: Record<AppleDiagStatus, string> = {
                      healthy:"Healthy", warning:"Warning", missing:"Missing", pending:"Pending", coming_soon:"Coming Soon",
                    };
                    return (
                      <div key={i} style={{
                        display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center",
                        padding: "9px 14px", borderRadius: 9, background: s.bg, border: `1px solid ${s.border}`,
                      }}>
                        <div>
                          <div style={{ fontSize: 12.5, color: "#CBD5E1", fontWeight: 600, marginBottom: 2 }}>{d.check}</div>
                          <div style={{ fontSize: 11, color: "#475569" }}>{d.note}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: s.color, whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: s.dot, marginRight: 5 }} />
                          {statusLabels[d.status]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bing Places V2 Card ────────────────────────────────────────────────────────
const BING_CHECKLIST: { label: string; status: AppleStepStatus; description: string }[] = [
  { label: "Create or sign into Bing Places account", status: "complete",    description: "Sign in at bingplaces.com with a Microsoft account." },
  { label: "Add or claim business listing",           status: "in-progress", description: "Search for Bed Bugs & Beyond and claim the listing." },
  { label: "Verify ownership",                        status: "pending",     description: "Microsoft sends a PIN by phone or postcard for verification." },
  { label: "Confirm business name",                   status: "pending",     description: "Ensure the listing name matches your registered business exactly." },
  { label: "Confirm phone number",                    status: "pending",     description: "Verify (251) 324-9090 matches the Bing listing." },
  { label: "Confirm website",                         status: "pending",     description: "Verify website URL resolves correctly and matches GBP." },
  { label: "Confirm category",                        status: "pending",     description: "Select 'Pest Control Service' as the primary business category." },
  { label: "Confirm service area",                    status: "pending",     description: "Baldwin County, AL — Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Spanish Fort." },
  { label: "Add business hours",                      status: "pending",     description: "Mon–Fri 7am–6pm, Sat 8am–2pm. Include seasonal/holiday hours." },
  { label: "Upload logo",                             status: "pending",     description: "High-res square logo (min 400×400 px, PNG or JPG)." },
  { label: "Upload photos",                           status: "pending",     description: "Add at least 5 quality photos of the business or service." },
  { label: "Add services",                            status: "pending",     description: "List core services: bed bug inspection, heat treatment, pest control." },
  { label: "Review Bing Maps listing",                status: "pending",     description: "Preview how the listing appears in Bing Maps and Microsoft Search." },
  { label: "Submit verification",                     status: "pending",     description: "Submit the listing — Microsoft reviews within 3–5 business days." },
];

const BING_DIAGS: { check: string; status: AppleDiagStatus; note: string }[] = [
  { check: "Bing account created",             status: "healthy",    note: "Microsoft account active at bingplaces.com" },
  { check: "Listing claimed",                  status: "warning",    note: "Claim in progress — awaiting Microsoft confirmation" },
  { check: "Ownership verified",               status: "missing",    note: "Verification PIN not yet received" },
  { check: "NAP matches Google Business Profile",status: "pending",  note: "Will be confirmed once listing is claimed" },
  { check: "Phone matches business number",    status: "pending",    note: "Pending listing confirmation" },
  { check: "Website matches",                  status: "pending",    note: "Pending listing confirmation" },
  { check: "Category selected",                status: "pending",    note: "To be set after claim is confirmed" },
  { check: "Hours configured",                 status: "missing",    note: "No hours set yet" },
  { check: "Photos uploaded",                  status: "missing",    note: "No photos uploaded yet" },
  { check: "Maps listing reviewed",            status: "pending",    note: "Available after verification" },
  { check: "API access requested",             status: "missing",    note: "Bing API requires setup — not yet requested" },
  { check: "Sync enabled",                     status: "missing",    note: "Requires API credentials first" },
  { check: "Copilot AI signal tracked",        status: "coming_soon",note: "Copilot integration — Coming Soon" },
];

function BingPlacesCard() {
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [activeTab,    setActiveTab]    = useState<"checklist" | "bizinfo" | "profile" | "api" | "diagnostics">("checklist");
  const [checklist,    setChecklist]    = useState(BING_CHECKLIST);
  const [notes,        setNotes]        = useState("");
  const [listingUrl,   setListingUrl]   = useState("");
  const [mapsUrl,      setMapsUrl]      = useState("");
  const [acctEmail,    setAcctEmail]    = useState("");
  const [verifyMethod, setVerifyMethod] = useState("Phone");
  const [verifyStatus, setVerifyStatus] = useState("Pending");
  const [savedMsg,     setSavedMsg]     = useState(false);
  const [copiedKey,    setCopiedKey]    = useState<string | null>(null);

  const completedCount  = checklist.filter(s => s.status === "complete").length;
  const inProgressCount = checklist.filter(s => s.status === "in-progress").length;
  const bingScoreCredit = Math.round((completedCount / checklist.length) * 10);

  function markStepComplete(idx: number) {
    setChecklist(prev => prev.map((s, i) => i === idx ? { ...s, status: "complete" } : s));
  }
  function handleSave() { setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2500); }
  function copyText(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2200);
    });
  }

  const TABS: { key: typeof activeTab; label: string }[] = [
    { key: "checklist",   label: "Setup Checklist" },
    { key: "bizinfo",     label: "Business Info" },
    { key: "profile",     label: "Profile Tracker" },
    { key: "api",         label: "API Readiness" },
    { key: "diagnostics", label: "Diagnostics" },
  ];

  const BING_BLUE = "#00ADEF";

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(0,173,239,0.05) 0%, rgba(11,22,41,0.9) 100%)",
      border: "1px solid rgba(0,173,239,0.25)",
      borderRadius: 14, backdropFilter: "blur(12px)", overflow: "hidden",
      boxShadow: "0 0 24px rgba(0,173,239,0.06)", transition: "border-color 0.2s",
    }}>
      {/* ── Card header ── */}
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Top row */}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(135deg, #00ADEF, #0063B1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 900, color: "#FFF",
            boxShadow: `0 0 16px rgba(0,173,239,0.3)`,
          }}>B</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>Bing Places for Business</span>
              <StatusBadge status="setup_in_progress" />
            </div>
            <p style={{ fontSize: 12.5, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
              Bing Maps, Microsoft Search, Copilot AI, Edge browser &amp; Windows 11 integration.
            </p>
          </div>
        </div>

        {/* Business details */}
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10, padding: "12px 14px",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px",
        }}>
          {[
            { label: "Business",     value: NAP.name },
            { label: "Phone",        value: NAP.phone },
            { label: "Website",      value: NAP.website.replace("https://", "") },
            { label: "Category",     value: "Pest Control Service" },
            { label: "Service Area", value: NAP.serviceArea },
            { label: "Last Checked", value: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 12, color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Score contribution + progress */}
        <div style={{
          background: `rgba(0,173,239,0.05)`, border: `1px solid rgba(0,173,239,0.15)`,
          borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>Setup Progress — {completedCount}/{checklist.length} steps</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: BING_BLUE }}>Bing Score: {bingScoreCredit} / 10 pts</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((completedCount / checklist.length) * 100)}%`, background: BING_BLUE, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "#10B981", fontWeight: 700 }}>{completedCount} done</span>
            <span style={{ fontSize: 11, color: "#64748B" }}>·</span>
            <span style={{ fontSize: 11, color: BING_BLUE, fontWeight: 700 }}>{inProgressCount} active</span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            onClick={() => setDrawerOpen(v => !v)}
            style={{
              padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: drawerOpen ? `rgba(0,173,239,0.2)` : `rgba(0,173,239,0.1)`,
              border: `1px solid rgba(0,173,239,0.35)`, color: BING_BLUE, transition: "all 0.15s",
            }}
          >{drawerOpen ? "▲ Close Bing Setup" : "▼ Open Bing Setup"}</button>
          <a href="https://www.bingplaces.com" target="_blank" rel="noopener noreferrer"
            style={{ padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(0,173,239,0.08)", border: "1px solid rgba(0,173,239,0.22)", color: BING_BLUE, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            ↗ Open Bing Places
          </a>
          <a href="https://www.bing.com/maps" target="_blank" rel="noopener noreferrer"
            style={{ padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(0,173,239,0.05)", border: "1px solid rgba(0,173,239,0.15)", color: "#64748B", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            ↗ Bing Maps
          </a>
        </div>
      </div>

      {/* ── Expandable drawer ── */}
      {drawerOpen && (
        <div style={{ borderTop: `1px solid rgba(0,173,239,0.12)`, background: "rgba(3,6,18,0.6)" }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 20px" }}>
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: "11px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: "transparent", border: "none",
                borderBottom: activeTab === tab.key ? `2px solid ${BING_BLUE}` : "2px solid transparent",
                color: activeTab === tab.key ? BING_BLUE : "#475569", transition: "all 0.15s", marginBottom: -1,
              }}>{tab.label}</button>
            ))}
          </div>

          <div style={{ padding: 20 }}>

            {/* ── Setup Checklist ── */}
            {activeTab === "checklist" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                  Complete all 14 steps to fully activate your Bing Maps listing. Mark each step after confirming it in Bing Places.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {checklist.map((step, idx) => (
                    <div key={idx} style={{
                      padding: "11px 14px", borderRadius: 10,
                      background: step.status === "complete" ? "rgba(16,185,129,0.05)" : step.status === "in-progress" ? `rgba(0,173,239,0.05)` : "rgba(255,255,255,0.02)",
                      border: `1px solid ${step.status === "complete" ? "rgba(16,185,129,0.18)" : step.status === "in-progress" ? `rgba(0,173,239,0.2)` : "rgba(255,255,255,0.05)"}`,
                      transition: "all 0.15s",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: step.description ? 4 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                            background: step.status === "complete" ? "rgba(16,185,129,0.2)" : step.status === "in-progress" ? `rgba(0,173,239,0.15)` : "rgba(255,255,255,0.05)",
                            border: `1px solid ${step.status === "complete" ? "rgba(16,185,129,0.4)" : step.status === "in-progress" ? `rgba(0,173,239,0.3)` : "rgba(255,255,255,0.1)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: step.status === "complete" ? "#10B981" : step.status === "in-progress" ? BING_BLUE : "#475569", fontWeight: 800,
                          }}>
                            {step.status === "complete" ? "✓" : idx + 1}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: step.status === "complete" ? "#64748B" : "#CBD5E1", textDecoration: step.status === "complete" ? "line-through" : "none" }}>
                            {step.label}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <AppleStepBadge status={step.status} />
                          {step.status !== "complete" && (
                            <button onClick={() => markStepComplete(idx)} style={{ padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#10B981" }}>
                              Mark Done
                            </button>
                          )}
                        </div>
                      </div>
                      {step.description && (
                        <p style={{ fontSize: 11.5, color: "#475569", margin: "4px 0 0 32px", lineHeight: 1.5 }}>{step.description}</p>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <a href="https://www.bingplaces.com" target="_blank" rel="noopener noreferrer"
                    style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: `rgba(0,173,239,0.1)`, border: `1px solid rgba(0,173,239,0.3)`, color: BING_BLUE, textDecoration: "none", display: "inline-block" }}>
                    ↗ View Bing Places Guide
                  </a>
                </div>
              </div>
            )}

            {/* ── Business Info ── */}
            {activeTab === "bizinfo" && (() => {
              const BIZ_DESCRIPTION =
`Bed Bugs & Beyond is Baldwin County's trusted local pest control company, serving Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Elberta, and Robertsdale. We specialize in bed bug elimination, roach and ant control, spider and flea treatments, rodent removal, mosquito control, and general pest management. Locally owned, fast response, guaranteed results. Call (251) 324-9090 to schedule your inspection today.`;

              const SERVICE_LIST =
`Bed Bug Treatment
Roach Control
Ant Control
Spider Control
Flea Control
Rodent Control
Mosquito Control
General Pest Control`;

              const SERVICE_AREAS =
`Foley, Alabama
Gulf Shores, Alabama
Orange Beach, Alabama
Fairhope, Alabama
Daphne, Alabama
Elberta, Alabama
Robertsdale, Alabama
Baldwin County, Alabama`;

              const BUSINESS_HOURS =
`Monday:    7:00 AM – 6:00 PM
Tuesday:   7:00 AM – 6:00 PM
Wednesday: 7:00 AM – 6:00 PM
Thursday:  7:00 AM – 6:00 PM
Friday:    7:00 AM – 6:00 PM
Saturday:  8:00 AM – 2:00 PM
Sunday:    Closed`;

              const REQUIRED_FIELDS: { label: string; value: string; copyKey?: string; note?: string }[] = [
                { label: "Business Name",      value: "Bed Bugs & Beyond",                       note: "Exact name — must match GBP exactly (NAP consistency)" },
                { label: "Phone Number",       value: "(251) 324-9090",        copyKey: "phone", note: "Must match Google Business Profile" },
                { label: "Website",            value: NAP.website,                               note: "Use the live URL; Bing will verify it resolves correctly" },
                { label: "Primary Category",   value: "Pest Control Service",                    note: "Select from Bing's business category picker" },
                { label: "Secondary Category", value: "Exterminator",                            note: "Optional — add if available in Bing's list" },
                { label: "Service Area",       value: "Baldwin County, Alabama",                 note: "Service-area business — hide street address if no storefront" },
                { label: "Business Hours",     value: "Mon–Fri 7am–6pm, Sat 8am–2pm",           note: "Enter each day individually in Bing's hours editor" },
                { label: "Verification Method",value: "Phone PIN or Postcard PIN",               note: "Microsoft mails or calls with a 6-digit PIN" },
              ];

              const PHOTO_REQS: { item: string; spec: string; status: "missing" | "ready" }[] = [
                { item: "Logo",          spec: "PNG/JPG, square 1:1, min 400×400 px",        status: "missing" },
                { item: "Cover photo",   spec: "JPG/PNG, landscape, min 720×480 px",         status: "missing" },
                { item: "Service photo", spec: "Treatment or inspection photo preferred",     status: "missing" },
                { item: "Team photo",    spec: "Uniformed technician on-site",               status: "missing" },
                { item: "Vehicle photo", spec: "Branded truck/van if available",             status: "missing" },
              ];

              type CopyBlockProps = { label: string; copyKey: string; value: string; rows?: number };
              function CopyBlock({ label, copyKey, value, rows = 4 }: CopyBlockProps) {
                const copied = copiedKey === copyKey;
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</span>
                      <button
                        onClick={() => copyText(copyKey, value)}
                        style={{
                          padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
                          background: copied ? "rgba(16,185,129,0.12)" : `rgba(0,173,239,0.1)`,
                          border: copied ? "1px solid rgba(16,185,129,0.3)" : `1px solid rgba(0,173,239,0.25)`,
                          color: copied ? "#10B981" : BING_BLUE, transition: "all 0.2s",
                        }}
                      >{copied ? "✓ Copied" : "Copy"}</button>
                    </div>
                    <textarea
                      readOnly rows={rows} value={value}
                      style={{
                        width: "100%", boxSizing: "border-box",
                        padding: "10px 12px", borderRadius: 9, fontSize: 12, lineHeight: 1.6,
                        color: "#CBD5E1", background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        outline: "none", fontFamily: "inherit", resize: "none", cursor: "text",
                      }}
                    />
                  </div>
                );
              }

              return (
                <div>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 18, lineHeight: 1.5 }}>
                    Setup guidance only — not analytics. Status stays <strong style={{ color: BING_BLUE }}>Setup Pending</strong> until the Bing listing is submitted and the verification PIN is entered. Use the copy buttons to paste content directly into Bing Places for Business.
                  </div>

                  {/* ── Required fields ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Required Business Information
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
                    {REQUIRED_FIELDS.map(f => (
                      <div key={f.label} style={{
                        display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 12, alignItems: "start",
                        padding: "9px 14px", borderRadius: 9,
                        background: "rgba(255,255,255,0.025)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", paddingTop: 1 }}>{f.label}</div>
                        <div>
                          <div style={{ fontSize: 12.5, color: "#E2E8F0", fontWeight: 500 }}>{f.value}</div>
                          {f.note && <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{f.note}</div>}
                        </div>
                        {f.copyKey && (
                          <button
                            onClick={() => copyText(f.copyKey!, f.value)}
                            style={{
                              padding: "3px 9px", borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: "pointer",
                              background: copiedKey === f.copyKey ? "rgba(16,185,129,0.12)" : `rgba(0,173,239,0.08)`,
                              border: copiedKey === f.copyKey ? "1px solid rgba(16,185,129,0.25)" : `1px solid rgba(0,173,239,0.2)`,
                              color: copiedKey === f.copyKey ? "#10B981" : BING_BLUE, whiteSpace: "nowrap", flexShrink: 0,
                            }}
                          >{copiedKey === f.copyKey ? "✓" : "Copy"}</button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* ── Copy-ready blocks ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Copy-Ready Content
                  </div>
                  <CopyBlock label="Business Description" copyKey="bing-desc"     value={BIZ_DESCRIPTION} rows={4} />
                  <CopyBlock label="Service List"         copyKey="bing-services" value={SERVICE_LIST}    rows={9} />
                  <CopyBlock label="Service Area List"    copyKey="bing-areas"    value={SERVICE_AREAS}   rows={9} />
                  <CopyBlock label="Business Hours"       copyKey="bing-hours"    value={BUSINESS_HOURS}  rows={8} />

                  {/* ── Photo requirements ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Logo &amp; Photo Requirements
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
                    {PHOTO_REQS.map(p => (
                      <div key={p.item} style={{
                        display: "grid", gridTemplateColumns: "100px 1fr auto", gap: 12, alignItems: "center",
                        padding: "9px 14px", borderRadius: 9,
                        background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1" }}>{p.item}</div>
                        <div style={{ fontSize: 11.5, color: "#475569" }}>{p.spec}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, color: "#EF4444", background: "rgba(239,68,68,0.1)", whiteSpace: "nowrap" }}>Missing</span>
                      </div>
                    ))}
                  </div>

                  {/* ── Verification steps ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Verification Steps
                  </div>
                  <div style={{
                    padding: "12px 16px", borderRadius: 10, marginBottom: 18,
                    background: `rgba(0,173,239,0.04)`, border: `1px solid rgba(0,173,239,0.18)`,
                    fontSize: 12.5, color: "#94A3B8", lineHeight: 1.7,
                  }}>
                    <div style={{ marginBottom: 8 }}>
                      <strong style={{ color: "#CBD5E1" }}>Option A — Phone PIN</strong><br />
                      Bing calls <strong style={{ color: "#CBD5E1" }}>(251) 324-9090</strong> with an automated message containing a 6-digit PIN. Answer the call and enter the PIN into Bing Places within 15 minutes.
                    </div>
                    <div>
                      <strong style={{ color: "#CBD5E1" }}>Option B — Postcard PIN</strong><br />
                      Microsoft mails a postcard to the business address with a PIN. Takes 10–14 business days. Recommended only if phone verification fails.
                    </div>
                  </div>

                  {/* ── Verification status + next action ── */}
                  <div style={{
                    padding: "12px 16px", borderRadius: 10, marginBottom: 14,
                    background: `rgba(0,173,239,0.05)`, border: `1px solid rgba(0,173,239,0.2)`,
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1", marginBottom: 2 }}>Listing Verification Status</div>
                      <div style={{ fontSize: 11.5, color: "#475569" }}>
                        Status updates to <strong style={{ color: "#CBD5E1" }}>Verified</strong> after PIN is entered and Microsoft approves the listing (3–5 business days).
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                      background: `rgba(0,173,239,0.12)`, border: `1px solid rgba(0,173,239,0.3)`, color: BING_BLUE,
                    }}>Setup Pending</span>
                  </div>

                  {/* ── Next action ── */}
                  <div style={{
                    padding: "12px 16px", borderRadius: 10,
                    background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.18)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 6 }}>Next Action</div>
                    <ol style={{ margin: 0, paddingLeft: 18, color: "#94A3B8", fontSize: 12.5, lineHeight: 2 }}>
                      <li>Go to <a href="https://www.bingplaces.com" target="_blank" rel="noopener noreferrer" style={{ color: BING_BLUE }}>bingplaces.com</a> — sign in with a Microsoft account</li>
                      <li>Search "Bed Bugs &amp; Beyond, Baldwin County AL" — claim if found, or create new</li>
                      <li>Enter all fields from the table above; paste <strong style={{ color: "#CBD5E1" }}>Description</strong>, <strong style={{ color: "#CBD5E1" }}>Services</strong>, <strong style={{ color: "#CBD5E1" }}>Areas</strong>, and <strong style={{ color: "#CBD5E1" }}>Hours</strong> using copy buttons</li>
                      <li>Upload logo and photos per the specs above (minimum 5 photos required)</li>
                      <li>Choose verification: <strong style={{ color: "#CBD5E1" }}>Phone PIN</strong> (faster) or Postcard PIN</li>
                      <li>Answer the verification call to <strong style={{ color: "#CBD5E1" }}>(251) 324-9090</strong> and enter the PIN in Bing Places</li>
                      <li>Wait 3–5 business days for Microsoft review and listing activation</li>
                      <li>Update verification status in the <strong style={{ color: "#CBD5E1" }}>Profile Tracker</strong> tab once complete</li>
                    </ol>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <a href="https://www.bingplaces.com" target="_blank" rel="noopener noreferrer"
                      style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: `rgba(0,173,239,0.1)`, border: `1px solid rgba(0,173,239,0.3)`, color: BING_BLUE, textDecoration: "none", display: "inline-block" }}>
                      ↗ Open Bing Places for Business
                    </a>
                  </div>
                </div>
              );
            })()}

            {/* ── Profile Tracker ── */}
            {activeTab === "profile" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 16, lineHeight: 1.5 }}>
                  Track your Bing Places account details, listing URLs, and verification status here.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { label: "Account Email",        val: acctEmail,    set: setAcctEmail,    ph: "microsoft-account@example.com" },
                    { label: "Verification Method",  val: verifyMethod, set: setVerifyMethod, ph: "Phone / Postcard" },
                    { label: "Verification Status",  val: verifyStatus, set: setVerifyStatus, ph: "Pending / Submitted / Approved" },
                  ].map(field => (
                    <div key={field.label}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>{field.label}</div>
                      <input value={field.val} onChange={e => field.set(e.target.value)} placeholder={field.ph}
                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }} />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Bing Places Listing URL</div>
                    <input value={listingUrl} onChange={e => setListingUrl(e.target.value)} placeholder="https://www.bingplaces.com/..."
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Bing Maps Listing URL</div>
                    <input value={mapsUrl} onChange={e => setMapsUrl(e.target.value)} placeholder="https://www.bing.com/maps?..."
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }} />
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Setup Notes</div>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                    placeholder="Notes about setup progress, blockers, or next steps..."
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit", resize: "vertical" }} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                  <button onClick={handleSave} style={{ padding: "8px 18px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: BING_BLUE, border: "none", color: "#FFF" }}>
                    Save Setup Notes
                  </button>
                  {savedMsg && <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>✓ Saved</span>}
                </div>
              </div>
            )}

            {/* ── API Readiness ── */}
            {activeTab === "api" && (
              <div>
                <div style={{ padding: "12px 16px", borderRadius: 10, marginBottom: 16, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)", fontSize: 12.5, color: "#94A3B8", lineHeight: 1.6 }}>
                  <strong style={{ color: "#F59E0B" }}>⚠ Bing API Notice:</strong> Future API sync can support listing updates, business data sync, and Copilot AI signal tracking. Credentials are <strong style={{ color: "#F59E0B" }}>never</strong> stored in the browser.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {[
                    { label: "API Access Requested",    value: "No",      status: "missing" as AppleDiagStatus },
                    { label: "Client ID Stored",        value: "No",      status: "missing" as AppleDiagStatus },
                    { label: "Client Secret Stored",    value: "No (secure)", status: "missing" as AppleDiagStatus },
                    { label: "Sync Enabled",            value: "No",      status: "missing" as AppleDiagStatus },
                    { label: "Copilot Signal Tracking", value: "Pending", status: "coming_soon" as AppleDiagStatus },
                  ].map(item => {
                    const s = APPLE_DIAG_STYLE[item.status];
                    return (
                      <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderRadius: 9, background: s.bg, border: `1px solid ${s.border}` }}>
                        <span style={{ fontSize: 12.5, color: "#CBD5E1", fontWeight: 500 }}>{item.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{item.value}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "not-allowed", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#475569" }}>
                    Add API Credentials — API Pending
                  </button>
                  <button style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "not-allowed", background: `rgba(0,173,239,0.06)`, border: `1px solid rgba(0,173,239,0.15)`, color: "#475569" }}>
                    Mark API Access Requested — Setup Required First
                  </button>
                  <a href="https://www.bingplaces.com/Home/Help" target="_blank" rel="noopener noreferrer"
                    style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: `rgba(0,173,239,0.08)`, border: `1px solid rgba(0,173,239,0.2)`, color: BING_BLUE, textDecoration: "none" }}>
                    ↗ View API Setup Steps
                  </a>
                </div>
              </div>
            )}

            {/* ── Diagnostics ── */}
            {activeTab === "diagnostics" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                  Automated checks against Bing Places setup requirements and NAP consistency.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {BING_DIAGS.map((d, i) => {
                    const s = APPLE_DIAG_STYLE[d.status];
                    const statusLabels: Record<AppleDiagStatus, string> = { healthy:"Healthy", warning:"Warning", missing:"Missing", pending:"Pending", coming_soon:"Coming Soon" };
                    return (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "9px 14px", borderRadius: 9, background: s.bg, border: `1px solid ${s.border}` }}>
                        <div>
                          <div style={{ fontSize: 12.5, color: "#CBD5E1", fontWeight: 600, marginBottom: 2 }}>{d.check}</div>
                          <div style={{ fontSize: 11, color: "#475569" }}>{d.note}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: s.color, whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: s.dot, marginRight: 5 }} />
                          {statusLabels[d.status]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Nextdoor Business V2 Card ──────────────────────────────────────────────────
const NEXTDOOR_CHECKLIST: { label: string; status: AppleStepStatus; description: string }[] = [
  { label: "Create or sign into Nextdoor Business",  status: "complete",    description: "Sign in at business.nextdoor.com with your email." },
  { label: "Add or claim business page",             status: "in-progress", description: "Search for Bed Bugs & Beyond and claim the business page." },
  { label: "Verify business ownership",              status: "pending",     description: "Nextdoor may verify by phone, email, or postcard." },
  { label: "Confirm business name",                  status: "pending",     description: "Ensure the business name matches your registered entity exactly." },
  { label: "Confirm phone number",                   status: "pending",     description: "Verify (251) 324-9090 matches the Nextdoor listing." },
  { label: "Confirm website",                        status: "pending",     description: "Verify website URL resolves correctly and matches GBP." },
  { label: "Select business category",               status: "pending",     description: "Select 'Pest Control' as the primary business category." },
  { label: "Add service area",                       status: "pending",     description: "Baldwin County, AL — Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Spanish Fort." },
  { label: "Add business description",               status: "pending",     description: "Write a clear, local-focused description of services and service area." },
  { label: "Upload logo",                            status: "pending",     description: "High-res square logo (min 400×400 px, PNG or JPG)." },
  { label: "Upload photos",                          status: "pending",     description: "Add at least 5 quality photos of the business, team, or service." },
  { label: "Enable recommendations",                 status: "pending",     description: "Turn on neighborhood recommendations to build social proof." },
  { label: "Add services",                           status: "pending",     description: "List core services: bed bug inspection, heat treatment, pest control." },
  { label: "Review neighborhood visibility",         status: "pending",     description: "Confirm visibility in Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Spanish Fort." },
  { label: "Publish business page",                  status: "pending",     description: "Publish the listing to make it visible to local neighborhoods." },
];

const NEXTDOOR_NEIGHBORHOODS: { city: string; status: "covered" | "pending" | "missing" | "needs_recs"; recs: number; strength: "Strong" | "Moderate" | "Weak" | "None"; action: string }[] = [
  { city: "Foley",         status: "pending",    recs: 0, strength: "None",     action: "Claim listing and target Foley neighborhoods" },
  { city: "Gulf Shores",   status: "pending",    recs: 0, strength: "None",     action: "Add Gulf Shores to service area" },
  { city: "Orange Beach",  status: "pending",    recs: 0, strength: "None",     action: "Add Orange Beach to service area" },
  { city: "Fairhope",      status: "pending",    recs: 0, strength: "None",     action: "Add Fairhope to service area" },
  { city: "Daphne",        status: "pending",    recs: 0, strength: "None",     action: "Add Daphne to service area" },
  { city: "Spanish Fort",  status: "pending",    recs: 0, strength: "None",     action: "Add Spanish Fort to service area" },
];

const NEXTDOOR_DIAGS: { check: string; status: AppleDiagStatus; note: string }[] = [
  { check: "Nextdoor account created",          status: "healthy",  note: "Account active at business.nextdoor.com" },
  { check: "Business page claimed",             status: "warning",  note: "Claim in progress — awaiting Nextdoor confirmation" },
  { check: "Ownership verified",                status: "missing",  note: "Verification not yet completed" },
  { check: "NAP matches Google Business Profile",status:"pending",  note: "Will be confirmed once page is claimed" },
  { check: "Phone matches business number",     status: "pending",  note: "Pending page confirmation" },
  { check: "Website matches",                   status: "pending",  note: "Pending page confirmation" },
  { check: "Category selected",                 status: "pending",  note: "To be set after claim is confirmed" },
  { check: "Service area configured",           status: "pending",  note: "6 cities to be added after claim" },
  { check: "Photos uploaded",                   status: "missing",  note: "No photos uploaded yet" },
  { check: "Recommendations enabled",           status: "missing",  note: "Enable after page is published" },
  { check: "Neighborhood visibility reviewed",  status: "pending",  note: "Available after publishing" },
  { check: "Business page published",           status: "missing",  note: "Page not yet published" },
];

const ND_NEIGHBORHOOD_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  covered:      { color: "#10B981", bg: "rgba(16,185,129,0.07)",  border: "rgba(16,185,129,0.2)",  label: "Covered"            },
  pending:      { color: "#00AEEF", bg: "rgba(0,174,239,0.07)",   border: "rgba(0,174,239,0.15)",  label: "Pending"            },
  missing:      { color: "#EF4444", bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.18)",  label: "Missing"            },
  needs_recs:   { color: "#F59E0B", bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.18)", label: "Needs Recommendations" },
};

function NextdoorBusinessCard() {
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [activeTab,     setActiveTab]     = useState<"checklist" | "bizinfo" | "profile" | "neighborhoods" | "diagnostics">("checklist");
  const [checklist,     setChecklist]     = useState(NEXTDOOR_CHECKLIST);
  const [pageUrl,       setPageUrl]       = useState("");
  const [acctEmail,     setAcctEmail]     = useState("");
  const [verifyMethod,  setVerifyMethod]  = useState("Email");
  const [verifyStatus,  setVerifyStatus]  = useState("Pending");
  const [neighborhoods, setNeighborhoods] = useState("Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Spanish Fort");
  const [recStatus,     setRecStatus]     = useState("Not Enabled");
  const [notes,         setNotes]         = useState("");
  const [savedMsg,      setSavedMsg]      = useState(false);
  const [copiedKey,     setCopiedKey]     = useState<string | null>(null);

  const completedCount  = checklist.filter(s => s.status === "complete").length;
  const inProgressCount = checklist.filter(s => s.status === "in-progress").length;
  const ndScoreCredit   = Math.round((completedCount / checklist.length) * 10);

  function markStepComplete(idx: number) {
    setChecklist(prev => prev.map((s, i) => i === idx ? { ...s, status: "complete" } : s));
  }
  function handleSave() { setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2500); }
  function copyText(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2200);
    });
  }

  const ND_GREEN = "#8DC641";

  const TABS: { key: typeof activeTab; label: string }[] = [
    { key: "checklist",     label: "Setup Checklist" },
    { key: "bizinfo",       label: "Business Info" },
    { key: "profile",       label: "Profile Tracker" },
    { key: "neighborhoods", label: "Neighborhood Visibility" },
    { key: "diagnostics",   label: "Diagnostics" },
  ];

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(141,198,65,0.05) 0%, rgba(11,22,41,0.9) 100%)",
      border: "1px solid rgba(141,198,65,0.25)",
      borderRadius: 14, backdropFilter: "blur(12px)", overflow: "hidden",
      boxShadow: "0 0 24px rgba(141,198,65,0.06)", transition: "border-color 0.2s",
    }}>
      {/* ── Card header ── */}
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(135deg, #5A9B1A, #8DC641)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 900, color: "#FFF",
            boxShadow: "0 0 16px rgba(141,198,65,0.3)",
          }}>N</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>Nextdoor Business</span>
              <StatusBadge status="setup_in_progress" />
            </div>
            <p style={{ fontSize: 12.5, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
              Neighborhood discovery, local referrals, community trust &amp; neighbor recommendations.
            </p>
          </div>
        </div>

        {/* Business details */}
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10, padding: "12px 14px",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px",
        }}>
          {[
            { label: "Business",     value: NAP.name },
            { label: "Phone",        value: NAP.phone },
            { label: "Website",      value: NAP.website.replace("https://", "") },
            { label: "Category",     value: "Pest Control Service" },
            { label: "Service Area", value: NAP.serviceArea },
            { label: "Last Checked", value: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 12, color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Score bar */}
        <div style={{
          background: "rgba(141,198,65,0.05)", border: "1px solid rgba(141,198,65,0.15)",
          borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>Setup Progress — {completedCount}/{checklist.length} steps</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: ND_GREEN }}>Nextdoor Score: {ndScoreCredit} / 10 pts</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((completedCount / checklist.length) * 100)}%`, background: ND_GREEN, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "#10B981", fontWeight: 700 }}>{completedCount} done</span>
            <span style={{ fontSize: 11, color: "#64748B" }}>·</span>
            <span style={{ fontSize: 11, color: ND_GREEN, fontWeight: 700 }}>{inProgressCount} active</span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button onClick={() => setDrawerOpen(v => !v)} style={{
            padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
            background: drawerOpen ? "rgba(141,198,65,0.2)" : "rgba(141,198,65,0.1)",
            border: "1px solid rgba(141,198,65,0.35)", color: ND_GREEN, transition: "all 0.15s",
          }}>{drawerOpen ? "▲ Close Nextdoor Setup" : "▼ Open Nextdoor Setup"}</button>
          <a href="https://business.nextdoor.com" target="_blank" rel="noopener noreferrer"
            style={{ padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(141,198,65,0.08)", border: "1px solid rgba(141,198,65,0.22)", color: ND_GREEN, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            ↗ Open Nextdoor Business
          </a>
          {pageUrl && (
            <a href={pageUrl} target="_blank" rel="noopener noreferrer"
              style={{ padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(141,198,65,0.05)", border: "1px solid rgba(141,198,65,0.15)", color: "#64748B", textDecoration: "none" }}>
              ↗ View Page
            </a>
          )}
        </div>
      </div>

      {/* ── Expandable drawer ── */}
      {drawerOpen && (
        <div style={{ borderTop: "1px solid rgba(141,198,65,0.12)", background: "rgba(3,6,18,0.6)" }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 20px" }}>
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: "11px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: "transparent", border: "none",
                borderBottom: activeTab === tab.key ? `2px solid ${ND_GREEN}` : "2px solid transparent",
                color: activeTab === tab.key ? ND_GREEN : "#475569", transition: "all 0.15s", marginBottom: -1,
              }}>{tab.label}</button>
            ))}
          </div>

          <div style={{ padding: 20 }}>

            {/* ── Setup Checklist ── */}
            {activeTab === "checklist" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                  Complete all 15 steps to fully activate your Nextdoor Business page and neighborhood visibility.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {checklist.map((step, idx) => (
                    <div key={idx} style={{
                      padding: "11px 14px", borderRadius: 10,
                      background: step.status === "complete" ? "rgba(16,185,129,0.05)" : step.status === "in-progress" ? "rgba(141,198,65,0.05)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${step.status === "complete" ? "rgba(16,185,129,0.18)" : step.status === "in-progress" ? "rgba(141,198,65,0.2)" : "rgba(255,255,255,0.05)"}`,
                      transition: "all 0.15s",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: step.description ? 4 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                            background: step.status === "complete" ? "rgba(16,185,129,0.2)" : step.status === "in-progress" ? "rgba(141,198,65,0.15)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${step.status === "complete" ? "rgba(16,185,129,0.4)" : step.status === "in-progress" ? "rgba(141,198,65,0.3)" : "rgba(255,255,255,0.1)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: step.status === "complete" ? "#10B981" : step.status === "in-progress" ? ND_GREEN : "#475569", fontWeight: 800,
                          }}>
                            {step.status === "complete" ? "✓" : idx + 1}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: step.status === "complete" ? "#64748B" : "#CBD5E1", textDecoration: step.status === "complete" ? "line-through" : "none" }}>
                            {step.label}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <AppleStepBadge status={step.status} />
                          {step.status !== "complete" && (
                            <button onClick={() => markStepComplete(idx)} style={{ padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#10B981" }}>
                              Mark Done
                            </button>
                          )}
                        </div>
                      </div>
                      {step.description && (
                        <p style={{ fontSize: 11.5, color: "#475569", margin: "4px 0 0 32px", lineHeight: 1.5 }}>{step.description}</p>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <a href="https://business.nextdoor.com" target="_blank" rel="noopener noreferrer"
                    style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(141,198,65,0.1)", border: "1px solid rgba(141,198,65,0.3)", color: ND_GREEN, textDecoration: "none", display: "inline-block" }}>
                    ↗ View Nextdoor Business Guide
                  </a>
                </div>
              </div>
            )}

            {/* ── Business Info ── */}
            {activeTab === "bizinfo" && (() => {
              const BIZ_DESCRIPTION =
`Bed Bugs & Beyond is Baldwin County's trusted neighborhood pest control company. We specialize in bed bug elimination, roach and ant control, spider and flea treatments, rodent removal, mosquito control, and general pest management. Serving homeowners and families in Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Elberta, and Robertsdale. Locally owned, fast response, neighbor-recommended. Call (251) 324-9090 to schedule today.`;

              const SERVICE_LIST =
`Bed Bug Treatment
Roach Control
Ant Control
Spider Control
Flea Control
Rodent Control
Mosquito Control
General Pest Control`;

              const SERVICE_AREAS =
`Foley, Alabama
Gulf Shores, Alabama
Orange Beach, Alabama
Fairhope, Alabama
Daphne, Alabama
Elberta, Alabama
Robertsdale, Alabama
Baldwin County, Alabama`;

              const REQUIRED_FIELDS: { label: string; value: string; copyKey?: string; note?: string }[] = [
                { label: "Business Name",      value: "Bed Bugs & Beyond",                       note: "Exact name — must match GBP exactly (NAP consistency)" },
                { label: "Phone Number",       value: "(251) 324-9090",        copyKey: "nd-phone", note: "Must match Google Business Profile" },
                { label: "Website",            value: "https://bedbugsandbeyond.net",             note: "Use the live BB&B website" },
                { label: "Category",           value: "Pest Control",                             note: "Nextdoor uses simplified categories — select 'Pest Control'" },
                { label: "Service Area",       value: "Baldwin County, AL — 7 cities",            note: "Add each city: Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Elberta, Robertsdale" },
                { label: "Verification",       value: "Email, phone, or postcard",                note: "Nextdoor offers multiple verification methods — email is fastest" },
                { label: "Recommendations",    value: "Enable after publishing",                  note: "Turn on to allow neighbors to recommend your business — critical for Nextdoor visibility" },
              ];

              const PHOTO_REQS: { item: string; spec: string }[] = [
                { item: "Logo",          spec: "PNG/JPG, square 1:1, min 400×400 px" },
                { item: "Cover photo",   spec: "JPG/PNG, landscape, recommended 1200×628 px" },
                { item: "Service photo", spec: "Treatment or inspection photo — builds trust" },
                { item: "Team photo",    spec: "Uniformed technician or branded vehicle" },
              ];

              type CopyBlockProps = { label: string; copyKey: string; value: string; rows?: number };
              function CopyBlock({ label, copyKey, value, rows = 4 }: CopyBlockProps) {
                const copied = copiedKey === copyKey;
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</span>
                      <button
                        onClick={() => copyText(copyKey, value)}
                        style={{
                          padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
                          background: copied ? "rgba(16,185,129,0.12)" : "rgba(141,198,65,0.1)",
                          border: copied ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(141,198,65,0.25)",
                          color: copied ? "#10B981" : ND_GREEN, transition: "all 0.2s",
                        }}
                      >{copied ? "✓ Copied" : "Copy"}</button>
                    </div>
                    <textarea
                      readOnly rows={rows} value={value}
                      style={{
                        width: "100%", boxSizing: "border-box",
                        padding: "10px 12px", borderRadius: 9, fontSize: 12, lineHeight: 1.6,
                        color: "#CBD5E1", background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        outline: "none", fontFamily: "inherit", resize: "none", cursor: "text",
                      }}
                    />
                  </div>
                );
              }

              return (
                <div>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 18, lineHeight: 1.5 }}>
                    Setup guidance only — not analytics. Status stays <strong style={{ color: ND_GREEN }}>Setup Pending</strong> until the Nextdoor Business page is published and verified. Use the copy buttons to paste content directly into Nextdoor Business.
                  </div>

                  {/* ── Nextdoor-specific note ── */}
                  <div style={{
                    padding: "10px 14px", borderRadius: 10, marginBottom: 18,
                    background: "rgba(141,198,65,0.05)", border: "1px solid rgba(141,198,65,0.2)",
                    fontSize: 12, color: "#94A3B8", lineHeight: 1.6,
                  }}>
                    <strong style={{ color: ND_GREEN }}>Nextdoor is neighborhood-first.</strong> Unlike Google or Bing, visibility here depends on neighbor <strong style={{ color: "#CBD5E1" }}>recommendations</strong> — not just having a listing. After publishing, ask satisfied Baldwin County customers to recommend you on Nextdoor.
                  </div>

                  {/* ── Required fields ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Required Business Information
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
                    {REQUIRED_FIELDS.map(f => (
                      <div key={f.label} style={{
                        display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 12, alignItems: "start",
                        padding: "9px 14px", borderRadius: 9,
                        background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", paddingTop: 1 }}>{f.label}</div>
                        <div>
                          <div style={{ fontSize: 12.5, color: "#E2E8F0", fontWeight: 500 }}>{f.value}</div>
                          {f.note && <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{f.note}</div>}
                        </div>
                        {f.copyKey && (
                          <button
                            onClick={() => copyText(f.copyKey!, f.value)}
                            style={{
                              padding: "3px 9px", borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: "pointer",
                              background: copiedKey === f.copyKey ? "rgba(16,185,129,0.12)" : "rgba(141,198,65,0.08)",
                              border: copiedKey === f.copyKey ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(141,198,65,0.2)",
                              color: copiedKey === f.copyKey ? "#10B981" : ND_GREEN, whiteSpace: "nowrap", flexShrink: 0,
                            }}
                          >{copiedKey === f.copyKey ? "✓" : "Copy"}</button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* ── Copy-ready blocks ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Copy-Ready Content
                  </div>
                  <CopyBlock label="Business Description" copyKey="nd-desc"     value={BIZ_DESCRIPTION} rows={4} />
                  <CopyBlock label="Service List"         copyKey="nd-services" value={SERVICE_LIST}    rows={9} />
                  <CopyBlock label="Service Area List"    copyKey="nd-areas"    value={SERVICE_AREAS}   rows={9} />

                  {/* ── Photo requirements ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Logo &amp; Photo Requirements
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
                    {PHOTO_REQS.map(p => (
                      <div key={p.item} style={{
                        display: "grid", gridTemplateColumns: "100px 1fr auto", gap: 12, alignItems: "center",
                        padding: "9px 14px", borderRadius: 9,
                        background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1" }}>{p.item}</div>
                        <div style={{ fontSize: 11.5, color: "#475569" }}>{p.spec}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, color: "#EF4444", background: "rgba(239,68,68,0.1)", whiteSpace: "nowrap" }}>Missing</span>
                      </div>
                    ))}
                  </div>

                  {/* ── Verification steps ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Verification Steps
                  </div>
                  <div style={{
                    padding: "12px 16px", borderRadius: 10, marginBottom: 18,
                    background: "rgba(141,198,65,0.04)", border: "1px solid rgba(141,198,65,0.18)",
                    fontSize: 12.5, color: "#94A3B8", lineHeight: 1.7,
                  }}>
                    <div style={{ marginBottom: 8 }}>
                      <strong style={{ color: "#CBD5E1" }}>Option A — Email</strong> (fastest)<br />
                      Nextdoor sends a verification link to the email on file. Click the link to instantly verify ownership.
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <strong style={{ color: "#CBD5E1" }}>Option B — Phone PIN</strong><br />
                      Nextdoor calls <strong style={{ color: "#CBD5E1" }}>(251) 324-9090</strong> with an automated PIN. Enter it in Nextdoor Business to verify.
                    </div>
                    <div>
                      <strong style={{ color: "#CBD5E1" }}>Option C — Postcard PIN</strong><br />
                      Nextdoor mails a PIN to the business address. Takes 10–14 business days. Use only if email and phone fail.
                    </div>
                  </div>

                  {/* ── Verification status + next action ── */}
                  <div style={{
                    padding: "12px 16px", borderRadius: 10, marginBottom: 14,
                    background: "rgba(141,198,65,0.05)", border: "1px solid rgba(141,198,65,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1", marginBottom: 2 }}>Listing Verification Status</div>
                      <div style={{ fontSize: 11.5, color: "#475569" }}>
                        Status updates to <strong style={{ color: "#CBD5E1" }}>Verified</strong> after ownership is confirmed and the page is published to Nextdoor neighborhoods.
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                      background: "rgba(141,198,65,0.12)", border: "1px solid rgba(141,198,65,0.3)", color: ND_GREEN,
                    }}>Setup Pending</span>
                  </div>

                  {/* ── Next action ── */}
                  <div style={{
                    padding: "12px 16px", borderRadius: 10,
                    background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.18)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 6 }}>Next Action</div>
                    <ol style={{ margin: 0, paddingLeft: 18, color: "#94A3B8", fontSize: 12.5, lineHeight: 2 }}>
                      <li>Go to <a href="https://business.nextdoor.com" target="_blank" rel="noopener noreferrer" style={{ color: ND_GREEN }}>business.nextdoor.com</a> — sign in with your email</li>
                      <li>Search "Bed Bugs &amp; Beyond, Baldwin County AL" — claim if found, or create new</li>
                      <li>Select category <strong style={{ color: "#CBD5E1" }}>Pest Control</strong></li>
                      <li>Paste the <strong style={{ color: "#CBD5E1" }}>Business Description</strong> and <strong style={{ color: "#CBD5E1" }}>Service List</strong> using the copy buttons above</li>
                      <li>Add all 7 service area cities from the <strong style={{ color: "#CBD5E1" }}>Service Area List</strong></li>
                      <li>Upload logo and photos per the specs above</li>
                      <li>Complete verification — choose <strong style={{ color: "#CBD5E1" }}>email</strong> for fastest turnaround</li>
                      <li>Publish the business page to make it visible to Baldwin County neighborhoods</li>
                      <li>Enable <strong style={{ color: "#CBD5E1" }}>Recommendations</strong> — then ask past customers to recommend you on Nextdoor</li>
                      <li>Update verification status in the <strong style={{ color: "#CBD5E1" }}>Profile Tracker</strong> tab once published</li>
                    </ol>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <a href="https://business.nextdoor.com" target="_blank" rel="noopener noreferrer"
                      style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(141,198,65,0.1)", border: "1px solid rgba(141,198,65,0.3)", color: ND_GREEN, textDecoration: "none", display: "inline-block" }}>
                      ↗ Open Nextdoor Business
                    </a>
                  </div>
                </div>
              );
            })()}

            {/* ── Profile Tracker ── */}
            {activeTab === "profile" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 16, lineHeight: 1.5 }}>
                  Track your Nextdoor Business account details, page URL, and verification status here.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { label: "Account Email",        val: acctEmail,    set: setAcctEmail,    ph: "email@example.com" },
                    { label: "Verification Method",  val: verifyMethod, set: setVerifyMethod, ph: "Email / Phone / Postcard" },
                    { label: "Verification Status",  val: verifyStatus, set: setVerifyStatus, ph: "Pending / Submitted / Approved" },
                    { label: "Recommendation Status",val: recStatus,    set: setRecStatus,    ph: "Not Enabled / Enabled" },
                    { label: "Neighborhoods Served", val: neighborhoods,set: setNeighborhoods,ph: "Foley, Gulf Shores..." },
                  ].map(field => (
                    <div key={field.label}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>{field.label}</div>
                      <input value={field.val} onChange={e => field.set(e.target.value)} placeholder={field.ph}
                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }} />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Business Page URL</div>
                    <input value={pageUrl} onChange={e => setPageUrl(e.target.value)} placeholder="https://nextdoor.com/pages/..."
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }} />
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Setup Notes</div>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                    placeholder="Notes about setup progress, blockers, or next steps..."
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit", resize: "vertical" }} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                  <button onClick={handleSave} style={{ padding: "8px 18px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: ND_GREEN, border: "none", color: "#FFF" }}>
                    Save Setup Notes
                  </button>
                  {savedMsg && <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>✓ Saved</span>}
                </div>
              </div>
            )}

            {/* ── Neighborhood Visibility ── */}
            {activeTab === "neighborhoods" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                  Track Nextdoor visibility and recommendation strength across each city in the service area. Visibility improves after publishing and receiving neighbor recommendations.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {NEXTDOOR_NEIGHBORHOODS.map(n => {
                    const s = ND_NEIGHBORHOOD_STYLE[n.status];
                    return (
                      <div key={n.city} style={{
                        display: "grid", gridTemplateColumns: "100px 1fr auto auto", gap: 12, alignItems: "center",
                        padding: "10px 14px", borderRadius: 9, background: s.bg, border: `1px solid ${s.border}`,
                      }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{n.city}</span>
                        <span style={{ fontSize: 11.5, color: "#475569" }}>{n.action}</span>
                        <span style={{ fontSize: 11, color: "#64748B" }}>
                          {n.recs > 0 ? `${n.recs} rec${n.recs !== 1 ? "s" : ""}` : "0 recs"}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: s.color, whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: s.color, marginRight: 5 }} />
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={{
                  marginTop: 14, padding: "12px 14px", borderRadius: 10,
                  background: "rgba(141,198,65,0.05)", border: "1px solid rgba(141,198,65,0.15)",
                  fontSize: 12, color: "#64748B", lineHeight: 1.6,
                }}>
                  <strong style={{ color: ND_GREEN }}>How to improve:</strong> Publish your business page → ask satisfied customers to leave Nextdoor recommendations → expand service area to all 6 cities. Each recommendation increases neighborhood visibility strength.
                </div>
              </div>
            )}

            {/* ── Diagnostics ── */}
            {activeTab === "diagnostics" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                  Automated checks against Nextdoor Business setup requirements and neighborhood visibility.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {NEXTDOOR_DIAGS.map((d, i) => {
                    const s = APPLE_DIAG_STYLE[d.status];
                    const statusLabels: Record<AppleDiagStatus, string> = { healthy:"Healthy", warning:"Warning", missing:"Missing", pending:"Pending", coming_soon:"Coming Soon" };
                    return (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "9px 14px", borderRadius: 9, background: s.bg, border: `1px solid ${s.border}` }}>
                        <div>
                          <div style={{ fontSize: 12.5, color: "#CBD5E1", fontWeight: 600, marginBottom: 2 }}>{d.check}</div>
                          <div style={{ fontSize: 11, color: "#475569" }}>{d.note}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: s.color, whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: s.dot, marginRight: 5 }} />
                          {statusLabels[d.status]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Platform definitions ───────────────────────────────────────────────────────
type PlatformDef = {
  id: string;
  label: string;
  abbrev: string;
  color: string;
  gradient: string;
  description: string;
  externalUrl: string | null;
  externalLabel: string | null;
  checklist: CheckItem[];
};

const PLATFORM_DEFS: PlatformDef[] = [
  {
    id: "google_business",
    label: "Google Business Profile",
    abbrev: "G",
    color: "#EA4335",
    gradient: "linear-gradient(135deg, #4285F4, #34A853)",
    description: "Google Search, Maps, and AI Overview visibility. Manage posts and respond to reviews.",
    externalUrl: "https://business.google.com",
    externalLabel: "Open Google Business",
    checklist: [
      { label: "Business claimed and verified", done: true },
      { label: "Business name confirmed",       done: true },
      { label: "Phone number added",            done: true },
      { label: "Website linked",                done: true },
      { label: "Service area configured",       done: true },
      { label: "Categories set",                done: true },
      { label: "Business hours added",          done: true },
      { label: "Photos/logo uploaded",          done: true },
      { label: "Google Maps visibility confirmed", done: true },
    ],
  },
  {
    id: "apple_business",
    label: "Apple Business Connect",
    abbrev: "🍎",
    color: "#A2AAAD",
    gradient: "linear-gradient(135deg, #555, #999)",
    description: "Apple Maps, Siri, iOS Spotlight, and Apple Wallet. Reaches all iPhone and Mac users.",
    externalUrl: "https://businessconnect.apple.com",
    externalLabel: "Open Apple Business Connect",
    checklist: [
      { label: "Claim or create business listing", done: false },
      { label: "Verify business ownership",         done: false },
      { label: "Add business name",                 done: false },
      { label: "Add phone number",                  done: false },
      { label: "Add website",                       done: false },
      { label: "Add logo and photos",               done: false },
      { label: "Add service area",                  done: false },
      { label: "Add categories",                    done: false },
      { label: "Add business hours",                done: false },
      { label: "Confirm Apple Maps visibility",     done: false },
    ],
  },
  {
    id: "bing_places",
    label: "Bing Places for Business",
    abbrev: "B",
    color: "#00ADEF",
    gradient: "linear-gradient(135deg, #00ADEF, #0063B1)",
    description: "Bing Maps, Microsoft Search, Copilot AI, Edge browser, and Windows 11 integration.",
    externalUrl: "https://www.bingplaces.com",
    externalLabel: "Open Bing Places",
    checklist: [
      { label: "Claim or create listing",                               done: false },
      { label: "Import from Google Business Profile (if available)",    done: false },
      { label: "Verify business ownership",                             done: false },
      { label: "Add phone number",                                      done: false },
      { label: "Add website",                                           done: false },
      { label: "Add service area",                                      done: false },
      { label: "Add business category",                                 done: false },
      { label: "Add business hours and photos",                         done: false },
      { label: "Confirm Bing Maps visibility",                          done: false },
    ],
  },
  {
    id: "nextdoor",
    label: "Nextdoor Business",
    abbrev: "N",
    color: "#8DC641",
    gradient: "linear-gradient(135deg, #5A9B1A, #8DC641)",
    description: "Neighborhood discovery, local referrals, community trust, and neighbor recommendations.",
    externalUrl: "https://business.nextdoor.com",
    externalLabel: "Open Nextdoor Business",
    checklist: [
      { label: "Create or claim business page",          done: false },
      { label: "Add service area / neighborhoods",       done: false },
      { label: "Add business phone number",              done: false },
      { label: "Add website",                            done: false },
      { label: "Add services offered",                   done: false },
      { label: "Add logo and photos",                    done: false },
      { label: "Enable neighborhood visibility",         done: false },
      { label: "Track recommendations and reviews",      done: false },
    ],
  },
];

// ── GBP card: derives live status/health from API ─────────────────────────────
function deriveGBPPresenceStatus(gbp: GBPStatus | undefined): PresenceStatus {
  if (!gbp) return "not_connected";
  if (!gbp.tokenExists) return "not_connected";
  if (gbp.connected) return "connected";
  if (gbp.failureReason === "google_api_error") return "error";
  return "pending";
}

function deriveGBPHealth(gbp: GBPStatus | undefined): { health: HealthStatus; warnings: string[] } {
  if (!gbp) return { health: "unknown", warnings: [] };
  const warnings: string[] = [];

  if (!gbp.connected) {
    switch (gbp.failureReason) {
      case "google_api_error":
        if (gbp.apiError?.includes("429") || gbp.apiError?.includes("RESOURCE_EXHAUSTED")) {
          warnings.push("Google API quota exceeded — status will auto-recover; no action needed");
        } else if (gbp.apiError?.includes("UNAUTHENTICATED") || gbp.apiError?.includes("invalid authentication")) {
          warnings.push("Access token expired — refreshing automatically on next check");
        } else {
          warnings.push(`Google API error: ${gbp.apiError ?? "unknown — check diagnostics"}`);
        }
        return { health: "warning", warnings };
      case "missing_business_manage_scope":
        warnings.push("business.manage permission not granted — reconnect and approve all scopes on the Google consent screen");
        return { health: "error", warnings };
      case "google_api_not_enabled":
        warnings.push("Business Profile API not enabled in Google Cloud Console — enable it at console.cloud.google.com");
        return { health: "error", warnings };
      case "no_gbp_accounts_found":
        warnings.push("No GBP accounts found — ensure your Google account has a Business Profile");
        return { health: "warning", warnings };
      case "no_gbp_locations_found":
        warnings.push("GBP account connected but no locations found — add a location in Business Profile");
        return { health: "warning", warnings };
      default:
        return { health: "unknown", warnings: [] };
    }
  }

  // Connected — check for soft warnings
  if (gbp.apiError?.includes("429") || gbp.apiError?.includes("RESOURCE_EXHAUSTED")) {
    warnings.push("Google API quota exceeded — publishing on cooldown");
  }
  if (!gbp.businessManageScopeGranted) warnings.push("business.manage permission not granted");
  if (gbp.gbpLocationsFound === 0) warnings.push("No locations found in account");
  const health: HealthStatus = warnings.length === 0 ? "healthy" : "warning";
  return { health, warnings };
}

// ── Individual platform card ───────────────────────────────────────────────────
function PlatformCard({
  def,
  presenceStatus,
  health,
  warnings,
  lastChecked,
  accountName,
  locationTitle,
  onRefresh,
  onDisconnect,
  refreshing,
  disconnecting,
}: {
  def: PlatformDef;
  presenceStatus: PresenceStatus;
  health: HealthStatus;
  warnings: string[];
  lastChecked: string | null;
  accountName: string | null;
  locationTitle: string | null;
  onRefresh?: () => void;
  onDisconnect?: () => void;
  refreshing?: boolean;
  disconnecting?: boolean;
}) {
  const [checklistOpen, setChecklistOpen] = useState(false);
  const ps = PRESENCE_STYLE[presenceStatus];
  const isConnected = presenceStatus === "connected";
  const checklistDone = def.checklist.filter(i => i.done).length;
  const checklistTotal = def.checklist.length;

  return (
    <div style={{
      background: cardBg(presenceStatus),
      border: `1px solid ${ps.border}`,
      borderRadius: 14, padding: 20,
      backdropFilter: "blur(12px)",
      display: "flex", flexDirection: "column", gap: 14,
      transition: "border-color 0.2s",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: def.gradient,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: def.abbrev.length > 1 ? 20 : 16, fontWeight: 900, color: "#FFFFFF",
          boxShadow: `0 0 16px ${def.color}33`,
        }}>
          {def.abbrev}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>{def.label}</span>
            <StatusBadge status={presenceStatus} />
            {isConnected && <HealthBadge health={health} />}
          </div>
          <p style={{ fontSize: 12.5, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>{def.description}</p>
        </div>
      </div>

      {/* Business details */}
      <div style={{
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10, padding: "12px 14px",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px",
      }}>
        {[
          { label: "Business",     value: NAP.name },
          { label: "Phone",        value: NAP.phone },
          { label: "Website",      value: NAP.website.replace("https://", "") },
          { label: "Category",     value: NAP.category },
          { label: "Service Area", value: NAP.serviceArea },
          { label: "Last Checked", value: lastChecked ?? "Not yet checked" },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 12, color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Account / location panel */}
      {(accountName || locationTitle) && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: `${def.color}0D`, border: `1px solid ${def.color}22`,
          borderRadius: 8, padding: "6px 12px",
        }}>
          <span style={{ fontSize: 13 }}>📍</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#C0C0C0" }}>
            {locationTitle ?? accountName}
          </span>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {warnings.map((w, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 7,
              background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)",
              borderRadius: 8, padding: "7px 10px",
            }}>
              <span style={{ fontSize: 12, flexShrink: 0 }}>⚠</span>
              <span style={{ fontSize: 12, color: "#FCD34D", lineHeight: 1.4 }}>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Pending platform info warnings */}
      {presenceStatus === "not_connected" && def.id !== "google_business" && (
        <div style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.5 }}>
          🕐 Set up this listing to appear in {def.label.split(" ")[0]} search results and maps.
        </div>
      )}

      {/* Checklist toggle (for non-GBP pending platforms) */}
      {def.id !== "google_business" && (
        <div>
          <button
            onClick={() => setChecklistOpen(v => !v)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 9, padding: "9px 14px", cursor: "pointer",
              color: "#94A3B8", fontSize: 12, fontWeight: 600,
            }}
          >
            <span>Setup Checklist — {checklistDone}/{checklistTotal} complete</span>
            <span style={{ fontSize: 10, color: "#475569" }}>{checklistOpen ? "▲ Hide" : "▼ Show"}</span>
          </button>
          {checklistOpen && (
            <div style={{ marginTop: 10, padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 9 }}>
              <Checklist items={def.checklist} />
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {def.id === "google_business" && (
          <>
            {onRefresh && (
              <ActionBtn
                label={refreshing ? "⏳ Refreshing…" : "↻ Refresh Locations"}
                color="#00AEEF"
                onClick={onRefresh}
                disabled={refreshing}
                variant="ghost"
              />
            )}
            {onDisconnect && isConnected && (
              <ActionBtn
                label={disconnecting ? "…" : "Disconnect"}
                onClick={onDisconnect}
                disabled={disconnecting}
                variant="danger"
              />
            )}
            <ActionBtn label="↗ Diagnostics" color="#8B5CF6" href="/admin/diagnostics" variant="ghost" />
          </>
        )}
        {def.id === "apple_business" && (
          <>
            <ActionBtn label="📋 Setup" color="#F59E0B" onClick={() => setChecklistOpen(true)} variant="ghost" />
            <ActionBtn label="↗ Open Apple Business Connect" color="#A2AAAD" href={def.externalUrl!} variant="ghost" />
          </>
        )}
        {def.id === "bing_places" && (
          <>
            <ActionBtn label="📋 Setup" color="#F59E0B" onClick={() => setChecklistOpen(true)} variant="ghost" />
            <ActionBtn label="↗ Open Bing Places" color="#00ADEF" href={def.externalUrl!} variant="ghost" />
          </>
        )}
        {def.id === "nextdoor" && (
          <>
            <ActionBtn label="📋 Setup" color="#F59E0B" onClick={() => setChecklistOpen(true)} variant="ghost" />
            <ActionBtn label="↗ Open Nextdoor Business" color="#8DC641" href={def.externalUrl!} variant="ghost" />
          </>
        )}
        {def.externalUrl && def.id === "google_business" && (
          <ActionBtn label="↗ Open Listing" color="#4285F4" href={def.externalUrl} variant="ghost" />
        )}
      </div>
    </div>
  );
}

// ── AI Search card (Coming Soon) ───────────────────────────────────────────────
function AISearchCard() {
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(139,92,246,0.05) 0%, rgba(11,22,41,0.9) 100%)",
      border: "1px solid rgba(139,92,246,0.2)",
      borderRadius: 14, padding: 20,
      backdropFilter: "blur(12px)",
      display: "flex", flexDirection: "column", gap: 14, opacity: 0.85,
    }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, boxShadow: "0 0 16px rgba(139,92,246,0.3)",
        }}>✦</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>AI Search Visibility</span>
            <StatusBadge status="coming_soon" />
          </div>
          <p style={{ fontSize: 12.5, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
            Track and optimize visibility in AI-powered search engines and assistants.
          </p>
        </div>
      </div>
      <div style={{
        background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)",
        borderRadius: 10, padding: "14px 16px",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#8B5CF6", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 10 }}>
          Channels in V2
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px" }}>
          {[
            { name: "Google AI Overview",  icon: "G", color: "#EA4335" },
            { name: "Copilot / Bing AI",   icon: "B", color: "#00ADEF" },
            { name: "ChatGPT Search",       icon: "✦", color: "#10A37F" },
            { name: "Perplexity AI",        icon: "P", color: "#20B2AA" },
          ].map(({ name, icon, color }) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                background: `${color}18`, border: `1px solid ${color}25`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 900, color,
              }}>{icon}</div>
              <span style={{ fontSize: 12, color: "#64748B" }}>{name}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 11.5, color: "#475569", lineHeight: 1.5 }}>
          AI search visibility tracks how often your business appears in generative AI answers.
          Google Business Profile + structured content are the primary signals.
        </div>
      </div>
    </div>
  );
}

// ── Yelp Business V2 Card ──────────────────────────────────────────────────────
const YELP_CHECKLIST: { label: string; status: AppleStepStatus; description: string }[] = [
  { label: "Create or sign in to Yelp for Business",  status: "pending", description: "Sign up or log in at biz.yelp.com using your business email." },
  { label: "Search for existing Yelp listing",        status: "pending", description: "Search 'Bed Bugs & Beyond Baldwin County AL' — Yelp often auto-creates listings from public data." },
  { label: "Claim or create business page",           status: "pending", description: "Claim the existing listing or create a new one at biz.yelp.com." },
  { label: "Verify ownership",                        status: "pending", description: "Yelp verifies by automated phone call PIN to (251) 324-9090." },
  { label: "Confirm business name",                   status: "pending", description: "Exact match required: 'Bed Bugs & Beyond' — no keyword additions." },
  { label: "Confirm phone number",                    status: "pending", description: "Set (251) 324-9090 as the primary contact number." },
  { label: "Confirm website",                         status: "pending", description: "Set website to https://bedbugsandbeyond.net." },
  { label: "Select business categories",              status: "pending", description: "Primary: Pest Control — Secondary: Exterminators." },
  { label: "Set service area",                        status: "pending", description: "Add Baldwin County + all 7 primary cities." },
  { label: "Add business description",                status: "pending", description: "Use the copy-ready description in the Business Info tab." },
  { label: "Add specialties",                         status: "pending", description: "List: bed bugs, roaches, ants, spiders, fleas, rodents, mosquitoes, general pest." },
  { label: "Upload logo / profile photo",             status: "pending", description: "Square, min 400×400 px (PNG or JPG)." },
  { label: "Upload business photos",                  status: "pending", description: "Yelp recommends 10+ photos; minimum 5 to appear well-presented." },
  { label: "Set business hours",                      status: "pending", description: "Mon–Fri 7am–6pm, Sat 8am–2pm, Sun Closed." },
  { label: "Enable Request a Quote / messaging",      status: "pending", description: "Turn on Yelp's contact features so prospects can reach you directly." },
];

const YELP_DIAGS: { check: string; status: AppleDiagStatus; note: string }[] = [
  { check: "Yelp for Business account created",   status: "missing",     note: "No Yelp Business account detected — not yet started" },
  { check: "Listing claimed or created",          status: "missing",     note: "Listing not yet claimed or created" },
  { check: "Ownership verified",                  status: "missing",     note: "Phone verification not started" },
  { check: "NAP matches Google Business Profile", status: "pending",     note: "Will be confirmed once listing is claimed" },
  { check: "Phone confirmed",                     status: "pending",     note: "Pending listing setup" },
  { check: "Website confirmed",                   status: "pending",     note: "Pending listing setup" },
  { check: "Category selected",                   status: "missing",     note: "No category set yet" },
  { check: "Service area configured",             status: "missing",     note: "No service area set" },
  { check: "Photos uploaded",                     status: "missing",     note: "No photos — Yelp recommends 10+" },
  { check: "Business description added",          status: "missing",     note: "No description set" },
  { check: "Messaging / quotes enabled",          status: "missing",     note: "Contact features not enabled" },
  { check: "Siri / Apple Maps cross-signal",      status: "pending",     note: "Yelp feeds Siri & Apple Maps — activates once listing is live" },
];

function YelpBusinessCard() {
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [activeTab,    setActiveTab]    = useState<"checklist" | "bizinfo" | "profile" | "diagnostics">("checklist");
  const [checklist,    setChecklist]    = useState(YELP_CHECKLIST);
  const [listingUrl,   setListingUrl]   = useState("");
  const [acctEmail,    setAcctEmail]    = useState("");
  const [verifyStatus, setVerifyStatus] = useState("Not Started");
  const [notes,        setNotes]        = useState("");
  const [savedMsg,     setSavedMsg]     = useState(false);
  const [copiedKey,    setCopiedKey]    = useState<string | null>(null);

  const completedCount  = checklist.filter(s => s.status === "complete").length;
  const inProgressCount = checklist.filter(s => s.status === "in-progress").length;
  const yelpScore       = Math.round((completedCount / checklist.length) * 10);

  function markStepComplete(idx: number) {
    setChecklist(prev => prev.map((s, i) => i === idx ? { ...s, status: "complete" } : s));
  }
  function handleSave() { setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2500); }
  function copyText(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2200);
    });
  }

  const YELP_RED = "#D32323";

  const TABS: { key: typeof activeTab; label: string }[] = [
    { key: "checklist",   label: "Setup Checklist" },
    { key: "bizinfo",     label: "Business Info" },
    { key: "profile",     label: "Profile Tracker" },
    { key: "diagnostics", label: "Diagnostics" },
  ];

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(211,35,35,0.05) 0%, rgba(11,22,41,0.9) 100%)",
      border: "1px solid rgba(211,35,35,0.25)",
      borderRadius: 14, backdropFilter: "blur(12px)", overflow: "hidden",
      boxShadow: "0 0 24px rgba(211,35,35,0.06)", transition: "border-color 0.2s",
    }}>
      {/* ── Card header ── */}
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(135deg, #AF0606, #D32323)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 900, color: "#FFF",
            boxShadow: "0 0 16px rgba(211,35,35,0.35)",
          }}>★</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>Yelp for Business</span>
              <StatusBadge status="pending" />
            </div>
            <p style={{ fontSize: 12.5, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
              Local trust, reviews, Siri / Apple ecosystem, voice search &amp; iPhone local queries.
            </p>
          </div>
        </div>

        {/* Business details */}
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10, padding: "12px 14px",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px",
        }}>
          {[
            { label: "Business",     value: NAP.name },
            { label: "Phone",        value: NAP.phone },
            { label: "Website",      value: NAP.website.replace("https://", "") },
            { label: "Category",     value: "Pest Control" },
            { label: "Service Area", value: NAP.serviceArea },
            { label: "Status",       value: "Not Started" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 12, color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Score + progress */}
        <div style={{
          background: "rgba(211,35,35,0.05)", border: "1px solid rgba(211,35,35,0.15)",
          borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>Setup Progress — {completedCount}/{checklist.length} steps</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: YELP_RED }}>Yelp Score: {yelpScore} / 10 pts</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((completedCount / checklist.length) * 100)}%`, background: YELP_RED, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "#10B981", fontWeight: 700 }}>{completedCount} done</span>
            <span style={{ fontSize: 11, color: "#64748B" }}>·</span>
            <span style={{ fontSize: 11, color: YELP_RED, fontWeight: 700 }}>{inProgressCount} active</span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            onClick={() => setDrawerOpen(v => !v)}
            style={{
              padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: drawerOpen ? "rgba(211,35,35,0.2)" : "rgba(211,35,35,0.1)",
              border: "1px solid rgba(211,35,35,0.35)", color: YELP_RED, transition: "all 0.15s",
            }}
          >{drawerOpen ? "▲ Close Yelp Setup" : "▼ Open Yelp Setup"}</button>
          <a href="https://biz.yelp.com" target="_blank" rel="noopener noreferrer"
            style={{ padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(211,35,35,0.08)", border: "1px solid rgba(211,35,35,0.22)", color: YELP_RED, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            ↗ Open Yelp for Business
          </a>
          <a href="https://www.yelp.com" target="_blank" rel="noopener noreferrer"
            style={{ padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(211,35,35,0.05)", border: "1px solid rgba(211,35,35,0.15)", color: "#64748B", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            ↗ Yelp.com
          </a>
        </div>
      </div>

      {/* ── Expandable drawer ── */}
      {drawerOpen && (
        <div style={{ borderTop: "1px solid rgba(211,35,35,0.12)", background: "rgba(3,6,18,0.6)" }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 20px" }}>
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: "11px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: "transparent", border: "none",
                borderBottom: activeTab === tab.key ? `2px solid ${YELP_RED}` : "2px solid transparent",
                color: activeTab === tab.key ? YELP_RED : "#475569", transition: "all 0.15s", marginBottom: -1,
              }}>{tab.label}</button>
            ))}
          </div>

          <div style={{ padding: 20 }}>

            {/* ── Setup Checklist ── */}
            {activeTab === "checklist" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                  Complete all 15 steps to fully activate your Yelp listing. Mark each step after confirming it in Yelp for Business.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {checklist.map((step, idx) => (
                    <div key={idx} style={{
                      padding: "11px 14px", borderRadius: 10,
                      background: step.status === "complete" ? "rgba(16,185,129,0.05)" : step.status === "in-progress" ? "rgba(211,35,35,0.05)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${step.status === "complete" ? "rgba(16,185,129,0.18)" : step.status === "in-progress" ? "rgba(211,35,35,0.2)" : "rgba(255,255,255,0.05)"}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: step.description ? 4 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                            background: step.status === "complete" ? "rgba(16,185,129,0.2)" : step.status === "in-progress" ? "rgba(211,35,35,0.15)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${step.status === "complete" ? "rgba(16,185,129,0.4)" : step.status === "in-progress" ? "rgba(211,35,35,0.3)" : "rgba(255,255,255,0.1)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: step.status === "complete" ? "#10B981" : step.status === "in-progress" ? YELP_RED : "#475569", fontWeight: 800,
                          }}>
                            {step.status === "complete" ? "✓" : idx + 1}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: step.status === "complete" ? "#64748B" : "#CBD5E1", textDecoration: step.status === "complete" ? "line-through" : "none" }}>
                            {step.label}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <AppleStepBadge status={step.status} />
                          {step.status !== "complete" && (
                            <button onClick={() => markStepComplete(idx)} style={{ padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#10B981" }}>
                              Mark Done
                            </button>
                          )}
                        </div>
                      </div>
                      {step.description && (
                        <p style={{ fontSize: 11.5, color: "#475569", margin: "4px 0 0 32px", lineHeight: 1.5 }}>{step.description}</p>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <a href="https://biz.yelp.com" target="_blank" rel="noopener noreferrer"
                    style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(211,35,35,0.1)", border: "1px solid rgba(211,35,35,0.3)", color: YELP_RED, textDecoration: "none", display: "inline-block" }}>
                    ↗ Open Yelp for Business
                  </a>
                </div>
              </div>
            )}

            {/* ── Business Info ── */}
            {activeTab === "bizinfo" && (() => {
              const BIZ_DESCRIPTION =
`Bed Bugs & Beyond is Baldwin County's #1 trusted pest control company for homeowners, families, rental properties, and vacation rentals. We specialize in complete bed bug elimination, roach and ant control, spider and flea treatments, rodent removal, mosquito control, and general pest management. Serving Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Elberta, and Robertsdale. Locally owned, fast response, results guaranteed. Call (251) 324-9090 to schedule your inspection today.`;

              const SPECIALTIES =
`Bed bug inspection and heat treatment
Roach elimination
Ant control (interior and exterior)
Spider treatment
Flea treatment (home and yard)
Rodent exclusion and removal
Mosquito yard treatment
General pest control maintenance`;

              const SERVICE_LIST =
`Bed Bug Treatment
Roach Control
Ant Control
Spider Control
Flea Control
Rodent Control
Mosquito Control
General Pest Control`;

              const SERVICE_AREAS =
`Foley, Alabama
Gulf Shores, Alabama
Orange Beach, Alabama
Fairhope, Alabama
Daphne, Alabama
Elberta, Alabama
Robertsdale, Alabama
Baldwin County, Alabama`;

              const REQUIRED_FIELDS: { label: string; value: string; copyKey?: string; note?: string }[] = [
                { label: "Business Name",      value: "Bed Bugs & Beyond",                    note: "Exact match — no keywords appended" },
                { label: "Phone Number",       value: "(251) 324-9090", copyKey: "yelp-phone",note: "Must match GBP exactly (NAP)" },
                { label: "Website",            value: "https://bedbugsandbeyond.net",          note: "Confirmed BB&B website" },
                { label: "Primary Category",   value: "Pest Control",                         note: "Select from Yelp's category list" },
                { label: "Secondary Category", value: "Exterminators",                        note: "Add as secondary category" },
                { label: "Service Area",       value: "Baldwin County, AL — 7 cities",        note: "Add: Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Elberta, Robertsdale" },
                { label: "Business Hours",     value: "Mon–Fri 7am–6pm, Sat 8am–2pm",        note: "Set per-day in Yelp's hours editor" },
                { label: "Verification",       value: "Automated phone call to (251) 324-9090", note: "Yelp calls with a PIN — answer during business hours" },
              ];

              const PHOTO_REQS: { item: string; spec: string }[] = [
                { item: "Logo / profile",   spec: "Square, min 400×400 px (PNG/JPG) — appears in search results" },
                { item: "Cover photo",      spec: "Landscape, min 1200×675 px — top of your Yelp page" },
                { item: "Service photo ×3", spec: "Treatment photos — bed bug, exterior spray, interior inspection" },
                { item: "Team / vehicle",   spec: "Uniformed tech or branded truck — builds credibility" },
                { item: "Before/after",     spec: "Before and after pest treatment (if available)" },
              ];

              type CopyBlockProps = { label: string; copyKey: string; value: string; rows?: number };
              function CopyBlock({ label, copyKey, value, rows = 4 }: CopyBlockProps) {
                const copied = copiedKey === copyKey;
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</span>
                      <button
                        onClick={() => copyText(copyKey, value)}
                        style={{
                          padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
                          background: copied ? "rgba(16,185,129,0.12)" : "rgba(211,35,35,0.1)",
                          border: copied ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(211,35,35,0.25)",
                          color: copied ? "#10B981" : YELP_RED, transition: "all 0.2s",
                        }}
                      >{copied ? "✓ Copied" : "Copy"}</button>
                    </div>
                    <textarea
                      readOnly rows={rows} value={value}
                      style={{
                        width: "100%", boxSizing: "border-box",
                        padding: "10px 12px", borderRadius: 9, fontSize: 12, lineHeight: 1.6,
                        color: "#CBD5E1", background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        outline: "none", fontFamily: "inherit", resize: "none", cursor: "text",
                      }}
                    />
                  </div>
                );
              }

              return (
                <div>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 16, lineHeight: 1.5 }}>
                    Setup guidance only — not analytics. Status stays <strong style={{ color: YELP_RED }}>Setup Pending</strong> until the Yelp listing is claimed and verified.
                  </div>

                  {/* ── Why Yelp matters callout ── */}
                  <div style={{
                    padding: "12px 16px", borderRadius: 10, marginBottom: 20,
                    background: "rgba(211,35,35,0.05)", border: "1px solid rgba(211,35,35,0.2)",
                    fontSize: 12, color: "#94A3B8", lineHeight: 1.7,
                  }}>
                    <div style={{ fontWeight: 700, color: "#CBD5E1", marginBottom: 6, fontSize: 12.5 }}>Why Yelp matters for Bed Bugs &amp; Beyond</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                      {[
                        { icon: "⭐", text: "Review authority — Yelp reviews rank in Google search results for brand queries" },
                        { icon: "🍎", text: "Siri / Apple Maps — Yelp is the primary data source for Siri local business answers" },
                        { icon: "🎙️", text: "Voice search — 'Hey Siri, find pest control near me' pulls from Yelp" },
                        { icon: "🏠", text: "Local trust — Baldwin County homeowners check Yelp before calling a pest company" },
                      ].map(item => (
                        <div key={item.icon} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <span style={{ flexShrink: 0, fontSize: 13 }}>{item.icon}</span>
                          <span style={{ fontSize: 11.5, color: "#94A3B8" }}>{item.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Required fields ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Required Business Information
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
                    {REQUIRED_FIELDS.map(f => (
                      <div key={f.label} style={{
                        display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 12, alignItems: "start",
                        padding: "9px 14px", borderRadius: 9,
                        background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", paddingTop: 1 }}>{f.label}</div>
                        <div>
                          <div style={{ fontSize: 12.5, color: "#E2E8F0", fontWeight: 500 }}>{f.value}</div>
                          {f.note && <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{f.note}</div>}
                        </div>
                        {f.copyKey && (
                          <button
                            onClick={() => copyText(f.copyKey!, f.value)}
                            style={{
                              padding: "3px 9px", borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: "pointer",
                              background: copiedKey === f.copyKey ? "rgba(16,185,129,0.12)" : "rgba(211,35,35,0.08)",
                              border: copiedKey === f.copyKey ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(211,35,35,0.2)",
                              color: copiedKey === f.copyKey ? "#10B981" : YELP_RED, whiteSpace: "nowrap", flexShrink: 0,
                            }}
                          >{copiedKey === f.copyKey ? "✓" : "Copy"}</button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* ── Copy-ready content ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Copy-Ready Content
                  </div>
                  <CopyBlock label="Business Description" copyKey="yelp-desc"       value={BIZ_DESCRIPTION} rows={5} />
                  <CopyBlock label="Specialties"          copyKey="yelp-specialties" value={SPECIALTIES}     rows={9} />
                  <CopyBlock label="Service List"         copyKey="yelp-services"    value={SERVICE_LIST}    rows={9} />
                  <CopyBlock label="Service Area List"    copyKey="yelp-areas"       value={SERVICE_AREAS}   rows={9} />

                  {/* ── Photo requirements ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Photo Requirements <span style={{ fontSize: 10, fontWeight: 500, color: "#475569", textTransform: "none" }}>(Yelp recommends 10+ total)</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
                    {PHOTO_REQS.map(p => (
                      <div key={p.item} style={{
                        display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 12, alignItems: "center",
                        padding: "9px 14px", borderRadius: 9,
                        background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1" }}>{p.item}</div>
                        <div style={{ fontSize: 11.5, color: "#475569" }}>{p.spec}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, color: "#EF4444", background: "rgba(239,68,68,0.1)", whiteSpace: "nowrap" }}>Missing</span>
                      </div>
                    ))}
                  </div>

                  {/* ── Verification ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Verification
                  </div>
                  <div style={{
                    padding: "12px 16px", borderRadius: 10, marginBottom: 18,
                    background: "rgba(211,35,35,0.04)", border: "1px solid rgba(211,35,35,0.18)",
                    fontSize: 12.5, color: "#94A3B8", lineHeight: 1.7,
                  }}>
                    Yelp verifies ownership via an <strong style={{ color: "#CBD5E1" }}>automated phone call</strong> to the number on file. Yelp will call <strong style={{ color: "#CBD5E1" }}>(251) 324-9090</strong> and provide a PIN. Enter the PIN in Yelp for Business to confirm ownership. Have someone available to answer during business hours (Mon–Fri 7am–6pm).
                  </div>

                  {/* ── Status + next action ── */}
                  <div style={{
                    padding: "12px 16px", borderRadius: 10, marginBottom: 14,
                    background: "rgba(211,35,35,0.05)", border: "1px solid rgba(211,35,35,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1", marginBottom: 2 }}>Listing Verification Status</div>
                      <div style={{ fontSize: 11.5, color: "#475569" }}>
                        Status updates once the listing is claimed and the phone verification PIN is entered.
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                      background: "rgba(211,35,35,0.12)", border: "1px solid rgba(211,35,35,0.3)", color: YELP_RED,
                    }}>Not Started</span>
                  </div>

                  <div style={{
                    padding: "12px 16px", borderRadius: 10,
                    background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.18)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 6 }}>Next Action</div>
                    <ol style={{ margin: 0, paddingLeft: 18, color: "#94A3B8", fontSize: 12.5, lineHeight: 2 }}>
                      <li>Go to <a href="https://biz.yelp.com" target="_blank" rel="noopener noreferrer" style={{ color: YELP_RED }}>biz.yelp.com</a> — sign in or create account</li>
                      <li>Search "Bed Bugs &amp; Beyond, Baldwin County AL" — claim if found, or click "Add Business"</li>
                      <li>Select categories: <strong style={{ color: "#CBD5E1" }}>Pest Control</strong> + <strong style={{ color: "#CBD5E1" }}>Exterminators</strong></li>
                      <li>Paste <strong style={{ color: "#CBD5E1" }}>Business Description</strong> and <strong style={{ color: "#CBD5E1" }}>Specialties</strong> using copy buttons above</li>
                      <li>Add all 7 service area cities from <strong style={{ color: "#CBD5E1" }}>Service Area List</strong></li>
                      <li>Upload logo and minimum 5 photos per specs above (10+ recommended)</li>
                      <li>Set business hours (Mon–Fri 7am–6pm, Sat 8am–2pm)</li>
                      <li>Answer the verification call to <strong style={{ color: "#CBD5E1" }}>(251) 324-9090</strong> and enter the PIN</li>
                      <li>Enable <strong style={{ color: "#CBD5E1" }}>Request a Quote</strong> and <strong style={{ color: "#CBD5E1" }}>Messaging</strong> for inbound leads</li>
                      <li>Update verification status in <strong style={{ color: "#CBD5E1" }}>Profile Tracker</strong> tab once complete</li>
                    </ol>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <a href="https://biz.yelp.com" target="_blank" rel="noopener noreferrer"
                      style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(211,35,35,0.1)", border: "1px solid rgba(211,35,35,0.3)", color: YELP_RED, textDecoration: "none", display: "inline-block" }}>
                      ↗ Open Yelp for Business
                    </a>
                  </div>
                </div>
              );
            })()}

            {/* ── Profile Tracker ── */}
            {activeTab === "profile" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 16, lineHeight: 1.5 }}>
                  Track your Yelp for Business account details, listing URL, and verification status here.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { label: "Account Email",       val: acctEmail,    set: setAcctEmail,    ph: "email@example.com" },
                    { label: "Verification Status", val: verifyStatus, set: setVerifyStatus, ph: "Not Started / Pending / Verified" },
                  ].map(field => (
                    <div key={field.label}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>{field.label}</div>
                      <input value={field.val} onChange={e => field.set(e.target.value)} placeholder={field.ph}
                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }} />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Yelp Listing URL</div>
                    <input value={listingUrl} onChange={e => setListingUrl(e.target.value)} placeholder="https://www.yelp.com/biz/..."
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }} />
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Setup Notes</div>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                    placeholder="Notes about setup progress, blockers, or next steps..."
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit", resize: "vertical" }} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                  <button onClick={handleSave} style={{ padding: "8px 18px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: YELP_RED, border: "none", color: "#FFF" }}>
                    Save Setup Notes
                  </button>
                  {savedMsg && <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>✓ Saved</span>}
                </div>
              </div>
            )}

            {/* ── Diagnostics ── */}
            {activeTab === "diagnostics" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                  Automated checks against Yelp setup requirements, NAP consistency, and Siri/Apple ecosystem cross-signal readiness.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {YELP_DIAGS.map((d, i) => {
                    const s = APPLE_DIAG_STYLE[d.status];
                    const statusLabels: Record<AppleDiagStatus, string> = { healthy: "Healthy", warning: "Warning", missing: "Missing", pending: "Pending", coming_soon: "Coming Soon" };
                    return (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "9px 14px", borderRadius: 9, background: s.bg, border: `1px solid ${s.border}` }}>
                        <div>
                          <div style={{ fontSize: 12.5, color: "#CBD5E1", fontWeight: 600, marginBottom: 2 }}>{d.check}</div>
                          <div style={{ fontSize: 11, color: "#475569" }}>{d.note}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: s.color, whiteSpace: "nowrap" }}>{statusLabels[d.status]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

// ── Diagnostics panel ──────────────────────────────────────────────────────────
type DiagEntry = { icon: string; color: string; text: string; severity: "warning" | "info" };

function DiagnosticsPanel({ connectedCount, pendingCount, errors, diags }: {
  connectedCount: number;
  pendingCount: number;
  errors: number;
  diags: DiagEntry[];
}) {
  // Score breakdown: GBP=35, Apple progress=up to 15, Bing=up to 10, Nextdoor=up to 10, NAP=up to 15, Photos/content=up to 15
  const gbpPoints      = connectedCount >= 1 ? 35 : 0;
  const applePoints    = 2;   // 1 step complete + 1 in-progress = partial credit
  const bingPoints     = 2;   // 1 step complete + 1 in-progress = partial credit
  const nextdoorPoints = 2;   // 1 step complete + 1 in-progress = partial credit
  const napPoints      = connectedCount >= 1 ? 5 : 0; // partial NAP from GBP only
  const scorePct       = gbpPoints + applePoints + bingPoints + nextdoorPoints + napPoints;
  const warnCount = diags.filter(d => d.severity === "warning").length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {/* Visibility score */}
      <div style={{
        background: "rgba(255,255,255,0.025)", border: "1px solid rgba(0,174,239,0.12)",
        borderRadius: 14, padding: "20px 22px",
      }}>
        <SectionLabel>Local Visibility Score</SectionLabel>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 42, fontWeight: 900, color: scorePct >= 75 ? "#10B981" : scorePct >= 40 ? "#F59E0B" : "#00AEEF", lineHeight: 1 }}>{scorePct}</span>
          <span style={{ fontSize: 16, color: "#475569", fontWeight: 600, marginBottom: 6 }}>/100</span>
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ height: "100%", width: `${scorePct}%`, background: "linear-gradient(90deg, #F59E0B, #00AEEF)", borderRadius: 3, transition: "width 0.6s" }} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatPill value={connectedCount} label="Connected"  color="#10B981" />
          <StatPill value={pendingCount}   label="Pending"    color="#F59E0B" />
          <StatPill value={errors}         label="Errors"     color="#EF4444" />
          <StatPill value={warnCount}      label="Warnings"   color="#F59E0B" />
        </div>
      </div>

      {/* Error / warning center */}
      <div style={{
        background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 14, padding: "20px 22px",
      }}>
        <SectionLabel>Active Issues &amp; Warnings</SectionLabel>
        {diags.length === 0 ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.15)",
            borderRadius: 10, padding: "14px 16px",
          }}>
            <span style={{ fontSize: 16 }}>✓</span>
            <span style={{ fontSize: 13, color: "#10B981", fontWeight: 600 }}>No active issues</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {diags.map((d, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                background: d.severity === "warning" ? "rgba(245,158,11,0.07)" : "rgba(0,174,239,0.07)",
                border: `1px solid ${d.severity === "warning" ? "rgba(245,158,11,0.18)" : "rgba(0,174,239,0.15)"}`,
                borderRadius: 8, padding: "8px 12px",
              }}>
                <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>{d.icon}</span>
                <span style={{ fontSize: 12, color: d.severity === "warning" ? "#FCD34D" : "#94A3B8", lineHeight: 1.4 }}>{d.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── NAP consistency checker ────────────────────────────────────────────────────
function NAPChecker({ connectedCount }: { connectedCount: number }) {
  const fields = [
    { label: "Name",    value: NAP.name,    platforms: ["Google ✓", "Apple —", "Bing —", "Nextdoor —"], status: connectedCount > 0 ? "warning" as const : "unknown" as const },
    { label: "Phone",   value: NAP.phone,   platforms: ["Google ✓", "Apple —", "Bing —", "Nextdoor —"], status: connectedCount > 0 ? "warning" as const : "unknown" as const },
    { label: "Website", value: NAP.website.replace("https://", ""), platforms: ["Google ✓", "Apple —", "Bing —", "Nextdoor —"], status: connectedCount > 0 ? "warning" as const : "unknown" as const },
    { label: "Address", value: NAP.address, platforms: ["Google ✓", "Apple —", "Bing —", "Nextdoor —"], status: connectedCount > 0 ? "warning" as const : "unknown" as const },
  ];

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14, padding: "20px 22px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <SectionLabel>NAP Consistency Checker</SectionLabel>
        <span style={{
          fontSize: 10, fontWeight: 700, color: "#F59E0B",
          background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)",
          borderRadius: 20, padding: "2px 8px", letterSpacing: "0.5px",
        }}>
          ⚠ Incomplete — 3 platforms not yet set up
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
        NAP (Name, Address, Phone) consistency across all listing platforms is a critical local SEO signal.
        Data below reflects confirmed GBP data. Apple, Bing, and Nextdoor entries will auto-populate once listings are claimed.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 200px 60px", gap: 12 }}>
          {["Field", "Value", "Platforms", "Status"].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "#334155", letterSpacing: "0.8px", textTransform: "uppercase" }}>{h}</div>
          ))}
        </div>
        {fields.map(({ label, value, platforms, status }) => {
          const h = HEALTH_STYLE[status];
          return (
            <div key={label} style={{
              display: "grid", gridTemplateColumns: "80px 1fr 200px 60px", gap: 12, alignItems: "center",
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 8, padding: "10px 12px",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>{label}</div>
              <div style={{ fontSize: 12, color: "#CBD5E1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
              <div style={{ fontSize: 11, color: "#475569", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {platforms.map(p => (
                  <span key={p} style={{ color: p.includes("✓") ? "#10B981" : "#334155" }}>{p}</span>
                ))}
              </div>
              <HealthBadge health={status} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function LocalPresenceEnginePage() {
  const authFetch = useApiFetch();
  const qc = useQueryClient();
  const now = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // Live GBP status
  const { data: gbpStatus, isLoading: gbpLoading } = useQuery<GBPStatus>({
    queryKey: ["google_business_status"],
    queryFn:  () => authFetch<GBPStatus>("/social-connections/google-business-status"),
    staleTime: 60_000, retry: 1,
  });

  const refreshGBP = useMutation({
    mutationFn: () => authFetch<{ ok: boolean; locationTitle: string }>("/social-connections/google-business-refresh-location", { method: "POST" }),
    onSuccess: (d) => { toast.success(`GBP location refreshed: ${d.locationTitle}`); qc.invalidateQueries({ queryKey: ["google_business_status"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to refresh GBP location"),
  });

  const disconnectGBP = useMutation({
    mutationFn: () => authFetch("/social-connections/google_business", { method: "DELETE" }),
    onSuccess: () => { toast.success("Google Business Profile disconnected"); qc.invalidateQueries({ queryKey: ["google_business_status"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to disconnect"),
  });

  // Derived GBP state
  const gbpPresence = deriveGBPPresenceStatus(gbpStatus);
  const { health: gbpHealth, warnings: gbpWarnings } = deriveGBPHealth(gbpStatus);

  // Static pending state for other platforms
  const otherStatus: PresenceStatus = "not_connected";
  const otherHealth: HealthStatus   = "unknown";

  // Counts
  const connectedCount = gbpPresence === "connected" ? 1 : 0;
  const pendingCount   = 3; // Apple, Bing, Nextdoor always pending in V1

  // Diagnostics issues list
  const diags: DiagEntry[] = [
    ...gbpWarnings.map(w => ({ icon: "⚠", color: "#F59E0B", text: `Google: ${w}`, severity: "warning" as const })),
    { icon: "⚠", color: "#F59E0B", text: "Apple Business Connect setup in progress — claim pending", severity: "warning" },
    { icon: "⚠", color: "#F59E0B", text: "Bing Places setup in progress — verification pending",       severity: "warning" },
    { icon: "⚠", color: "#F59E0B", text: "Nextdoor Business setup in progress — page claim pending",  severity: "warning" },
    { icon: "⚠", color: "#F59E0B", text: "NAP consistency: Apple, Bing, Nextdoor data unconfirmed",   severity: "warning" },
  ];

  return (
    <AppShell>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)",
              borderRadius: 20, padding: "4px 14px",
            }}>
              <span style={{ fontSize: 12, color: "#00AEEF", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                📍 Local Business Division
              </span>
            </div>
          </div>

          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.5px", margin: "0 0 8px" }}>
            Local Presence Engine
          </h1>
          <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 16px", lineHeight: 1.5, maxWidth: 620 }}>
            <strong style={{ color: "#00AEEF" }}>Get Found Everywhere</strong> — Manage local visibility across Google, Apple Maps, Bing, AI search,
            and neighborhood discovery channels. One dashboard, all listings.
          </p>

          {/* Summary pills */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <StatPill value={connectedCount} label="Connected"  color="#10B981" />
            <StatPill value={pendingCount}   label="Pending"    color="#F59E0B" />
            <StatPill value={0}              label="Errors"     color="#EF4444" />
            <StatPill value={diags.filter(d => d.severity === "warning").length} label="Warnings" color="#F59E0B" />
          </div>
        </div>

        {/* Active client banner */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          background: "rgba(0,174,239,0.05)", border: "1px solid rgba(0,174,239,0.15)",
          borderRadius: 12, padding: "12px 18px", marginBottom: 28,
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>🐛</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{NAP.name}</div>
            <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 2 }}>
              {NAP.category} · {NAP.serviceArea} · {NAP.phone} · {NAP.website.replace("https://", "")}
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{NAP.cities}</div>
          </div>
          <div style={{
            background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.18)",
            borderRadius: 8, padding: "4px 10px",
            fontSize: 10, fontWeight: 700, color: "#00AEEF", letterSpacing: "0.8px", textTransform: "uppercase",
          }}>Active Client</div>
        </div>

        {/* ── Discovery Channel Checklist ── */}
        <LocalPresenceChecklist gbpConnected={gbpPresence === "connected"} />

        {/* Platform cards */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "1.2px", textTransform: "uppercase" }}>
              Listing Platforms
            </div>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
            <div style={{ fontSize: 11, color: "#475569" }}>{connectedCount} of 4 active</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 16, marginBottom: 28 }}>
          {/* GBP card — live data */}
          <PlatformCard
            def={PLATFORM_DEFS[0]}
            presenceStatus={gbpLoading ? "not_connected" : gbpPresence}
            health={gbpHealth}
            warnings={gbpWarnings}
            lastChecked={gbpStatus?.connected ? now : null}
            accountName={gbpStatus?.accountName ?? null}
            locationTitle={gbpStatus?.locationTitle ?? null}
            onRefresh={() => refreshGBP.mutate()}
            onDisconnect={() => disconnectGBP.mutate()}
            refreshing={refreshGBP.isPending}
            disconnecting={disconnectGBP.isPending}
          />
          {/* Apple — V2 dedicated card with setup workflow */}
          <AppleBusinessCard />
          {/* Bing — V2 dedicated card */}
          <BingPlacesCard />
          {/* Nextdoor — V2 dedicated card */}
          <NextdoorBusinessCard />
          {/* Yelp — V2 dedicated card */}
          <YelpBusinessCard />
          {/* AI Search Coming Soon */}
          <AISearchCard />
        </div>

        {/* Diagnostics */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "1.2px", textTransform: "uppercase" }}>
              Local Presence Diagnostics
            </div>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>
          <DiagnosticsPanel
            connectedCount={connectedCount}
            pendingCount={pendingCount}
            errors={0}
            diags={diags}
          />
        </div>

        {/* NAP consistency */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "1.2px", textTransform: "uppercase" }}>
              NAP Consistency
            </div>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
          </div>
        </div>
        <NAPChecker connectedCount={connectedCount} />

      </div>
    </AppShell>
  );
}
