export interface TextExtraction {
  text: string;
  truncated: boolean;
}

export type GmailApiError = Error & {
  status?: number;
  retryAfterMs?: number;
};

export interface GmailListMessageIdsInput {
  accessToken: string;
  query: string;
  maxPages: number;
}

export interface GmailGetFullMessageInput {
  accessToken: string;
  messageId: string;
}

export interface GmailReadClient {
  listMessageIds(input: GmailListMessageIdsInput): Promise<{ ids: string[]; capped: boolean }>;
  getFullMessage(input: GmailGetFullMessageInput): Promise<any>;
}

export const MAX_GMAIL_MESSAGES_PER_PAGE = 50;
export const MAX_GMAIL_MESSAGE_ID_CHARS = 256;
export const MAX_GMAIL_QUERY_CHARS = 4_096;
export const MAX_PROVIDER_RETRY_AFTER_MS = 15 * 60 * 1_000;

export function isValidGmailMessageId(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= MAX_GMAIL_MESSAGE_ID_CHARS
    && /^[A-Za-z0-9_-]+$/.test(value);
}

export function parseRetryAfterMs(
  value: string | null,
  nowMs = Date.now(),
  maxRetryAfterMs = MAX_PROVIDER_RETRY_AFTER_MS,
): number | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  let retryAfterMs: number;
  if (/^\d+$/.test(normalized)) retryAfterMs = Number(normalized) * 1_000;
  else {
    const retryAtMs = Date.parse(normalized);
    if (!Number.isFinite(retryAtMs)) return null;
    retryAfterMs = Math.max(0, retryAtMs - nowMs);
  }
  if (!Number.isFinite(retryAfterMs)) return maxRetryAfterMs;
  return Math.min(maxRetryAfterMs, Math.max(0, Math.floor(retryAfterMs)));
}

function decodeBase64Url(value: string | undefined): string {
  if (!value) return "";
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function extractGmailText(payload: any, maxChars: number, depth = 0): TextExtraction {
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new Error("maxChars must be a positive integer");
  if (!payload) return { text: "", truncated: false };
  if (depth > 10) return { text: "", truncated: true };

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    return { text: decoded.slice(0, maxChars), truncated: decoded.length > maxChars };
  }

  if (Array.isArray(payload.parts)) {
    let text = "";
    let truncated = payload.parts.length > 100;
    for (const part of payload.parts.slice(0, 100)) {
      const extracted = extractGmailText(part, maxChars, depth + 1);
      if (extracted.text) text += `${text ? "\n" : ""}${extracted.text}`;
      truncated ||= extracted.truncated || text.length > maxChars;
      if (text.length >= maxChars) break;
    }
    return { text: text.slice(0, maxChars), truncated };
  }

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, " ");
    return { text: decoded.slice(0, maxChars), truncated: decoded.length > maxChars };
  }
  return { text: "", truncated: false };
}

export function createGmailReadClient(input: {
  userId: string;
  requestTimeoutMs: number;
  fetchImpl?: typeof fetch;
}): GmailReadClient {
  const userId = input.userId.trim();
  if (!userId) throw new Error("Gmail userId must not be empty");
  if (!Number.isInteger(input.requestTimeoutMs) || input.requestTimeoutMs < 1) {
    throw new Error("Gmail request timeout must be a positive integer");
  }
  const fetchImpl = input.fetchImpl ?? fetch;

  const requestJson = async (path: string, accessToken: string): Promise<any> => {
    const token = accessToken.trim();
    if (!token) throw new Error("Gmail access token must not be empty");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.requestTimeoutMs);
    try {
      const response = await fetchImpl(
        `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userId)}${path}`,
        { method: "GET", headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
      );
      if (!response.ok) {
        const error = new Error(`Gmail API request failed with status ${response.status}`) as GmailApiError;
        error.name = "GmailApiError";
        error.status = response.status;
        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        if (retryAfterMs !== null) error.retryAfterMs = retryAfterMs;
        throw error;
      }
      return await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`Gmail API request timed out after ${input.requestTimeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

  return Object.freeze({
    async listMessageIds({ accessToken, query, maxPages }: GmailListMessageIdsInput) {
      if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error("maxPages must be positive");
      const normalizedQuery = query.trim();
      if (!normalizedQuery || normalizedQuery.length > MAX_GMAIL_QUERY_CHARS) {
        throw new Error("Gmail query is missing or too long");
      }
      const ids: string[] = [];
      const seen = new Set<string>();
      let pageToken: string | undefined;

      for (let page = 0; page < maxPages; page += 1) {
        const params = new URLSearchParams({ q: normalizedQuery, maxResults: String(MAX_GMAIL_MESSAGES_PER_PAGE) });
        if (pageToken) params.set("pageToken", pageToken);
        const result = await requestJson(`/messages?${params}`, accessToken);
        const messages = Array.isArray(result.messages) ? result.messages.slice(0, MAX_GMAIL_MESSAGES_PER_PAGE) : [];
        for (const item of messages) {
          const id = typeof item?.id === "string" ? item.id.trim() : "";
          if (isValidGmailMessageId(id) && !seen.has(id)) {
            seen.add(id);
            ids.push(id);
          }
        }
        pageToken = typeof result.nextPageToken === "string" && result.nextPageToken.trim()
          ? result.nextPageToken.trim()
          : undefined;
        if (!pageToken) return { ids, capped: false };
      }
      return { ids, capped: true };
    },

    async getFullMessage({ accessToken, messageId }: GmailGetFullMessageInput) {
      if (!isValidGmailMessageId(messageId)) throw new Error("Invalid Gmail message ID");
      return requestJson(`/messages/${encodeURIComponent(messageId)}?format=full`, accessToken);
    },
  });
}
