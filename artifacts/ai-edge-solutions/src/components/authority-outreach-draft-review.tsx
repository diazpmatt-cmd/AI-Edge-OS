import { useCallback, useEffect, useMemo, useState } from "react";
import { useApiFetch } from "@/lib/api";

interface DraftEvidence {
  id: string;
  sourceDomain: string;
  sourceUrl: string;
  competitorUrl: string | null;
  targetUrl: string | null;
}

interface DraftProvenance {
  opportunityId: string;
  category: string;
  recommendedAction: string;
  client: { name: string; industryLabel: string; region: string };
  service: { id: string; name: string } | null;
  evidence: DraftEvidence[];
}

interface PersistedDraft {
  id: string;
  status: "draft" | "approved" | "rejected";
  subject: string;
  body: string;
  provenance: DraftProvenance;
  generatedBy: string;
  version: number;
  approvedAt: string | null;
  approvedBy: string | null;
  updatedAt: string;
}

interface DraftVersion {
  id: string;
  version: number;
  action: "create" | "save" | "approve" | "reopen" | "reject";
  status: "draft" | "approved" | "rejected";
  actorId: string;
  createdAt: string;
}

interface DraftResponse {
  workflowStatus: "approved" | "pursuing";
  editable: true;
  persisted: boolean;
  sendAvailable: false;
  draft: {
    draftType: string;
    subject: string;
    body: string;
    generatedBy: "deterministic_template_v1";
    externalActionAllowed: false;
    provenance: DraftProvenance;
  };
  persistedDraft: PersistedDraft | null;
  history: DraftVersion[];
}

