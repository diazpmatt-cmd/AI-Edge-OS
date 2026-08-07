import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "@/lib/api";

type WorkflowStatus = "discovered" | "reviewing" | "approved" | "pursuing";
type WorkflowAction = "review" | "approve" | "start_pursuing" | "mark_won" | "reject";

interface QueueItem {
  opportunityId: string;
  domain: string | null;
  category: string;
  workflowStatus: WorkflowStatus;
  priorityScore: number;
  priorityTier: "top" | "high" | "medium" | "low";
  recommendedAction: string;
}

interface IntelligenceResponse {
  items: QueueItem[];
}

interface WorkflowActionResponse {
  workflow: {
    opportunityId: string;
    status: string;
    version: number;
    updatedAt: string;
  };
}

const PRIMARY_ACTION: Record<WorkflowStatus, { action: WorkflowAction; label: string }> = {
  discovered: { action: "review", label: "Review" },
  reviewing: { action: "approve", label: "Approve" },
  approved: { action: "start_pursuing", label: "Start Pursuing" },
  pursuing: { action: "mark_won", label: "Mark Won" },
};

const STATUS_COLOR: Record<WorkflowStatus, string> = {
  discovered: "#64748B",
  reviewing: "#F59E0B",
  approved: "#38BDF8",
  pursuing: "#A78BFA",
};

function categoryLabel(category: string): string {
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function AuthorityWorkflowQueue({ onChanged }: { onChanged: () => void }) {
  const apiFetch = useApiFetch();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await apiFetch<IntelligenceResponse>(
        "/backlinks/opportunities/intelligence?limit=10",
      );
      setItems(response.items ?? []);
    } catch (error: unknown) {
      setItems([]);
      setLoadError(error instanceof Error ? error.message : "Failed to load workflow queue");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(async (item: QueueItem, action: WorkflowAction) => {
    if (action === "reject" && !window.confirm("Reject this authority opportunity? This makes the workflow terminal.")) {
      return;
    }
    if (action === "mark_won" && !window.confirm("Mark this authority opportunity as won?")) {
      return;
    }

    setTransitioningId(item.opportunityId);
    setActionError(null);
    try {
      await apiFetch<WorkflowActionResponse>(
        `/backlinks/opportunities/${item.opportunityId}/workflow-action`,
        {
          method: "POST",
          body: JSON.stringify({ action }),
        },
      );
      setTransitioningId(null);
      onChanged();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Workflow action failed");
      setTransitioningId(null);
    }
  }, [apiFetch, onChanged]);

  if (loading) {
    return (
      <section style={{
        background: "rgba(11,22,41,0.8)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12, padding: "14px 16px", marginBottom: 16, color: "#64748B", fontSize: 11,
      }}>
        ⟳ Loading human approval queue…
      </section>
    );
  }

  return (
    <section style={{
      background: "rgba(34,197,94,0.035)", border: "1px solid rgba(34,197,94,0.15)",
      borderRadius: 12, padding: "14px 16px", marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: items.length > 0 ? 12 : 0 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#E2E8F0" }}>Human Approval Queue</div>
          <div style={{ fontSize: 10, color: "#64748B", marginTop: 3, lineHeight: 1.5 }}>
            Advance durable Authority workflows one human decision at a time. No outreach or provider action is sent here.
          </div>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 800, color: "#22C55E", background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.2)", borderRadius: 20, padding: "3px 8px",
        }}>
          HUMAN CONTROLLED
        </span>
      </div>

      {loadError && (
        <div style={{ fontSize: 10, color: "#FCA5A5" }}>
          ⚠ {loadError}
          <button onClick={() => void load()} style={{ marginLeft: 8, fontSize: 9, color: "#FCA5A5", background: "transparent", border: 0, cursor: "pointer", textDecoration: "underline" }}>
            Retry
          </button>
        </div>
      )}

      {actionError && (
        <div style={{
          fontSize: 10, color: "#FCA5A5", background: "rgba(239,68,68,0.06)",
          border: "1px solid rgba(239,68,68,0.15)", borderRadius: 7, padding: "7px 9px", marginBottom: 9,
        }}>
          ⚠ {actionError}
        </div>
      )}

      {!loadError && items.length === 0 && (
        <div style={{ fontSize: 10.5, color: "#64748B" }}>
          No actionable workflows need a human decision right now.
        </div>
      )}

      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {items.map((item) => {
            const primary = PRIMARY_ACTION[item.workflowStatus];
            const busy = transitioningId === item.opportunityId;
            const statusColor = STATUS_COLOR[item.workflowStatus];
            return (
              <div key={item.opportunityId} style={{
                display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center",
                background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 9, padding: "9px 10px",
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: "#CBD5E1" }}>
                      {item.domain ?? categoryLabel(item.category)}
                    </span>
                    <span style={{
                      fontSize: 8.5, fontWeight: 800, color: statusColor,
                      background: `${statusColor}12`, border: `1px solid ${statusColor}28`,
                      borderRadius: 20, padding: "1px 6px",
                    }}>
                      {item.workflowStatus}
                    </span>
                    <span style={{ fontSize: 8.5, color: "#475569" }}>
                      Priority {Math.round(item.priorityScore)}
                    </span>
                  </div>
                  <div style={{ fontSize: 9.5, color: "#64748B", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.recommendedAction || "Review this opportunity."}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    disabled={busy || Boolean(transitioningId && !busy)}
                    onClick={() => void act(item, primary.action)}
                    style={{
                      padding: "5px 9px", borderRadius: 7, fontSize: 9, fontWeight: 800,
                      cursor: busy ? "default" : "pointer", color: "#030612", background: "#38BDF8",
                      border: "1px solid rgba(56,189,248,0.45)", opacity: transitioningId && !busy ? 0.45 : 1,
                    }}
                  >
                    {busy ? "Saving…" : primary.label}
                  </button>
                  <button
                    disabled={Boolean(transitioningId)}
                    onClick={() => void act(item, "reject")}
                    style={{
                      padding: "5px 8px", borderRadius: 7, fontSize: 9, fontWeight: 700,
                      cursor: transitioningId ? "default" : "pointer", color: "#FCA5A5",
                      background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)",
                      opacity: transitioningId ? 0.45 : 1,
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
