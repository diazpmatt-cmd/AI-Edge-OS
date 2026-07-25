import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  referralFraudDecisionSchema,
  referralFraudEvaluationSchema,
} from "../lib/referral-growth.js";
import { evaluateReferralRisk } from "../lib/referral-fraud.js";

const routeSource = readFileSync(
  new URL("../routes/referrals.ts", import.meta.url),
  "utf8",
);
const compact = routeSource.replace(/\s+/g, " ");
const fraudRoutes = compact.slice(
  compact.indexOf("// ── RGE-5:"),
  compact.indexOf("// ── GET /api/referrals/stats"),
);

function baseline() {
  return {
    duplicateIdentityCount: 1,
    repeatedDestinationCount: 0,
    recentReferrerCount: 1,
    selfReferral: false,
    activeRewardCount: 0,
    fingerprintCount: null,
  };
}

describe("RGE-5 risk evidence avoids ceremonial flags and false positives", () => {
  it("returns no signals for ordinary referral activity", () => {
    expect(evaluateReferralRisk(baseline())).toEqual({
      score: 0,
      signals: [],
      fingerprintEvaluation: "not_available",
    });
  });

  it("uses bounded, explainable thresholds for each available signal", () => {
    const result = evaluateReferralRisk({
      duplicateIdentityCount: 3,
      repeatedDestinationCount: 4,
      recentReferrerCount: 5,
      selfReferral: true,
      activeRewardCount: 4,
      fingerprintCount: null,
    });
    expect(result.signals.map((signal) => signal.reason)).toEqual([
      "duplicate_identity",
      "repeated_destination",
      "suspicious_velocity",
      "self_referral",
      "reward_stacking",
    ]);
    expect(result.score).toBe(100);
    expect(
      result.signals.every((signal) => Object.keys(signal.evidence).length > 0),
    ).toBe(true);
  });

  it("does not fabricate device or IP evidence when no lawful source exists", () => {
    const unavailable = evaluateReferralRisk({
      ...baseline(),
      fingerprintCount: null,
    });
    expect(unavailable.fingerprintEvaluation).toBe("not_available");
    expect(
      unavailable.signals.some(
        (signal) => signal.reason === "repeated_fingerprint",
      ),
    ).toBe(false);

    const available = evaluateReferralRisk({
      ...baseline(),
      fingerprintCount: 3,
    });
    expect(available.fingerprintEvaluation).toBe("evaluated");
    expect(available.signals[0]?.reason).toBe("repeated_fingerprint");
  });
});

describe("RGE-5 explicit human authorization", () => {
  it("requires literal confirmation before evaluating evidence", () => {
    expect(
      referralFraudEvaluationSchema.safeParse({
        confirmEvaluation: true,
      }).success,
    ).toBe(true);
    expect(
      referralFraudEvaluationSchema.safeParse({
        confirmEvaluation: false,
      }).success,
    ).toBe(false);
  });

  it("requires a bounded note, expected version, and idempotency for decisions", () => {
    expect(
      referralFraudDecisionSchema.safeParse({
        decision: "hold",
        confirmDecision: true,
        expectedVersion: 2,
        note: "Needs supporting customer identity evidence.",
        idempotencyKey: "fraud-review:001",
      }).success,
    ).toBe(true);
    expect(
      referralFraudDecisionSchema.safeParse({
        decision: "reject",
        confirmDecision: false,
        expectedVersion: 2,
        note: "No",
        idempotencyKey: "fraud-review:001",
      }).success,
    ).toBe(false);
  });
});

describe("RGE-5 route isolation, concurrency, and audit contract", () => {
  it("tenant-scopes reviews, referrals, programs, events, and decisions", () => {
    expect(fraudRoutes).toContain("WHERE fr.client_id = $1");
    expect(fraudRoutes).toContain("r.client_id = fr.client_id");
    expect(fraudRoutes).toContain("rp.client_id = fr.client_id");
    expect(fraudRoutes).toContain(
      "WHERE review_id = $1 AND client_id = $2",
    );
    expect(fraudRoutes).toContain(
      "WHERE id = $1 AND client_id = $2 FOR UPDATE",
    );
    expect(fraudRoutes).not.toContain("req.body.clientId");
  });

  it("prevents duplicate and concurrent decisions and records append-only history", () => {
    expect(fraudRoutes).toContain(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
    );
    expect(fraudRoutes).toContain("expectedVersion");
    expect(fraudRoutes).toContain("stale_review_version");
    expect(fraudRoutes).toContain("concurrent_review_conflict");
    expect(fraudRoutes).toContain("review_idempotency_conflict");
    expect(fraudRoutes).toContain("duplicate_review_decision");
    expect(fraudRoutes).toContain("INSERT INTO referral_fraud_review_events");
    expect(fraudRoutes).not.toContain(
      "UPDATE referral_fraud_review_events",
    );
  });

  it("never turns a risk signal into a customer, reward, message, or CRM action", () => {
    expect(fraudRoutes).toContain("automatedDecisions: false");
    expect(fraudRoutes).toContain("customerActionTaken: false");
    expect(fraudRoutes).toContain("rewardChanged: false");
    expect(fraudRoutes).toContain("messageChanged: false");
    expect(fraudRoutes).toContain("crmChanged: false");
    expect(fraudRoutes).not.toContain("UPDATE referrals SET");
    expect(fraudRoutes).not.toContain("UPDATE referral_reward_ledger");
    expect(fraudRoutes).not.toContain("dispatchReferralDelivery");
    expect(fraudRoutes).not.toContain("fetch(");
    expect(fraudRoutes).not.toContain("setInterval");
  });

  it("does not collect or persist raw IP or device fingerprints", () => {
    expect(fraudRoutes).toContain("fingerprintCollection: false");
    expect(routeSource).toContain("fingerprintCount: null");
    expect(fraudRoutes).not.toContain("req.ip");
    expect(fraudRoutes).not.toContain("remoteAddress");
    expect(fraudRoutes).not.toContain("user-agent");
    expect(fraudRoutes).not.toContain("device_fingerprint");
    expect(fraudRoutes).toContain("containsRawContactData: false");
  });
});
