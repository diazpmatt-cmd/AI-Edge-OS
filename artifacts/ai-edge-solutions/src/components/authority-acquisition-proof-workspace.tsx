import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "@/lib/api";

type ProofType =
  | "backlink_live"
  | "citation_live"
  | "partnership_confirmed"
  | "sponsorship_confirmed"
  | "guest_post_live"
  | "other";
type Verification = "unverified" | "human_verified" | "invalid";

interface ProofRecord {
  id: string;
  proofType: ProofType;
  sourceUrl: string;
  targetUrl: string | null;
  notes: string | null;
  verificationStatus: Verification;
  verifiedAt: string | null;
  verifiedBy: string | null;
  version: number;
  updatedAt: string;
}

interface ProofResponse {
  workflowStatus: "pursuing" | "won";
  proofs: ProofRecord[];
  externalVerificationAvailable: false;
  sendAvailable: false;
}

const PROOF_TYPES: Array<{ value: ProofType; label: string }> = [
  { value: "backlink_live", label: "Backlink Live" },
  { value: "citation_live", label: "Citation Live" },
  { value: "partnership_confirmed", label: "Partnership Confirmed" },
  { value: "sponsorship_confirmed", label: "Sponsorship Confirmed" },
  { value: "guest_post_live", label: "Guest Post Live" },
  { value: "other", label: "Other" },
];

const EMPTY = {
  proofType: "backlink_live" as ProofType,
  sourceUrl: "",
  targetUrl: "",
  notes: "",
};

