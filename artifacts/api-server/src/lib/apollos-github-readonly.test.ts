import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getApollosGitHubControlPlane } from "./apollos-github-readonly.js";

const originalEnv = { ...process.env };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
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

  it("fails closed when the read-only GitHub credential is not configured", async () => {
    delete process.env.APOLLOS_GITHUB_READ_TOKEN;
    vi.stubGlobal("fetch", vi.fn());
    await expect(getApollosGitHubControlPlane("clerk-admin"))
      .rejects.toThrow("APOLLOS_MCP_GITHUB_NOT_CONFIGURED");
  });

  it("returns a sanitized repository, PR, CI, and workflow snapshot without credentials", async () => {
    const headSha = "a".repeat(40);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/repos/diazpmatt-cmd/AI-Edge-OS")) {
        return json({
          full_name: "diazpmatt-cmd/AI-Edge-OS",
          default_branch: "main",
          private: true,
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
      return json({ message: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getApollosGitHubControlPlane("clerk-admin");

    expect(result).toMatchObject({
      repository: {
        fullName: "diazpmatt-cmd/AI-Edge-OS",
        defaultBranch: "main",
        private: true,
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
  });

  it("maps GitHub authorization failures to a bounded error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Bad credentials" }, 401)));
    await expect(getApollosGitHubControlPlane("clerk-admin"))
      .rejects.toThrow("APOLLOS_MCP_GITHUB_AUTH_FAILED");
  });
});
