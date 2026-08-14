import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGmailFetch,
  extractGmailText,
  gmailMessagePath,
  listGmailMessageIds,
  parseRetryAfterMs,
} from "../lib/lead-email-gmail-client.js";

const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64url");

afterEach(() => vi.restoreAllMocks());

describe("read-only Gmail client", () => {
  it("validates message IDs before building a full-message path", () => {
    expect(gmailMessagePath("abc_123-Z")).toBe("/messages/abc_123-Z?format=full");
    expect(() => gmailMessagePath("../messages/send")).toThrow("Invalid Gmail message ID");
  });

  it("paginates and de-duplicates bounded message IDs", async () => {
    const calls: string[] = [];
    const gmailFetch = vi.fn(async (path: string) => {
      calls.push(path);
      return calls.length === 1
        ? { messages: [{ id: "a" }, { id: "b" }], nextPageToken: "next" }
        : { messages: [{ id: "b" }, { id: "c" }] };
    });
    const result = await listGmailMessageIds({ gmailFetch, accessToken: "token", query: "from:yelp.com", maxPages: 3 });
    expect(result).toEqual({ ids: ["a", "b", "c"], capped: false });
    expect(gmailFetch).toHaveBeenCalledTimes(2);
  });

  it("extracts bounded plain text", () => {
    expect(extractGmailText({ mimeType: "text/plain", body: { data: b64("hello world") } }, 5))
      .toEqual({ text: "hello", truncated: true });
  });

  it("bounds provider Retry-After", () => {
    expect(parseRetryAfterMs("999999", 0)).toBe(15 * 60 * 1_000);
  });

  it("allows only Gmail message list/get paths", async () => {
    const fetchImpl = vi.fn();
    const gmailFetch = createGmailFetch({ userId: "me", requestTimeoutMs: 1000, fetchImpl: fetchImpl as any });
    await expect(gmailFetch("/messages/send", "token")).rejects.toThrow("restricted to message list/get paths");
    await expect(gmailFetch("/labels", "token")).rejects.toThrow("restricted to message list/get paths");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not expose mutation methods in the source", async () => {
    const source = await import("node:fs/promises").then(fs =>
      fs.readFile(new URL("../lib/lead-email-gmail-client.ts", import.meta.url), "utf8"),
    );
    expect(source).not.toContain("messages.send");
    expect(source).not.toContain("messages.modify");
    expect(source).not.toContain("messages.trash");
    expect(source).not.toContain("messages.delete");
  });
});
