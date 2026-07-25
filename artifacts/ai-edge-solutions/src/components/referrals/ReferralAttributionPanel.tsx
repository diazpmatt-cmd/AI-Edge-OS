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

export function ReferralAttributionPanel() {
  const apiFetch = useApiFetch();
  const [rows, setRows] = useState<Candidate[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
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
      <h2 style={{ color: "#E2E8F0", fontSize: 16 }}>CRM Attribution Review</h2>
      <p style={{ color: "#64748B", fontSize: 11 }}>
        Read-only candidates from already-synced tenant data. No external API
        call or GorillaDesk/CRM write occurs. A human must confirm every link.
      </p>
      {error && <div style={{ color: "#EF4444" }}>{error}</div>}
      <div style={{ display: "grid", gap: 10 }}>
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
