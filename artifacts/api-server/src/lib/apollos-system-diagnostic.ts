import { isApollosAdminUser } from "./apollos-admin-access-policy.js";
import { getApollosGitHubControlPlane } from "./apollos-github-readonly.js";
import { getApollosCoolifyControlPlane } from "./apollos-coolify-readonly.js";
import { getApollosHetznerInfrastructure } from "./apollos-hetzner-readonly.js";
import { getApollosPostgresHealth } from "./apollos-postgres-readonly.js";
import {
  getApollosClerkOAuthSettings,
  getApollosClerkUser,
  listApollosClerkOAuthApplications,
} from "./apollos-clerk-readonly.js";

export type ApollosControlPlaneProvider = "github" | "coolify" | "hetzner" | "clerk" | "postgres";
export type ApollosControlPlaneState = "healthy" | "degraded" | "broken" | "unconfigured" | "unknown";
export type ApollosDiagnosticConfidence = "confirmed" | "probable" | "unknown";
export type ApollosActionAuthority = "apollos" | "operator" | "provider";

export interface ApollosControlPlaneObservation {
  readonly provider: ApollosControlPlaneProvider;
  readonly state: ApollosControlPlaneState;
  readonly confidence: ApollosDiagnosticConfidence;
  readonly summary: string;
  readonly evidence: readonly string[];
  readonly reasonCode: string | null;
}

export interface ApollosSystemIssue {
  readonly provider: ApollosControlPlaneProvider;
  readonly severity: "critical" | "high" | "medium" | "low";
  readonly code: string;
  readonly summary: string;
  readonly confidence: ApollosDiagnosticConfidence;
}

export interface ApollosSystemChange {
  readonly source: ApollosControlPlaneProvider;
  readonly kind: "commit" | "deployment" | "runtime_update";
  readonly summary: string;
  readonly observedAt: string | null;
}

export interface ApollosSystemNextAction {
  readonly action: string;
  readonly reason: string;
  readonly provider: ApollosControlPlaneProvider | null;
  readonly authority: ApollosActionAuthority;
  readonly canApollosExecuteNow: boolean;
  readonly confidence: ApollosDiagnosticConfidence;
}

export interface ApollosSystemDiagnostic {
  readonly overallState: "healthy" | "degraded" | "broken" | "incomplete";
  readonly generatedAt: string;
  readonly whatIsBroken: readonly ApollosSystemIssue[];
  readonly whatChanged: readonly ApollosSystemChange[];
  readonly highestRoiNextAction: ApollosSystemNextAction;
  readonly whatApollosVerified: readonly string[];
  readonly humanOnlyActions: readonly string[];
  readonly providers: readonly ApollosControlPlaneObservation[];
}

export interface ApollosSystemDiagnosticReaders {
  readonly github: (actorUserId: string) => Promise<unknown>;
  readonly coolify: (actorUserId: string) => Promise<unknown>;
  readonly hetzner: (actorUserId: string) => Promise<unknown>;
  readonly clerk: (actorUserId: string) => Promise<unknown>;
  readonly postgres: (actorUserId: string) => Promise<unknown>;
}

const defaultReaders: ApollosSystemDiagnosticReaders = Object.freeze({
  github: getApollosGitHubControlPlane,
  coolify: getApollosCoolifyControlPlane,
  hetzner: getApollosHetznerInfrastructure,
  clerk: async (actorUserId: string) => {
    const [oauthSettings, oauthApplications, user] = await Promise.all([
      getApollosClerkOAuthSettings(actorUserId),
      listApollosClerkOAuthApplications(actorUserId),
      getApollosClerkUser(actorUserId),
    ]);
    return Object.freeze({ oauthSettings, oauthApplications, user });
  },
  postgres: getApollosPostgresHealth,
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, max = 300): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "APOLLOS_MCP_CONTROL_PLANE_UNKNOWN";
  return /^APOLLOS_MCP_[A-Z0-9_]+$/.test(message)
    ? message
    : "APOLLOS_MCP_CONTROL_PLANE_UNKNOWN";
}

