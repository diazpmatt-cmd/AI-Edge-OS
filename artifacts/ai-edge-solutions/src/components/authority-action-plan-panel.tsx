import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "@/lib/api";

type PriorityTier = "top" | "high" | "medium" | "low";
type ReasonCode =
  | "high_value"
  | "easy_win"
  | "competitor_gap"
  | "local_authority"
  | "evidence_strength"
  | "already_approved"
  | "already_pursuing";

interface EvidencePreview {
  id: string;
  sourceDomain: string;
  sourceUrl: string;
  competitorUrl: string | null;
  targetUrl: string | null;
  authority: number;
  competitorFrequency: number;
  relationshipAccessibility: number;
  estimatedEffort: number;
  discoveredAt: string;
  providers: string[];
}

interface IntelligenceItem {
  opportunityId: string;
  prospectId: string;
  domain: string | null;
  pageUrl: string | null;
  category: string;
  serviceId: string | null;
  workflowStatus: string;
  potentialValue: number;
  attainability: number;
  priorityScore: number;
  priorityTier: PriorityTier;
  reasonCodes: ReasonCode[];
  rationale: string;
  recommendedAction: string;
  evidenceCount: number;
  evidencePreview: EvidencePreview[];
}

interface IntelligenceResponse {
  clientId: string;
  scoring: {
    potentialValueWeight: number;
    attainabilityWeight: number;
    terminalWorkflowsExcluded: boolean;
  };
  summary: {
    totalActionable: number;
    topPriority: number;
    highPriority: number;
    competitorGaps: number;
    easyWins: number;
  };
  items: IntelligenceItem[];
}

const TIER_CONFIG: Record<PriorityTier, { label: string; color: string; icon: string }> = {
  top: { label: "Top Priority", color: "#EF4444", icon: "🔴" },
  high: { label: "High Priority", color: "#F59E0B", icon: "🟡" },
  medium: { label: "Medium Priority", color: "#38BDF8", icon: "🔵" },
  low: { label: "Lower Priority", color: "#64748B", icon: "⚪" },
};

const REASON_LABELS: Record<ReasonCode, string> = {
  high_value: "High value",
  easy_win: "Easy win",
  competitor_gap: "Competitor gap",
  local_authority: "Local authority",
  evidence_strength: "Strong evidence",
  already_approved: "Approved",
  already_pursuing: "In progress",
};

