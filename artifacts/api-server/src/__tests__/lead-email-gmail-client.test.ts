import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGmailFetch,
  extractGmailText,
  gmailMessagePath,
  listGmailMessageIds,
  parseRetryAfterMs,
  withTimeout,
  type GmailApiError,
  type GmailFetch,
} from "../lib/lead-email-gmail-client.js";

const base64Url = (value: string) => Buffer.from(value, "utf8")
  .toString("base64")
  .replace(/=/g, "")
  .replace(/\+/g, "-")
  .replace(/\//g, "_");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Gmail message listing", () => {
  it("paginates, de-duplicates message IDs, and preserves first-seen order", async () => {
    const paths: string[] = [];
    const gmailFetch: GmailFetch = async (path) => {
      paths.push(path);
      if (paths.length === 1) {
        return { messages: [{ id: "m1" }, { id: "m2" }], nextPageToken: "page-2" };
      }
      return { messages: [{ id: "m2" }, { id: "m3" }] };
    };

    const result = await listGmailMessageIds({
      gmailFetch,
      accessToken: "token",
      query: "from:example.com",
      maxPages: 5,
    });

    expect(result).toEqual({ ids: ["m1", "m2", "m3"], capped: false });
    expect(paths).toHaveLength(2);
    expect(paths[0]).toContain("q=from%3Aexample.com");
    expect(paths[1]).toContain("pageToken=page-2");
  });

  it("reports a capped result when Gmail still has another page", async () => {
    const gmailFetch: GmailFetch = async () => ({
      messages: [{ id: "m1" }],
      nextPageToken: "more",
    });

    await expect(listGmailMessageIds({
      gmailFetch,
      accessToken: "token",
      query: "newer_than:14d",
      maxPages: 1,
    })).resolves.toEqual({ ids: ["m1"], capped: true });
  });

  it("drops malformed provider IDs and bounds each provider page to 50 entries", async () => {
    const messages = [
      ...Array.from({ length: 50 }, (_, index) => ({ id: `valid_${index}` })),
      { id: "../path-injection" },
      { id: "ignored_after_page_bound" },
    ];
    const gmailFetch: GmailFetch = async () => ({ messages });

    const result = await listGmailMessageIds({
      gmailFetch,
      accessToken: "token",
      query: "newer_than:14d",
      maxPages: 1,
    });

    expect(result.ids).toHaveLength(50);
    expect(result.ids[0]).toBe("valid_0");
    expect(result.ids[49]).toBe("valid_49");
    expect(result.ids).not.toContain("../path-injection");
    expect(result.ids).not.toContain("ignored_after_page_bound");
  });

  it("rejects empty credentials and oversized queries before calling Gmail", async () => {
    const gmailFetch = vi.fn(async () => ({ messages: [] })) as GmailFetch;

    await expect(listGmailMessageIds({
      gmailFetch,
      accessToken: " ",
      query: "newer_than:14d",
      maxPages: 1,
    })).rejects.toThrow("Gmail access token must not be empty");

    await expect(listGmailMessageIds({
      gmailFetch,
      accessToken: "token",
      query: "x".repeat(4_097),
      maxPages: 1,
    })).rejects.toThrow("Gmail query must not exceed 4096 characters");

    expect(gmailFetch).not.toHaveBeenCalled();
  });
});

describe("Gmail message paths", () => {
  it("builds a full-message path only from a bounded Gmail ID", () => {
    expect(gmailMessagePath("18f0_ab-CD")).toBe("/messages/18f0_ab-CD?format=full");
    expect(() => gmailMessagePath("../messages/other")).toThrow("Invalid Gmail message ID");
    expect(() => gmailMessagePath("x".repeat(257))).toThrow("Invalid Gmail message ID");
  });
});

describe("Gmail MIME extraction", () => {
  it("extracts nested text/plain parts", () => {
    const result = extractGmailText({
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: base64Url("Lead details") } },
      ],
    }, 1_000);

    expect(result).toEqual({ text: "Lead details", truncated: false });
  });

  it("strips basic HTML fallback content and enforces the text limit", () => {
    const result = extractGmailText({
      mimeType: "text/html",
      body: { data: base64Url("<p>Customer secret details</p>") },
    }, 10);

    expect(result.text).toBe(" Customer ");
    expect(result.truncated).toBe(true);
  });

  it("marks excessive MIME depth as truncated instead of recursing indefinitely", () => {
    let payload: any = { mimeType: "text/plain", body: { data: base64Url("deep") } };
    for (let index = 0; index < 12; index += 1) {
      payload = { mimeType: "multipart/mixed", parts: [payload] };
    }

    expect(extractGmailText(payload, 1_000)).toEqual({ text: "", truncated: true });
  });
});

describe("Gmail request boundaries", () => {
  it("times out token refresh without exposing the unresolved promise", async () => {
    vi.useFakeTimers();
    const operation = withTimeout(new Promise<string>(() => undefined), 1_000, "Gmail token refresh");
    const assertion = expect(operation).rejects.toThrow("Gmail token refresh timed out after 1000ms");
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it("parses delta-seconds and HTTP-date Retry-After values with a hard cap", () => {
    const now = Date.parse("2026-08-03T10:00:00Z");
    expect(parseRetryAfterMs("120", now)).toBe(120_000);
    expect(parseRetryAfterMs("Mon, 03 Aug 2026 10:02:00 GMT", now)).toBe(120_000);
    expect(parseRetryAfterMs("999999", now, 600_000)).toBe(600_000);
    expect(parseRetryAfterMs("not-a-date", now)).toBeNull();
  });

  it("returns only the HTTP status and never includes a Gmail response body", async () => {
    const fetchImpl = vi.fn(async () => new Response("sensitive provider response", { status: 500 })) as unknown as typeof fetch;
    const gmailFetch = createGmailFetch({ userId: "me", requestTimeoutMs: 1_000, fetchImpl });

    await expect(gmailFetch("/messages", "access-token-value"))
      .rejects.toThrow("Gmail API request failed with status 500");
    await expect(gmailFetch("/messages", "access-token-value"))
      .rejects.not.toThrow("sensitive provider response");
  });

  it("preserves a bounded Retry-After hint on Gmail API failures", async () => {
    const fetchImpl = vi.fn(async () => new Response("provider body must stay private", {
      status: 429,
      headers: { "Retry-After": "180" },
    })) as unknown as typeof fetch;
    const gmailFetch = createGmailFetch({ userId: "me", requestTimeoutMs: 1_000, fetchImpl });

    try {
      await gmailFetch("/messages", "access-token-value");
      throw new Error("Expected Gmail request to fail");
    } catch (error) {
      const gmailError = error as GmailApiError;
      expect(gmailError.message).toBe("Gmail API request failed with status 429");
      expect(gmailError.status).toBe(429);
      expect(gmailError.retryAfterMs).toBe(180_000);
      expect(gmailError.message).not.toContain("provider body must stay private");
    }
  });

  it("aborts an overdue Gmail request and returns a bounded timeout error", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_url: any, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    })) as unknown as typeof fetch;
    const gmailFetch = createGmailFetch({ userId: "me", requestTimeoutMs: 2_000, fetchImpl });

    const operation = gmailFetch("/messages", "access-token-value");
    const assertion = expect(operation).rejects.toThrow("Gmail API request timed out after 2000ms");
    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;
  });
});