function observationFromFailure(
  provider: ApollosControlPlaneProvider,
  error: unknown,
): ApollosControlPlaneObservation {
  const reasonCode = errorCode(error);
  const unconfigured = reasonCode.endsWith("_NOT_CONFIGURED")
    || reasonCode.endsWith("_REPOSITORY_NOT_CONFIGURED");
  const broken = reasonCode.endsWith("_AUTH_FAILED")
    || reasonCode.endsWith("_UNAVAILABLE")
    || reasonCode.endsWith("_REPOSITORY_NOT_FOUND");
  const state: ApollosControlPlaneState = unconfigured
    ? "unconfigured"
    : broken
      ? "broken"
      : "unknown";
  return Object.freeze({
    provider,
    state,
    confidence: state === "unknown" ? "unknown" : "confirmed",
    summary: unconfigured
      ? `${provider} control-plane visibility is not configured for Apollos.`
      : broken
        ? `${provider} control-plane visibility failed its read-only verification.`
        : `${provider} control-plane visibility returned an unclassified failure.`,
    evidence: Object.freeze([reasonCode]),
    reasonCode,
  });
}

function githubObservation(snapshot: unknown): ApollosControlPlaneObservation {
  const root = record(snapshot);
  const repository = record(root.repository);
  const combined = record(root.combinedStatus);
  const counts = record(root.counts);
  const archived = repository.archived === true;
  const disabled = repository.disabled === true;
  const status = text(combined.state, 40) ?? "unknown";
  const state: ApollosControlPlaneState = archived || disabled || status === "failure" || status === "error"
    ? "broken"
    : status === "pending"
      ? "degraded"
      : status === "success"
        ? "healthy"
        : "unknown";
  const evidence = [
    `repository=${text(repository.fullName, 250) ?? "unknown"}`,
    `branch=${text(repository.defaultBranch, 120) ?? "unknown"}`,
    `combinedStatus=${status}`,
    `openPullRequests=${number(counts.openPullRequests) ?? 0}`,
    `workflowRuns=${number(counts.workflowRuns) ?? 0}`,
  ];
  return Object.freeze({
    provider: "github",
    state,
    confidence: state === "unknown" ? "unknown" : "confirmed",
    summary: `GitHub default-branch status is ${status}; ${number(counts.openPullRequests) ?? 0} open pull request(s) observed.`,
    evidence: Object.freeze(evidence),
    reasonCode: null,
  });
}

function coolifyObservation(snapshot: unknown): ApollosControlPlaneObservation {
  const root = record(snapshot);
  const applications = array(root.applications).map(record);
  const servers = array(root.servers).map(record);
  const databases = array(root.databases).map(record);
  const deployments = array(root.activeDeployments).map(record);
  const unusableServers = servers.filter((item) => {
    const settings = record(item.settings);
    return settings.isReachable !== true || settings.isUsable !== true;
  });
  const unhealthyApplications = applications.filter((item) => {
    const status = text(item.status, 100)?.toLowerCase() ?? "";
    return status.includes("unhealthy") || status.includes("exited") || status.includes("failed");
  });
  const unhealthyDatabases = databases.filter((item) => {
    const status = text(item.status, 100)?.toLowerCase() ?? "";
    return status.includes("unhealthy") || status.includes("exited") || status.includes("failed");
  });
  const state: ApollosControlPlaneState = servers.length > 0 && unusableServers.length === servers.length
    ? "broken"
    : unusableServers.length > 0 || unhealthyApplications.length > 0 || unhealthyDatabases.length > 0 || deployments.length > 0
      ? "degraded"
      : servers.length === 0 && applications.length === 0
        ? "unknown"
        : "healthy";
  return Object.freeze({
    provider: "coolify",
    state,
    confidence: state === "unknown" ? "unknown" : "confirmed",
    summary: `${applications.length} application(s), ${servers.length} server(s), ${databases.length} database(s), ${deployments.length} active deployment(s) observed.`,
    evidence: Object.freeze([
      `unusableServers=${unusableServers.length}`,
      `unhealthyApplications=${unhealthyApplications.length}`,
      `unhealthyDatabases=${unhealthyDatabases.length}`,
      `activeDeployments=${deployments.length}`,
    ]),
    reasonCode: null,
  });
}

