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

const numberSetting = (name: string, fallback: number) => {
  const raw = process.env[name]?.trim();
  return raw ? Number(raw) : fallback;
};

const enabled = process.env.LEAD_EMAIL_WORKER_ENABLED === "true";
const runOnce = process.env.LEAD_EMAIL_RUN_ONCE === "true";
const pollMs = numberSetting("LEAD_EMAIL_POLL_MS", 300000);
const maxBackoffMs = numberSetting("LEAD_EMAIL_MAX_BACKOFF_MS", 3600000);
const requestTimeoutMs = numberSetting("GMAIL_REQUEST_TIMEOUT_MS", 20000);
const maxPages = numberSetting("GMAIL_MAX_PAGES_PER_POLL", 10);
const maxMessageTextChars = numberSetting("GMAIL_MAX_MESSAGE_TEXT_CHARS", 100000);
const userId = process.env.GMAIL_USER_ID?.trim() || "me";
const query = process.env.GMAIL_LEAD_QUERY?.trim()
  || "newer_than:14d (from:(messaging.yelp.com) OR from:(email.nextdoor.com))";

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopping = true;
    logger.info({ signal }, "Lead email worker stopping after current operation");
  });
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[redacted-token]")
    .slice(0, 300);
}

function decodeBase64Url(value: string | undefined): string {
  if (!value) return "";
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function extractText(payload: any, depth = 0): string {
  if (!payload || depth > 10) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data).slice(0, maxMessageTextChars);
  }

  if (Array.isArray(payload.parts)) {
    const plain = payload.parts
      .slice(0, 100)
      .map((part: any) => extractText(part, depth + 1))
      .filter(Boolean)
      .join("\n")
      .slice(0, maxMessageTextChars);
    if (plain) return plain;
  }

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data)
      .replace(/<[^>]+>/g, " ")
      .slice(0, maxMessageTextChars);
  }

  return "";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function gmailFetch(path: string, accessToken: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userId)}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Gmail API request failed with status ${response.status}`);
    }

    return await response.json() as any;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Gmail API request timed out after ${requestTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function listMessageIds(accessToken: string): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({ q: query, maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);

    const list = await gmailFetch(`/messages?${params.toString()}`, accessToken);
    for (const item of list.messages ?? []) {
      const id = String(item.id ?? "").trim();
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }

    pageToken = typeof list.nextPageToken === "string" ? list.nextPageToken : undefined;
    if (!pageToken) return ids;
  }

  logger.warn({ maxPages, messagesFound: ids.length }, "Gmail result pagination capped for this poll");
  return ids;
}

async function pollOnce(client: OAuth2Client) {
  const token = await withTimeout(client.getAccessToken(), requestTimeoutMs, "Gmail token refresh");
  if (!token.token) throw new Error("Unable to obtain Gmail access token");

  const messageIds = await listMessageIds(token.token);
  let ingested = 0;
  let skipped = 0;

  for (const messageId of messageIds.reverse()) {
    if (stopping) break;

    const eventType = `gmail:${messageId}`;
    const existing = await db.select({ id: leadsTable.id }).from(leadsTable)
      .where(and(eq(leadsTable.source, "gmail-lead-bridge"), eq(leadsTable.eventType, eventType)))
      .limit(1);
    if (existing.length) {
      skipped += 1;
      continue;
    }

    const message = await gmailFetch(`/messages/${messageId}?format=full`, token.token);
    const headers = Object.fromEntries((message.payload?.headers ?? [])
      .slice(0, 200)
      .map((header: any) => [String(header.name).toLowerCase(), String(header.value).slice(0, 1000)]));
    const receivedAt = new Date(Number(message.internalDate ?? Date.now()));
    const classified = classifyLeadEmail({
      messageId,
      from: headers.from ?? "",
      subject: headers.subject ?? "",
      body: extractText(message.payload),
      receivedAt,
    });

    const actionable = classified.kind === "lead" || classified.kind === "follow_up";
    const summary = [
      classified.service && `Service: ${classified.service}`,
      classified.location && `Location: ${classified.location}`,
      classified.details && `Details: ${classified.details}`,
    ].filter(Boolean).join("\n").slice(0, 10000);

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
        gmailMessageId: messageId,
        subject: headers.subject ?? "",
        from: headers.from ?? "",
        receivedAt: receivedAt.toISOString(),
      }).slice(0, 20000),
    });

    ingested += 1;
    logger.info({ gmailMessageId: messageId, source: classified.source, kind: classified.kind }, "Lead email ingested");
  }

  return { listed: messageIds.length, ingested, skipped };
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  if (!enabled) {
    logger.info("Lead email worker disabled");
    return;
  }

  if (!Number.isFinite(pollMs) || pollMs < 60000) throw new Error("LEAD_EMAIL_POLL_MS must be at least 60000");
  if (!Number.isFinite(maxBackoffMs) || maxBackoffMs < pollMs) throw new Error("LEAD_EMAIL_MAX_BACKOFF_MS must be at least LEAD_EMAIL_POLL_MS");
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1000 || requestTimeoutMs > 120000) throw new Error("GMAIL_REQUEST_TIMEOUT_MS must be between 1000 and 120000");
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error("GMAIL_MAX_PAGES_PER_POLL must be between 1 and 100");
  if (!Number.isInteger(maxMessageTextChars) || maxMessageTextChars < 1000 || maxMessageTextChars > 1000000) throw new Error("GMAIL_MAX_MESSAGE_TEXT_CHARS must be between 1000 and 1000000");

  const client = new OAuth2Client(required("GMAIL_CLIENT_ID"), required("GMAIL_CLIENT_SECRET"));
  client.setCredentials({ refresh_token: required("GMAIL_REFRESH_TOKEN") });

  let consecutiveFailures = 0;
  while (!stopping) {
    try {
      const result = await pollOnce(client);
      consecutiveFailures = 0;
      logger.info(result, "Lead email poll completed");
      if (runOnce) return;
      await sleep(pollMs);
    } catch (error) {
      consecutiveFailures += 1;
      const retryMs = Math.min(maxBackoffMs, pollMs * (2 ** Math.min(consecutiveFailures - 1, 6)));
      logger.error({ consecutiveFailures, retryMs, error: safeErrorMessage(error) }, "Lead email poll failed");
      if (runOnce) throw error;
      await sleep(retryMs);
    }
  }
}

main().catch((error) => {
  logger.error({ error: safeErrorMessage(error) }, "Lead email worker crashed");
  process.exit(1);
});
