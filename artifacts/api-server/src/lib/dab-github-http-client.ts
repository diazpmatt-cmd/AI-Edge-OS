import { DAB_GIT_ALLOWED_REPOSITORY, type DabGitWorkerConfig } from "./dab-git-worker-config.js";
import type { DabGitHubHttpClient } from "./dab-github-transport-adapter.js";

const API_ROOT = `https://api.github.com/repos/${DAB_GIT_ALLOWED_REPOSITORY}`;

export function createDabGitHubHttpClient(config: DabGitWorkerConfig): DabGitHubHttpClient {
  return Object.freeze({
    async request<T>(input: { method: "GET" | "POST" | "PUT"; path: string; body?: unknown }): Promise<{ status: number; body: T }> {
      if (config.readinessCode !== "DAB_GIT_WORKER_READY" || !config.credential) throw new Error(config.readinessCode);
      if (!input.path.startsWith("/") || input.path.includes("..") || input.path.includes("\\") || input.path.includes("://")) throw new Error("DAB_GITHUB_HTTP_PATH_INVALID");
      const response = await fetch(`${API_ROOT}${input.path}`, {
        method: input.method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${config.credential}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal: AbortSignal.timeout(15_000),
      });
      const text = await response.text();
      if (text.length > 262_144) throw new Error("DAB_GITHUB_HTTP_RESPONSE_TOO_LARGE");
      let body: unknown = {};
      if (text) {
        try { body = JSON.parse(text); }
        catch { throw new Error("DAB_GITHUB_HTTP_RESPONSE_INVALID"); }
      }
      return { status: response.status, body: body as T };
    },
  });
}