function hetznerObservation(snapshot: unknown): ApollosControlPlaneObservation {
  const root = record(snapshot);
  const servers = array(root.servers).map(record);
  const primaryIps = array(root.primaryIps).map(record);
  const nonRunning = servers.filter((server) => text(server.status, 60)?.toLowerCase() !== "running");
  const blockedIps = primaryIps.filter((ip) => ip.blocked === true);
  const state: ApollosControlPlaneState = servers.length > 0 && nonRunning.length === servers.length
    ? "broken"
    : nonRunning.length > 0 || blockedIps.length > 0
      ? "degraded"
      : servers.length === 0
        ? "unknown"
        : "healthy";
  return Object.freeze({
    provider: "hetzner",
    state,
    confidence: state === "unknown" ? "unknown" : "confirmed",
    summary: `${servers.length} Hetzner server(s) observed; ${nonRunning.length} not running and ${blockedIps.length} blocked primary IP(s).`,
    evidence: Object.freeze([
      `servers=${servers.length}`,
      `nonRunningServers=${nonRunning.length}`,
      `blockedPrimaryIps=${blockedIps.length}`,
    ]),
    reasonCode: null,
  });
}

function clerkObservation(snapshot: unknown): ApollosControlPlaneObservation {
  const root = record(snapshot);
  const settings = record(root.oauthSettings);
  const apps = record(root.oauthApplications);
  const user = record(root.user);
  const userId = text(user.id, 200);
  const applicationCount = number(apps.totalCount) ?? array(apps.applications).length;
  const state: ApollosControlPlaneState = userId ? "healthy" : "unknown";
  const dcr = settings.dynamicClientRegistrationEnabled;
  return Object.freeze({
    provider: "clerk",
    state,
    confidence: userId ? "confirmed" : "unknown",
    summary: userId
      ? `Clerk Backend API resolved the authenticated admin and ${applicationCount} OAuth application(s).`
      : "Clerk Backend API responded, but the authenticated admin could not be confirmed from the sanitized snapshot.",
    evidence: Object.freeze([
      `actorResolved=${Boolean(userId)}`,
      `oauthApplications=${applicationCount}`,
      `dynamicClientRegistration=${typeof dcr === "boolean" ? String(dcr) : "unknown"}`,
      "scope=backend-control-plane-only",
    ]),
    reasonCode: null,
  });
}

function postgresObservation(snapshot: unknown): ApollosControlPlaneObservation {
  const root = record(snapshot);
  const database = record(root.database);
  const connections = record(root.connections);
  const applicationPool = record(connections.applicationPool);
  const workload = record(root.workload);
  const inRecovery = database.inRecovery === true;
  const waiting = number(applicationPool.waiting) ?? 0;
  const deadlocks = number(workload.deadlocks) ?? 0;
  const rollbackRatio = number(workload.rollbackRatioPercent);
  const cacheHitRatio = number(workload.cacheHitRatioPercent);
  const hasIdentity = Boolean(text(database.name, 120));

  const state: ApollosControlPlaneState = !hasIdentity
    ? "unknown"
    : inRecovery || waiting > 0 || deadlocks > 0 || (rollbackRatio !== null && rollbackRatio >= 10)
      ? "degraded"
      : "healthy";

  return Object.freeze({
    provider: "postgres",
    state,
    confidence: state === "unknown" ? "unknown" : "confirmed",
    summary: hasIdentity
      ? `PostgreSQL read-only health check succeeded; waiting pool clients=${waiting}, deadlocks=${deadlocks}, rollback ratio=${rollbackRatio ?? "unknown"}%.`
      : "PostgreSQL read-only health check returned incomplete sanitized database identity evidence.",
    evidence: Object.freeze([
      `databaseResolved=${hasIdentity}`,
      `inRecovery=${inRecovery}`,
      `poolWaiting=${waiting}`,
      `deadlocks=${deadlocks}`,
      `rollbackRatioPercent=${rollbackRatio ?? "unknown"}`,
      `cacheHitRatioPercent=${cacheHitRatio ?? "unknown"}`,
    ]),
    reasonCode: null,
  });
}

function issueForObservation(observation: ApollosControlPlaneObservation): ApollosSystemIssue | null {
  if (observation.state === "healthy") return null;
  const severity: ApollosSystemIssue["severity"] = observation.state === "broken"
    ? (observation.provider === "coolify" || observation.provider === "clerk" || observation.provider === "postgres" ? "critical" : "high")
    : observation.state === "degraded"
      ? "medium"
      : "low";
  return Object.freeze({
    provider: observation.provider,
    severity,
    code: observation.reasonCode ?? `APOLLOS_${observation.provider.toUpperCase()}_${observation.state.toUpperCase()}`,
    summary: observation.summary,
    confidence: observation.confidence,
  });
}

