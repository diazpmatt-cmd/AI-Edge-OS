import { OAuth2Client } from "google-auth-library";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger.js";
import {
  createGmailFetch,
  extractGmailText,
  gmailMessagePath,
  listGmailMessageIds,
} from "./lib/lead-email-gmail-client.js";
import {
  advanceMarketplaceCheckpoint,
  buildCheckpointedMarketplaceQuery,
  createMarketplaceEmailWorkerStateStore,
} from "./lib/lead-email-worker-state.js";
import { ingestMarketplaceMailboxMessage } from "./lib/marketplace-email-ingestion.js";
import { intakeLead } from "./services/lead-intake.js";

const enabled = process.env.LEAD_EMAIL_WORKER_ENABLED === "true";
const runOnce = process.env.LEAD_EMAIL_RUN_ONCE === "true";
const tenantClientId = process.env.MARKETPLACE_EMAIL_CLIENT_ID?.trim() ?? "";
const mailboxKey = process.env.MARKETPLACE_EMAIL_MAILBOX_KEY?.trim() || "primary";
const gmailUserId = process.env.GMAIL_USER_ID?.trim() || "me";
const baseQuery = process.env.GMAIL_LEAD_QUERY?.trim()
  || "newer_than:14d (from:(yelp.com) OR from:(nextdoor.com))";

