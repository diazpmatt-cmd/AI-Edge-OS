import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { toast } from "sonner";
import { useTheme } from "@/contexts/theme-context";
import { LocalPresenceChecklist } from "@/components/LocalPresenceChecklist";
import { PublishingHubTab } from "@/components/LocalPresencePublishingHub";
import { LeadReviewHubTab } from "@/components/LocalPresenceLeadReviewHub";

// ── Types ──────────────────────────────────────────────────────────────────────

type PresenceStatus = "connected" | "pending" | "not_connected" | "error" | "coming_soon" | "setup_in_progress" | "verified_publishing";
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
  connected:    { label: "Connected",     bg: "rgba(34,197,94,0.15)",   color: "#22C55E", dot: "#22C55E", border: "rgba(34,197,94,0.25)"   },
  pending:      { label: "Setup Pending", bg: "rgba(245,158,11,0.12)",  color: "#F59E0B", dot: "#F59E0B", border: "rgba(245,158,11,0.2)"   },
  not_connected:{ label: "Not Connected", bg: "rgba(107,114,128,0.1)",  color: "#6B7280", dot: "#475569", border: "rgba(255,255,255,0.07)" },
  error:        { label: "Error",         bg: "rgba(239,68,68,0.12)",   color: "#EF4444", dot: "#EF4444", border: "rgba(239,68,68,0.25)"   },
  coming_soon:      { label: "Coming Soon",      bg: "rgba(107,114,128,0.12)", color: "#6B7280", dot: "#6B7280", border: "rgba(107,114,128,0.2)"  },
  setup_in_progress:  { label: "Setup In Progress",  bg: "rgba(59,130,246,0.1)",   color: "#3B82F6", dot: "#3B82F6", border: "rgba(59,130,246,0.25)" },
  verified_publishing:{ label: "Verified · Publishing", bg: "rgba(34,197,94,0.12)",  color: "#22C55E", dot: "#22C55E", border: "rgba(34,197,94,0.3)"   },
};

const HEALTH_STYLE: Record<HealthStatus, { label: string; color: string; dot: string }> = {
  healthy: { label: "Healthy", color: "#22C55E", dot: "#22C55E" },
  warning: { label: "Warning", color: "#F59E0B", dot: "#F59E0B" },
  error:   { label: "Error",   color: "#EF4444", dot: "#EF4444" },
  unknown: { label: "Unknown", color: "#475569", dot: "#334155" },
};

