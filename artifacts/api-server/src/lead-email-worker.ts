import { OAuth2Client } from "google-auth-library";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger.js";
import { classifyLeadEmail, type ClassifiedLeadEmail } from "./lib/lead-email-classifier.js";
import {
  bootstrapLeadEmailPersistence,
  getLeadEmailCheckpointInternalDateMs,
  markLeadEmailPollAttempt,
  markLeadEmailPollFailure,
  markLeadEmailPollSuccess,
  persistClassifiedLeadEmail,
  quarantineLeadEmail,
} from "./lib/lead-email-persistence.js";
import {
  buildCheckpointedGmailQuery,
  classifyWorkerErrorCode,
  computeRetryDelayMs,
  nextCheckpointInternalDateMs,
  sanitizeWorkerError,
} from "./lib/lead-email-worker-policy.js";

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
const checkpointOverlapMs = numberSetting("GMAIL_CHECKPOINT_OVERLAP_MS", 21600000);
const userId = process.env.GMAIL_USER_ID?.trim() || "me";
const baseQuery = process.env.GMAIL_LEAD_QUERY?.trim()
  || "newer_than:14d (from:(messaging.yelp.com) OR from:(email.nextdoor.com))";

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopping = true;
    logger.info({ signal }, "Lead email worker stopping after current operation");
  });
}

type TextExtraction = { text: string; truncated: boolean };

function decodeBase64Url(value: string | undefined): string {
  if (!value) return "";
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function extractText(payload: any, depth = 0): TextExtraction {
  if (!payload) return { text: "", truncated: false };
  if (depth > 10) return { text: "", truncated: true };

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    return { text: decoded.slice(0, maxMessageTextChars), truncated: decoded.length > maxMessageTextChars };
  }

  if (Array.isArray(payload.parts)) {
    let text = "";
    let truncated = payload.parts.length > 100;
    for (const part of payload.parts.slice(0, 100)) {
      const extracted = extractText(part, depth + 1);
      if (extracted.text) text += `${text ? "\n" : ""}${extracted.text}`;
      truncated ||= extracted.truncated || text.length > maxMessageTextChars;
      if (text.length >= maxMessageTextChars) break;
    }
    if (text) return { text: text.slice(0, maxMessageTextChars), truncated };
  }

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, " ");
    return { text: decoded.slice(0, maxMessageTextChars), truncated: decoded.length > maxMessageTextChars };
  }

  return { text: "", truncated: false };
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

    if (!response.ok) throw new Error(`Gmail API request failed with status ${response.status}`);
    return await response.json() as any;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Gmail API request timed out after ${requestTimeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function listMessageIds(accessToken: string, query: string): Promise<string[]> {
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

function safeMetadata(input: {
  from: string;
  subject: string;
  classified?: ClassifiedLeadEmail;
  receivedAt: Date;
}) {
  return {
    from: input.from.slice(0, 1_000),
    subject: input.subject.slice(0, 1_000),
    platform: input.classified?.source ?? "unknown",
    kind: input.classified?.kind ?? "unknown",
    urgency: input.classified?.urgency ?? "none",
    receivedAt: input.receivedAt.toISOString(),
  };
}

async function pollOnce(client: OAuth2Client) {
  await markLeadEmailPollAttempt();
  const checkpoint = await getLeadEmailCheckpointInternalDateMs();
  const query = buildCheckpointedGmailQuery(baseQuery, checkpoint, checkpointOverlapMs);
  const token = await withTimeout(client.getAccessToken(), requestTimeoutMs, "Gmail token refresh");
  if (!token.token) throw new Error("Unable to obtain Gmail access token");

  const messageIds = await listMessageIds(token.token, query);
  const processedDates: number[] = [];
  let ingested = 0;
  let skipped = 0;
  let quarantined = 0;

  for (const messageId of messageIds.reverse()) {
    if (stopping) break;

    const message = await gmailFetch(`/messages/${messageId}?format=full`, token.token);
    const internalDateMs = Number(message.internalDate);
    if (!Number.isFinite(internalDateMs) || internalDateMs < 0) {
      await quarantineLeadEmail({
        messageId,
        internalDateMs: Date.now(),
        reasonCode: "invalid_internal_date",
        metadata: { gmailMessageId: messageId },
      });
      quarantined += 1;
      continue;
    }

    const rawHeaders = Array.isArray(message.payload?.headers) ? message.payload.headers : [];
    const headers = Object.fromEntries(rawHeaders.slice(0, 200)
      .map((header: any) => [String(header.name).toLowerCase(), String(header.value).slice(0, 1_000)]));
    const receivedAt = new Date(internalDateMs);
    const extracted = extractText(message.payload);
    if (rawHeaders.length > 200 || extracted.truncated) {
      await quarantineLeadEmail({
        messageId,
        internalDateMs,
        reasonCode: rawHeaders.length > 200 ? "too_many_headers" : "message_text_too_large",
        metadata: safeMetadata({ from: headers.from ?? "", subject: headers.subject ?? "", receivedAt }),
      });
      processedDates.push(internalDateMs);
      quarantined += 1;
      continue;
    }

    const classified = classifyLeadEmail({
      messageId,
      from: headers.from ?? "",
      subject: headers.subject ?? "",
      body: extracted.text,
      receivedAt,
    });
    const summary = [
      classified.service && `Service: ${classified.service}`,
      classified.location && `Location: ${classified.location}`,
      classified.details && `Details: ${classified.details}`,
    ].filter(Boolean).join("\n").slice(0, 10_000);
    const metadata = safeMetadata({
      from: headers.from ?? "",
      subject: headers.subject ?? "",
      classified,
      receivedAt,
    });

    const result = await persistClassifiedLeadEmail({ messageId, internalDateMs, classified, summary, metadata });
    processedDates.push(internalDateMs);
    if (result === "persisted") {
      ingested += 1;
      logger.info({ gmailMessageId: messageId, source: classified.source, kind: classified.kind }, "Lead email ingested");
    } else if (result === "conflict") {
      quarantined += 1;
      logger.warn({ gmailMessageId: messageId }, "Lead email payload conflict quarantined");
    } else {
      skipped += 1;
    }
  }

  const checkpointInternalDateMs = nextCheckpointInternalDateMs(checkpoint, processedDates);
  const result = { listed: messageIds.length, ingested, skipped, quarantined, checkpointInternalDateMs };
  await markLeadEmailPollSuccess(result);
  return result;
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
  if (!Number.isInteger(checkpointOverlapMs) || checkpointOverlapMs < 0 || checkpointOverlapMs > 604800000) throw new Error("GMAIL_CHECKPOINT_OVERLAP_MS must be between 0 and 604800000");

  await bootstrapLeadEmailPersistence();
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
      const retryMs = computeRetryDelayMs(consecutiveFailures, pollMs, maxBackoffMs);
      await markLeadEmailPollFailure(error, consecutiveFailures).catch((stateError) => {
        logger.error({ error: sanitizeWorkerError(stateError) }, "Unable to persist Lead Bridge failure state");
      });
      logger.error({
        consecutiveFailures,
        retryMs,
        code: classifyWorkerErrorCode(error),
        error: sanitizeWorkerError(error),
      }, "Lead email poll failed");
      if (runOnce) throw error;
      await sleep(retryMs);
    }
  }
}

main().then(() => pool.end()).catch(async (error) => {
  logger.error({ code: classifyWorkerErrorCode(error), error: sanitizeWorkerError(error) }, "Lead email worker crashed");
  await pool.end().catch(() => undefined);
  process.exit(1);
});
