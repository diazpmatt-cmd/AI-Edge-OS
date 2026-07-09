import { Router } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { leadsTable, callsTable, smsConversationsTable, aiReceptionistSettingsTable } from "@workspace/db/schema";

const router = Router();

// ── Constants ───────────────────────────────────────────────────────────

const TEXTBACK_DEDUP_MINUTES = 15;

const TEXT_BACK_MESSAGE = `Hi, this is Bed Bugs & Beyond. Sorry we missed your call.
import telnyxRouter from "./routes/telnyx";
How can we help you today?

Reply:
1 for Quote
2 for Appointment
3 for Emergency Pest Issue

Reply STOP to opt out.`;

const MISSED_CAUSES = new Set<string>([
  "ORIGINATOR_CANCEL",
  "NO_ANSWER",
  "USER_BUSY",
  "CALL_REJECTED",
  "NORMAL_TEMPORARY_FAILURE",
  "RECOVERY_ON_TIMER_EXPIRE",
]);

// ── AI Receptionist Settings (cached per client, TTL 5 min) ───────────────

type ClientSettings = {
  businessName:       string;
  transferPhone:      string;
  greetingScript:     string | null;
  callbackMessage:    string | null;
  voicemailMessage:   string | null;
  textRoutingMessage: string | null;
  customGreetingUrl:  string | null;
  voiceStyle:         string;
  afterHoursMode:     string;
};

const settingsCache = new Map<string, { data: ClientSettings; expiresAt: number }>();

const DEFAULT_CLIENT_SETTINGS: ClientSettings = {
  businessName:       "Bed Bugs & Beyond",
  transferPhone:      process.env.BUSINESS_FORWARD_NUMBER ?? "+12513249090",
  greetingScript:     null,
  callbackMessage:    null,
  voicemailMessage:   null,
  textRoutingMessage: "Hi! This is Bed Bugs & Beyond. You requested our info via text. Visit us at bedbugsbeyond.com or call (251) 324-9090. Reply with any questions!",
  customGreetingUrl:  process.env.CUSTOM_BBB_GREETING_URL?.trim() || null,
  voiceStyle:         "Polly.Joanna",
  afterHoursMode:     "voicemail",
};

async function getClientSettings(clientId = "default"): Promise<ClientSettings> {
  const cached = settingsCache.get(clientId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  try {
    const [row] = await db
      .select()
      .from(aiReceptionistSettingsTable)
      .where(eq(aiReceptionistSettingsTable.clientId, clientId));
    if (row) {
      const data: ClientSettings = {
        businessName:       row.businessName,
        transferPhone:      row.transferPhone,
        greetingScript:     row.greetingScript,
        callbackMessage:    row.callbackMessage,
        voicemailMessage:   row.voicemailMessage,
        textRoutingMessage: row.textRoutingMessage,
        customGreetingUrl:  row.customGreetingUrl ?? process.env.CUSTOM_BBB_GREETING_URL?.trim() ?? null,
        voiceStyle:         row.voiceStyle,
        afterHoursMode:     row.afterHoursMode,
      };
      settingsCache.set(clientId, { data, expiresAt: Date.now() + 5 * 60 * 1000 });
      return data;
    }
  } catch {
    // fall through to defaults
  }
  return DEFAULT_CLIENT_SETTINGS;
}

/** Send an outbound SMS with a custom message. Never throws. */
async function sendSms(
  to: string,
  text: string,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.TELNYX_API_KEY;
  const from   = process.env.TELNYX_FROM_NUMBER ?? "+12512863200";
  if (!apiKey) return { ok: false, error: "TELNYX_API_KEY not set" };
  try {
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, text }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = json?.errors?.[0]?.detail ?? res.statusText;
      return { ok: false, error: `Telnyx ${res.status}: ${detail}` };
    }
    return { ok: true, messageId: json?.data?.id };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Network error" };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

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

// rest of file unchanged
export default router;
