import { createHash } from "node:crypto";
import path from "node:path";

export const PREPARATION_CAPABILITIES = [
  "prepare_documentation_change",
  "prepare_task_record_change",
  "prepare_code_patch",
] as const;

export type PreparationCapability = (typeof PREPARATION_CAPABILITIES)[number];
export type ProposedFile = { path: string; content: string; rationale: string };
export type ChangeManifest = {
  summary: string;
  files: ProposedFile[];
  validationNotes: string[];
  risks: string[];
  rollbackPlan: string;
};

const allowedDocumentation = new Set(["AGENTS.md", "ROADMAP.md", "CHANGELOG.md", "SESSION_HANDOFF.md", "replit.md", "docs/roadmaps/AI-EDGE-AUTONOMY-ROADMAP.md"]);
const allowedTaskRecords = new Set(["SESSION_HANDOFF.md", "ROADMAP.md", "CHANGELOG.md"]);
const allowedCodePrefixes = ["artifacts/api-server/src/", "artifacts/ai-edge-solutions/src/", "lib/"];

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function isSafeRelativePath(value: string): boolean {
  if (!value || value.includes("\0") || value.includes("\\")) return false;
  if (path.posix.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value);
  return normalized === value && normalized !== "." && !normalized.startsWith("../") && !normalized.includes("/../") && !normalized.startsWith(".git/") && !normalized.includes("/.git/");
}

export function pathAllowed(capability: PreparationCapability, value: string): boolean {
  if (!isSafeRelativePath(value)) return false;
  if (capability === "prepare_documentation_change") return allowedDocumentation.has(value);
  if (capability === "prepare_task_record_change") return allowedTaskRecords.has(value);
  return allowedCodePrefixes.some((prefix) => value.startsWith(prefix)) && !value.endsWith(".env") && !value.includes("/secrets/");
}

export function validateManifest(capability: PreparationCapability, value: unknown, limits = { maxFiles: 8, maxFileBytes: 24_000, maxTotalBytes: 80_000 }): ChangeManifest {
  if (!value || typeof value !== "object") throw new Error("INVALID_MANIFEST");
  const manifest = value as Record<string, unknown>;
  if (typeof manifest.summary !== "string" || manifest.summary.length < 1 || manifest.summary.length > 2_000) throw new Error("INVALID_SUMMARY");
  if (!Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > limits.maxFiles) throw new Error("INVALID_FILE_COUNT");
  let total = 0;
  const seen = new Set<string>();
  const files = manifest.files.map((item) => {
    if (!item || typeof item !== "object") throw new Error("INVALID_FILE");
    const file = item as Record<string, unknown>;
    if (typeof file.path !== "string" || !pathAllowed(capability, file.path) || seen.has(file.path)) throw new Error("PATH_NOT_ALLOWED");
    if (typeof file.content !== "string" || Buffer.byteLength(file.content) > limits.maxFileBytes) throw new Error("FILE_TOO_LARGE");
    if (typeof file.rationale !== "string" || file.rationale.length > 1_000) throw new Error("INVALID_RATIONALE");
    seen.add(file.path);
    total += Buffer.byteLength(file.content);
    return { path: file.path, content: file.content, rationale: file.rationale };
  });
  if (total > limits.maxTotalBytes) throw new Error("MANIFEST_TOO_LARGE");
  const validationNotes = Array.isArray(manifest.validationNotes) ? manifest.validationNotes.filter((v): v is string => typeof v === "string").slice(0, 12) : [];
  const risks = Array.isArray(manifest.risks) ? manifest.risks.filter((v): v is string => typeof v === "string").slice(0, 12) : [];
  if (typeof manifest.rollbackPlan !== "string" || manifest.rollbackPlan.length < 1 || manifest.rollbackPlan.length > 2_000) throw new Error("INVALID_ROLLBACK");
  return { summary: manifest.summary, files, validationNotes, risks, rollbackPlan: manifest.rollbackPlan };
}

export function artifactEnvelope(kind: string, content: string) {
  const bytes = Buffer.byteLength(content);
  if (bytes > 120_000) throw new Error("ARTIFACT_TOO_LARGE");
  return { kind, content, bytes, sha256: sha256(content) };
}