function githubChanges(snapshot: unknown): readonly ApollosSystemChange[] {
  const root = record(snapshot);
  return Object.freeze(array(root.recentCommits).slice(0, 3).map((value) => {
    const commit = record(value);
    const sha = text(commit.sha, 40);
    const message = text(commit.message, 180) ?? "Commit observed";
    return Object.freeze({
      source: "github" as const,
      kind: "commit" as const,
      summary: `${sha ? sha.slice(0, 8) : "unknown"}: ${message}`,
      observedAt: text(commit.committedAt, 80),
    });
  }));
}

function coolifyChanges(snapshot: unknown): readonly ApollosSystemChange[] {
  const root = record(snapshot);
  const deployments = array(root.activeDeployments).slice(0, 3).map((value) => {
    const deployment = record(value);
    const name = text(deployment.applicationName, 160) ?? "application";
    const status = text(deployment.status, 80) ?? "unknown";
    const commit = text(deployment.commit, 100);
    return Object.freeze({
      source: "coolify" as const,
      kind: "deployment" as const,
      summary: `${name} deployment ${status}${commit ? ` at ${commit.slice(0, 8)}` : ""}.`,
      observedAt: text(deployment.updatedAt, 80) ?? text(deployment.createdAt, 80),
    });
  });
  const updates = array(root.applications)
    .map(record)
    .filter((item) => Boolean(text(item.updatedAt, 80)))
    .sort((a, b) => Date.parse(text(b.updatedAt, 80) ?? "") - Date.parse(text(a.updatedAt, 80) ?? ""))
    .slice(0, 2)
    .map((application) => Object.freeze({
      source: "coolify" as const,
      kind: "runtime_update" as const,
      summary: `${text(application.name, 160) ?? "application"} reports ${text(application.status, 100) ?? "unknown status"}.`,
      observedAt: text(application.updatedAt, 80),
    }));
  return Object.freeze([...deployments, ...updates]);
}

function highestRoiAction(
  observations: readonly ApollosControlPlaneObservation[],
): ApollosSystemNextAction {
  const byProvider = new Map(observations.map((item) => [item.provider, item] as const));
  const coolify = byProvider.get("coolify");
  const postgres = byProvider.get("postgres");
  const clerk = byProvider.get("clerk");
  const github = byProvider.get("github");
  const hetzner = byProvider.get("hetzner");

  if (coolify?.state === "broken") {
    return Object.freeze({ action: "Restore the production runtime or host path before feature work.", reason: "Production availability protects every client-facing and revenue workflow.", provider: "coolify", authority: "operator", canApollosExecuteNow: false, confidence: coolify.confidence });
  }
  if (postgres?.state === "broken") {
    return Object.freeze({ action: "Restore the production PostgreSQL connection path before feature work or client automation.", reason: "Database availability protects authentication state, client configuration, durable receipts, and revenue workflows.", provider: "postgres", authority: "operator", canApollosExecuteNow: false, confidence: postgres.confidence });
  }
  if (clerk?.state === "broken") {
    return Object.freeze({ action: "Restore Clerk control-plane authorization and user access.", reason: "Authentication failure blocks operator access and the Secure MCP user boundary.", provider: "clerk", authority: "operator", canApollosExecuteNow: false, confidence: clerk.confidence });
  }
  if (github?.state === "broken") {
    return Object.freeze({ action: "Repair the failing default-branch CI or repository control-plane path before another deployment.", reason: "A broken source/CI path increases deployment risk and slows every engineering change.", provider: "github", authority: "apollos", canApollosExecuteNow: false, confidence: github.confidence });
  }
  if (hetzner?.state === "broken") {
    return Object.freeze({ action: "Restore the Hetzner server or network path before application-level troubleshooting.", reason: "Infrastructure failure makes higher-layer repairs ineffective.", provider: "hetzner", authority: "operator", canApollosExecuteNow: false, confidence: hetzner.confidence });
  }

  const degraded = observations.find((item) => item.state === "degraded");
  if (degraded) {
    return Object.freeze({ action: `Investigate the confirmed ${degraded.provider} degradation and verify the affected component before changing configuration.`, reason: "The fastest safe return is to resolve an observed degradation before adding new moving parts.", provider: degraded.provider, authority: "apollos", canApollosExecuteNow: false, confidence: degraded.confidence });
  }

  const unconfigured = observations.find((item) => item.state === "unconfigured");
  if (unconfigured) {
    return Object.freeze({ action: `Configure Apollos read-only ${unconfigured.provider} visibility without exposing secrets through MCP.`, reason: "Closing this observability gap increases autonomous diagnosis and reduces human troubleshooting work.", provider: unconfigured.provider, authority: "operator", canApollosExecuteNow: false, confidence: "confirmed" });
  }

  if (observations.every((item) => item.state === "healthy")) {
    return Object.freeze({ action: "Advance to the next unresolved production blocker, then run the Bed Bugs & Beyond Full Utilization Mission.", reason: "The control plane is verified, so the highest return comes from unblocking production access and client utilization rather than more infrastructure inspection.", provider: null, authority: "apollos", canApollosExecuteNow: false, confidence: "confirmed" });
  }

  return Object.freeze({ action: "Collect missing control-plane evidence before attempting a repair.", reason: "One or more providers remain unknown; guessing would create avoidable risk.", provider: null, authority: "apollos", canApollosExecuteNow: true, confidence: "unknown" });
}

