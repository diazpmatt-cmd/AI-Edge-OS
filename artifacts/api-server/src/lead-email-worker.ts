import { OAuth2Client } from "google-auth-library";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger.js";
import { classifyLeadEmail, type ClassifiedLeadEmail } from "./lib/lead-email-classifier.js";
import {
  createGmailFetch,
  extractGmailText,
  listGmailMessageIds,
  withTimeout,
  type GmailFetch,
} from "./lib/lead-email-gmail-client.js";
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
  nextCheckpointInternalDateMs,
  sanitizeWorkerError,
} from "./lib/lead-email-worker-policy.js";
import {
  createInterruptibleWait,
  runLeadEmailWorkerLoop,
} from "./lib/lead-email-worker-runtime.js";

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
let resolveStopSignal!: () => void;
const stopSignal = new Promise<void>((resolve) => {
  resolveStopSignal = resolve;
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopping = true;
    resolveStopSignal();
    logger.info({ signal }, "Lead email worker stopping after current operation");
  });
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

async function pollOnce(client: OAuth2Client, gmailFetch: GmailFetch) {
  await markLeadEmailPollAttempt();
  const checkpoint = await getLeadEmailCheckpointInternalDateMs();
  const query = buildCheckpointedGmailQuery(baseQuery, checkpoint, checkpointOverlapMs);
  const token = await withTimeout(client.getAccessToken(), requestTimeoutMs, "Gmail token refresh");
  if (!token.token) throw new Error("Unable to obtain Gmail access token");

  const listing = await listGmailMessageIds({
    gmailFetch,
    accessToken: token.token,
    query,
    maxPages,
  });
  const messageIds = listing.ids;
  if (listing.capped) {
    logger.warn({ maxPages, messagesFound: messageIds.length }, "Gmail result pagination capped for this poll");
  }

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
    const extracted = extractGmailText(message.payload, maxMessageTextChars);
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
  const gmailFetch = createGmailFetch({ userId, requestTimeoutMs });
  const wait = createInterruptibleWait(stopSignal);

  await runLeadEmailWorkerLoop({
    runOnce,
    pollMs,
    maxBackoffMs,
    shouldStop: () => stopping,
    pollOnce: () => pollOnce(client, gmailFetch),
    onSuccess: (result) => {
      logger.info(result, "Lead email poll completed");
    },
    onFailure: async (error, consecutiveFailures, retryMs) => {
      await markLeadEmailPollFailure(error, consecutiveFailures).catch((stateError) => {
        logger.error({ error: sanitizeWorkerError(stateError) }, "Unable to persist Lead Bridge failure state");
      });
      logger.error({
        consecutiveFailures,
        retryMs,
        code: classifyWorkerErrorCode(error),
        error: sanitizeWorkerError(error),
      }, "Lead email poll failed");
    },
    wait,
  });
}

main().then(() => pool.end()).catch(async (error) => {
  logger.error({ code: classifyWorkerErrorCode(error), error: sanitizeWorkerError(error) }, "Lead email worker crashed");
  await pool.end().catch(() => undefined);
  process.exit(1);
});
