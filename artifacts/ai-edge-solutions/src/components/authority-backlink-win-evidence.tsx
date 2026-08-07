import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "@/lib/api";

type Verification = "unverified" | "human_verified" | "invalid";

interface WinEvidence {
  id: string;
  sourceUrl: string;
  targetUrl: string;
  notes: string | null;
  verificationStatus: Verification;
  verifiedAt: string | null;
  verifiedBy: string | null;
  version: number;
}

interface Response {
  evidence: WinEvidence | null;
  markWonEligible: boolean;
}

export function AuthorityBacklinkWinEvidence({ opportunityId }: { opportunityId: string }) {
  const apiFetch = useApiFetch();
  const [evidence, setEvidence] = useState<WinEvidence | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<Response>(`/backlinks/opportunities/${opportunityId}/win-evidence`);
      setEvidence(response.evidence);
      setSourceUrl(response.evidence?.sourceUrl ?? "");
      setTargetUrl(response.evidence?.targetUrl ?? "");
      setNotes(response.evidence?.notes ?? "");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to load win evidence");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, opportunityId]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/backlinks/opportunities/${opportunityId}/win-evidence`, {
        method: evidence ? "PATCH" : "POST",
        body: JSON.stringify({
          sourceUrl,
          targetUrl,
          notes,
          ...(evidence ? { expectedVersion: evidence.version } : {}),
        }),
      });
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to save win evidence");
    } finally {
      setBusy(false);
    }
  }, [apiFetch, busy, evidence, load, notes, opportunityId, sourceUrl, targetUrl]);

  const act = useCallback(async (action: "verify" | "invalidate" | "reopen") => {
    if (!evidence || busy) return;
    if (action === "invalidate" && !window.confirm("Mark this backlink proof invalid? The record will be retained.")) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/backlinks/opportunities/${opportunityId}/win-evidence/action`, {
        method: "POST",
        body: JSON.stringify({ action, expectedVersion: evidence.version }),
      });
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to update win evidence");
    } finally {
      setBusy(false);
    }
  }, [apiFetch, busy, evidence, load, opportunityId]);

  const color = evidence?.verificationStatus === "human_verified"
    ? "#22C55E"
    : evidence?.verificationStatus === "invalid"
      ? "#F87171"
      : "#F59E0B";

  return (
    <section style={{
      background: "rgba(34,197,94,0.035)", border: "1px solid rgba(34,197,94,0.16)",
      borderRadius: 12, padding: 16, marginBottom: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#E2E8F0" }}>Backlink Win Evidence</div>
          <div style={{ fontSize: 10, color: "#64748B", marginTop: 3, lineHeight: 1.5 }}>
            Record the acquired linking page and client target. Mark Won remains blocked until a human verifies this proof.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ fontSize: 8.5, fontWeight: 900, color, border: `1px solid ${color}30`, background: `${color}10`, borderRadius: 20, padding: "3px 8px" }}>
            {evidence?.verificationStatus === "human_verified" ? "HUMAN VERIFIED" : evidence?.verificationStatus === "invalid" ? "INVALID" : "UNVERIFIED"}
          </span>
          <span style={{ fontSize: 8.5, fontWeight: 900, color: "#94A3B8", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 20, padding: "3px 8px" }}>
            MANUAL PROOF
          </span>
        </div>
      </div>

      {error && <div style={{ marginBottom: 9, color: "#FCA5A5", fontSize: 10 }}>⚠ {error}</div>}
      {loading ? (
        <div style={{ color: "#64748B", fontSize: 10 }}>⟳ Loading win evidence…</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 7 }}>
            <input
              type="url"
              value={sourceUrl}
              disabled={busy || evidence?.verificationStatus === "invalid"}
              placeholder="Linking page URL"
              onChange={(event) => setSourceUrl(event.target.value)}
              style={{ width: "100%", boxSizing: "border-box", borderRadius: 7, padding: "7px 8px", color: "#E2E8F0", background: "rgba(3,6,18,0.82)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 10 }}
            />
            <input
              type="url"
              value={targetUrl}
              disabled={busy || evidence?.verificationStatus === "invalid"}
              placeholder="Client target URL"
              onChange={(event) => setTargetUrl(event.target.value)}
              style={{ width: "100%", boxSizing: "border-box", borderRadius: 7, padding: "7px 8px", color: "#E2E8F0", background: "rgba(3,6,18,0.82)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 10 }}
            />
          </div>
          <textarea
            value={notes}
            disabled={busy || evidence?.verificationStatus === "invalid"}
            placeholder="Verification notes (optional)"
            rows={2}
            onChange={(event) => setNotes(event.target.value)}
            style={{ width: "100%", boxSizing: "border-box", marginTop: 7, borderRadius: 7, padding: 8, color: "#E2E8F0", background: "rgba(3,6,18,0.82)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 10, fontFamily: "inherit", resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {evidence?.verificationStatus !== "invalid" && (
              <button disabled={busy} onClick={() => void save()} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid rgba(56,189,248,0.28)", background: "rgba(56,189,248,0.09)", color: "#7DD3FC", fontSize: 9, fontWeight: 900, cursor: busy ? "default" : "pointer" }}>
                {evidence ? "Save Proof Changes" : "Record Win Evidence"}
              </button>
            )}
            {evidence && evidence.verificationStatus === "unverified" && (
              <button disabled={busy} onClick={() => void act("verify")} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid rgba(34,197,94,0.28)", background: "rgba(34,197,94,0.09)", color: "#86EFAC", fontSize: 9, fontWeight: 900, cursor: busy ? "default" : "pointer" }}>
                Human Verify Proof
              </button>
            )}
            {evidence && evidence.verificationStatus !== "invalid" && (
              <button disabled={busy} onClick={() => void act("invalidate")} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid rgba(248,113,113,0.22)", background: "rgba(248,113,113,0.06)", color: "#FCA5A5", fontSize: 9, fontWeight: 800, cursor: busy ? "default" : "pointer" }}>
                Mark Invalid
              </button>
            )}
            {evidence?.verificationStatus === "invalid" && (
              <button disabled={busy} onClick={() => void act("reopen")} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid rgba(245,158,11,0.24)", background: "rgba(245,158,11,0.06)", color: "#FCD34D", fontSize: 9, fontWeight: 800, cursor: busy ? "default" : "pointer" }}>
                Reopen Proof
              </button>
            )}
          </div>
          <div style={{ marginTop: 9, fontSize: 9, color: "#64748B", lineHeight: 1.5 }}>
            {evidence?.verificationStatus === "human_verified"
              ? "✓ Mark Won is eligible from the evidence boundary. A human must still click Mark Won in the workflow queue."
              : "Mark Won is blocked until current proof is Human Verified."}
          </div>
        </>
      )}
    </section>
  );
}