export async function getApollosSystemDiagnostic(
  actorUserId: string,
  readers: ApollosSystemDiagnosticReaders = defaultReaders,
): Promise<ApollosSystemDiagnostic> {
  if (!isApollosAdminUser(actorUserId)) {
    throw new Error("APOLLOS_MCP_SYSTEM_DIAGNOSTIC_ADMIN_REQUIRED");
  }

  const providerNames: readonly ApollosControlPlaneProvider[] = ["github", "coolify", "hetzner", "clerk", "postgres"];
  const results = await Promise.allSettled(providerNames.map((provider) => readers[provider](actorUserId)));
  const snapshots = new Map<ApollosControlPlaneProvider, unknown>();
  const observations = results.map((result, index) => {
    const provider = providerNames[index]!;
    if (result.status === "rejected") return observationFromFailure(provider, result.reason);
    snapshots.set(provider, result.value);
    if (provider === "github") return githubObservation(result.value);
    if (provider === "coolify") return coolifyObservation(result.value);
    if (provider === "hetzner") return hetznerObservation(result.value);
    if (provider === "clerk") return clerkObservation(result.value);
    return postgresObservation(result.value);
  });

  const issues = observations.map(issueForObservation).filter((item): item is ApollosSystemIssue => item !== null);
  const changes: ApollosSystemChange[] = [];
  if (snapshots.has("github")) changes.push(...githubChanges(snapshots.get("github")));
  if (snapshots.has("coolify")) changes.push(...coolifyChanges(snapshots.get("coolify")));
  changes.sort((a, b) => Date.parse(b.observedAt ?? "") - Date.parse(a.observedAt ?? ""));

  const overallState: ApollosSystemDiagnostic["overallState"] = observations.some((item) => item.state === "broken")
    ? "broken"
    : observations.some((item) => item.state === "degraded")
      ? "degraded"
      : observations.some((item) => item.state === "unconfigured" || item.state === "unknown")
        ? "incomplete"
        : "healthy";

  const verified = observations
    .filter((item) => item.state === "healthy" || item.state === "degraded" || item.state === "broken")
    .map((item) => `${item.provider}: ${item.summary}`);
  const humanOnlyActions = observations
    .filter((item) => item.state === "unconfigured")
    .map((item) => `Configure the ${item.provider} read-only runtime settings outside MCP; do not paste secret values into chat or source control.`);

  return Object.freeze({
    overallState,
    generatedAt: new Date().toISOString(),
    whatIsBroken: Object.freeze(issues),
    whatChanged: Object.freeze(changes.slice(0, 8)),
    highestRoiNextAction: highestRoiAction(observations),
    whatApollosVerified: Object.freeze(verified),
    humanOnlyActions: Object.freeze(humanOnlyActions),
    providers: Object.freeze(observations),
  });
}
