import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useTheme } from "@/contexts/theme-context";
import { useApiFetch } from "@/lib/api";
import { useActiveBusiness } from "@/contexts/business-context";
import AiVisibilityReadModelView, {
  type RMReadModel,
} from "@/components/AiVisibilityReadModelView";
import AiVisibilityQueryEvidencePanel, {
  type QEScan,
  type QEResult,
} from "@/components/AiVisibilityQueryEvidencePanel";
import AiVisibilityHistoryPanel from "@/components/AiVisibilityHistoryPanel";

export function classifyScanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const statusMatch = msg.match(/^API (\d+):/);
  if (statusMatch) {
    const status = parseInt(statusMatch[1], 10);
    if (status === 401) return "Session expired or authentication required. Please sign in again.";
    if (status === 403) return "Access denied — this business is not authorized for your account.";
    if (status === 404) return "Scan endpoint or business not found.";
    if (status === 422) {
      const lower = msg.toLowerCase();
      if (lower.includes("no_active_services")) {
        return "Scan cannot run: no active services are configured for this business. Contact your administrator.";
      }
      if (lower.includes("no_authorized_geography")) {
        return "Scan cannot run: no authorized service geography is configured for this business. Contact your administrator.";
      }
      return "Scan cannot run: tenant profile is incomplete. Contact your administrator.";
    }
    if (status >= 500) return "Scan service error. Please try again.";
    return `Request failed (${status}). Please try again.`;
  }

  const lower = msg.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network error") ||
    lower.includes("load failed")
  ) {
    return "Network error — could not reach the scan service. Check your connection.";
  }
  if (lower.includes("not_configured") || lower.includes("provider not configured")) {
    return "AI provider not configured. Contact your administrator.";
  }
  if (lower.includes("auth_failure") || lower.includes("invalid api key")) {
    return "AI provider authentication failed. Contact your administrator.";
  }
  if (lower.includes("aborterror") || lower.includes("timed out") || lower.includes("timeout")) {
    return "AI provider timed out. Please try again.";
  }
  if (lower.includes("rate_limit") || lower.includes("rate limit") || lower.includes("quota")) {
    return "AI provider rate limit reached. Please try again shortly.";
  }
  return "Scan failed. Please try again.";
}

type TabId = "opportunities" | "ai_query" | "history";

const TABS: Array<{ id: TabId; label: string; description: string }> = [
  {
    id: "opportunities",
    label: "Opportunities",
    description: "Evidence-backed actions from connected AI Edge data sources.",
  },
  {
    id: "ai_query",
    label: "AI Query Evidence",
    description: "See whether AI search answers mention the business, competitors, and citations.",
  },
  {
    id: "history",
    label: "History",
    description: "Track mention-rate and citation evidence over time.",
  },
];

