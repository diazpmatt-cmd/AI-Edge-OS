import type { DabGitMergeAdapter } from "./dab-git-merge-handler.js";
import type { DabGitPushPrAdapter } from "./dab-git-push-pr-handler.js";
import type { DabTrustedCheck } from "./dab-ci-reconciliation.js";
import {
  DAB_GIT_ALLOWED_REPOSITORY,
  DAB_GIT_ALLOWED_REPOSITORY_ID,
  type DabGitWorkerConfig,
} from "./dab-git-worker-config.js";
import {
  assertDabGitBranchName,
  type DabGitCommandRunner,
} from "./dab-git-workspace-adapter.js";

const API_ROOT = `https://api.github.com/repos/${DAB_GIT_ALLOWED_REPOSITORY}`;
const REMOTE_URL = `https://github.com/${DAB_GIT_ALLOWED_REPOSITORY}.git`;
const SHA = /^[a-f0-9]{40}$/;
const TRUSTED_WORKFLOWS = Object.freeze(["Lead Intelligence CI", "Coolify stack validation"] as const);

export interface DabGitHubHttpClient {
  request<T>(input: {
    method: "GET" | "POST" | "PUT";
    path: string;
    body?: unknown;
  }): Promise<{ status: number; body: T }>;
}

export type DabGitHubTransportOptions = Readonly<{
  config: DabGitWorkerConfig;
  git: DabGitCommandRunner;
  http?: DabGitHubHttpClient;
}>;

function assertRepository(repositoryId: string): void {
  if (repositoryId !== DAB_GIT_ALLOWED_REPOSITORY_ID) throw new Error("DAB_GITHUB_TRANSPORT_REPOSITORY_MISMATCH");
}
function assertSha(value: string, code: string): void { if (!SHA.test(value)) throw new Error(code); }
function assertMain(branch: string): void { if (branch !== "main") throw new Error("DAB_GITHUB_TRANSPORT_BASE_BRANCH_INVALID"); }

