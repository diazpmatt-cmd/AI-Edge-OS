export const DAB_GIT_ALLOWED_REPOSITORY_ID = "1293944511" as const;
export const DAB_GIT_ALLOWED_REPOSITORY = "diazpmatt-cmd/AI-Edge-OS" as const;

export type DabGitWorkerReadinessCode =
  | "DAB_GIT_WORKER_READY"
  | "DAB_GIT_WORKER_DISABLED"
  | "DAB_GIT_WORKER_KILL_SWITCH"
  | "DAB_GIT_WORKER_CREDENTIAL_MISSING"
  | "DAB_GIT_WORKER_REPOSITORY_MISMATCH";

export type DabGitWorkerConfig = Readonly<{
  enabled: boolean;
  killSwitch: boolean;
  runtimeId: string;
  repositoryId: typeof DAB_GIT_ALLOWED_REPOSITORY_ID;
  repository: typeof DAB_GIT_ALLOWED_REPOSITORY;
  workspaceRoot: string;
  credentialPresent: boolean;
  credential: string | null;
  readinessCode: DabGitWorkerReadinessCode;
}>;

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  return value.trim().toLowerCase() === "true";
}

export function readDabGitWorkerConfig(env: NodeJS.ProcessEnv): DabGitWorkerConfig {
  const enabled = flag(env.DAB_GIT_WORKER_ENABLED, false);
  const killSwitch = flag(env.DAB_GIT_WORKER_KILL_SWITCH, true);
  const runtimeId = env.DAB_GIT_WORKER_RUNTIME_ID?.trim() || "dab-git-worker";
  const repositoryId = (env.DAB_GIT_REPOSITORY_ID?.trim() || DAB_GIT_ALLOWED_REPOSITORY_ID) as typeof DAB_GIT_ALLOWED_REPOSITORY_ID;
  const repository = (env.DAB_GIT_REPOSITORY?.trim() || DAB_GIT_ALLOWED_REPOSITORY) as typeof DAB_GIT_ALLOWED_REPOSITORY;
  const workspaceRoot = env.DAB_GIT_WORKSPACE_ROOT?.trim() || "/tmp/dab-git-workspace";
  const credential = env.DAB_GIT_GITHUB_TOKEN?.trim() || null;
  const credentialPresent = Boolean(credential);

  let readinessCode: DabGitWorkerReadinessCode = "DAB_GIT_WORKER_READY";
  if (repositoryId !== DAB_GIT_ALLOWED_REPOSITORY_ID || repository !== DAB_GIT_ALLOWED_REPOSITORY) readinessCode = "DAB_GIT_WORKER_REPOSITORY_MISMATCH";
  else if (!enabled) readinessCode = "DAB_GIT_WORKER_DISABLED";
  else if (killSwitch) readinessCode = "DAB_GIT_WORKER_KILL_SWITCH";
  else if (!credentialPresent) readinessCode = "DAB_GIT_WORKER_CREDENTIAL_MISSING";

  return Object.freeze({
    enabled,
    killSwitch,
    runtimeId,
    repositoryId: DAB_GIT_ALLOWED_REPOSITORY_ID,
    repository: DAB_GIT_ALLOWED_REPOSITORY,
    workspaceRoot,
    credentialPresent,
    credential,
    readinessCode,
  });
}

export function sanitizeDabGitWorkerConfig(config: DabGitWorkerConfig) {
  return Object.freeze({
    enabled: config.enabled,
    killSwitch: config.killSwitch,
    runtimeId: config.runtimeId,
    repositoryId: config.repositoryId,
    repository: config.repository,
    workspaceRoot: config.workspaceRoot,
    credentialPresent: config.credentialPresent,
    readinessCode: config.readinessCode,
  });
}