export function AuthorityAcquisitionProofWorkspace({ opportunityId }: { opportunityId: string }) {
  const apiFetch = useApiFetch();
  const [data, setData] = useState<ProofResponse | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<ProofRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<ProofResponse>(
        `/backlinks/opportunities/${opportunityId}/acquisition-proofs`,
      ));
    } catch (cause: unknown) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "Failed to load acquisition proof");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, opportunityId]);

  useEffect(() => { void load(); }, [load]);

  const resetForm = () => {
    setEditing(null);
    setForm(EMPTY);
  };

  const submit = useCallback(async () => {
    if (busy || !form.sourceUrl.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        proofType: form.proofType,
        sourceUrl: form.sourceUrl,
        targetUrl: form.targetUrl || null,
        notes: form.notes || null,
        ...(editing ? { expectedVersion: editing.version } : {}),
      };
      await apiFetch(
        editing
          ? `/backlinks/opportunities/${opportunityId}/acquisition-proofs/${editing.id}`
          : `/backlinks/opportunities/${opportunityId}/acquisition-proofs`,
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      resetForm();
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to save acquisition proof");
    } finally {
      setBusy(false);
    }
  }, [apiFetch, busy, editing, form, load, opportunityId]);

  const act = useCallback(async (proof: ProofRecord, action: "verify" | "invalidate" | "reopen") => {
    if (busy) return;
    if (action === "verify" && !window.confirm("Human-verify this acquisition proof? Confirm the source URL shows the acquired outcome.")) return;
    if (action === "invalidate" && !window.confirm("Mark this proof invalid? It will be retained for audit history.")) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(
        `/backlinks/opportunities/${opportunityId}/acquisition-proofs/${proof.id}/action`,
        {
          method: "POST",
          body: JSON.stringify({ action, expectedVersion: proof.version }),
        },
      );
      if (editing?.id === proof.id) resetForm();
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to update acquisition proof");
    } finally {
      setBusy(false);
    }
  }, [apiFetch, busy, editing?.id, load, opportunityId]);

  return (
    <section style={{
      background: "rgba(34,197,94,0.03)", border: "1px solid rgba(34,197,94,0.16)",
      borderRadius: 12, padding: 16, marginBottom: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#E2E8F0" }}>Acquisition Proof</div>
          <div style={{ fontSize: 10, color: "#64748B", marginTop: 3, lineHeight: 1.5 }}>
            Record proof that the authority outcome was actually acquired. Human verification is required before Mark Won.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 8.5, fontWeight: 900, color: "#86EFAC", border: "1px solid rgba(34,197,94,0.22)", background: "rgba(34,197,94,0.06)", borderRadius: 20, padding: "3px 8px" }}>
            HUMAN VERIFIED
          </span>
          <span style={{ fontSize: 8.5, fontWeight: 900, color: "#94A3B8", border: "1px solid rgba(148,163,184,0.16)", background: "rgba(148,163,184,0.04)", borderRadius: 20, padding: "3px 8px" }}>
            NO AUTO CHECKS
          </span>
        </div>
      </div>

      {loading && <div style={{ marginTop: 12, fontSize: 10, color: "#64748B" }}>⟳ Loading proof workspace…</div>}
      {error && <div style={{ marginTop: 10, fontSize: 10, color: "#FCA5A5" }}>⚠ {error}</div>}

      {data && !loading && (
        <>
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "minmax(160px,.65fr) minmax(220px,1.35fr)", gap: 8 }}>
            <select
              value={form.proofType}
              disabled={busy || editing?.verificationStatus === "invalid"}
              onChange={(event) => setForm((current) => ({ ...current, proofType: event.target.value as ProofType }))}
              style={{ background: "#07101E", color: "#CBD5E1", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, padding: "7px 8px", fontSize: 10 }}
            >
              {PROOF_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
            <input
              value={form.sourceUrl}
              disabled={busy || editing?.verificationStatus === "invalid"}
              onChange={(event) => setForm((current) => ({ ...current, sourceUrl: event.target.value }))}
              placeholder="Live proof URL (required)"
              style={{ background: "#07101E", color: "#CBD5E1", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, padding: "7px 8px", fontSize: 10 }}
            />
            <input
              value={form.targetUrl}
              disabled={busy || editing?.verificationStatus === "invalid"}
              onChange={(event) => setForm((current) => ({ ...current, targetUrl: event.target.value }))}
              placeholder="Client target URL (optional)"
              style={{ background: "#07101E", color: "#CBD5E1", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, padding: "7px 8px", fontSize: 10 }}
            />
            <input
              value={form.notes}
              disabled={busy || editing?.verificationStatus === "invalid"}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Human verification notes (optional)"
              style={{ background: "#07101E", color: "#CBD5E1", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, padding: "7px 8px", fontSize: 10 }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <button
              disabled={busy || !form.sourceUrl.trim() || editing?.verificationStatus === "invalid"}
              onClick={() => void submit()}
              style={{ border: "1px solid rgba(34,197,94,0.25)", background: "rgba(34,197,94,0.08)", color: "#86EFAC", borderRadius: 7, padding: "6px 10px", fontSize: 9, fontWeight: 800, cursor: busy ? "default" : "pointer" }}
            >
              {busy ? "Saving…" : editing ? "Save Proof Changes" : "Add Acquisition Proof"}
            </button>
            {editing && (
              <button onClick={resetForm} disabled={busy} style={{ border: "1px solid rgba(255,255,255,0.10)", background: "transparent", color: "#94A3B8", borderRadius: 7, padding: "6px 9px", fontSize: 9, cursor: "pointer" }}>
                Cancel Edit
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 12 }}>
            {data.proofs.length === 0 && (
              <div style={{ fontSize: 10, color: "#64748B" }}>No acquisition proof recorded yet. Mark Won remains blocked.</div>
            )}
            {data.proofs.map((proof) => {
              const verified = proof.verificationStatus === "human_verified";
              const invalid = proof.verificationStatus === "invalid";
              return (
                <div key={proof.id} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 9, padding: "9px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: "#CBD5E1", fontWeight: 800 }}>{PROOF_TYPES.find((type) => type.value === proof.proofType)?.label ?? proof.proofType}</div>
                      <div style={{ fontSize: 9, color: "#64748B", marginTop: 3, overflowWrap: "anywhere" }}>{proof.sourceUrl}</div>
                      {proof.targetUrl && <div style={{ fontSize: 9, color: "#475569", marginTop: 2, overflowWrap: "anywhere" }}>Target: {proof.targetUrl}</div>}
                    </div>
                    <span style={{ fontSize: 8.5, fontWeight: 900, color: verified ? "#86EFAC" : invalid ? "#FCA5A5" : "#FBBF24" }}>
                      {proof.verificationStatus.replace("_", " ")} · v{proof.version}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {!invalid && (
                      <button disabled={busy} onClick={() => {
                        setEditing(proof);
                        setForm({ proofType: proof.proofType, sourceUrl: proof.sourceUrl, targetUrl: proof.targetUrl ?? "", notes: proof.notes ?? "" });
                      }} style={{ border: "1px solid rgba(56,189,248,0.18)", background: "rgba(56,189,248,0.05)", color: "#7DD3FC", borderRadius: 6, padding: "4px 7px", fontSize: 8.5, cursor: "pointer" }}>
                        Edit
                      </button>
                    )}
                    {!verified && !invalid && <button disabled={busy} onClick={() => void act(proof, "verify")} style={{ border: "1px solid rgba(34,197,94,0.22)", background: "rgba(34,197,94,0.07)", color: "#86EFAC", borderRadius: 6, padding: "4px 7px", fontSize: 8.5, cursor: "pointer" }}>Human Verify</button>}
                    {!invalid && <button disabled={busy} onClick={() => void act(proof, "invalidate")} style={{ border: "1px solid rgba(239,68,68,0.18)", background: "rgba(239,68,68,0.05)", color: "#FCA5A5", borderRadius: 6, padding: "4px 7px", fontSize: 8.5, cursor: "pointer" }}>Invalidate</button>}
                    {invalid && <button disabled={busy} onClick={() => void act(proof, "reopen")} style={{ border: "1px solid rgba(167,139,250,0.20)", background: "rgba(167,139,250,0.06)", color: "#C4B5FD", borderRadius: 6, padding: "4px 7px", fontSize: 8.5, cursor: "pointer" }}>Reopen</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
