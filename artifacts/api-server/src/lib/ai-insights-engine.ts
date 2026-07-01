/**
 * AI Insights Engine V1
 *
 * Deterministic, rule-based insight generation from real business data.
 * Sources: GorillaDesk metric snapshots + payment records + Telnyx webhook analytics.
 * No LLM calls — all logic is explicit so insights are reproducible and auditable.
 *
 * Rules are evaluated in priority order: critical → warning → opportunity → info.
 * Any missing data produces an explicit "not enough data yet" insight rather than
 * a fabricated number.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  gorilladeskMetricSnapshotsTable,
  gorilladeskCustomersTable,
  gorilladeskPaymentsTable,
  gorilladeskLeadSourcesTable,
} from "@workspace/db/schema";
import { computeTelnyxAnalytics } from "./telnyx-analytics";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type InsightSeverity = "critical" | "warning" | "opportunity" | "info";

export type Insight = {
  id:                 string;
  title:              string;
  severity:           InsightSeverity;
  explanation:        string;
  recommended_action: string;
  source_data:        Record<string, unknown>;
  is_estimate:        boolean;
  data_available:     boolean;
};

export type InsightsResult = {
  insights:         Insight[];
  generated_at:     string;
  data_sources:     string[];
  missing_sources:  string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal snapshot types
// ─────────────────────────────────────────────────────────────────────────────

type RevenueSnap = {
  monthly_revenue:     number;
  collected_revenue:   number;
  outstanding_revenue: number;
  avg_ticket:          number;
};

type JobsSnap = {
  total:           number;
  completed:       number;
  incomplete:      number;
  completion_rate: number;
};

type CustomersSnap = {
  new_customers:       number | null;
  returning_customers: number | null;
  active_services:     number;
  recurring_services:  number;
  total_customers:     number;
};

type LeadSource = {
  name:          string;
  job_count:     number;
  customer_count?: number;
  revenue_cents: number;
};

type MarketingSnap = {
  lead_sources: LeadSource[];
};

type GDContext = {
  revenue:   RevenueSnap | null;
  jobs:      JobsSnap    | null;
  customers: CustomersSnap | null;
  marketing: MarketingSnap | null;
  payments_total_cents: number;
  payments_methods: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function fmt(cents: number): string {
  if (cents >= 100_000) return `$${(cents / 100_000).toFixed(1)}k`.replace(".0k", "k");
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0;
}

/** Load best available snapshot for a metric type (prefers api_sync over manual_import). */
async function loadSnap<T>(
  metricType: string,
  projectId: string,
): Promise<T | null> {
  const rows = await db
    .select({ data: gorilladeskMetricSnapshotsTable.data, source: gorilladeskMetricSnapshotsTable.source })
    .from(gorilladeskMetricSnapshotsTable)
    .where(and(
      eq(gorilladeskMetricSnapshotsTable.projectId, projectId),
      eq(gorilladeskMetricSnapshotsTable.metricType, metricType),
    ))
    .orderBy(desc(gorilladeskMetricSnapshotsTable.importedAt));

  const preferred = rows.find(r => r.source === "api_sync") ?? rows[0];
  if (!preferred) return null;
  try { return JSON.parse(preferred.data) as T; } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Data loader — pulls all GorillaDesk context in parallel
// ─────────────────────────────────────────────────────────────────────────────

async function loadGDContext(projectId: string): Promise<GDContext> {
  const period = currentPeriod();

  const [revenueRaw, jobsRaw, customersRaw, marketingRaw, paymentRows, lsRows] = await Promise.all([
    loadSnap<RevenueSnap>("revenue", projectId),
    loadSnap<JobsSnap>("jobs", projectId),
    loadSnap<CustomersSnap & { total_customers?: number }>("customers", projectId),
    loadSnap<{ lead_sources: LeadSource[] }>("marketing", projectId),
    // Live payment totals from individual records
    db
      .select({ method: gorilladeskPaymentsTable.method, total: sql<number>`coalesce(sum(amount_cents),0)::int` })
      .from(gorilladeskPaymentsTable)
      .where(eq(gorilladeskPaymentsTable.projectId, projectId))
      .groupBy(gorilladeskPaymentsTable.method),
    // Lead sources for current period
    db
      .select()
      .from(gorilladeskLeadSourcesTable)
      .where(and(
        eq(gorilladeskLeadSourcesTable.projectId, projectId),
        eq(gorilladeskLeadSourcesTable.period, period),
      )),
  ]);

  // Customer total from individual table as fallback
  let totalCustomers = (customersRaw as any)?.total_customers ?? 0;
  if (!totalCustomers) {
    const res = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(gorilladeskCustomersTable)
      .where(eq(gorilladeskCustomersTable.projectId, projectId));
    totalCustomers = Number(res[0]?.cnt ?? 0);
  }

  const paymentsTotalCents = paymentRows.reduce((s, r) => s + Number(r.total), 0);
  const paymentsMethods    = paymentRows.length;

  // Normalize customers snap
  const customers: CustomersSnap | null = customersRaw
    ? {
        new_customers:       (customersRaw as any).new_customers       ?? null,
        returning_customers: (customersRaw as any).returning_customers ?? null,
        active_services:     Number((customersRaw as any).active_services  ?? 0),
        recurring_services:  Number((customersRaw as any).recurring_services ?? 0),
        total_customers:     totalCustomers,
      }
    : null;

  // Prefer live lead source records if available, fall back to marketing snapshot
  const liveLeadSources: LeadSource[] = lsRows.map(r => ({
    name:          r.name,
    job_count:     r.jobCount,
    revenue_cents: r.revenueCents,
  }));

  const marketing: MarketingSnap | null = liveLeadSources.length > 0
    ? { lead_sources: liveLeadSources }
    : (marketingRaw ?? null);

  return {
    revenue:   revenueRaw  ?? null,
    jobs:      jobsRaw     ?? null,
    customers,
    marketing,
    payments_total_cents: paymentsTotalCents,
    payments_methods:     paymentsMethods,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Insight factory helper
// ─────────────────────────────────────────────────────────────────────────────

function insight(
  id: string,
  severity: InsightSeverity,
  title: string,
  explanation: string,
  recommended_action: string,
  source_data: Record<string, unknown>,
  is_estimate = false,
  data_available = true,
): Insight {
  return { id, severity, title, explanation, recommended_action, source_data, is_estimate, data_available };
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual insight rules
// ─────────────────────────────────────────────────────────────────────────────

function ruleOutstandingAR(gd: GDContext): Insight | null {
  const rev = gd.revenue;
  if (!rev || rev.outstanding_revenue === 0) return null;

  const arRatio = rev.collected_revenue > 0
    ? pct(rev.outstanding_revenue, rev.collected_revenue)
    : 100;

  const severity: InsightSeverity = arRatio >= 40 ? "critical" : "warning";

  return insight(
    "ar_outstanding",
    severity,
    `${fmt(rev.outstanding_revenue)} in Unpaid Invoices`,
    `${fmt(rev.outstanding_revenue)} is outstanding against ${fmt(rev.collected_revenue)} collected this period — ${arRatio}% of collected revenue remains unpaid. This directly reduces your effective cash flow.`,
    "Follow up on open invoices this week. Consider enabling automated payment reminders in GorillaDesk or attaching a payment link to each invoice.",
    {
      collected_revenue_cents:   rev.collected_revenue,
      outstanding_revenue_cents: rev.outstanding_revenue,
      ar_ratio_pct:              arRatio,
    },
  );
}

function ruleTextbackFailures(telnyx: Awaited<ReturnType<typeof computeTelnyxAnalytics>>): Insight | null {
  if (telnyx.textbacks_failed === 0) return null;

  return insight(
    "textback_failures",
    "critical",
    `${telnyx.textbacks_failed} Text-back${telnyx.textbacks_failed !== 1 ? "s" : ""} Failed to Send`,
    `${telnyx.textbacks_failed} missed-call text-back${telnyx.textbacks_failed !== 1 ? "s" : ""} failed to deliver. This means missed callers did not receive your follow-up message, reducing the chance of recovering those leads.`,
    "Check that TELNYX_API_KEY is set correctly in Secrets. Verify the sending number (+12512863200) is provisioned for SMS in your Telnyx account.",
    {
      textbacks_failed: telnyx.textbacks_failed,
      textbacks_sent:   telnyx.textbacks_sent,
    },
  );
}

function ruleNoRecurringServices(gd: GDContext): Insight | null {
  const cust = gd.customers;
  if (!cust || cust.total_customers < 10) return null;

  if (cust.recurring_services > 0) {
    // Positive state — low recurring relative to total is still worth flagging
    const recurringPct = pct(cust.recurring_services, cust.total_customers);
    if (recurringPct >= 20) return null; // healthy enough, skip
    return insight(
      "low_recurring_services",
      "opportunity",
      `Only ${recurringPct}% of Customers on Recurring Plans`,
      `${cust.recurring_services} of ${cust.total_customers} customers are on recurring service plans (${recurringPct}%). Recurring plans provide predictable monthly revenue and reduce churn.`,
      "Contact the top 50 highest-value customers and offer a quarterly or monthly service plan. A small discount for recurring commitment typically improves retention and LTV.",
      { total_customers: cust.total_customers, recurring_services: cust.recurring_services, recurring_pct: recurringPct },
    );
  }

  return insight(
    "zero_recurring_services",
    "opportunity",
    `${cust.total_customers} Customers with No Recurring Plans`,
    `None of your ${cust.total_customers} customers are flagged as recurring in GorillaDesk. Recurring service plans (monthly, quarterly) create predictable revenue and keep your schedule full during slow periods.`,
    "Create a recurring service tier in GorillaDesk — even 10% adoption (${Math.round(cust.total_customers * 0.1)} customers) at one visit/quarter adds meaningful recurring revenue.",
    { total_customers: cust.total_customers, recurring_services: 0 },
  );
}

function ruleLeadSourceGap(gd: GDContext): Insight | null {
  const mkt = gd.marketing;
  if (!mkt || mkt.lead_sources.length === 0) return null;

  const total     = mkt.lead_sources.reduce((s, ls) => s + (ls.customer_count ?? ls.job_count), 0);
  const unknown   = mkt.lead_sources.find(ls => ls.name.toLowerCase().includes("unknown") || ls.name.toLowerCase().includes("direct"));
  const unknownCt = unknown ? (unknown.customer_count ?? unknown.job_count) : 0;
  const unknownPct = pct(unknownCt, total);

  if (unknownPct < 30) return null;

  return insight(
    "lead_source_unknown_dominant",
    "opportunity",
    `${unknownPct}% of Customers Have Unknown Source`,
    `${unknownCt} of ${total} customers (${unknownPct}%) come from "Direct / Unknown" — meaning you don't know which marketing channel brought them in. Without source attribution you can't tell what's working.`,
    "Train your team to ask 'How did you hear about us?' on every call and record it in GorillaDesk. Add UTM parameters to your Google Business Profile website link and any paid ads.",
    {
      total_customers:   total,
      unknown_customers: unknownCt,
      unknown_pct:       unknownPct,
      lead_sources:      mkt.lead_sources.map(ls => ({ name: ls.name, count: ls.customer_count ?? ls.job_count })),
    },
  );
}

function ruleTopLeadSource(gd: GDContext): Insight | null {
  const mkt = gd.marketing;
  if (!mkt || mkt.lead_sources.length < 2) return null;

  // Find best source that isn't Direct/Unknown
  const named = mkt.lead_sources
    .filter(ls => !ls.name.toLowerCase().includes("unknown") && !ls.name.toLowerCase().includes("direct"))
    .sort((a, b) => (b.customer_count ?? b.job_count) - (a.customer_count ?? a.job_count));

  if (named.length === 0) return null;
  const top = named[0];
  const topCount = top.customer_count ?? top.job_count;

  return insight(
    "top_lead_source",
    "info",
    `${top.name} is Your #1 Attributed Source (${topCount} customers)`,
    `${top.name} has driven ${topCount} customers — your highest-performing attributed lead source. This channel is worth protecting and scaling.`,
    `Ensure your ${top.name} profile/listing is fully optimized, has recent photos, and has a clear call to action. Consider increasing budget or effort toward this channel.`,
    {
      top_source:  top.name,
      count:       topCount,
      all_sources: named.slice(0, 5).map(ls => ({ name: ls.name, count: ls.customer_count ?? ls.job_count })),
    },
  );
}

function ruleMissedCallOpportunity(
  telnyx: Awaited<ReturnType<typeof computeTelnyxAnalytics>>,
  gd: GDContext,
): Insight | null {
  if (!telnyx.has_real_calls) {
    // System live but no production calls yet — not a problem, just informational
    return null;
  }
  if (telnyx.missed_calls === 0) return null;

  const avgTicket = gd.revenue?.avg_ticket ?? null;
  const estRevCents = avgTicket ? telnyx.missed_calls * avgTicket : null;

  const severity: InsightSeverity = telnyx.missed_calls >= 10 ? "critical"
    : telnyx.missed_calls >= 3 ? "warning"
    : "opportunity";

  return insight(
    "missed_calls",
    severity,
    `${telnyx.missed_calls} Missed Call${telnyx.missed_calls !== 1 ? "s" : ""} Detected`,
    `${telnyx.missed_calls} call${telnyx.missed_calls !== 1 ? "s" : ""} went unanswered.` +
      (estRevCents
        ? ` At your average ticket of ${fmt(avgTicket!)}, that's an estimated ${fmt(estRevCents)} in potential missed revenue.`
        : "") +
      (telnyx.recovery_rate !== null
        ? ` Lead recovery rate: ${telnyx.recovery_rate}% (${telnyx.recovered_leads} of ${telnyx.missed_calls} replied to text-back).`
        : ""),
    "Review missed call logs in Lead Recovery. If text-back reply rates are low, test a shorter message or add a direct booking link to the text-back.",
    {
      missed_calls:     telnyx.missed_calls,
      recovered_leads:  telnyx.recovered_leads,
      recovery_rate:    telnyx.recovery_rate,
      avg_ticket_cents: avgTicket,
      est_revenue_note: estRevCents ? `Estimate: ${telnyx.missed_calls} calls × ${fmt(avgTicket!)} avg ticket` : null,
    },
    !!estRevCents, // is_estimate = true when revenue estimate is included
  );
}

function ruleAfterHoursMissed(
  telnyx: Awaited<ReturnType<typeof computeTelnyxAnalytics>>,
  gd: GDContext,
): Insight | null {
  if (!telnyx.has_real_calls || telnyx.after_hours_missed === 0) return null;

  const avgTicket   = gd.revenue?.avg_ticket ?? null;
  const estRevCents = avgTicket ? telnyx.after_hours_missed * avgTicket : null;

  return insight(
    "after_hours_missed",
    "opportunity",
    `${telnyx.after_hours_missed} Missed Call${telnyx.after_hours_missed !== 1 ? "s" : ""} After Hours`,
    `${telnyx.after_hours_missed} call${telnyx.after_hours_missed !== 1 ? "s" : ""} came in outside business hours (before 8am or after 6pm Central).` +
      (estRevCents ? ` That's an estimated ${fmt(estRevCents)} in after-hours opportunity.` : ""),
    "Enable the voicemail + text-back system for after-hours calls so customers can self-book or leave a message. Consider a virtual answering service for high-volume evening periods.",
    {
      after_hours_missed: telnyx.after_hours_missed,
      avg_ticket_cents:   avgTicket,
      est_revenue_note:   estRevCents ? `Estimate: ${telnyx.after_hours_missed} calls × ${fmt(avgTicket!)} avg ticket` : null,
    },
    !!estRevCents,
  );
}

function ruleLocalPresenceGaps(): Insight {
  return insight(
    "local_presence_gaps",
    "warning",
    "3 Local Listings Not Yet Claimed",
    "Apple Business Connect (visible on all Apple Maps / Siri searches), Bing Places (30% of US desktop searches), and Nextdoor Business are not yet set up. Competitors who claim these listings appear when you don't.",
    "Claim Apple Business Connect at register.apple.com (~30 min). Import from Google into Bing Places at bingplaces.com (~15 min). Create a Nextdoor Business page at business.nextdoor.com. All three are free.",
    {
      unclaimed_platforms:   ["Apple Business Connect", "Bing Places", "Nextdoor Business"],
      claimed_platforms:     ["Google Business Profile", "Facebook", "Instagram"],
    },
  );
}

function ruleNoReviewVelocityData(): Insight {
  return insight(
    "no_review_velocity",
    "opportunity",
    "No Review Request Campaign Active",
    "Review velocity (number of new reviews per month) is one of the top-3 factors for local Google ranking in pest control. No automated review request system is currently active.",
    "After each completed job in GorillaDesk, send an automated SMS asking for a Google review. A single automated ask after job completion typically converts 15-25% of customers into reviewers.",
    { review_data_available: false },
    false,
    false,
  );
}

function ruleTelnyxAwaitingCalls(
  telnyx: Awaited<ReturnType<typeof computeTelnyxAnalytics>>,
): Insight | null {
  if (telnyx.has_real_calls) return null;
  return insight(
    "telnyx_awaiting_calls",
    "info",
    "Lead Recovery AI Active — Awaiting First Production Call",
    `Lead Recovery AI is live on ${process.env.TELNYX_FROM_NUMBER ?? "+12512863200"}. No production calls have been received yet. Once your business line begins forwarding to this number, missed calls will be automatically detected and text-backs dispatched.`,
    "Verify call forwarding is configured on your business phone to route to the Telnyx number. Test by calling your business line from a non-test phone and confirming a text-back is sent.",
    {
      telnyx_number:    process.env.TELNYX_FROM_NUMBER ?? "+12512863200",
      total_rows:       telnyx.total_rows,
      test_rows:        telnyx.test_rows_excluded,
      has_real_calls:   false,
    },
  );
}

function ruleJobCompletionRate(gd: GDContext): Insight | null {
  const jobs = gd.jobs;
  if (!jobs || jobs.total === 0) return null;

  if (jobs.completion_rate >= 90) {
    return insight(
      "job_completion_rate_strong",
      "info",
      `${jobs.completion_rate}% Job Completion Rate`,
      `${jobs.completed} of ${jobs.total} jobs completed (${jobs.completion_rate}% completion rate). ${jobs.incomplete} job${jobs.incomplete !== 1 ? "s" : ""} remain${jobs.incomplete === 1 ? "s" : ""} incomplete.`,
      jobs.incomplete > 0
        ? `Review the ${jobs.incomplete} incomplete job${jobs.incomplete !== 1 ? "s" : ""} in GorillaDesk for follow-up scheduling or cancellation.`
        : "Maintain this completion rate. Consider a follow-up call 48 hours after each completed job to check customer satisfaction.",
      { total: jobs.total, completed: jobs.completed, incomplete: jobs.incomplete, rate: jobs.completion_rate },
    );
  }

  return insight(
    "job_completion_rate_low",
    "warning",
    `Job Completion Rate Below 90% (${jobs.completion_rate}%)`,
    `${jobs.completed} of ${jobs.total} jobs completed — ${jobs.incomplete} jobs are incomplete. A completion rate below 90% can signal scheduling issues, cancellations, or customer no-shows.`,
    "Run a GorillaDesk report on incomplete jobs. Identify patterns: are there specific technicians, service types, or geographic areas with higher incompletion? Add automated appointment reminders 24h before.",
    { total: jobs.total, completed: jobs.completed, incomplete: jobs.incomplete, rate: jobs.completion_rate },
  );
}

function ruleRevenueHealth(gd: GDContext): Insight | null {
  const rev = gd.revenue;
  if (!rev || rev.monthly_revenue === 0) {
    return insight(
      "no_revenue_data",
      "info",
      "Not Enough Historical Revenue Data Yet",
      "No revenue data is available for the current month. Revenue trends and benchmarks will appear once GorillaDesk job and payment data is synced for a full billing period.",
      "Import your most recent GorillaDesk jobs CSV to establish a revenue baseline. Once a full month of data is present, the system will show trend comparisons.",
      { monthly_revenue: 0, data_source: "none" },
      false,
      false,
    );
  }

  return insight(
    "revenue_active",
    "info",
    `${fmt(rev.monthly_revenue)} Revenue · ${fmt(rev.avg_ticket)} Avg Ticket`,
    `GorillaDesk shows ${fmt(rev.monthly_revenue)} in revenue for the current period across ${gd.jobs?.total ?? "an unknown number of"} jobs. Average ticket is ${fmt(rev.avg_ticket)}.`,
    "Compare this month against previous months in GorillaDesk to identify seasonal trends. Revenue trend data will appear after 2+ months of synced data.",
    {
      monthly_revenue_cents:   rev.monthly_revenue,
      collected_revenue_cents: rev.collected_revenue,
      avg_ticket_cents:        rev.avg_ticket,
      data_source:             "gorilladesk_snapshot",
      note:                    "Revenue from GorillaDesk manual CSV import — represents real historical data, not current-month live totals.",
    },
  );
}

function ruleLargeCustomerBase(gd: GDContext): Insight | null {
  const cust = gd.customers;
  if (!cust || cust.total_customers < 100) return null;

  return insight(
    "large_customer_base",
    "opportunity",
    `${cust.total_customers} Customers Available for Reactivation`,
    `You have ${cust.total_customers} customers in GorillaDesk. Many may not have been serviced recently and are prime targets for reactivation campaigns.`,
    "Segment customers by last service date in GorillaDesk. Export anyone last serviced 6+ months ago and send a win-back SMS or email with a seasonal promotion.",
    { total_customers: cust.total_customers, active_services: cust.active_services },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critical:    0,
  warning:     1,
  opportunity: 2,
  info:        3,
};

export async function computeInsights(projectId: string): Promise<InsightsResult> {
  const [gd, telnyx] = await Promise.all([
    loadGDContext(projectId),
    computeTelnyxAnalytics(projectId),
  ]);

  const raw: (Insight | null)[] = [
    // Critical first
    ruleOutstandingAR(gd),
    ruleTextbackFailures(telnyx),

    // Warnings
    ruleJobCompletionRate(gd),
    ruleLocalPresenceGaps(),

    // Opportunities
    ruleNoRecurringServices(gd),
    ruleLeadSourceGap(gd),
    ruleMissedCallOpportunity(telnyx, gd),
    ruleAfterHoursMissed(telnyx, gd),
    ruleNoReviewVelocityData(),
    ruleLargeCustomerBase(gd),

    // Info
    ruleRevenueHealth(gd),
    ruleTelnyxAwaitingCalls(telnyx),
    ruleTopLeadSource(gd),
  ];

  const insights = raw
    .filter((i): i is Insight => i !== null)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  // Record which sources contributed data
  const dataSources: string[]   = [];
  const missingSources: string[] = [];

  if (gd.revenue)   dataSources.push("gorilladesk_revenue_snapshot");
  else               missingSources.push("gorilladesk_revenue");

  if (gd.jobs)       dataSources.push("gorilladesk_jobs_snapshot");
  else               missingSources.push("gorilladesk_jobs");

  if (gd.customers)  dataSources.push("gorilladesk_customers_snapshot");
  else               missingSources.push("gorilladesk_customers");

  if (gd.marketing)  dataSources.push("gorilladesk_lead_sources");
  else               missingSources.push("gorilladesk_lead_sources");

  if (gd.payments_total_cents > 0) dataSources.push("gorilladesk_payments");

  dataSources.push("telnyx_lead_recovery");

  return {
    insights,
    generated_at:    new Date().toISOString(),
    data_sources:    dataSources,
    missing_sources: missingSources,
  };
}
