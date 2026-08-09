import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { useApiFetch } from "@/lib/api";

interface AuthorizedClient {
  clientId: string;
  slug: string;
  clientName: string;
  industry: string;
  industryLabel: string;
  region: string;
  accessLevel: "viewer" | "operator" | "owner";
  ownership: "self" | "delegated";
}

interface AuthorizedClientsResponse {
  clients: AuthorizedClient[];
}

interface ActivationItem {
  id: string;
  capabilityKey: string;
  capabilityName: string;
  pillar: string;
  priority: number;
  reason: string;
  expectedBenefit: string;
  dependencies: string[];
  gate:
    | "SAFE_AUTOMATIC_ACTION"
    | "HUMAN_APPROVAL_REQUIRED"
    | "OAUTH_AUTHORIZATION_REQUIRED"
    | "EXTERNAL_CONFIGURATION_REQUIRED"
    | "BLOCKED";
  executionStatus:
    | "ready"
    | "approval_required"
    | "authorization_required"
    | "external_configuration_required"
    | "blocked";
  blocker: string | null;
  recommendedAction: string;
}

interface FullUtilizationMission {
  mission: "maximize_ai_edge_utilization";
  status: "optimized" | "action_required";
  clientId: string;
  clientName: string;
  coverageScore: number;
  activeCapabilities: number;
  applicableCapabilities: number;
  opportunities: number;
  authorizationRequired: number;
  blocked: number;
  readyAutomatic: ActivationItem[];
  humanApprovalRequired: ActivationItem[];
  oauthAuthorizationRequired: ActivationItem[];
  externalConfigurationRequired: ActivationItem[];
  blockedActions: ActivationItem[];
  topPriorityActions: ActivationItem[];
  nextCommand: string;
}

const COLORS = {
  panel: "#080E1F",
  panel2: "#0B1328",
  border: "rgba(0,174,239,0.16)",
  blue: "#00AEEF",
  green: "#22C55E",
  amber: "#FBBF24",
  red: "#EF4444",
  purple: "#A78BFA",
  text: "#E2E8F0",
  muted: "#94A3B8",
};

const panel: React.CSSProperties = {
  background: COLORS.panel,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 16,
};

function gatePresentation(gate: ActivationItem["gate"]): { label: string; color: string } {
  switch (gate) {
    case "SAFE_AUTOMATIC_ACTION": return { label: "Apollos can prepare", color: COLORS.green };
    case "HUMAN_APPROVAL_REQUIRED": return { label: "Approval required", color: COLORS.amber };
    case "OAUTH_AUTHORIZATION_REQUIRED": return { label: "Sign-in required", color: COLORS.blue };
    case "EXTERNAL_CONFIGURATION_REQUIRED": return { label: "Setup required", color: COLORS.purple };
    case "BLOCKED": return { label: "Blocked", color: COLORS.red };
  }
}

function MetricCard({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div style={{ ...panel, padding: 18 }}>
      <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 900, color: tone, marginTop: 7 }}>{value}</div>
    </div>
  );
}

function ActionCard({ item, rank }: { item: ActivationItem; rank: number }) {
  const gate = gatePresentation(item.gate);
  return (
    <div style={{ ...panel, padding: 18, display: "grid", gridTemplateColumns: "42px 1fr", gap: 14 }}>
      <div style={{
        width: 38, height: 38, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,174,239,0.10)", border: "1px solid rgba(0,174,239,0.22)", color: COLORS.blue,
        fontWeight: 900,
      }}>{rank}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.text }}>{item.capabilityName}</div>
          <span style={{
            padding: "4px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800,
            color: gate.color, background: `${gate.color}14`, border: `1px solid ${gate.color}45`,
          }}>{gate.label}</span>
        </div>
        <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.55, marginTop: 7 }}>{item.reason}</div>
        <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.55, marginTop: 8 }}>
          <strong style={{ color: COLORS.blue }}>Next:</strong> {item.recommendedAction}
        </div>
        {item.expectedBenefit && (
          <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.5, marginTop: 6 }}>{item.expectedBenefit}</div>
        )}
      </div>
    </div>
  );
}