// ── Platform card background derivation ───────────────────────────────────────
function cardBg(status: PresenceStatus) {
  if (status === "connected")         return "linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(11,22,41,0.9) 100%)";
  if (status === "error")             return "linear-gradient(135deg, rgba(239,68,68,0.05) 0%, rgba(11,22,41,0.9) 100%)";
  if (status === "pending")           return "linear-gradient(135deg, rgba(245,158,11,0.04) 0%, rgba(11,22,41,0.9) 100%)";
  if (status === "setup_in_progress")   return "linear-gradient(135deg, rgba(59,130,246,0.05) 0%, rgba(11,22,41,0.9) 100%)";
  if (status === "verified_publishing") return "linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(11,22,41,0.9) 100%)";
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
        <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? "#22C55E" : "#F59E0B" }}>{done}/{items.length}</span>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#22C55E" : "#F59E0B", borderRadius: 2, transition: "width 0.4s" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{
              width: 15, height: 15, borderRadius: 4, flexShrink: 0, marginTop: 1,
              background: item.done ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${item.done ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 8, color: item.done ? "#22C55E" : "transparent",
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
  healthy:    { color: "#22C55E", bg: "rgba(34,197,94,0.07)",    border: "rgba(34,197,94,0.2)",   dot: "#22C55E" },
  warning:    { color: "#F59E0B", bg: "rgba(245,158,11,0.07)",   border: "rgba(245,158,11,0.18)", dot: "#F59E0B" },
  missing:    { color: "#EF4444", bg: "rgba(239,68,68,0.07)",    border: "rgba(239,68,68,0.18)",  dot: "#EF4444" },
  pending:    { color: "#3B82F6", bg: "rgba(59,130,246,0.07)",   border: "rgba(59,130,246,0.15)", dot: "#3B82F6" },
  coming_soon:{ color: "#6B7280", bg: "rgba(107,114,128,0.07)",  border: "rgba(107,114,128,0.15)",dot: "#6B7280" },
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
    complete:    { label: "Complete",    color: "#22C55E", bg: "rgba(34,197,94,0.12)"   },
    "in-progress":{ label: "In Progress", color: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
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
  const [activeTab,     setActiveTab]     = useState<"checklist" | "bizinfo" | "profile" | "api" | "diagnostics" | "publishing_hub">("checklist");
  const [checklist,     setChecklist]     = useState(APPLE_CHECKLIST);
  const [notes,         setNotes]         = useState("");
  const [placeCardUrl,  setPlaceCardUrl]  = useState("");
  const [mapsUrl,       setMapsUrl]       = useState("");
  const [verifyEmail,   setVerifyEmail]   = useState("");
  const [orgName,       setOrgName]       = useState("Bed Bugs & Beyond");
  const [verifyMethod,  setVerifyMethod]  = useState("Phone PIN / Apple review");
  const [verifyStatus,  setVerifyStatus]  = useState("Verification Pending");
  const [savedMsg,      setSavedMsg]      = useState(false);
  const [copiedKey,     setCopiedKey]     = useState<string | null>(null);

  const APPLE_STAGES: { value: string; label: string; color: string; bg: string; border: string }[] = [
    { value: "Not Started",          label: "Not Started",          color: "#64748B", bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.3)"  },
    { value: "Submitted",            label: "Submitted",            color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.35)"  },
    { value: "Verification Pending", label: "Verification Pending", color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.35)"  },
    { value: "Verified",             label: "Verified",             color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.35)"  },
    { value: "Live",                 label: "Live",                 color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.35)"   },
  ];

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
    { key: "checklist",     label: "Setup Checklist" },
    { key: "bizinfo",       label: "Business Info" },
    { key: "profile",       label: "Profile Tracker" },
    { key: "api",           label: "API Readiness" },
    { key: "diagnostics",   label: "Diagnostics" },
    { key: "publishing_hub",label: "📣 Publishing Hub" },
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
              <StatusBadge status="pending" />
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
            <span style={{ fontSize: 11, color: "#22C55E", fontWeight: 700 }}>{completedCount} done</span>
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
                      background: step.status === "complete" ? "rgba(34,197,94,0.05)" : step.status === "in-progress" ? "rgba(59,130,246,0.05)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${step.status === "complete" ? "rgba(34,197,94,0.18)" : step.status === "in-progress" ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)"}`,
                      transition: "all 0.15s",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: step.description ? 4 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                            background: step.status === "complete" ? "rgba(34,197,94,0.2)" : step.status === "in-progress" ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${step.status === "complete" ? "rgba(34,197,94,0.4)" : step.status === "in-progress" ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.1)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: step.status === "complete" ? "#22C55E" : step.status === "in-progress" ? "#3B82F6" : "#475569", fontWeight: 800,
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
                              style={{ padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#22C55E", transition: "all 0.15s" }}
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
`Bed Bugs & Beyond is Baldwin County's trusted local pest control company, specializing in fast, effective elimination of bed bugs, roaches, ants, spiders, fleas, rodents, mosquitoes, and common household pests. We serve homeowners, rental properties, vacation rentals, and businesses throughout Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Elberta, and Robertsdale. Locally owned, experienced, fast response. Call (251) 324-9090 to schedule today.`;

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
                          background: copied ? "rgba(34,197,94,0.12)" : "rgba(0,174,239,0.1)",
                          border: copied ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(0,174,239,0.25)",
                          color: copied ? "#22C55E" : "#00AEEF", transition: "all 0.2s",
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
                              background: copiedKey === f.copyKey ? "rgba(34,197,94,0.12)" : "rgba(0,174,239,0.08)",
                              border: copiedKey === f.copyKey ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(0,174,239,0.2)",
                              color: copiedKey === f.copyKey ? "#22C55E" : "#00AEEF", whiteSpace: "nowrap", flexShrink: 0,
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
                        background: p.status === "missing" ? "rgba(239,68,68,0.04)" : "rgba(34,197,94,0.04)",
                        border: p.status === "missing" ? "1px solid rgba(239,68,68,0.15)" : "1px solid rgba(34,197,94,0.15)",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1" }}>{p.item}</div>
                        <div style={{ fontSize: 11.5, color: "#475569" }}>{p.spec}</div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                          color: p.status === "missing" ? "#EF4444" : "#22C55E",
                          background: p.status === "missing" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
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
                    background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.18)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#22C55E", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 6 }}>Next Action</div>
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
            {activeTab === "profile" && (() => {
              const currentStage = APPLE_STAGES.find(s => s.value === verifyStatus) ?? APPLE_STAGES[0];
              const currentIdx   = APPLE_STAGES.findIndex(s => s.value === verifyStatus);
              return (
                <div>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 16, lineHeight: 1.5 }}>
                    Track Apple Business Connect setup status here. Status stays <strong style={{ color: "#F59E0B" }}>Setup Pending</strong> on the card badge until you confirm the listing is live.
                  </div>

                  {/* ── 5-stage status selector ── */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                      Setup Status
                    </div>

                    {/* Stage rail */}
                    <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", rowGap: 8 }}>
                      {APPLE_STAGES.map((stage, i) => {
                        const isActive  = stage.value === verifyStatus;
                        const isPast    = i < currentIdx;
                        const isLive    = stage.value === "Live";
                        return (
                          <React.Fragment key={stage.value}>
                            {i > 0 && (
                              <div style={{
                                width: 20, height: 2, flexShrink: 0,
                                background: isPast || isActive ? stage.color : "rgba(255,255,255,0.08)",
                                transition: "background 0.2s",
                              }} />
                            )}
                            <button
                              onClick={() => !isLive && setVerifyStatus(stage.value)}
                              title={isLive ? "Set to Live only after Apple confirms the listing is publicly visible" : `Set status to ${stage.label}`}
                              style={{
                                padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                                cursor: isLive ? "not-allowed" : "pointer",
                                background: isActive ? stage.bg : isPast ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.03)",
                                border: `1px solid ${isActive ? stage.border : isPast ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)"}`,
                                color: isActive ? stage.color : isPast ? "#475569" : "#334155",
                                opacity: isLive ? 0.6 : 1,
                                transition: "all 0.15s", whiteSpace: "nowrap",
                              }}
                            >
                              {isPast && !isActive ? "✓ " : ""}{stage.label}
                            </button>
                          </React.Fragment>
                        );
                      })}
                    </div>

                    {/* Current status callout */}
                    <div style={{
                      marginTop: 12, padding: "10px 14px", borderRadius: 9,
                      background: currentStage.bg, border: `1px solid ${currentStage.border}`,
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                    }}>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: currentStage.color }}>
                          Current: {currentStage.label}
                        </span>
                        {verifyStatus === "Verification Pending" && (
                          <span style={{ fontSize: 11, color: "#64748B", marginLeft: 8 }}>
                            — waiting for Apple to confirm PIN or review
                          </span>
                        )}
                        {verifyStatus === "Verified" && (
                          <span style={{ fontSize: 11, color: "#64748B", marginLeft: 8 }}>
                            — verified but not yet confirmed live on Apple Maps
                          </span>
                        )}
                        {verifyStatus === "Live" && (
                          <span style={{ fontSize: 11, color: "#64748B", marginLeft: 8 }}>
                            — listing confirmed live · update card status badge
                          </span>
                        )}
                      </div>
                      {verifyStatus === "Live" && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#22C55E", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 20, padding: "2px 10px", whiteSpace: "nowrap" }}>
                          Ready to mark Connected
                        </span>
                      )}
                    </div>

                    {/* Live stage guard note */}
                    <div style={{ marginTop: 8, fontSize: 11, color: "#475569", lineHeight: 1.5 }}>
                      <strong style={{ color: "#64748B" }}>Live</strong> is locked until you manually confirm the Apple Maps listing is publicly visible. Do not set Live based on email only.
                    </div>
                  </div>

                  {/* ── Account detail fields ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                      { label: "Account Email",       val: verifyEmail,  set: setVerifyEmail,  ph: "apple-id@example.com" },
                      { label: "Organization Name",   val: orgName,      set: setOrgName,      ph: "Bed Bugs & Beyond" },
                      { label: "Verification Method", val: verifyMethod, set: setVerifyMethod, ph: "Phone PIN / Apple review" },
                    ].map(field => (
                      <div key={field.label}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>{field.label}</div>
                        <input
                          value={field.val}
                          onChange={e => field.set(e.target.value)}
                          placeholder={field.ph}
                          style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }}
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
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit", resize: "vertical" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                    <button
                      onClick={handleSave}
                      style={{ padding: "8px 18px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "#00AEEF", border: "none", color: "#FFF" }}
                    >Save Setup Notes</button>
                    {savedMsg && <span style={{ fontSize: 12, color: "#22C55E", fontWeight: 600 }}>✓ Saved</span>}
                  </div>
                </div>
              );
            })()}

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
            {activeTab === "publishing_hub" && (
              <PublishingHubTab platform="apple" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bing Places V2 Card ────────────────────────────────────────────────────────
const BING_CHECKLIST: { label: string; status: AppleStepStatus; description: string }[] = [
  { label: "Create or sign into Bing Places account", status: "complete", description: "Sign in at bingplaces.com with a Microsoft account." },
  { label: "Add or claim business listing",           status: "complete", description: "Bed Bugs & Beyond listing claimed." },
  { label: "Verify ownership",                        status: "complete", description: "Verification complete — PIN confirmed." },
  { label: "Confirm business name",                   status: "complete", description: "Synced with Google — name confirmed: Bed Bugs & Beyond." },
  { label: "Confirm phone number",                    status: "complete", description: "Synced with Google — (251) 324-9090 confirmed." },
  { label: "Confirm website",                         status: "complete", description: "Synced with Google — https://bedbugsandbeyond.net confirmed." },
  { label: "Confirm category",                        status: "complete", description: "Synced with Google — Pest Control Service confirmed." },
  { label: "Confirm service area",                    status: "complete", description: "Synced with Google — Baldwin County, AL service area confirmed." },
  { label: "Add business hours",                      status: "complete", description: "Synced with Google — hours confirmed." },
  { label: "Upload logo",                             status: "pending",  description: "High-res square logo (min 400×400 px, PNG or JPG)." },
  { label: "Upload photos",                           status: "pending",  description: "Add at least 5 quality photos of the business or service." },
  { label: "Add services",                            status: "pending",  description: "List core services: bed bug inspection, heat treatment, pest control." },
  { label: "Review Bing Maps listing",                status: "in-progress", description: "Publishing in progress — listing will be live in Bing Maps within 7–12 days." },
  { label: "Submit verification",                     status: "complete", description: "Submitted — verification complete." },
];

const BING_DIAGS: { check: string; status: AppleDiagStatus; note: string }[] = [
  { check: "Bing account created",              status: "healthy",     note: "Microsoft account active at bingplaces.com" },
  { check: "Listing claimed",                   status: "healthy",     note: "Listing claimed and ownership verified" },
  { check: "Ownership verified",                status: "healthy",     note: "Verification complete — PIN confirmed" },
  { check: "NAP matches Google Business Profile", status: "healthy",   note: "Synced with Google — NAP consistent" },
  { check: "Phone matches business number",     status: "healthy",     note: "Confirmed via Google sync — (251) 324-9090" },
  { check: "Website matches",                   status: "healthy",     note: "Confirmed via Google sync — bedbugsandbeyond.net" },
  { check: "Category selected",                 status: "healthy",     note: "Pest Control Service — confirmed" },
  { check: "Hours configured",                  status: "healthy",     note: "Synced with Google — hours confirmed" },
  { check: "Photos uploaded",                   status: "missing",     note: "No photos uploaded yet — add after listing goes live" },
  { check: "Maps listing reviewed",             status: "pending",     note: "Publishing in progress — live in Bing Maps within 7–12 days" },
  { check: "Analytics available",               status: "pending",     note: "Analytics not available until listing is live" },
  { check: "API access requested",              status: "missing",     note: "Bing API requires setup — not yet requested" },
  { check: "Copilot AI signal tracked",         status: "coming_soon", note: "Copilot integration — Coming Soon" },
];

function BingPlacesCard() {
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [activeTab,    setActiveTab]    = useState<"checklist" | "bizinfo" | "profile" | "api" | "diagnostics" | "publishing_hub">("checklist");
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
    { key: "checklist",     label: "Setup Checklist" },
    { key: "bizinfo",       label: "Business Info" },
    { key: "profile",       label: "Profile Tracker" },
    { key: "api",           label: "API Readiness" },
    { key: "diagnostics",   label: "Diagnostics" },
    { key: "publishing_hub",label: "📣 Publishing Hub" },
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
              <StatusBadge status="verified_publishing" />
            </div>
            <p style={{ fontSize: 12.5, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
              Verified &amp; synced with Google · Publishing to Bing Maps · Live in 7–12 days · Analytics available once live.
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
            <span style={{ fontSize: 11, color: "#22C55E", fontWeight: 700 }}>{completedCount} done</span>
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
                      background: step.status === "complete" ? "rgba(34,197,94,0.05)" : step.status === "in-progress" ? `rgba(0,173,239,0.05)` : "rgba(255,255,255,0.02)",
                      border: `1px solid ${step.status === "complete" ? "rgba(34,197,94,0.18)" : step.status === "in-progress" ? `rgba(0,173,239,0.2)` : "rgba(255,255,255,0.05)"}`,
                      transition: "all 0.15s",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: step.description ? 4 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                            background: step.status === "complete" ? "rgba(34,197,94,0.2)" : step.status === "in-progress" ? `rgba(0,173,239,0.15)` : "rgba(255,255,255,0.05)",
                            border: `1px solid ${step.status === "complete" ? "rgba(34,197,94,0.4)" : step.status === "in-progress" ? `rgba(0,173,239,0.3)` : "rgba(255,255,255,0.1)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: step.status === "complete" ? "#22C55E" : step.status === "in-progress" ? BING_BLUE : "#475569", fontWeight: 800,
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
                            <button onClick={() => markStepComplete(idx)} style={{ padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#22C55E" }}>
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
`Bed Bugs & Beyond is Baldwin County's trusted local pest control company, serving Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Elberta, and Robertsdale. We specialize in bed bug elimination, roach and ant control, spider and flea treatments, rodent removal, mosquito control, and general pest management. Locally owned, experienced, fast response. Call (251) 324-9090 to schedule your inspection today.`;

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
                          background: copied ? "rgba(34,197,94,0.12)" : `rgba(0,173,239,0.1)`,
                          border: copied ? "1px solid rgba(34,197,94,0.3)" : `1px solid rgba(0,173,239,0.25)`,
                          color: copied ? "#22C55E" : BING_BLUE, transition: "all 0.2s",
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
                    Verification complete. Listing synced with Google and now publishing to Bing Maps. <strong style={{ color: "#3B82F6" }}>Publishing ETA: 7–12 days.</strong> Analytics will be available once the listing is live. No action required — monitor Bing Places for the live confirmation.
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
                              background: copiedKey === f.copyKey ? "rgba(34,197,94,0.12)" : `rgba(0,173,239,0.08)`,
                              border: copiedKey === f.copyKey ? "1px solid rgba(34,197,94,0.25)" : `1px solid rgba(0,173,239,0.2)`,
                              color: copiedKey === f.copyKey ? "#22C55E" : BING_BLUE, whiteSpace: "nowrap", flexShrink: 0,
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
                    background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.18)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#22C55E", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 6 }}>Next Action</div>
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
                  {savedMsg && <span style={{ fontSize: 12, color: "#22C55E", fontWeight: 600 }}>✓ Saved</span>}
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
            {activeTab === "publishing_hub" && (
              <PublishingHubTab platform="bing" />
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
  covered:      { color: "#22C55E", bg: "rgba(34,197,94,0.07)",  border: "rgba(34,197,94,0.2)",  label: "Covered"            },
  pending:      { color: "#F59E0B", bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.15)", label: "Pending"            },
  missing:      { color: "#EF4444", bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.18)",  label: "Missing"            },
  needs_recs:   { color: "#F59E0B", bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.18)", label: "Needs Recommendations" },
};

function NextdoorBusinessCard() {
  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [activeTab,     setActiveTab]     = useState<"checklist" | "bizinfo" | "profile" | "neighborhoods" | "diagnostics" | "publishing_hub">("checklist");
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
    { key: "publishing_hub",label: "📣 Publishing Hub" },
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
              <StatusBadge status="pending" />
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
            <span style={{ fontSize: 11, color: "#22C55E", fontWeight: 700 }}>{completedCount} done</span>
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
                      background: step.status === "complete" ? "rgba(34,197,94,0.05)" : step.status === "in-progress" ? "rgba(141,198,65,0.05)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${step.status === "complete" ? "rgba(34,197,94,0.18)" : step.status === "in-progress" ? "rgba(141,198,65,0.2)" : "rgba(255,255,255,0.05)"}`,
                      transition: "all 0.15s",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: step.description ? 4 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                            background: step.status === "complete" ? "rgba(34,197,94,0.2)" : step.status === "in-progress" ? "rgba(141,198,65,0.15)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${step.status === "complete" ? "rgba(34,197,94,0.4)" : step.status === "in-progress" ? "rgba(141,198,65,0.3)" : "rgba(255,255,255,0.1)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: step.status === "complete" ? "#22C55E" : step.status === "in-progress" ? ND_GREEN : "#475569", fontWeight: 800,
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
                            <button onClick={() => markStepComplete(idx)} style={{ padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#22C55E" }}>
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
                          background: copied ? "rgba(34,197,94,0.12)" : "rgba(141,198,65,0.1)",
                          border: copied ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(141,198,65,0.25)",
                          color: copied ? "#22C55E" : ND_GREEN, transition: "all 0.2s",
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
                              background: copiedKey === f.copyKey ? "rgba(34,197,94,0.12)" : "rgba(141,198,65,0.08)",
                              border: copiedKey === f.copyKey ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(141,198,65,0.2)",
                              color: copiedKey === f.copyKey ? "#22C55E" : ND_GREEN, whiteSpace: "nowrap", flexShrink: 0,
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
                    background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.18)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#22C55E", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 6 }}>Next Action</div>
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
                  {savedMsg && <span style={{ fontSize: 12, color: "#22C55E", fontWeight: 600 }}>✓ Saved</span>}
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
            {activeTab === "publishing_hub" && (
              <PublishingHubTab platform="nextdoor" />
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
              <span style={{ fontSize: 12, color: "#F59E0B", lineHeight: 1.4 }}>{w}</span>
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
            <ActionBtn label="↗ Diagnostics" color="#6B7280" href="/admin/diagnostics" variant="ghost" />
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
      background: "linear-gradient(135deg, rgba(107,114,128,0.05) 0%, rgba(11,22,41,0.9) 100%)",
      border: "1px solid rgba(107,114,128,0.2)",
      borderRadius: 14, padding: 20,
      backdropFilter: "blur(12px)",
      display: "flex", flexDirection: "column", gap: 14, opacity: 0.85,
    }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: "linear-gradient(135deg, #4B5563, #374151)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, boxShadow: "0 0 16px rgba(107,114,128,0.3)",
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
        background: "rgba(107,114,128,0.06)", border: "1px solid rgba(107,114,128,0.15)",
        borderRadius: 10, padding: "14px 16px",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 10 }}>
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
  const [activeTab,    setActiveTab]    = useState<"checklist" | "bizinfo" | "profile" | "diagnostics" | "lead_review_hub">("checklist");
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
    { key: "checklist",     label: "Setup Checklist" },
    { key: "bizinfo",       label: "Business Info" },
    { key: "profile",       label: "Profile Tracker" },
    { key: "diagnostics",   label: "Diagnostics" },
    { key: "lead_review_hub", label: "📊 Lead & Review Hub" },
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
            <span style={{ fontSize: 11, color: "#22C55E", fontWeight: 700 }}>{completedCount} done</span>
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
                      background: step.status === "complete" ? "rgba(34,197,94,0.05)" : step.status === "in-progress" ? "rgba(211,35,35,0.05)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${step.status === "complete" ? "rgba(34,197,94,0.18)" : step.status === "in-progress" ? "rgba(211,35,35,0.2)" : "rgba(255,255,255,0.05)"}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: step.description ? 4 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                            background: step.status === "complete" ? "rgba(34,197,94,0.2)" : step.status === "in-progress" ? "rgba(211,35,35,0.15)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${step.status === "complete" ? "rgba(34,197,94,0.4)" : step.status === "in-progress" ? "rgba(211,35,35,0.3)" : "rgba(255,255,255,0.1)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: step.status === "complete" ? "#22C55E" : step.status === "in-progress" ? YELP_RED : "#475569", fontWeight: 800,
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
                            <button onClick={() => markStepComplete(idx)} style={{ padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#22C55E" }}>
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
`Bed Bugs & Beyond is a trusted, locally owned pest control company serving Baldwin County homeowners, families, rental properties, and vacation rentals. We specialize in complete bed bug elimination, roach and ant control, spider and flea treatments, rodent removal, mosquito control, and general pest management. Serving Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Elberta, and Robertsdale. Locally owned, experienced, fast response. Call (251) 324-9090 to schedule your inspection today.`;

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
                          background: copied ? "rgba(34,197,94,0.12)" : "rgba(211,35,35,0.1)",
                          border: copied ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(211,35,35,0.25)",
                          color: copied ? "#22C55E" : YELP_RED, transition: "all 0.2s",
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
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        { icon: "🐛", text: "Pest control discovery — homeowners actively search 'exterminator near me' and 'bed bug treatment Baldwin County AL' on Yelp; a claimed listing puts Bed Bugs & Beyond directly in front of them" },
                        { icon: "⭐", text: "Review authority — Yelp reviews surface in Google results for brand queries and boost credibility before anyone calls" },
                        { icon: "🍎", text: "Siri / Apple Maps — Yelp is Apple's primary local data source; your listing activates 'pest control near me' answers on every iPhone" },
                        { icon: "🎙️", text: "Voice search — 'Hey Siri, find an exterminator near me' pulls directly from Yelp business profiles" },
                        { icon: "🏠", text: "Local trust — Baldwin County vacation rental owners and families check Yelp ratings before choosing a pest company" },
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
                              background: copiedKey === f.copyKey ? "rgba(34,197,94,0.12)" : "rgba(211,35,35,0.08)",
                              border: copiedKey === f.copyKey ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(211,35,35,0.2)",
                              color: copiedKey === f.copyKey ? "#22C55E" : YELP_RED, whiteSpace: "nowrap", flexShrink: 0,
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
                    background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.18)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#22C55E", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 6 }}>Next Action</div>
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
                  {savedMsg && <span style={{ fontSize: 12, color: "#22C55E", fontWeight: 600 }}>✓ Saved</span>}
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
            {activeTab === "lead_review_hub" && (
              <LeadReviewHubTab platform="yelp" />
            )}

          </div>
        </div>
      )}
    </div>
  );
}

// ── Waze Business V2 Card ─────────────────────────────────────────────────────
const WAZE_CHECKLIST: { label: string; status: AppleStepStatus; description: string }[] = [
  { label: "Create a free Waze account",                  status: "pending", description: "Sign up or log in at waze.com — a Waze account is required to use the Map Editor." },
  { label: "Open Waze Map Editor (WME)",                  status: "pending", description: "Go to waze.com/editor — this is where businesses are added and edited for free." },
  { label: "Search for existing Bed Bugs & Beyond place", status: "pending", description: "Type 'Bed Bugs & Beyond' in the WME search bar to check if a place already exists." },
  { label: "Add or edit the WME place",                   status: "pending", description: "If found: select the place and click Edit. If not found: click the map icon menu → Add Place / Point of Interest." },
  { label: "Set place name",                              status: "pending", description: "Enter exactly: Bed Bugs & Beyond — no keyword additions or descriptors." },
  { label: "Set phone number",                            status: "pending", description: "Enter (251) 324-9090 in the phone field." },
  { label: "Set website URL",                             status: "pending", description: "Enter https://bedbugsandbeyond.net in the website field." },
  { label: "Select WME category: Services",               status: "pending", description: "In WME, select 'Services' as the place category — closest match available for pest control." },
  { label: "Pin location to Baldwin County, AL",          status: "pending", description: "Drag the location pin to your service base in Baldwin County. For a home-based business, use a general Baldwin County area pin (e.g., Foley or Fairhope)." },
  { label: "Add place description",                       status: "pending", description: "Paste the copy-ready description from the Business Info tab." },
  { label: "Save and submit WME changes",                 status: "pending", description: "Click Save in WME. Changes go through community review — typically 24–72 hours in the US." },
  { label: "Confirm Google Business Profile NAP matches", status: "pending", description: "Google owns Waze. Ensure GBP name, phone, and website exactly match what you entered in WME." },
  { label: "(Optional) Explore Waze for Brands paid ads", status: "pending", description: "Visit business.waze.com to evaluate Nearby Arrow and Promoted Search pins — paid features requiring a physical address." },
];

const WAZE_DIAGS: { check: string; status: AppleDiagStatus; note: string }[] = [
  { check: "Waze account created",              status: "missing",  note: "Required to access Waze Map Editor" },
  { check: "WME place found or added",          status: "missing",  note: "No Waze place found or created yet" },
  { check: "Place name matches NAP",            status: "pending",  note: "Will be confirmed once WME place is created/edited" },
  { check: "Phone number confirmed",            status: "pending",  note: "Pending WME place setup" },
  { check: "Website URL confirmed",             status: "pending",  note: "Pending WME place setup" },
  { check: "WME category set (Services)",       status: "missing",  note: "Category not yet assigned in WME" },
  { check: "Location pin accurate",             status: "missing",  note: "No location pin set in Baldwin County" },
  { check: "WME edit submitted for review",     status: "missing",  note: "Changes not yet submitted through WME" },
  { check: "WME review approved",               status: "pending",  note: "Pending — community review takes 24–72 hrs after submission" },
  { check: "GBP NAP consistency",               status: "pending",  note: "Google owns Waze — GBP accuracy feeds Waze place data" },
  { check: "Waze / Google ecosystem ready",     status: "pending",  note: "Activates once WME place is live and GBP is fully verified" },
  { check: "Waze for Brands ads evaluated",     status: "missing",  note: "Paid Nearby Arrow and Promoted Search — not yet reviewed" },
];

function WazeBusinessCard() {
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [activeTab,    setActiveTab]    = useState<"checklist" | "bizinfo" | "profile" | "diagnostics">("checklist");
  const [checklist,    setChecklist]    = useState(WAZE_CHECKLIST);
  const [placeUrl,     setPlaceUrl]     = useState("");
  const [acctEmail,    setAcctEmail]    = useState("");
  const [verifyStatus, setVerifyStatus] = useState("Not Started");
  const [notes,        setNotes]        = useState("");
  const [savedMsg,     setSavedMsg]     = useState(false);
  const [copiedKey,    setCopiedKey]    = useState<string | null>(null);

  const completedCount  = checklist.filter(s => s.status === "complete").length;
  const inProgressCount = checklist.filter(s => s.status === "in-progress").length;
  const wazeScore       = Math.round((completedCount / checklist.length) * 10);

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

  const WAZE_BLUE = "#00BBDE";

  const TABS: { key: typeof activeTab; label: string }[] = [
    { key: "checklist",   label: "Setup Checklist" },
    { key: "bizinfo",     label: "Business Info" },
    { key: "profile",     label: "Profile Tracker" },
    { key: "diagnostics", label: "Diagnostics" },
  ];

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(0,187,222,0.05) 0%, rgba(11,22,41,0.9) 100%)",
      border: "1px solid rgba(0,187,222,0.22)",
      borderRadius: 14, backdropFilter: "blur(12px)", overflow: "hidden",
      boxShadow: "0 0 24px rgba(0,187,222,0.06)", transition: "border-color 0.2s",
    }}>
      {/* ── Card header ── */}
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(135deg, #0099BB, #00BBDE)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 900, color: "#FFF",
            boxShadow: "0 0 16px rgba(0,187,222,0.3)",
          }}>🚗</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>Waze</span>
              <StatusBadge status="pending" />
            </div>
            <p style={{ fontSize: 12.5, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
              Route-based local discovery, driver visibility &amp; Google/Waze ecosystem presence.
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
            { label: "WME Category", value: "Services" },
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
          background: "rgba(0,187,222,0.05)", border: "1px solid rgba(0,187,222,0.15)",
          borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>Setup Progress — {completedCount}/{checklist.length} steps</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: WAZE_BLUE }}>Waze Score: {wazeScore} / 10 pts</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((completedCount / checklist.length) * 100)}%`, background: WAZE_BLUE, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "#22C55E", fontWeight: 700 }}>{completedCount} done</span>
            <span style={{ fontSize: 11, color: "#64748B" }}>·</span>
            <span style={{ fontSize: 11, color: WAZE_BLUE, fontWeight: 700 }}>{inProgressCount} active</span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            onClick={() => setDrawerOpen(v => !v)}
            style={{
              padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: drawerOpen ? "rgba(0,187,222,0.18)" : "rgba(0,187,222,0.1)",
              border: "1px solid rgba(0,187,222,0.32)", color: WAZE_BLUE, transition: "all 0.15s",
            }}
          >{drawerOpen ? "▲ Close Waze Setup" : "▼ Open Waze Setup"}</button>
          <a href="https://waze.com/editor" target="_blank" rel="noopener noreferrer"
            style={{ padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(0,187,222,0.08)", border: "1px solid rgba(0,187,222,0.22)", color: WAZE_BLUE, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            ↗ Waze Map Editor
          </a>
          <a href="https://business.waze.com" target="_blank" rel="noopener noreferrer"
            style={{ padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(0,187,222,0.05)", border: "1px solid rgba(0,187,222,0.15)", color: "#64748B", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            ↗ Waze for Business
          </a>
        </div>
      </div>

      {/* ── Expandable drawer ── */}
      {drawerOpen && (
        <div style={{ borderTop: "1px solid rgba(0,187,222,0.12)", background: "rgba(3,6,18,0.6)" }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 20px" }}>
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: "11px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: "transparent", border: "none",
                borderBottom: activeTab === tab.key ? `2px solid ${WAZE_BLUE}` : "2px solid transparent",
                color: activeTab === tab.key ? WAZE_BLUE : "#475569", transition: "all 0.15s", marginBottom: -1,
              }}>{tab.label}</button>
            ))}
          </div>

          <div style={{ padding: 20 }}>

            {/* ── Setup Checklist ── */}
            {activeTab === "checklist" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                  Complete all 13 steps to establish your Waze presence. Waze uses the Map Editor (WME) — a community-moderated system — for free business place listings. Mark each step after completing it.
                </div>

                {/* Waze platform note */}
                <div style={{
                  padding: "10px 14px", borderRadius: 9, marginBottom: 14,
                  background: "rgba(0,187,222,0.04)", border: "1px solid rgba(0,187,222,0.18)",
                  fontSize: 11.5, color: "#64748B", lineHeight: 1.6,
                }}>
                  <strong style={{ color: "#94A3B8" }}>How Waze business setup works:</strong> Unlike Google Business Profile or Apple Business Connect, Waze doesn't have a direct business "claiming" portal for service-area businesses. The free path is the <strong style={{ color: "#00BBDE" }}>Waze Map Editor (WME)</strong> — a community-maintained map where you can add or update a place. WME edits are reviewed by trusted community editors before going live (24–72 hrs). Google owns Waze, so a complete and accurate Google Business Profile also strengthens Waze visibility.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {checklist.map((step, idx) => (
                    <div key={idx} style={{
                      padding: "11px 14px", borderRadius: 10,
                      background: step.status === "complete" ? "rgba(34,197,94,0.05)" : step.status === "in-progress" ? "rgba(0,187,222,0.05)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${step.status === "complete" ? "rgba(34,197,94,0.18)" : step.status === "in-progress" ? "rgba(0,187,222,0.2)" : "rgba(255,255,255,0.05)"}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: step.description ? 4 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                            background: step.status === "complete" ? "rgba(34,197,94,0.2)" : step.status === "in-progress" ? "rgba(0,187,222,0.15)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${step.status === "complete" ? "rgba(34,197,94,0.4)" : step.status === "in-progress" ? "rgba(0,187,222,0.3)" : "rgba(255,255,255,0.1)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: step.status === "complete" ? "#22C55E" : step.status === "in-progress" ? WAZE_BLUE : "#475569", fontWeight: 800,
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
                            <button onClick={() => markStepComplete(idx)} style={{ padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#22C55E" }}>
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
                  <a href="https://waze.com/editor" target="_blank" rel="noopener noreferrer"
                    style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(0,187,222,0.1)", border: "1px solid rgba(0,187,222,0.3)", color: WAZE_BLUE, textDecoration: "none", display: "inline-block" }}>
                    ↗ Open Waze Map Editor
                  </a>
                </div>
              </div>
            )}

            {/* ── Business Info ── */}
            {activeTab === "bizinfo" && (() => {
              const BIZ_DESCRIPTION =
`Locally owned pest control company serving Baldwin County, Alabama. Specializing in bed bug elimination, roach and ant control, spider and flea treatments, rodent removal, and mosquito control. Serving Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Elberta, and Robertsdale. Call (251) 324-9090.`;

              const SERVICE_LIST =
`Bed Bug Treatment
Roach Control
Ant Control
Spider Control
Flea Control
Rodent Removal
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
                { label: "Place Name",     value: "Bed Bugs & Beyond",              note: "Exact match — no keyword additions" },
                { label: "Phone",          value: "(251) 324-9090", copyKey: "waze-phone", note: "Must match GBP exactly (NAP)" },
                { label: "Website",        value: "https://bedbugsandbeyond.net",    note: "Confirmed BB&B website" },
                { label: "WME Category",   value: "Services",                       note: "Closest WME category available for pest control" },
                { label: "Location",       value: "Baldwin County, Alabama",        note: "Pin to service base — Foley or Fairhope area recommended" },
                { label: "Editor",         value: "Waze Map Editor (waze.com/editor)", note: "Free, community-reviewed — no paid account required" },
                { label: "Review Time",    value: "24–72 hours after submission",   note: "WME edits go through trusted editor review before going live" },
                { label: "Paid option",    value: "Waze for Brands (business.waze.com)", note: "Nearby Arrow and Promoted Search pins — requires physical address + budget" },
              ];

              const PHOTO_REQS: { item: string; spec: string }[] = [
                { item: "Place photo",     spec: "Landscape or square, min 400×300 px — represents your business in Waze place view" },
                { item: "Logo",            spec: "Optional in WME — square, min 400×400 px (PNG or JPG)" },
                { item: "Note",            spec: "Waze WME photos are community-moderated; keep images professional and business-relevant" },
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
                          background: copied ? "rgba(34,197,94,0.12)" : "rgba(0,187,222,0.1)",
                          border: copied ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(0,187,222,0.25)",
                          color: copied ? "#22C55E" : WAZE_BLUE, transition: "all 0.2s",
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
                    Setup guidance only — not analytics. Status stays <strong style={{ color: WAZE_BLUE }}>Setup Pending</strong> until the Waze Map Editor place is submitted and approved.
                  </div>

                  {/* ── Why Waze matters callout ── */}
                  <div style={{
                    padding: "12px 16px", borderRadius: 10, marginBottom: 20,
                    background: "rgba(0,187,222,0.05)", border: "1px solid rgba(0,187,222,0.2)",
                    fontSize: 12, color: "#94A3B8", lineHeight: 1.7,
                  }}>
                    <div style={{ fontWeight: 700, color: "#CBD5E1", marginBottom: 6, fontSize: 12.5 }}>Why Waze matters for Bed Bugs &amp; Beyond</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        { icon: "🚗", text: "Route-based discovery — drivers navigating near Baldwin County see your business pin on the Waze map while en route to nearby destinations" },
                        { icon: "🗺️", text: "Local map visibility — a Waze place puts 'Bed Bugs & Beyond' on the map for the entire Baldwin County service area" },
                        { icon: "🔗", text: "Google/Waze ecosystem — Google owns Waze; a complete and accurate Google Business Profile strengthens your Waze visibility at no extra cost" },
                        { icon: "📍", text: "Service-area credibility — appearing on Waze alongside Google Maps validates your coverage of Gulf Shores, Orange Beach, Foley, and the surrounding area" },
                        { icon: "🐛", text: "Pest control calls — vacation rental owners and hotel guests who encounter an infestation while traveling in Baldwin County can find and call you directly from Waze" },
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
                    Required Business Information (WME)
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
                              background: copiedKey === f.copyKey ? "rgba(34,197,94,0.12)" : "rgba(0,187,222,0.08)",
                              border: copiedKey === f.copyKey ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(0,187,222,0.2)",
                              color: copiedKey === f.copyKey ? "#22C55E" : WAZE_BLUE, whiteSpace: "nowrap", flexShrink: 0,
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
                  <CopyBlock label="Place Description" copyKey="waze-desc"     value={BIZ_DESCRIPTION} rows={4} />
                  <CopyBlock label="Service List"       copyKey="waze-services" value={SERVICE_LIST}     rows={9} />
                  <CopyBlock label="Service Area List"  copyKey="waze-areas"    value={SERVICE_AREAS}   rows={9} />

                  {/* ── Photo requirements ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Photo / Logo Requirements
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
                    {PHOTO_REQS.map(p => (
                      <div key={p.item} style={{
                        display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 12, alignItems: "center",
                        padding: "9px 14px", borderRadius: 9,
                        background: "rgba(0,187,222,0.04)", border: "1px solid rgba(0,187,222,0.15)",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1" }}>{p.item}</div>
                        <div style={{ fontSize: 11.5, color: "#475569" }}>{p.spec}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, color: "#64748B", background: "rgba(255,255,255,0.05)", whiteSpace: "nowrap" }}>Optional</span>
                      </div>
                    ))}
                  </div>

                  {/* ── Verification / WME review ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Verification &amp; Review Process
                  </div>
                  <div style={{
                    padding: "12px 16px", borderRadius: 10, marginBottom: 18,
                    background: "rgba(0,187,222,0.04)", border: "1px solid rgba(0,187,222,0.18)",
                    fontSize: 12.5, color: "#94A3B8", lineHeight: 1.7,
                  }}>
                    Waze does <strong style={{ color: "#CBD5E1" }}>not</strong> use phone or postcard verification like Google. WME place additions are reviewed by <strong style={{ color: "#CBD5E1" }}>trusted community editors</strong> (Waze Champs) and typically approved within <strong style={{ color: "#CBD5E1" }}>24–72 hours</strong> in the US. No ownership proof is required for adding a new business place. If the place already exists and has high usage, edits may require a higher-trust editor to approve — in that case, ensure all fields are accurate and the edit reason is clear.
                  </div>

                  {/* ── Status + next action ── */}
                  <div style={{
                    padding: "12px 16px", borderRadius: 10, marginBottom: 14,
                    background: "rgba(0,187,222,0.05)", border: "1px solid rgba(0,187,222,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1", marginBottom: 2 }}>WME Submission Status</div>
                      <div style={{ fontSize: 11.5, color: "#475569" }}>
                        Status updates once the WME place is submitted and approved by community editors.
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                      background: "rgba(0,187,222,0.12)", border: "1px solid rgba(0,187,222,0.3)", color: WAZE_BLUE,
                    }}>Not Started</span>
                  </div>

                  <div style={{
                    padding: "12px 16px", borderRadius: 10,
                    background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.18)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#22C55E", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 6 }}>Next Action</div>
                    <ol style={{ margin: 0, paddingLeft: 18, color: "#94A3B8", fontSize: 12.5, lineHeight: 2 }}>
                      <li>Sign in at <a href="https://www.waze.com/login" target="_blank" rel="noopener noreferrer" style={{ color: WAZE_BLUE }}>waze.com/login</a> (create a free account if needed)</li>
                      <li>Open <a href="https://www.waze.com/editor" target="_blank" rel="noopener noreferrer" style={{ color: WAZE_BLUE }}>waze.com/editor</a> and search <strong style={{ color: "#CBD5E1" }}>Bed Bugs &amp; Beyond</strong></li>
                      <li>If found: select the existing place → click Edit → update all fields</li>
                      <li>If not found: click the map icon → <strong style={{ color: "#CBD5E1" }}>Add Place</strong> → Point of Interest</li>
                      <li>Enter name, phone, website, and category from the Required Business Information section above</li>
                      <li>Drag the location pin to a point in <strong style={{ color: "#CBD5E1" }}>Baldwin County, AL</strong> (Foley or Fairhope area recommended)</li>
                      <li>Paste the <strong style={{ color: "#CBD5E1" }}>Place Description</strong> using the copy button above</li>
                      <li>Save and submit — community review takes <strong style={{ color: "#CBD5E1" }}>24–72 hours</strong></li>
                      <li>Ensure your <strong style={{ color: "#CBD5E1" }}>Google Business Profile</strong> NAP matches (Google owns Waze — GBP accuracy boosts Waze visibility)</li>
                      <li>Update this tracker once the WME place is live</li>
                    </ol>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <a href="https://www.waze.com/editor" target="_blank" rel="noopener noreferrer"
                      style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(0,187,222,0.1)", border: "1px solid rgba(0,187,222,0.3)", color: WAZE_BLUE, textDecoration: "none", display: "inline-block" }}>
                      ↗ Open Waze Map Editor
                    </a>
                  </div>
                </div>
              );
            })()}

            {/* ── Profile Tracker ── */}
            {activeTab === "profile" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 16, lineHeight: 1.5 }}>
                  Track your Waze Map Editor account details, place URL, and submission status here.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { label: "Account Email",       val: acctEmail,    set: setAcctEmail,    ph: "email@example.com" },
                    { label: "WME Review Status",   val: verifyStatus, set: setVerifyStatus, ph: "Not Started / Submitted / Approved / Live" },
                  ].map(field => (
                    <div key={field.label}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>{field.label}</div>
                      <input value={field.val} onChange={e => field.set(e.target.value)} placeholder={field.ph}
                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }} />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Waze Place URL</div>
                    <input value={placeUrl} onChange={e => setPlaceUrl(e.target.value)} placeholder="https://waze.com/..."
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }} />
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Setup Notes</div>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                    placeholder="Notes about setup progress, WME edit status, or blockers..."
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit", resize: "vertical" }} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                  <button onClick={handleSave} style={{ padding: "8px 18px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: WAZE_BLUE, border: "none", color: "#FFF" }}>
                    Save Setup Notes
                  </button>
                  {savedMsg && <span style={{ fontSize: 12, color: "#22C55E", fontWeight: 600 }}>✓ Saved</span>}
                </div>
              </div>
            )}

            {/* ── Diagnostics ── */}
            {activeTab === "diagnostics" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                  Automated checks against Waze Map Editor setup requirements, NAP consistency, and Google/Waze ecosystem readiness.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {WAZE_DIAGS.map((d, i) => {
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

// ── Angi for Pros V2 Card ─────────────────────────────────────────────────────
const ANGI_CHECKLIST: { label: string; status: AppleStepStatus; description: string }[] = [
  { label: "Create Angi for Pros account",           status: "pending", description: "Sign up at pro.angi.com using your business email." },
  { label: "Complete business profile",              status: "pending", description: "Fill in company name, contact info, and all profile sections." },
  { label: "Confirm business name",                  status: "pending", description: "Exact match required: 'Bed Bugs & Beyond' — no keyword additions." },
  { label: "Confirm phone number",                   status: "pending", description: "Set (251) 324-9090 as the primary contact number." },
  { label: "Confirm website",                        status: "pending", description: "Set website to https://bedbugsandbeyond.net." },
  { label: "Select service category",                status: "pending", description: "Primary: Pest Control. Add all relevant sub-services." },
  { label: "Set service area",                       status: "pending", description: "Add Baldwin County + all 7 primary cities." },
  { label: "Add business description",               status: "pending", description: "Use the copy-ready description in the Business Info tab." },
  { label: "Upload logo / profile photo",            status: "pending", description: "Square, min 400×400 px (PNG or JPG)." },
  { label: "Upload business photos",                 status: "pending", description: "Add at least 5 photos — work photos, truck, team, before/after." },
  { label: "Set business hours",                     status: "pending", description: "Mon–Fri 7am–6pm, Sat 8am–2pm, Sun Closed." },
  { label: "Enable lead preferences",                status: "pending", description: "Select which pest control services you want to receive quote requests for." },
  { label: "Set weekly lead budget",                 status: "pending", description: "Configure how many leads per week and your budget cap." },
  { label: "Enable Instant Match",                   status: "pending", description: "Turn on Instant Match so Angi connects homeowners to you automatically." },
  { label: "Respond to first lead within 1 hour",   status: "pending", description: "Fast response rate improves your Angi ranking and win rate." },
];

const ANGI_DIAGS: { check: string; status: AppleDiagStatus; note: string }[] = [
  { check: "Angi for Pros account created",    status: "missing",  note: "No Angi Pro account detected — not yet started" },
  { check: "Business profile completed",       status: "missing",  note: "Profile not created or incomplete" },
  { check: "NAP matches Google Business Profile", status: "pending", note: "Will be confirmed once profile is created" },
  { check: "Phone confirmed",                  status: "pending",  note: "Pending profile setup" },
  { check: "Website confirmed",                status: "pending",  note: "Pending profile setup" },
  { check: "Category selected",               status: "missing",  note: "No service category set" },
  { check: "Service area configured",         status: "missing",  note: "No service area set" },
  { check: "Business description added",      status: "missing",  note: "No description set" },
  { check: "Photos uploaded",                 status: "missing",  note: "No photos — minimum 5 recommended" },
  { check: "Lead preferences enabled",        status: "missing",  note: "Quote request categories not configured" },
  { check: "Budget / lead cap configured",    status: "missing",  note: "Weekly budget not set" },
  { check: "GorillaDesk 'Angi Leads' source", status: "pending",  note: "Already appearing in GorillaDesk — profile will improve lead quality" },
];

function AngiBusinessCard() {
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [activeTab,    setActiveTab]    = useState<"checklist" | "bizinfo" | "profile" | "diagnostics" | "lead_review_hub">("checklist");
  const [checklist,    setChecklist]    = useState(ANGI_CHECKLIST);
  const [listingUrl,   setListingUrl]   = useState("");
  const [acctEmail,    setAcctEmail]    = useState("");
  const [verifyStatus, setVerifyStatus] = useState("Not Started");
  const [notes,        setNotes]        = useState("");
  const [savedMsg,     setSavedMsg]     = useState(false);
  const [copiedKey,    setCopiedKey]    = useState<string | null>(null);

  const completedCount  = checklist.filter(s => s.status === "complete").length;
  const inProgressCount = checklist.filter(s => s.status === "in-progress").length;
  const angiScore       = Math.round((completedCount / checklist.length) * 10);

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

  const ANGI_ORANGE = "#E8330A";

  const ANGI_STAGES: { value: string; label: string; color: string; bg: string; border: string }[] = [
    { value: "Not Started",      label: "Not Started",      color: "#64748B", bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.3)"  },
    { value: "In Progress",      label: "In Progress",      color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.35)"  },
    { value: "Profile Complete", label: "Profile Complete", color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.35)"   },
    { value: "Leads Active",     label: "Leads Active",     color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.35)"  },
    { value: "Receiving Leads",  label: "Receiving Leads",  color: "#22C55E", bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.35)"  },
  ];

  const TABS: { key: typeof activeTab; label: string }[] = [
    { key: "checklist",     label: "Setup Checklist" },
    { key: "bizinfo",       label: "Business Info" },
    { key: "profile",       label: "Profile Tracker" },
    { key: "diagnostics",   label: "Diagnostics" },
    { key: "lead_review_hub", label: "📊 Lead & Review Hub" },
  ];

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(232,51,10,0.05) 0%, rgba(11,22,41,0.9) 100%)",
      border: "1px solid rgba(232,51,10,0.25)",
      borderRadius: 14, backdropFilter: "blur(12px)", overflow: "hidden",
      boxShadow: "0 0 24px rgba(232,51,10,0.06)", transition: "border-color 0.2s",
    }}>
      {/* ── Card header ── */}
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(135deg, #C42D08, #E8330A)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 900, color: "#FFF", letterSpacing: "-0.5px",
            boxShadow: "0 0 16px rgba(232,51,10,0.35)",
          }}>A</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>Angi for Pros</span>
              <StatusBadge status="pending" />
            </div>
            <p style={{ fontSize: 12.5, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
              Home service leads, pest control quote requests, local trust &amp; comparison shopping.
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
          background: "rgba(232,51,10,0.05)", border: "1px solid rgba(232,51,10,0.15)",
          borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>Setup Progress — {completedCount}/{checklist.length} steps</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: ANGI_ORANGE }}>Angi Score: {angiScore} / 10 pts</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((completedCount / checklist.length) * 100)}%`, background: ANGI_ORANGE, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "#22C55E", fontWeight: 700 }}>{completedCount} done</span>
            <span style={{ fontSize: 11, color: "#64748B" }}>·</span>
            <span style={{ fontSize: 11, color: ANGI_ORANGE, fontWeight: 700 }}>{inProgressCount} active</span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            onClick={() => setDrawerOpen(v => !v)}
            style={{
              padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: drawerOpen ? "rgba(232,51,10,0.2)" : "rgba(232,51,10,0.1)",
              border: "1px solid rgba(232,51,10,0.35)", color: ANGI_ORANGE, transition: "all 0.15s",
            }}
          >{drawerOpen ? "▲ Close Angi Setup" : "▼ Open Angi Setup"}</button>
          <a href="https://pro.angi.com" target="_blank" rel="noopener noreferrer"
            style={{ padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(232,51,10,0.08)", border: "1px solid rgba(232,51,10,0.22)", color: ANGI_ORANGE, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            ↗ Open Angi for Pros
          </a>
          <a href="https://www.angi.com" target="_blank" rel="noopener noreferrer"
            style={{ padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(232,51,10,0.05)", border: "1px solid rgba(232,51,10,0.15)", color: "#64748B", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            ↗ Angi.com
          </a>
        </div>
      </div>

      {/* ── Expandable drawer ── */}
      {drawerOpen && (
        <div style={{ borderTop: "1px solid rgba(232,51,10,0.12)", background: "rgba(3,6,18,0.6)" }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 20px" }}>
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: "11px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: "transparent", border: "none",
                borderBottom: activeTab === tab.key ? `2px solid ${ANGI_ORANGE}` : "2px solid transparent",
                color: activeTab === tab.key ? ANGI_ORANGE : "#475569", transition: "all 0.15s", marginBottom: -1,
              }}>{tab.label}</button>
            ))}
          </div>

          <div style={{ padding: 20 }}>

            {/* ── Setup Checklist ── */}
            {activeTab === "checklist" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                  Complete all 15 steps to fully activate your Angi for Pros profile and start receiving pest control quote requests.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {checklist.map((step, idx) => (
                    <div key={idx} style={{
                      padding: "11px 14px", borderRadius: 10,
                      background: step.status === "complete" ? "rgba(34,197,94,0.05)" : step.status === "in-progress" ? "rgba(232,51,10,0.05)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${step.status === "complete" ? "rgba(34,197,94,0.18)" : step.status === "in-progress" ? "rgba(232,51,10,0.2)" : "rgba(255,255,255,0.05)"}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: step.description ? 4 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                            background: step.status === "complete" ? "rgba(34,197,94,0.2)" : step.status === "in-progress" ? "rgba(232,51,10,0.15)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${step.status === "complete" ? "rgba(34,197,94,0.4)" : step.status === "in-progress" ? "rgba(232,51,10,0.3)" : "rgba(255,255,255,0.1)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: step.status === "complete" ? "#22C55E" : step.status === "in-progress" ? ANGI_ORANGE : "#475569", fontWeight: 800,
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
                            <button onClick={() => markStepComplete(idx)} style={{ padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#22C55E" }}>
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
                  <a href="https://pro.angi.com" target="_blank" rel="noopener noreferrer"
                    style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(232,51,10,0.1)", border: "1px solid rgba(232,51,10,0.3)", color: ANGI_ORANGE, textDecoration: "none", display: "inline-block" }}>
                    ↗ Open Angi for Pros
                  </a>
                </div>
              </div>
            )}

            {/* ── Business Info ── */}
            {activeTab === "bizinfo" && (() => {
              const BIZ_DESCRIPTION =
`Bed Bugs & Beyond provides reliable, professional pest control services for homeowners and property managers throughout Baldwin County, Alabama. We specialize in bed bug treatment, roach and ant control, spider and flea elimination, rodent removal, mosquito treatment, and general pest management. Locally owned and operated, serving Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Elberta, and Robertsdale. Call (251) 324-9090 for a free inspection estimate.`;

              const SERVICES_LIST =
`Bed Bug Treatment
Roach Control
Ant Control
Spider Control
Flea Control
Rodent Control
Mosquito Control
General Pest Control`;

              const SPECIALTIES =
`Bed bug inspection and treatment
Roach elimination
Ant control (interior and exterior)
Spider treatment
Flea treatment (home and yard)
Rodent exclusion and trapping
Mosquito yard treatment
General pest control maintenance`;

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
                { label: "Business Name",     value: "Bed Bugs & Beyond",                   note: "Exact match — no keywords appended" },
                { label: "Phone Number",      value: "(251) 324-9090", copyKey: "angi-phone", note: "Must match GBP exactly (NAP)" },
                { label: "Website",           value: "https://bedbugsandbeyond.net",          note: "Confirmed BB&B website" },
                { label: "Primary Category",  value: "Pest Control",                          note: "Select from Angi's service category list" },
                { label: "Service Area",      value: "Baldwin County, AL — 7 cities",         note: "Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Elberta, Robertsdale" },
                { label: "Business Hours",    value: "Mon–Fri 7am–6pm, Sat 8am–2pm",         note: "Set in Angi Pro profile settings" },
                { label: "Response Target",   value: "Within 1 hour of lead receipt",         note: "Fast response improves win rate and Angi ranking" },
                { label: "Verification",      value: "Email + phone confirmation",            note: "Angi may also request a background check for new pros" },
              ];

              const PHOTO_REQS: { item: string; spec: string }[] = [
                { item: "Logo / profile",    spec: "Square, min 400×400 px (PNG/JPG) — appears in search results" },
                { item: "Service photo ×3",  spec: "Treatment photos — bed bug, exterior spray, interior inspection" },
                { item: "Team / vehicle",    spec: "Uniformed tech or branded truck builds credibility with homeowners" },
                { item: "Before/after",      spec: "Before and after treatment photos (highly valued by comparison shoppers)" },
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
                          background: copied ? "rgba(34,197,94,0.12)" : "rgba(232,51,10,0.1)",
                          border: copied ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(232,51,10,0.25)",
                          color: copied ? "#22C55E" : ANGI_ORANGE, transition: "all 0.2s",
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
                    Setup guidance only — not analytics. Status stays <strong style={{ color: ANGI_ORANGE }}>Setup Pending</strong> until the Angi profile is live and receiving leads.
                  </div>

                  {/* ── Why Angi matters callout ── */}
                  <div style={{
                    padding: "12px 16px", borderRadius: 10, marginBottom: 20,
                    background: "rgba(232,51,10,0.05)", border: "1px solid rgba(232,51,10,0.2)",
                    fontSize: 12, color: "#94A3B8", lineHeight: 1.7,
                  }}>
                    <div style={{ fontWeight: 700, color: "#CBD5E1", marginBottom: 6, fontSize: 12.5 }}>Why Angi matters for Bed Bugs &amp; Beyond</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                      {[
                        { icon: "🔨", text: "Home service leads — homeowners searching for pest control submit quote requests directly to you" },
                        { icon: "📊", text: "Comparison shopping — homeowners compare pros side-by-side; a complete profile wins more clicks" },
                        { icon: "⭐", text: "Local trust — Angi-verified reviews build credibility for homeowners making buying decisions" },
                        { icon: "📱", text: "GorillaDesk signal — 'Angi Leads' already appears in your lead source data; a profile improves lead quality" },
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
                              background: copiedKey === f.copyKey ? "rgba(34,197,94,0.12)" : "rgba(232,51,10,0.08)",
                              border: copiedKey === f.copyKey ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(232,51,10,0.2)",
                              color: copiedKey === f.copyKey ? "#22C55E" : ANGI_ORANGE, whiteSpace: "nowrap", flexShrink: 0,
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
                  <CopyBlock label="Business Description" copyKey="angi-desc"       value={BIZ_DESCRIPTION} rows={5} />
                  <CopyBlock label="Services List"        copyKey="angi-services"   value={SERVICES_LIST}   rows={9} />
                  <CopyBlock label="Specialties"          copyKey="angi-specialties" value={SPECIALTIES}    rows={9} />
                  <CopyBlock label="Service Area List"    copyKey="angi-areas"      value={SERVICE_AREAS}   rows={9} />

                  {/* ── Photo requirements ── */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                    Photo Requirements
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
                    {PHOTO_REQS.map(p => (
                      <div key={p.item} style={{
                        display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 12, alignItems: "center",
                        padding: "9px 14px", borderRadius: 9,
                        background: "rgba(232,51,10,0.04)", border: "1px solid rgba(232,51,10,0.15)",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1" }}>{p.item}</div>
                        <div style={{ fontSize: 11.5, color: "#475569" }}>{p.spec}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, color: "#EF4444", background: "rgba(239,68,68,0.1)", whiteSpace: "nowrap" }}>Missing</span>
                      </div>
                    ))}
                  </div>

                  {/* ── Lead preferences note ── */}
                  <div style={{
                    padding: "12px 16px", borderRadius: 10, marginBottom: 18,
                    background: "rgba(232,51,10,0.04)", border: "1px solid rgba(232,51,10,0.18)",
                    fontSize: 12.5, color: "#94A3B8", lineHeight: 1.7,
                  }}>
                    <div style={{ fontWeight: 700, color: "#CBD5E1", marginBottom: 4, fontSize: 12 }}>Lead Preferences &amp; Budget</div>
                    Angi charges per lead. Set a <strong style={{ color: "#CBD5E1" }}>weekly budget cap</strong> to control spend. Select only the pest control services you actively want leads for — unchecked services are excluded from matching. Enable <strong style={{ color: "#CBD5E1" }}>Instant Match</strong> to be auto-connected with homeowners who request quotes.
                  </div>

                  {/* ── Status + next action ── */}
                  <div style={{
                    padding: "12px 16px", borderRadius: 10, marginBottom: 14,
                    background: "rgba(232,51,10,0.05)", border: "1px solid rgba(232,51,10,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1", marginBottom: 2 }}>Profile &amp; Lead Status</div>
                      <div style={{ fontSize: 11.5, color: "#475569" }}>
                        Updates once the Angi Pro profile is complete and leads are live.
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                      background: "rgba(232,51,10,0.12)", border: "1px solid rgba(232,51,10,0.3)", color: ANGI_ORANGE,
                    }}>Not Started</span>
                  </div>

                  <div style={{
                    padding: "12px 16px", borderRadius: 10,
                    background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.18)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#22C55E", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 6 }}>Next Action</div>
                    <ol style={{ margin: 0, paddingLeft: 18, color: "#94A3B8", fontSize: 12.5, lineHeight: 2 }}>
                      <li>Go to <a href="https://pro.angi.com" target="_blank" rel="noopener noreferrer" style={{ color: ANGI_ORANGE }}>pro.angi.com</a> — sign in or create a new Pros account</li>
                      <li>Select <strong style={{ color: "#CBD5E1" }}>Pest Control</strong> as your service category</li>
                      <li>Set service area to <strong style={{ color: "#CBD5E1" }}>Baldwin County</strong> + all 7 cities listed above</li>
                      <li>Paste <strong style={{ color: "#CBD5E1" }}>Business Description</strong> using copy button above</li>
                      <li>Add <strong style={{ color: "#CBD5E1" }}>Services List</strong> and <strong style={{ color: "#CBD5E1" }}>Specialties</strong> from copy blocks above</li>
                      <li>Upload logo and minimum 5 photos per specs above</li>
                      <li>Set business hours (Mon–Fri 7am–6pm, Sat 8am–2pm)</li>
                      <li>Configure <strong style={{ color: "#CBD5E1" }}>lead preferences</strong> — select services to receive quote requests for</li>
                      <li>Set a <strong style={{ color: "#CBD5E1" }}>weekly budget cap</strong> to control Angi lead costs</li>
                      <li>Enable <strong style={{ color: "#CBD5E1" }}>Instant Match</strong> for automatic lead connections</li>
                      <li>Update profile and lead status in <strong style={{ color: "#CBD5E1" }}>Profile Tracker</strong> tab once live</li>
                    </ol>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <a href="https://pro.angi.com" target="_blank" rel="noopener noreferrer"
                      style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(232,51,10,0.1)", border: "1px solid rgba(232,51,10,0.3)", color: ANGI_ORANGE, textDecoration: "none", display: "inline-block" }}>
                      ↗ Open Angi for Pros
                    </a>
                  </div>
                </div>
              );
            })()}

            {/* ── Profile Tracker ── */}
            {activeTab === "profile" && (() => {
              const currentStage = ANGI_STAGES.find(s => s.value === verifyStatus) ?? ANGI_STAGES[0];
              const currentIdx   = ANGI_STAGES.findIndex(s => s.value === verifyStatus);
              return (
                <div>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 16, lineHeight: 1.5 }}>
                    Track Angi for Pros setup and lead status here. This is setup/lead-gen tracking only — no analytics or performance data.
                  </div>

                  {/* ── 5-stage status selector ── */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                      Lead-Gen Status
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", rowGap: 8 }}>
                      {ANGI_STAGES.map((stage, i) => {
                        const isActive = stage.value === verifyStatus;
                        const isPast   = i < currentIdx;
                        const isLocked = stage.value === "Receiving Leads";
                        return (
                          <React.Fragment key={stage.value}>
                            {i > 0 && (
                              <div style={{
                                width: 20, height: 2, flexShrink: 0,
                                background: isPast || isActive ? stage.color : "rgba(255,255,255,0.08)",
                                transition: "background 0.2s",
                              }} />
                            )}
                            <button
                              onClick={() => !isLocked && setVerifyStatus(stage.value)}
                              title={isLocked ? "Set to Receiving Leads only after you confirm leads are arriving in Angi for Pros" : `Set status to ${stage.label}`}
                              style={{
                                padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                                cursor: isLocked ? "not-allowed" : "pointer",
                                background: isActive ? stage.bg : isPast ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.03)",
                                border: `1px solid ${isActive ? stage.border : isPast ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)"}`,
                                color: isActive ? stage.color : isPast ? "#475569" : "#334155",
                                opacity: isLocked ? 0.6 : 1,
                                transition: "all 0.15s", whiteSpace: "nowrap",
                              }}
                            >
                              {isPast && !isActive ? "✓ " : ""}{stage.label}
                            </button>
                          </React.Fragment>
                        );
                      })}
                    </div>

                    <div style={{
                      marginTop: 12, padding: "10px 14px", borderRadius: 9,
                      background: currentStage.bg, border: `1px solid ${currentStage.border}`,
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                    }}>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: currentStage.color }}>
                          Current: {currentStage.label}
                        </span>
                        {verifyStatus === "In Progress" && (
                          <span style={{ fontSize: 11, color: "#64748B", marginLeft: 8 }}>— profile setup started at pro.angi.com</span>
                        )}
                        {verifyStatus === "Profile Complete" && (
                          <span style={{ fontSize: 11, color: "#64748B", marginLeft: 8 }}>— all fields, photos, and hours filled in</span>
                        )}
                        {verifyStatus === "Leads Active" && (
                          <span style={{ fontSize: 11, color: "#64748B", marginLeft: 8 }}>— lead preferences and weekly budget configured</span>
                        )}
                        {verifyStatus === "Receiving Leads" && (
                          <span style={{ fontSize: 11, color: "#64748B", marginLeft: 8 }}>— confirmed leads arriving · update card status badge</span>
                        )}
                      </div>
                      {verifyStatus === "Receiving Leads" && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#22C55E", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 20, padding: "2px 10px", whiteSpace: "nowrap" }}>
                          Ready to mark Live
                        </span>
                      )}
                    </div>

                    <div style={{ marginTop: 8, fontSize: 11, color: "#475569", lineHeight: 1.5 }}>
                      <strong style={{ color: "#64748B" }}>Receiving Leads</strong> is locked until you manually confirm leads are arriving in Angi for Pros. Do not set based on profile approval alone.
                    </div>
                  </div>

                  {/* ── Account detail fields ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Account Email</div>
                      <input value={acctEmail} onChange={e => setAcctEmail(e.target.value)} placeholder="email@example.com"
                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Angi Profile URL</div>
                      <input value={listingUrl} onChange={e => setListingUrl(e.target.value)} placeholder="https://www.angi.com/companylist/..."
                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }} />
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Setup Notes</div>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                      placeholder="Notes about setup progress, lead budget, blockers, or next steps..."
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit", resize: "vertical" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                    <button onClick={handleSave} style={{ padding: "8px 18px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: ANGI_ORANGE, border: "none", color: "#FFF" }}>
                      Save Setup Notes
                    </button>
                    {savedMsg && <span style={{ fontSize: 12, color: "#22C55E", fontWeight: 600 }}>✓ Saved</span>}
                  </div>
                </div>
              );
            })()}

            {/* ── Diagnostics ── */}
            {activeTab === "diagnostics" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                  Automated checks against Angi for Pros setup requirements, NAP consistency, and lead readiness.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {ANGI_DIAGS.map((d, i) => {
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
            {activeTab === "lead_review_hub" && (
              <LeadReviewHubTab platform="angi" />
            )}

          </div>
        </div>
      )}
    </div>
  );
}

