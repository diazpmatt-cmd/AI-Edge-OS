import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGmailFetch,
  extractGmailText,
  listGmailMessageIds,
  withTimeout,
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

  it("returns only the HTTP status and never includes a Gmail response body", async () => {
    const fetchImpl = vi.fn(async () => new Response("sensitive provider response", { status: 500 })) as unknown as typeof fetch;
    const gmailFetch = createGmailFetch({ userId: "me", requestTimeoutMs: 1_000, fetchImpl });

    await expect(gmailFetch("/messages", "access-token-value"))
      .rejects.toThrow("Gmail API request failed with status 500");
    await expect(gmailFetch("/messages", "access-token-value"))
      .rejects.not.toThrow("sensitive provider response");
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
