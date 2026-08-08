import { describe, expect, it } from "vitest";
import { readDabGitWorkerConfig, sanitizeDabGitWorkerConfig } from "../lib/dab-git-worker-config.js";
import {
  DabGitWorkspaceAdapter,
  assertDabGitBranchName,
  assertDabGitWorkspacePath,
  type DabGitCommandRunner,
  type DabGitWorkspaceFileSystem,
} from "../lib/dab-git-workspace-adapter.js";
import { createDabGitReceiptStores, type DabDurableGitReceiptRepositoryLike } from "../lib/dab-git-durable-receipt-store.js";
import type { DabGitApplyReceipt } from "../lib/dab-git-apply-handler.js";

const baseSha = "a".repeat(40);
const commitSha = "b".repeat(40);
const treeSha = "c".repeat(40);
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
    const applied = await adapter.applyExactFiles({ repositoryId: "1293944511", expectedBaseSha: baseSha, branchName: "feature/dab-7c9b-test", files: [{ path: "artifacts/api-server/src/lib/bounded.ts", content }], idempotencyKey: `dab-git-apply:${"d".repeat(64)}` });
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
    const result = await adapter.createExactCommit({ repositoryId: "1293944511", branchName: "feature/dab-7c9b-test", parentSha: baseSha, files: expected, idempotencyKey: `dab-git-commit:${"e".repeat(64)}` });
    expect(result).toEqual({ commitSha, treeSha, parentSha: baseSha, branchName: "feature/dab-7c9b-test" });
    expect(calls.find((args) => args[0] === "add")).toEqual(["add", "--", "artifacts/api-server/src/lib/bounded.ts"]);
    expect(calls.filter((args) => args.includes("commit"))).toHaveLength(1);
  });

  it("fails closed on repository widening and dirty-scope expansion", async () => {
    const { fs, files } = fakeFileSystem();
    files.set("/workspace/artifacts/api-server/src/lib/bounded.ts", content);
    files.set("/workspace/extra.ts", "extra");
    const widened = fakeRunner("extra.ts");
    const adapter = new DabGitWorkspaceAdapter({ config: readyConfig(), runner: widened.runner, fileSystem: fs });
    await expect(adapter.observeBaseSha("1")).rejects.toThrow("DAB_GIT_WORKSPACE_REPOSITORY_MISMATCH");
    await expect(adapter.createExactCommit({ repositoryId: "1293944511", branchName: "feature/dab-7c9b-test", parentSha: baseSha, files: [{ path: "artifacts/api-server/src/lib/bounded.ts", sha256: "0".repeat(64), bytes: 1 }], idempotencyKey: `dab-git-commit:${"f".repeat(64)}` })).rejects.toThrow("DAB_GIT_WORKSPACE_COMMIT_STATE_DRIFT");
  });
});

describe("DAB durable Git receipt store wiring", () => {
  it("binds handler receipts to task + operation and replays the durable result", async () => {
    const rows = new Map<string, unknown>();
    const puts: unknown[] = [];
    const repository: DabDurableGitReceiptRepositoryLike = {
      get: async ({ taskId, operation, idempotencyKey }) => (rows.get(`${taskId}|${operation}|${idempotencyKey}`) as any) ?? null,
      put: async (input) => {
        puts.push(input);
        const key = `${input.taskId}|${input.operation}|${input.idempotencyKey}`;
        const existing = rows.get(key) as any;
        if (existing) return existing;
        const record = { receipt: input.receipt };
        rows.set(key, record);
        return record;
      },
    };
    const stores = createDabGitReceiptStores(repository, "DAB-SUPERMAN-1");
    const receipt: DabGitApplyReceipt = Object.freeze({
      operation: "apply_prepared_artifact",
      outcome: "verified",
      requestFingerprint: "1".repeat(64),
      idempotencyKey: `dab-git-apply:${"2".repeat(64)}`,
      repositoryId: "1293944511",
      preparationJobId: "job-1",
      proposalId: "proposal-1",
      expectedBaseSha: "3".repeat(40),
      branchName: "feature/durable-receipt-test",
      editingAuthorizationRef: "github:issue/343/editing",
      actorId: "apollos:test",
      workloadIdentity: "dab-git-worker:test",
      files: [],
      repositoryReceiptRef: "workspace:fixture",
      verifiedAt: "2026-08-08T01:00:00.000Z",
    });
    await stores.apply.save(receipt);
    expect(await stores.apply.getByIdempotencyKey(receipt.idempotencyKey)).toEqual(receipt);
    expect(puts).toHaveLength(1);
    expect(puts[0]).toMatchObject({ taskId: "DAB-SUPERMAN-1", operation: "apply", idempotencyKey: receipt.idempotencyKey });
  });

  it("fails closed when durable storage returns a mismatched receipt", async () => {
    const repository: DabDurableGitReceiptRepositoryLike = {
      get: async () => ({ receipt: { idempotencyKey: "wrong", requestFingerprint: "wrong" } as any }),
      put: async (input) => ({ receipt: input.receipt }),
    };
    const stores = createDabGitReceiptStores(repository, "DAB-SUPERMAN-1");
    await expect(stores.apply.getByIdempotencyKey(`dab-git-apply:${"4".repeat(64)}`)).rejects.toThrow("DAB_GIT_RECEIPT_REPOSITORY_MISMATCH");
  });
});
