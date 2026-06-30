import { useState } from "react";
import { AppShell } from "@/components/app-shell";

// ── Demo client ────────────────────────────────────────────────────────────────
const CLIENT = {
  name: "Bed Bugs & Beyond",
  phone: "(251) 324-9090",
  website: "https://aiedgesolutions.online",
  category: "Pest Control",
  serviceArea: "Baldwin County, Alabama",
  cities: "Foley, Gulf Shores, Orange Beach, Fairhope, Daphne, Spanish Fort",
};

// ── Platform definitions ───────────────────────────────────────────────────────
type ChecklistItem = { label: string; done: boolean };
type PlatformStatus = "connected" | "pending" | "action_required";

type Platform = {
  id: string;
  name: string;
  icon: string;
  iconColor: string;
  status: PlatformStatus;
  statusLabel: string;
  description: string;
  externalUrl: string | null;
  btnLabel: string;
  checklist: ChecklistItem[];
  lastChecked: string | null;
};

const PLATFORMS: Platform[] = [
  {
    id: "google_business",
    name: "Google Business Profile",
    icon: "G",
    iconColor: "#EA4335",
    status: "connected",
    statusLabel: "Connected",
    description: "Google Search, Maps, and AI Overview visibility",
    externalUrl: "https://business.google.com",
    btnLabel: "Manage GBP",
    lastChecked: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    checklist: [
      { label: "Business claimed and verified", done: true },
      { label: "Business name confirmed", done: true },
      { label: "Phone number added", done: true },
      { label: "Website linked", done: true },
      { label: "Service area configured", done: true },
      { label: "Categories set", done: true },
      { label: "Hours added", done: true },
      { label: "Photos/logo uploaded", done: true },
      { label: "Google Maps visibility confirmed", done: true },
    ],
  },
  {
    id: "apple_business",
    name: "Apple Business Connect",
    icon: "",
    iconColor: "#A2AAAD",
    status: "pending",
    statusLabel: "Setup Pending",
    description: "Apple Maps, Siri, and iOS Spotlight visibility",
    externalUrl: "https://businessconnect.apple.com",
    btnLabel: "Open Apple Business Connect",
    lastChecked: null,
    checklist: [
      { label: "Claim or create business listing", done: false },
      { label: "Verify business ownership", done: false },
      { label: "Add business name", done: false },
      { label: "Add phone number", done: false },
      { label: "Add website", done: false },
      { label: "Add logo / photos", done: false },
      { label: "Add service area", done: false },
      { label: "Add categories", done: false },
      { label: "Add business hours", done: false },
      { label: "Confirm Apple Maps visibility", done: false },
    ],
  },
  {
    id: "bing_places",
    name: "Bing Places for Business",
    icon: "B",
    iconColor: "#00ADEF",
    status: "pending",
    statusLabel: "Setup Pending",
    description: "Bing Maps, Microsoft Search, and Copilot AI visibility",
    externalUrl: "https://www.bingplaces.com",
    btnLabel: "Open Bing Places",
    lastChecked: null,
    checklist: [
      { label: "Claim or create listing", done: false },
      { label: "Import from Google Business Profile (if available)", done: false },
      { label: "Verify business ownership", done: false },
      { label: "Add phone number", done: false },
      { label: "Add website", done: false },
      { label: "Add service area", done: false },
      { label: "Add business category", done: false },
      { label: "Add hours and photos", done: false },
      { label: "Confirm Bing Maps visibility", done: false },
    ],
  },
  {
    id: "nextdoor",
    name: "Nextdoor Business",
    icon: "N",
    iconColor: "#8DC641",
    status: "pending",
    statusLabel: "Setup Pending",
    description: "Neighborhood discovery, local referrals, and community reviews",
    externalUrl: "https://business.nextdoor.com",
    btnLabel: "Open Nextdoor Business",
    lastChecked: null,
    checklist: [
      { label: "Create or claim business page", done: false },
      { label: "Add service area / neighborhoods", done: false },
      { label: "Add business phone number", done: false },
      { label: "Add website", done: false },
      { label: "Add services offered", done: false },
      { label: "Add logo and photos", done: false },
      { label: "Enable neighborhood visibility", done: false },
      { label: "Track recommendations and reviews", done: false },
    ],
  },
];

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<PlatformStatus, { dot: string; bg: string; border: string; color: string }> = {
  connected:       { dot: "#10B981", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)",  color: "#10B981" },
  pending:         { dot: "#F59E0B", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)",  color: "#F59E0B" },
  action_required: { dot: "#EF4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)",   color: "#EF4444" },
};

