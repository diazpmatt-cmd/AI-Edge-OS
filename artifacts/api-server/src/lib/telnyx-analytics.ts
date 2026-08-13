import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { clientsTable, leadsTable, gorilladeskMetricSnapshotsTable } from "@workspace/db/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Business hours in Central Time (America/Chicago)
// After-hours = before 8am or at/after 6pm
const BUSINESS_OPEN_HOUR  = 8;
const BUSINESS_CLOSE_HOUR = 18;

// Test/seed phone prefixes — exclude from analytics
// +1555xxxx are reserved fictitious numbers; +10000000xx used by dev test endpoints
const TEST_PHONE_PREFIXES = ["+1555", "+10000000"];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TelnyxAnalytics = {
  total_calls:        number;
  missed_calls:       number;
  answered_calls:     number;
  voicemail_calls:    number;
  callback_requests:  number;
  textbacks_sent:     number;
  textbacks_failed:   number;
  sms_received:       number;
  sms_replies:        number;
  recovered_leads:    number;
  recovery_rate:      number | null;
  after_hours_missed: number;
  avg_ticket_cents:                  number | null;
  estimated_missed_revenue_cents:    number | null;
  estimated_missed_revenue_fmt:      string | null;
  estimated_missed_revenue_note:     string | null;
  reply_breakdown: {
    quote_request:       number;
    appointment_request: number;
    emergency_request:   number;
  };
  total_rows:          number;
  test_rows_excluded:  number;
  has_real_calls:      boolean;
  data_source:         "live";
  period:              string;
};

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function centsToDisplay(cents: number): string {
  if (cents === 0) return "$0";
  if (cents >= 100_000) return `$${(cents / 100_000).toFixed(1)}k`.replace(".0k", "k");
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function realRowsFilter() {
  const phoneConditions = TEST_PHONE_PREFIXES.map(
    prefix => sql`${leadsTable.phone} NOT LIKE ${prefix + "%"}`
  );
  return sql`(${sql.join(phoneConditions, sql` AND `)} AND ${leadsTable.message} NOT LIKE '[TEST]%')`;
}

/**
 * Compute Telnyx analytics for one canonical client.
 *
 * Preferred call shape is (clientId, projectId). The one-argument form exists
 * only for the legacy Insights engine, which historically passes the client
 * project slug. In that form we resolve the slug to the canonical client ID
 * before touching lead data; there is no global or BB&B fallback.
 */
export async function computeTelnyxAnalytics(
  clientIdOrProjectId: string,
  projectId?: string,
): Promise<TelnyxAnalytics> {
  let clientId = clientIdOrProjectId;
  let resolvedProjectId = projectId;

  if (!resolvedProjectId) {
    const [client] = await db
      .select({ id: clientsTable.id, slug: clientsTable.slug })
      .from(clientsTable)
      .where(eq(clientsTable.slug, clientIdOrProjectId))
      .limit(1);

    if (!client) {
      throw new Error("Analytics client not found");
    }

    clientId = client.id;
    resolvedProjectId = client.slug;
  }

  const eventRows = await db
    .select({
      eventType: leadsTable.eventType,
      status:    leadsTable.status,
      cnt:       sql<number>`count(*)::int`,
    })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.clientId, clientId),
      realRowsFilter(),
    ))
    .groupBy(leadsTable.eventType, leadsTable.status);

  let missedCalls        = 0;
  let answeredCalls      = 0;
  let voicemailCalls     = 0;
  let callbackRequests   = 0;
  let textbacksSent      = 0;
  let textbacksFailed    = 0;
  let smsReceived        = 0;
  let smsReplies         = 0;
  let quoteRequests      = 0;
  let appointmentRequests = 0;
  let emergencyRequests  = 0;

  for (const row of eventRows) {
    const n = Number(row.cnt);
    switch (row.eventType) {
      case "missed_call":             missedCalls      += n; break;
      case "telnyx_voice_call":       answeredCalls    += n; break;
      case "telnyx_voicemail":        voicemailCalls   += n; break;
      case "telnyx_callback_request": callbackRequests += n; break;
      case "telnyx_textback_sent":    textbacksSent    += n; break;
      case "telnyx_textback_failed":  textbacksFailed  += n; break;
      case "sms":                     smsReceived      += n; break;
      case "telnyx_sms_reply":
        smsReplies += n;
        if (row.status === "quote_request")       quoteRequests      += n;
        if (row.status === "appointment_request") appointmentRequests += n;
        if (row.status === "emergency_request")   emergencyRequests  += n;
        break;
    }
  }

  const totalCalls      = missedCalls + answeredCalls;
  const recoveredLeads = quoteRequests + appointmentRequests + emergencyRequests;
  const recoveryRate   = missedCalls > 0
    ? Math.round((recoveredLeads / missedCalls) * 100)
    : null;

  const afterHoursRows = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.clientId, clientId),
      eq(leadsTable.eventType, "missed_call"),
      realRowsFilter(),
      sql`(
        EXTRACT(HOUR FROM ${leadsTable.createdAt} AT TIME ZONE 'America/Chicago') < ${BUSINESS_OPEN_HOUR}
        OR
        EXTRACT(HOUR FROM ${leadsTable.createdAt} AT TIME ZONE 'America/Chicago') >= ${BUSINESS_CLOSE_HOUR}
      )`,
    ));
  const afterHoursMissed = Number(afterHoursRows[0]?.cnt ?? 0);

  const [totalRowRes, testRowRes] = await Promise.all([
    db.select({ cnt: sql<number>`count(*)::int` })
      .from(leadsTable)
      .where(eq(leadsTable.clientId, clientId)),
    db.select({ cnt: sql<number>`count(*)::int` })
      .from(leadsTable)
      .where(and(
        eq(leadsTable.clientId, clientId),
        sql`(${leadsTable.phone} LIKE '+1555%' OR ${leadsTable.phone} LIKE '+10000000%' OR ${leadsTable.message} LIKE '[TEST]%')`,
      )),
  ]);
  const totalRows        = Number(totalRowRes[0]?.cnt  ?? 0);
  const testRowsExcluded = Number(testRowRes[0]?.cnt ?? 0);

  let avgTicketCents: number | null = null;
  try {
    const snapRows = await db
      .select({ data: gorilladeskMetricSnapshotsTable.data })
      .from(gorilladeskMetricSnapshotsTable)
      .where(and(
        eq(gorilladeskMetricSnapshotsTable.projectId, resolvedProjectId),
        eq(gorilladeskMetricSnapshotsTable.metricType, "revenue"),
      ))
      .orderBy(gorilladeskMetricSnapshotsTable.importedAt)
      .limit(1);

    if (snapRows[0]) {
      const snap = JSON.parse(snapRows[0].data) as Record<string, unknown>;
      const raw  = Number(snap.avg_ticket ?? 0);
      if (raw > 0) avgTicketCents = raw;
    }
  } catch {
    // snapshot unavailable — revenue estimate stays null
  }

  const estimatedMissedRevenueCents = avgTicketCents !== null && missedCalls > 0
    ? avgTicketCents * missedCalls
    : null;

  const avgTicketFmt = avgTicketCents !== null
    ? centsToDisplay(avgTicketCents)
    : null;

  return {
    total_calls: totalCalls,
    missed_calls: missedCalls,
    answered_calls: answeredCalls,
    voicemail_calls: voicemailCalls,
    callback_requests: callbackRequests,
    textbacks_sent: textbacksSent,
    textbacks_failed: textbacksFailed,
    sms_received: smsReceived,
    sms_replies: smsReplies,
    recovered_leads: recoveredLeads,
    recovery_rate: recoveryRate,
    after_hours_missed: afterHoursMissed,
    avg_ticket_cents: avgTicketCents,
    estimated_missed_revenue_cents: estimatedMissedRevenueCents,
    estimated_missed_revenue_fmt: estimatedMissedRevenueCents !== null
      ? centsToDisplay(estimatedMissedRevenueCents)
      : null,
    estimated_missed_revenue_note: estimatedMissedRevenueCents !== null
      ? `Estimate: ${missedCalls} missed call${missedCalls !== 1 ? "s" : ""} × ${avgTicketFmt} avg ticket (GorillaDesk)`
      : null,
    reply_breakdown: {
      quote_request: quoteRequests,
      appointment_request: appointmentRequests,
      emergency_request: emergencyRequests,
    },
    total_rows: totalRows,
    test_rows_excluded: testRowsExcluded,
    has_real_calls: totalCalls > 0,
    data_source: "live",
    period: currentPeriod(),
  };
}
