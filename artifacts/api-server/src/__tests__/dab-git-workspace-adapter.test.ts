import { describe, expect, it } from "vitest";
import { readDabGitWorkerConfig } from "../lib/dab-git-worker-config.js";
import {
  DabGitWorkspaceAdapter,
  assertDabGitBranchName,
  assertDabGitWorkspacePath,
  type DabGitCommandRunner,
  type DabGitWorkspaceFileSystem,
} from "../lib/dab-git-workspace-adapter.js";

const baseSha = "a".repeat(40);
const commitSha = "b".repeat(40);
const treeSha = "c".repeat(40);
const content = "export const bounded = true;\n";

function config() {
  return readDabGitWorkerConfig({
    DAB_GIT_WORKER_ENABLED: "true",
    DAB_GIT_WORKER_KILL_SWITCH: "false",
    DAB_GIT_GITHUB_TOKEN: "fixture-secret-never-command-line",
    DAB_GIT_WORKSPACE_ROOT: "/workspace",
  });
}

function fakeFileSystem() {
  const files = new Map<string, string>();
  const fs: DabGitWorkspaceFileSystem = {
    reset: async () => files.clear(),
    mkdirp: async () => undefined,
    write: async (filePath, value) => { files.set(filePath, value); },
    read: async (filePath) => {
      const value = files.get(filePath);
      if (value == null) throw new Error(`missing:${filePath}`);
      return value;
    },
  };
  return { fs, files };
}

function fakeRunner(statusPath = "artifacts/api-server/src/lib/bounded.ts") {
  const calls: string[][] = [];
  let committed = false;
  const runner: DabGitCommandRunner = {
    run: async (args) => {
      calls.push([...args]);
      const key = args.join(" ");
      if (key.startsWith("ls-remote ")) return `${baseSha}\trefs/heads/main`;
      if (key === "rev-parse FETCH_HEAD") return baseSha;
      if (key === "branch --show-current") return "feature/dab-7c9b-test";
      if (key === "rev-parse HEAD") return committed ? commitSha : baseSha;
      if (key === "rev-parse HEAD^") return baseSha;
      if (key === "rev-parse HEAD^{tree}") return treeSha;
      if (key === "status --porcelain=v1 -z --untracked-files=all") return `?? ${statusPath}\0`;
      if (args.includes("commit")) { committed = true; return "ok"; }
      return "";
    },
  };
  return { runner, calls };
}

describe("DAB fixed semantic Git workspace adapter", () => {
  it("allows only bounded branches and safe repository paths", () => {
    expect(() => assertDabGitBranchName("feature/dab-7c9b-test")).not.toThrow();
    for (const branch of ["main", "master", "-bad", "../bad", "bad branch", "bad@{ref", "bad\\ref"]) {
      expect(() => assertDabGitBranchName(branch)).toThrow("DAB_GIT_WORKSPACE_BRANCH_INVALID");
    }
    expect(() => assertDabGitWorkspacePath("artifacts/api-server/src/lib/bounded.ts")).not.toThrow();
    for (const filePath of ["../secret", "/etc/passwd", ".git/config", ".github/workflows/pwn.yml", "secrets/key", ".env", "a\\b.ts"]) {
      expect(() => assertDabGitWorkspacePath(filePath)).toThrow();
    }
  });

  it("uses a fixed remote and leaves apply uncommitted", async () => {
    const { fs } = fakeFileSystem();
    const { runner, calls } = fakeRunner();
    const adapter = new DabGitWorkspaceAdapter({ config: config(), runner, fileSystem: fs });

    expect(await adapter.observeBaseSha("1293944511")).toBe(baseSha);
    const applied = await adapter.applyExactFiles({
      repositoryId: "1293944511",
      expectedBaseSha: baseSha,
      branchName: "feature/dab-7c9b-test",
      files: [{ path: "artifacts/api-server/src/lib/bounded.ts", content }],
      idempotencyKey: `dab-git-apply:${"d".repeat(64)}`,
    });

    expect(applied.observedFiles).toEqual([{ path: "artifacts/api-server/src/lib/bounded.ts", content }]);
    expect(calls.some((args) => args.includes("commit"))).toBe(false);
    expect(calls.some((args) => args.join(" ").includes("fixture-secret-never-command-line"))).toBe(false);
    expect(calls.some((args) => args.join(" ").includes("https://github.com/diazpmatt-cmd/AI-Edge-OS.git"))).toBe(true);
  });

  it("commits only the exact verified dirty file set in a separately authorized call", async () => {
    const { fs, files } = fakeFileSystem();
    files.set("/workspace/artifacts/api-server/src/lib/bounded.ts", content);
    const { runner, calls } = fakeRunner();
    const adapter = new DabGitWorkspaceAdapter({ config: config(), runner, fileSystem: fs });
    const expected = [{
      path: "artifacts/api-server/src/lib/bounded.ts",
      sha256: "7d74d1afcc131055bc58df0c04b7cfd7e87ff568e855f05feb3cc4ee7a80f72d",
      bytes: Buffer.byteLength(content, "utf8"),
    }];

    const result = await adapter.createExactCommit({
      repositoryId: "1293944511",
      branchName: "feature/dab-7c9b-test",
      parentSha: baseSha,
      files: expected,
      idempotencyKey: `dab-git-commit:${"e".repeat(64)}`,
    });

    expect(result).toEqual({ commitSha, treeSha, parentSha: baseSha, branchName: "feature/dab-7c9b-test" });
    const add = calls.find((args) => args[0] === "add");
    expect(add).toEqual(["add", "--", "artifacts/api-server/src/lib/bounded.ts"]);
    expect(calls.filter((args) => args.includes("commit"))).toHaveLength(1);
  });

  it("fails closed on repository widening and dirty-scope expansion", async () => {
    const { fs, files } = fakeFileSystem();
    files.set("/workspace/artifacts/api-server/src/lib/bounded.ts", content);
    files.set("/workspace/extra.ts", "extra");
    const widened = fakeRunner("extra.ts");
    const adapter = new DabGitWorkspaceAdapter({ config: config(), runner: widened.runner, fileSystem: fs });

    await expect(adapter.observeBaseSha("1")).rejects.toThrow("DAB_GIT_WORKSPACE_REPOSITORY_MISMATCH");
    await expect(adapter.createExactCommit({
      repositoryId: "1293944511",
      branchName: "feature/dab-7c9b-test",
      parentSha: baseSha,
      files: [{ path: "artifacts/api-server/src/lib/bounded.ts", sha256: "0".repeat(64), bytes: 1 }],
      idempotencyKey: `dab-git-commit:${"f".repeat(64)}`,
    })).rejects.toThrow("DAB_GIT_WORKSPACE_COMMIT_STATE_DRIFT");
  });
});
