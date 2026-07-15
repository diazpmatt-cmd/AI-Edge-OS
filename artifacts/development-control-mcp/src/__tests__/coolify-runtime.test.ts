import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { REMOTE_BRIDGE_TOOL_NAMES } from "../tools";
import {
  createDab3dStandaloneServer,
  resolveStandaloneBindAddress,
} from "../server";

const servers: ReturnType<typeof createDab3dStandaloneServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

async function start(environment: Record<string, string | undefined>) {
  const server = createDab3dStandaloneServer({
    readEnvironment: () => environment,
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("DAB-3D standalone Coolify runtime", () => {
  it("binds only from HOST and PORT with closed defaults", () => {
    expect(resolveStandaloneBindAddress({})).toEqual({
      host: "0.0.0.0",
      port: 3000,
    });
    expect(
      resolveStandaloneBindAddress({ HOST: "127.0.0.1", PORT: "23997" }),
    ).toEqual({ host: "127.0.0.1", port: 23997 });
    expect(() => resolveStandaloneBindAddress({ PORT: "0" })).toThrow(
      "DAB3D_BIND_CONFIG_INVALID",
    );
    expect(() => resolveStandaloneBindAddress({ HOST: "host/path" })).toThrow(
      "DAB3D_BIND_CONFIG_INVALID",
    );
  });

  it("serves bounded liveness without activating MCP", async () => {
    const base = await start({
      DAB3C_ENABLED: "false",
      DAB3C_KILL_SWITCH: "true",
    });
    const response = await fetch(`${base}/healthz`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
    expect((await fetch(`${base}/not-a-route`)).status).toBe(404);
    expect(
      (await fetch(`${base}/.well-known/oauth-protected-resource`)).status,
    ).toBe(404);
  });

  it("keeps MCP unavailable while the existing kill switch is active", async () => {
    const base = await start({
      DAB3C_ENABLED: "true",
      DAB3C_KILL_SWITCH: "true",
    });
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "remote_bridge_unavailable" });
  });

  it("preserves exactly the five authorized read-only MCP tools", () => {
    expect(REMOTE_BRIDGE_TOOL_NAMES).toEqual([
      "get_task",
      "get_specification_revisions",
      "get_authorization_decisions",
      "get_verified_git_evidence",
      "get_task_progress",
    ]);
  });
});
