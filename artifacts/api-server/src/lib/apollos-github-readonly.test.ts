import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getApollosGitHubControlPlane } from "./apollos-github-readonly.js";

const originalEnv = { ...process.env };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function githubSnapshotFetch(headSha: string) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/repos/diazpmatt-cmd/AI-Edge-OS")) {
      return json({
        full_name: "diazpmatt-cmd/AI-Edge-OS",
        default_branch: "main",
        private: false,
        archived: false,
        disabled: false,
        pushed_at: "2026-08-11T23:00:00Z",
        updated_at: "2026-08-11T23:01:00Z",
      });
    }
    if (url.includes("/commits?sha=main")) {
      return json([{
        sha: headSha,
        commit: {
          message: "Bounded control-plane update",
          author: { name: "AI Edge", date: "2026-08-11T23:00:00Z" },
          committer: { date: "2026-08-11T23:00:01Z" },
        },
      }]);
    }
    if (url.includes("/pulls?state=open")) {
      return json([{
        number: 399,
        title: "Start Apollos operator roadmap",
        draft: false,
        state: "open",
        head: { ref: "feat/apollos-control-plane-v1", sha: "b".repeat(40) },
        base: { ref: "main" },
        updated_at: "2026-08-11T23:02:00Z",
      }]);
    }
    if (url.endsWith(`/commits/${headSha}/status`)) {
      return json({
        state: "success",
        statuses: [{ context: "ghcr/published", state: "success", description: "verified" }],
      });
    }
    if (url.includes("/actions/runs?branch=main")) {
      return json({
        workflow_runs: [{
          id: 123,
          name: "Coolify stack validation",
          event: "push",
          status: "completed",
          conclusion: "success",
          head_sha: headSha,
          run_number: 424,
          run_attempt: 1,
          created_at: "2026-08-11T23:03:00Z",
          updated_at: "2026-08-11T23:04:00Z",
        }],
      });
    }
    void init;
    return json({ message: "not found" }, 404);
  });
}

describe("getApollosGitHubControlPlane", () => {
  beforeEach(() => {
    process.env.APOLLOS_ADMIN_USER_IDS = "clerk-admin";
    process.env.APOLLOS_GITHUB_READ_TOKEN = "github-read-token";
    process.env.APOLLOS_GITHUB_REPOSITORY = "diazpmatt-cmd/AI-Edge-OS";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("fails closed for a non-admin actor without calling GitHub", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getApollosGitHubControlPlane("other-user"))
      .rejects.toThrow("APOLLOS_MCP_GITHUB_ADMIN_REQUIRED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the public AI Edge repository without a GitHub credential", async () => {
    delete process.env.APOLLOS_GITHUB_READ_TOKEN;
    const headSha = "a".repeat(40);
    const fetchMock = githubSnapshotFetch(headSha);
    vi.stubGlobal("fetch", fetchMock);

    const result = await getApollosGitHubControlPlane("clerk-admin");

    expect(result).toMatchObject({
      repository: { fullName: "diazpmatt-cmd/AI-Edge-OS", defaultBranch: "main", private: false },
      head: { sha: headSha },
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const call of fetchMock.mock.calls) {
      const init = call[1];
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    }
  });

  it("returns a sanitized repository, PR, CI, and workflow snapshot with optional authenticated reads", async () => {
    const headSha = "a".repeat(40);
    const fetchMock = githubSnapshotFetch(headSha);
    vi.stubGlobal("fetch", fetchMock);

    const result = await getApollosGitHubControlPlane("clerk-admin");

    expect(result).toMatchObject({
      repository: {
        fullName: "diazpmatt-cmd/AI-Edge-OS",
        defaultBranch: "main",
        private: false,
      },
      head: { sha: headSha, message: "Bounded control-plane update" },
      counts: {
        recentCommits: 1,
        openPullRequests: 1,
        statuses: 1,
        workflowRuns: 1,
      },
    });
    expect(JSON.stringify(result)).not.toContain("github-read-token");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const firstInit = fetchMock.mock.calls[0]?.[1];
    const firstHeaders = (firstInit?.headers ?? {}) as Record<string, string>;
    expect(firstHeaders.Authorization).toBe("Bearer github-read-token");
  });

  it("maps configured GitHub authorization failures to a bounded error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Bad credentials" }, 401)));
    await expect(getApollosGitHubControlPlane("clerk-admin"))
      .rejects.toThrow("APOLLOS_MCP_GITHUB_AUTH_FAILED");
  });

  it("maps unauthenticated public API rejection to unavailable rather than auth failed", async () => {
    delete process.env.APOLLOS_GITHUB_READ_TOKEN;
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "rate limited" }, 403)));
    await expect(getApollosGitHubControlPlane("clerk-admin"))
      .rejects.toThrow("APOLLOS_MCP_GITHUB_UNAVAILABLE");
  });
});
