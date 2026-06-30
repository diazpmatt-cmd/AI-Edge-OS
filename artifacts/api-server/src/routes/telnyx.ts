import { Router } from "express";
import { db } from "@workspace/db";
import { leadsTable } from "@workspace/db/schema";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

const MISSED_CAUSES = new Set([
  "ORIGINATOR_CANCEL",
  "NO_ANSWER",
  "USER_BUSY",
  "CALL_REJECTED",
  "NORMAL_TEMPORARY_FAILURE",
  "RECOVERY_ON_TIMER_EXPIRE",
]);

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

// ── SMS ──────────────────────────────────────────────────────────────────────

router.post("/telnyx/sms", async (req, res) => {
  try {
    const body    = req.body as any;
    const payload = body?.data?.payload ?? body?.payload ?? body;

    const from  = payload?.from?.phone_number ?? payload?.from ?? "";
    const text  = payload?.text ?? payload?.body ?? "";

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
    console.error("[telnyx/sms]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── General call-control / message webhook ───────────────────────────────────

router.post("/telnyx/webhook", async (req, res) => {
  try {
    const body      = req.body as any;
    const eventType = body?.data?.event_type ?? "";
    const payload   = body?.data?.payload ?? {};

    if (eventType === "call.hangup") {
      const hangupCause = payload?.hangup_cause ?? "";
      const from        = payload?.from ?? "";
      const duration    = payload?.call_duration_secs ?? payload?.duration ?? 0;

      const isMissed =
        MISSED_CAUSES.has(hangupCause) ||
        (hangupCause === "NORMAL_CLEARING" && Number(duration) < 5);

      if (isMissed) {
        await db.insert(leadsTable).values({
          clientName: getClientName(),
          source:     "telnyx_missed_call",
          phone:      from,
          message:    `Missed call — hangup cause: ${hangupCause}`,
          eventType:  "missed_call",
          status:     "new",
        });
      }
    }

    if (eventType === "message.received") {
      const from = payload?.from?.phone_number ?? payload?.from ?? "";
      const text = payload?.text ?? "";
      await db.insert(leadsTable).values({
        clientName: getClientName(),
        source:     "telnyx_sms",
        phone:      from,
        message:    text,
        eventType:  "sms",
        status:     "new",
      });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("[telnyx/webhook]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// VOICE — AI Receptionist V1 (TeXML IVR menu)
//
// Configure in Telnyx portal:
//   TeXML Application → Inbound webhook URL → POST /api/telnyx/voice
//
// Modular design: replace the <Gather> greeting block with AI conversation
// logic in a future Voice V2 without touching the recording/callback handlers.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/telnyx/voice
 * Entry point for every inbound call on the Telnyx TeXML application.
 * Logs the call and returns a TeXML greeting with a 3-option digit gather.
 */
router.post("/telnyx/voice", async (req, res) => {
  try {
    const body = req.body as any;
    const from = body?.From ?? body?.from ?? body?.Caller ?? "";
    const to   = body?.To   ?? body?.to   ?? body?.Called  ?? process.env.TELNYX_FROM_NUMBER ?? "";

    console.log(`[TELNYX] Incoming call from ${from || "unknown"} to ${to || "unknown"}`);

    await db.insert(leadsTable).values({
      clientName: getClientName(),
      source:     "telnyx_voice_call",
      phone:      from,
      message:    "Incoming voice call — awaiting menu selection",
      eventType:  "telnyx_voice_call",
      status:     "new",
    });

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

/**
 * POST /api/telnyx/voice/gather
 * Receives the digit pressed by the caller.
 *   1 → Live transfer to BUSINESS_FORWARD_NUMBER
 *   2 → Callback request — log lead, say confirmation, hangup
 *   3 → Record voicemail — hand off to /voice/recording
 */
router.post("/telnyx/voice/gather", async (req, res) => {
  try {
    const body    = req.body as any;
    const digit   = (body?.Digits ?? body?.digits ?? "").toString().trim();
    const from    = body?.From ?? body?.from ?? body?.Caller ?? "";
    const forward = process.env.BUSINESS_FORWARD_NUMBER ?? "+12543249090";

    console.log(`[TELNYX] Menu selection: "${digit}" from ${from || "unknown"}`);

    res.set("Content-Type", "text/xml");

    // ── 1: Live transfer ──────────────────────────────────────────────────────
    if (digit === "1") {
      console.log(`[TELNYX] Transfer initiated to ${forward}`);
      await db.insert(leadsTable).values({
        clientName: getClientName(),
        source:     "telnyx_voice_call",
        phone:      from,
        message:    `Caller pressed 1 — live transfer initiated to ${forward}`,
        eventType:  "telnyx_voice_call",
        status:     "contacted",
      });
      res.send(texml(`
        <Say voice="alice">Please hold while we connect you.</Say>
        <Dial>${forward}</Dial>
      `));

    // ── 2: Callback request ───────────────────────────────────────────────────
    } else if (digit === "2") {
      console.log(`[TELNYX] Callback request from ${from || "unknown"}`);
      await db.insert(leadsTable).values({
        clientName: getClientName(),
        source:     "telnyx_callback_request",
        phone:      from,
        message:    "Caller requested a callback via voice menu (pressed 2)",
        eventType:  "telnyx_callback_request",
        status:     "new",
      });
      res.send(texml(`
        <Say voice="alice">Thank you! We have received your callback request and will call you back as soon as possible. Have a great day!</Say>
        <Hangup/>
      `));

    // ── 3: Voicemail ──────────────────────────────────────────────────────────
    } else if (digit === "3") {
      const recordUrl = `${baseUrl(req)}/api/telnyx/voice/recording`;
      console.log(`[TELNYX] Voicemail recording started for ${from || "unknown"}`);
      res.send(texml(`
        <Say voice="alice">Please leave your message after the beep. Press star or hang up when finished.</Say>
        <Record action="${recordUrl}" method="POST" maxLength="120" playBeep="true" finishOnKey="*"/>
        <Say voice="alice">We did not receive your message. Please call back and try again. Goodbye.</Say>
        <Hangup/>
      `));

    // ── Invalid / timeout ─────────────────────────────────────────────────────
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

/**
 * POST /api/telnyx/voice/recording
 * Telnyx posts here when a voicemail recording is complete.
 * Logs the recording URL and duration as a telnyx_voicemail lead.
 */
router.post("/telnyx/voice/recording", async (req, res) => {
  try {
    const body         = req.body as any;
    const from         = body?.From ?? body?.from ?? body?.Caller ?? "";
    const recordingUrl = body?.RecordingUrl ?? body?.recording_url ?? body?.recordingUrl ?? "";
    const duration     = body?.RecordingDuration ?? body?.duration ?? body?.recording_duration ?? "";

    const durLabel = duration ? ` (${duration}s)` : "";
    const urlLabel = recordingUrl || "no URL captured";

    console.log(`[TELNYX] Voicemail recorded from ${from || "unknown"}${durLabel} — ${urlLabel}`);

    await db.insert(leadsTable).values({
      clientName: getClientName(),
      source:     "telnyx_voicemail",
      phone:      from,
      message:    recordingUrl
        ? `Voicemail recording${durLabel}: ${recordingUrl}`
        : `Voicemail received${durLabel} — recording URL not provided`,
      eventType:  "telnyx_voicemail",
      status:     "new",
    });

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

/** Simulate a full voice call flow: logs initial call + selected option */
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
