import { describe, expect, it } from "vitest";
import { readDabGitWorkerConfig, sanitizeDabGitWorkerConfig } from "../lib/dab-git-worker-config.js";
import {
  DabGitWorkspaceAdapter,
  assertDabGitBranchName,
  assertDabGitWorkspacePath,
  type DabGitCommandRunner,
  type DabGitWorkspaceFileSystem,
} from "../lib/dab-git-workspace-adapter.js";
import { DabGitHubTransportAdapter, type DabGitHubHttpClient } from "../lib/dab-github-transport-adapter.js";

const baseSha = "a".repeat(40);
const commitSha = "b".repeat(40);
const treeSha = "c".repeat(40);
const mergeSha = "d".repeat(40);
const content = "export const bounded = true;\n";

function readyConfig() {
  return readDabGitWorkerConfig({ DAB_GIT_WORKER_ENABLED: "true", DAB_GIT_WORKER_KILL_SWITCH: "false", DAB_GIT_GITHUB_TOKEN: "fixture-secret-never-command-line", DAB_GIT_WORKSPACE_ROOT: "/workspace" });
}

function fakeFileSystem() {
  const files = new Map<string, string>();
  const fs: DabGitWorkspaceFileSystem = {
    reset: async () => files.clear(),
    mkdirp: async () => undefined,
    write: async (filePath, value) => { files.set(filePath, value); },
    read: async (filePath) => { const value = files.get(filePath); if (value == null) throw new Error(`missing:${filePath}`); return value; },
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

describe("DAB Git worker config", () => {
  it("fails closed by default", () => {
    const config = readDabGitWorkerConfig({});
    expect(config.enabled).toBe(false);
    expect(config.killSwitch).toBe(true);
    expect(config.credentialPresent).toBe(false);
    expect(config.readinessCode).toBe("DAB_GIT_WORKER_DISABLED");
  });

  it("requires kill switch off and a credential before readiness", () => {
    expect(readDabGitWorkerConfig({ DAB_GIT_WORKER_ENABLED: "true" }).readinessCode).toBe("DAB_GIT_WORKER_KILL_SWITCH");
    expect(readDabGitWorkerConfig({ DAB_GIT_WORKER_ENABLED: "true", DAB_GIT_WORKER_KILL_SWITCH: "false" }).readinessCode).toBe("DAB_GIT_WORKER_CREDENTIAL_MISSING");
    expect(readDabGitWorkerConfig({ DAB_GIT_WORKER_ENABLED: "true", DAB_GIT_WORKER_KILL_SWITCH: "false", DAB_GIT_GITHUB_TOKEN: "fixture-secret" }).readinessCode).toBe("DAB_GIT_WORKER_READY");
  });

  it("rejects repository widening", () => {
    expect(readDabGitWorkerConfig({ DAB_GIT_WORKER_ENABLED: "true", DAB_GIT_WORKER_KILL_SWITCH: "false", DAB_GIT_GITHUB_TOKEN: "fixture-secret", DAB_GIT_REPOSITORY: "someone/else" }).readinessCode).toBe("DAB_GIT_WORKER_REPOSITORY_MISMATCH");
    expect(readDabGitWorkerConfig({ DAB_GIT_WORKER_ENABLED: "true", DAB_GIT_WORKER_KILL_SWITCH: "false", DAB_GIT_GITHUB_TOKEN: "fixture-secret", DAB_GIT_REPOSITORY_ID: "1" }).readinessCode).toBe("DAB_GIT_WORKER_REPOSITORY_MISMATCH");
  });

  it("never exposes the credential through sanitized diagnostics", () => {
    const config = readDabGitWorkerConfig({ DAB_GIT_WORKER_ENABLED: "true", DAB_GIT_WORKER_KILL_SWITCH: "false", DAB_GIT_GITHUB_TOKEN: "fixture-secret" });
    const safe = sanitizeDabGitWorkerConfig(config);
    expect(JSON.stringify(safe)).not.toContain("fixture-secret");
    expect(safe.credentialPresent).toBe(true);
  });
});

describe("DAB fixed semantic Git workspace adapter", () => {
  it("allows only bounded branches and safe repository paths", () => {
    expect(() => assertDabGitBranchName("feature/dab-7c9b-test")).not.toThrow();
    for (const branch of ["main", "master", "-bad", "../bad", "bad branch", "bad@{ref", "bad\\ref"]) expect(() => assertDabGitBranchName(branch)).toThrow("DAB_GIT_WORKSPACE_BRANCH_INVALID");
    expect(() => assertDabGitWorkspacePath("artifacts/api-server/src/lib/bounded.ts")).not.toThrow();
    for (const filePath of ["../secret", "/etc/passwd", ".git/config", ".github/workflows/pwn.yml", "secrets/key", ".env", "a\\b.ts"]) expect(() => assertDabGitWorkspacePath(filePath)).toThrow();
  });

  it("uses a fixed remote and leaves apply uncommitted", async () => {
    const { fs } = fakeFileSystem();
    const { runner, calls } = fakeRunner();
    const adapter = new DabGitWorkspaceAdapter({ config: readyConfig(), runner, fileSystem: fs });
    expect(await adapter.observeBaseSha("1293944511")).toBe(baseSha);
    const applied = await adapter.applyExactFiles({ repositoryId: "1293944511", expectedBaseSha: baseSha, branchName: "feature/dab-7c9b-test", files: [{ path: "artifacts/api-server/src/lib/bounded.ts", content }], idempotencyKey: `dab-git-apply:${"e".repeat(64)}` });
    expect(applied.observedFiles).toEqual([{ path: "artifacts/api-server/src/lib/bounded.ts", content }]);
    expect(calls.some((args) => args.includes("commit"))).toBe(false);
    expect(calls.some((args) => args.join(" ").includes("fixture-secret-never-command-line"))).toBe(false);
    expect(calls.some((args) => args.join(" ").includes("https://github.com/diazpmatt-cmd/AI-Edge-OS.git"))).toBe(true);
  });

  it("commits only the exact verified dirty file set in a separate call", async () => {
    const { fs, files } = fakeFileSystem();
    files.set("/workspace/artifacts/api-server/src/lib/bounded.ts", content);
    const { runner, calls } = fakeRunner();
    const adapter = new DabGitWorkspaceAdapter({ config: readyConfig(), runner, fileSystem: fs });
    const expected = [{ path: "artifacts/api-server/src/lib/bounded.ts", sha256: "7d74d1afcc131055bc58df0c04b7cfd7e87ff568e855f05feb3cc4ee7a80f72d", bytes: Buffer.byteLength(content, "utf8") }];
    const result = await adapter.createExactCommit({ repositoryId: "1293944511", branchName: "feature/dab-7c9b-test", parentSha: baseSha, files: expected, idempotencyKey: `dab-git-commit:${"f".repeat(64)}` });
    expect(result).toEqual({ commitSha, treeSha, parentSha: baseSha, branchName: "feature/dab-7c9b-test" });
    expect(calls.find((args) => args[0] === "add")).toEqual(["add", "--", "artifacts/api-server/src/lib/bounded.ts"]);
    expect(calls.filter((args) => args.includes("commit"))).toHaveLength(1);
  });
});

describe("DAB bounded GitHub transport", () => {
  it("pushes exactly one SHA with force-with-lease and fixed repository", async () => {
    const calls: string[][] = [];
    let remoteCalls = 0;
    const git: DabGitCommandRunner = { run: async (args) => {
      calls.push([...args]);
      if (args[0] === "rev-parse") return commitSha;
      if (args[0] === "branch") return "feature/dab-live";
      if (args[0] === "ls-remote") { remoteCalls += 1; return remoteCalls === 1 ? "" : `${commitSha}\trefs/heads/feature/dab-live`; }
      return "";
    }};
    const http: DabGitHubHttpClient = { request: async () => ({ status: 500, body: {} }) };
    const adapter = new DabGitHubTransportAdapter({ config: readyConfig(), git, http });
    const result = await adapter.pushCommit({ repositoryId: "1293944511", branchName: "feature/dab-live", commitSha, expectedRemoteSha: null, idempotencyKey: `dab-git-push:${"1".repeat(64)}` });
    expect(result.headSha).toBe(commitSha);
    expect(calls.find((args) => args[0] === "push")).toEqual(["push", "--force-with-lease=refs/heads/feature/dab-live:", "origin", `${commitSha}:refs/heads/feature/dab-live`]);
    expect(calls.flat().join(" ")).not.toContain("fixture-secret-never-command-line");
    expect(calls.flat().join(" ")).not.toContain("someone/else");
  });

  it("creates an exact PR and never accepts a widened base", async () => {
    const requests: any[] = [];
    const git: DabGitCommandRunner = { run: async () => "" };
    const http: DabGitHubHttpClient = { request: async (input) => {
      requests.push(input);
      if (input.path === "/git/ref/heads/main") return { status: 200, body: { object: { sha: baseSha } } };
      if (input.path === "/pulls") return { status: 201, body: { number: 348, head: { ref: "feature/dab-live", sha: commitSha }, base: { ref: "main", sha: baseSha } } };
      return { status: 404, body: {} };
    }};
    const adapter = new DabGitHubTransportAdapter({ config: readyConfig(), git, http });
    const pr = await adapter.createPullRequest({ repositoryId: "1293944511", headBranch: "feature/dab-live", headSha: commitSha, baseBranch: "main", baseSha, idempotencyKey: `dab-git-pr:${"2".repeat(64)}` });
    expect(pr.prNumber).toBe(348);
    expect(requests.find((item) => item.method === "POST")?.body).toMatchObject({ head: "feature/dab-live", base: "main", maintainer_can_modify: false });
    await expect(adapter.observeBase({ repositoryId: "1293944511", baseBranch: "release" })).rejects.toThrow("DAB_GITHUB_TRANSPORT_BASE_BRANCH_INVALID");
  });

  it("observes only the two trusted workflow names for the exact PR SHA", async () => {
    const git: DabGitCommandRunner = { run: async () => "" };
    const http: DabGitHubHttpClient = { request: async (input) => {
      if (input.path === "/pulls/348") return { status: 200, body: { head: { sha: commitSha }, base: { sha: baseSha, ref: "main" }, mergeable: true } };
      if (input.path.startsWith("/actions/runs?")) return { status: 200, body: { workflow_runs: [
        { name: "Lead Intelligence CI", head_sha: commitSha, status: "completed", conclusion: "success", run_attempt: 1 },
        { name: "Coolify stack validation", head_sha: commitSha, status: "completed", conclusion: "success", run_attempt: 1 },
        { name: "Untrusted green badge", head_sha: commitSha, status: "completed", conclusion: "success", run_attempt: 99 },
      ] } };
      return { status: 404, body: {} };
    }};
    const adapter = new DabGitHubTransportAdapter({ config: readyConfig(), git, http });
    const observed = await adapter.observeTrustedCi({ repositoryId: "1293944511", prNumber: 348, headSha: commitSha, baseSha });
    expect(observed.checks.map((check) => check.name)).toEqual(["Lead Intelligence CI", "Coolify stack validation"]);
  });

  it("merges only the exact expected head SHA", async () => {
    const requests: any[] = [];
    const git: DabGitCommandRunner = { run: async () => "" };
    const http: DabGitHubHttpClient = { request: async (input) => { requests.push(input); return { status: 200, body: { merged: true, sha: mergeSha } }; } };
    const adapter = new DabGitHubTransportAdapter({ config: readyConfig(), git, http });
    const result = await adapter.mergeExact({ repositoryId: "1293944511", prNumber: 348, expectedHeadSha: commitSha, mergeMethod: "squash", idempotencyKey: `dab-git-merge:${"3".repeat(64)}` });
    expect(result.mergeSha).toBe(mergeSha);
    expect(requests[0]).toMatchObject({ method: "PUT", path: "/pulls/348/merge", body: { sha: commitSha, merge_method: "squash" } });
    await expect(adapter.mergeExact({ repositoryId: "1", prNumber: 348, expectedHeadSha: commitSha, mergeMethod: "squash", idempotencyKey: `dab-git-merge:${"4".repeat(64)}` })).rejects.toThrow("DAB_GITHUB_TRANSPORT_REPOSITORY_MISMATCH");
  });
});