function integerSetting(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

const pollMs = integerSetting("LEAD_EMAIL_POLL_MS", 300_000);
const requestTimeoutMs = integerSetting("GMAIL_REQUEST_TIMEOUT_MS", 20_000);
const maxPages = integerSetting("GMAIL_MAX_PAGES_PER_POLL", 10);
const maxTextChars = integerSetting("GMAIL_MAX_MESSAGE_TEXT_CHARS", 100_000);
const checkpointOverlapMs = integerSetting("GMAIL_CHECKPOINT_OVERLAP_MS", 6 * 60 * 60 * 1_000);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function validateSettings(): void {
  if (!tenantClientId) throw new Error("MARKETPLACE_EMAIL_CLIENT_ID is required");
  if (mailboxKey.length > 100 || !/^[A-Za-z0-9_-]+$/.test(mailboxKey)) throw new Error("MARKETPLACE_EMAIL_MAILBOX_KEY is invalid");
  if (pollMs < 60_000) throw new Error("LEAD_EMAIL_POLL_MS must be at least 60000");
  if (requestTimeoutMs < 1_000 || requestTimeoutMs > 120_000) throw new Error("GMAIL_REQUEST_TIMEOUT_MS is out of bounds");
  if (maxPages < 1 || maxPages > 100) throw new Error("GMAIL_MAX_PAGES_PER_POLL is out of bounds");
  if (maxTextChars < 1_000 || maxTextChars > 1_000_000) throw new Error("GMAIL_MAX_MESSAGE_TEXT_CHARS is out of bounds");
  if (checkpointOverlapMs < 0 || checkpointOverlapMs > 7 * 24 * 60 * 60 * 1_000) throw new Error("GMAIL_CHECKPOINT_OVERLAP_MS is out of bounds");
}

async function resolveTrustedTenant(clientId: string): Promise<{ clientId: string; clientName: string }> {
  const { rows } = await pool.query<{ client_name: string; is_active: boolean }>(
    `SELECT client_name, is_active FROM clients WHERE id = $1 LIMIT 1`,
    [clientId],
  );
  const row = rows[0];
  if (!row || !row.is_active || !row.client_name?.trim()) throw new Error("MARKETPLACE_EMAIL_CLIENT_NOT_ACTIVE");
  return Object.freeze({ clientId, clientName: row.client_name.trim() });
}

function headersFromMessage(message: any): Record<string, string> {
  const raw = Array.isArray(message.payload?.headers) ? message.payload.headers : [];
  if (raw.length > 200) throw new Error("GMAIL_MESSAGE_HEADERS_TOO_LARGE");
  return Object.fromEntries(raw.map((header: any) => [
    String(header?.name ?? "").toLowerCase(),
    String(header?.value ?? "").slice(0, 1_000),
  ]));
}

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopping = true;
    logger.info({ signal }, "Marketplace email worker stop requested");
  });
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function main(): Promise<void> {
  if (!enabled) {
    logger.info("Marketplace email worker disabled");
    return;
  }
  validateSettings();

  const tenant = await resolveTrustedTenant(tenantClientId);
  const stateStore = createMarketplaceEmailWorkerStateStore();
  await stateStore.bootstrap();
  await stateStore.ensure(tenant.clientId, mailboxKey);

  const oauth = new OAuth2Client(required("GMAIL_CLIENT_ID"), required("GMAIL_CLIENT_SECRET"));
  oauth.setCredentials({ refresh_token: required("GMAIL_REFRESH_TOKEN") });
  const gmailFetch = createGmailFetch({ userId: gmailUserId, requestTimeoutMs });

  while (!stopping) {
    try {
      await stateStore.markAttempt(tenant.clientId, mailboxKey);
      const state = await stateStore.read(tenant.clientId, mailboxKey);
      const query = buildCheckpointedMarketplaceQuery(baseQuery, state.checkpointInternalDateMs, checkpointOverlapMs);
      const token = await oauth.getAccessToken();
      if (!token.token) throw new Error("GMAIL_ACCESS_TOKEN_UNAVAILABLE");

      const listing = await listGmailMessageIds({ gmailFetch, accessToken: token.token, query, maxPages });
      const processedDates: number[] = [];
      let created = 0;
      let duplicate = 0;
      let opportunitySignals = 0;
      let ignored = 0;
      let rejected = 0;

      for (const messageId of [...listing.ids].reverse()) {
        if (stopping) break;
        const message = await gmailFetch(gmailMessagePath(messageId), token.token);
        const internalDateMs = Number(message.internalDate);
        if (!Number.isFinite(internalDateMs) || internalDateMs < 0) {
          rejected += 1;
          continue;
        }
        const headers = headersFromMessage(message);
        const extracted = extractGmailText(message.payload, maxTextChars);
        if (extracted.truncated) {
          rejected += 1;
          processedDates.push(internalDateMs);
          continue;
        }

        const outcome = await ingestMarketplaceMailboxMessage({
          tenant,
          message: {
            messageId,
            threadId: typeof message.threadId === "string" ? message.threadId : null,
            from: headers.from ?? "",
            subject: headers.subject ?? "",
            body: extracted.text,
            receivedAt: new Date(internalDateMs),
          },
          intake: intakeLead,
        });
        processedDates.push(internalDateMs);
        if (outcome.kind === "lead") {
          if (outcome.result.created) created += 1;
          else duplicate += 1;
        } else if (outcome.kind === "opportunity_signal") opportunitySignals += 1;
        else ignored += 1;
      }

      const checkpointInternalDateMs = advanceMarketplaceCheckpoint(state.checkpointInternalDateMs, processedDates);
      await stateStore.markSuccess({ clientId: tenant.clientId, mailboxKey, checkpointInternalDateMs });
      logger.info({
        clientId: tenant.clientId,
        mailboxKey,
        listed: listing.ids.length,
        capped: listing.capped,
        created,
        duplicate,
        opportunitySignals,
        ignored,
        rejected,
      }, "Marketplace email poll completed");
      if (runOnce) return;
      if (!stopping) await sleep(pollMs);
    } catch (error) {
      await stateStore.markFailure(tenant.clientId, mailboxKey, error).catch(() => undefined);
      const message = error instanceof Error ? error.message.slice(0, 200) : "unknown error";
      logger.error({ clientId: tenant.clientId, mailboxKey, error: message }, "Marketplace email poll failed");
      if (runOnce) throw error;
      if (!stopping) await sleep(pollMs);
    }
  }
}

main()
  .then(() => pool.end())
  .catch(async error => {
    const message = error instanceof Error ? error.message.slice(0, 200) : "unknown error";
    logger.error({ error: message }, "Marketplace email worker crashed");
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
