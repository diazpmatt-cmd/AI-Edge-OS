import { isApollosAdminUser } from "./apollos-admin-access-policy.js";

export interface ApollosRuntimeReadinessItem {
  readonly key: string;
  readonly configured: boolean;
  readonly requiredFor: string;
  readonly humanAction: string | null;
}

export interface ApollosRuntimeReadiness {
  readonly readyForAuthenticatedMcp: boolean;
  readonly configuredProviders: number;
  readonly totalProviders: number;
  readonly providers: readonly ApollosRuntimeReadinessItem[];
  readonly humanSetupQueue: readonly string[];
  readonly safety: Readonly<{
    secretValuesReturned: false;
    credentialsMutated: false;
    providerCallsMade: false;
  }>;
}

function present(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function requireAdmin(userId: string): void {
  if (!isApollosAdminUser(userId)) {
    throw new Error("APOLLOS_MCP_RUNTIME_READINESS_ADMIN_REQUIRED");
  }
}

export function getApollosRuntimeReadiness(
  actorUserId: string,
  env: NodeJS.ProcessEnv = process.env,
): ApollosRuntimeReadiness {
  requireAdmin(actorUserId);

  const githubRepositoryConfigured = present(env.APOLLOS_GITHUB_REPOSITORY);
  const coolifyConfigured = present(env.APOLLOS_COOLIFY_BASE_URL)
    && present(env.APOLLOS_COOLIFY_READ_TOKEN);
  const hetznerConfigured = present(env.HETZNER_API_TOKEN);
  const clerkConfigured = present(env.CLERK_SECRET_KEY)
    && present(env.APOLLOS_ADMIN_USER_IDS);
  const postgresConfigured = present(env.DATABASE_URL);
  const mcpResourceConfigured = present(env.APOLLOS_MCP_RESOURCE_URL);
  const authorizationServerConfigured = present(env.APOLLOS_MCP_AUTHORIZATION_SERVER)
    || present(env.CLERK_PUBLISHABLE_KEY);

  const providers: readonly ApollosRuntimeReadinessItem[] = Object.freeze([
    Object.freeze({
      key: "github",
      configured: githubRepositoryConfigured,
      requiredFor: "repository, commit, pull request, CI, and workflow visibility",
      humanAction: githubRepositoryConfigured
        ? null
        : "Set APOLLOS_GITHUB_REPOSITORY to the canonical owner/repository name. No token is required for the public AI Edge OS repository.",
    }),
    Object.freeze({
      key: "coolify",
      configured: coolifyConfigured,
      requiredFor: "application, server, database, and deployment visibility",
      humanAction: coolifyConfigured
        ? null
        : "Configure APOLLOS_COOLIFY_BASE_URL and a dedicated read-only APOLLOS_COOLIFY_READ_TOKEN in the production runtime.",
    }),
    Object.freeze({
      key: "hetzner",
      configured: hetznerConfigured,
      requiredFor: "server, public IP, primary IP, and firewall visibility",
      humanAction: hetznerConfigured
        ? null
        : "Configure HETZNER_API_TOKEN in the production runtime with only the permissions required by the read-only infrastructure adapter.",
    }),
    Object.freeze({
      key: "clerk",
      configured: clerkConfigured,
      requiredFor: "OAuth application, user, production instance, and Organization diagnostics",
      humanAction: clerkConfigured
        ? null
        : "Ensure CLERK_SECRET_KEY and APOLLOS_ADMIN_USER_IDS are present in the production API runtime.",
    }),
    Object.freeze({
      key: "postgres",
      configured: postgresConfigured,
      requiredFor: "read-only operational database and connection-pool health",
      humanAction: postgresConfigured
        ? null
        : "Ensure DATABASE_URL is present in the production API runtime.",
    }),
    Object.freeze({
      key: "mcp_resource",
      configured: mcpResourceConfigured,
      requiredFor: "stable OAuth protected-resource identity through the Secure MCP Tunnel",
      humanAction: mcpResourceConfigured
        ? null
        : "Set APOLLOS_MCP_RESOURCE_URL to the canonical Secure MCP Tunnel resource URL.",
    }),
    Object.freeze({
      key: "authorization_server",
      configured: authorizationServerConfigured,
      requiredFor: "Clerk OAuth authorization-server discovery",
      humanAction: authorizationServerConfigured
        ? null
        : "Configure APOLLOS_MCP_AUTHORIZATION_SERVER or a valid Clerk publishable key from which it can be derived.",
    }),
  ]);

  const humanSetupQueue = Object.freeze(
    providers
      .filter((item) => !item.configured && item.humanAction)
      .map((item) => item.humanAction as string),
  );
  const configuredProviders = providers.filter((item) => item.configured).length;

  return Object.freeze({
    readyForAuthenticatedMcp:
      clerkConfigured && mcpResourceConfigured && authorizationServerConfigured,
    configuredProviders,
    totalProviders: providers.length,
    providers,
    humanSetupQueue,
    safety: Object.freeze({
      secretValuesReturned: false,
      credentialsMutated: false,
      providerCallsMade: false,
    }),
  });
}
