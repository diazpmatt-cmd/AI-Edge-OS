import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "@/lib/api";

interface ProgramReport {
  programId: number | null;
  programName: string;
  invitations: number;
  referrals: number;
  conversions: number;
  conversionRate: number;
  pendingRewards: number;
  fulfilledRewards: number;
  rewardCost: number;
  attributedRevenue: number | null;
  roi: number | null;
  revenueStatus: "measured" | "unavailable";
}

const money = (value: number | null) =>
  value === null
    ? "—"
    : value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      });

export function ReferralReportingPanel() {
  const apiFetch = useApiFetch();
  const [rows, setRows] = useState<ProgramReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<{ programs: ProgramReport[] }>(
        "/referrals/reporting",
      );
      setRows(result.programs);
    } catch {
      setError("Referral reporting is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div style={{ color: "#64748B" }}>Loading report…</div>;
  if (error) return <div style={{ color: "#EF4444" }}>{error}</div>;

  return (
    <section aria-label="Referral reporting">
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ color: "#E2E8F0", fontSize: 16, margin: 0 }}>
          Campaign Reporting
        </h2>
        <p style={{ color: "#64748B", fontSize: 11 }}>
          Counts and reward costs are measured from tenant-owned records.
          Revenue and ROI remain unavailable until a referral is explicitly
          linked to measured revenue.
        </p>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((row) => (
          <article
            key={row.programId ?? row.programName}
            style={{
              background: "rgba(11,22,41,0.85)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ color: "#F1F5F9", fontWeight: 800 }}>
              {row.programName}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
                gap: 12,
                marginTop: 12,
              }}
            >
              {[
                ["Invitations", row.invitations],
                ["Referrals", row.referrals],
                ["Conversions", row.conversions],
                ["Conversion rate", `${row.conversionRate}%`],
                ["Pending rewards", row.pendingRewards],
                ["Fulfilled rewards", row.fulfilledRewards],
                ["Recorded reward cost", money(row.rewardCost)],
                ["Attributed revenue", money(row.attributedRevenue)],
                ["Referral ROI", row.roi === null ? "Unavailable" : `${row.roi}%`],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ color: "#64748B", fontSize: 9 }}>{label}</div>
                  <div style={{ color: "#CBD5E1", fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>
          </article>
        ))}
        {rows.length === 0 && (
          <div style={{ color: "#64748B" }}>No referral activity yet.</div>
        )}
      </div>
    </section>
  );
}
