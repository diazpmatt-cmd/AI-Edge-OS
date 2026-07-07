import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, eq } from "@workspace/db";
import { aiReceptionistSettingsTable } from "@workspace/db/schema";

const router = Router();

const DEFAULT_SETTINGS = {
  clientId:           "default",
  businessName:       "Bed Bugs & Beyond",
  transferPhone:      "+12513249090",
  greetingScript:     "Hi, thank you for calling Bed Bugs and Beyond Pest Control. To speak directly with us, press 1. To request a callback, press 2. To leave a voicemail, press 3. To receive a text with our info, press 4.",
  callbackMessage:    "Thank you! We have received your callback request and will call you back as soon as possible. Have a great day!",
  voicemailMessage:   "Please leave your name, phone number, and a brief description of the pest issue after the beep. Press star or hang up when finished.",
  textRoutingMessage: "Hi! This is Bed Bugs & Beyond. You requested our info via text. Visit us at bedbugsbeyond.com or call (251) 324-9090. Reply with any questions!",
  customGreetingUrl:  null as string | null,
  voiceStyle:         "Polly.Joanna",
  businessHoursJson:  JSON.stringify({
    monday:    { open: "08:00", close: "17:00", enabled: true },
    tuesday:   { open: "08:00", close: "17:00", enabled: true },
    wednesday: { open: "08:00", close: "17:00", enabled: true },
    thursday:  { open: "08:00", close: "17:00", enabled: true },
    friday:    { open: "08:00", close: "17:00", enabled: true },
    saturday:  { open: "09:00", close: "14:00", enabled: false },
    sunday:    { open: "09:00", close: "14:00", enabled: false },
  }),
  afterHoursMode: "voicemail",
};

function rowToDto(row: typeof aiReceptionistSettingsTable.$inferSelect) {
  return {
    id:                 row.id,
    clientId:           row.clientId,
    businessName:       row.businessName,
    transferPhone:      row.transferPhone,
    greetingScript:     row.greetingScript,
    callbackMessage:    row.callbackMessage,
    voicemailMessage:   row.voicemailMessage,
    textRoutingMessage: row.textRoutingMessage,
    customGreetingUrl:  row.customGreetingUrl,
    voiceStyle:         row.voiceStyle,
    businessHoursJson:  row.businessHoursJson,
    afterHoursMode:     row.afterHoursMode,
    createdAt:          row.createdAt?.toISOString(),
    updatedAt:          row.updatedAt?.toISOString(),
  };
}

// GET /api/ai-receptionist/settings
router.get("/ai-receptionist/settings", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.query.clientId as string) || "default";
  try {
    const [row] = await db
      .select()
      .from(aiReceptionistSettingsTable)
      .where(eq(aiReceptionistSettingsTable.clientId, clientId));

    return res.json(row ? rowToDto(row) : { ...DEFAULT_SETTINGS, id: null });
  } catch (err) {
    console.error("[ai-receptionist] GET settings error:", err);
    return res.json({ ...DEFAULT_SETTINGS, id: null });
  }
});

// PUT /api/ai-receptionist/settings
router.put("/ai-receptionist/settings", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const clientId = (req.query.clientId as string) || "default";
  const {
    businessName, transferPhone, greetingScript,
    callbackMessage, voicemailMessage, textRoutingMessage,
    customGreetingUrl, voiceStyle, businessHoursJson, afterHoursMode,
  } = req.body;

  try {
    const [existing] = await db
      .select()
      .from(aiReceptionistSettingsTable)
      .where(eq(aiReceptionistSettingsTable.clientId, clientId));

    const updates = {
      ...(businessName       !== undefined && { businessName }),
      ...(transferPhone      !== undefined && { transferPhone }),
      ...(greetingScript     !== undefined && { greetingScript }),
      ...(callbackMessage    !== undefined && { callbackMessage }),
      ...(voicemailMessage   !== undefined && { voicemailMessage }),
      ...(textRoutingMessage !== undefined && { textRoutingMessage }),
      ...(customGreetingUrl  !== undefined && { customGreetingUrl: customGreetingUrl || null }),
      ...(voiceStyle         !== undefined && { voiceStyle }),
      ...(businessHoursJson  !== undefined && { businessHoursJson }),
      ...(afterHoursMode     !== undefined && { afterHoursMode }),
    };

    let row;
    if (existing) {
      [row] = await db
        .update(aiReceptionistSettingsTable)
        .set(updates)
        .where(eq(aiReceptionistSettingsTable.clientId, clientId))
        .returning();
    } else {
      [row] = await db
        .insert(aiReceptionistSettingsTable)
        .values({ ...DEFAULT_SETTINGS, ...updates, clientId })
        .returning();
    }

    return res.json(rowToDto(row));
  } catch (err) {
    console.error("[ai-receptionist] PUT settings error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/ai-receptionist/test-sms — send a test text routing SMS
router.post("/ai-receptionist/test-sms", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { to, message, clientId } = req.body;
  if (!to) return res.status(400).json({ error: "to is required" });

  const apiKey  = process.env.TELNYX_API_KEY;
  const from    = process.env.TELNYX_FROM_NUMBER ?? "+12512863200";

  if (!apiKey) {
    return res.status(503).json({ error: "TELNYX_API_KEY not configured" });
  }

  // Get the text routing message from settings if not provided
  let smsMessage = message;
  if (!smsMessage) {
    try {
      const cid = clientId || "default";
      const [row] = await db
        .select()
        .from(aiReceptionistSettingsTable)
        .where(eq(aiReceptionistSettingsTable.clientId, cid));
      smsMessage = row?.textRoutingMessage ?? DEFAULT_SETTINGS.textRoutingMessage;
    } catch {
      smsMessage = DEFAULT_SETTINGS.textRoutingMessage;
    }
  }

  try {
    const resp = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, text: smsMessage }),
    });
    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const detail = json?.errors?.[0]?.detail ?? resp.statusText;
      return res.status(resp.status).json({ error: `Telnyx: ${detail}` });
    }
    return res.json({ ok: true, messageId: json?.data?.id, message: smsMessage });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Send failed" });
  }
});

// POST /api/ai-receptionist/test-call-flow — simulate a call flow step
router.post("/ai-receptionist/test-call-flow", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { digit, clientId } = req.body;
  const cid = clientId || "default";

  try {
    const [row] = await db
      .select()
      .from(aiReceptionistSettingsTable)
      .where(eq(aiReceptionistSettingsTable.clientId, cid));

    const settings = row ? rowToDto(row) : DEFAULT_SETTINGS;

    const flows: Record<string, { action: string; response: string }> = {
      "1": { action: "Transfer",      response: `Transferring to ${settings.transferPhone}` },
      "2": { action: "Callback",      response: settings.callbackMessage ?? DEFAULT_SETTINGS.callbackMessage },
      "3": { action: "Voicemail",     response: settings.voicemailMessage ?? DEFAULT_SETTINGS.voicemailMessage },
      "4": { action: "Text Routing",  response: settings.textRoutingMessage ?? DEFAULT_SETTINGS.textRoutingMessage },
    };

    const flow = flows[digit];
    if (!flow) {
      return res.status(400).json({ error: "digit must be 1–4" });
    }

    return res.json({
      digit,
      action:   flow.action,
      response: flow.response,
      voice:    settings.voiceStyle,
      settings: {
        businessName:  settings.businessName,
        transferPhone: settings.transferPhone,
      },
    });
  } catch (err) {
    console.error("[ai-receptionist] test-call-flow error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
