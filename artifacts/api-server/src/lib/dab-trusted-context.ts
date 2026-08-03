import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type TrustedContextSource = {
  readonly id: string;
  readonly relativePath: string;
  readonly maxBytes: number;
  readonly required: boolean;
};

export type TrustedContextSourceResult = {
  readonly id: string;
  readonly relativePath: string;
  readonly provenance: "packaged_repository_document";
  readonly available: boolean;
  readonly required: boolean;
  readonly bytes: number;
  readonly digest: string | null;
  readonly truncated: boolean;
  readonly content: string | null;
  readonly errorCode: "SOURCE_UNAVAILABLE" | null;
};

export const TRUSTED_CONTEXT_ALLOWLIST: readonly TrustedContextSource[] = Object.freeze([
  { id: "agent_guidance", relativePath: "AGENTS.md", maxBytes: 1_500, required: true },
  { id: "engineering_handbook", relativePath: "replit.md", maxBytes: 1_800, required: true },
  { id: "product_roadmap", relativePath: "ROADMAP.md", maxBytes: 2_200, required: true },
  { id: "autonomy_roadmap", relativePath: "docs/roadmaps/AI-EDGE-AUTONOMY-ROADMAP.md", maxBytes: 1_800, required: true },
  { id: "session_handoff", relativePath: "SESSION_HANDOFF.md", maxBytes: 1_800, required: true },
  { id: "changelog", relativePath: "CHANGELOG.md", maxBytes: 1_400, required: false },
]);

const SECRET_ASSIGNMENT = /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|private[_-]?key|database[_-]?url)\b\s*[:=]\s*([^\s,;]+)/gi;
const PEM_BLOCK = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeAndRedactTrustedText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(PEM_BLOCK, "[REDACTED_PEM_BLOCK]")
    .replace(SECRET_ASSIGNMENT, (_match, name: string) => `${name}=[REDACTED]`)
    .trim();
}

export function resolveAllowlistedSource(root: string, source: TrustedContextSource): string {
  if (path.isAbsolute(source.relativePath) || source.relativePath.includes("..") || source.relativePath.includes("\\")) {
    throw new Error("CONTEXT_SOURCE_PATH_REJECTED");
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, source.relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("CONTEXT_SOURCE_PATH_REJECTED");
  }
  return resolved;
}

function truncateUtf8(value: string, maxBytes: number): { content: string; bytes: number; truncated: boolean } {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.byteLength <= maxBytes) return { content: value, bytes: encoded.byteLength, truncated: false };
  let end = maxBytes;
  while (end > 0 && (encoded[end] & 0xc0) === 0x80) end -= 1;
  const content = encoded.subarray(0, end).toString("utf8").trimEnd();
  return { content, bytes: Buffer.byteLength(content), truncated: true };
}

export async function assembleTrustedProjectContext(options?: {
  readonly root?: string;
  readonly totalContentBytes?: number;
  readonly sources?: readonly TrustedContextSource[];
}): Promise<{ readonly sources: readonly TrustedContextSourceResult[]; readonly totalContentBytes: number; readonly coverageDigest: string }> {
  const root = options?.root ?? process.env.DAB_AGENT_CONTEXT_ROOT ?? "/app/context";
  const totalLimit = options?.totalContentBytes ?? 10_500;
  const sources = options?.sources ?? TRUSTED_CONTEXT_ALLOWLIST;
  let remaining = totalLimit;
  const results: TrustedContextSourceResult[] = [];

  for (const source of sources) {
    try {
      const resolved = resolveAllowlistedSource(root, source);
      const raw = await readFile(resolved, "utf8");
      const normalized = normalizeAndRedactTrustedText(raw);
      const allowed = Math.max(0, Math.min(source.maxBytes, remaining));
      const bounded = truncateUtf8(normalized, allowed);
      remaining -= bounded.bytes;
      results.push(Object.freeze({
        id: source.id,
        relativePath: source.relativePath,
        provenance: "packaged_repository_document",
        available: true,
        required: source.required,
        bytes: bounded.bytes,
        digest: sha256(normalized),
        truncated: bounded.truncated || Buffer.byteLength(normalized) > allowed,
        content: bounded.content,
        errorCode: null,
      }));
    } catch (error) {
      if (error instanceof Error && error.message === "CONTEXT_SOURCE_PATH_REJECTED") throw error;
      results.push(Object.freeze({
        id: source.id,
        relativePath: source.relativePath,
        provenance: "packaged_repository_document",
        available: false,
        required: source.required,
        bytes: 0,
        digest: null,
        truncated: false,
        content: null,
        errorCode: "SOURCE_UNAVAILABLE",
      }));
    }
  }

  const coverageDigest = sha256(JSON.stringify(results.map(({ content: _content, ...metadata }) => metadata)));
  return Object.freeze({ sources: Object.freeze(results), totalContentBytes: totalLimit - remaining, coverageDigest });
}
