import { OAuth2Client } from "google-auth-library";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { leadsTable } from "@workspace/db/schema";
import { logger } from "./lib/logger.js";
import { classifyLeadEmail } from "./lib/lead-email-classifier.js";

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const enabled = process.env.LEAD_EMAIL_WORKER_ENABLED === "true";
const pollMs = Number(process.env.LEAD_EMAIL_POLL_MS ?? "300000");
const userId = process.env.GMAIL_USER_ID?.trim() || "me";
const query = process.env.GMAIL_LEAD_QUERY?.trim()
  || "newer_than:14d (from:(messaging.yelp.com) OR from:(email.nextdoor.com))";

function decodeBase64Url(value: string | undefined): string {
  if (!value) return "";
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function extractText(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBase64Url(payload.body.data);
  if (Array.isArray(payload.parts)) {
    const plain = payload.parts.map(extractText).filter(Boolean).join("\n");
    if (plain) return plain;
  }
  if (payload.body?.data) return decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, " ");
  return "";
}

async function gmailFetch(path: string, accessToken: string) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userId)}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Gmail API ${response.status}: ${await response.text()}`);
  return response.json() as Promise<any>;
}

async function pollOnce(client: OAuth2Client) {
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Unable to obtain Gmail access token");
  const list = await gmailFetch(`/messages?q=${encodeURIComponent(query)}&maxResults=50`, token.token);
  const messages: Array<{ id: string }> = list.messages ?? [];

  for (const item of messages.reverse()) {
    const eventType = `gmail:${item.id}`;
    const existing = await db.select({ id: leadsTable.id }).from(leadsTable)
      .where(and(eq(leadsTable.source, "gmail-lead-bridge"), eq(leadsTable.eventType, eventType)))
      .limit(1);
    if (existing.length) continue;

    const message = await gmailFetch(`/messages/${item.id}?format=full`, token.token);
    const headers = Object.fromEntries((message.payload?.headers ?? []).map((h: any) => [String(h.name).toLowerCase(), String(h.value)]));
    const classified = classifyLeadEmail({
      messageId: item.id,
      from: headers.from ?? "",
      subject: headers.subject ?? "",
      body: extractText(message.payload),
      receivedAt: new Date(Number(message.internalDate ?? Date.now())),
    });

    const actionable = classified.kind === "lead" || classified.kind === "follow_up";
    const summary = [
      classified.service && `Service: ${classified.service}`,
      classified.location && `Location: ${classified.location}`,
      classified.details && `Details: ${classified.details}`,
    ].filter(Boolean).join("\n");

    await db.insert(leadsTable).values({
      clientName: "Bed Bugs and Beyond",
      source: "gmail-lead-bridge",
      phone: "",
      customerName: classified.customerName,
      message: summary || headers.subject || null,
      eventType,
      status: actionable ? "new" : "ignored",
      notes: JSON.stringify({
        platform: classified.source,
        kind: classified.kind,
        urgency: classified.urgency,
        payloadHash: classified.payloadHash,
        gmailMessageId: item.id,
        subject: headers.subject ?? "",
        from: headers.from ?? "",
        receivedAt: new Date(Number(message.internalDate ?? Date.now())).toISOString(),
      }),
    });

    logger.info({ gmailMessageId: item.id, source: classified.source, kind: classified.kind }, "Lead email ingested");
  }
}

async function main() {
  if (!enabled) {
    logger.info("Lead email worker disabled");
    return;
  }
  if (!Number.isFinite(pollMs) || pollMs < 60000) throw new Error("LEAD_EMAIL_POLL_MS must be at least 60000");
  const client = new OAuth2Client(required("GMAIL_CLIENT_ID"), required("GMAIL_CLIENT_SECRET"));
  client.setCredentials({ refresh_token: required("GMAIL_REFRESH_TOKEN") });
  for (;;) {
    try { await pollOnce(client); }
    catch (error) { logger.error({ error }, "Lead email poll failed"); }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

main().catch((error) => {
  logger.error({ error }, "Lead email worker crashed");
  process.exit(1);
});
