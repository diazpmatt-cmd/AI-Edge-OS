import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "@/lib/api";

type Blocker =
  | "workflow_not_pursuing"
  | "outreach_draft_missing"
  | "outreach_draft_not_approved"
  | "verified_contact_missing"
  | "verified_contact_provenance_missing";

interface ReadinessResponse {
  workflowStatus: string;
  readiness: {
    ready: boolean;
    blockers: Blocker[];
    verifiedContactCount: number;
    sendAuthorized: false;
    meaning: "ready_for_human_consideration_only";
  };
  sendAvailable: false;
  sendAuthorized: false;
}

const BLOCKER_COPY: Record<Blocker, string> = {
  workflow_not_pursuing: "Move the Authority opportunity to Pursuing.",
  outreach_draft_missing: "Save an outreach draft.",
  outreach_draft_not_approved: "Approve the current saved outreach draft.",
  verified_contact_missing: "Add and human-verify at least one target contact path.",
  verified_contact_provenance_missing: "Re-verify a target contact with a source URL and human verification record.",
};

export function AuthorityOutreachReadinessCard({ opportunityId }: { opportunityId: string }) {
  const apiFetch = useApiFetch();
  const [data, setData] = useState<ReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<ReadinessResponse>(
        `/backlinks/opportunities/${opportunityId}/outreach-readiness`,
      ));
    } catch (cause: unknown) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "Failed to evaluate outreach readiness");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, opportunityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ready = data?.readiness.ready === true;

  return (
    <section style={{
      background: ready ? "rgba(34,197,94,0.04)" : "rgba(245,158,11,0.035)",
      border: `1px solid ${ready ? "rgba(34,197,94,0.18)" : "rgba(245,158,11,0.18)"}`,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#E2E8F0" }}>Outreach Readiness Gate</div>
          <div style={{ fontSize: 10, color: "#64748B", marginTop: 3, lineHeight: 1.5 }}>
            Deterministic preflight from durable Authority workflow, approved draft, and human-verified contact state.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 8.5, fontWeight: 900,
            color: ready ? "#86EFAC" : "#FBBF24",
            border: `1px solid ${ready ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.24)"}`,
            background: ready ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.07)",
            borderRadius: 20, padding: "3px 8px",
          }}>
            {loading ? "CHECKING" : ready ? "READY FOR HUMAN CONSIDERATION" : "BLOCKED"}
          </span>
          <span style={{ fontSize: 8.5, fontWeight: 900, color: "#F87171", border: "1px solid rgba(248,113,113,0.22)", background: "rgba(248,113,113,0.06)", borderRadius: 20, padding: "3px 8px" }}>
            NOT AUTHORIZED TO SEND
          </span>
        </div>
      </div>

      {loading && <div style={{ marginTop: 12, fontSize: 10, color: "#64748B" }}>⟳ Evaluating readiness…</div>}

      {error && !loading && (
        <div style={{ marginTop: 12, fontSize: 10, color: "#FCA5A5" }}>
          ⚠ {error}
          <button onClick={() => void load()} style={{ marginLeft: 8, border: 0, background: "transparent", color: "#FCA5A5", textDecoration: "underline", cursor: "pointer", fontSize: 9 }}>
            Retry
          </button>
        </div>
      )}

      {data && !loading && (
        <div style={{ marginTop: 12 }}>
          {ready ? (
            <div style={{ fontSize: 10.5, color: "#86EFAC", lineHeight: 1.6 }}>
              ✓ The opportunity is pursuing, the current draft is human-approved, and at least one sourced contact path is human-verified.
              This means the package is ready for a human to consider a future delivery action only.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.readiness.blockers.map((blocker) => (
                <div key={blocker} style={{ fontSize: 10, color: "#FCD34D", lineHeight: 1.5 }}>
                  • {BLOCKER_COPY[blocker]}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 9, color: "#64748B" }}>
            Workflow: {data.workflowStatus} · Human-verified contacts: {data.readiness.verifiedContactCount} · Send authorized: never in this phase
          </div>
        </div>
      )}
    </section>
  );
}
