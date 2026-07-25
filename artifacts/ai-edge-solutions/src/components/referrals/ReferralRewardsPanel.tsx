import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "@/lib/api";

interface RewardLedgerEntry {
  id: string;
  referralId: number;
  programName: string | null;
  referrerName: string;
  referredName: string | null;
  rewardType: string;
  rewardAmount: string;
  status: "pending_review" | "approved" | "fulfilled" | "rejected";
  approvedAt: string | null;
  fulfillmentMethod: string | null;
  fulfillmentReference: string | null;
  fulfilledAt: string | null;
}

function idempotencyKey(prefix: string): string {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${id}`;
}

function money(value: string): string {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function ReferralRewardsPanel() {
  const apiFetch = useApiFetch();
  const [rewards, setRewards] = useState<RewardLedgerEntry[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRewards(await apiFetch<RewardLedgerEntry[]>("/referrals/rewards"));
    } catch {
      setError("Reward ledger could not be loaded.");
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (reward: RewardLedgerEntry) => {
    if (
      !window.confirm(
        `Approve ${money(reward.rewardAmount)} for ${reward.referrerName}? This does not issue payment.`,
      )
    ) {
      return;
    }
    setWorkingId(reward.id);
    setError("");
    try {
      await apiFetch(`/referrals/rewards/${reward.id}/approve`, {
        method: "POST",
        body: JSON.stringify({
          confirmApproval: true,
          idempotencyKey: idempotencyKey("reward-approval"),
        }),
      });
      setNotice("Reward approved. No payment was issued.");
      await load();
    } catch {
      setError("Reward approval was blocked.");
    } finally {
      setWorkingId(null);
    }
  };

  const fulfill = async (reward: RewardLedgerEntry) => {
    const reference = window.prompt(
      "Enter the manual fulfillment reference (receipt, credit memo, or cash log ID).",
    );
    if (!reference?.trim()) return;
    if (
      !window.confirm(
        "Confirm that fulfillment already occurred outside AI Edge OS. This records evidence only and issues no payment.",
      )
    ) {
      return;
    }
    setWorkingId(reward.id);
    setError("");
    try {
      await apiFetch(`/referrals/rewards/${reward.id}/fulfill`, {
        method: "POST",
        body: JSON.stringify({
          confirmFulfillment: true,
          method: "other",
          reference: reference.trim(),
          note: null,
          idempotencyKey: idempotencyKey("reward-fulfillment"),
        }),
      });
      setNotice("Manual fulfillment evidence recorded. No payment was issued.");
      await load();
    } catch {
      setError("Fulfillment recording was blocked.");
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div
        role="status"
        style={{
          border: "1px solid rgba(245,158,11,0.28)",
          background: "rgba(245,158,11,0.07)",
          color: "#FBBF24",
          borderRadius: 10,
          padding: "11px 13px",
          fontSize: 10,
        }}
      >
        <strong>Manual fulfillment only:</strong> AI Edge OS records approval
        and evidence. It cannot issue cash, credits, discounts, or automated
        payouts.
      </div>
      {(error || notice) && (
        <div
          role={error ? "alert" : "status"}
          style={{
            color: error ? "#F87171" : "#22C55E",
            fontSize: 10,
            padding: "8px 10px",
          }}
        >
          {error || notice}
        </div>
      )}
      {rewards.length === 0 && (
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
            color: "#64748B",
            fontSize: 11,
          }}
        >
          No converted referrals are awaiting reward review.
        </div>
      )}
      {rewards.map((reward) => (
        <article
          key={reward.id}
          style={{
            background: "rgba(11,22,41,0.85)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 11,
            padding: "13px 15px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ color: "#E2E8F0", fontSize: 12, fontWeight: 700 }}>
              {reward.referrerName}
            </div>
            <div style={{ color: "#64748B", fontSize: 9, marginTop: 3 }}>
              {reward.programName ?? "Referral program"} · Referred:{" "}
              {reward.referredName ?? "Not recorded"}
            </div>
            {reward.fulfillmentReference && (
              <div style={{ color: "#475569", fontSize: 9, marginTop: 3 }}>
                Evidence: {reward.fulfillmentReference}
              </div>
            )}
          </div>
          <div
            style={{ color: "#22C55E", fontSize: 17, fontWeight: 900 }}
          >
            {money(reward.rewardAmount)}
          </div>
          <div
            style={{
              color:
                reward.status === "fulfilled"
                  ? "#22C55E"
                  : reward.status === "approved"
                    ? "#38BDF8"
                    : "#F59E0B",
              fontSize: 9,
              fontWeight: 800,
              textTransform: "uppercase",
            }}
          >
            {reward.status.replace("_", " ")}
          </div>
          {reward.status === "pending_review" && (
            <button
              type="button"
              disabled={workingId === reward.id}
              onClick={() => void approve(reward)}
              style={{
                border: "1px solid rgba(56,189,248,0.3)",
                background: "rgba(56,189,248,0.1)",
                color: "#38BDF8",
                borderRadius: 7,
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 10,
              }}
            >
              Approve — no payout
            </button>
          )}
          {reward.status === "approved" && (
            <button
              type="button"
              disabled={workingId === reward.id}
              onClick={() => void fulfill(reward)}
              style={{
                border: "1px solid rgba(34,197,94,0.3)",
                background: "rgba(34,197,94,0.1)",
                color: "#22C55E",
                borderRadius: 7,
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 10,
              }}
            >
              Record manual fulfillment
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
