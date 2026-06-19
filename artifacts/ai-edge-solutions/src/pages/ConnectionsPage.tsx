import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch, useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

type DbConnection = {
  id: string;
  provider: string;
  accountName: string | null;
  accountId: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type DebugInfo = {
  provider: string;
  inDatabase: boolean;
  accountName: string | null;
  accountId: string | null;
  expiresAt: string | null;
  envKeysConfigured: string[];
  envKeysMissing: string[];
  source: "replit_database" | "env_secrets_only" | "not_configured";
};

const PLATFORMS = [
  { id: "facebook",        label: "Facebook Pages",          abbrev: "f",  color: "#1877F2", bg: "linear-gradient(135deg, #1877F2, #0C5BC4)", description: "Publish posts directly to your Facebook Business Page." },
  { id: "youtube",         label: "YouTube",                 abbrev: "▶",  color: "#FF0000", bg: "linear-gradient(135deg, #FF0000, #CC0000)", description: "Upload Shorts and videos to your YouTube channel." },
  { id: "tiktok",          label: "TikTok Business",         abbrev: "T",  color: "#010101", bg: "linear-gradient(135deg, #010101, #25F4EE)", description: "Publish videos to your TikTok Business account." },
  { id: "instagram",       label: "Instagram Business",      abbrev: "IG", color: "#E1306C", bg: "linear-gradient(135deg, #833AB4, #E1306C, #F77737)", description: "Publish content to your Instagram Business account." },
  { id: "google_business", label: "Google Business Profile", abbrev: "G",  color: "#4285F4", bg: "linear-gradient(135deg, #4285F4, #34A853)", description: "Post updates and manage your Google Business listing." },
  { id: "linkedin",        label: "LinkedIn Company Pages",  abbrev: "in", color: "#0A66C2", bg: "linear-gradient(135deg, #0A66C2, #004182)", description: "Publish updates to your LinkedIn company page." },
];

type MigrationState = {
  status: "needs_reconnect" | "needs_review" | "coming_soon" | "blocked";
  accountName?: string;
  note: string;
};

const LOVABLE_MIGRATION: Record<string, MigrationState> = {
  google_business: { status: "blocked", note: "Google Business Profile requires Google app verification before activation." },
  youtube:         { status: "needs_reconnect", accountName: "BedBugsand_Beyond", note: "Was connected as BedBugsand_Beyond. Reconnect to restore." },
  facebook:        { status: "needs_reconnect", note: "Reconnect with basic permissions (public_profile + pages_show_list). Page posting remains disabled until advanced Meta permissions are approved." },
  instagram:       { status: "needs_review", note: "Connect Facebook first, then request advanced Meta permissions (pages_read_engagement, instagram_basic) after app review." },
  linkedin:        { status: "coming_soon", note: "LinkedIn integration is on the roadmap." },
};

type StatusKind = "connected" | "needs_reconnect" | "needs_review" | "not_connected" | "coming_soon" | "blocked";

function getStatus(provider: string, dbConn: DbConnection | undefined, facebookConnected: boolean): StatusKind {
  if (dbConn) return "connected";
  // Instagram is locked until Facebook is connected in the database
  if (provider === "instagram" && !facebookConnected) return "coming_soon";
  const m = LOVABLE_MIGRATION[provider];
  if (m) return m.status;
  return "not_connected";
}

function getDisplayAccountName(provider: string, dbConn: DbConnection | undefined): string | null {
  if (dbConn?.accountName) return dbConn.accountName;
  const m = LOVABLE_MIGRATION[provider];
  if (m?.accountName) return m.accountName;
  return null;
}

const STATUS_META: Record<StatusKind, { label: string; bg: string; color: string; dot: string }> = {
  connected:       { label: "Connected",          bg: "rgba(16,185,129,0.15)", color: "#10B981", dot: "#10B981" },
  needs_reconnect: { label: "Needs Reconnection", bg: "rgba(251,146,60,0.15)", color: "#FB923C", dot: "#FB923C" },
  needs_review:    { label: "Needs Review",       bg: "rgba(251,146,60,0.15)", color: "#FB923C", dot: "#FB923C" },
  not_connected:   { label: "Not Connected",      bg: "rgba(148,163,184,0.1)", color: "#94A3B8", dot: "#475569" },
  coming_soon:     { label: "Coming Soon",        bg: "rgba(148,163,184,0.1)", color: "#64748B", dot: "#334155" },
  blocked:         { label: "Pending Google Verification", bg: "rgba(245,158,11,0.1)", color: "#F59E0B", dot: "#F59E0B" },
};

const SOURCE_META: Record<string, { label: string; color: string }> = {
  replit_database:    { label: "Replit Database",       color: "#10B981" },
  env_secrets_only:   { label: "Environment Secrets",   color: "#00AEEF" },
  not_configured:     { label: "Not Configured",        color: "#64748B" },
  migrated_placeholder: { label: "Migrated Placeholder", color: "#FB923C" },
};

export default function ConnectionsPage() {
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [callbackLogOpen, setCallbackLogOpen] = useState(false);
  const [googleDebugOpen, setGoogleDebugOpen] = useState(false);
  const [facebookDebugOpen, setFacebookDebugOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedFb, setCopiedFb] = useState(false);
  const search = useSearch();
  const [, navigate] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const connected = params.get("connected");
    const oauthError = params.get("oauth_error");
    if (!connected && !oauthError) return;

    if (connected) {
      const label = connected.charAt(0).toUpperCase() + connected.slice(1);
      toast.success(`${label} connected successfully!`);
      qc.invalidateQueries({ queryKey: ["social_connections"] });
      qc.invalidateQueries({ queryKey: ["callback_debug_log"] });
    } else if (oauthError) {
      const step = params.get("step") ?? "";
      toast.error(`Connection failed: ${oauthError}${step ? ` (${step})` : ""}`);
      qc.invalidateQueries({ queryKey: ["callback_debug_log"] });
    }
    navigate("/admin/connections", { replace: true });
  }, [search]);

  const { data: connections = [] } = useQuery<DbConnection[]>({
    queryKey: ["social_connections"],
    queryFn: () => apiFetch<DbConnection[]>("/social-connections"),
  });

  const { data: debugData = [] } = useQuery<DebugInfo[]>({
    queryKey: ["connection_debug"],
    queryFn: () => apiFetch<DebugInfo[]>("/social-connections/debug"),
    enabled: debugOpen,
  });

  type GoogleProviderDebug = {
    id: string;
    label: string;
    scopes: string[];
    scopeString: string;
    sensitiveScope: boolean;
    sensitiveScopeNote: string | null;
    requiredApi: string;
    enableApiUrl: string;
    apiLibraryId: string;
    callbackRoute: string;
    redirectUri: string;
    successRedirect: string;
    fullOAuthUrl: string;
  };
  type GoogleDebug = {
    publicAppUrl: string;
    callbackRoute: string;
    redirectUri: string;
    clientId: string | null;
    clientIdSet: boolean;
    clientSecretSet: boolean;
    providers: GoogleProviderDebug[];
    minimalTestUrl: string;
  };
  const { data: googleDebug } = useQuery<GoogleDebug>({
    queryKey: ["google_oauth_debug"],
    queryFn: () => apiFetch<GoogleDebug>("/social-connections/google-oauth-debug"),
    enabled: googleDebugOpen,
  });

  type MetaDebug = {
    appId: string | null;
    appIdSet: boolean;
    appSecretSet: boolean;
    redirectUri: string;
    requestedScopes: string;
    connected: boolean;
    accountName: string | null;
    grantedScopes: string[];
    declinedScopes: string[];
    permissionsError: string | null;
    meAccountsResult: any;
  };
  const { data: metaDebug, refetch: refetchMetaDebug } = useQuery<MetaDebug>({
    queryKey: ["meta_oauth_debug"],
    queryFn: () => apiFetch<MetaDebug>("/social-connections/meta-oauth-debug"),
    enabled: facebookDebugOpen,
  });

  type CallbackEntry = {
    ts: string;
    provider: string;
    callbackReached: boolean;
    codeReceived: boolean;
    stateValid: boolean | null;
    tokenExchangeStatus: string;
    connectionSaved: boolean;
    finalRedirectUrl: string;
    error?: string;
  };
  const { data: callbackLog = [], refetch: refetchCallbackLog } = useQuery<CallbackEntry[]>({
    queryKey: ["callback_debug_log"],
    queryFn: () => apiFetch<CallbackEntry[]>("/social-connections/callback-debug-log"),
    enabled: callbackLogOpen,
    refetchInterval: callbackLogOpen ? 5000 : false,
  });

  const connByProvider = new Map(connections.map((c) => [c.provider, c]));
  const debugByProvider = new Map(debugData.map((d) => [d.provider, d]));
  const facebookConnected = connByProvider.has("facebook");

  const disconnectMut = useMutation({
    mutationFn: (provider: string) => apiFetch(`/social-connections/${provider}`, { method: "DELETE" }),
    onSuccess: (_, provider) => {
      toast.success(`Disconnected ${provider.replace("_", " ")}`);
      qc.invalidateQueries({ queryKey: ["social_connections"] });
      qc.invalidateQueries({ queryKey: ["connection_debug"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to disconnect"),
  });

  const handleConnect = async (provider: string) => {
    setConnecting(provider);
    try {
      const result = await apiFetch<{ url: string; configured: boolean }>(`/social-connections/oauth-start/${provider}`, { method: "POST" });
      if (!result.configured) {
        toast.error(`OAuth not configured. Add the required API credentials to Replit Secrets.`);
        setConnecting(null);
        return;
      }
      // Navigate the main window directly — preserves Clerk session through the redirect cycle.
      // Popup approach fails because the popup has no Clerk auth cookies, causing a redirect to
      // the Clerk sign-in page after the OAuth callback.
      window.location.href = result.url;
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to start OAuth");
      setConnecting(null);
    }
  };

  const connected = PLATFORMS.filter(p => connByProvider.has(p.id)).length;
  const needsAction = PLATFORMS.filter(p => {
    const s = getStatus(p.id, connByProvider.get(p.id), facebookConnected);
    return s === "needs_reconnect" || s === "needs_review";
  }).length;

  return (
    <AppShell>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(0,174,239,0.08)", border: "1px solid rgba(0,174,239,0.2)",
            borderRadius: 20, padding: "4px 14px", marginBottom: 14,
          }}>
            <span style={{ fontSize: 12, color: "#00AEEF", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>
              ⬡ Command Center
            </span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.5px", margin: "0 0 8px" }}>
            Connected Accounts
          </h1>
          <p style={{ fontSize: 15, color: "#6B7280", margin: 0 }}>
            Manage your platform connections and publishing integrations.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <StatPill value={connected} label="Connected" color="#10B981" />
            <StatPill value={needsAction} label="Need Action" color="#FB923C" />
            <StatPill value={PLATFORMS.length - connected - needsAction} label="Available" color="#64748B" />
          </div>
        </div>

        {/* Migration Notice */}
        {needsAction > 0 && (
          <div style={{
            background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.25)",
            borderRadius: 12, padding: "14px 18px", marginBottom: 24,
            display: "flex", gap: 12, alignItems: "flex-start",
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#FB923C", marginBottom: 4 }}>
                Migration from previous system detected
              </div>
              <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0, lineHeight: 1.6 }}>
                OAuth tokens from the previous Lovable-hosted app were not automatically transferred.
                Platforms shown as <strong style={{ color: "#FB923C" }}>Needs Reconnection</strong> were previously connected
                and must be reconnected here in Replit. Your data and settings are intact — only the OAuth tokens need to be refreshed.
              </p>
            </div>
          </div>
        )}

        {/* Google OAuth Testing Panel */}
        <div style={{
          background: "rgba(3,6,18,0.85)", border: "1px solid rgba(66,133,244,0.3)",
          borderRadius: 14, padding: "18px 20px", marginBottom: 24,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 16 }}>🔍</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>Google OAuth Testing</span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#4285F4",
              background: "rgba(66,133,244,0.1)", border: "1px solid rgba(66,133,244,0.25)",
              borderRadius: 20, padding: "2px 10px",
            }}>Isolate the 403</span>
          </div>
          <p style={{ fontSize: 12.5, color: "#6B7280", margin: "0 0 16px", lineHeight: 1.5 }}>
            Test Google OAuth incrementally — start with basic scopes to confirm credentials and redirect URI work, then escalate to sensitive scopes.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Row 1: Test Basic Google */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
              background: "rgba(66,133,244,0.06)", borderRadius: 10, border: "1px solid rgba(66,133,244,0.15)",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                background: "linear-gradient(135deg, #4285F4, #34A853)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15, fontWeight: 900, color: "#FFF",
              }}>G</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF", marginBottom: 2 }}>Test Basic Google</div>
                <div style={{ fontSize: 11.5, color: "#6B7280" }}>Scopes: <code style={{ color: "#94A3B8" }}>openid email profile</code> — no sensitive scopes. Confirms credentials + redirect URI are valid.</div>
              </div>
              <button
                onClick={() => handleConnect("google_basic")}
                disabled={connecting === "google_basic"}
                style={{
                  padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0,
                  background: "rgba(66,133,244,0.15)", border: "1px solid rgba(66,133,244,0.45)", color: "#4285F4",
                  opacity: connecting === "google_basic" ? 0.6 : 1, transition: "all 0.2s",
                }}
              >
                {connecting === "google_basic" ? "Opening…" : "▶ Run Test"}
              </button>
            </div>

            {/* Row 2: YouTube Readonly */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
              background: "rgba(255,0,0,0.05)", borderRadius: 10, border: "1px solid rgba(255,0,0,0.13)",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                background: "linear-gradient(135deg, #FF0000, #CC0000)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15, color: "#FFF",
              }}>▶</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF", marginBottom: 2 }}>Connect YouTube (Readonly)</div>
                <div style={{ fontSize: 11.5, color: "#6B7280" }}>Scopes: <code style={{ color: "#94A3B8" }}>youtube.readonly</code> — read-only, no upload. Tests YouTube scope without upload permission.</div>
              </div>
              <button
                onClick={() => handleConnect("youtube_readonly")}
                disabled={connecting === "youtube_readonly"}
                style={{
                  padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0,
                  background: "rgba(255,0,0,0.12)", border: "1px solid rgba(255,60,60,0.4)", color: "#FF5555",
                  opacity: connecting === "youtube_readonly" ? 0.6 : 1, transition: "all 0.2s",
                }}
              >
                {connecting === "youtube_readonly" ? "Opening…" : "▶ Run Test"}
              </button>
            </div>

            {/* Row 3: Google Business — Pending Verification */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
              background: "rgba(245,158,11,0.04)", borderRadius: 10, border: "1px solid rgba(245,158,11,0.18)",
              opacity: 0.72,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                background: "linear-gradient(135deg, #4285F4, #34A853)", filter: "grayscale(0.55)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15, fontWeight: 900, color: "#FFF",
              }}>G</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#9CA3AF", marginBottom: 2 }}>Google Business Profile</div>
                <div style={{ fontSize: 11.5, color: "#6B7280" }}>Requires <code style={{ color: "#6B7280" }}>business.manage</code> — pending Google app verification before activation.</div>
              </div>
              <button disabled style={{
                padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", color: "#F59E0B",
                cursor: "not-allowed",
              }}>
                ⏳ Pending
              </button>
            </div>
          </div>
        </div>

        {/* Platform Cards Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 16, marginBottom: 32 }}>
          {PLATFORMS.map(platform => {
            const dbConn = connByProvider.get(platform.id);
            const status = getStatus(platform.id, dbConn, facebookConnected);
            const sm = STATUS_META[status];
            const migration = LOVABLE_MIGRATION[platform.id];
            const accountName = getDisplayAccountName(platform.id, dbConn);
            const isConnecting = connecting === platform.id;
            const isDisconnecting = disconnectMut.isPending && disconnectMut.variables === platform.id;
            const isComing = status === "coming_soon";
            const isBlocked = status === "blocked";
            const isConnected = status === "connected";

            return (
              <div key={platform.id} style={{
                background: isConnected
                  ? "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(11,22,41,0.9) 100%)"
                  : "rgba(11,22,41,0.6)",
                border: isConnected
                  ? "1px solid rgba(16,185,129,0.25)"
                  : status === "needs_reconnect" || status === "needs_review"
                    ? "1px solid rgba(251,146,60,0.2)"
                    : "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14,
                padding: 20,
                backdropFilter: "blur(12px)",
                transition: "border-color 0.2s",
              }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  {/* Platform icon */}
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: platform.bg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, fontWeight: 900, color: "#FFFFFF",
                    boxShadow: `0 0 16px ${platform.color}33`,
                  }}>
                    {platform.abbrev}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>{platform.label}</span>
                      {/* Status badge */}
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        background: sm.bg, color: sm.color,
                        fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20,
                        border: `1px solid ${sm.color}33`,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: sm.dot, display: "inline-block" }} />
                        {sm.label}
                      </span>
                    </div>

                    <p style={{ fontSize: 12.5, color: "#6B7280", margin: "0 0 8px", lineHeight: 1.5 }}>
                      {platform.description}
                    </p>

                    {/* Account name */}
                    {accountName && (
                      <div style={{
                        fontSize: 12, color: "#C0C0C0", fontWeight: 600,
                        background: "rgba(192,192,192,0.08)", borderRadius: 6,
                        padding: "3px 8px", display: "inline-block", marginBottom: 8,
                      }}>
                        📺 {accountName}
                        {!dbConn && <span style={{ color: "#FB923C", marginLeft: 6 }}>(not yet reconnected)</span>}
                      </div>
                    )}

                    {/* Migration / status note */}
                    {!isConnected && migration && (
                      <p style={{ fontSize: 11.5, color: status === "needs_review" ? "#FB923C" : status === "blocked" ? "#F59E0B" : "#94A3B8", margin: "0 0 10px", lineHeight: 1.5 }}>
                        {status === "needs_reconnect" && "🔁 "}
                        {status === "needs_review" && "⚠️ "}
                        {status === "coming_soon" && "🕐 "}
                        {status === "blocked" && "⏳ "}
                        {migration.note}
                      </p>
                    )}
                    {!isConnected && !migration && (
                      <p style={{ fontSize: 11.5, color: "#475569", margin: "0 0 10px" }}>
                        Connection needs to be set up in Replit.
                      </p>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 8 }}>
                      {isConnected ? (
                        <button
                          onClick={() => disconnectMut.mutate(platform.id)}
                          disabled={isDisconnecting}
                          style={{
                            padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                            background: "transparent", border: "1px solid rgba(239,68,68,0.4)", color: "#EF4444",
                            opacity: isDisconnecting ? 0.5 : 1, transition: "all 0.2s",
                          }}
                        >
                          {isDisconnecting ? "Disconnecting…" : "↩ Disconnect"}
                        </button>
                      ) : isComing ? (
                        <button disabled style={{
                          padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                          background: "rgba(100,116,139,0.15)", border: "1px solid rgba(100,116,139,0.2)",
                          color: "#64748B", cursor: "not-allowed",
                        }}>
                          Coming Soon
                        </button>
                      ) : isBlocked ? (
                        <button disabled style={{
                          padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
                          color: "#F59E0B", cursor: "not-allowed",
                        }}>
                          ⏳ Pending Verification
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnect(platform.id)}
                          disabled={isConnecting}
                          style={{
                            padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                            background: status === "needs_reconnect" ? "rgba(251,146,60,0.15)" : "rgba(0,174,239,0.15)",
                            border: status === "needs_reconnect" ? "1px solid rgba(251,146,60,0.4)" : "1px solid rgba(0,174,239,0.4)",
                            color: status === "needs_reconnect" ? "#FB923C" : "#00AEEF",
                            opacity: isConnecting ? 0.6 : 1, transition: "all 0.2s",
                          }}
                        >
                          {isConnecting ? "Opening…" : status === "needs_reconnect" ? "🔁 Reconnect" : "Connect"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Callback Debug Log Panel */}
        <div style={{
          background: "rgba(3,6,18,0.8)", border: "1px solid rgba(0,174,239,0.3)",
          borderRadius: 12, overflow: "hidden", marginBottom: 12,
        }}>
          <button
            onClick={() => setCallbackLogOpen(o => !o)}
            style={{
              width: "100%", padding: "12px 18px", background: "none", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              color: "#6B7280", fontSize: 13, fontWeight: 600,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#00AEEF" }}>⬡</span>
              <span style={{ color: "#00AEEF" }}>OAuth Callback Debug Log</span>
              {callbackLog.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800, color: "#030612",
                  background: "#00AEEF", borderRadius: 10, padding: "1px 7px",
                }}>{callbackLog.length}</span>
              )}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
              {callbackLogOpen && (
                <button
                  onClick={(e) => { e.stopPropagation(); refetchCallbackLog(); }}
                  style={{
                    padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: "pointer",
                    background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.35)", color: "#00AEEF",
                  }}
                >↺ Refresh</button>
              )}
              {callbackLogOpen ? "▲ Hide" : "▼ Show"}
            </span>
          </button>

          {callbackLogOpen && (
            <div style={{ padding: "0 18px 18px", borderTop: "1px solid rgba(0,174,239,0.15)" }}>
              {callbackLog.length === 0 ? (
                <p style={{ fontSize: 12, color: "#475569", marginTop: 12, lineHeight: 1.7 }}>
                  No callbacks recorded yet. Click <strong style={{ color: "#00AEEF" }}>Connect</strong> or{" "}
                  <strong style={{ color: "#FB923C" }}>Reconnect</strong> on a platform card above.
                  This log auto-refreshes every 5 seconds.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                  {callbackLog.map((entry, i) => (
                    <div key={i} style={{
                      background: entry.connectionSaved
                        ? "rgba(16,185,129,0.05)"
                        : "rgba(239,68,68,0.05)",
                      border: `1px solid ${entry.connectionSaved ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
                      borderRadius: 8, padding: "10px 14px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: entry.connectionSaved ? "#10B981" : "#EF4444" }}>
                          {entry.connectionSaved ? "✓ SUCCESS" : "✗ FAILED"}
                        </span>
                        <span style={{ fontSize: 11, color: "#C0C0C0", fontWeight: 600 }}>
                          {entry.provider}
                        </span>
                        <span style={{ fontSize: 10, color: "#475569" }}>
                          {new Date(entry.ts).toLocaleTimeString()}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: entry.error ? 8 : 0 }}>
                        <Tag label={`Callback reached: yes`} color="#10B981" />
                        <Tag label={`Code received: ${entry.codeReceived ? "yes" : "no"}`} color={entry.codeReceived ? "#10B981" : "#EF4444"} />
                        <Tag label={`State valid: ${entry.stateValid === null ? "n/a" : entry.stateValid ? "yes" : "no"}`} color={entry.stateValid === false ? "#EF4444" : "#10B981"} />
                        <Tag label={`Token: ${entry.tokenExchangeStatus}`} color={entry.tokenExchangeStatus === "success" ? "#10B981" : "#EF4444"} />
                        <Tag label={`Saved to DB: ${entry.connectionSaved ? "yes" : "no"}`} color={entry.connectionSaved ? "#10B981" : "#EF4444"} />
                      </div>
                      {entry.error && (
                        <div style={{ marginTop: 6 }}>
                          <span style={{ fontSize: 11, color: "#EF4444" }}>Error: {entry.error}</span>
                        </div>
                      )}
                      <div style={{ marginTop: 6 }}>
                        <span style={{ fontSize: 10, color: "#374151" }}>Redirect → </span>
                        <code style={{ fontSize: 10, color: "#9CA3AF", wordBreak: "break-all" }}>{entry.finalRedirectUrl}</code>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Google OAuth Debug Panel */}
        <div style={{
          background: "rgba(3,6,18,0.8)", border: "1px solid rgba(66,133,244,0.2)",
          borderRadius: 12, overflow: "hidden", marginBottom: 12,
        }}>
          <button
            onClick={() => setGoogleDebugOpen(o => !o)}
            style={{
              width: "100%", padding: "12px 18px", background: "none", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              color: "#6B7280", fontSize: 13, fontWeight: 600,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: "#4285F4" }}>G</span>
              <span style={{ color: "#4285F4" }}>Google OAuth Debug Panel</span>
              <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 400 }}>— Business Profile &amp; YouTube</span>
            </span>
            <span style={{ fontSize: 11 }}>{googleDebugOpen ? "▲ Hide" : "▼ Show"}</span>
          </button>

          {googleDebugOpen && (
            <div style={{ padding: "0 18px 18px", borderTop: "1px solid rgba(66,133,244,0.1)" }}>
              {!googleDebug ? (
                <p style={{ fontSize: 12, color: "#475569", marginTop: 12 }}>Loading…</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>

                  {/* ── Shared credentials ── */}
                  <div style={{
                    background: "rgba(66,133,244,0.05)", border: "1px solid rgba(66,133,244,0.15)",
                    borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#4285F4", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Shared Credentials (both providers)
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Tag
                        label={googleDebug.clientIdSet ? "✓ GOOGLE_OAUTH_CLIENT_ID set" : "✗ GOOGLE_OAUTH_CLIENT_ID missing"}
                        color={googleDebug.clientIdSet ? "#10B981" : "#EF4444"}
                      />
                      <Tag
                        label={googleDebug.clientSecretSet ? "✓ GOOGLE_OAUTH_CLIENT_SECRET set" : "✗ GOOGLE_OAUTH_CLIENT_SECRET missing"}
                        color={googleDebug.clientSecretSet ? "#10B981" : "#EF4444"}
                      />
                    </div>
                    <DebugRow label="GOOGLE_OAUTH_CLIENT_ID">
                      {googleDebug.clientId ? (
                        <code style={{ fontSize: 12, color: "#C0C0C0", wordBreak: "break-all" }}>{googleDebug.clientId}</code>
                      ) : (
                        <span style={{ fontSize: 12, color: "#EF4444" }}>Not set — add to Replit Secrets</span>
                      )}
                    </DebugRow>
                    <DebugRow label="PUBLIC_APP_URL">
                      <code style={{ fontSize: 12, color: "#9CA3AF", wordBreak: "break-all" }}>{googleDebug.publicAppUrl}</code>
                    </DebugRow>
                    <DebugRow label="Callback Route">
                      <code style={{ fontSize: 12, color: "#C0C0C0" }}>{googleDebug.callbackRoute}</code>
                    </DebugRow>
                    <DebugRow label="redirect_uri (add this to Google Cloud Console)">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <code style={{ fontSize: 12, color: "#00AEEF", wordBreak: "break-all", flex: 1 }}>{googleDebug.redirectUri}</code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(googleDebug.redirectUri);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          style={{
                            padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                            background: copied ? "rgba(16,185,129,0.15)" : "rgba(0,174,239,0.12)",
                            border: copied ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(0,174,239,0.35)",
                            color: copied ? "#10B981" : "#00AEEF",
                            flexShrink: 0, transition: "all 0.2s",
                          }}
                        >
                          {copied ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                    </DebugRow>
                  </div>

                  {/* ── Per-provider sections ── */}
                  {(googleDebug.providers ?? []).map(prov => (
                    <div key={prov.id} style={{
                      background: "rgba(3,6,18,0.6)", border: `1px solid ${prov.id === "youtube" ? "rgba(255,0,0,0.2)" : "rgba(66,133,244,0.2)"}`,
                      borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                          background: prov.id === "youtube" ? "linear-gradient(135deg,#FF0000,#CC0000)" : "linear-gradient(135deg,#4285F4,#34A853)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 900, color: "#fff",
                        }}>{prov.id === "youtube" ? "▶" : "G"}</div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#C0C0C0" }}>{prov.label}</span>
                        <span style={{ fontSize: 10, color: "#475569", fontStyle: "italic" }}>provider id: {prov.id}</span>
                      </div>

                      {/* Scopes */}
                      <DebugRow label="Requested Scopes">
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {prov.scopes.map(s => {
                            const isSensitive = s.includes("business.manage") || s.includes("youtube.upload");
                            return (
                              <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <code style={{ fontSize: 11, color: isSensitive ? "#FB923C" : "#9CA3AF", wordBreak: "break-all" }}>{s}</code>
                                {isSensitive && (
                                  <span style={{
                                    fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
                                    background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)", color: "#FB923C",
                                  }}>SENSITIVE</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </DebugRow>

                      {/* Required API + Enable button */}
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)",
                        borderRadius: 6, padding: "7px 10px", gap: 10, flexWrap: "wrap",
                      }}>
                        <div>
                          <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                            Required Google API
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#C0C0C0" }}>{prov.requiredApi}</div>
                          <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>{prov.apiLibraryId}</div>
                        </div>
                        <a
                          href={prov.enableApiUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                            background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)",
                            color: "#10B981", textDecoration: "none", flexShrink: 0,
                            cursor: "pointer",
                          }}
                        >
                          Enable in Google Cloud Console ↗
                        </a>
                      </div>

                      {/* Sensitive scope warning */}
                      {prov.sensitiveScope && prov.sensitiveScopeNote && (
                        <div style={{
                          fontSize: 11, color: "#FB923C", background: "rgba(251,146,60,0.08)",
                          border: "1px solid rgba(251,146,60,0.25)", borderRadius: 6, padding: "6px 10px", lineHeight: 1.6,
                        }}>
                          ⚠️ {prov.sensitiveScopeNote}
                        </div>
                      )}

                      {/* Callback route */}
                      <DebugRow label="Callback Route">
                        <code style={{ fontSize: 12, color: "#C0C0C0" }}>{prov.callbackRoute}</code>
                      </DebugRow>

                      {/* redirect_uri */}
                      <DebugRow label="redirect_uri">
                        <code style={{ fontSize: 11, color: "#00AEEF", wordBreak: "break-all" }}>{prov.redirectUri}</code>
                      </DebugRow>

                      {/* Success redirect */}
                      <DebugRow label="Success Redirect Target">
                        <code style={{ fontSize: 11, color: "#10B981", wordBreak: "break-all" }}>{prov.successRedirect}</code>
                      </DebugRow>

                      {/* Full OAuth URL */}
                      <DebugRow label="Full Google Authorization URL">
                        {prov.fullOAuthUrl ? (
                          <code style={{ fontSize: 10, color: "#9CA3AF", wordBreak: "break-all", lineHeight: 1.7 }}>
                            {prov.fullOAuthUrl}
                          </code>
                        ) : (
                          <span style={{ fontSize: 11, color: "#EF4444" }}>Cannot generate — GOOGLE_OAUTH_CLIENT_ID missing</span>
                        )}
                      </DebugRow>
                    </div>
                  ))}

                  {/* ── Diagnostic: Test basic OAuth ── */}
                  {googleDebug.minimalTestUrl && (
                    <div style={{
                      background: "rgba(0,174,239,0.06)", border: "1px solid rgba(0,174,239,0.25)",
                      borderRadius: 8, padding: "10px 14px",
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#00AEEF", marginBottom: 6 }}>
                        🔬 Diagnostic: Test Basic OAuth (no restricted scopes)
                      </div>
                      <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 8, lineHeight: 1.6 }}>
                        This URL uses only <code style={{ color: "#C0C0C0" }}>openid email</code> — no restricted scopes.
                        Click it to see if Google shows a consent screen.
                        <br />
                        <strong style={{ color: "#C0C0C0" }}>If this works → redirect URI ✓, test user ✓ — the issue is the scope declaration (Step 3 below).</strong>
                        <br />
                        <strong style={{ color: "#EF4444" }}>If this also 403s → redirect URI is wrong or test user is missing (Steps 1 &amp; 2).</strong>
                      </div>
                      <a
                        href={googleDebug.minimalTestUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: "rgba(0,174,239,0.12)", border: "1px solid rgba(0,174,239,0.35)",
                          color: "#00AEEF", textDecoration: "none",
                        }}
                      >
                        Test basic connection (openid + email only) ↗
                      </a>
                    </div>
                  )}

                  {/* ── Google 403 Fix Checklist ── */}
                  <div style={{
                    background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)",
                    borderRadius: 8, padding: "12px 14px",
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#EF4444", marginBottom: 10 }}>
                      🔴 Getting a Google 403? Work through this checklist:
                    </div>
                    {[
                      {
                        n: "1",
                        title: "Add the redirect URI in Google Cloud Console",
                        body: (
                          <>
                            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer"
                              style={{ color: "#4285F4", textDecoration: "underline" }}>
                              APIs &amp; Services → Credentials
                            </a>
                            {" → click your OAuth 2.0 Client ID → "}
                            <strong style={{ color: "#C0C0C0" }}>Authorized redirect URIs → Add URI</strong>
                            <br />
                            Paste exactly:{" "}
                            <code style={{ fontSize: 11, color: "#00AEEF", wordBreak: "break-all" }}>
                              {googleDebug.redirectUri}
                            </code>
                            {" → "}
                            <strong style={{ color: "#C0C0C0" }}>Save</strong>
                          </>
                        ),
                      },
                      {
                        n: "2",
                        title: "Add yourself as a Test User",
                        body: (
                          <>
                            <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer"
                              style={{ color: "#4285F4", textDecoration: "underline" }}>
                              OAuth consent screen
                            </a>
                            {" → scroll to "}
                            <strong style={{ color: "#C0C0C0" }}>Test users → + Add Users</strong>
                            {" → enter your Google account email → Save."}
                            <br />
                            <span style={{ color: "#6B7280" }}>Or click <strong>Publish App</strong> to switch to Production (safe for personal use).</span>
                          </>
                        ),
                      },
                      {
                        n: "3",
                        title: "Declare the restricted scopes on the OAuth consent screen ← most missed step",
                        highlight: true,
                        body: (
                          <>
                            Enabling the API is NOT enough — restricted scopes must also be declared on the consent screen.
                            <br />
                            <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer"
                              style={{ color: "#4285F4", textDecoration: "underline" }}>
                              OAuth consent screen
                            </a>
                            {" → "}
                            <strong style={{ color: "#C0C0C0" }}>Scopes → Add or Remove Scopes</strong>
                            {" → search for and add:"}
                            <br />
                            <code style={{ fontSize: 11, color: "#FB923C" }}>https://www.googleapis.com/auth/business.manage</code>
                            <br />
                            <code style={{ fontSize: 11, color: "#FB923C" }}>https://www.googleapis.com/auth/youtube.upload</code>
                            <br />
                            Click <strong style={{ color: "#C0C0C0" }}>Update → Save and Continue</strong>.
                            <br />
                            <span style={{ color: "#6B7280" }}>Note: these are restricted scopes — Google may mark them as "Sensitive" and require verification for production use, but for testing with a test user they work immediately.</span>
                          </>
                        ),
                      },
                      {
                        n: "4",
                        title: "Enable the required Google APIs",
                        body: (
                          <>
                            <strong style={{ color: "#C0C0C0" }}>Business Profile:</strong>{" "}
                            <a href="https://console.cloud.google.com/apis/library/mybusinessaccountmanagement.googleapis.com" target="_blank" rel="noopener noreferrer"
                              style={{ color: "#4285F4", textDecoration: "underline" }}>Enable Business Profile API</a>
                            {"  "}
                            <strong style={{ color: "#C0C0C0" }}>YouTube:</strong>{" "}
                            <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener noreferrer"
                              style={{ color: "#4285F4", textDecoration: "underline" }}>Enable YouTube Data API v3</a>
                          </>
                        ),
                      },
                      {
                        n: "5",
                        title: "Verify the OAuth Client type is Web application",
                        body: (
                          <>
                            In Credentials, the client must be type <strong style={{ color: "#C0C0C0" }}>Web application</strong> — not Desktop or Android.
                            If wrong type, create a new OAuth 2.0 Client ID and choose Web application.
                          </>
                        ),
                      },
                    ].map(step => (
                      <div key={step.n} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                          background: (step as any).highlight ? "rgba(251,146,60,0.2)" : "rgba(66,133,244,0.2)",
                          border: `1px solid ${(step as any).highlight ? "rgba(251,146,60,0.5)" : "rgba(66,133,244,0.4)"}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 800,
                          color: (step as any).highlight ? "#FB923C" : "#4285F4",
                        }}>{step.n}</div>
                        <div>
                          <div style={{
                            fontSize: 12, fontWeight: 700, marginBottom: 3,
                            color: (step as any).highlight ? "#FB923C" : "#C0C0C0",
                          }}>{step.title}</div>
                          <div style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.7 }}>{step.body}</div>
                        </div>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 8 }}>
                      After making changes in Google Cloud Console, wait ~30 seconds then try Reconnect again.
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}
        </div>

        {/* Facebook OAuth Debug Panel */}
        <div style={{
          background: "rgba(3,6,18,0.8)", border: "1px solid rgba(24,119,242,0.2)",
          borderRadius: 12, overflow: "hidden", marginBottom: 12,
        }}>
          <button
            onClick={() => setFacebookDebugOpen(o => !o)}
            style={{
              width: "100%", padding: "12px 18px", background: "none", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              color: "#6B7280", fontSize: 13, fontWeight: 600,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: "#1877F2" }}>f</span>
              <span style={{ color: "#1877F2" }}>Facebook OAuth Debug Panel</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
              {facebookDebugOpen && metaDebug && (
                <button
                  onClick={(e) => { e.stopPropagation(); refetchMetaDebug(); }}
                  style={{
                    padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: "pointer",
                    background: "rgba(24,119,242,0.12)", border: "1px solid rgba(24,119,242,0.35)",
                    color: "#1877F2",
                  }}
                >
                  ↺ Refresh
                </button>
              )}
              {facebookDebugOpen ? "▲ Hide" : "▼ Show"}
            </span>
          </button>

          {facebookDebugOpen && (
            <div style={{ padding: "0 18px 18px", borderTop: "1px solid rgba(24,119,242,0.1)" }}>
              {!metaDebug ? (
                <p style={{ fontSize: 12, color: "#475569", marginTop: 12 }}>Loading…</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>

                  {/* Credential badges */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Tag
                      label={metaDebug.appIdSet ? "✓ META_APP_ID set" : "✗ META_APP_ID missing"}
                      color={metaDebug.appIdSet ? "#10B981" : "#EF4444"}
                    />
                    <Tag
                      label={metaDebug.appSecretSet ? "✓ META_APP_SECRET set" : "✗ META_APP_SECRET missing"}
                      color={metaDebug.appSecretSet ? "#10B981" : "#EF4444"}
                    />
                    <Tag
                      label={metaDebug.connected ? `✓ Connected as ${metaDebug.accountName ?? "unknown"}` : "✗ Not yet connected"}
                      color={metaDebug.connected ? "#10B981" : "#FB923C"}
                    />
                  </div>

                  {/* Redirect URI */}
                  <DebugRow label="redirect_uri">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <code style={{ fontSize: 12, color: "#00AEEF", wordBreak: "break-all", flex: 1 }}>{metaDebug.redirectUri}</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(metaDebug.redirectUri);
                          setCopiedFb(true);
                          setTimeout(() => setCopiedFb(false), 2000);
                        }}
                        style={{
                          padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                          background: copiedFb ? "rgba(16,185,129,0.15)" : "rgba(24,119,242,0.12)",
                          border: copiedFb ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(24,119,242,0.35)",
                          color: copiedFb ? "#10B981" : "#1877F2",
                          flexShrink: 0,
                        }}
                      >
                        {copiedFb ? "✓ Copied" : "Copy"}
                      </button>
                    </div>
                  </DebugRow>

                  {/* Requested scopes */}
                  <DebugRow label="Requested Scopes">
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                      {metaDebug.requestedScopes.split(",").map(s => (
                        <Tag key={s} label={s.trim()} color="#1877F2" />
                      ))}
                    </div>
                  </DebugRow>

                  {/* Granted / Declined scopes */}
                  {metaDebug.connected && (
                    <>
                      <DebugRow label="Granted Scopes">
                        {metaDebug.permissionsError ? (
                          <span style={{ fontSize: 12, color: "#EF4444" }}>Error: {metaDebug.permissionsError}</span>
                        ) : metaDebug.grantedScopes.length === 0 ? (
                          <span style={{ fontSize: 12, color: "#475569" }}>None returned</span>
                        ) : (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                            {metaDebug.grantedScopes.map(s => (
                              <Tag key={s} label={`✓ ${s}`} color="#10B981" />
                            ))}
                          </div>
                        )}
                      </DebugRow>

                      <DebugRow label="Declined Scopes">
                        {metaDebug.declinedScopes.length === 0 ? (
                          <span style={{ fontSize: 12, color: "#10B981" }}>None declined ✓</span>
                        ) : (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                            {metaDebug.declinedScopes.map(s => (
                              <Tag key={s} label={`✗ ${s}`} color="#EF4444" />
                            ))}
                          </div>
                        )}
                      </DebugRow>

                      <DebugRow label="/me/accounts (Pages)">
                        {!metaDebug.meAccountsResult ? (
                          <span style={{ fontSize: 12, color: "#475569" }}>Not fetched</span>
                        ) : metaDebug.meAccountsResult.error ? (
                          <span style={{ fontSize: 12, color: "#EF4444" }}>Error: {metaDebug.meAccountsResult.error}</span>
                        ) : (
                          <pre style={{
                            fontSize: 11, color: "#9CA3AF", margin: 0, whiteSpace: "pre-wrap",
                            wordBreak: "break-all", lineHeight: 1.6, maxHeight: 200, overflow: "auto",
                          }}>
                            {JSON.stringify(metaDebug.meAccountsResult, null, 2)}
                          </pre>
                        )}
                      </DebugRow>
                    </>
                  )}

                  <p style={{ fontSize: 11, color: "#374151", margin: 0, lineHeight: 1.6 }}>
                    Copy the <strong style={{ color: "#00AEEF" }}>redirect_uri</strong> and add it to your Meta App under{" "}
                    <strong style={{ color: "#C0C0C0" }}>Facebook Login → Settings → Valid OAuth Redirect URIs</strong>.
                    Current scopes: <strong style={{ color: "#1877F2" }}>public_profile, pages_show_list</strong> only.
                    Advanced posting permissions require Meta app review.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Debug Panel */}
        <div style={{
          background: "rgba(3,6,18,0.8)", border: "1px solid rgba(0,174,239,0.12)",
          borderRadius: 12, overflow: "hidden",
        }}>
          <button
            onClick={() => setDebugOpen(o => !o)}
            style={{
              width: "100%", padding: "12px 18px", background: "none", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              color: "#6B7280", fontSize: 13, fontWeight: 600,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#00AEEF" }}>◈</span>
              Connection Status Source Debug Panel
            </span>
            <span style={{ fontSize: 11 }}>{debugOpen ? "▲ Hide" : "▼ Show"}</span>
          </button>

          {debugOpen && (
            <div style={{ padding: "0 18px 18px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <p style={{ fontSize: 12, color: "#475569", margin: "12px 0 16px", lineHeight: 1.6 }}>
                This panel shows where each connection status is sourced from: real Replit database records, 
                environment secrets, or migrated placeholder data from the previous Lovable deployment.
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {PLATFORMS.map(platform => {
                  const debug = debugByProvider.get(platform.id);
                  const dbConn = connByProvider.get(platform.id);
                  const status = getStatus(platform.id, dbConn, facebookConnected);
                  const hasMigration = !!LOVABLE_MIGRATION[platform.id];

                  const effectiveSource = debug?.inDatabase
                    ? "replit_database"
                    : hasMigration && status !== "coming_soon"
                      ? "migrated_placeholder"
                      : debug?.source ?? "not_configured";

                  const sm2 = SOURCE_META[effectiveSource] ?? SOURCE_META["not_configured"];

                  return (
                    <div key={platform.id} style={{
                      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 8, padding: "10px 14px",
                      display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap",
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#C0C0C0", minWidth: 200 }}>
                        {platform.label}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
                        <Tag label={`Source: ${sm2.label}`} color={sm2.color} />
                        {debug ? (
                          <>
                            <Tag label={debug.inDatabase ? "✓ In DB" : "✗ Not in DB"} color={debug.inDatabase ? "#10B981" : "#64748B"} />
                            {debug.envKeysConfigured.length > 0
                              ? <Tag label={`✓ Env: ${debug.envKeysConfigured.join(", ")}`} color="#00AEEF" />
                              : <Tag label={`✗ Env keys missing: ${debug.envKeysMissing.join(", ")}`} color="#64748B" />
                            }
                            {!debug.inDatabase && hasMigration && (
                              <Tag label="⚠ Needs reconnection in Replit" color="#FB923C" />
                            )}
                          </>
                        ) : (
                          <Tag label="Loading debug info…" color="#475569" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{
                marginTop: 16, padding: "10px 14px",
                background: "rgba(0,174,239,0.05)", border: "1px solid rgba(0,174,239,0.15)",
                borderRadius: 8, fontSize: 12, color: "#6B7280", lineHeight: 1.7,
              }}>
                <strong style={{ color: "#00AEEF" }}>Legend:</strong>{" "}
                <span style={{ color: "#10B981" }}>Replit Database</span> — real OAuth token stored here. {" "}
                <span style={{ color: "#00AEEF" }}>Environment Secrets</span> — API credentials configured but no token yet. {" "}
                <span style={{ color: "#FB923C" }}>Migrated Placeholder</span> — known from Lovable, not yet in Replit. {" "}
                <span style={{ color: "#64748B" }}>Not Configured</span> — no credentials or connection.
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function StatPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: `${color}10`, border: `1px solid ${color}30`,
      borderRadius: 8, padding: "5px 12px",
    }}>
      <span style={{ fontSize: 18, fontWeight: 800, color }}>{value}</span>
      <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function DebugRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 8, padding: "8px 12px",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color,
      background: `${color}14`, border: `1px solid ${color}30`,
      borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}
