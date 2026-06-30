import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────

type PresenceStatus = "connected" | "pending" | "not_connected" | "error" | "coming_soon";
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

// ── Demo client NAP data ───────────────────────────────────────────────────────
const NAP = {
  name: "Bed Bugs & Beyond",
  address: "Baldwin County, Alabama",
  phone: "(251) 324-9090",
  website: "https://aiedgesolutions.online",
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
  coming_soon:  { label: "Coming Soon",   bg: "rgba(139,92,246,0.12)",  color: "#8B5CF6", dot: "#8B5CF6", border: "rgba(139,92,246,0.2)"   },
};

const HEALTH_STYLE: Record<HealthStatus, { label: string; color: string; dot: string }> = {
  healthy: { label: "Healthy", color: "#10B981", dot: "#10B981" },
  warning: { label: "Warning", color: "#F59E0B", dot: "#F59E0B" },
  error:   { label: "Error",   color: "#EF4444", dot: "#EF4444" },
  unknown: { label: "Unknown", color: "#475569", dot: "#334155" },
};

// ── Platform card background derivation ───────────────────────────────────────
function cardBg(status: PresenceStatus) {
  if (status === "connected") return "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(11,22,41,0.9) 100%)";
  if (status === "error")     return "linear-gradient(135deg, rgba(239,68,68,0.05) 0%, rgba(11,22,41,0.9) 100%)";
  if (status === "pending")   return "linear-gradient(135deg, rgba(245,158,11,0.04) 0%, rgba(11,22,41,0.9) 100%)";
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

// ── Diagnostics panel ──────────────────────────────────────────────────────────
type DiagEntry = { icon: string; color: string; text: string; severity: "warning" | "info" };

function DiagnosticsPanel({ connectedCount, pendingCount, errors, diags }: {
  connectedCount: number;
  pendingCount: number;
  errors: number;
  diags: DiagEntry[];
}) {
  const total    = 4;
  const scorePct = Math.round((connectedCount / total) * 100 * 0.55 + (connectedCount > 0 ? 10 : 0));
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
    { icon: "⚠", color: "#F59E0B", text: "Apple Business Connect listing not yet claimed",           severity: "warning" },
    { icon: "⚠", color: "#F59E0B", text: "Bing Places listing not yet verified",                      severity: "warning" },
    { icon: "⚠", color: "#F59E0B", text: "Nextdoor Business page not yet created",                    severity: "warning" },
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

        {/* Demo client banner */}
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
          {/* Apple, Bing, Nextdoor — static V1 */}
          {PLATFORM_DEFS.slice(1).map(def => (
            <PlatformCard
              key={def.id}
              def={def}
              presenceStatus={otherStatus}
              health={otherHealth}
              warnings={[]}
              lastChecked={null}
              accountName={null}
              locationTitle={null}
            />
          ))}
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
