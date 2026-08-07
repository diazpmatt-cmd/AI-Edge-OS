import { useQuery } from "@tanstack/react-query";
import { useApiFetch } from "@/lib/api";

interface AuthorityProfileResponse {
  clientId: string;
  clientName: string;
  profile: null | {
    primaryDomain: string;
    primaryWebsite: string | null;
    primaryCity: string | null;
    primaryRegion: string | null;
    geography: string[];
    serviceIds: string[];
    discoveryEnabled: boolean;
  };
  availableServiceIds: string[];
  competitors: Array<{
    domain: string;
    businessName: string | null;
    threatLevel: string | null;
  }>;
  readyForDiscovery: boolean;
}

interface ScheduledReadinessResponse {
  ready: boolean;
  code: string;
  message: string;
  executionActivated: false;
  provider: {
    name: string;
    status: "configured" | "disabled" | "unconfigured";
    reason: string | null;
  };
  contextReady: boolean;
  competitorCount: number;
}

function stateColor(ok: boolean): string {
  return ok ? "#22C55E" : "#F59E0B";
}

export function AuthorityReadinessPanel() {
  const apiFetch = useApiFetch();

  const profileQuery = useQuery<AuthorityProfileResponse>({
    queryKey: ["authority-profile"],
    queryFn: () => apiFetch<AuthorityProfileResponse>("/authority/profile"),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  const readinessQuery = useQuery<ScheduledReadinessResponse>({
    queryKey: ["authority-scheduled-readiness"],
    queryFn: () => apiFetch<ScheduledReadinessResponse>("/authority/scheduled-readiness"),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  if (profileQuery.isLoading || readinessQuery.isLoading) {
    return (
      <section style={{ marginBottom: 22, borderRadius: 14, border: "1px solid rgba(56,189,248,.20)", background: "rgba(8,14,31,.92)", padding: 16, color: "#94A3B8", fontSize: 11 }}>
        Checking Authority Engine readiness…
      </section>
    );
  }

  const profile = profileQuery.data;
  const readiness = readinessQuery.data;
  const profileError = profileQuery.error instanceof Error ? profileQuery.error.message : null;
  const readinessError = readinessQuery.error instanceof Error ? readinessQuery.error.message : null;

  if (!profile || !readiness) {
    return (
      <section style={{ marginBottom: 22, borderRadius: 14, border: "1px solid rgba(239,68,68,.25)", background: "rgba(8,14,31,.92)", padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#EF4444" }}>Authority readiness unavailable</div>
        <div style={{ marginTop: 5, fontSize: 10, color: "#64748B" }}>{profileError ?? readinessError ?? "The readiness APIs could not be read safely."}</div>
      </section>
    );
  }

  const p = profile.profile;
  const steps = [
    { label: "Tenant profile", ok: Boolean(p), detail: p ? profile.clientName : "Not configured" },
    { label: "Business domain", ok: Boolean(p?.primaryDomain), detail: p?.primaryDomain ?? "Missing" },
    { label: "Location scope", ok: Boolean(p?.primaryCity && p?.primaryRegion && p.geography.length), detail: p?.primaryCity && p?.primaryRegion ? `${p.primaryCity} · ${p.primaryRegion}` : "City / region incomplete" },
    { label: "Service scope", ok: Boolean(p?.serviceIds.length), detail: p?.serviceIds.length ? `${p.serviceIds.length} canonical service${p.serviceIds.length === 1 ? "" : "s"}` : "No services selected" },
    { label: "Competitor set", ok: readiness.competitorCount > 0, detail: `${readiness.competitorCount} active competitor${readiness.competitorCount === 1 ? "" : "s"}` },
    { label: "Live backlink provider", ok: readiness.provider.status === "configured", detail: readiness.provider.status.replaceAll("_", " ") },
    { label: "Scheduled execution", ok: readiness.executionActivated, detail: readiness.executionActivated ? "Activated" : "Not activated" },
  ];

  const headlineColor = readiness.ready ? "#22C55E" : "#F59E0B";

  return (
    <section style={{ marginBottom: 22, borderRadius: 14, border: `1px solid ${headlineColor}35`, background: "linear-gradient(135deg, rgba(7,19,34,.96), rgba(3,6,18,.94))", padding: "16px 18px", boxShadow: "0 10px 30px rgba(0,0,0,.18)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".7px", textTransform: "uppercase", color: "#38BDF8" }}>Authority Engine Readiness</div>
          <div style={{ marginTop: 4, fontSize: 14, fontWeight: 900, color: "#E2E8F0" }}>{profile.clientName}</div>
          <div style={{ marginTop: 4, maxWidth: 700, fontSize: 10.5, color: "#64748B", lineHeight: 1.45 }}>{readiness.message}</div>
        </div>
        <div style={{ borderRadius: 999, padding: "5px 10px", border: `1px solid ${headlineColor}40`, background: `${headlineColor}12`, color: headlineColor, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", whiteSpace: "nowrap" }}>
          {readiness.ready ? "Ready · activation off" : "Setup required"}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 8, marginTop: 14 }}>
        {steps.map((step) => {
          const color = stateColor(step.ok);
          return (
            <div key={step.label} style={{ minWidth: 0, borderRadius: 9, border: `1px solid ${color}22`, background: `${color}08`, padding: "9px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color, fontSize: 11, fontWeight: 900 }}>{step.ok ? "✓" : "!"}</span>
                <span style={{ fontSize: 9.5, color: "#CBD5E1", fontWeight: 800 }}>{step.label}</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 8.8, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{step.detail}</div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 8.8, color: "#475569" }}>
        Live scheduled backlink execution is intentionally off. Demo/fixture ingestion is disabled on the authenticated Authority surface, and no provider call is made by this readiness panel.
      </div>
    </section>
  );
}
