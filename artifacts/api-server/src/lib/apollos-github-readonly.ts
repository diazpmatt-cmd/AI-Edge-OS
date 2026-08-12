import { isApollosAdminUser } from "./apollos-admin-access-policy.js";

const GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 512_000;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA = /^[a-f0-9]{40}$/i;

function requireAdmin(userId: string): void {
  if (!isApollosAdminUser(userId)) {
    throw new Error("APOLLOS_MCP_GITHUB_ADMIN_REQUIRED");
  }
}

function requireToken(): string {
  const token = process.env.APOLLOS_GITHUB_READ_TOKEN?.trim();
  if (!token) throw new Error("APOLLOS_MCP_GITHUB_NOT_CONFIGURED");
  return token;
}

function requireRepository(): string {
  const repository = process.env.APOLLOS_GITHUB_REPOSITORY?.trim();
  if (!repository || !REPOSITORY.test(repository)) {
    throw new Error("APOLLOS_MCP_GITHUB_REPOSITORY_NOT_CONFIGURED");
  }
  return repository;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function boundedString(value: unknown, max = 300): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

async function githubGet(path: string): Promise<unknown> {
  if (!path.startsWith("/") || path.includes("..") || path.includes("\\") || path.includes("://")) {
    throw new Error("APOLLOS_MCP_GITHUB_PATH_INVALID");
  }
  const token = requireToken();
  let response: globalThis.Response;
  try {
    response = await fetch(`${GITHUB_API_BASE}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "AI-Edge-OS-Apollos",
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch {
    throw new Error("APOLLOS_MCP_GITHUB_UNAVAILABLE");
  }

  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new Error("APOLLOS_MCP_GITHUB_RESPONSE_TOO_LARGE");
  }
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error("APOLLOS_MCP_GITHUB_RESPONSE_INVALID");
    }
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("APOLLOS_MCP_GITHUB_AUTH_FAILED");
    }
    if (response.status === 404) {
      throw new Error("APOLLOS_MCP_GITHUB_REPOSITORY_NOT_FOUND");
    }
    throw new Error("APOLLOS_MCP_GITHUB_UNAVAILABLE");
  }
  return body;
}

function sanitizeCommit(value: unknown): Readonly<Record<string, unknown>> {
  const item = record(value);
  const commit = record(item.commit);
  const author = record(commit.author);
  const committer = record(commit.committer);
  const sha = boundedString(item.sha, 40);
  return Object.freeze({
    sha: sha && SHA.test(sha) ? sha : null,
    message: boundedString(commit.message, 500),
    authorName: boundedString(author.name, 120),
    authoredAt: boundedString(author.date, 80),
    committedAt: boundedString(committer.date, 80),
  });
}

function sanitizePullRequest(value: unknown): Readonly<Record<string, unknown>> {
  const item = record(value);
  const head = record(item.head);
  const base = record(item.base);
  return Object.freeze({
    number: Number.isInteger(item.number) ? item.number : null,
    title: boundedString(item.title, 300),
    draft: item.draft === true,
    state: boundedString(item.state, 40),
    headRef: boundedString(head.ref, 200),
    headSha: boundedString(head.sha, 40),
    baseRef: boundedString(base.ref, 200),
    updatedAt: boundedString(item.updated_at, 80),
  });
}

function sanitizeStatus(value: unknown): Readonly<Record<string, unknown>> {
  const item = record(value);
  return Object.freeze({
    context: boundedString(item.context, 200),
    state: boundedString(item.state, 40),
    description: boundedString(item.description, 300),
  });
}

function sanitizeWorkflowRun(value: unknown): Readonly<Record<string, unknown>> {
  const item = record(value);
  return Object.freeze({
    id: Number.isInteger(item.id) ? item.id : null,
    name: boundedString(item.name, 200),
    event: boundedString(item.event, 80),
    status: boundedString(item.status, 80),
    conclusion: boundedString(item.conclusion, 80),
    headSha: boundedString(item.head_sha, 40),
    runNumber: Number.isInteger(item.run_number) ? item.run_number : null,
    runAttempt: Number.isInteger(item.run_attempt) ? item.run_attempt : null,
    createdAt: boundedString(item.created_at, 80),
    updatedAt: boundedString(item.updated_at, 80),
  });
}

export async function getApollosGitHubControlPlane(
  actorUserId: string,
): Promise<Readonly<Record<string, unknown>>> {
  requireAdmin(actorUserId);
  const repository = requireRepository();
  const repoPath = `/repos/${repository}`;
  const repositoryBody = record(await githubGet(repoPath));
  const defaultBranch = boundedString(repositoryBody.default_branch, 200);
  if (!defaultBranch) throw new Error("APOLLOS_MCP_GITHUB_REPOSITORY_INVALID");

  const commitsBody = await githubGet(`${repoPath}/commits?sha=${encodeURIComponent(defaultBranch)}&per_page=10`);
  const commits = array(commitsBody).map(sanitizeCommit);
  const headSha = typeof commits[0]?.sha === "string" && SHA.test(commits[0].sha as string)
    ? commits[0].sha as string
    : null;
  if (!headSha) throw new Error("APOLLOS_MCP_GITHUB_HEAD_INVALID");

  const [pullsBody, statusBody, runsBody] = await Promise.all([
    githubGet(`${repoPath}/pulls?state=open&per_page=25`),
    githubGet(`${repoPath}/commits/${headSha}/status`),
    githubGet(`${repoPath}/actions/runs?branch=${encodeURIComponent(defaultBranch)}&per_page=20`),
  ]);

  const statusPayload = record(statusBody);
  const runsPayload = record(runsBody);
  const pullRequests = array(pullsBody).map(sanitizePullRequest);
  const statuses = array(statusPayload.statuses).map(sanitizeStatus);
  const workflowRuns = array(runsPayload.workflow_runs).map(sanitizeWorkflowRun);

  return Object.freeze({
    repository: Object.freeze({
      fullName: boundedString(repositoryBody.full_name, 250) ?? repository,
      defaultBranch,
      private: repositoryBody.private === true,
      archived: repositoryBody.archived === true,
      disabled: repositoryBody.disabled === true,
      pushedAt: boundedString(repositoryBody.pushed_at, 80),
      updatedAt: boundedString(repositoryBody.updated_at, 80),
    }),
    head: commits[0],
    recentCommits: Object.freeze(commits),
    openPullRequests: Object.freeze(pullRequests),
    combinedStatus: Object.freeze({
      state: boundedString(statusPayload.state, 40),
      statuses: Object.freeze(statuses),
    }),
    workflowRuns: Object.freeze(workflowRuns),
    counts: Object.freeze({
      recentCommits: commits.length,
      openPullRequests: pullRequests.length,
      statuses: statuses.length,
      workflowRuns: workflowRuns.length,
    }),
  });
}
