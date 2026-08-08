import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DabGitRepositoryAdapter } from "./dab-git-apply-handler.js";
import type { DabGitCommitAdapter } from "./dab-git-commit-handler.js";
import {
  DAB_GIT_ALLOWED_REPOSITORY,
  DAB_GIT_ALLOWED_REPOSITORY_ID,
  type DabGitWorkerConfig,
} from "./dab-git-worker-config.js";

const FIXED_REMOTE_URL = `https://github.com/${DAB_GIT_ALLOWED_REPOSITORY}.git`;
const SAFE_BRANCH = /^(?![-/.])(?!.*(?:\.\.|@\{|\\|\s|\.lock(?:\/|$)))[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/;
const FORBIDDEN_PATH_PREFIXES = [".git/", ".github/workflows/", "secrets/", ".env"] as const;

export interface DabGitCommandRunner {
  run(args: readonly string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<string>;
}

export interface DabGitWorkspaceFileSystem {
  reset(root: string): Promise<void>;
  mkdirp(directory: string): Promise<void>;
  write(filePath: string, content: string): Promise<void>;
  read(filePath: string): Promise<string>;
}

export type DabGitWorkspaceAdapterOptions = Readonly<{
  config: DabGitWorkerConfig;
  runner?: DabGitCommandRunner;
  fileSystem?: DabGitWorkspaceFileSystem;
}>;

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function assertRepository(repositoryId: string): void {
  if (repositoryId !== DAB_GIT_ALLOWED_REPOSITORY_ID) throw new Error("DAB_GIT_WORKSPACE_REPOSITORY_MISMATCH");
}

export function assertDabGitBranchName(branchName: string): void {
  if (!SAFE_BRANCH.test(branchName) || branchName === "main" || branchName === "master") {
    throw new Error("DAB_GIT_WORKSPACE_BRANCH_INVALID");
  }
}

export function assertDabGitWorkspacePath(filePath: string): void {
  if (!filePath || path.posix.isAbsolute(filePath) || filePath.includes("\\")) throw new Error("DAB_GIT_WORKSPACE_PATH_INVALID");
  const normalized = path.posix.normalize(filePath);
  if (normalized !== filePath || normalized === ".." || normalized.startsWith("../")) throw new Error("DAB_GIT_WORKSPACE_PATH_INVALID");
  if (FORBIDDEN_PATH_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))) {
    throw new Error("DAB_GIT_WORKSPACE_PATH_FORBIDDEN");
  }
}

function realFileSystem(): DabGitWorkspaceFileSystem {
  return {
    reset: async (root) => { await rm(root, { recursive: true, force: true }); await mkdir(root, { recursive: true, mode: 0o700 }); },
    mkdirp: async (directory) => { await mkdir(directory, { recursive: true, mode: 0o700 }); },
    write: async (filePath, content) => { await writeFile(filePath, content, { encoding: "utf8", mode: 0o600 }); },
    read: async (filePath) => readFile(filePath, "utf8"),
  };
}

function realRunner(config: DabGitWorkerConfig): DabGitCommandRunner {
  return {
    run: async (args, options) => new Promise<string>((resolve, reject) => {
      const child = spawn("git", [...args], {
        cwd: options.cwd,
        env: {
          ...process.env,
          ...options.env,
          GIT_TERMINAL_PROMPT: "0",
          DAB_GIT_GITHUB_TOKEN: config.credential ?? "",
          GIT_ASKPASS: "/usr/local/bin/dab-git-askpass",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(`DAB_GIT_COMMAND_FAILED:${code}:${stderr.slice(0, 240)}`)));
    }),
  };
}

function workspaceFilesFromPorcelain(output: string): string[] {
  if (!output) return [];
  const entries = output.split("\0").filter(Boolean);
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.length < 4) throw new Error("DAB_GIT_WORKSPACE_STATUS_INVALID");
    const status = entry.slice(0, 2);
    const filePath = entry.slice(3);
    if (status.includes("R") || status.includes("C")) throw new Error("DAB_GIT_WORKSPACE_RENAME_UNSUPPORTED");
    assertDabGitWorkspacePath(filePath);
    paths.push(filePath);
  }
  return [...new Set(paths)].sort();
}

export class DabGitWorkspaceAdapter implements DabGitRepositoryAdapter, DabGitCommitAdapter {
  private readonly config: DabGitWorkerConfig;
  private readonly runner: DabGitCommandRunner;
  private readonly fs: DabGitWorkspaceFileSystem;

  constructor(options: DabGitWorkspaceAdapterOptions) {
    this.config = options.config;
    this.runner = options.runner ?? realRunner(options.config);
    this.fs = options.fileSystem ?? realFileSystem();
  }

  private assertReady(): void {
    if (this.config.readinessCode !== "DAB_GIT_WORKER_READY") throw new Error(this.config.readinessCode);
  }

  private absolute(filePath: string): string {
    assertDabGitWorkspacePath(filePath);
    const resolved = path.resolve(this.config.workspaceRoot, filePath);
    const root = path.resolve(this.config.workspaceRoot) + path.sep;
    if (!resolved.startsWith(root)) throw new Error("DAB_GIT_WORKSPACE_PATH_ESCAPE");
    return resolved;
  }

  async observeBaseSha(repositoryId: string): Promise<string> {
    this.assertReady();
    assertRepository(repositoryId);
    const output = await this.runner.run(["ls-remote", FIXED_REMOTE_URL, "refs/heads/main"], { cwd: this.config.workspaceRoot });
    const sha = output.split(/\s+/)[0] ?? "";
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("DAB_GIT_WORKSPACE_BASE_SHA_INVALID");
    return sha;
  }