// ── Checklist subcomponent ─────────────────────────────────────────────────────
function Checklist({ items }: { items: ChecklistItem[] }) {
  const done   = items.filter(i => i.done).length;
  const pct    = Math.round((done / items.length) * 100);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.8px", textTransform: "uppercase" }}>
          Setup Checklist
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? "#10B981" : "#F59E0B" }}>
          {done}/{items.length}
        </span>
      </div>
      {/* Progress bar */}
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#10B981" : "#F59E0B", borderRadius: 2, transition: "width 0.4s" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{
              width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
              background: item.done ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${item.done ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.1)"}`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9,
              color: item.done ? "#10B981" : "transparent",
            }}>
              {item.done ? "✓" : ""}
            </span>
            <span style={{ fontSize: 12, color: item.done ? "#94A3B8" : "#CBD5E1", lineHeight: "1.4", textDecoration: item.done ? "line-through" : "none" }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Platform card ──────────────────────────────────────────────────────────────
function PlatformCard({ platform }: { platform: Platform }) {
  const [expanded, setExpanded] = useState(platform.status !== "connected");
  const st = STATUS_STYLE[platform.status];
  const done = platform.checklist.filter(i => i.done).length;

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)",
      border: `1px solid ${st.border}`,
      borderRadius: 14, overflow: "hidden",
    }}>
      {/* Card header */}
      <div style={{ padding: "18px 20px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Platform icon */}
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `${platform.iconColor}18`,
              border: `1px solid ${platform.iconColor}30`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: platform.icon === "" ? 22 : 16,
              fontWeight: 900, color: platform.iconColor, flexShrink: 0,
            }}>
              {platform.icon === "" ? "🍎" : platform.icon}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", marginBottom: 3 }}>{platform.name}</div>
              <div style={{ fontSize: 11.5, color: "#64748B" }}>{platform.description}</div>
            </div>
          </div>
          {/* Status badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            background: st.bg, border: `1px solid ${st.border}`,
            borderRadius: 20, padding: "4px 10px", flexShrink: 0,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: st.color }}>{platform.statusLabel}</span>
          </div>
        </div>

        {/* Business detail rows */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
          {[
            { label: "Business", value: CLIENT.name },
            { label: "Phone", value: CLIENT.phone },
            { label: "Website", value: CLIENT.website.replace("https://", "") },
            { label: "Category", value: CLIENT.category },
            { label: "Service Area", value: CLIENT.serviceArea },
            { label: "Cities Served", value: CLIENT.cities },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 1 }}>{label}</div>
              <div style={{ fontSize: 12, color: "#94A3B8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Last checked + checklist progress summary */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "#475569" }}>
            {platform.lastChecked
              ? <span>Last checked: <span style={{ color: "#64748B" }}>{platform.lastChecked}</span></span>
              : <span style={{ color: "#475569" }}>Not yet set up</span>
            }
          </div>
          <div style={{ fontSize: 11, color: "#64748B" }}>
            {done}/{platform.checklist.length} steps complete
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.04)" }} />

      {/* Checklist toggle + actions */}
      <div style={{ padding: "12px 20px 16px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: expanded ? 14 : 0 }}>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              flex: 1, padding: "8px 14px", borderRadius: 9, cursor: "pointer",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              color: "#94A3B8", fontSize: 12, fontWeight: 600, textAlign: "left",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span style={{ fontSize: 10 }}>{expanded ? "▲" : "▼"}</span>
            {expanded ? "Hide" : "Show"} Checklist
          </button>
          {platform.externalUrl && (
            <a
              href={platform.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 2, padding: "8px 14px", borderRadius: 9, cursor: "pointer",
                background: platform.status === "connected" ? "rgba(16,185,129,0.1)" : "rgba(0,174,239,0.1)",
                border: `1px solid ${platform.status === "connected" ? "rgba(16,185,129,0.3)" : "rgba(0,174,239,0.3)"}`,
                color: platform.status === "connected" ? "#10B981" : "#00AEEF",
                fontSize: 12, fontWeight: 700, textDecoration: "none",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              }}
            >
              ↗ {platform.btnLabel}
            </a>
          )}
        </div>
        {expanded && <Checklist items={platform.checklist} />}
      </div>
    </div>
  );
}

// ── Visibility score placeholder ───────────────────────────────────────────────
function VisibilityScore() {
  const channels = [
    { name: "Google Search & Maps", icon: "G", color: "#EA4335",  status: "Live",    score: 100 },
    { name: "Apple Maps & Siri",    icon: "🍎", color: "#A2AAAD",  status: "Pending", score: 0 },
    { name: "Bing / Copilot AI",    icon: "B", color: "#00ADEF",  status: "Pending", score: 0 },
    { name: "Nextdoor Neighborhood",icon: "N", color: "#8DC641",  status: "Pending", score: 0 },
    { name: "AI Search Visibility", icon: "✦", color: "#8B5CF6",  status: "Partial", score: 35 },
    { name: "Social Platforms",     icon: "◈", color: "#F59E0B",  status: "Live",    score: 80 },
  ];

  const overall = Math.round(channels.reduce((a, c) => a + c.score, 0) / channels.length);

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(0,174,239,0.12)",
      borderRadius: 14, padding: "20px 22px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>
            Local Visibility Score
          </div>
          <div style={{ fontSize: 11.5, color: "#64748B" }}>Placeholder — live scoring in V2</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#00AEEF", lineHeight: 1 }}>{overall}</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>out of 100</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {channels.map(ch => (
          <div key={ch.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6,
              background: `${ch.color}18`, border: `1px solid ${ch.color}30`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 900, color: ch.color, flexShrink: 0,
            }}>
              {ch.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "#CBD5E1", fontWeight: 500, marginBottom: 4 }}>{ch.name}</div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${ch.score}%`, background: ch.score === 100 ? "#10B981" : ch.score > 0 ? "#F59E0B" : "rgba(255,255,255,0.08)", borderRadius: 2, transition: "width 0.6s" }} />
              </div>
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, flexShrink: 0, minWidth: 54, textAlign: "right",
              color: ch.status === "Live" ? "#10B981" : ch.status === "Partial" ? "#F59E0B" : "#475569",
            }}>
              {ch.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function LocalPresenceEnginePage() {
  return (
    <AppShell>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{
            background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.25)",
            borderRadius: 8, padding: "4px 10px",
            fontSize: 10, fontWeight: 700, color: "#00AEEF", letterSpacing: "1px", textTransform: "uppercase",
          }}>
            Local Business Division
          </div>
          <div style={{
            background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: 8, padding: "4px 10px",
            fontSize: 10, fontWeight: 700, color: "#F59E0B", letterSpacing: "1px", textTransform: "uppercase",
          }}>
            V1
          </div>
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 900, color: "#F1F5F9", margin: 0, letterSpacing: "-0.3px" }}>
          Local Presence Engine
        </h1>

        {/* AI Edge positioning copy */}
        <div style={{
          marginTop: 14,
          background: "linear-gradient(135deg, rgba(0,174,239,0.06) 0%, rgba(139,92,246,0.04) 100%)",
          border: "1px solid rgba(0,174,239,0.12)",
          borderRadius: 12, padding: "14px 18px",
          fontSize: 13.5, color: "#94A3B8", lineHeight: "1.55",
        }}>
          <span style={{ color: "#00AEEF", fontWeight: 700 }}>Get Found Everywhere</span>
          {" — "}AI Edge helps local businesses improve visibility across{" "}
          <span style={{ color: "#E2E8F0" }}>Google, Apple Maps, Bing, AI search, social platforms, and neighborhood discovery channels</span>.
          Control every listing from one place, track setup completion, and ensure your business shows up everywhere customers are searching.
        </div>
      </div>

      {/* Demo client banner */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12, padding: "14px 18px", marginBottom: 28,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 9,
          background: "rgba(0,174,239,0.1)", border: "1px solid rgba(0,174,239,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, flexShrink: 0,
        }}>
          🐛
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#E2E8F0" }}>{CLIENT.name}</div>
          <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 2 }}>
            {CLIENT.category} · {CLIENT.serviceArea} · {CLIENT.phone} · {CLIENT.website.replace("https://", "")}
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>
            Cities: {CLIENT.cities}
          </div>
        </div>
        <div style={{
          background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.18)",
          borderRadius: 8, padding: "4px 10px",
          fontSize: 10, fontWeight: 700, color: "#00AEEF", letterSpacing: "0.8px", textTransform: "uppercase",
        }}>
          Demo Client
        </div>
      </div>

      {/* Local visibility score */}
      <div style={{ marginBottom: 28 }}>
        <VisibilityScore />
      </div>

      {/* Section header */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "1.2px", textTransform: "uppercase" }}>
          Listing Channels
        </div>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
        <div style={{ fontSize: 11, color: "#475569" }}>
          1 of 4 channels active
        </div>
      </div>

      {/* Platform cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 16, marginBottom: 40 }}>
        {PLATFORMS.map(p => <PlatformCard key={p.id} platform={p} />)}
      </div>

      {/* Why it matters section */}
      <div style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14, padding: "22px 24px",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 16 }}>
          Why Each Channel Matters
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {[
            { icon: "G", color: "#EA4335", title: "Google / AI Overview", body: "90%+ of local searches. Powers Google Maps, AI Overviews, and voice search." },
            { icon: "🍎", color: "#A2AAAD", title: "Apple Maps / Siri",    body: "iPhone and Mac users. Siri routes, Apple Wallet business cards, iOS Spotlight." },
            { icon: "B", color: "#00ADEF", title: "Bing / Copilot AI",    body: "Microsoft search, Copilot AI answers, Xbox, Windows 11, and Edge browser." },
            { icon: "N", color: "#8DC641", title: "Nextdoor",             body: "Neighborhood referrals and community trust. High-intent local leads from neighbors." },
          ].map(({ icon, color, title, body }) => (
            <div key={title} style={{ display: "flex", gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                background: `${color}15`, border: `1px solid ${color}25`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 900, color,
              }}>
                {icon}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#E2E8F0", marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 11.5, color: "#64748B", lineHeight: "1.45" }}>{body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
