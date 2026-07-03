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

    // ── Metrics from calls table (new structured data) ────────────────────────
    const callRows = await db
      .select({ callType: callsTable.callType, outcome: callsTable.outcome, durationSecs: callsTable.durationSecs })
      .from(callsTable)
      .where(gte(callsTable.createdAt, since));

    let c_total = 0, c_missed = 0, c_transferred = 0, c_callbacks = 0, c_voicemails = 0;
    for (const r of callRows) {
      if (r.callType !== "missed") c_total++;
      if (r.callType === "missed")       c_missed++;
      if (r.callType === "transferred")  c_transferred++;
      if (r.callType === "callback")     c_callbacks++;
      if (r.callType === "voicemail")    c_voicemails++;
    }

    // ── Metrics from leads table (historical data) ────────────────────────────
    const leadRows = await db
      .select({ eventType: leadsTable.eventType, status: leadsTable.status, phone: leadsTable.phone, message: leadsTable.message })
      .from(leadsTable)
      .where(
        and(
          gte(leadsTable.createdAt, since),
          sql`${leadsTable.phone} NOT LIKE '+1555%' AND ${leadsTable.phone} NOT LIKE '+10000000%'`
        )
      );

    let l_total = 0, l_missed = 0, l_transferred = 0, l_callbacks = 0, l_voicemails = 0;
    let l_sms_inbound = 0, l_sms_outbound = 0, l_replies = 0;
    const uniquePhones = new Set<string>();

    for (const r of leadRows) {
      if (r.phone) uniquePhones.add(r.phone);
      const et = r.eventType ?? "";
      const msg = (r.message ?? "").toLowerCase();

      if (et === "telnyx_voice_call") {
        if (msg.includes("transfer")) l_transferred++;
        else l_total++;
      }
      if (et === "incoming_call")           l_total++;
      if (et === "missed_call" || et === "call_hangup_missed") l_missed++;
      if (et === "telnyx_callback_request") l_callbacks++;
      if (et === "telnyx_voicemail")        l_voicemails++;
      if (et === "sms" || et === "telnyx_sms_reply" || et === "message_received") l_sms_inbound++;
      if (et === "telnyx_textback_sent")    l_sms_outbound++;
      if (et === "telnyx_sms_reply")        l_replies++;
    }

    // ── SMS counts from sms_conversations table ───────────────────────────────
    const [smsRow] = await db
      .select({ total: count() })
      .from(smsConversationsTable)
      .where(gte(smsConversationsTable.createdAt, since));

    const sms_total = (smsRow?.total ?? 0) + l_sms_inbound + l_sms_outbound;

    // ── Combined metrics ──────────────────────────────────────────────────────
    const total_calls        = c_total + l_total + c_transferred + l_transferred;
    const missed_calls       = c_missed + l_missed;
    const transferred_calls  = c_transferred + l_transferred;
    const callback_requests  = c_callbacks + l_callbacks;
    const voicemails         = c_voicemails + l_voicemails;
    const sms_conversations  = sms_total;
    const leads_captured     = uniquePhones.size;
    const recovery_rate      = missed_calls > 0
      ? Math.round(((l_replies + c_callbacks) / missed_calls) * 100)
      : null;

    // ── Recent Call Activity — from calls table first, then leads ─────────────
    const recentCalls = await db
      .select()
      .from(callsTable)
      .where(gte(callsTable.createdAt, since))
      .orderBy(desc(callsTable.createdAt))
      .limit(50);

    const recentLeads = await db
      .select()
      .from(leadsTable)
      .where(
        and(
          gte(leadsTable.createdAt, since),
          sql`${leadsTable.eventType} IN (
            'telnyx_voice_call','incoming_call','missed_call','call_hangup_missed',
            'telnyx_callback_request','telnyx_voicemail','telnyx_sms_reply','sms'
          ) AND ${leadsTable.phone} NOT LIKE '+1555%' AND ${leadsTable.phone} NOT LIKE '+10000000%'`
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
      source: "calls" | "leads";
    };

    const callActivity: ActivityRow[] = recentCalls.map(r => ({
      id:           r.id,
      timestamp:    r.createdAt.toISOString(),
      caller_number: r.callerNumber || "Unknown",
      call_type:    r.callType,
      outcome:      r.outcome,
      duration_secs: r.durationSecs,
      lead_status:  null,
      source:       "calls",
    }));

    const leadActivity: ActivityRow[] = recentLeads.map(r => {
      const et = r.eventType ?? "";
      const msg = (r.message ?? "").toLowerCase();
      let call_type = "incoming";
      let outcome = "answered";
      if (et === "missed_call" || et === "call_hangup_missed") { call_type = "missed"; outcome = "missed"; }
      else if (et === "telnyx_callback_request") { call_type = "callback"; outcome = "callback_requested"; }
      else if (et === "telnyx_voicemail") { call_type = "voicemail"; outcome = "voicemail_left"; }
      else if (msg.includes("transfer")) { call_type = "transferred"; outcome = "transferred"; }
      else if (et === "sms" || et === "telnyx_sms_reply") { call_type = "sms"; outcome = "replied"; }
      return {
        id:           r.id,
        timestamp:    r.createdAt.toISOString(),
        caller_number: r.phone || "Unknown",
        call_type,
        outcome,
        duration_secs: null,
        lead_status:  r.status ?? null,
        source:       "leads",
      };
    });

    const allActivity = [...callActivity, ...leadActivity]
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