  async applyExactFiles(input: {
    repositoryId: string;
    expectedBaseSha: string;
    branchName: string;
    files: readonly { path: string; content: string }[];
    idempotencyKey: string;
  }) {
    this.assertReady();
    assertRepository(input.repositoryId);
    assertDabGitBranchName(input.branchName);
    if (!/^[a-f0-9]{40}$/.test(input.expectedBaseSha)) throw new Error("DAB_GIT_WORKSPACE_BASE_SHA_INVALID");
    if (!input.idempotencyKey.startsWith("dab-git-apply:")) throw new Error("DAB_GIT_WORKSPACE_IDEMPOTENCY_INVALID");
    for (const file of input.files) assertDabGitWorkspacePath(file.path);

    await this.fs.reset(this.config.workspaceRoot);
    await this.runner.run(["init", "--initial-branch=main"], { cwd: this.config.workspaceRoot });
    await this.runner.run(["remote", "add", "origin", FIXED_REMOTE_URL], { cwd: this.config.workspaceRoot });
    await this.runner.run(["fetch", "--depth=1", "origin", input.expectedBaseSha], { cwd: this.config.workspaceRoot });
    const fetched = await this.runner.run(["rev-parse", "FETCH_HEAD"], { cwd: this.config.workspaceRoot });
    if (fetched !== input.expectedBaseSha) throw new Error("DAB_GIT_WORKSPACE_FETCH_SHA_MISMATCH");
    await this.runner.run(["checkout", "--detach", input.expectedBaseSha], { cwd: this.config.workspaceRoot });
    await this.runner.run(["switch", "-c", input.branchName], { cwd: this.config.workspaceRoot });

    for (const file of input.files) {
      const absolute = this.absolute(file.path);
      await this.fs.mkdirp(path.dirname(absolute));
      await this.fs.write(absolute, file.content);
    }

    const observedFiles = await Promise.all(input.files.map(async (file) => ({ path: file.path, content: await this.fs.read(this.absolute(file.path)) })));
    return {
      branchName: input.branchName,
      observedFiles,
      repositoryReceiptRef: `workspace:${sha256(`${input.idempotencyKey}:${input.expectedBaseSha}:${input.branchName}`)}`,
    };
  }

  async observeBranch(input: { repositoryId: string; branchName: string }) {
    this.assertReady();
    assertRepository(input.repositoryId);
    assertDabGitBranchName(input.branchName);
    const branch = await this.runner.run(["branch", "--show-current"], { cwd: this.config.workspaceRoot });
    if (branch !== input.branchName) throw new Error("DAB_GIT_WORKSPACE_BRANCH_MISMATCH");
    const headSha = await this.runner.run(["rev-parse", "HEAD"], { cwd: this.config.workspaceRoot });
    if (!/^[a-f0-9]{40}$/.test(headSha)) throw new Error("DAB_GIT_WORKSPACE_HEAD_SHA_INVALID");
    const status = await this.runner.run(["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: this.config.workspaceRoot });
    const changedPaths = workspaceFilesFromPorcelain(status);
    const files = await Promise.all(changedPaths.map(async (filePath) => {
      const content = await this.fs.read(this.absolute(filePath));
      return { path: filePath, sha256: sha256(content), bytes: Buffer.byteLength(content, "utf8") };
    }));
    return { headSha, files };
  }

  async createExactCommit(input: {
    repositoryId: string;
    branchName: string;
    parentSha: string;
    files: readonly { path: string; sha256: string; bytes: number }[];
    idempotencyKey: string;
  }) {
    this.assertReady();
    assertRepository(input.repositoryId);
    assertDabGitBranchName(input.branchName);
    if (!/^[a-f0-9]{40}$/.test(input.parentSha)) throw new Error("DAB_GIT_WORKSPACE_PARENT_SHA_INVALID");
    if (!input.idempotencyKey.startsWith("dab-git-commit:")) throw new Error("DAB_GIT_WORKSPACE_IDEMPOTENCY_INVALID");
    for (const file of input.files) assertDabGitWorkspacePath(file.path);

    const observed = await this.observeBranch({ repositoryId: input.repositoryId, branchName: input.branchName });
    const expected = JSON.stringify([...input.files].sort((a,b) => a.path.localeCompare(b.path)));
    const actual = JSON.stringify([...observed.files].sort((a,b) => a.path.localeCompare(b.path)));
    if (observed.headSha !== input.parentSha || actual !== expected) throw new Error("DAB_GIT_WORKSPACE_COMMIT_STATE_DRIFT");

    await this.runner.run(["add", "--", ...input.files.map((file) => file.path)], { cwd: this.config.workspaceRoot });
    await this.runner.run(["-c", "user.name=Apollos", "-c", "user.email=apollos@ai-edge.invalid", "commit", "--no-gpg-sign", "-m", `DAB authorized change ${input.idempotencyKey.slice(-12)}`], { cwd: this.config.workspaceRoot });
    const commitSha = await this.runner.run(["rev-parse", "HEAD"], { cwd: this.config.workspaceRoot });
    const parentSha = await this.runner.run(["rev-parse", "HEAD^"], { cwd: this.config.workspaceRoot });
    const treeSha = await this.runner.run(["rev-parse", "HEAD^{tree}"], { cwd: this.config.workspaceRoot });
    if (parentSha !== input.parentSha) throw new Error("DAB_GIT_WORKSPACE_COMMIT_PARENT_MISMATCH");
    return { commitSha, treeSha, parentSha, branchName: input.branchName };
  }
}
