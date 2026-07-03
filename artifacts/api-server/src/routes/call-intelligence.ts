import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, count, desc, gte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { leadsTable, callsTable, smsConversationsTable } from "@workspace/db/schema";

const router = Router();

function requireAuth(req: any, res: any): boolean {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return false; }
  return true;
}

function periodStart(period: string): Date {
  const now = new Date();
  if (period === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const days = period === "7days" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/call-intelligence?period=today|7days|30days
// ─────────────────────────────────────────────────────────────────────────────

router.get("/call-intelligence", async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    const period = (req.query.period as string) || "30days";
    const since  = periodStart(period);

    // ── Metrics from calls table (primary source) ─────────────────────────────
    const callRows = await db
      .select({ callType: callsTable.callType, outcome: callsTable.outcome, durationSecs: callsTable.durationSecs })
      .from(callsTable)
      .where(gte(callsTable.createdAt, since));

    let c_total = 0, c_missed = 0, c_transferred = 0, c_callbacks = 0, c_voicemails = 0;
    for (const r of callRows) {
      c_total++;                                           // every row is one call
      if (r.callType === "missed")      c_missed++;
      if (r.callType === "transferred") c_transferred++;
      if (r.callType === "callback")    c_callbacks++;
      if (r.callType === "voicemail")   c_voicemails++;
    }

    // ── Historical fallback from leads table ──────────────────────────────────
    // Used for: missed calls before calls table existed, and SMS / lead data
    const leadRows = await db
      .select({ eventType: leadsTable.eventType, status: leadsTable.status, phone: leadsTable.phone, message: leadsTable.message })
      .from(leadsTable)
      .where(
        and(
          gte(leadsTable.createdAt, since),
          sql`${leadsTable.phone} NOT LIKE '+1555%' AND ${leadsTable.phone} NOT LIKE '+10000000%'`
        )
      );

    // Only count call-type leads that predate the calls table (avoid double-count)
    // The calls table was created 2026-07-03; use leads only for SMS & lead capture
    let l_sms_inbound = 0, l_sms_outbound = 0, l_replies = 0, l_missed = 0;
    const uniquePhones = new Set<string>();

    for (const r of leadRows) {
      if (r.phone) uniquePhones.add(r.phone);
      const et = r.eventType ?? "";
      if (et === "sms" || et === "telnyx_sms_reply" || et === "message_received") l_sms_inbound++;
      if (et === "telnyx_textback_sent")    l_sms_outbound++;
      if (et === "telnyx_sms_reply")        l_replies++;
      // Count historical missed calls not yet in calls table
      if (et === "missed_call" || et === "call_hangup_missed") l_missed++;
    }

    // ── SMS counts from sms_conversations table ───────────────────────────────
    const [smsRow] = await db
      .select({ total: count() })
      .from(smsConversationsTable)
      .where(gte(smsConversationsTable.createdAt, since));

    const sms_from_table = smsRow?.total ?? 0;
    // Deduplicate: sms_conversations table is the authoritative source going forward;
    // only add leads SMS count if conversations table is still empty (pre-launch)
    const sms_conversations = sms_from_table > 0
      ? sms_from_table
      : l_sms_inbound + l_sms_outbound;

    // ── Combined metrics ──────────────────────────────────────────────────────
    // total_calls = all rows in calls table + historical missed not yet there
    const total_calls       = c_total + l_missed;
    const missed_calls      = c_missed + l_missed;
    const transferred_calls = c_transferred;
    const callback_requests = c_callbacks;
    const voicemails        = c_voicemails;
    const leads_captured    = uniquePhones.size;
    const recovery_rate     = missed_calls > 0
      ? Math.round(((l_replies + c_callbacks) / missed_calls) * 100)
      : null;

    // ── Recent Call Activity ──────────────────────────────────────────────────
    const recentCalls = await db
      .select()
      .from(callsTable)
      .where(gte(callsTable.createdAt, since))
      .orderBy(desc(callsTable.createdAt))
      .limit(50);

    // Historical leads-based activity (for rows that predate calls table)
    const recentLeads = await db
      .select()
      .from(leadsTable)
      .where(
        and(
          gte(leadsTable.createdAt, since),
          sql`${leadsTable.eventType} IN ('missed_call','call_hangup_missed','telnyx_sms_reply','sms')`,
          sql`${leadsTable.phone} NOT LIKE '+1555%'`,
          sql`${leadsTable.phone} NOT LIKE '+10000000%'`
        )
      )
      .orderBy(desc(leadsTable.createdAt))
      .limit(50);

    type ActivityRow = {
      id: string;
      timestamp: string;
      caller_number: string;
      call_type: string;
      outcome: string;
      duration_secs: number | null;
      lead_status: string | null;
    };

    const callActivity: ActivityRow[] = recentCalls.map(r => ({
      id:            r.id,
      timestamp:     r.createdAt.toISOString(),
      caller_number: r.callerNumber || "Unknown",
      call_type:     r.callType,
      outcome:       r.outcome,
      duration_secs: r.durationSecs,
      lead_status:   null,
    }));

    const leadActivity: ActivityRow[] = recentLeads.map(r => {
      const et = r.eventType ?? "";
      let call_type = "incoming", outcome = "answered";
      if (et === "missed_call" || et === "call_hangup_missed") { call_type = "missed"; outcome = "missed"; }
      else if (et === "telnyx_sms_reply") { call_type = "sms"; outcome = "replied"; }
      else if (et === "sms") { call_type = "sms"; outcome = "received"; }
      return {
        id:            r.id,
        timestamp:     r.createdAt.toISOString(),
        caller_number: r.phone || "Unknown",
        call_type,
        outcome,
        duration_secs: null,
        lead_status:   r.status ?? null,
      };
    });

    // Merge and deduplicate (calls table is authoritative; leads fills historical gaps)
    const callIds = new Set(recentCalls.map(r => r.callerNumber + r.createdAt.toISOString().slice(0, 13)));
    const filteredLeadActivity = leadActivity.filter(r => {
      const key = r.caller_number + r.timestamp.slice(0, 13);
      return !callIds.has(key);
    });

    const allActivity = [...callActivity, ...filteredLeadActivity]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50);

    res.json({
      period,
      since: since.toISOString(),
      metrics: {
        total_calls,
        missed_calls,
        transferred_calls,
        callback_requests,
        voicemails,
        sms_conversations,
        leads_captured,
        recovery_rate,
      },
      recent_activity: allActivity,
    });
  } catch (err) {
    console.error("[call-intelligence] Error:", err);
    res.status(500).json({ error: "Failed to fetch call intelligence data" });
  }
});

export default router;
