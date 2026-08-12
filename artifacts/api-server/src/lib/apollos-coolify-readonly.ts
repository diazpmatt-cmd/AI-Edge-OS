import { isApollosAdminUser } from "./apollos-admin-access-policy.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_000_000;

function requireAdmin(userId: string): void {
  if (!isApollosAdminUser(userId)) {
    throw new Error("APOLLOS_MCP_COOLIFY_ADMIN_REQUIRED");
  }
}

function requireToken(): string {
  const token = process.env.APOLLOS_COOLIFY_READ_TOKEN?.trim();
  if (!token) throw new Error("APOLLOS_MCP_COOLIFY_NOT_CONFIGURED");
  return token;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31);
}

function requireApiBase(): string {
  const raw = process.env.APOLLOS_COOLIFY_BASE_URL?.trim();
  if (!raw) throw new Error("APOLLOS_MCP_COOLIFY_NOT_CONFIGURED");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("APOLLOS_MCP_COOLIFY_BASE_URL_INVALID");
  }
  const hostname = url.hostname.toLowerCase();
  const privateHttp = url.protocol === "http:" && (
    hostname === "localhost"
    || hostname.endsWith(".internal")
    || hostname.endsWith(".local")
    || isPrivateIpv4(hostname)
  );
  if (url.protocol !== "https:" && !privateHttp) {
    throw new Error("APOLLOS_MCP_COOLIFY_BASE_URL_INVALID");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("APOLLOS_MCP_COOLIFY_BASE_URL_INVALID");
  }
  const basePath = url.pathname.replace(/\/+$/, "");
  const path = basePath.endsWith("/api/v1") ? basePath : `${basePath}/api/v1`;
  return `${url.origin}${path}`;
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

async function coolifyGet(path: string): Promise<unknown> {
  if (!path.startsWith("/") || path.includes("..") || path.includes("\\") || path.includes("://")) {
    throw new Error("APOLLOS_MCP_COOLIFY_PATH_INVALID");
  }
  const token = requireToken();
  const apiBase = requireApiBase();
  let response: globalThis.Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "AI-Edge-OS-Apollos",
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch {
    throw new Error("APOLLOS_MCP_COOLIFY_UNAVAILABLE");
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new Error("APOLLOS_MCP_COOLIFY_RESPONSE_TOO_LARGE");
  }
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error("APOLLOS_MCP_COOLIFY_RESPONSE_INVALID");
    }
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("APOLLOS_MCP_COOLIFY_AUTH_FAILED");
    }
    throw new Error("APOLLOS_MCP_COOLIFY_UNAVAILABLE");
  }
  return body;
}

function sanitizeApplication(value: unknown): Readonly<Record<string, unknown>> {
  const app = record(value);
  return Object.freeze({
    uuid: boundedString(app.uuid, 100),
    name: boundedString(app.name, 250),
    status: boundedString(app.status, 100),
    fqdn: boundedString(app.fqdn, 500),
    gitRepository: boundedString(app.git_repository, 300),
    gitBranch: boundedString(app.git_branch, 200),
    gitCommitSha: boundedString(app.git_commit_sha, 100),
    buildPack: boundedString(app.build_pack, 100),
    composeLocation: boundedString(app.docker_compose_location, 300),
    healthCheckEnabled: app.health_check_enabled === true,
    healthCheckPath: boundedString(app.health_check_path, 300),
    restartCount: Number.isInteger(app.restart_count) ? app.restart_count : null,
    createdAt: boundedString(app.created_at, 80),
    updatedAt: boundedString(app.updated_at, 80),
  });
}

function sanitizeServer(value: unknown): Readonly<Record<string, unknown>> {
  const server = record(value);
  const settings = record(server.settings);
  return Object.freeze({
    uuid: boundedString(server.uuid, 100),
    name: boundedString(server.name, 250),
    ip: boundedString(server.ip, 100),
    proxyType: boundedString(server.proxy_type, 100),
    unreachableCount: Number.isInteger(server.unreachable_count) ? server.unreachable_count : null,
    highDiskUsageNotificationSent: server.high_disk_usage_notification_sent === true,
    settings: Object.freeze({
      isReachable: settings.is_reachable === true,
      isUsable: settings.is_usable === true,
      forceDisabled: settings.force_disabled === true,
      isBuildServer: settings.is_build_server === true,
      isMetricsEnabled: settings.is_metrics_enabled === true,
      concurrentBuilds: Number.isInteger(settings.concurrent_builds) ? settings.concurrent_builds : null,
      deploymentQueueLimit: Number.isInteger(settings.deployment_queue_limit) ? settings.deployment_queue_limit : null,
      dockerCleanupThreshold: Number.isInteger(settings.docker_cleanup_threshold) ? settings.docker_cleanup_threshold : null,
    }),
  });
}

function sanitizeDatabase(value: unknown): Readonly<Record<string, unknown>> {
  const database = record(value);
  return Object.freeze({
    uuid: boundedString(database.uuid, 100),
    name: boundedString(database.name, 250),
    status: boundedString(database.status, 100),
    type: boundedString(database.type ?? database.database_type, 100),
    description: boundedString(database.description, 300),
    createdAt: boundedString(database.created_at, 80),
    updatedAt: boundedString(database.updated_at, 80),
  });
}

function sanitizeDeployment(value: unknown): Readonly<Record<string, unknown>> {
  const deployment = record(value);
  return Object.freeze({
    deploymentUuid: boundedString(deployment.deployment_uuid, 100),
    applicationId: boundedString(deployment.application_id, 100),
    applicationName: boundedString(deployment.application_name, 250),
    serverName: boundedString(deployment.server_name, 250),
    commit: boundedString(deployment.commit, 100),
    commitMessage: boundedString(deployment.commit_message, 500),
    status: boundedString(deployment.status, 100),
    restartOnly: deployment.restart_only === true,
    rollback: deployment.rollback === true,
    createdAt: boundedString(deployment.created_at, 80),
    updatedAt: boundedString(deployment.updated_at, 80),
  });
}

export async function getApollosCoolifyControlPlane(
  actorUserId: string,
): Promise<Readonly<Record<string, unknown>>> {
  requireAdmin(actorUserId);
  const [applicationsBody, serversBody, databasesBody, deploymentsBody] = await Promise.all([
    coolifyGet("/applications"),
    coolifyGet("/servers"),
    coolifyGet("/databases"),
    coolifyGet("/deployments"),
  ]);

  const applications = array(applicationsBody).map(sanitizeApplication);
  const servers = array(serversBody).map(sanitizeServer);
  const databases = array(databasesBody).map(sanitizeDatabase);
  const deployments = array(deploymentsBody).map(sanitizeDeployment);

  return Object.freeze({
    applications: Object.freeze(applications),
    servers: Object.freeze(servers),
    databases: Object.freeze(databases),
    activeDeployments: Object.freeze(deployments),
    counts: Object.freeze({
      applications: applications.length,
      servers: servers.length,
      databases: databases.length,
      activeDeployments: deployments.length,
    }),
  });
}