function realHttp(config: DabGitWorkerConfig): DabGitHubHttpClient {
  return {
    async request<T>({ method, path, body }) {
      if (!config.credential) throw new Error("DAB_GIT_WORKER_CREDENTIAL_MISSING");
      if (!path.startsWith("/") || path.includes("..") || path.includes("\\") || path.includes("://")) throw new Error("DAB_GITHUB_TRANSPORT_PATH_INVALID");
      const response = await fetch(`${API_ROOT}${path}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${config.credential}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const text = await response.text();
      if (text.length > 262_144) throw new Error("DAB_GITHUB_TRANSPORT_RESPONSE_TOO_LARGE");
      let parsed: unknown = {};
      if (text) { try { parsed = JSON.parse(text); } catch { throw new Error("DAB_GITHUB_TRANSPORT_RESPONSE_INVALID"); } }
      return { status: response.status, body: parsed as T };
    },
  };
}

function normalizeWorkflowStatus(value: unknown): DabTrustedCheck["status"] {
  if (value === "queued" || value === "in_progress" || value === "completed") return value;
  throw new Error("DAB_GITHUB_TRANSPORT_CI_STATUS_INVALID");
}
function normalizeConclusion(value: unknown): DabTrustedCheck["conclusion"] {
  if (value == null || value === "success" || value === "failure" || value === "cancelled" || value === "timed_out" || value === "skipped") return value as DabTrustedCheck["conclusion"];
  return "failure";
}

export class DabGitHubTransportAdapter implements DabGitPushPrAdapter, DabGitMergeAdapter {
  private readonly config: DabGitWorkerConfig;
  private readonly git: DabGitCommandRunner;
  private readonly http: DabGitHubHttpClient;
  constructor(options: DabGitHubTransportOptions) { this.config = options.config; this.git = options.git; this.http = options.http ?? realHttp(options.config); }
  private assertReady(): void { if (this.config.readinessCode !== "DAB_GIT_WORKER_READY") throw new Error(this.config.readinessCode); }

  async observeRemoteBranch(input: { repositoryId: string; branchName: string }): Promise<{ headSha: string | null }> {
    this.assertReady(); assertRepository(input.repositoryId); assertDabGitBranchName(input.branchName);
    const ref = `refs/heads/${input.branchName}`;
    const output = await this.git.run(["ls-remote", REMOTE_URL, ref], { cwd: this.config.workspaceRoot });
    if (!output) return { headSha: null };
    const [headSha, observedRef] = output.split(/\s+/);
    if (!headSha || !SHA.test(headSha) || observedRef !== ref) throw new Error("DAB_GITHUB_TRANSPORT_REMOTE_OBSERVATION_INVALID");
    return { headSha };
  }

  async pushCommit(input: { repositoryId: string; branchName: string; commitSha: string; expectedRemoteSha: string | null; idempotencyKey: string }): Promise<{ branchName: string; headSha: string }> {
    this.assertReady(); assertRepository(input.repositoryId); assertDabGitBranchName(input.branchName); assertSha(input.commitSha, "DAB_GITHUB_TRANSPORT_COMMIT_SHA_INVALID");
    if (input.expectedRemoteSha !== null) assertSha(input.expectedRemoteSha, "DAB_GITHUB_TRANSPORT_REMOTE_SHA_INVALID");
    if (!input.idempotencyKey.startsWith("dab-git-push:")) throw new Error("DAB_GITHUB_TRANSPORT_IDEMPOTENCY_INVALID");
    const localHead = await this.git.run(["rev-parse", "HEAD"], { cwd: this.config.workspaceRoot });
    const branch = await this.git.run(["branch", "--show-current"], { cwd: this.config.workspaceRoot });
    if (localHead !== input.commitSha || branch !== input.branchName) throw new Error("DAB_GITHUB_TRANSPORT_LOCAL_STATE_DRIFT");
    const observed = await this.observeRemoteBranch({ repositoryId: input.repositoryId, branchName: input.branchName });
    if (observed.headSha !== input.expectedRemoteSha) throw new Error("DAB_GITHUB_TRANSPORT_REMOTE_SHA_MISMATCH");
    const lease = input.expectedRemoteSha === null ? `--force-with-lease=refs/heads/${input.branchName}:` : `--force-with-lease=refs/heads/${input.branchName}:${input.expectedRemoteSha}`;
    await this.git.run(["push", lease, "origin", `${input.commitSha}:refs/heads/${input.branchName}`], { cwd: this.config.workspaceRoot });
    const verified = await this.observeRemoteBranch({ repositoryId: input.repositoryId, branchName: input.branchName });
    if (verified.headSha !== input.commitSha) throw new Error("DAB_GITHUB_TRANSPORT_PUSH_VERIFICATION_FAILED");
    return { branchName: input.branchName, headSha: input.commitSha };
  }

  async observeBase(input: { repositoryId: string; baseBranch: string }): Promise<{ baseSha: string }> {
    this.assertReady(); assertRepository(input.repositoryId); assertMain(input.baseBranch);
    const response = await this.http.request<{ object?: { sha?: string } }>({ method: "GET", path: "/git/ref/heads/main" });
    if (response.status !== 200 || !response.body.object?.sha || !SHA.test(response.body.object.sha)) throw new Error("DAB_GITHUB_TRANSPORT_BASE_OBSERVATION_FAILED");
    return { baseSha: response.body.object.sha };
  }

  async createPullRequest(input: { repositoryId: string; headBranch: string; headSha: string; baseBranch: string; baseSha: string; idempotencyKey: string }) {
    this.assertReady(); assertRepository(input.repositoryId); assertDabGitBranchName(input.headBranch); assertMain(input.baseBranch); assertSha(input.headSha, "DAB_GITHUB_TRANSPORT_HEAD_SHA_INVALID"); assertSha(input.baseSha, "DAB_GITHUB_TRANSPORT_BASE_SHA_INVALID");
    if (!input.idempotencyKey.startsWith("dab-git-pr:")) throw new Error("DAB_GITHUB_TRANSPORT_IDEMPOTENCY_INVALID");
    const observedBase = await this.observeBase({ repositoryId: input.repositoryId, baseBranch: input.baseBranch });
    if (observedBase.baseSha !== input.baseSha) throw new Error("DAB_GITHUB_TRANSPORT_BASE_SHA_STALE");
    const response = await this.http.request<any>({ method: "POST", path: "/pulls", body: { title: `Apollos authorized change ${input.idempotencyKey.slice(-12)}`, head: input.headBranch, base: "main", body: "Bounded DAB engineering change. Scope, authorization, and receipts are recorded in the canonical Development Control ledger.", maintainer_can_modify: false } });
    if (response.status !== 201 || !Number.isInteger(response.body?.number) || response.body.number <= 0 || response.body?.head?.ref !== input.headBranch || response.body?.head?.sha !== input.headSha || response.body?.base?.ref !== "main" || response.body?.base?.sha !== input.baseSha) throw new Error("DAB_GITHUB_TRANSPORT_PR_VERIFICATION_FAILED");
    return { prNumber: response.body.number, headBranch: input.headBranch, headSha: input.headSha, baseBranch: "main", baseSha: input.baseSha };
  }

  async observePullRequest(input: { repositoryId: string; prNumber: number }): Promise<{ headSha: string; baseSha: string; mergeable: boolean }> {
    this.assertReady(); assertRepository(input.repositoryId);
    if (!Number.isInteger(input.prNumber) || input.prNumber <= 0) throw new Error("DAB_GITHUB_TRANSPORT_PR_NUMBER_INVALID");
    const response = await this.http.request<any>({ method: "GET", path: `/pulls/${input.prNumber}` });
    if (response.status !== 200 || !SHA.test(response.body?.head?.sha ?? "") || !SHA.test(response.body?.base?.sha ?? "") || response.body?.base?.ref !== "main") throw new Error("DAB_GITHUB_TRANSPORT_PR_OBSERVATION_FAILED");
    return { headSha: response.body.head.sha, baseSha: response.body.base.sha, mergeable: response.body.mergeable === true };
  }

  async observeTrustedCi(input: { repositoryId: string; prNumber: number; headSha: string; baseSha: string }): Promise<{ prNumber: number; headSha: string; baseSha: string; checks: readonly DabTrustedCheck[] }> {
    this.assertReady(); assertRepository(input.repositoryId); assertSha(input.headSha, "DAB_GITHUB_TRANSPORT_HEAD_SHA_INVALID"); assertSha(input.baseSha, "DAB_GITHUB_TRANSPORT_BASE_SHA_INVALID");
    const pr = await this.observePullRequest({ repositoryId: input.repositoryId, prNumber: input.prNumber });
    if (pr.headSha !== input.headSha || pr.baseSha !== input.baseSha) throw new Error("DAB_GITHUB_TRANSPORT_CI_PR_DRIFT");
    const response = await this.http.request<any>({ method: "GET", path: `/actions/runs?head_sha=${input.headSha}&event=pull_request&per_page=100` });
    if (response.status !== 200 || !Array.isArray(response.body?.workflow_runs) || response.body.workflow_runs.length > 100) throw new Error("DAB_GITHUB_TRANSPORT_CI_RESPONSE_INVALID");
    const checks: DabTrustedCheck[] = [];
    for (const name of TRUSTED_WORKFLOWS) {
      const candidates = response.body.workflow_runs.filter((run: any) => run?.name === name && run?.head_sha === input.headSha);
      candidates.sort((a: any, b: any) => Number(b?.run_attempt ?? 0) - Number(a?.run_attempt ?? 0));
      const run = candidates[0]; if (!run) continue;
      checks.push(Object.freeze({ name, status: normalizeWorkflowStatus(run.status), conclusion: normalizeConclusion(run.conclusion) }));
    }
    return { prNumber: input.prNumber, headSha: input.headSha, baseSha: input.baseSha, checks: Object.freeze(checks) };
  }

  async mergeExact(input: { repositoryId: string; prNumber: number; expectedHeadSha: string; mergeMethod: "squash" | "merge" | "rebase"; idempotencyKey: string }) {
    this.assertReady(); assertRepository(input.repositoryId); assertSha(input.expectedHeadSha, "DAB_GITHUB_TRANSPORT_HEAD_SHA_INVALID");
    if (!input.idempotencyKey.startsWith("dab-git-merge:")) throw new Error("DAB_GITHUB_TRANSPORT_IDEMPOTENCY_INVALID");
    const response = await this.http.request<any>({ method: "PUT", path: `/pulls/${input.prNumber}/merge`, body: { sha: input.expectedHeadSha, merge_method: input.mergeMethod } });
    if (response.status !== 200 || response.body?.merged !== true || !SHA.test(response.body?.sha ?? "")) throw new Error("DAB_GITHUB_TRANSPORT_MERGE_FAILED");
    return { merged: true, mergeSha: response.body.sha, headSha: input.expectedHeadSha };
  }
}
