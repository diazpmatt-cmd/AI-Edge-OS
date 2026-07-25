import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "@/lib/api";

type ReviewStatus = "open" | "held" | "cleared" | "rejected";
type ReviewDecision = "clear" | "hold" | "reject";

interface FraudReview {
  id: string;
  referralId: number;
  status: ReviewStatus;
  riskScore: number;
  reasons: string[];
  evidence: {
    signals?: Array<{
      reason: string;
      points: number;
      evidence: Record<string, number | boolean | string>;
    }>;
    containsRawContactData?: boolean;
  };
  fingerprintEvaluation: "evaluated" | "not_available";
  version: number;
  reviewedAt: string | null;
  reviewNote: string | null;
  referrerName: string;
  referredName: string | null;
  referralStatus: string;
  programName: string | null;
}

interface ReviewEvent {
  id: string;
  previousStatus: ReviewStatus;
  newStatus: ReviewStatus;
  note: string;
  createdAt: string;
}

function key(prefix: string): string {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${id}`;
}

const LABELS: Record<string, string> = {
  duplicate_identity: "Duplicate identity",
  repeated_destination: "Repeated destination",
  suspicious_velocity: "Suspicious velocity",
  self_referral: "Self-referral",
  reward_stacking: "Reward stacking",
  repeated_fingerprint: "Repeated privacy-safe fingerprint",
};

export function ReferralFraudReviewPanel() {
  const apiFetch = useApiFetch();
  const [status, setStatus] = useState<ReviewStatus | "all">("open");
  const [reviews, setReviews] = useState<FraudReview[]>([]);
  const [events, setEvents] = useState<Record<string, ReviewEvent[]>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<{
        automatedDecisions: false;
        fingerprintCollection: false;
        reviews: FraudReview[];
      }>(`/referrals/fraud-reviews?status=${status}`);
      setReviews(response.reviews);
    } catch {
      setError("Fraud review evidence could not be loaded.");
    }
  }, [apiFetch, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const evaluate = async () => {
    if (
      !window.confirm(
        "Refresh referral risk evidence? This creates review flags only and takes no customer action.",
      )
    ) {
      return;
    }
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<{ evaluated: number; flagged: number }>(
        "/referrals/fraud-reviews/evaluate",
        {
          method: "POST",
          body: JSON.stringify({ confirmEvaluation: true }),
        },
      );
      setNotice(
        `${result.evaluated} referrals evaluated; ${result.flagged} contained review signals. No customer action was taken.`,
      );
      await load();
    } catch {
      setError("Risk evaluation was blocked.");
    } finally {
      setWorking(false);
    }
  };

  const decide = async (review: FraudReview, decision: ReviewDecision) => {
    const note = window.prompt(
      `Enter the evidence-based reason to ${decision} this review. This will not change the referral, reward, or customer record.`,
    );
    if (!note?.trim()) return;
    if (
      !window.confirm(
        `Confirm ${decision.toUpperCase()} as a review-queue decision only? No customer or reward action will occur.`,
      )
    ) {
      return;
    }
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/referrals/fraud-reviews/${review.id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          confirmDecision: true,
          expectedVersion: review.version,
          note: note.trim(),
          idempotencyKey: key("fraud-review"),
        }),
      });
      setNotice(
        `Review marked ${decision}. The referral, reward, messages, and CRM were unchanged.`,
      );
      await load();
    } catch {
      setError("Review decision was blocked or the evidence changed. Refresh and retry.");
    } finally {
      setWorking(false);
    }
  };

  const loadEvents = async (reviewId: string) => {
    try {
      const rows = await apiFetch<ReviewEvent[]>(
        `/referrals/fraud-reviews/${reviewId}/events`,
      );
      setEvents((current) => ({ ...current, [reviewId]: rows }));
    } catch {
      setError("Review history could not be loaded.");
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
          lineHeight: 1.5,
        }}
      >
        <strong>Human review only:</strong> risk signals are evidence, not guilt.
        Clear, hold, and reject affect this queue only. Device/IP fingerprinting
        is not collected because no lawful retained source exists.
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(["open", "held", "cleared", "rejected", "all"] as const).map(
          (value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                background:
                  status === value
                    ? "rgba(56,189,248,0.12)"
                    : "rgba(255,255,255,0.03)",
                color: status === value ? "#38BDF8" : "#64748B",
                borderRadius: 20,
                padding: "5px 11px",
                fontSize: 9,
                textTransform: "capitalize",
                cursor: "pointer",
              }}
            >
              {value}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={working}
          onClick={() => void evaluate()}
          style={{
            marginLeft: "auto",
            border: "1px solid rgba(34,197,94,0.3)",
            background: "rgba(34,197,94,0.1)",
            color: "#22C55E",
            borderRadius: 8,
            padding: "6px 11px",
            fontSize: 9,
            cursor: working ? "wait" : "pointer",
          }}
        >
          Refresh risk evidence — no action
        </button>
      </div>

      {(error || notice) && (
        <div
          role={error ? "alert" : "status"}
          style={{ color: error ? "#F87171" : "#22C55E", fontSize: 10 }}
        >
          {error || notice}
        </div>
      )}

      {reviews.length === 0 && (
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
          No referrals in this review state.
        </div>
      )}

      {reviews.map((review) => (
        <article
          key={review.id}
          style={{
            background: "rgba(11,22,41,0.85)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 11,
            padding: "14px 15px",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#E2E8F0", fontSize: 12, fontWeight: 700 }}>
                {review.referrerName} → {review.referredName ?? "Not recorded"}
              </div>
              <div style={{ color: "#64748B", fontSize: 9, marginTop: 3 }}>
                {review.programName ?? "Referral program"} · Referral{" "}
                {review.referralStatus}
              </div>
            </div>
            <div
              style={{
                color: review.riskScore >= 50 ? "#F87171" : "#FBBF24",
                fontSize: 18,
                fontWeight: 900,
              }}
            >
              {review.riskScore}
            </div>
            <div
              style={{
                color: "#94A3B8",
                fontSize: 9,
                fontWeight: 800,
                textTransform: "uppercase",
              }}
            >
              {review.status}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {review.reasons.map((reason) => (
              <span
                key={reason}
                style={{
                  border: "1px solid rgba(245,158,11,0.2)",
                  background: "rgba(245,158,11,0.06)",
                  color: "#FBBF24",
                  borderRadius: 20,
                  padding: "3px 7px",
                  fontSize: 8,
                }}
              >
                {LABELS[reason] ?? reason.replaceAll("_", " ")}
              </span>
            ))}
            {review.fingerprintEvaluation === "not_available" && (
              <span style={{ color: "#475569", fontSize: 8, padding: "3px 7px" }}>
                Fingerprint evidence unavailable
              </span>
            )}
          </div>
          {review.evidence.signals?.map((signal) => (
            <div key={signal.reason} style={{ color: "#64748B", fontSize: 8 }}>
              {LABELS[signal.reason] ?? signal.reason.replaceAll("_", " ")} (
              {signal.points} points):{" "}
              {Object.entries(signal.evidence)
                .map(([label, value]) => `${label}=${String(value)}`)
                .join(", ")}
            </div>
          ))}

          {review.status === "open" || review.status === "held" ? (
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {(["clear", "hold", "reject"] as const).map((decision) => (
                <button
                  key={decision}
                  type="button"
                  disabled={working || (decision === "hold" && review.status === "held")}
                  onClick={() => void decide(review, decision)}
                  style={{
                    border: "1px solid rgba(148,163,184,0.2)",
                    background: "rgba(148,163,184,0.06)",
                    color:
                      decision === "reject"
                        ? "#F87171"
                        : decision === "clear"
                          ? "#22C55E"
                          : "#FBBF24",
                    borderRadius: 7,
                    padding: "5px 9px",
                    fontSize: 9,
                    cursor: working ? "wait" : "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {decision} queue review
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void loadEvents(review.id)}
            style={{
              justifySelf: "start",
              border: 0,
              background: "transparent",
              color: "#38BDF8",
              padding: 0,
              fontSize: 9,
              cursor: "pointer",
            }}
          >
            View audit history
          </button>
          {events[review.id]?.map((event) => (
            <div key={event.id} style={{ color: "#64748B", fontSize: 8 }}>
              {event.previousStatus} → {event.newStatus}: {event.note}
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}