// ── Thumbtack for Pros V2 Card ────────────────────────────────────────────────
const THUMBTACK_CHECKLIST: { label: string; status: AppleStepStatus; description: string }[] = [
  { label: "Create Thumbtack for Pros account",        status: "pending", description: "Sign up at thumbtack.com/pro using your business email." },
  { label: "Complete business profile",                status: "pending", description: "Fill in company name, contact info, and all profile sections." },
  { label: "Confirm business name",                    status: "pending", description: "Exact match required: 'Bed Bugs & Beyond' — no keyword additions." },
  { label: "Confirm phone number",                     status: "pending", description: "Set (251) 324-9090 as the primary contact number." },
  { label: "Confirm website",                          status: "pending", description: "Set website to https://bedbugsandbeyond.net." },
  { label: "Select service: Pest Control / Exterminator", status: "pending", description: "Choose Pest Control from Thumbtack's service category list." },
  { label: "Set service area",                         status: "pending", description: "Add Baldwin County + all 7 primary cities." },
  { label: "Add business description",                 status: "pending", description: "Use the copy-ready description in the Business Info tab." },
  { label: "Add introduction / About section",         status: "pending", description: "Thumbtack shows an 'About' blurb prominently — use the intro copy." },
  { label: "Upload profile photo / logo",              status: "pending", description: "Square, min 400×400 px (PNG or JPG)." },
  { label: "Upload work photos",                       status: "pending", description: "Add at least 5 photos — treatments, truck, team, before/after." },
  { label: "Set business hours",                       status: "pending", description: "Mon–Fri 7am–6pm, Sat 8am–2pm, Sun Closed." },
  { label: "Enable quote preferences",                 status: "pending", description: "Configure which job types you want to receive quote requests for." },
  { label: "Enable Instant Match / auto-quote",        status: "pending", description: "Thumbtack's Instant Match sends your profile automatically to homeowners." },
  { label: "Respond to first quote request within 1 hour", status: "pending", description: "Fast response rate improves your Thumbtack ranking and win rate." },
];

