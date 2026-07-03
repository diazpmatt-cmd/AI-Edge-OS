import { Router } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { leadsTable, callsTable, smsConversationsTable } from "@workspace/db/schema";

const router = Router();

// ── Constants ─────────────────────────────────────────────────────────────────

const TEXTBACK_DEDUP_MINUTES = 15;

const TEXT_BACK_MESSAGE =
  "Hi, this is Bed Bugs & Beyond. Sorry we missed your call.\n\n" +
  "How can we help you today?\n\n" +
  "Reply:\n" +
  "1 for Quote\n" +
  "2 for Appointment\n" +
  "3 for Emergency Pest Issue\n\n" +
  "Reply STOP to opt out.";

const MISSED_CAUSES = new Set([
  "ORIGINATOR_CANCEL",
  "NO_ANSWER",
  "USER_BUSY",
  "CALL_REJECTED",
  "NORMAL_TEMPORARY_FAILURE",
  "RECOVERY_ON_TIMER_EXPIRE",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function texml(content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${content}</Response>`;
}

function baseUrl(req: any): string {
  const proto = req.get("x-forwarded-proto") || req.protocol || "https";
  const host  = req.get("x-forwarded-host") || req.get("host") || "localhost";
  return `${proto}://${host}`;
}

function getClientName(): string {
  return process.env.TELNYX_CLIENT_NAME ?? "Bed Bugs & Beyond";
}

/**
 * Check if we already sent a text-back to this number within the dedup window.
 * Returns true if a recent send exists (skip sending again).
 */
async function hasRecentTextBack(phone: string): Promise<boolean> {
  const windowMs = TEXTBACK_DEDUP_MINUTES * 60 * 1000;
  const since = new Date(Date.now() - windowMs);
  const rows = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.phone, phone),
        eq(leadsTable.eventType, "telnyx_textback_sent"),
        gte(leadsTable.createdAt, since)
      )
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Send an outbound SMS via the Telnyx v2 Messages REST API.
 * Returns { ok: boolean; messageId?: string; error?: string }
 * Fails gracefully — never throws.
 */
async function sendTextBack(
  to: string
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.TELNYX_API_KEY;
  const from   = process.env.TELNYX_FROM_NUMBER ?? "+12512863200";

  if (!apiKey) {
    const msg = "TELNYX_API_KEY not set — cannot send text-back";
    console.warn(`[TELNYX] ⚠ ${msg}`);
    return { ok: false, error: msg };
  }

  try {
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, text: TEXT_BACK_MESSAGE }),
    });

    const json: any = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detail = json?.errors?.[0]?.detail ?? json?.error ?? res.statusText;
      return { ok: false, error: `Telnyx API ${res.status}: ${detail}` };
    }

    const messageId = json?.data?.id ?? undefined;
    return { ok: true, messageId };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Network error sending text-back" };
  }
}

// ── SMS — inbound reply handler ───────────────────────────────────────────────