function categoryLabel(category: string): string {
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function linkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname}${path}`;
  } catch {
    return url;
  }
}

export function AuthorityActionPlanPanel({ onViewBacklinks }: { onViewBacklinks: () => void }) {
  const apiFetch = useApiFetch();
  const [data, setData] = useState<IntelligenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<IntelligenceResponse>("/backlinks/opportunities/intelligence?limit=10");
      setData(result);
    } catch (cause: unknown) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "Failed to load ranked opportunities");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div style={{
        background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12, padding: "34px 20px", textAlign: "center", color: "#64748B", fontSize: 12,
      }}>
        ⟳ Ranking the strongest authority opportunities…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)",
        borderRadius: 12, padding: "16px", display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 12, color: "#FCA5A5" }}>⚠ Failed to load the live action plan: {error}</div>
        <button onClick={() => void load()} style={{
          padding: "6px 12px", borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: "pointer",
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#FCA5A5",
        }}>
          Retry
        </button>
      </div>
    );
  }

  const summary = data?.summary;
  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <div style={{
        background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12, padding: "34px 20px", textAlign: "center",
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🎯</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#CBD5E1", marginBottom: 5 }}>
          No actionable backlink opportunities yet
        </div>
        <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.6, marginBottom: 14 }}>
          The action plan is driven by persisted discovery evidence. It will populate when ranked opportunities are available.
        </div>
        <button onClick={onViewBacklinks} style={{
          padding: "7px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
          background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.3)", color: "#38BDF8",
        }}>
          View Backlink Discovery
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.16)",
        borderRadius: 12, padding: "14px 16px", marginBottom: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#E2E8F0" }}>Live Authority Action Plan</div>
            <div style={{ fontSize: 10.5, color: "#64748B", marginTop: 3, lineHeight: 1.5 }}>
              Ranked from persisted opportunity value and attainability. Terminal workflows are excluded automatically.
            </div>
          </div>
          <button onClick={onViewBacklinks} style={{
            padding: "6px 12px", borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: "pointer",
            background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)", color: "#38BDF8",
          }}>
            Open Backlink Profile →
          </button>
        </div>

        {summary && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 12 }}>
            {[
              { label: "Actionable", value: summary.totalActionable, color: "#38BDF8" },
              { label: "Top Priority", value: summary.topPriority, color: "#EF4444" },
              { label: "High Priority", value: summary.highPriority, color: "#F59E0B" },
              { label: "Competitor Gaps", value: summary.competitorGaps, color: "#A78BFA" },
              { label: "Easy Wins", value: summary.easyWins, color: "#22C55E" },
            ].map((metric) => (
              <div key={metric.label} style={{
                background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8, padding: "9px 10px",
              }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: metric.color }}>{metric.value}</div>
                <div style={{ fontSize: 9.5, color: "#64748B", marginTop: 2 }}>{metric.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {items.map((item, index) => {
          const tier = TIER_CONFIG[item.priorityTier];
          return (
            <div key={item.opportunityId} style={{
              background: "rgba(11,22,41,0.8)", border: `1px solid ${tier.color}28`,
              borderTop: `3px solid ${tier.color}`, borderRadius: 11, padding: 16,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 900, color: "#030612", background: tier.color,
                    borderRadius: 20, padding: "2px 8px", flexShrink: 0,
                  }}>#{index + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#E2E8F0", lineHeight: 1.3 }}>
                      {item.domain ?? categoryLabel(item.category)}
                    </div>
                    <div style={{ fontSize: 9.5, color: "#64748B", marginTop: 2 }}>
                      {tier.icon} {tier.label} · {categoryLabel(item.category)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: tier.color }}>{Math.round(item.priorityScore)}</div>
                  <div style={{ fontSize: 8.5, color: "#475569" }}>priority</div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.55, marginBottom: 10 }}>
                {item.rationale || "Opportunity supported by persisted discovery evidence."}
              </div>

              {item.reasonCodes.includes("competitor_gap") && item.evidencePreview.length > 0 && (
                <div style={{
                  background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.16)",
                  borderRadius: 9, padding: "10px", marginBottom: 10,
                }}>
                  <div style={{ fontSize: 8.5, color: "#A78BFA", fontWeight: 900, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 7 }}>
                    Competitor Link Evidence
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {item.evidencePreview.map((evidence) => (
                      <div key={evidence.id} style={{
                        background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 7, padding: "8px 9px",
                      }}>
                        <a
                          href={evidence.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: "block", fontSize: 10.5, fontWeight: 800, color: "#C4B5FD", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {evidence.sourceDomain}
                        </a>
                        <div style={{ fontSize: 9, color: "#475569", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={evidence.sourceUrl}>
                          {linkLabel(evidence.sourceUrl)}
                        </div>
                        {evidence.competitorUrl && (
                          <div style={{ fontSize: 9.5, color: "#94A3B8", marginTop: 6, lineHeight: 1.4 }}>
                            Competitor placement:{" "}
                            <a href={evidence.competitorUrl} target="_blank" rel="noreferrer" style={{ color: "#A78BFA", textDecoration: "none" }}>
                              {linkLabel(evidence.competitorUrl)}
                            </a>
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                          <span style={{ fontSize: 8.5, color: "#CBD5E1" }}>Authority {evidence.authority}</span>
                          <span style={{ fontSize: 8.5, color: "#CBD5E1" }}>Competitor Signal {evidence.competitorFrequency}</span>
                          <span style={{ fontSize: 8.5, color: "#22C55E" }}>Access {evidence.relationshipAccessibility}</span>
                          <span style={{ fontSize: 8.5, color: "#F59E0B" }}>Effort {evidence.estimatedEffort}</span>
                        </div>
                        {evidence.providers.length > 0 && (
                          <div style={{ fontSize: 8, color: "#475569", marginTop: 5 }}>
                            Evidence via {evidence.providers.join(", ")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{
                background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.13)",
                borderRadius: 8, padding: "9px 10px", marginBottom: 10,
              }}>
                <div style={{ fontSize: 8.5, color: "#475569", fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 3 }}>
                  Next Action
                </div>
                <div style={{ fontSize: 10.5, color: "#93C5FD", lineHeight: 1.5 }}>
                  {item.recommendedAction || "Review this opportunity before pursuing it."}
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
                <span style={{ fontSize: 9, color: "#22C55E" }}>Value {item.potentialValue}</span>
                <span style={{ fontSize: 9, color: "#F59E0B" }}>Attainability {item.attainability}</span>
                <span style={{ fontSize: 9, color: "#94A3B8" }}>{item.evidenceCount} evidence</span>
                <span style={{ fontSize: 9, color: "#38BDF8" }}>{item.workflowStatus}</span>
              </div>

              {item.reasonCodes.length > 0 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {item.reasonCodes.map((reason) => (
                    <span key={reason} style={{
                      fontSize: 8.5, color: "#94A3B8", background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20, padding: "2px 7px",
                    }}>
                      {REASON_LABELS[reason]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
