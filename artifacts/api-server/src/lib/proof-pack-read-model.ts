import type {
  Call,
  CustomerJourneyEvent,
  GorilladeskJob,
  GorilladeskPayment,
  Lead,
  Referral,
  ReferralCrmAttribution,
  RevenueAttribution,
  SocialPost,
  TenantSafeReviewSummaryRow,
} from "@workspace/db";
import { buildRevenueLeakReadModel } from "./revenue-leak-read-model.js";
import { buildRecoveryEvidence } from "./recovery-evidence.js";

export type Availability = "available" | "partial" | "unavailable";

export type ProofMetric = {
  availability: Availability;
  value: number | null;
  unit: "count" | "currency" | "rating" | "percent";
  verification: "verified" | "observed" | "not_verifiable";
  source: string;
  observedAt: string | null;
  explanation: string | null;
};

export type ProofPackEvidence = {
  leads: readonly Lead[];
  calls: readonly Call[];
  attributions: readonly RevenueAttribution[];
  jobs: readonly GorilladeskJob[];
  payments: readonly GorilladeskPayment[];
  reviews: readonly TenantSafeReviewSummaryRow[];
  referrals: readonly Referral[];
  referralAttributions: readonly ReferralCrmAttribution[];
  posts: readonly SocialPost[];
  journeyEvents: readonly CustomerJourneyEvent[];
};

function inPeriod(value: Date | null | undefined, from: Date, to: Date): boolean {
  return Boolean(value && value >= from && value < to);
}

function latest(values: Array<Date | null | undefined>): string | null {
  const found = values.filter((value): value is Date => value instanceof Date);
  return found.length ? new Date(Math.max(...found.map(value => value.getTime()))).toISOString() : null;
}

function metric(value: number, source: string, observedAt: string | null, unit: ProofMetric["unit"] = "count", verification: ProofMetric["verification"] = "observed"): ProofMetric {
  return { availability: "available", value, unit, verification, source, observedAt, explanation: null };
}

function unavailable(source: string, explanation: string, unit: ProofMetric["unit"] = "count"): ProofMetric {
  return { availability: "unavailable", value: null, unit, verification: "not_verifiable", source, observedAt: null, explanation };
}

function partial(value: number, source: string, observedAt: string | null, explanation: string, unit: ProofMetric["unit"] = "count"): ProofMetric {
  return { availability: "partial", value, unit, verification: "observed", source, observedAt, explanation };
}

