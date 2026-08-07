import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "@/lib/api";

interface DraftEvidence {
  id: string;
  sourceDomain: string;
  sourceUrl: string;
  competitorUrl: string | null;
  targetUrl: string | null;
}

interface DraftResponse {
  workflowStatus: "approved" | "pursuing";
  editable: true;
  persisted: false;
  sendAvailable: false;
  draft: {
    draftType: string;
    subject: string;
    body: string;
    generatedBy: "deterministic_template_v1";
    externalActionAllowed: false;
    provenance: {
      opportunityId: string;
      category: string;
      recommendedAction: string;
      client: {
        name: string;
        industryLabel: string;
        region: string;
      };
      service: { id: string; name: string } | null;
      evidence: DraftEvidence[];
    };
  };
}

function label(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AuthorityOutreachDraftReview({
  opportunityId,
  onClose,
}: {
  opportunityId: string;
  onClose: () => void;
}) {
  const apiFetch = useApiFetch();
  const [data, setData] = useState<DraftResponse | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<DraftResponse>(
        `/backlinks/opportunities/${opportunityId}/outreach-draft-preview`,
      );
      setData(response);
      setSubject(response.draft.subject);
      setBody(response.draft.body);
    } catch (cause: unknown) {
      setData(null);
      setSubject("");
      setBody("");
      setError(cause instanceof Error ? cause.message : "Failed to prepare outreach draft");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, opportunityId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section style={{
      background: "rgba(167,139,250,0.045)",
      border: "1px solid rgba(167,139,250,0.20)",
      borderRadius: 12,
      padding: "16px",
      marginBottom: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#E2E8F0" }}>Outreach Draft Review</div>
          <div style={{ fontSize: 10, color: "#64748B", marginTop: 3, lineHeight: 1.5 }}>
            Prepared from approved tenant context and persisted opportunity evidence. Edit locally before any future delivery step.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{
            fontSize: 8.5, fontWeight: 900, color: "#F59E0B", background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.22)", borderRadius: 20, padding: "3px 8px",
          }}>
            DRAFT ONLY · NOT SAVED · NO SEND
          </span>
          <button onClick={onClose} style={{
            border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.035)",
            color: "#94A3B8", borderRadius: 7, padding: "5px 9px", fontSize: 9, cursor: "pointer",
          }}>
            Close
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ padding: "22px 0 8px", fontSize: 11, color: "#64748B" }}>
          ⟳ Building evidence-grounded draft…
        </div>
      )}

      {error && !loading && (
        <div style={{
          marginTop: 12, padding: "10px 12px", borderRadius: 8,
          background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)",
          color: "#FCA5A5", fontSize: 10.5,
        }}>
          ⚠ {error}
          <button onClick={() => void load()} style={{ marginLeft: 8, border: 0, background: "transparent", color: "#FCA5A5", textDecoration: "underline", cursor: "pointer", fontSize: 9 }}>
            Retry
          </button>
        </div>
      )}

      {data && !loading && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ fontSize: 8.5, color: "#38BDF8", border: "1px solid rgba(56,189,248,0.18)", background: "rgba(56,189,248,0.06)", borderRadius: 20, padding: "2px 7px" }}>
              {label(data.draft.draftType)}
            </span>
            <span style={{ fontSize: 8.5, color: "#22C55E", border: "1px solid rgba(34,197,94,0.18)", background: "rgba(34,197,94,0.06)", borderRadius: 20, padding: "2px 7px" }}>
              Workflow: {data.workflowStatus}
            </span>
            <span style={{ fontSize: 8.5, color: "#94A3B8", border: "1px solid rgba(148,163,184,0.12)", background: "rgba(148,163,184,0.04)", borderRadius: 20, padding: "2px 7px" }}>
              Deterministic template · zero model spend
            </span>
          </div>

          <label style={{ display: "block", fontSize: 9, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>
            Subject
          </label>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            style={{
              width: "100%", boxSizing: "border-box", borderRadius: 8, padding: "9px 10px",
              color: "#E2E8F0", background: "rgba(3,6,18,0.8)", border: "1px solid rgba(255,255,255,0.09)",
              fontSize: 11, outline: "none", marginBottom: 10,
            }}
          />

          <label style={{ display: "block", fontSize: 9, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>
            Message
          </label>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={10}
            style={{
              width: "100%", boxSizing: "border-box", borderRadius: 8, padding: "10px",
              color: "#E2E8F0", background: "rgba(3,6,18,0.8)", border: "1px solid rgba(255,255,255,0.09)",
              fontSize: 11, lineHeight: 1.55, resize: "vertical", outline: "none", fontFamily: "inherit",
            }}
          />

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
            <div style={{ fontSize: 9, color: "#475569" }}>
              Edits stay in this browser view only. Nothing is persisted or delivered.
            </div>
            <button
              onClick={() => {
                setSubject(data.draft.subject);
                setBody(data.draft.body);
              }}
              style={{
                border: "1px solid rgba(167,139,250,0.22)", background: "rgba(167,139,250,0.07)",
                color: "#C4B5FD", borderRadius: 7, padding: "5px 9px", fontSize: 9, fontWeight: 700, cursor: "pointer",
              }}
            >
              Reset Draft
            </button>
          </div>

          <div style={{
            marginTop: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 9, padding: "10px 11px",
          }}>
            <div style={{ fontSize: 8.5, color: "#A78BFA", fontWeight: 900, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 7 }}>
              Draft Provenance
            </div>
            <div style={{ fontSize: 9.5, color: "#94A3B8", lineHeight: 1.55 }}>
              <div><strong style={{ color: "#CBD5E1" }}>Client:</strong> {data.draft.provenance.client.name} · {data.draft.provenance.client.industryLabel} · {data.draft.provenance.client.region}</div>
              {data.draft.provenance.service && (
                <div><strong style={{ color: "#CBD5E1" }}>Service:</strong> {data.draft.provenance.service.name}</div>
              )}
              <div><strong style={{ color: "#CBD5E1" }}>Recommended action:</strong> {data.draft.provenance.recommendedAction}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
              {data.draft.provenance.evidence.map((evidence) => (
                <div key={evidence.id} style={{ fontSize: 9, color: "#64748B", overflow: "hidden" }}>
                  Evidence: <span style={{ color: "#94A3B8" }}>{evidence.sourceDomain}</span> · {evidence.sourceUrl}
                  {evidence.competitorUrl ? ` · competitor placement: ${evidence.competitorUrl}` : ""}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
