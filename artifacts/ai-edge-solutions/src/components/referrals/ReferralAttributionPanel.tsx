import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "@/lib/api";

interface Candidate {
  referralId: number;
  referredName: string | null;
  customerExternalId: string;
  customerName: string;
  confidence: number;
  reasons: string[];
  measuredRevenue: number | null;
  status: string;
}

interface SyncEndpointResult {
  ok: boolean;
  records_synced: number;
  error?: string;
}

interface GorillaDeskSyncResult {
  ok: boolean;
  synced_at: string;
  results: {
    customers: SyncEndpointResult;
    lead_sources: SyncEndpointResult;
  };
  total_records_synced: number;
}

export function ReferralAttributionPanel() {
  const apiFetch = useApiFetch();
  const [rows, setRows] = useState<Candidate[]>([]);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const result = await apiFetch<{ candidates: Candidate[] }>(
        "/referrals/attribution/candidates",
      );
      setRows(result.candidates);
    } catch {
      setError("Attribution candidates are unavailable.");
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const syncGorillaDesk = async () => {
    const confirmed = window.confirm(
      "Sync GorillaDesk customers into Alex? This reads customers and lead sources from GorillaDesk. It sends no messages and makes no changes in GorillaDesk.",
    );
    if (!confirmed) return;

    setSyncing(true);
    setSyncMessage("");
    setError("");
    try {
      const result = await apiFetch<GorillaDeskSyncResult>(
        "/analytics/gorilladesk/sync",
        { method: "POST" },
      );
      const customerCount = result.results?.customers?.records_synced ?? 0;
      const leadSourceCount = result.results?.lead_sources?.records_synced ?? 0;
      const syncedAt = result.synced_at
        ? new Date(result.synced_at).toLocaleString()
        : new Date().toLocaleString();

      if (!result.results?.customers?.ok) {
        throw new Error(
          result.results?.customers?.error ?? "GorillaDesk customer sync failed.",
        );
      }

      setSyncMessage(
        `Synced ${customerCount} customers and ${leadSourceCount} lead sources at ${syncedAt}.`,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "GorillaDesk customer sync failed.",
      );
    } finally {
      setSyncing(false);
    }
  };

  const decide = async (row: Candidate, decision: "confirmed" | "rejected") => {
    const confirmed = window.confirm(
      `${decision === "confirmed" ? "Confirm" : "Reject"} this internal attribution? This will not modify GorillaDesk.`,
    );
    if (!confirmed) return;
    await apiFetch("/referrals/attribution/decision", {
      method: "POST",
      body: JSON.stringify({
        referralId: row.referralId,
        customerExternalId: row.customerExternalId,
        decision,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    await load();
  };

  return (
    <section aria-label="Referral attribution">
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ color: "#E2E8F0", fontSize: 16 }}>
            CRM Attribution Review
          </h2>
          <p style={{ color: "#64748B", fontSize: 11 }}>
            Read-only candidates from already-synced tenant data. Confirming a
            link never modifies GorillaDesk. A human must confirm every link.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void syncGorillaDesk()}
          disabled={syncing}
          aria-busy={syncing}
          style={{
            minHeight: 38,
            padding: "8px 14px",
            borderRadius: 9,
            border: "1px solid rgba(34,197,94,.45)",
            background: syncing
              ? "rgba(30,41,59,.8)"
              : "rgba(22,101,52,.28)",
            color: syncing ? "#94A3B8" : "#4ADE80",
            cursor: syncing ? "wait" : "pointer",
            fontWeight: 700,
          }}
        >
          {syncing ? "Syncing GorillaDesk…" : "Sync GorillaDesk Customers"}
        </button>
      </div>
      <p style={{ color: "#64748B", fontSize: 10, marginTop: 4 }}>
        Customer sync reads customers and lead sources into Alex only. It sends
        no email or text and does not write changes back to GorillaDesk.
      </p>
      {syncMessage && (
        <div
          role="status"
          style={{ color: "#4ADE80", fontSize: 11, marginTop: 8 }}
        >
          {syncMessage}
        </div>
      )}
      {error && (
        <div role="alert" style={{ color: "#EF4444", marginTop: 8 }}>
          {error}
        </div>
      )}
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {rows.map((row) => (
          <article
            key={`${row.referralId}:${row.customerExternalId}`}
            style={{
              background: "rgba(11,22,41,.85)",
              border: "1px solid rgba(255,255,255,.07)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <strong style={{ color: "#E2E8F0" }}>
              {row.referredName ?? "Unnamed referral"} → {row.customerName}
            </strong>
            <div style={{ color: "#94A3B8", fontSize: 11, marginTop: 6 }}>
              {row.confidence}% confidence · {row.reasons.join(", ")}
            </div>
            <div style={{ color: "#64748B", fontSize: 10, marginTop: 4 }}>
              Measured referral revenue:{" "}
              {row.measuredRevenue === null
                ? "Unavailable"
                : `$${row.measuredRevenue.toFixed(2)}`}
            </div>
            {row.status === "proposed" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => void decide(row, "confirmed")}>
                  Confirm link
                </button>
                <button onClick={() => void decide(row, "rejected")}>
                  Reject candidate
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