export function buildProofPackReadModel(evidence: ProofPackEvidence, clientId: string, from: Date, to: Date, generatedAt = new Date()) {
  const leads = evidence.leads.filter(row => inPeriod(row.receivedAt ?? row.createdAt, from, to));
  const calls = evidence.calls.filter(row => inPeriod(row.createdAt, from, to));
  const attributions = evidence.attributions.filter(row => inPeriod(row.verifiedAt ?? row.matchedAt ?? row.updatedAt, from, to));
  const jobs = evidence.jobs.filter(row => row.status === "completed" && inPeriod(row.completedAt, from, to));
  const payments = evidence.payments.filter(row => row.status === "collected" && inPeriod(row.paidAt, from, to));
  const referrals = evidence.referrals.filter(row => inPeriod(row.createdAt, from, to));
  const referralAttributions = evidence.referralAttributions.filter(row => row.status === "confirmed" && inPeriod(row.decidedAt ?? row.updatedAt, from, to));
  const posts = evidence.posts.filter(row => inPeriod(row.createdAt, from, to) || inPeriod(row.publishedAt, from, to));
  const replies = leads.filter(row => row.eventType === "telnyx_sms_reply" || row.eventType === "message_received");
  const missedCalls = calls.filter(row => row.callType === "missed").length + leads.filter(row => row.eventType === "missed_call" || row.eventType === "call_hangup_missed").length;
  const leadSources = Object.entries(leads.reduce<Record<string, number>>((all, row) => {
    const source = row.source?.trim() || "unknown";
    all[source] = (all[source] ?? 0) + 1;
    return all;
  }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([source, count]) => ({ source, count }));
  const paidRevenue = payments.reduce((sum, row) => sum + row.amountCents, 0) / 100;
  const verifiedAttributions = attributions.filter(row => row.status === "won" && row.revenue != null && row.verifiedAt != null);
  const observedAttributions = attributions.filter(row => row.status === "won" && row.revenue != null && row.verifiedAt == null);
  const attributableRevenue = verifiedAttributions.reduce((sum, row) => sum + Number(row.revenue), 0);
  const observedAttributableRevenue = observedAttributions.reduce((sum, row) => sum + Number(row.revenue), 0);
  const referralRevenue = referralAttributions.filter(row => row.measuredRevenue != null).reduce((sum, row) => sum + Number(row.measuredRevenue), 0);
  const reviewCount = evidence.reviews.reduce((sum, row) => sum + row.reviewCount, 0);
  const ratedReviews = evidence.reviews.filter(row => row.averageRating != null);
  const averageRating = ratedReviews.length ? ratedReviews.reduce((sum, row) => sum + Number(row.averageRating), 0) / ratedReviews.length : null;
  const leaks = buildRevenueLeakReadModel(evidence.leads, evidence.attributions, generatedAt);
  const recovery = buildRecoveryEvidence(evidence.journeyEvents.filter(row => inPeriod(row.occurredAt, from, to)), clientId);

  return {
    generatedAt: generatedAt.toISOString(),
    period: { from: from.toISOString(), toExclusive: to.toISOString() },
    privacy: { aggregateOnly: true, containsPii: false },
    leadSources,
    metrics: {
      leadsCaptured: metric(leads.length, "leads", latest(leads.map(row => row.receivedAt ?? row.createdAt))),
      missedCalls: metric(missedCalls, "calls + lead events", latest([...calls.map(row => row.createdAt), ...leads.map(row => row.createdAt)])),
      successfulRecovery: recovery.evidenceState === "unavailable"
        ? unavailable("customer journey evidence", "No canonical missed-call-to-recovery events are available; callbacks and replies are not treated as attributable recovery.")
        : recovery.evidenceState === "partial"
          ? partial(recovery.verifiedRecoveries, "customer journey evidence", latest(evidence.journeyEvents.map(row => row.occurredAt)), `${recovery.unlinkedReplies} customer reply event(s) lack a complete provider-parent chain.`)
          : metric(recovery.verifiedRecoveries, "customer journey evidence", latest(evidence.journeyEvents.map(row => row.occurredAt)), "count", "verified"),
      customerResponses: metric(replies.length, "lead events", latest(replies.map(row => row.createdAt))),
      bookings: unavailable("GorillaDesk jobs", "The local job evidence does not preserve a canonical booking event or lead-to-booking link."),
      completedJobs: metric(jobs.length, "GorillaDesk tenant snapshot", latest(jobs.map(row => row.completedAt)), "count", "verified"),
      verifiedRevenue: metric(paidRevenue, "GorillaDesk paid payments", latest(payments.map(row => row.paidAt)), "currency", "verified"),
      attributableRevenue: metric(attributableRevenue, "human-verified revenue attribution", latest(verifiedAttributions.map(row => row.verifiedAt)), "currency", "verified"),
      observedAttributableRevenue: observedAttributions.length
        ? partial(observedAttributableRevenue, "unverified revenue attribution", latest(observedAttributions.map(row => row.matchedAt ?? row.updatedAt)), "Legacy or unverified won records are excluded from verified attributable revenue.", "currency")
        : unavailable("unverified revenue attribution", "No unverified won revenue records were observed in this period.", "currency"),
      reviewsObserved: partial(reviewCount, "tenant-safe review summaries", latest(evidence.reviews.map(row => row.observedAt)), "This is the latest tenant-safe review snapshot, not a count of reviews created during the selected period."),
      averageRating: averageRating == null
        ? unavailable("tenant-safe review summaries", "No tenant-safe rating observation is available.", "rating")
        : partial(averageRating, "tenant-safe review summaries", latest(evidence.reviews.map(row => row.observedAt)), "This is the latest tenant-safe rating snapshot; the selected period does not establish when individual reviews were created.", "rating"),
      referralsCreated: metric(referrals.length, "referrals", latest(referrals.map(row => row.createdAt))),
      referralRevenue: metric(referralRevenue, "confirmed referral CRM attribution", latest(referralAttributions.map(row => row.decidedAt ?? row.updatedAt)), "currency", "verified"),
      contentCreated: metric(posts.filter(row => inPeriod(row.createdAt, from, to)).length, "social posts", latest(posts.map(row => row.createdAt))),
      contentPublished: metric(posts.filter(row => row.status === "published" && inPeriod(row.publishedAt, from, to)).length, "social posts with provider-confirmed published state", latest(posts.map(row => row.publishedAt)), "count", "verified"),
      unresolvedRevenueLeaks: metric(leaks.summary.total, "Revenue Leak Detector", leaks.generatedAt),
    },
    revenueLeaks: leaks.summary,
  };
}
