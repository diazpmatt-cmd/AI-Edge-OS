import { describe, expect, it } from "vitest";
import { artifactEnvelope, isSafeRelativePath, pathAllowed, validateManifest } from "../lib/dab-preparation-policy";

describe("DAB preparation policy", () => {
  it("rejects traversal, absolute, git, and backslash paths", () => {
    for (const value of ["../x", "/etc/passwd", ".git/config", "a/../b", "a\\b", ""]) expect(isSafeRelativePath(value)).toBe(false);
  });

  it("uses capability-specific path allowlists", () => {
    expect(pathAllowed("prepare_documentation_change", "ROADMAP.md")).toBe(true);
    expect(pathAllowed("prepare_documentation_change", "artifacts/api-server/src/index.ts")).toBe(false);
    expect(pathAllowed("prepare_code_patch", "artifacts/api-server/src/index.ts")).toBe(true);
    expect(pathAllowed("prepare_code_patch", "secrets/key.pem")).toBe(false);
  });

  it("accepts a bounded manifest", () => {
    const manifest = validateManifest("prepare_documentation_change", {
      summary: "Update roadmap",
      files: [{ path: "ROADMAP.md", content: "# Roadmap\n", rationale: "Current state" }],
      validationNotes: ["Review headings"], risks: ["Documentation only"], rollbackPlan: "Discard the artifact.",
    });
    expect(manifest.files).toHaveLength(1);
  });

  it("rejects duplicate, unsupported, and oversized files", () => {
    expect(() => validateManifest("prepare_documentation_change", { summary: "x", files: [{ path: "README.md", content: "x", rationale: "x" }], rollbackPlan: "x" })).toThrow("PATH_NOT_ALLOWED");
    expect(() => validateManifest("prepare_documentation_change", { summary: "x", files: [{ path: "ROADMAP.md", content: "x", rationale: "x" }, { path: "ROADMAP.md", content: "y", rationale: "y" }], rollbackPlan: "x" })).toThrow("PATH_NOT_ALLOWED");
    expect(() => validateManifest("prepare_documentation_change", { summary: "x", files: [{ path: "ROADMAP.md", content: "x".repeat(25_000), rationale: "x" }], rollbackPlan: "x" })).toThrow("FILE_TOO_LARGE");
  });

  it("hashes bounded immutable artifacts", () => {
    const first = artifactEnvelope("report", "hello");
    const second = artifactEnvelope("report", "hello");
    expect(first.sha256).toBe(second.sha256);
    expect(first.bytes).toBe(5);
    expect(() => artifactEnvelope("report", "x".repeat(120_001))).toThrow("ARTIFACT_TOO_LARGE");
  });
});
