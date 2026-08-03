export type GmailFetch = (path: string, accessToken: string) => Promise<any>;

export type TextExtraction = {
  text: string;
  truncated: boolean;
};

export function decodeBase64Url(value: string | undefined): string {
  if (!value) return "";
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function extractGmailText(
  payload: any,
  maxMessageTextChars: number,
  depth = 0,
): TextExtraction {
  if (!Number.isInteger(maxMessageTextChars) || maxMessageTextChars < 1) {
    throw new Error("maxMessageTextChars must be a positive integer");
  }
  if (!payload) return { text: "", truncated: false };
  if (depth > 10) return { text: "", truncated: true };

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    return {
      text: decoded.slice(0, maxMessageTextChars),
      truncated: decoded.length > maxMessageTextChars,
    };
  }

  if (Array.isArray(payload.parts)) {
    let text = "";
    let truncated = payload.parts.length > 100;
    for (const part of payload.parts.slice(0, 100)) {
      const extracted = extractGmailText(part, maxMessageTextChars, depth + 1);
      if (extracted.text) text += `${text ? "\n" : ""}${extracted.text}`;
      truncated ||= extracted.truncated || text.length > maxMessageTextChars;
      if (text.length >= maxMessageTextChars) break;
    }
    return { text: text.slice(0, maxMessageTextChars), truncated };
  }

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, " ");
    return {
      text: decoded.slice(0, maxMessageTextChars),
      truncated: decoded.length > maxMessageTextChars,
    };
  }

  return { text: "", truncated: false };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("timeoutMs must be a positive integer");
  }

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

export function createGmailFetch(input: {
  userId: string;
  requestTimeoutMs: number;
  fetchImpl?: typeof fetch;
}): GmailFetch {
  const userId = input.userId.trim();
  if (!userId) throw new Error("Gmail userId must not be empty");
  if (!Number.isInteger(input.requestTimeoutMs) || input.requestTimeoutMs < 1) {
    throw new Error("Gmail request timeout must be a positive integer");
  }
  const fetchImpl = input.fetchImpl ?? fetch;

  return async (path: string, accessToken: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.requestTimeoutMs);

    try {
      const response = await fetchImpl(
        `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userId)}${path}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Gmail API request failed with status ${response.status}`);
      }
      return await response.json() as any;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Gmail API request timed out after ${input.requestTimeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

export async function listGmailMessageIds(input: {
  gmailFetch: GmailFetch;
  accessToken: string;
  query: string;
  maxPages: number;
}): Promise<{ ids: string[]; capped: boolean }> {
  if (!Number.isInteger(input.maxPages) || input.maxPages < 1) {
    throw new Error("maxPages must be a positive integer");
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < input.maxPages; page += 1) {
    const params = new URLSearchParams({ q: input.query, maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);

    const list = await input.gmailFetch(`/messages?${params.toString()}`, input.accessToken);
    for (const item of list.messages ?? []) {
      const id = String(item.id ?? "").trim();
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }

    pageToken = typeof list.nextPageToken === "string" && list.nextPageToken.trim()
      ? list.nextPageToken
      : undefined;
    if (!pageToken) return { ids, capped: false };
  }

  return { ids, capped: true };
}
