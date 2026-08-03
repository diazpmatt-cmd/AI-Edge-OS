import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleTrustedProjectContext, normalizeAndRedactTrustedText, resolveAllowlistedSource } from "../lib/dab-trusted-context";

describe("DAB trusted context", () => {
  it("rejects traversal and absolute paths", () => {
    expect(() => resolveAllowlistedSource("/safe", { id: "bad", relativePath: "../secret", maxBytes: 10, required: true })).toThrow("CONTEXT_SOURCE_PATH_REJECTED");
    expect(() => resolveAllowlistedSource("/safe", { id: "bad", relativePath: "/etc/passwd", maxBytes: 10, required: true })).toThrow("CONTEXT_SOURCE_PATH_REJECTED");
  });

  it("redacts assignments and PEM blocks", () => {
    const value = normalizeAndRedactTrustedText("API_KEY=abc123\n-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----");
    expect(value).not.toContain("abc123");
    expect(value).not.toContain("secret\n-----END");
    expect(value).toContain("[REDACTED]");
    expect(value).toContain("[REDACTED_PEM_BLOCK]");
  });

  it("is deterministic, bounded, and reports unavailable sources", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dab-context-"));
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(root, "one.md"), "alpha ".repeat(100), "utf8");
    const sources = [
      { id: "one", relativePath: "one.md", maxBytes: 40, required: true },
      { id: "missing", relativePath: "docs/missing.md", maxBytes: 40, required: false },
    ] as const;
    const first = await assembleTrustedProjectContext({ root, totalContentBytes: 30, sources });
    const second = await assembleTrustedProjectContext({ root, totalContentBytes: 30, sources });
    expect(first.totalContentBytes).toBeLessThanOrEqual(30);
    expect(first.sources[0]?.truncated).toBe(true);
    expect(first.sources[1]?.available).toBe(false);
    expect(first.coverageDigest).toBe(second.coverageDigest);
    expect(first.sources[0]?.digest).toBe(second.sources[0]?.digest);
  });
});