function label(value: string): string {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function statusColor(status: PersistedDraft["status"] | "unsaved"): string {
  if (status === "approved") return "#22C55E";
  if (status === "rejected") return "#F87171";
  if (status === "draft") return "#38BDF8";
  return "#F59E0B";
}

const pill = (color: string) => ({
  fontSize: 8.5,
  color,
  border: `1px solid ${color}33`,
  background: `${color}10`,
  borderRadius: 20,
  padding: "2px 7px",
});

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<DraftResponse>(
        `/backlinks/opportunities/${opportunityId}/outreach-draft-preview`,
      );
      setData(response);
      setSubject(response.persistedDraft?.subject ?? response.draft.subject);
      setBody(response.persistedDraft?.body ?? response.draft.body);
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

  const savedSubject = data?.persistedDraft?.subject ?? data?.draft.subject ?? "";
  const savedBody = data?.persistedDraft?.body ?? data?.draft.body ?? "";
  const dirty = useMemo(
    () => subject !== savedSubject || body !== savedBody,
    [subject, body, savedSubject, savedBody],
  );

  const saveDraft = useCallback(async () => {
    if (!data || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/backlinks/opportunities/${opportunityId}/outreach-draft`, {
        method: "POST",
        body: JSON.stringify({
          subject,
          body,
          ...(data.persistedDraft ? { expectedVersion: data.persistedDraft.version } : {}),
        }),
      });
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to save outreach draft");
    } finally {
      setBusy(false);
    }
  }, [apiFetch, body, busy, data, load, opportunityId, subject]);

  const mutateDraft = useCallback(async (action: "approve" | "reopen" | "reject") => {
    const current = data?.persistedDraft;
    if (!current || busy) return;
    if (action === "reject" && !window.confirm("Reject this outreach draft? The Authority opportunity itself will not be rejected.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/backlinks/opportunities/${opportunityId}/outreach-draft/action`, {
        method: "POST",
        body: JSON.stringify({ action, expectedVersion: current.version }),
      });
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to update outreach draft");
    } finally {
      setBusy(false);
    }
  }, [apiFetch, busy, data?.persistedDraft, load, opportunityId]);

  const currentStatus: PersistedDraft["status"] | "unsaved" = data?.persistedDraft?.status ?? "unsaved";
  const provenance: DraftProvenance | null = data
    ? (data.persistedDraft?.provenance ?? data.draft.provenance)
    : null;

  return (
    <section style={{
      background: "rgba(167,139,250,0.045)",
      border: "1px solid rgba(167,139,250,0.20)",
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#E2E8F0" }}>Outreach Draft Review</div>
          <div style={{ fontSize: 10, color: "#64748B", marginTop: 3, lineHeight: 1.5 }}>
            Save and approve evidence-grounded outreach copy without creating any delivery capability.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ ...pill("#F59E0B"), fontWeight: 900 }}>NO SEND CAPABILITY</span>
          <button
            onClick={onClose}
            disabled={busy}
            style={{ border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.035)", color: "#94A3B8", borderRadius: 7, padding: "5px 9px", fontSize: 9, cursor: busy ? "default" : "pointer" }}
          >
            Close
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ padding: "22px 0 8px", fontSize: 11, color: "#64748B" }}>
          ⟳ Loading evidence-grounded draft workspace…
        </div>
      )}

      {error && !loading && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)", color: "#FCA5A5", fontSize: 10.5 }}>
          ⚠ {error}
          <button onClick={() => void load()} disabled={busy} style={{ marginLeft: 8, border: 0, background: "transparent", color: "#FCA5A5", textDecoration: "underline", cursor: "pointer", fontSize: 9 }}>
            Reload
          </button>
        </div>
      )}

      {data && provenance && !loading && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={pill("#38BDF8")}>{label(data.draft.draftType)}</span>
            <span style={pill("#22C55E")}>Authority workflow: {data.workflowStatus}</span>
            <span style={{ ...pill(statusColor(currentStatus)), fontWeight: 800 }}>
              Draft: {currentStatus}{data.persistedDraft ? ` · v${data.persistedDraft.version}` : ""}
            </span>
            <span style={pill("#94A3B8")}>Deterministic template · zero model spend</span>
          </div>

          <label style={{ display: "block", fontSize: 9, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>
            Subject
          </label>
          <input
            value={subject}
            disabled={busy || data.persistedDraft?.status === "rejected"}
            maxLength={300}
            onChange={(event) => setSubject(event.target.value)}
            style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, padding: "9px 10px", color: "#E2E8F0", background: "rgba(3,6,18,0.8)", border: "1px solid rgba(255,255,255,0.09)", fontSize: 11, outline: "none", marginBottom: 10, opacity: data.persistedDraft?.status === "rejected" ? 0.55 : 1 }}
          />

          <label style={{ display: "block", fontSize: 9, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 }}>
            Message
          </label>
          <textarea
            value={body}
            disabled={busy || data.persistedDraft?.status === "rejected"}
            maxLength={8000}
            onChange={(event) => setBody(event.target.value)}
            rows={10}
            style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, padding: 10, color: "#E2E8F0", background: "rgba(3,6,18,0.8)", border: "1px solid rgba(255,255,255,0.09)", fontSize: 11, lineHeight: 1.55, resize: "vertical", outline: "none", fontFamily: "inherit", opacity: data.persistedDraft?.status === "rejected" ? 0.55 : 1 }}
          />

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 9 }}>
            <div style={{ fontSize: 9, color: dirty ? "#F59E0B" : "#475569" }}>
              {dirty
                ? "Unsaved edits. Save before approval."
                : data.persistedDraft
                  ? `Saved version ${data.persistedDraft.version}. Approval and delivery remain separate.`
                  : "This baseline is not persisted until you choose Save Draft."}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                disabled={busy || (!dirty && Boolean(data.persistedDraft)) || data.persistedDraft?.status === "rejected"}
                onClick={() => void saveDraft()}
                style={{ border: "1px solid rgba(56,189,248,0.28)", background: "rgba(56,189,248,0.09)", color: "#7DD3FC", borderRadius: 7, padding: "6px 10px", fontSize: 9, fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy || (!dirty && Boolean(data.persistedDraft)) ? 0.45 : 1 }}
              >
                {busy ? "Saving…" : data.persistedDraft ? "Save Changes" : "Save Draft"}
              </button>

              {data.persistedDraft?.status === "draft" && (
                <button
                  disabled={busy || dirty}
                  onClick={() => void mutateDraft("approve")}
                  style={{ border: "1px solid rgba(34,197,94,0.30)", background: "rgba(34,197,94,0.10)", color: "#86EFAC", borderRadius: 7, padding: "6px 10px", fontSize: 9, fontWeight: 900, cursor: busy || dirty ? "default" : "pointer", opacity: dirty ? 0.45 : 1 }}
                >
                  Approve Draft
                </button>
              )}

              {(data.persistedDraft?.status === "approved" || data.persistedDraft?.status === "rejected") && (
                <button
                  disabled={busy}
                  onClick={() => void mutateDraft("reopen")}
                  style={{ border: "1px solid rgba(167,139,250,0.28)", background: "rgba(167,139,250,0.08)", color: "#C4B5FD", borderRadius: 7, padding: "6px 10px", fontSize: 9, fontWeight: 800, cursor: busy ? "default" : "pointer" }}
                >
                  Reopen for Editing
                </button>
              )}

              {data.persistedDraft && data.persistedDraft.status !== "rejected" && (
                <button
                  disabled={busy || dirty}
                  onClick={() => void mutateDraft("reject")}
                  style={{ border: "1px solid rgba(239,68,68,0.22)", background: "rgba(239,68,68,0.06)", color: "#FCA5A5", borderRadius: 7, padding: "6px 9px", fontSize: 9, fontWeight: 700, cursor: busy || dirty ? "default" : "pointer", opacity: dirty ? 0.45 : 1 }}
                >
                  Reject Draft
                </button>
              )}

              <button
                disabled={busy}
                onClick={() => {
                  setSubject(savedSubject);
                  setBody(savedBody);
                }}
                style={{ border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.035)", color: "#94A3B8", borderRadius: 7, padding: "6px 9px", fontSize: 9, fontWeight: 700, cursor: busy ? "default" : "pointer" }}
              >
                Undo Edits
              </button>
            </div>
          </div>

          {data.persistedDraft?.status === "approved" && data.persistedDraft.approvedAt && (
            <div style={{ marginTop: 9, fontSize: 9, color: "#22C55E" }}>
              ✓ Human approved this exact version on {new Date(data.persistedDraft.approvedAt).toLocaleString()}. Editing it will require fresh approval.
            </div>
          )}

          <div style={{ marginTop: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 9, padding: "10px 11px" }}>
            <div style={{ fontSize: 8.5, color: "#A78BFA", fontWeight: 900, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 7 }}>
              Draft Provenance
            </div>
            <div style={{ fontSize: 9.5, color: "#94A3B8", lineHeight: 1.55 }}>
              <div><strong style={{ color: "#CBD5E1" }}>Client:</strong> {provenance.client.name} · {provenance.client.industryLabel} · {provenance.client.region}</div>
              {provenance.service && <div><strong style={{ color: "#CBD5E1" }}>Service:</strong> {provenance.service.name}</div>}
              <div><strong style={{ color: "#CBD5E1" }}>Recommended action:</strong> {provenance.recommendedAction}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
              {provenance.evidence.map((evidence) => (
                <div key={evidence.id} style={{ fontSize: 9, color: "#64748B", overflow: "hidden" }}>
                  Evidence: <span style={{ color: "#94A3B8" }}>{evidence.sourceDomain}</span> · {evidence.sourceUrl}
                  {evidence.competitorUrl ? ` · competitor placement: ${evidence.competitorUrl}` : ""}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 10, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 9, padding: "10px 11px" }}>
            <div style={{ fontSize: 8.5, color: "#64748B", fontWeight: 900, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 7 }}>
              Immutable Version History
            </div>
            {data.history.length === 0 ? (
              <div style={{ fontSize: 9, color: "#475569" }}>No persisted versions yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {data.history.map((entry) => (
                  <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 9, color: "#64748B", flexWrap: "wrap" }}>
                    <span><strong style={{ color: "#94A3B8" }}>v{entry.version}</strong> · {label(entry.action)} · {entry.status}</span>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
