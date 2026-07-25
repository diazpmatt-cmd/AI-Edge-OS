import { useEffect, useState } from "react";
import { useApiFetch } from "@/lib/api";

interface Readiness {
  safety: Record<string, boolean>;
  queues: {
    openFraudReviews: number;
    pendingRewards: number;
    failedDeliveries: number;
  };
  productionAcceptance: {
    accepted: number;
    total: number;
    complete: boolean;
  };
  blockers: string[];
  readyForAutonomousOperation: false;
}

const LABELS: Record<string, string> = {
  dryRunDefault: "Delivery defaults to dry run",
  emergencyStopEngaged: "Emergency stop engaged",
  schedulerDisabled: "No referral scheduler",
  liveDeliveryDisabled: "Live delivery disabled",
};

export function ReferralReadinessPanel() {
  const apiFetch = useApiFetch();
  const [report, setReport] = useState<Readiness | null>(null);

  useEffect(() => {
    void apiFetch<Readiness>("/referrals/readiness").then(setReport);
  }, [apiFetch]);

  if (!report) return <div style={{ color: "#64748B" }}>Loading readiness…</div>;
  return (
    <section aria-label="Referral operational readiness">
      <h2 style={{ color: "#E2E8F0", fontSize: 16 }}>V1 Readiness</h2>
      <p style={{ color: "#64748B", fontSize: 11 }}>
        Local implementation does not equal production acceptance. Autonomous
        operation remains disabled.
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {Object.entries(report.safety).map(([key, value]) => (
          <div key={key} style={{ color: value ? "#22C55E" : "#EF4444" }}>
            {value ? "●" : "●"} {LABELS[key] ?? key}
          </div>
        ))}
      </div>
      <div style={{ color: "#CBD5E1", marginTop: 16 }}>
        Production accepted: {report.productionAcceptance.accepted}/
        {report.productionAcceptance.total}
      </div>
      <div style={{ color: "#94A3B8", fontSize: 11, marginTop: 8 }}>
        Open fraud reviews: {report.queues.openFraudReviews} · Pending rewards:{" "}
        {report.queues.pendingRewards} · Failed deliveries:{" "}
        {report.queues.failedDeliveries}
      </div>
      {report.blockers.length > 0 && (
        <div style={{ color: "#F59E0B", fontSize: 11, marginTop: 12 }}>
          Remaining gates: {report.blockers.join(", ")}
        </div>
      )}
    </section>
  );
}
