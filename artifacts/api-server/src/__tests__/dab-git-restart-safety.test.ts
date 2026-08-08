import { describe, expect, it } from "vitest";
import { DabGitWorkspaceAdapter, type DabGitCommandRunner, type DabGitWorkspaceFileSystem } from "../lib/dab-git-workspace-adapter.js";
import { readDabGitWorkerConfig } from "../lib/dab-git-worker-config.js";

const baseSha = "a".repeat(40);
const commitSha = "b".repeat(40);
const treeSha = "c".repeat(40);
const filePath = "artifacts/api-server/src/lib/restart-safe.ts";
const content = "export const restartSafe = true;\n";
const digest = "0ee2bd8287a5828bb019d4ffc56ce1d18f941dbb86866f8bbdb3443da7ce390c";

function config() {
  return readDabGitWorkerConfig({ DAB_GIT_WORKER_ENABLED: "true", DAB_GIT_WORKER_KILL_SWITCH: "false", DAB_GIT_GITHUB_TOKEN: "fixture", DAB_GIT_WORKSPACE_ROOT: "/workspace" });
}

function fakeFileSystem() {
  const files = new Map<string, string>();
  const fs: DabGitWorkspaceFileSystem = {
    reset: async () => files.clear(),
    mkdirp: async () => undefined,
    write: async (path, value) => { files.set(path, value); },
    read: async (path) => files.get(path) ?? content,
  };
  return { fs, files };
}

function fakeRunner() {
  const calls: Array<{ args: readonly string[]; env?: NodeJS.ProcessEnv }> = [];
  let committed = false;
  const runner: DabGitCommandRunner = {
    async run(args, options) {
      calls.push({ args: [...args], env: options.env });
      const key = args.join(" ");
      if (key === "branch --show-current") return "feature/restart-safe";
      if (key === "rev-parse HEAD") return committed ? commitSha : baseSha;
      if (key === "rev-parse HEAD^") return baseSha;
      if (key === "rev-parse HEAD^{tree}") return treeSha;
      if (key === "status --porcelain=v1 -z --untracked-files=all") return `?? ${filePath}\0`;
      if (args.includes("commit")) { committed = true; return "ok"; }
      return "";
    },
  };
  return { runner, calls };
}

describe("DAB Git restart safety", () => {
  it("uses an identical deterministic commit identity after workspace reconstruction", async () => {
    const attempt = async () => {
      const { fs, files } = fakeFileSystem();
      files.set(`/workspace/${filePath}`, content);
      const { runner, calls } = fakeRunner();
      const adapter = new DabGitWorkspaceAdapter({ config: config(), runner, fileSystem: fs });
      const result = await adapter.createExactCommit({ repositoryId: "1293944511", branchName: "feature/restart-safe", parentSha: baseSha, files: [{ path: filePath, sha256: digest, bytes: Buffer.byteLength(content) }], idempotencyKey: `dab-git-commit:${"d".repeat(64)}` });
      const commitCall = calls.find((call) => call.args.includes("commit"));
      return { result, env: commitCall?.env };
    };
    const beforeCrash = await attempt();
    const afterRestart = await attempt();
    expect(afterRestart.result).toEqual(beforeCrash.result);
    expect(beforeCrash.env?.GIT_AUTHOR_DATE).toBe("2000-01-01T00:00:00Z");
    expect(beforeCrash.env?.GIT_COMMITTER_DATE).toBe("2000-01-01T00:00:00Z");
    expect(afterRestart.env).toEqual(beforeCrash.env);
  });
});
