import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getApollosCoolifyControlPlane } from "./apollos-coolify-readonly.js";

const originalEnv = { ...process.env };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("getApollosCoolifyControlPlane", () => {
  beforeEach(() => {
    process.env.APOLLOS_ADMIN_USER_IDS = "clerk-admin";
    process.env.APOLLOS_COOLIFY_READ_TOKEN = "coolify-read-token";
    process.env.APOLLOS_COOLIFY_BASE_URL = "https://coolify.example.com";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("fails closed for a non-admin actor without contacting Coolify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getApollosCoolifyControlPlane("not-admin"))
      .rejects.toThrow("APOLLOS_MCP_COOLIFY_ADMIN_REQUIRED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires both a configured token and safe base URL", async () => {
    delete process.env.APOLLOS_COOLIFY_READ_TOKEN;
    vi.stubGlobal("fetch", vi.fn());
    await expect(getApollosCoolifyControlPlane("clerk-admin"))
      .rejects.toThrow("APOLLOS_MCP_COOLIFY_NOT_CONFIGURED");

    process.env.APOLLOS_COOLIFY_READ_TOKEN = "token";
    process.env.APOLLOS_COOLIFY_BASE_URL = "http://public.example.com";
    await expect(getApollosCoolifyControlPlane("clerk-admin"))
      .rejects.toThrow("APOLLOS_MCP_COOLIFY_BASE_URL_INVALID");
  });

  it("allows private HTTP for an internal control-plane hop", async () => {
    process.env.APOLLOS_COOLIFY_BASE_URL = "http://10.0.0.5:8000";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => json([]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getApollosCoolifyControlPlane("clerk-admin");
    expect(result).toMatchObject({ counts: { applications: 0, servers: 0, databases: 0, activeDeployments: 0 } });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("http://10.0.0.5:8000/api/v1/");
  });

  it("returns only whitelisted operational fields and never leaks Coolify secrets", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/applications")) {
        return json([{
          uuid: "app-1",
          name: "AI Edge OS",
          status: "running:healthy",
          fqdn: "https://aiedgesolutions.online",
          git_repository: "diazpmatt-cmd/AI-Edge-OS",
          git_branch: "main",
          git_commit_sha: "abc123",
          build_pack: "dockercompose",
          docker_compose_location: "/docker-compose.prebuilt.yml",
          health_check_enabled: true,
          health_check_path: "/api/healthz",
          restart_count: 0,
          created_at: "2026-08-08T00:00:00Z",
          updated_at: "2026-08-12T00:00:00Z",
          manual_webhook_secret_github: "must-not-leak",
          http_basic_auth_password: "must-not-leak",
          docker_compose_raw: "SECRET=must-not-leak",
        }]);
      }
      if (url.endsWith("/api/v1/servers")) {
        return json([{
          uuid: "server-1",
          name: "AI Edge Production",
          ip: "89.167.14.232",
          proxy_type: "traefik",
          unreachable_count: 0,
          settings: {
            is_reachable: true,
            is_usable: true,
            force_disabled: false,
            is_build_server: false,
            is_metrics_enabled: true,
            concurrent_builds: 2,
            deployment_queue_limit: 5,
            docker_cleanup_threshold: 80,
            sentinel_token: "must-not-leak",
            logdrain_newrelic_license_key: "must-not-leak",
          },
        }]);
      }
      if (url.endsWith("/api/v1/databases")) {
        return json([{
          uuid: "db-1",
          name: "postgres",
          status: "running:healthy",
          type: "postgresql",
          postgres_password: "must-not-leak",
        }]);
      }
      if (url.endsWith("/api/v1/deployments")) {
        return json([{
          deployment_uuid: "deploy-1",
          application_id: "app-1",
          application_name: "AI Edge OS",
          server_name: "AI Edge Production",
          commit: "abc123",
          commit_message: "Deploy control plane",
          status: "in_progress",
          restart_only: false,
          rollback: false,
          logs: "token=must-not-leak",
        }]);
      }
      return json({ message: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getApollosCoolifyControlPlane("clerk-admin");

    expect(result).toMatchObject({
      applications: [{ uuid: "app-1", status: "running:healthy", restartCount: 0 }],
      servers: [{ uuid: "server-1", settings: { isReachable: true, isUsable: true } }],
      databases: [{ uuid: "db-1", type: "postgresql" }],
      activeDeployments: [{ deploymentUuid: "deploy-1", status: "in_progress" }],
      counts: { applications: 1, servers: 1, databases: 1, activeDeployments: 1 },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("coolify-read-token");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("maps authorization failures to a bounded error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Unauthenticated" }, 401)));
    await expect(getApollosCoolifyControlPlane("clerk-admin"))
      .rejects.toThrow("APOLLOS_MCP_COOLIFY_AUTH_FAILED");
  });
});
