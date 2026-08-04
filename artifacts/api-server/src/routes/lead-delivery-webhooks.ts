import { Router, type Request, type Response, type NextFunction } from "express";
import { correlateInboundReply, isDeliveryEvent, normalizeDeliveryStatus, recordLeadDelivery } from "../services/lead-delivery";
import { isTelnyxVerificationRequired, verifyTelnyxWebhook } from "../services/telnyx-webhook-security";

const router = Router();

function verifyTelnyxRequest(req: Request, res: Response, next: NextFunction) {
  if (!isTelnyxVerificationRequired()) {
    next();
    return;
  }

  const signature = req.get("telnyx-signature-ed25519") ?? undefined;
  const timestamp = req.get("telnyx-timestamp") ?? undefined;
  const payload = JSON.stringify(req.body ?? {});
  const valid = verifyTelnyxWebhook({
    payload,
    signature,
    timestamp,
    publicKey: process.env.TELNYX_PUBLIC_KEY,
  });

  if (!valid) {
    console.warn("[TELNYX] Rejected webhook with invalid or stale signature");
    res.status(403).json({ error: "invalid_webhook_signature" });
    return;
  }

  next();
}

router.use(["/telnyx/webhook", "/telnyx/sms"], verifyTelnyxRequest);

router.post("/telnyx/webhook", async (req, _res, next) => {
  try {
    const body = req.body as any;
    const eventType = String(body?.data?.event_type ?? "");
    const payload = body?.data?.payload ?? {};

    if (isDeliveryEvent(eventType)) {
      const messageId = payload?.id ?? body?.data?.id ?? null;
      const customerNumber = payload?.to?.[0]?.phone_number ?? payload?.to?.[0] ?? payload?.to ?? "";
      await recordLeadDelivery({
        eventType,
        messageId,
        customerNumber,
        deliveryStatus: normalizeDeliveryStatus(eventType, payload),
        occurredAt: new Date(),
      });
    }

    if (eventType === "message.received") {
      const from = payload?.from?.phone_number ?? payload?.from ?? "";
      const text = String(payload?.text ?? "").trim();
      const messageId = payload?.id ?? body?.data?.id ?? null;
      if (from && text) {
        await correlateInboundReply({ phone: from, text, messageId, receivedAt: new Date() });
      }
    }
  } catch (error) {
    console.error("[LEAD DELIVERY] Could not process Telnyx lifecycle event:", error);
  }
  next();
});

router.post("/telnyx/sms", async (req, _res, next) => {
  try {
    const body = req.body as any;
    const payload = body?.data?.payload ?? body?.payload ?? body;
    const from = payload?.from?.phone_number ?? payload?.from ?? "";
    const text = String(payload?.text ?? payload?.body ?? "").trim();
    const messageId = payload?.id ?? payload?.message_id ?? null;
    if (from && text) {
      await correlateInboundReply({ phone: from, text, messageId, receivedAt: new Date() });
    }
  } catch (error) {
    console.error("[LEAD DELIVERY] Could not correlate inbound SMS:", error);
  }
  next();
});

export default router;