router.post("/telnyx/sms", async (req, res) => {
  try {
    const body    = req.body as any;
    const payload = body?.data?.payload ?? body?.payload ?? body;

    const from    = payload?.from?.phone_number ?? payload?.from ?? "";
    const text    = (payload?.text ?? payload?.body ?? "").trim();
    const msgId   = payload?.id ?? payload?.message_id ?? undefined;

    console.log(`[TELNYX] Inbound SMS from ${from || "unknown"}: "${text.slice(0, 80)}"`);

    // Write to sms_conversations table
    await db.insert(smsConversationsTable).values({
      customerNumber: from,
      direction:      "inbound",
      message:        text,
      messageId:      msgId,
      status:         "received",
    }).catch(e => console.error("[TELNYX] sms_conversations insert error:", e));

    // ── Parse text-back replies ───────────────────────────────────────────────
    const digit = text.replace(/\s+/g, "").slice(0, 1);

    const replyMap: Record<string, { status: string; label: string }> = {
      "1": { status: "quote_request",       label: "Quote request" },
      "2": { status: "appointment_request", label: "Appointment request" },
      "3": { status: "emergency_request",   label: "Emergency pest issue" },
    };

    if (digit in replyMap) {
      const { status, label } = replyMap[digit];
      console.log(`[TELNYX] Customer replied: ${digit} (${label}) from ${from || "unknown"}`);

      await db.insert(leadsTable).values({
        clientName: getClientName(),
        source:     "telnyx_sms_reply",
        phone:      from,
        message:    `Customer replied "${digit}" to text-back → ${label}`,
        eventType:  "telnyx_sms_reply",
        status,
      });

      res.status(200).json({ received: true, parsed: label });
      return;
    }

    // ── Generic inbound SMS (not a menu reply) ────────────────────────────────
    await db.insert(leadsTable).values({
      clientName: getClientName(),
      source:     "telnyx_sms",
      phone:      from,
      message:    text,
      eventType:  "sms",
      status:     "new",
    });

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("[TELNYX] Error handling inbound SMS:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── General call-control / message webhook ────────────────────────────────────

router.post("/telnyx/webhook", async (req, res) => {
  // Always respond 200 immediately so Telnyx doesn't retry
  res.status(200).json({ received: true });

  try {
    const body      = req.body as any;
    const eventType = body?.data?.event_type ?? "";
    const payload   = body?.data?.payload ?? {};

    // ── Missed call detection ─────────────────────────────────────────────────
    if (eventType === "call.hangup") {
      const hangupCause = payload?.hangup_cause ?? "";
      const from        = payload?.from ?? "";
      const duration    = payload?.call_duration_secs ?? payload?.duration ?? 0;

      const isMissed =
        MISSED_CAUSES.has(hangupCause) ||
        (hangupCause === "NORMAL_CLEARING" && Number(duration) < 5);

      if (isMissed) {
        console.log(`[TELNYX] Missed call detected from ${from || "unknown"} — cause: ${hangupCause}`);

        const since30m = new Date(Date.now() - 30 * 60 * 1000);
        const durNum   = Number(duration) || null;

        await db.insert(leadsTable).values({
          clientName: getClientName(),
          source:     "telnyx_missed_call",
          phone:      from,
          message:    `Missed call — hangup cause: ${hangupCause}`,
          eventType:  "missed_call",
          status:     "new",
        });

        // Try to update an existing incoming record for this caller first
        const updated = await db.update(callsTable)
          .set({ callType: "missed", outcome: "missed", durationSecs: durNum })
          .where(
            and(
              eq(callsTable.callerNumber, from),
              eq(callsTable.callType, "incoming"),
              gte(callsTable.createdAt, since30m),
            )
          )
          .returning({ id: callsTable.id });

        // If no existing incoming record found, insert a standalone missed record
        if (updated.length === 0) {
          await db.insert(callsTable).values({
            callerNumber: from,
            calledNumber: process.env.TELNYX_FROM_NUMBER ?? "",
            callType:     "missed",
            durationSecs: durNum,
            outcome:      "missed",
          });
        }

        // ── Text-back with dedup guard ────────────────────────────────────────
        if (!from) {
          console.warn("[TELNYX] ⚠ Missed call has no caller ID — skipping text-back");
        } else {
          const alreadySent = await hasRecentTextBack(from);

          if (alreadySent) {
            console.log(`[TELNYX] Text-back skipped — already sent to ${from} within ${TEXTBACK_DEDUP_MINUTES}m`);
          } else {
            const result = await sendTextBack(from);

            if (result.ok) {
              console.log(`[TELNYX] Text-back sent to ${from}${result.messageId ? ` (msgId: ${result.messageId})` : ""}`);
              await Promise.all([
                db.insert(leadsTable).values({
                  clientName: getClientName(),
                  source:     "telnyx_textback",
                  phone:      from,
                  message:    `Text-back sent${result.messageId ? ` — message ID: ${result.messageId}` : ""}`,
                  eventType:  "telnyx_textback_sent",
                  status:     "contacted",
                }),
                db.insert(smsConversationsTable).values({
                  customerNumber: from,
                  direction:      "outbound",
                  message:        TEXT_BACK_MESSAGE,
                  messageId:      result.messageId ?? null,
                  status:         "sent",
                }),
              ]);
            } else {
              console.error(`[TELNYX] Text-back failed to ${from} — ${result.error}`);
              await db.insert(leadsTable).values({
                clientName: getClientName(),
                source:     "telnyx_textback",
                phone:      from,
                message:    `Text-back failed: ${result.error}`,
                eventType:  "telnyx_textback_failed",
                status:     "new",
              });
            }
          }
        }
      }
    }

    // ── Inbound message received via webhook ──────────────────────────────────
    if (eventType === "message.received") {
      const from = payload?.from?.phone_number ?? payload?.from ?? "";
      const text = (payload?.text ?? "").trim();

      console.log(`[TELNYX] Inbound SMS (webhook) from ${from || "unknown"}: "${text.slice(0, 80)}"`);

      const digit = text.replace(/\s+/g, "").slice(0, 1);
      const replyMap: Record<string, { status: string; label: string }> = {
        "1": { status: "quote_request",       label: "Quote request" },
        "2": { status: "appointment_request", label: "Appointment request" },
        "3": { status: "emergency_request",   label: "Emergency pest issue" },
      };

      if (digit in replyMap) {
        const { status, label } = replyMap[digit];
        console.log(`[TELNYX] Customer replied: ${digit} (${label}) from ${from || "unknown"}`);
        await db.insert(leadsTable).values({
          clientName: getClientName(),
          source:     "telnyx_sms_reply",
          phone:      from,
          message:    `Customer replied "${digit}" to text-back → ${label}`,
          eventType:  "telnyx_sms_reply",
          status,
        });
      } else {
        await db.insert(leadsTable).values({
          clientName: getClientName(),
          source:     "telnyx_sms",
          phone:      from,
          message:    text,
          eventType:  "sms",
          status:     "new",
        });
      }
    }
  } catch (err) {
    console.error("[TELNYX] Error processing webhook event:", err);
  }
});

// ── Textback stats endpoint ───────────────────────────────────────────────────

router.get("/telnyx/textback-stats", async (_req, res) => {
  try {
    const rows = await db
      .select({
        eventType: leadsTable.eventType,
        status:    leadsTable.status,
      })
      .from(leadsTable)
      .where(
        sql`${leadsTable.eventType} IN (
          'telnyx_textback_sent',
          'telnyx_textback_failed',
          'telnyx_sms_reply',
          'missed_call'
        ) OR ${leadsTable.status} IN (
          'quote_request',
          'appointment_request',
          'emergency_request'
        )`
      );

    let sent = 0, failed = 0, missedCalls = 0;
    let quoteRequests = 0, appointmentRequests = 0, emergencyRequests = 0;

    for (const r of rows) {
      if (r.eventType === "telnyx_textback_sent")   sent++;
      if (r.eventType === "telnyx_textback_failed")  failed++;
      if (r.eventType === "missed_call")             missedCalls++;
      if (r.status    === "quote_request")           quoteRequests++;
      if (r.status    === "appointment_request")     appointmentRequests++;
      if (r.status    === "emergency_request")       emergencyRequests++;
    }

    const totalReplies = quoteRequests + appointmentRequests + emergencyRequests;
    const responseRate = sent > 0 ? Math.round((totalReplies / sent) * 100) : 0;

    res.json({
      sent, failed, missedCalls,
      quoteRequests, appointmentRequests, emergencyRequests,
      totalReplies, responseRate,
    });
  } catch (err) {
    console.error("[TELNYX] Error fetching textback stats:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// VOICE — AI Receptionist V1 (TeXML IVR menu)
// ══════════════════════════════════════════════════════════════════════════════

router.post("/telnyx/voice", async (req, res) => {
  try {
    const body    = req.body as any;
    const from    = body?.From ?? body?.from ?? body?.Caller ?? "";
    const to      = body?.To   ?? body?.to   ?? body?.Called  ?? process.env.TELNYX_FROM_NUMBER ?? "";
    const callSid = body?.CallSid ?? body?.call_sid ?? "";

    console.log(`[TELNYX] Incoming call from ${from || "unknown"} to ${to || "unknown"}`);

    await Promise.all([
      db.insert(leadsTable).values({
        clientName: getClientName(),
        source:     "telnyx_voice_call",
        phone:      from,
        message:    "Incoming voice call — awaiting menu selection",
        eventType:  "telnyx_voice_call",
        status:     "new",
      }),
      db.insert(callsTable).values({
        callSid:      callSid || null,
        callerNumber: from,
        calledNumber: to,
        callType:     "incoming",
        outcome:      "pending",
      }),
    ]);

    const gatherUrl = `${baseUrl(req)}/api/telnyx/voice/gather`;
    const greeting =
      "Thank you for calling Bed Bugs and Beyond. " +
      "For immediate assistance, press 1. " +
      "To request a callback, press 2. " +
      "To leave a voicemail, press 3.";

    res.set("Content-Type", "text/xml");
    res.send(texml(`
      <Gather numDigits="1" action="${gatherUrl}" method="POST" timeout="10">
        <Say voice="alice">${greeting}</Say>
      </Gather>
      <Say voice="alice">We did not receive your selection. Please call back and try again. Goodbye.</Say>
      <Hangup/>
    `));
  } catch (err) {
    console.error("[TELNYX] Error handling inbound voice call:", err);
    res.set("Content-Type", "text/xml");
    res.send(texml(
      `<Say voice="alice">We are sorry, we are unable to take your call right now. Please try again later.</Say><Hangup/>`
    ));
  }
});

router.post("/telnyx/voice/gather", async (req, res) => {
  try {
    const body    = req.body as any;
    const digit   = (body?.Digits ?? body?.digits ?? "").toString().trim();
    const from    = body?.From ?? body?.from ?? body?.Caller ?? "";
    const callSid = body?.CallSid ?? body?.call_sid ?? "";
    const forward = process.env.BUSINESS_FORWARD_NUMBER ?? "+12543249090";
    const since5m = new Date(Date.now() - 5 * 60 * 1000);

    console.log(`[TELNYX] Menu selection: "${digit}" from ${from || "unknown"}`);

    res.set("Content-Type", "text/xml");

    if (digit === "1") {
      console.log(`[TELNYX] Transfer initiated to ${forward}`);
      await Promise.all([
        db.insert(leadsTable).values({
          clientName: getClientName(),
          source:     "telnyx_voice_call",
          phone:      from,
          message:    `Caller pressed 1 — live transfer initiated to ${forward}`,
          eventType:  "telnyx_voice_call",
          status:     "contacted",
        }),
        // UPDATE the existing incoming record rather than inserting a duplicate
        db.update(callsTable)
          .set({ callType: "transferred", digitsPressed: "1", outcome: "transferred" })
          .where(
            and(
              eq(callsTable.callerNumber, from),
              eq(callsTable.callType, "incoming"),
              gte(callsTable.createdAt, since5m),
              ...(callSid ? [eq(callsTable.callSid, callSid)] : []),
            )
          ),
      ]);
      res.send(texml(`
        <Say voice="alice">Please hold while we connect you.</Say>
        <Dial>${forward}</Dial>
      `));

    } else if (digit === "2") {
      console.log(`[TELNYX] Callback request from ${from || "unknown"}`);
      await Promise.all([
        db.insert(leadsTable).values({
          clientName: getClientName(),
          source:     "telnyx_callback_request",
          phone:      from,
          message:    "Caller requested a callback via voice menu (pressed 2)",
          eventType:  "telnyx_callback_request",
          status:     "new",
        }),
        db.update(callsTable)
          .set({ callType: "callback", digitsPressed: "2", outcome: "callback_requested" })
          .where(
            and(
              eq(callsTable.callerNumber, from),
              eq(callsTable.callType, "incoming"),
              gte(callsTable.createdAt, since5m),
              ...(callSid ? [eq(callsTable.callSid, callSid)] : []),
            )
          ),
      ]);
      res.send(texml(`
        <Say voice="alice">Thank you! We have received your callback request and will call you back as soon as possible. Have a great day!</Say>
        <Hangup/>
      `));

    } else if (digit === "3") {
      const recordUrl = `${baseUrl(req)}/api/telnyx/voice/recording`;
      console.log(`[TELNYX] Voicemail recording started for ${from || "unknown"}`);
      // Mark incoming record as voicemail-in-progress; /recording will finalize it
      await db.update(callsTable)
        .set({ callType: "voicemail", digitsPressed: "3", outcome: "pending" })
        .where(
          and(
            eq(callsTable.callerNumber, from),
            eq(callsTable.callType, "incoming"),
            gte(callsTable.createdAt, since5m),
            ...(callSid ? [eq(callsTable.callSid, callSid)] : []),
          )
        )
        .catch(e => console.error("[TELNYX] callsTable update error (voicemail start):", e));
      res.send(texml(`
        <Say voice="alice">Please leave your message after the beep. Press star or hang up when finished.</Say>
        <Record action="${recordUrl}" method="POST" maxLength="120" playBeep="true" finishOnKey="*"/>
        <Say voice="alice">We did not receive your message. Please call back and try again. Goodbye.</Say>
        <Hangup/>
      `));

    } else {
      console.log(`[TELNYX] Invalid menu selection "${digit}" from ${from || "unknown"}`);
      res.send(texml(`
        <Say voice="alice">That was not a valid option. Please call back and try again. Goodbye.</Say>
        <Hangup/>
      `));
    }
  } catch (err) {
    console.error("[TELNYX] Error handling voice gather:", err);
    res.set("Content-Type", "text/xml");
    res.send(texml(
      `<Say voice="alice">We are sorry, something went wrong. Please call back and try again.</Say><Hangup/>`
    ));
  }
});

router.post("/telnyx/voice/recording", async (req, res) => {
  try {
    const body         = req.body as any;
    const from         = body?.From ?? body?.from ?? body?.Caller ?? "";
    const recordingUrl = body?.RecordingUrl ?? body?.recording_url ?? body?.recordingUrl ?? "";
    const duration     = body?.RecordingDuration ?? body?.duration ?? body?.recording_duration ?? "";

    const durLabel = duration ? ` (${duration}s)` : "";
    const durSecs  = duration ? Number(duration) : null;
    console.log(`[TELNYX] Voicemail recorded from ${from || "unknown"}${durLabel} — ${recordingUrl || "no URL"}`);

    const since10m = new Date(Date.now() - 10 * 60 * 1000);
    await Promise.all([
      db.insert(leadsTable).values({
        clientName: getClientName(),
        source:     "telnyx_voicemail",
        phone:      from,
        message:    recordingUrl
          ? `Voicemail recording${durLabel}: ${recordingUrl}`
          : `Voicemail received${durLabel} — recording URL not provided`,
        eventType:  "telnyx_voicemail",
        status:     "new",
      }),
      // UPDATE the voicemail-in-progress record set by gather (no new row)
      db.update(callsTable)
        .set({ outcome: "voicemail_left", durationSecs: durSecs, recordingUrl: recordingUrl || null })
        .where(
          and(
            eq(callsTable.callerNumber, from),
            eq(callsTable.callType, "voicemail"),
            gte(callsTable.createdAt, since10m),
          )
        ),
    ]);

    res.set("Content-Type", "text/xml");
    res.send(texml(`
      <Say voice="alice">Thank you for your message. We will get back to you soon. Have a great day!</Say>
      <Hangup/>
    `));
  } catch (err) {
    console.error("[TELNYX] Error handling voice recording callback:", err);
    res.set("Content-Type", "text/xml");
    res.send(texml(`<Hangup/>`));
  }
});

// ── Test / dev endpoints ──────────────────────────────────────────────────────

router.post("/telnyx/test-sms", async (req, res) => {
  try {
    const { phone = "+10000000001", message = "Test SMS lead" } = req.body ?? {};
    const [row] = await db.insert(leadsTable).values({
      clientName: getClientName(), source: "telnyx_sms", phone,
      message, eventType: "sms", status: "new",
    }).returning();
    res.status(201).json({ ok: true, lead: row });
  } catch (err) {
    console.error("[telnyx/test-sms]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/telnyx/test-missed-call", async (req, res) => {
  try {
    const { phone = "+10000000002" } = req.body ?? {};
    const [row] = await db.insert(leadsTable).values({
      clientName: getClientName(), source: "telnyx_missed_call", phone,
      message: "Missed call — hangup cause: ORIGINATOR_CANCEL",
      eventType: "missed_call", status: "new",
    }).returning();
    res.status(201).json({ ok: true, lead: row });
  } catch (err) {
    console.error("[telnyx/test-missed-call]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Simulate a missed call + text-back dispatch (hits real Telnyx API if key is set).
 * Respects the 15-min dedup guard.
 */
router.post("/telnyx/test-textback", async (req, res) => {
  try {
    const { phone = "+10000000006", skipDedup = false } = req.body ?? {};

    console.log(`[TELNYX] TEST: Simulating missed call text-back to ${phone}`);

    // Log the missed call
    const [missedRow] = await db.insert(leadsTable).values({
      clientName: getClientName(),
      source:     "telnyx_missed_call",
      phone,
      message:    "[TEST] Missed call — hangup cause: NO_ANSWER",
      eventType:  "missed_call",
      status:     "new",
    }).returning();

    // Check dedup (unless overridden for testing)
    if (!skipDedup) {
      const alreadySent = await hasRecentTextBack(phone);
      if (alreadySent) {
        return res.status(200).json({
          ok: true,
          skipped: true,
          reason: `Text-back already sent to ${phone} within ${TEXTBACK_DEDUP_MINUTES} minutes`,
          missed: missedRow,
        });
      }
    }

    const result = await sendTextBack(phone);

    if (result.ok) {
      console.log(`[TELNYX] Text-back sent to ${phone}${result.messageId ? ` (msgId: ${result.messageId})` : ""}`);
      const [sentRow] = await db.insert(leadsTable).values({
        clientName: getClientName(),
        source:     "telnyx_textback",
        phone,
        message:    `[TEST] Text-back sent${result.messageId ? ` — message ID: ${result.messageId}` : ""}`,
        eventType:  "telnyx_textback_sent",
        status:     "contacted",
      }).returning();
      return res.status(201).json({ ok: true, sent: true, messageId: result.messageId, missed: missedRow, textback: sentRow });
    } else {
      console.error(`[TELNYX] Text-back failed to ${phone} — ${result.error}`);
      const [failRow] = await db.insert(leadsTable).values({
        clientName: getClientName(),
        source:     "telnyx_textback",
        phone,
        message:    `[TEST] Text-back failed: ${result.error}`,
        eventType:  "telnyx_textback_failed",
        status:     "new",
      }).returning();
      return res.status(200).json({ ok: false, sent: false, error: result.error, missed: missedRow, textback: failRow });
    }
  } catch (err: any) {
    console.error("[telnyx/test-textback]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Simulate a customer replying to the text-back menu (1/2/3).
 */
router.post("/telnyx/test-textback-reply", async (req, res) => {
  try {
    const { phone = "+10000000007", reply = "1" } = req.body ?? {};

    const replyMap: Record<string, { status: string; label: string }> = {
      "1": { status: "quote_request",       label: "Quote request" },
      "2": { status: "appointment_request", label: "Appointment request" },
      "3": { status: "emergency_request",   label: "Emergency pest issue" },
    };

    const mapped = replyMap[reply.toString()];
    if (!mapped) {
      return res.status(400).json({ error: `Invalid reply "${reply}". Use 1, 2, or 3.` });
    }

    console.log(`[TELNYX] Customer replied: ${reply} (${mapped.label}) from ${phone}`);

    const [row] = await db.insert(leadsTable).values({
      clientName: getClientName(),
      source:     "telnyx_sms_reply",
      phone,
      message:    `[TEST] Customer replied "${reply}" to text-back → ${mapped.label}`,
      eventType:  "telnyx_sms_reply",
      status:     mapped.status,
    }).returning();

    res.status(201).json({ ok: true, lead: row, parsed: mapped.label });
  } catch (err) {
    console.error("[telnyx/test-textback-reply]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/telnyx/test-voice-call", async (req, res) => {
  try {
    const { phone = "+10000000003", selection = "1" } = req.body ?? {};
    const labels: Record<string, string> = {
      "1": "live transfer requested",
      "2": "callback requested",
      "3": "voicemail recorded",
    };
    const label = labels[selection] ?? "no selection";
    console.log(`[TELNYX] TEST: Simulated inbound call from ${phone} — selection ${selection} (${label})`);

    const [call] = await db.insert(leadsTable).values({
      clientName: getClientName(), source: "telnyx_voice_call", phone,
      message: `[TEST] Incoming voice call — selection ${selection}: ${label}`,
      eventType: "telnyx_voice_call", status: "new",
    }).returning();

    let followUp = null;

    if (selection === "2") {
      console.log(`[TELNYX] TEST: Callback request logged for ${phone}`);
      const [cb] = await db.insert(leadsTable).values({
        clientName: getClientName(), source: "telnyx_callback_request", phone,
        message: "[TEST] Caller requested a callback via voice menu (pressed 2)",
        eventType: "telnyx_callback_request", status: "new",
      }).returning();
      followUp = cb;
    }

    if (selection === "3") {
      console.log(`[TELNYX] TEST: Voicemail lead logged for ${phone}`);
      const [vm] = await db.insert(leadsTable).values({
        clientName: getClientName(), source: "telnyx_voicemail", phone,
        message: "[TEST] Voicemail recording (18s): https://recordings.telnyx.com/test-recording-id.mp3",
        eventType: "telnyx_voicemail", status: "new",
      }).returning();
      followUp = vm;
    }

    res.status(201).json({ ok: true, call, followUp });
  } catch (err) {
    console.error("[telnyx/test-voice-call]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/telnyx/test-callback-request", async (req, res) => {
  try {
    const { phone = "+10000000004" } = req.body ?? {};
    console.log(`[TELNYX] TEST: Callback request from ${phone}`);
    const [row] = await db.insert(leadsTable).values({
      clientName: getClientName(), source: "telnyx_callback_request", phone,
      message: "[TEST] Caller requested a callback via voice menu (pressed 2)",
      eventType: "telnyx_callback_request", status: "new",
    }).returning();
    res.status(201).json({ ok: true, lead: row });
  } catch (err) {
    console.error("[telnyx/test-callback-request]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/telnyx/test-voicemail", async (req, res) => {
  try {
    const {
      phone        = "+10000000005",
      recordingUrl = "https://recordings.telnyx.com/test-recording.mp3",
      duration     = "22",
    } = req.body ?? {};
    console.log(`[TELNYX] TEST: Voicemail from ${phone} (${duration}s) — ${recordingUrl}`);
    const [row] = await db.insert(leadsTable).values({
      clientName: getClientName(), source: "telnyx_voicemail", phone,
      message: `[TEST] Voicemail recording (${duration}s): ${recordingUrl}`,
      eventType: "telnyx_voicemail", status: "new",
    }).returning();
    res.status(201).json({ ok: true, lead: row });
  } catch (err) {
    console.error("[telnyx/test-voicemail]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
