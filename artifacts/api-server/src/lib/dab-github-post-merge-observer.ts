import { createHash } from "node:crypto";
import { assertDabGitWorkspacePath } from "./dab-git-workspace-adapter.js";
import { DAB_GIT_ALLOWED_REPOSITORY, DAB_GIT_ALLOWED_REPOSITORY_ID, type DabGitWorkerConfig } from "./dab-git-worker-config.js";
import type { DabGitHubHttpClient } from "./dab-github-transport-adapter.js";
import type { DabGitPostMergeObserver } from "./dab-git-mission-runner.js";

const SHA = /^[a-f0-9]{40}$/;
const API_ROOT = `https://api.github.com/repos/${DAB_GIT_ALLOWED_REPOSITORY}`;

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function encodeContentPath(value: string): string { assertDabGitWorkspacePath(value); return value.split("/").map(encodeURIComponent).join("/"); }

function boundedHttp(config: DabGitWorkerConfig): DabGitHubHttpClient {
  return {
    async request<T>(input: { method: "GET" | "POST" | "PUT"; path: string; body?: unknown }) {
      if (!config.credential) throw new Error("DAB_GIT_WORKER_CREDENTIAL_MISSING");
      if (input.method !== "GET" || !input.path.startsWith("/") || input.path.includes("..") || input.path.includes("\\") || input.path.includes("://")) throw new Error("DAB_POST_MERGE_HTTP_REQUEST_INVALID");
      const response = await fetch(`${API_ROOT}${input.path}`, {
        method: "GET",
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${config.credential}`, "X-GitHub-Api-Version": "2022-11-28" },
        signal: AbortSignal.timeout(15_000),
      });
      const text = await response.text();
      if (text.length > 262_144) throw new Error("DAB_POST_MERGE_RESPONSE_TOO_LARGE");
      let body: unknown = {};
      if (text) { try { body = JSON.parse(text); } catch { throw new Error("DAB_POST_MERGE_RESPONSE_INVALID"); } }
      return { status: response.status, body: body as T };
    },
  };
}

export class DabGitHubPostMergeObserver implements DabGitPostMergeObserver {
  private readonly http: DabGitHubHttpClient;
  constructor(private readonly input: { config: DabGitWorkerConfig; http?: DabGitHubHttpClient }) { this.http = input.http ?? boundedHttp(input.config); }

  async observe(input: { repositoryId: string; mergeSha: string; files: readonly { path: string; sha256: string }[] }) {
    if (this.input.config.readinessCode !== "DAB_GIT_WORKER_READY") throw new Error(this.input.config.readinessCode);
    if (input.repositoryId !== DAB_GIT_ALLOWED_REPOSITORY_ID) throw new Error("DAB_POST_MERGE_REPOSITORY_MISMATCH");
    if (!SHA.test(input.mergeSha)) throw new Error("DAB_POST_MERGE_SHA_INVALID");
    if (input.files.length < 1 || input.files.length > 8) throw new Error("DAB_POST_MERGE_FILE_SET_INVALID");
    const unique = new Set(input.files.map((item) => item.path));
    if (unique.size !== input.files.length) throw new Error("DAB_POST_MERGE_FILE_SET_INVALID");

    const main = await this.http.request<{ object?: { sha?: string } }>({ method: "GET", path: "/git/ref/heads/main" });
    const observedDefaultHeadSha = main.body.object?.sha ?? "";
    if (main.status !== 200 || !SHA.test(observedDefaultHeadSha)) throw new Error("DAB_POST_MERGE_MAIN_OBSERVATION_FAILED");

    const commit = await this.http.request<{ sha?: string }>({ method: "GET", path: `/commits/${input.mergeSha}` });
    const mergeReachable = commit.status === 200 && commit.body.sha === input.mergeSha;

    const observedFiles: { path: string; sha256: string }[] = [];
    for (const expected of input.files) {
      assertDabGitWorkspacePath(expected.path);
      if (!/^[a-f0-9]{64}$/.test(expected.sha256)) throw new Error("DAB_POST_MERGE_FILE_DIGEST_INVALID");
      const file = await this.http.request<{ type?: string; encoding?: string; content?: string; size?: number }>({ method: "GET", path: `/contents/${encodeContentPath(expected.path)}?ref=${input.mergeSha}` });
      if (file.status !== 200 || file.body.type !== "file" || file.body.encoding !== "base64" || typeof file.body.content !== "string" || typeof file.body.size !== "number" || file.body.size > 24_000) throw new Error("DAB_POST_MERGE_FILE_OBSERVATION_FAILED");
      const decoded = Buffer.from(file.body.content.replace(/\s/g, ""), "base64").toString("utf8");
      observedFiles.push({ path: expected.path, sha256: digest(decoded) });
    }
    return Object.freeze({ defaultBranch: "main" as const, observedDefaultHeadSha, mergeReachable, observedFiles: Object.freeze(observedFiles) });
  }
}