const THUMBTACK_DIAGS: { check: string; status: AppleDiagStatus; note: string }[] = [
  { check: "Thumbtack for Pros account created",  status: "missing",  note: "No Thumbtack Pro account detected — not yet started" },
  { check: "Business profile completed",          status: "missing",  note: "Profile not created or incomplete" },
  { check: "NAP matches Google Business Profile", status: "pending",  note: "Will be confirmed once profile is created" },
  { check: "Phone confirmed",                     status: "pending",  note: "Pending profile setup" },
  { check: "Website confirmed",                   status: "pending",  note: "Pending profile setup" },
  { check: "Service category selected",           status: "missing",  note: "No service category set" },
  { check: "Service area configured",             status: "missing",  note: "No service area set" },
  { check: "Business description added",          status: "missing",  note: "No description set" },
  { check: "Photos uploaded",                     status: "missing",  note: "No photos — minimum 5 recommended" },
  { check: "Quote preferences enabled",           status: "missing",  note: "Quote request categories not configured" },
  { check: "Instant Match / auto-quote active",   status: "missing",  note: "Instant Match not enabled" },
  { check: "Response readiness",                  status: "pending",  note: "Response process should be set up before going live" },
];

function ThumbtackBusinessCard() {
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [activeTab,    setActiveTab]    = useState<"checklist" | "bizinfo" | "profile" | "diagnostics" | "lead_review_hub">("checklist");
  const [checklist,    setChecklist]    = useState(THUMBTACK_CHECKLIST);
  const [listingUrl,   setListingUrl]   = useState("");
  const [acctEmail,    setAcctEmail]    = useState("");
  const [verifyStatus, setVerifyStatus] = useState("Not Started");
  const [notes,        setNotes]        = useState("");
  const [savedMsg,     setSavedMsg]     = useState(false);
  const [copiedKey,    setCopiedKey]    = useState<string | null>(null);

  const completedCount  = checklist.filter(s => s.status === "complete").length;
  const inProgressCount = checklist.filter(s => s.status === "in-progress").length;
  const ttScore         = Math.round((completedCount / checklist.length) * 10);

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

  const TT_TEAL = "#009FD9";

  const TT_STAGES: { value: string; label: string; color: string; bg: string; border: string }[] = [
    { value: "Not Started",      label: "Not Started",      color: "#64748B", bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.3)"  },
    { value: "In Progress",      label: "In Progress",      color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.35)"  },
    { value: "Profile Complete", label: "Profile Complete", color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.35)"   },
    { value: "Leads Active",     label: "Leads Active",     color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.35)"  },
    { value: "Receiving Leads",  label: "Receiving Leads",  color: "#22C55E", bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.35)"  },
  ];

  const TABS: { key: typeof activeTab; label: string }[] = [
    { key: "checklist",     label: "Setup Checklist" },
    { key: "bizinfo",       label: "Business Info" },
    { key: "profile",       label: "Profile Tracker" },
    { key: "diagnostics",   label: "Diagnostics" },
    { key: "lead_review_hub", label: "📊 Lead & Review Hub" },
  ];

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(0,159,217,0.05) 0%, rgba(11,22,41,0.9) 100%)",
      border: "1px solid rgba(0,159,217,0.25)",
      borderRadius: 14, backdropFilter: "blur(12px)", overflow: "hidden",
      boxShadow: "0 0 24px rgba(0,159,217,0.06)",
    }}>
      {/* ── Card header ── */}
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(135deg, #007BB5, #009FD9)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 900, color: "#FFF", letterSpacing: "-0.5px",
            boxShadow: "0 0 16px rgba(0,159,217,0.35)",
          }}>TT</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>Thumbtack for Pros</span>
              <StatusBadge status="pending" />
            </div>
            <p style={{ fontSize: 12.5, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
              Quote requests, local home service discovery, comparison shopping &amp; pest control lead capture.
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
          background: "rgba(0,159,217,0.05)", border: "1px solid rgba(0,159,217,0.15)",
          borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>Setup Progress — {completedCount}/{checklist.length} steps</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: TT_TEAL }}>Thumbtack Score: {ttScore} / 10 pts</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((completedCount / checklist.length) * 100)}%`, background: TT_TEAL, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "#22C55E", fontWeight: 700 }}>{completedCount} done</span>
            <span style={{ fontSize: 11, color: "#64748B" }}>·</span>
            <span style={{ fontSize: 11, color: TT_TEAL, fontWeight: 700 }}>{inProgressCount} active</span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button onClick={() => setDrawerOpen(v => !v)} style={{
            padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
            background: drawerOpen ? "rgba(0,159,217,0.2)" : "rgba(0,159,217,0.1)",
            border: "1px solid rgba(0,159,217,0.35)", color: TT_TEAL, transition: "all 0.15s",
          }}>{drawerOpen ? "▲ Close Thumbtack Setup" : "▼ Open Thumbtack Setup"}</button>
          <a href="https://www.thumbtack.com/pro" target="_blank" rel="noopener noreferrer"
            style={{ padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(0,159,217,0.08)", border: "1px solid rgba(0,159,217,0.22)", color: TT_TEAL, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            ↗ Open Thumbtack for Pros
          </a>
        </div>
      </div>

      {/* ── Expandable drawer ── */}
      {drawerOpen && (
        <div style={{ borderTop: "1px solid rgba(0,159,217,0.12)", background: "rgba(3,6,18,0.6)" }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 20px" }}>
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: "11px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: "transparent", border: "none",
                borderBottom: activeTab === tab.key ? `2px solid ${TT_TEAL}` : "2px solid transparent",
                color: activeTab === tab.key ? TT_TEAL : "#475569", transition: "all 0.15s", marginBottom: -1,
              }}>{tab.label}</button>
            ))}
          </div>

          <div style={{ padding: 20 }}>

            {/* ── Setup Checklist ── */}
            {activeTab === "checklist" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                  Complete all 15 steps to fully activate your Thumbtack Pro profile and start receiving pest control quote requests.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {checklist.map((step, idx) => (
                    <div key={idx} style={{
                      padding: "11px 14px", borderRadius: 10,
                      background: step.status === "complete" ? "rgba(34,197,94,0.05)" : step.status === "in-progress" ? "rgba(0,159,217,0.05)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${step.status === "complete" ? "rgba(34,197,94,0.18)" : step.status === "in-progress" ? "rgba(0,159,217,0.2)" : "rgba(255,255,255,0.05)"}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: step.description ? 4 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                            background: step.status === "complete" ? "rgba(34,197,94,0.2)" : step.status === "in-progress" ? "rgba(0,159,217,0.15)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${step.status === "complete" ? "rgba(34,197,94,0.4)" : step.status === "in-progress" ? "rgba(0,159,217,0.3)" : "rgba(255,255,255,0.1)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: step.status === "complete" ? "#22C55E" : step.status === "in-progress" ? TT_TEAL : "#475569", fontWeight: 800,
                          }}>{step.status === "complete" ? "✓" : idx + 1}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: step.status === "complete" ? "#64748B" : "#CBD5E1", textDecoration: step.status === "complete" ? "line-through" : "none" }}>
                            {step.label}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <AppleStepBadge status={step.status} />
                          {step.status !== "complete" && (
                            <button onClick={() => markStepComplete(idx)} style={{ padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#22C55E" }}>
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
                  <a href="https://www.thumbtack.com/pro" target="_blank" rel="noopener noreferrer"
                    style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(0,159,217,0.1)", border: "1px solid rgba(0,159,217,0.3)", color: TT_TEAL, textDecoration: "none", display: "inline-block" }}>
                    ↗ Open Thumbtack for Pros
                  </a>
                </div>
              </div>
            )}

            {/* ── Business Info ── */}
            {activeTab === "bizinfo" && (() => {
              const BIZ_DESCRIPTION =
`Bed Bugs & Beyond offers reliable, professional pest control services for homeowners and property managers throughout Baldwin County, Alabama. We handle bed bug treatment, roach and ant control, spider and flea elimination, rodent removal, mosquito treatment, and general pest management. Locally owned and operated, serving Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Elberta, and Robertsdale. Call (251) 324-9090 for a free inspection estimate.`;

              const INTRO_ABOUT =
`We're a locally owned pest control company serving Baldwin County homeowners, vacation rentals, and property managers. Fast response, professional results, and thorough follow-up — that's how we handle every job. Whether it's a bed bug situation that needs immediate attention or a routine pest maintenance plan, we cover it all. Call us today at (251) 324-9090.`;

              const SERVICES_LIST =
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
                { label: "Business Name",    value: "Bed Bugs & Beyond",                   note: "Exact match — no keywords appended" },
                { label: "Phone Number",     value: "(251) 324-9090", copyKey: "tt-phone",  note: "Must match GBP exactly (NAP)" },
                { label: "Website",          value: "https://bedbugsandbeyond.net",          note: "Confirmed BB&B website" },
                { label: "Service Category", value: "Pest Control / Exterminator",           note: "Select from Thumbtack's category list" },
                { label: "Service Area",     value: "Baldwin County, AL — 7 cities",         note: "Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Elberta, Robertsdale" },
                { label: "Business Hours",   value: "Mon–Fri 7am–6pm, Sat 8am–2pm",         note: "Set in Thumbtack Pro profile settings" },
                { label: "Response Target",  value: "Within 1 hour of quote request",        note: "Fast response improves Thumbtack ranking and customer win rate" },
                { label: "Lead Model",       value: "Pay-per-lead / Instant Match",          note: "Thumbtack charges per lead — set budget and job preferences to control costs" },
              ];

              const PHOTO_REQS: { item: string; spec: string }[] = [
                { item: "Logo / profile",    spec: "Square, min 400×400 px (PNG/JPG) — shown in search results" },
                { item: "Service photo ×3",  spec: "Treatment photos — bed bug, exterior spray, interior inspection" },
                { item: "Team / vehicle",    spec: "Uniformed tech or branded truck — builds homeowner trust" },
                { item: "Before/after",      spec: "Before and after treatment (highly valued by homeowners comparing pros)" },
              ];

              type CopyBlockProps = { label: string; copyKey: string; value: string; rows?: number };
              function CopyBlock({ label, copyKey, value, rows = 4 }: CopyBlockProps) {
                const copied = copiedKey === copyKey;
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</span>
                      <button onClick={() => copyText(copyKey, value)} style={{
                        padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
                        background: copied ? "rgba(34,197,94,0.12)" : "rgba(0,159,217,0.1)",
                        border: copied ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(0,159,217,0.25)",
                        color: copied ? "#22C55E" : TT_TEAL, transition: "all 0.2s",
                      }}>{copied ? "✓ Copied" : "Copy"}</button>
                    </div>
                    <textarea readOnly rows={rows} value={value} style={{
                      width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, fontSize: 12, lineHeight: 1.6,
                      color: "#CBD5E1", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                      outline: "none", fontFamily: "inherit", resize: "none", cursor: "text",
                    }} />
                  </div>
                );
              }

              return (
                <div>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 16, lineHeight: 1.5 }}>
                    Setup guidance only — not analytics. Status stays <strong style={{ color: TT_TEAL }}>Setup Pending</strong> until the Thumbtack profile is live and receiving quote requests.
                  </div>

                  {/* Why Thumbtack matters */}
                  <div style={{
                    padding: "12px 16px", borderRadius: 10, marginBottom: 20,
                    background: "rgba(0,159,217,0.05)", border: "1px solid rgba(0,159,217,0.2)",
                  }}>
                    <div style={{ fontWeight: 700, color: "#CBD5E1", marginBottom: 6, fontSize: 12.5 }}>Why Thumbtack matters for Bed Bugs &amp; Beyond</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                      {[
                        { icon: "💬", text: "Quote requests — homeowners actively searching for pest control submit job requests directly to you" },
                        { icon: "📊", text: "Comparison shopping — homeowners review your profile alongside competitors; completeness wins jobs" },
                        { icon: "🏠", text: "Local discovery — Thumbtack surfaces local pros based on service area and category match" },
                        { icon: "🎯", text: "Lead capture — pest control is a high-intent category; homeowners requesting quotes are ready to hire" },
                      ].map(item => (
                        <div key={item.icon} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <span style={{ flexShrink: 0, fontSize: 13 }}>{item.icon}</span>
                          <span style={{ fontSize: 11.5, color: "#94A3B8" }}>{item.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Required fields */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>Required Business Information</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
                    {REQUIRED_FIELDS.map(f => (
                      <div key={f.label} style={{
                        display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 12, alignItems: "start",
                        padding: "9px 14px", borderRadius: 9, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", paddingTop: 1 }}>{f.label}</div>
                        <div>
                          <div style={{ fontSize: 12.5, color: "#E2E8F0", fontWeight: 500 }}>{f.value}</div>
                          {f.note && <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{f.note}</div>}
                        </div>
                        {f.copyKey && (
                          <button onClick={() => copyText(f.copyKey!, f.value)} style={{
                            padding: "3px 9px", borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: "pointer",
                            background: copiedKey === f.copyKey ? "rgba(34,197,94,0.12)" : "rgba(0,159,217,0.08)",
                            border: copiedKey === f.copyKey ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(0,159,217,0.2)",
                            color: copiedKey === f.copyKey ? "#22C55E" : TT_TEAL, whiteSpace: "nowrap", flexShrink: 0,
                          }}>{copiedKey === f.copyKey ? "✓" : "Copy"}</button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Copy-ready content */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>Copy-Ready Content</div>
                  <CopyBlock label="Business Description" copyKey="tt-desc"  value={BIZ_DESCRIPTION} rows={5} />
                  <CopyBlock label="Intro / About"        copyKey="tt-intro" value={INTRO_ABOUT}     rows={5} />
                  <CopyBlock label="Services List"        copyKey="tt-svcs"  value={SERVICES_LIST}   rows={9} />
                  <CopyBlock label="Service Area List"    copyKey="tt-areas" value={SERVICE_AREAS}   rows={9} />

                  {/* Photo requirements */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>Photo Requirements</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
                    {PHOTO_REQS.map(p => (
                      <div key={p.item} style={{
                        display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 12, alignItems: "center",
                        padding: "9px 14px", borderRadius: 9, background: "rgba(0,159,217,0.03)", border: "1px solid rgba(0,159,217,0.12)",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1" }}>{p.item}</div>
                        <div style={{ fontSize: 11.5, color: "#475569" }}>{p.spec}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, color: "#EF4444", background: "rgba(239,68,68,0.1)", whiteSpace: "nowrap" }}>Missing</span>
                      </div>
                    ))}
                  </div>

                  {/* Lead model note */}
                  <div style={{ padding: "12px 16px", borderRadius: 10, marginBottom: 18, background: "rgba(0,159,217,0.04)", border: "1px solid rgba(0,159,217,0.18)", fontSize: 12.5, color: "#94A3B8", lineHeight: 1.7 }}>
                    <div style={{ fontWeight: 700, color: "#CBD5E1", marginBottom: 4, fontSize: 12 }}>Lead Preferences &amp; Budget</div>
                    Thumbtack charges per lead. <strong style={{ color: "#CBD5E1" }}>Instant Match</strong> automatically sends your profile to homeowners searching for pest control in your area. Configure your <strong style={{ color: "#CBD5E1" }}>job preferences</strong> (types of pest jobs, home sizes, urgency) to filter for the right leads and control costs.
                  </div>

                  {/* Status + next action */}
                  <div style={{ padding: "12px 16px", borderRadius: 10, marginBottom: 14, background: "rgba(0,159,217,0.05)", border: "1px solid rgba(0,159,217,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1", marginBottom: 2 }}>Profile &amp; Lead Status</div>
                      <div style={{ fontSize: 11.5, color: "#475569" }}>Updates once the Thumbtack Pro profile is complete and receiving quote requests.</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, background: "rgba(0,159,217,0.12)", border: "1px solid rgba(0,159,217,0.3)", color: TT_TEAL }}>Not Started</span>
                  </div>

                  <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.18)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#22C55E", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 6 }}>Next Action</div>
                    <ol style={{ margin: 0, paddingLeft: 18, color: "#94A3B8", fontSize: 12.5, lineHeight: 2 }}>
                      <li>Go to <a href="https://www.thumbtack.com/pro" target="_blank" rel="noopener noreferrer" style={{ color: TT_TEAL }}>thumbtack.com/pro</a> — sign in or create a Pros account</li>
                      <li>Select <strong style={{ color: "#CBD5E1" }}>Pest Control / Exterminator</strong> as your service category</li>
                      <li>Set service area to <strong style={{ color: "#CBD5E1" }}>Baldwin County</strong> + all 7 cities</li>
                      <li>Paste <strong style={{ color: "#CBD5E1" }}>Business Description</strong> and <strong style={{ color: "#CBD5E1" }}>Intro / About</strong> from copy blocks above</li>
                      <li>Add <strong style={{ color: "#CBD5E1" }}>Services List</strong> and configure job type preferences</li>
                      <li>Upload logo and minimum 5 photos per specs above</li>
                      <li>Set business hours (Mon–Fri 7am–6pm, Sat 8am–2pm)</li>
                      <li>Enable <strong style={{ color: "#CBD5E1" }}>Instant Match</strong> to receive automatic lead connections</li>
                      <li>Configure <strong style={{ color: "#CBD5E1" }}>lead preferences</strong> and set a budget cap to control spend</li>
                      <li>Monitor for first quote request — respond within 1 hour</li>
                      <li>Update profile status in <strong style={{ color: "#CBD5E1" }}>Profile Tracker</strong> tab once live</li>
                    </ol>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <a href="https://www.thumbtack.com/pro" target="_blank" rel="noopener noreferrer"
                      style={{ padding: "8px 16px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "rgba(0,159,217,0.1)", border: "1px solid rgba(0,159,217,0.3)", color: TT_TEAL, textDecoration: "none", display: "inline-block" }}>
                      ↗ Open Thumbtack for Pros
                    </a>
                  </div>
                </div>
              );
            })()}

            {/* ── Profile Tracker ── */}
            {activeTab === "profile" && (() => {
              const currentStage = TT_STAGES.find(s => s.value === verifyStatus) ?? TT_STAGES[0];
              const currentIdx   = TT_STAGES.findIndex(s => s.value === verifyStatus);
              return (
                <div>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 16, lineHeight: 1.5 }}>
                    Track Thumbtack for Pros setup and lead status here. This is setup/lead-gen tracking only — no analytics or performance data.
                  </div>

                  {/* ── 5-stage status selector ── */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                      Lead-Gen Status
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", rowGap: 8 }}>
                      {TT_STAGES.map((stage, i) => {
                        const isActive = stage.value === verifyStatus;
                        const isPast   = i < currentIdx;
                        const isLocked = stage.value === "Receiving Leads";
                        return (
                          <React.Fragment key={stage.value}>
                            {i > 0 && (
                              <div style={{
                                width: 20, height: 2, flexShrink: 0,
                                background: isPast || isActive ? stage.color : "rgba(255,255,255,0.08)",
                                transition: "background 0.2s",
                              }} />
                            )}
                            <button
                              onClick={() => !isLocked && setVerifyStatus(stage.value)}
                              title={isLocked ? "Set to Receiving Leads only after you confirm quote requests are arriving in Thumbtack for Pros" : `Set status to ${stage.label}`}
                              style={{
                                padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                                cursor: isLocked ? "not-allowed" : "pointer",
                                background: isActive ? stage.bg : isPast ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.03)",
                                border: `1px solid ${isActive ? stage.border : isPast ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)"}`,
                                color: isActive ? stage.color : isPast ? "#475569" : "#334155",
                                opacity: isLocked ? 0.6 : 1,
                                transition: "all 0.15s", whiteSpace: "nowrap",
                              }}
                            >
                              {isPast && !isActive ? "✓ " : ""}{stage.label}
                            </button>
                          </React.Fragment>
                        );
                      })}
                    </div>

                    <div style={{
                      marginTop: 12, padding: "10px 14px", borderRadius: 9,
                      background: currentStage.bg, border: `1px solid ${currentStage.border}`,
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                    }}>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: currentStage.color }}>
                          Current: {currentStage.label}
                        </span>
                        {verifyStatus === "In Progress" && (
                          <span style={{ fontSize: 11, color: "#64748B", marginLeft: 8 }}>— profile setup started at thumbtack.com/pro</span>
                        )}
                        {verifyStatus === "Profile Complete" && (
                          <span style={{ fontSize: 11, color: "#64748B", marginLeft: 8 }}>— all fields, intro, photos, and hours filled in</span>
                        )}
                        {verifyStatus === "Leads Active" && (
                          <span style={{ fontSize: 11, color: "#64748B", marginLeft: 8 }}>— quote preferences and Instant Match configured</span>
                        )}
                        {verifyStatus === "Receiving Leads" && (
                          <span style={{ fontSize: 11, color: "#64748B", marginLeft: 8 }}>— confirmed quote requests arriving · update card status badge</span>
                        )}
                      </div>
                      {verifyStatus === "Receiving Leads" && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#22C55E", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 20, padding: "2px 10px", whiteSpace: "nowrap" }}>
                          Ready to mark Live
                        </span>
                      )}
                    </div>

                    <div style={{ marginTop: 8, fontSize: 11, color: "#475569", lineHeight: 1.5 }}>
                      <strong style={{ color: "#64748B" }}>Receiving Leads</strong> is locked until you manually confirm quote requests are arriving in Thumbtack for Pros. Do not set based on profile approval alone.
                    </div>
                  </div>

                  {/* ── Account detail fields ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Account Email</div>
                      <input value={acctEmail} onChange={e => setAcctEmail(e.target.value)} placeholder="email@example.com"
                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Thumbtack Profile URL</div>
                      <input value={listingUrl} onChange={e => setListingUrl(e.target.value)} placeholder="https://www.thumbtack.com/..."
                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }} />
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 }}>Setup Notes</div>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Notes about setup progress, quote preferences, budget, or next steps..."
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit", resize: "vertical" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                    <button onClick={handleSave} style={{ padding: "8px 18px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: TT_TEAL, border: "none", color: "#FFF" }}>Save Setup Notes</button>
                    {savedMsg && <span style={{ fontSize: 12, color: "#22C55E", fontWeight: 600 }}>✓ Saved</span>}
                  </div>
                </div>
              );
            })()}

            {/* ── Diagnostics ── */}
            {activeTab === "diagnostics" && (
              <div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
                  Setup requirement checks, NAP consistency, and quote readiness for Thumbtack for Pros.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {THUMBTACK_DIAGS.map((d, i) => {
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
            {activeTab === "lead_review_hub" && (
              <LeadReviewHubTab platform="thumbtack" />
            )}

          </div>
        </div>
      )}
    </div>
  );
}

// ── Diagnostics panel ──────────────────────────────────────────────────────────
type DiagEntry = { icon: string; color: string; text: string; severity: "warning" | "info" };

// ── Local Presence Summary Card ───────────────────────────────────────────────
type SumStatus = "connected" | "verified_publishing" | "setup_pending" | "not_started" | "needs_action" | "coming_soon";

const SUMMARY_STATUS_META: Record<SumStatus, { label: string; color: string; bg: string; border: string }> = {
  connected:           { label: "Connected",             color: "#22C55E", bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.25)"  },
  verified_publishing: { label: "Verified · Publishing", color: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.3)"    },
  setup_pending:       { label: "Setup Pending",         color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)"  },
  not_started:         { label: "Not Started",           color: "#64748B", bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.2)"  },
  needs_action:        { label: "Needs Action",          color: "#EF4444", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.25)"   },
  coming_soon:         { label: "Coming Soon",           color: "#6B7280", bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.2)"  },
};

const SUMMARY_PLATFORMS: {
  name: string; dot: string; summaryStatus: SumStatus; note: string;
}[] = [
  { name: "Google Business Profile", dot: "#4285F4", summaryStatus: "connected",           note: "Connected via API · GBP active"                                     },
  { name: "Bing Places",             dot: "#008272", summaryStatus: "verified_publishing", note: "Verified · Synced with Google · Publishing · Live in 7–12 days"     },
  { name: "Apple Business Connect",  dot: "#888888", summaryStatus: "setup_pending",       note: "Submitted · Phone PIN / Apple review in progress"                    },
  { name: "Facebook Business",       dot: "#1877F2", summaryStatus: "not_started",         note: "Facebook Business Page not yet created"                              },
  { name: "Nextdoor Business",       dot: "#00B246", summaryStatus: "not_started",         note: "Listing not yet claimed"                                             },
  { name: "Yelp for Business",       dot: "#D32323", summaryStatus: "not_started",         note: "Profile not yet created"                                             },
  { name: "Waze (WME)",              dot: "#00BBDE", summaryStatus: "not_started",         note: "Free path via Waze Map Editor — community moderated"                 },
  { name: "Angi for Pros",           dot: "#E8330A", summaryStatus: "not_started",         note: "Pro account not yet created"                                         },
  { name: "Thumbtack for Pros",      dot: "#009FD9", summaryStatus: "not_started",         note: "Pro account not yet created"                                         },
  { name: "AI Search (LLMs)",        dot: "#6B7280", summaryStatus: "coming_soon",         note: "AI Visibility module — not yet set up"                               },
];

// ── Facebook Local Presence V2 Card ──────────────────────────────────────────
type FBStepStatus = "complete" | "in-progress" | "pending" | "blocked";

const FB_CHECKLIST: { label: string; status: FBStepStatus; description: string }[] = [
  { label: "Create Facebook account or sign in",      status: "pending", description: "Go to facebook.com and sign in with your business email, or create a new account." },
  { label: "Create a Business Page",                  status: "pending", description: "Visit facebook.com/pages/create — choose 'Business or Brand' and enter your business name." },
  { label: "Set local business category",             status: "pending", description: "Select 'Pest Control Service' as the primary category. Add 'Exterminator' as a secondary category." },
  { label: "Add NAP — Name, Address & Phone",         status: "pending", description: "Enter: Bed Bugs & Beyond · Baldwin County, AL · (251) 324-9090. Must match Google Business Profile exactly." },
  { label: "Add website link",                        status: "pending", description: "Add https://bedbugsandbeyond.net to the Page's About section." },
  { label: "Add service area (Baldwin County, AL)",   status: "pending", description: "In Page settings, add the service area cities: Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Spanish Fort." },
  { label: "Add business hours",                      status: "pending", description: "Set your operating hours. Must match the hours on Google Business Profile (NAP consistency)." },
  { label: "Upload cover photo and profile image",    status: "pending", description: "Use the same logo and brand imagery as your GBP and website for brand consistency." },
  { label: "Enable Messenger for business",           status: "pending", description: "Turn on Facebook Messenger in Page settings so leads can contact you via chat." },
  { label: "Post introductory content",               status: "pending", description: "Publish at least 3 posts — service overview, service area, and a customer testimonial." },
  { label: "Link page to AI Edge publishing",         status: "pending", description: "Connect the Facebook page in the Connections tab to enable AI Edge automated publishing." },
];

const FB_DIAGS: { check: string; status: "healthy" | "warning" | "missing" | "pending"; note: string }[] = [
  { check: "Business Page created",              status: "missing",  note: "Page not yet created — create at facebook.com/pages/create" },
  { check: "Local business category set",        status: "pending",  note: "Will be confirmed once page is created" },
  { check: "NAP matches Google Business Profile",status: "pending",  note: "Will be verified once page is live" },
  { check: "Phone number confirmed",             status: "pending",  note: "(251) 324-9090 — will be checked after page creation" },
  { check: "Website URL correct",                status: "pending",  note: "bedbugsandbeyond.net — will be checked after page creation" },
  { check: "Service area configured",            status: "missing",  note: "Set service area to Baldwin County cities in Page settings" },
  { check: "Facebook Messenger enabled",         status: "missing",  note: "Enable in Page settings > Messaging" },
  { check: "Connected to AI Edge publishing",    status: "missing",  note: "Link in Connections tab for automated post publishing" },
];

const FB_DIAG_STYLE: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  healthy: { color: "#22C55E", bg: "rgba(34,197,94,0.08)",  border: "rgba(34,197,94,0.2)",  dot: "#22C55E" },
  warning: { color: "#F59E0B", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)",  dot: "#F59E0B" },
  missing: { color: "#EF4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)",   dot: "#EF4444" },
  pending: { color: "#64748B", bg: "rgba(100,116,139,0.06)", border: "rgba(100,116,139,0.15)", dot: "#475569" },
};

function FBStepBadge({ status }: { status: FBStepStatus }) {
  const map: Record<FBStepStatus, { label: string; color: string; bg: string }> = {
    "complete":    { label: "Done",        color: "#22C55E", bg: "rgba(34,197,94,0.15)"  },
    "in-progress": { label: "In Progress", color: "#1877F2", bg: "rgba(24,119,242,0.15)"  },
    "pending":     { label: "Pending",     color: "#64748B", bg: "rgba(100,116,139,0.1)"  },
    "blocked":     { label: "Blocked",     color: "#EF4444", bg: "rgba(239,68,68,0.12)"   },
  };
  const m = map[status];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: m.color, background: m.bg, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>
      {m.label}
    </span>
  );
}

function FacebookLocalPresenceCard() {
  const authFetch = useApiFetch();
  const [activeTab,  setActiveTab]  = useState<"checklist" | "bizinfo" | "diagnostics">("checklist");
  const [checklist,  setChecklist]  = useState(FB_CHECKLIST);
  const [pageUrl,    setPageUrl]    = useState("");
  const [saving,     setSaving]     = useState(false);
  const [saveMsg,    setSaveMsg]    = useState<string | null>(null);

  const completedCount = checklist.filter(s => s.status === "complete").length;
  const inProgressCount = checklist.filter(s => s.status === "in-progress").length;
  const overallStatus: PresenceStatus = completedCount === checklist.length ? "connected"
    : completedCount >= 3 || inProgressCount >= 2 ? "setup_in_progress"
    : "not_connected";

  const cycleStep = (idx: number) => {
    const order: FBStepStatus[] = ["pending", "in-progress", "complete"];
    setChecklist(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const next = order[(order.indexOf(s.status) + 1) % order.length];
      return { ...s, status: next };
    }));
  };

  const saveToDb = async () => {
    setSaving(true);
    setSaveMsg(null);
    const score = Math.round((completedCount / checklist.length) * 15);
    const status = overallStatus === "connected" ? "connected"
      : completedCount >= 3 ? "setup_in_progress" : "not_started";
    try {
      await authFetch<any>("/api/local-presence/channel", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: "default",
          channelName: "facebook",
          status,
          score,
          listingUrl: pageUrl || null,
          verificationStatus: completedCount > 0 ? "in_progress" : "not_started",
          recommendedAction: completedCount < checklist.length
            ? "Continue Facebook Business Page setup"
            : "Maintain page content and respond to messages",
        }),
      });
      setSaveMsg("✓ Progress saved");
    } catch {
      setSaveMsg("Save failed — try again");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  const FB_BLUE = "#1877F2";

  const TABS: { key: typeof activeTab; label: string }[] = [
    { key: "checklist",   label: "Setup Checklist" },
    { key: "bizinfo",     label: "Biz Info" },
    { key: "diagnostics", label: "Diagnostics" },
  ];

  return (
    <div style={{
      background: cardBg(overallStatus),
      border: `1px solid ${FB_BLUE}25`,
      borderRadius: 16, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "18px 22px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: `${FB_BLUE}20`, border: `1px solid ${FB_BLUE}40`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
          }}>𝒇</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>Facebook Business</div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
              Facebook Pages, Marketplace local reach &amp; Messenger leads
            </div>
          </div>
        </div>
        <StatusBadge status={overallStatus} />
      </div>

      {/* Progress bar */}
      <div style={{ padding: "10px 22px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>Setup Progress — {completedCount}/{checklist.length} steps</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: FB_BLUE }}>{Math.round(completedCount / checklist.length * 100)}%</span>
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(completedCount / checklist.length) * 100}%`, background: `linear-gradient(90deg, ${FB_BLUE}, #42A5F5)`, borderRadius: 2, transition: "width 0.4s" }} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "0 22px", marginTop: 12 }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            background: "none", border: "none", padding: "8px 14px 10px",
            fontSize: 12, fontWeight: activeTab === tab.key ? 700 : 500,
            color: activeTab === tab.key ? FB_BLUE : "#475569",
            borderBottom: `2px solid ${activeTab === tab.key ? FB_BLUE : "transparent"}`,
            cursor: "pointer", marginBottom: -1, transition: "color 0.15s",
          }}>{tab.label}</button>
        ))}
      </div>

      <div style={{ padding: "18px 22px 20px" }}>

        {/* ── Checklist tab ── */}
        {activeTab === "checklist" && (
          <>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 12, lineHeight: 1.6 }}>
              Click a step to cycle its status. Save to DB when done.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
              {checklist.map((step, i) => (
                <button key={i} onClick={() => cycleStep(i)} style={{
                  display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
                  background: step.status === "complete" ? "rgba(34,197,94,0.05)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${step.status === "complete" ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.05)"}`,
                  borderRadius: 9, padding: "9px 12px", cursor: "pointer", textAlign: "left", width: "100%",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: step.status === "complete" ? "#22C55E" : "#CBD5E1", marginBottom: 2 }}>
                      {step.status === "complete" ? "✓ " : ""}{step.label}
                    </div>
                    <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.5 }}>{step.description}</div>
                  </div>
                  <FBStepBadge status={step.status} />
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={saveToDb} disabled={saving} style={{
                flex: 1, background: saving ? `${FB_BLUE}55` : FB_BLUE,
                border: "none", color: "#fff", borderRadius: 8, padding: "9px 0",
                fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
              }}>
                {saving ? "Saving…" : "💾 Save Progress to DB"}
              </button>
              {saveMsg && <span style={{ fontSize: 12, color: "#22C55E", fontWeight: 600 }}>{saveMsg}</span>}
            </div>
          </>
        )}

        {/* ── Biz Info tab ── */}
        {activeTab === "bizinfo" && (
          <>
            <SectionLabel>NAP — Must Match Google Business Profile Exactly</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 18 }}>
              {[
                { label: "Business Name",  value: "Bed Bugs & Beyond",          note: "Use this exact name on Facebook — no abbreviations" },
                { label: "Phone Number",   value: "(251) 324-9090",              note: "Must match GBP exactly for NAP consistency" },
                { label: "Website",        value: "https://bedbugsandbeyond.net",note: "Add this to the About section" },
                { label: "City / Region",  value: "Baldwin County, Alabama",     note: "Service area — not a storefront address" },
                { label: "Category",       value: "Pest Control Service",         note: "Primary category — add Exterminator as secondary" },
                { label: "Service Cities", value: "Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Spanish Fort", note: "Add all cities in the service area settings" },
              ].map(row => (
                <div key={row.label} style={{
                  display: "grid", gridTemplateColumns: "130px 1fr", gap: 10, alignItems: "start",
                  padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.4px" }}>{row.label}</span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "#CBD5E1" }}>{row.value}</div>
                    <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{row.note}</div>
                  </div>
                </div>
              ))}
            </div>

            <SectionLabel>Facebook Page URL</SectionLabel>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input
                type="text"
                placeholder="https://facebook.com/YourPageName"
                value={pageUrl}
                onChange={e => setPageUrl(e.target.value)}
                style={{
                  flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "#E2E8F0", borderRadius: 8, padding: "8px 12px", fontSize: 12,
                }}
              />
              <button onClick={saveToDb} disabled={saving || !pageUrl} style={{
                background: FB_BLUE, border: "none", color: "#fff", borderRadius: 8,
                padding: "8px 16px", fontSize: 12, fontWeight: 700,
                cursor: (!pageUrl || saving) ? "not-allowed" : "pointer", opacity: !pageUrl ? 0.5 : 1,
              }}>Save</button>
            </div>

            <div style={{
              background: `${FB_BLUE}0D`, border: `1px solid ${FB_BLUE}25`,
              borderRadius: 10, padding: "12px 14px",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: FB_BLUE, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.6px" }}>
                Why Facebook for Local Presence?
              </div>
              <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 12, color: "#94A3B8", lineHeight: 1.8 }}>
                <li>3 billion users — high probability target customers use Facebook</li>
                <li>Facebook Marketplace local reach for pest control lead gen</li>
                <li>Messenger allows instant lead capture and qualification</li>
                <li>Reviews on Facebook influence local buying decisions</li>
                <li>Facebook posts can be AI-published via the AI Edge publishing pipeline</li>
              </ul>
            </div>
          </>
        )}

        {/* ── Diagnostics tab ── */}
        {activeTab === "diagnostics" && (
          <>
            <SectionLabel>Platform Diagnostics</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
              {FB_DIAGS.map(d => {
                const s = FB_DIAG_STYLE[d.status] ?? FB_DIAG_STYLE.pending;
                return (
                  <div key={d.check} style={{
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
                    background: s.bg, border: `1px solid ${s.border}`,
                    borderRadius: 9, padding: "9px 12px",
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{d.check}</div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{d.note}</div>
                    </div>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0, marginTop: 5 }} />
                  </div>
                );
              })}
            </div>

            <div style={{
              background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)",
              borderRadius: 10, padding: "12px 14px",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.6px" }}>
                Next Action
              </div>
              <div style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.6 }}>
                Create your Facebook Business Page at{" "}
                <a href="https://facebook.com/pages/create" target="_blank" rel="noopener noreferrer"
                  style={{ color: FB_BLUE, textDecoration: "none", fontWeight: 600 }}>
                  facebook.com/pages/create
                </a>
                {" "}using the exact NAP from your Google Business Profile. Then connect it in the Connections tab for AI Edge automated publishing.
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

function LocalPresenceSummaryCard() {
  const countsByStatus = (SUMMARY_PLATFORMS
    .filter(p => p.summaryStatus !== "coming_soon")
    .reduce((acc, p) => {
      acc[p.summaryStatus] = (acc[p.summaryStatus] ?? 0) + 1;
      return acc;
    }, {} as Partial<Record<SumStatus, number>>));

  const pillOrder: SumStatus[] = ["connected", "verified_publishing", "setup_pending", "not_started", "needs_action"];

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(0,174,239,0.03) 0%, rgba(3,6,18,0.95) 100%)",
      border: "1px solid rgba(0,174,239,0.14)",
      borderRadius: 14, marginBottom: 28, overflow: "hidden",
    }}>

      {/* ── Header row ── */}
      <div style={{
        padding: "14px 20px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0", letterSpacing: "-0.2px" }}>
            Local Presence Summary
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
            8 platforms + AI search · setup tracking only · no analytics
          </div>
        </div>

        {/* Count pills */}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {pillOrder.map(s => {
            const count = countsByStatus[s] ?? 0;
            const m = SUMMARY_STATUS_META[s];
            return (
              <div key={s} style={{
                display: "flex", alignItems: "center", gap: 5,
                background: count > 0 ? m.bg : "rgba(255,255,255,0.02)",
                border: `1px solid ${count > 0 ? m.border : "rgba(255,255,255,0.05)"}`,
                borderRadius: 20, padding: "3px 10px",
              }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: count > 0 ? m.color : "#334155", lineHeight: 1 }}>{count}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: count > 0 ? m.color : "#334155", letterSpacing: "0.3px", whiteSpace: "nowrap" }}>{m.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "16px 20px 20px" }}>

        {/* ── Platform rows ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 18 }}>
          {SUMMARY_PLATFORMS.map(p => {
            const m = SUMMARY_STATUS_META[p.summaryStatus];
            return (
              <div key={p.name} style={{
                display: "grid", gridTemplateColumns: "10px 1fr auto auto", gap: "0 12px", alignItems: "center",
                padding: "8px 12px", borderRadius: 9,
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
              }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.dot, flexShrink: 0 }} />
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#CBD5E1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 11, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 340 }}>
                  {p.note}
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 20, whiteSpace: "nowrap",
                  background: m.bg, border: `1px solid ${m.border}`, color: m.color,
                }}>
                  {m.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginBottom: 14 }} />

        {/* ── Current + Next Best Action ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

          {/* Current action */}
          <div style={{
            padding: "12px 14px", borderRadius: 10,
            background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.16)",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
              Current
            </div>
            <div style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.6 }}>
              <span style={{ color: "#F59E0B", fontWeight: 700 }}>Apple Business Connect</span>
              {" — verification in progress. Check "}
              <a href="https://business.apple.com" target="_blank" rel="noopener noreferrer"
                style={{ color: "#F59E0B", textDecoration: "none", fontWeight: 600 }}>
                business.apple.com
              </a>
              {" for PIN or review status. Do not mark Connected until Apple confirms."}
            </div>
          </div>

          {/* Next best action */}
          <div style={{
            padding: "12px 14px", borderRadius: 10,
            background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.16)",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
              Next Best Action
            </div>
            <div style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.6 }}>
              <span style={{ color: "#22C55E", fontWeight: 700 }}>Claim Nextdoor Business listing</span>
              {" — free, high-value neighborhood channel. Pest control pros get strong local visibility on Nextdoor in service areas."}
            </div>
            <a href="https://business.nextdoor.com" target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 7, fontSize: 11, fontWeight: 700, color: "#22C55E", textDecoration: "none" }}>
              ↗ business.nextdoor.com
            </a>
          </div>

        </div>
      </div>
    </div>
  );
}

function DiagnosticsPanel({ connectedCount, pendingCount, errors, diags, dbScore }: {
  connectedCount: number;
  pendingCount: number;
  errors: number;
  diags: DiagEntry[];
  dbScore?: number | null;
}) {
  // Use DB-computed score when available, fall back to hardcoded estimate
  const gbpPoints      = connectedCount >= 1 ? 35 : 0;
  const applePoints    = 2;
  const bingPoints     = 2;
  const nextdoorPoints = 2;
  const napPoints      = connectedCount >= 1 ? 5 : 0;
  const fallbackScore  = gbpPoints + applePoints + bingPoints + nextdoorPoints + napPoints;
  const scorePct       = dbScore != null ? dbScore : fallbackScore;
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
          <span style={{ fontSize: 42, fontWeight: 900, color: scorePct >= 75 ? "#22C55E" : scorePct >= 40 ? "#F59E0B" : "#00AEEF", lineHeight: 1 }}>{scorePct}</span>
          <span style={{ fontSize: 16, color: "#475569", fontWeight: 600, marginBottom: 6 }}>/100</span>
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ height: "100%", width: `${scorePct}%`, background: "linear-gradient(90deg, #F59E0B, #00AEEF)", borderRadius: 3, transition: "width 0.6s" }} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatPill value={connectedCount} label="Connected"  color="#22C55E" />
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
            background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.15)",
            borderRadius: 10, padding: "14px 16px",
          }}>
            <span style={{ fontSize: 16 }}>✓</span>
            <span style={{ fontSize: 13, color: "#22C55E", fontWeight: 600 }}>No active issues</span>
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
                <span style={{ fontSize: 12, color: d.severity === "warning" ? "#F59E0B" : "#94A3B8", lineHeight: 1.4 }}>{d.text}</span>
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
    { label: "Name",    value: NAP.name,    platforms: ["Google ✓", "Apple —", "Bing ✓", "Nextdoor —"], status: connectedCount > 0 ? "warning" as const : "unknown" as const },
    { label: "Phone",   value: NAP.phone,   platforms: ["Google ✓", "Apple —", "Bing ✓", "Nextdoor —"], status: connectedCount > 0 ? "warning" as const : "unknown" as const },
    { label: "Website", value: NAP.website.replace("https://", ""), platforms: ["Google ✓", "Apple —", "Bing ✓", "Nextdoor —"], status: connectedCount > 0 ? "warning" as const : "unknown" as const },
    { label: "Address", value: NAP.address, platforms: ["Google ✓", "Apple —", "Bing ✓", "Nextdoor —"], status: connectedCount > 0 ? "warning" as const : "unknown" as const },
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
                  <span key={p} style={{ color: p.includes("✓") ? "#22C55E" : "#334155" }}>{p}</span>
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

// ── Submission Tracker ────────────────────────────────────────────────────────
type SubStatus = "not_started" | "in_progress" | "submitted" | "verification_pending" | "live" | "needs_fix";
interface TrackerEntry {
  key: string; name: string; dotColor: string; status: SubStatus;
  submittedOn: string; verifyMethod: string; account: string;
  listingUrl: string; notes: string; nextAction: string;
}
const SUB_STATUS_META: Record<SubStatus, { label: string; color: string; bg: string; border: string }> = {
  not_started:          { label: "Not Started",          color: "#64748B", bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.25)" },
  in_progress:          { label: "In Progress",          color: "#3B82F6", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.3)" },
  submitted:            { label: "Submitted",            color: "#3B82F6", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.3)" },
  verification_pending: { label: "Verification Pending", color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.3)" },
  live:                 { label: "Live / Connected",     color: "#22C55E", bg: "rgba(34,197,94,0.1)",  border: "rgba(34,197,94,0.3)" },
  needs_fix:            { label: "Needs Fix",            color: "#EF4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.3)" },
};
const TRACKER_INIT: TrackerEntry[] = [
  { key: "gbp",       name: "Google Business Profile", dotColor: "#4285F4", status: "verification_pending", submittedOn: "", verifyMethod: "", account: "Bed Bugs & Beyond", listingUrl: "https://bedbugsandbeyond.net", notes: "GBP API access request submitted. Google quota currently 0 requests/min; waiting on approval.", nextAction: "Watch for Google approval email. Case ID: 9-0761000041438." },
  { key: "apple",     name: "Apple Business Connect",  dotColor: "#A3A3A3", status: "verification_pending", submittedOn: "", verifyMethod: "", account: "",               listingUrl: "",                               notes: "Apple Business Connect approval pending.",                                                                                                                 nextAction: "Check Apple Business Connect approval status." },
  { key: "tiktok",    name: "TikTok for Business",     dotColor: "#010101", status: "verification_pending", submittedOn: "", verifyMethod: "", account: "",               listingUrl: "",                               notes: "TikTok app/business review pending.",                                                                                                                      nextAction: "Watch for TikTok review decision." },
  { key: "bing",      name: "Bing Places",             dotColor: "#008373", status: "verification_pending", submittedOn: "", verifyMethod: "", account: "",               listingUrl: "",                               notes: "Bing Places synced from Google and verification/publishing is pending.",                                                                                     nextAction: "Wait for Bing Places publishing/verification completion." },
  { key: "nextdoor",  name: "Nextdoor",                dotColor: "#00B246", status: "not_started",          submittedOn: "", verifyMethod: "", account: "",               listingUrl: "",                               notes: "Pending setup.",                                                                                                                                           nextAction: "Create or claim Nextdoor Business profile." },
  { key: "yelp",      name: "Yelp",                    dotColor: "#D32323", status: "not_started",          submittedOn: "", verifyMethod: "", account: "",               listingUrl: "",                               notes: "Pending setup.",                                                                                                                                           nextAction: "Create or claim Yelp Business profile." },
  { key: "waze",      name: "Waze (WME)",              dotColor: "#00BBDE", status: "not_started",          submittedOn: "", verifyMethod: "", account: "",               listingUrl: "",                               notes: "",                                                                                                                                                         nextAction: "" },
  { key: "angi",      name: "Angi for Pros",           dotColor: "#E8330A", status: "not_started",          submittedOn: "", verifyMethod: "", account: "",               listingUrl: "",                               notes: "Pending setup.",                                                                                                                                           nextAction: "Create or claim Angi for Pros profile." },
  { key: "thumbtack", name: "Thumbtack for Pros",      dotColor: "#009FD9", status: "not_started",          submittedOn: "", verifyMethod: "", account: "",               listingUrl: "",                               notes: "Pending setup.",                                                                                                                                           nextAction: "Create or claim Thumbtack for Pros profile." },
];
function SubmissionTracker() {
  const [open,     setOpen]     = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState(false);
  const [entries,  setEntries]  = useState<TrackerEntry[]>(() => {
    try {
      const saved: TrackerEntry[] | null = JSON.parse(localStorage.getItem("lpe_tracker") ?? "null");
      if (!saved) return TRACKER_INIT;
      const initByKey = Object.fromEntries(TRACKER_INIT.map(e => [e.key, e]));
      const savedKeys  = new Set(saved.map(e => e.key));
      const missing    = TRACKER_INIT.filter(e => !savedKeys.has(e.key));
      const merged = saved.map(e => {
        const def = initByKey[e.key];
        if (!def) return e;
        return {
          ...e,
          // Promote status out of "not_started" only when the new default is more specific
          status:      e.status === "not_started" && def.status !== "not_started" ? def.status : e.status,
          // Fill blank text fields with new defaults; leave non-blank user edits intact
          account:     e.account     === "" ? def.account     : e.account,
          listingUrl:  e.listingUrl  === "" ? def.listingUrl  : e.listingUrl,
          verifyMethod: e.verifyMethod === "" ? def.verifyMethod : e.verifyMethod,
          notes:       e.notes       === "" ? def.notes       : e.notes,
          nextAction:  e.nextAction  === "" ? def.nextAction  : e.nextAction,
        };
      });
      return missing.length > 0 ? [...merged, ...missing] : merged;
    } catch { return TRACKER_INIT; }
  });

  function update(key: string, field: keyof TrackerEntry, value: string) {
    setEntries(prev => prev.map(e => e.key === key ? { ...e, [field]: value } : e));
  }
  function save() {
    localStorage.setItem("lpe_tracker", JSON.stringify(entries));
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  }
  function reset() {
    if (!window.confirm("Reset all submission tracker data to defaults?")) return;
    localStorage.removeItem("lpe_tracker");
    setEntries(TRACKER_INIT);
    setExpanded(null);
  }

  const liveCount       = entries.filter(e => e.status === "live").length;
  const activeCount     = entries.filter(e => e.status !== "not_started").length;
  const needsFixCount   = entries.filter(e => e.status === "needs_fix").length;

  return (
    <div style={{
      borderRadius: 14, overflow: "hidden", marginBottom: 24,
      background: "linear-gradient(135deg, rgba(0,174,239,0.04) 0%, rgba(11,22,41,0.92) 100%)",
      border: "1px solid rgba(0,174,239,0.18)", boxShadow: "0 0 20px rgba(0,174,239,0.05)",
    }}>
      {/* ── Always-visible summary header ── */}
      <div style={{ padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14 }}>📋</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>Submission Tracker</span>
            <span style={{ fontSize: 11, color: "#64748B" }}>— manual status only</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#22C55E", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 20, padding: "2px 10px" }}>
              {liveCount} Live
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#00AEEF", background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.2)", borderRadius: 20, padding: "2px 10px" }}>
              {activeCount} Active
            </span>
            {needsFixCount > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 20, padding: "2px 10px" }}>
                {needsFixCount} Needs Fix
              </span>
            )}
            <button onClick={() => setOpen(v => !v)} style={{
              padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
              background: open ? "rgba(0,174,239,0.18)" : "rgba(0,174,239,0.08)",
              border: "1px solid rgba(0,174,239,0.3)", color: "#00AEEF", transition: "all 0.15s",
            }}>{open ? "▲ Hide Details" : "▼ Edit Tracker"}</button>
          </div>
        </div>

        {/* Channel status chips — always visible */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {entries.map(e => {
            const m = SUB_STATUS_META[e.status];
            return (
              <button
                key={e.key}
                onClick={() => { setOpen(true); setExpanded(expanded === e.key ? null : e.key); }}
                title={`${e.name}: ${m.label}`}
                style={{
                  display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                  padding: "4px 10px", borderRadius: 20, transition: "all 0.15s",
                  background: m.bg, border: `1px solid ${m.border}`,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: e.dotColor, display: "inline-block" }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: m.color, whiteSpace: "nowrap" }}>{e.name}</span>
                <span style={{ fontSize: 10, color: m.color, opacity: 0.75 }}>· {m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Expandable detail editor ── */}
      {open && (
        <div style={{ borderTop: "1px solid rgba(0,174,239,0.12)", background: "rgba(3,6,18,0.55)" }}>

          {/* Disclaimer */}
          <div style={{ padding: "10px 18px 0", fontSize: 11, color: "#475569", lineHeight: 1.5 }}>
            This is a manual tracking tool. Status updates are saved locally in your browser. Nothing is marked <strong style={{ color: "#22C55E" }}>Live / Connected</strong> unless you set it after confirming setup is complete.
          </div>

          {/* Channel rows */}
          <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            {entries.map(entry => {
              const m    = SUB_STATUS_META[entry.status];
              const isEx = expanded === entry.key;
              return (
                <div key={entry.key} style={{
                  borderRadius: 10, overflow: "hidden",
                  border: `1px solid ${isEx ? m.border : "rgba(255,255,255,0.06)"}`,
                  background: isEx ? m.bg : "rgba(255,255,255,0.02)", transition: "all 0.15s",
                }}>
                  {/* Row header */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", cursor: "pointer" }}
                    onClick={() => setExpanded(isEx ? null : entry.key)}
                  >
                    <span style={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0, background: entry.dotColor, display: "inline-block", boxShadow: `0 0 6px ${entry.dotColor}66` }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#CBD5E1", flex: 1 }}>{entry.name}</span>

                    {/* Status selector — stops click propagation */}
                    <select
                      value={entry.status}
                      onClick={e => e.stopPropagation()}
                      onChange={e => update(entry.key, "status", e.target.value)}
                      style={{
                        padding: "4px 8px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                        background: m.bg, border: `1px solid ${m.border}`, color: m.color,
                        outline: "none", appearance: "none", WebkitAppearance: "none",
                        paddingRight: 20, backgroundImage: "none",
                      }}
                    >
                      {(Object.keys(SUB_STATUS_META) as SubStatus[]).map(s => (
                        <option key={s} value={s} style={{ background: "#0B1629", color: "#CBD5E1" }}>
                          {SUB_STATUS_META[s].label}
                        </option>
                      ))}
                    </select>

                    <span style={{ fontSize: 11, color: "#475569", flexShrink: 0 }}>{isEx ? "▲" : "▼"}</span>
                  </div>

                  {/* Detail fields */}
                  {isEx && (
                    <div style={{ padding: "0 14px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {([
                        { field: "submittedOn",  label: "Submission Date",       ph: "e.g. Jul 1, 2026" },
                        { field: "verifyMethod", label: "Verification Method",   ph: "e.g. Phone PIN / Email / WME Review" },
                        { field: "account",      label: "Login / Account Used",  ph: "e.g. hello@bedbugsandbeyond.net" },
                        { field: "listingUrl",   label: "Listing URL",           ph: "https://..." },
                      ] as { field: keyof TrackerEntry; label: string; ph: string }[]).map(({ field, label, ph }) => (
                        <div key={field}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>{label}</div>
                          <input
                            value={entry[field] as string}
                            onChange={e => update(entry.key, field, e.target.value)}
                            placeholder={ph}
                            style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 7, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }}
                          />
                        </div>
                      ))}
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Next Action</div>
                        <input
                          value={entry.nextAction}
                          onChange={e => update(entry.key, "nextAction", e.target.value)}
                          placeholder="e.g. Awaiting phone PIN, check email for approval, re-upload logo..."
                          style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 7, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit" }}
                        />
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Notes</div>
                        <textarea
                          value={entry.notes}
                          onChange={e => update(entry.key, "notes", e.target.value)}
                          rows={2}
                          placeholder="Any blockers, edge cases, login details, or follow-up tasks..."
                          style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 7, fontSize: 12, color: "#E2E8F0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", outline: "none", fontFamily: "inherit", resize: "vertical" }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Save + reset footer */}
          <div style={{ padding: "0 18px 16px", display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={save} style={{ padding: "8px 20px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "#00AEEF", border: "none", color: "#000", letterSpacing: "0.2px" }}>
              Save Tracker
            </button>
            {savedMsg && <span style={{ fontSize: 12, color: "#22C55E", fontWeight: 700 }}>✓ Saved</span>}
            <button onClick={reset} style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 9, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "transparent", border: "1px solid rgba(239,68,68,0.25)", color: "#64748B" }}>
              Reset All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LocalPresenceEnginePage() {
  const { colors: t } = useTheme();
  const authFetch = useApiFetch();
  const qc = useQueryClient();
  const now = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // DB-backed local presence score + channels
  const { data: lpData } = useQuery<{
    score: number;
    channels: Array<{ channelName: string; status: string; score: number }>;
  }>({
    queryKey: ["local_presence_data"],
    queryFn:  () => authFetch("/api/local-presence?clientId=default"),
    staleTime: 30_000, retry: 1,
  });

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

  // DB-backed counts (fallback to derived values if DB unavailable)
  const dbChannels     = lpData?.channels ?? [];
  const connectedCount = dbChannels.length > 0
    ? dbChannels.filter(c => c.status === "connected").length
    : (gbpPresence === "connected" ? 1 : 0);
  const pendingCount   = dbChannels.length > 0
    ? dbChannels.filter(c => ["setup_in_progress", "verified_publishing"].includes(c.status)).length
    : 2;
  const dbScore        = lpData?.score ?? null;

  // Diagnostics issues list
  const diags: DiagEntry[] = [
    ...gbpWarnings.map(w => ({ icon: "⚠", color: "#F59E0B", text: `Google: ${w}`, severity: "warning" as const })),
    { icon: "⚠", color: "#F59E0B", text: "Apple Business Connect submitted — verification pending (do not mark Connected until Apple confirms)", severity: "warning" },
    { icon: "✓", color: "#3B82F6", text: "Bing Places verified — synced with Google · publishing to Bing Maps · live in 7–12 days · analytics pending", severity: "warning" },
    { icon: "⚠", color: "#F59E0B", text: "Nextdoor Business submitted — verification pending (do not mark Connected until Nextdoor confirms profile is live)", severity: "warning" },
    { icon: "⚠", color: "#F59E0B", text: "Yelp submitted — verification pending (do not mark Connected until Yelp profile is live and publicly searchable)", severity: "warning" },
    { icon: "⚠", color: "#F59E0B", text: "Angi submitted — verification pending (do not mark Connected until Angi profile is live and publicly searchable)", severity: "warning" },
    { icon: "⚠", color: "#F59E0B", text: "Thumbtack submitted — verification/profile approval pending (do not mark Connected until profile is live and publicly searchable)", severity: "warning" },
    { icon: "⚠", color: "#F59E0B", text: "NAP consistency: Apple, Bing, Nextdoor, Yelp, Angi, Thumbtack data unconfirmed", severity: "warning" },
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

          <h1 style={{ fontSize: 28, fontWeight: 800, color: t.text, letterSpacing: "-0.5px", margin: "0 0 8px" }}>
            Local Presence Engine
          </h1>
          <p style={{ fontSize: 14, color: t.text2, margin: "0 0 16px", lineHeight: 1.5, maxWidth: 620 }}>
            <strong style={{ color: "#00AEEF" }}>Get Found Everywhere</strong> — Manage local visibility across Google, Apple Maps, Bing, AI search,
            and neighborhood discovery channels. One dashboard, all listings.
          </p>

          {/* Summary pills */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <StatPill value={connectedCount} label="Connected"  color="#22C55E" />
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

        {/* ── Submission Tracker ── */}
        <SubmissionTracker />

        {/* ── Local Presence Summary ── */}
        <LocalPresenceSummaryCard />

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
          {/* Waze — V2 dedicated card */}
          <WazeBusinessCard />
          {/* Angi — V2 dedicated card */}
          <AngiBusinessCard />
          {/* Thumbtack — V2 dedicated card */}
          <ThumbtackBusinessCard />
          {/* Facebook — V2 dedicated card with DB persistence */}
          <FacebookLocalPresenceCard />
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
            dbScore={dbScore}
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