export default function ApollosCoveragePage() {
  const apiFetch = useApiFetch();
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  const clientsQuery = useQuery<AuthorizedClientsResponse>({
    queryKey: ["apollos-authorized-clients"],
    queryFn: () => apiFetch("/apollos/clients"),
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => {
    const clients = clientsQuery.data?.clients ?? [];
    if (clients.length === 0) {
      setSelectedClientId("");
      return;
    }
    if (selectedClientId && clients.some((client) => client.clientId === selectedClientId)) return;
    const preferred = clients.find((client) => client.ownership === "self") ?? clients[0];
    setSelectedClientId(preferred?.clientId ?? "");
  }, [clientsQuery.data, selectedClientId]);

  const missionQuery = useQuery<FullUtilizationMission>({
    queryKey: ["apollos-full-utilization", selectedClientId],
    queryFn: () => apiFetch(`/apollos/full-utilization?clientId=${encodeURIComponent(selectedClientId)}`),
    enabled: !!selectedClientId,
    staleTime: 30_000,
    retry: 1,
  });

  const authorizedClients = clientsQuery.data?.clients ?? [];
  const selectedClient = authorizedClients.find((client) => client.clientId === selectedClientId) ?? null;
  const loading = clientsQuery.isLoading || (!!selectedClientId && missionQuery.isLoading);
  const error = clientsQuery.isError || missionQuery.isError;

  return (
    <AppShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Sparkles size={22} color={COLORS.blue} />
              <h1 style={{ margin: 0, fontSize: 26, color: COLORS.text, fontWeight: 900 }}>Apollos Client Coverage</h1>
            </div>
            <p style={{ color: COLORS.muted, fontSize: 13, margin: "8px 0 0", maxWidth: 720, lineHeight: 1.55 }}>
              One view of whether this client is actually using every AI Edge capability available to them—not just whether accounts happen to be connected.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {authorizedClients.length > 1 && (
              <select
                aria-label="Authorized client"
                value={selectedClientId}
                onChange={(event) => setSelectedClientId(event.target.value)}
                style={{
                  background: COLORS.panel, color: COLORS.text, border: `1px solid ${COLORS.border}`,
                  borderRadius: 10, padding: "10px 12px", fontSize: 12, fontWeight: 700, minWidth: 220,
                }}
              >
                {authorizedClients.map((client) => (
                  <option key={client.clientId} value={client.clientId}>{client.clientName}</option>
                ))}
              </select>
            )}
            {selectedClient && authorizedClients.length === 1 && (
              <div style={{
                padding: "8px 11px", borderRadius: 9, background: "rgba(244,114,182,0.08)",
                border: "1px solid rgba(244,114,182,0.20)", color: "#F9A8D4", fontSize: 11, fontWeight: 800,
              }}>{selectedClient.clientName}</div>
            )}
            <Link to="/admin/apollos" style={{
              display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none", padding: "10px 14px",
              borderRadius: 10, fontSize: 12, fontWeight: 800, color: "#fff", background: COLORS.blue,
            }}>
              Talk to Apollos <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {!clientsQuery.isLoading && authorizedClients.length === 0 && !clientsQuery.isError && (
          <div style={{ ...panel, padding: 20, color: COLORS.muted }}>
            No active AI Edge client is authorized for this account yet.
          </div>
        )}

        {loading && (
          <div style={{ ...panel, minHeight: 220, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: COLORS.muted }}>
            <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} /> Loading client coverage…
          </div>
        )}

        {error && (
          <div style={{ ...panel, padding: 20, borderColor: "rgba(239,68,68,0.3)", color: "#FCA5A5" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }}><AlertTriangle size={17} /> Coverage unavailable</div>
            <div style={{ fontSize: 12, marginTop: 6, color: COLORS.muted }}>Apollos could not resolve the selected authorized client coverage right now.</div>
          </div>
        )}

        {missionQuery.data && (() => {
          const mission = missionQuery.data;
          const optimized = mission.status === "optimized";
          return (
            <>
              <div style={{ ...panel, padding: 22, background: `linear-gradient(135deg, ${COLORS.panel} 0%, ${COLORS.panel2} 100%)` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 700 }}>CLIENT</div>
                    <div style={{ fontSize: 22, color: COLORS.text, fontWeight: 900, marginTop: 4 }}>{mission.clientName}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, color: optimized ? COLORS.green : COLORS.amber, fontSize: 12, fontWeight: 800 }}>
                      {optimized ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}
                      {optimized ? "Using every currently offered capability" : `${mission.opportunities} current opportunities to improve coverage`}
                    </div>
                  </div>
                  <div style={{ textAlign: "center", minWidth: 150 }}>
                    <div style={{ fontSize: 58, lineHeight: 1, fontWeight: 950, color: mission.coverageScore >= 80 ? COLORS.green : mission.coverageScore >= 55 ? COLORS.amber : COLORS.red }}>
                      {mission.coverageScore}%
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: COLORS.muted, marginTop: 7 }}>AI EDGE COVERAGE</div>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                <MetricCard label="Active" value={mission.activeCapabilities} tone={COLORS.green} />
                <MetricCard label="Applicable" value={mission.applicableCapabilities} tone={COLORS.blue} />
                <MetricCard label="Opportunities" value={mission.opportunities} tone={COLORS.amber} />
                <MetricCard label="Sign-ins Needed" value={mission.oauthAuthorizationRequired.length} tone={COLORS.blue} />
                <MetricCard label="Blocked" value={mission.blockedActions.length} tone={COLORS.red} />
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                  <div>
                    <h2 style={{ margin: 0, color: COLORS.text, fontSize: 18 }}>Highest-priority actions</h2>
                    <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 4 }}>Work independent actions first; stop only at the explicit authorization boundary.</div>
                  </div>
                  {mission.oauthAuthorizationRequired.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.blue, fontSize: 11, fontWeight: 800 }}>
                      <LockKeyhole size={14} /> {mission.oauthAuthorizationRequired.length} sign-in step{mission.oauthAuthorizationRequired.length === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {mission.topPriorityActions.length > 0
                    ? mission.topPriorityActions.map((item, index) => <ActionCard key={item.id} item={item} rank={index + 1} />)
                    : (
                      <div style={{ ...panel, padding: 24, textAlign: "center", color: COLORS.green }}>
                        <CheckCircle2 size={28} style={{ margin: "0 auto 8px" }} />
                        <div style={{ fontWeight: 900 }}>No current activation gaps</div>
                        <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 5 }}>Apollos should continue monitoring for regressions and newly available capabilities.</div>
                      </div>
                    )}
                </div>
              </div>

              <div style={{ ...panel, padding: 18, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Sparkles size={17} color={COLORS.blue} style={{ marginTop: 1, flexShrink: 0 }} />
                <div>
                  <div style={{ color: COLORS.text, fontSize: 12, fontWeight: 800 }}>Apollos next command</div>
                  <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: 1.55, marginTop: 4 }}>{mission.nextCommand}</div>
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </AppShell>
  );
}
