import { Router } from "express";
import { db } from "@workspace/db";
import { leadsTable } from "@workspace/db/schema";

const router = Router();

const MISSED_CAUSES = new Set([
  "ORIGINATOR_CANCEL",
  "NO_ANSWER",
  "USER_BUSY",
  "CALL_REJECTED",
  "NORMAL_TEMPORARY_FAILURE",
  "RECOVERY_ON_TIMER_EXPIRE",
]);

router.post("/telnyx/sms", async (req, res) => {
  try {
    const body = req.body as any;
    const payload = body?.data?.payload ?? body?.payload ?? body;

    const from   = payload?.from?.phone_number ?? payload?.from ?? "";
    const toNum  = payload?.to?.[0]?.phone_number ?? payload?.to ?? "";
    const text   = payload?.text ?? payload?.body ?? "";
    const type   = payload?.type ?? "SMS";

    const clientName = process.env.TELNYX_CLIENT_NAME ?? "Bed Bugs & Beyond";

    await db.insert(leadsTable).values({
      clientName,
      source:    "telnyx_sms",
      phone:     from,
      message:   text,
      eventType: "sms",
      status:    "new",
    });

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("[telnyx/sms]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/telnyx/webhook", async (req, res) => {
  try {
    const body = req.body as any;
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
        const clientName = process.env.TELNYX_CLIENT_NAME ?? "Bed Bugs & Beyond";
        await db.insert(leadsTable).values({
          clientName,
          source:    "telnyx_missed_call",
          phone:     from,
          message:   `Missed call — hangup cause: ${hangupCause}`,
          eventType: "missed_call",
          status:    "new",
        });
      }
    }

    if (eventType === "message.received") {
      const from    = payload?.from?.phone_number ?? payload?.from ?? "";
      const text    = payload?.text ?? "";
      const clientName = process.env.TELNYX_CLIENT_NAME ?? "Bed Bugs & Beyond";
      await db.insert(leadsTable).values({
        clientName,
        source:    "telnyx_sms",
        phone:     from,
        message:   text,
        eventType: "sms",
        status:    "new",
      });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("[telnyx/webhook]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/telnyx/test-sms", async (req, res) => {
  try {
    const { phone = "+10000000001", message = "Test SMS lead", clientName = "Bed Bugs & Beyond" } = req.body ?? {};
    const [row] = await db.insert(leadsTable).values({
      clientName, source: "telnyx_sms", phone, message, eventType: "sms", status: "new",
    }).returning();
    res.status(201).json({ ok: true, lead: row });
  } catch (err) {
    console.error("[telnyx/test-sms]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/telnyx/test-missed-call", async (req, res) => {
  try {
    const { phone = "+10000000002", clientName = "Bed Bugs & Beyond" } = req.body ?? {};
    const [row] = await db.insert(leadsTable).values({
      clientName, source: "telnyx_missed_call", phone,
      message: "Missed call — hangup cause: ORIGINATOR_CANCEL",
      eventType: "missed_call", status: "new",
    }).returning();
    res.status(201).json({ ok: true, lead: row });
  } catch (err) {
    console.error("[telnyx/test-missed-call]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