export default function AIVisibilityEnginePage() {
  const apiFetch = useApiFetch();
  const { colors: t, isDark } = useTheme();
  const { activeBusiness } = useActiveBusiness();
  const clientId = activeBusiness?.id ?? "";

  const [activeTab, setActiveTab] = useState<TabId>("opportunities");
  const [readModel, setReadModel] = useState<RMReadModel | null>(null);
  const [readModelLoading, setReadModelLoading] = useState(false);
  const [readModelError, setReadModelError] = useState<string | null>(null);
  const [readModelTrigger, setReadModelTrigger] = useState(0);

  const [scan, setScan] = useState<QEScan | null>(null);
  const [results, setResults] = useState<readonly QEResult[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId || activeTab !== "opportunities") return;
    setReadModelLoading(true);
    setReadModelError(null);
    apiFetch<RMReadModel>(`/ai-visibility/read-model/${clientId}`)
      .then((data) => setReadModel(data))
      .catch(() => {
        setReadModel(null);
        setReadModelError("No verified AI visibility read model is available right now. No demo data has been substituted.");
      })
      .finally(() => setReadModelLoading(false));
  }, [activeTab, apiFetch, clientId, readModelTrigger]);

  useEffect(() => {
    if (!clientId || activeTab !== "ai_query") return;
    setScanLoading(true);
    setScanError(null);
    apiFetch<{ scan: QEScan; results: QEResult[] }>(
      `/ai-visibility/query-scan/${clientId}/latest`,
    )
      .then((data) => {
        setScan(data.scan);
        setResults(data.results);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("404") || message.includes("no_scan_found")) {
          setScan(null);
          setResults([]);
          return;
        }
        setScan(null);
        setResults([]);
        setScanError("Verified AI query evidence could not be loaded. No demo scan has been substituted.");
      })
      .finally(() => setScanLoading(false));
  }, [activeTab, apiFetch, clientId]);

  async function runScan() {
    if (!clientId) {
      setScanError("Tenant identity unavailable. Please reload and try again.");
      return;
    }
    setScanLoading(true);
    setScanError(null);
    try {
      const data = await apiFetch<QEScan & { results: QEResult[] }>(
        `/ai-visibility/query-scan/${clientId}`,
        { method: "POST" },
      );
      setScan(data);
      setResults(data.results ?? []);
      setReadModelTrigger((value) => value + 1);
    } catch (err) {
      setScanError(classifyScanError(err));
    } finally {
      setScanLoading(false);
    }
  }

  const cardBorder = isDark ? "rgba(255,255,255,0.08)" : "#E5E7EB";
  const cardBackground = isDark ? "rgba(11,22,41,0.8)" : "#FFFFFF";

  return (
    <AppShell>
      <div style={{ maxWidth: 1180, margin: "0 auto", paddingBottom: 40 }}>
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 12px",
              borderRadius: 999,
              border: "1px solid rgba(0,174,239,0.28)",
              background: "rgba(0,174,239,0.08)",
              color: "#00AEEF",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: ".5px",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            AI Visibility · Verified Evidence
          </div>
          <h1 style={{ margin: 0, fontSize: 28, color: t.text }}>
            AI Search Visibility
          </h1>
          <p style={{ margin: "8px 0 0", color: t.text2, fontSize: 13, maxWidth: 760, lineHeight: 1.6 }}>
            Find where the business is visible, where competitors appear instead, and what AI Edge can prove should be fixed next. This production view never substitutes demo scores or fabricated competitor data when evidence is missing.
          </p>
        </div>

        {!clientId ? (
          <div
            style={{
              padding: 22,
              borderRadius: 12,
              border: `1px solid ${cardBorder}`,
              background: cardBackground,
              color: "#EF4444",
              fontSize: 13,
            }}
          >
            No authorized business is active. Select or provision a client before running visibility analysis.
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              {TABS.map((tab) => {
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      border: `1px solid ${selected ? "#00AEEF" : cardBorder}`,
                      background: selected ? "rgba(0,174,239,0.12)" : cardBackground,
                      color: selected ? "#00AEEF" : t.text2,
                      borderRadius: 9,
                      padding: "9px 14px",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 750,
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div style={{ color: t.text2, fontSize: 12, marginBottom: 22 }}>
              {TABS.find((tab) => tab.id === activeTab)?.description}
            </div>

            {activeTab === "opportunities" && (
              <AiVisibilityReadModelView
                model={readModel}
                loading={readModelLoading}
                error={readModelError}
                onRetry={() => setReadModelTrigger((value) => value + 1)}
                isDark={isDark}
                colors={t}
              />
            )}

            {activeTab === "ai_query" && (
              <AiVisibilityQueryEvidencePanel
                scan={scan}
                results={results}
                isLoading={scanLoading}
                error={scanError}
                clientId={clientId}
                onRunScan={() => void runScan()}
                isDark={isDark}
              />
            )}

            {activeTab === "history" && (
              <AiVisibilityHistoryPanel clientId={clientId} />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
