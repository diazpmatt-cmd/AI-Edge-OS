import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGmailReadClient,
  extractGmailText,
  parseRetryAfterMs,
} from "../lib/lead-email-gmail-client.js";

const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64url");

afterEach(() => vi.restoreAllMocks());

describe("read-only Gmail client", () => {
  it("exposes only semantic list and get operations", () => {
    const gmail = createGmailReadClient({ userId: "me", requestTimeoutMs: 1000, fetchImpl: vi.fn() as any });
    expect(Object.keys(gmail).sort()).toEqual(["getFullMessage", "listMessageIds"]);
  });

  it("paginates and de-duplicates bounded message IDs", async () => {
    const responses = [
      { ok: true, json: async () => ({ messages: [{ id: "a" }, { id: "b" }], nextPageToken: "next" }), headers: new Headers() },
      { ok: true, json: async () => ({ messages: [{ id: "b" }, { id: "c" }] }), headers: new Headers() },
    ];
    const fetchImpl = vi.fn(async () => responses.shift() as any);
    const gmail = createGmailReadClient({ userId: "me", requestTimeoutMs: 1000, fetchImpl: fetchImpl as any });
    const result = await gmail.listMessageIds({ accessToken: "token", query: "from:yelp.com", maxPages: 3 });
    expect(result).toEqual({ ids: ["a", "b", "c"], capped: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("gets only a validated full message by semantic ID", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ id: "abc_123-Z" }), headers: new Headers() }) as any);
    const gmail = createGmailReadClient({ userId: "me", requestTimeoutMs: 1000, fetchImpl: fetchImpl as any });
    await expect(gmail.getFullMessage({ accessToken: "token", messageId: "../bad" })).rejects.toThrow("Invalid Gmail message ID");
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(gmail.getFullMessage({ accessToken: "token", messageId: "abc_123-Z" })).resolves.toMatchObject({ id: "abc_123-Z" });
    expect(String(fetchImpl.mock.calls[0][0])).toContain("/messages/abc_123-Z?format=full");
    expect(fetchImpl.mock.calls[0][1]?.method).toBe("GET");
  });

  it("extracts bounded plain text", () => {
    expect(extractGmailText({ mimeType: "text/plain", body: { data: b64("hello world") } }, 5))
      .toEqual({ text: "hello", truncated: true });
  });

  it("bounds provider Retry-After", () => {
    expect(parseRetryAfterMs("999999", 0)).toBe(15 * 60 * 1_000);
  });

  it("keeps the transport GET-only in source", async () => {
    const source = await import("node:fs/promises").then(fs =>
      fs.readFile(new URL("../lib/lead-email-gmail-client.ts", import.meta.url), "utf8"),
    );
    expect(source).toContain('method: "GET"');
    expect(source).not.toContain("method: request");
  });
});
