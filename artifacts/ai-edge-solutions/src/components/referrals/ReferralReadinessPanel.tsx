import { useEffect, useState } from "react";
import { useApiFetch } from "@/lib/api";

interface PilotDeliveryReadiness {
  dryRunAvailable: true;
  liveDeliveryEnabled: boolean;
  liveModeEnabled: boolean;
  emergencyStopEngaged: boolean;
  allowlistConfigured: boolean;
  allowlistCount: number;
  hourlyLimit: number;
  environmentGateOpen: boolean;
  blockers: string[];
}

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
  pilotDelivery?: PilotDeliveryReadiness;
  blockers: string[];
  readyForAutonomousOperation: false;
}

const LABELS: Record<string, string> = {
  dryRunDefault: "Delivery defaults to dry run",
  emergencyStopEngaged: "Emergency stop engaged",
  schedulerDisabled: "No referral scheduler",
  liveDeliveryDisabled: "Live delivery disabled",
};

const PILOT_BLOCKERS: Record<string, string> = {
  delivery_disabled: "live delivery disabled",
  emergency_stop: "emergency stop engaged",
  live_mode_not_enabled: "delivery mode is not live",
  pilot_allowlist_empty: "controlled pilot allowlist is empty",
};

export function ReferralReadinessPanel() {
  const apiFetch = useApiFetch();
  const [report, setReport] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    void apiFetch<Readiness>("/referrals/readiness")
      .then((next) => {
        if (active) setReport(next);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Referral readiness unavailable");
      });
    return () => { active = false; };
  }, [apiFetch]);

  if (error) {
    return (
      <section aria-label="Referral operational readiness">
        <h2 style={{ color: "#E2E8F0", fontSize: 16 }}>V1 Readiness</h2>
        <div style={{ color: "#F87171", fontSize: 11 }}>
          Readiness evidence unavailable: {error}
        </div>
      </section>
    );
  }

  if (!report) return <div style={{ color: "#64748B" }}>Loading readiness…</div>;

  const pilot = report.pilotDelivery;

  return (
    <section aria-label="Referral operational readiness">
      <h2 style={{ color: "#E2E8F0", fontSize: 16 }}>V1 Readiness</h2>
      <p style={{ color: "#64748B", fontSize: 11 }}>
        Local implementation does not equal permission to send. Autonomous
        operation remains disabled; live delivery still requires per-recipient
        allowlist, consent, and idempotency gates.
      </p>

      <div style={{ display: "grid", gap: 8 }}>
        {Object.entries(report.safety).map(([key, value]) => (
          <div key={key} style={{ color: value ? "#22C55E" : "#EF4444" }}>
            ● {LABELS[key] ?? key}
          </div>
        ))}
      </div>

      <div style={{ color: "#CBD5E1", marginTop: 16 }}>
        Production accepted: {report.productionAcceptance.accepted}/
        {report.productionAcceptance.total}
      </div>

      {pilot && (
        <div style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 10,
          border: `1px solid ${pilot.environmentGateOpen ? "rgba(34,197,94,0.28)" : "rgba(245,158,11,0.28)"}`,
          background: pilot.environmentGateOpen ? "rgba(34,197,94,0.06)" : "rgba(245,158,11,0.06)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ color: "#E2E8F0", fontWeight: 800, fontSize: 12 }}>
              Controlled pilot environment
            </div>
            <div style={{ color: pilot.environmentGateOpen ? "#22C55E" : "#F59E0B", fontSize: 11, fontWeight: 800 }}>
              {pilot.environmentGateOpen ? "Environment gate open" : "Environment gate closed"}
            </div>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 8,
            marginTop: 10,
            color: "#94A3B8",
            fontSize: 11,
          }}>
            <div>Mode: <strong style={{ color: pilot.liveModeEnabled ? "#22C55E" : "#CBD5E1" }}>{pilot.liveModeEnabled ? "live" : "dry run"}</strong></div>
            <div>Live delivery: <strong style={{ color: pilot.liveDeliveryEnabled ? "#22C55E" : "#CBD5E1" }}>{pilot.liveDeliveryEnabled ? "enabled" : "disabled"}</strong></div>
            <div>Emergency stop: <strong style={{ color: pilot.emergencyStopEngaged ? "#F59E0B" : "#22C55E" }}>{pilot.emergencyStopEngaged ? "engaged" : "released"}</strong></div>
            <div>Allowlisted destinations: <strong style={{ color: pilot.allowlistConfigured ? "#22C55E" : "#F59E0B" }}>{pilot.allowlistCount}</strong></div>
            <div>Hourly cap: <strong style={{ color: "#CBD5E1" }}>{pilot.hourlyLimit}</strong></div>
          </div>

          <div style={{ color: "#64748B", fontSize: 10, marginTop: 8 }}>
            Destination values are intentionally hidden from this readiness response.
          </div>

          {pilot.blockers.length > 0 && (
            <div style={{ color: "#F59E0B", fontSize: 11, marginTop: 8 }}>
              Pilot environment blockers: {pilot.blockers.map((item) => PILOT_BLOCKERS[item] ?? item).join(", ")}
            </div>
          )}
        </div>
      )}

      <div style={{ color: "#94A3B8", fontSize: 11, marginTop: 12 }}>
        Open fraud reviews: {report.queues.openFraudReviews} · Pending rewards:{" "}
        {report.queues.pendingRewards} · Failed deliveries:{" "}
        {report.queues.failedDeliveries}
      </div>

      {report.blockers.length > 0 && (
        <div style={{ color: "#F59E0B", fontSize: 11, marginTop: 12 }}>
          Remaining operational gates: {report.blockers.join(", ")}
        </div>
      )}
    </section>
  );
}
