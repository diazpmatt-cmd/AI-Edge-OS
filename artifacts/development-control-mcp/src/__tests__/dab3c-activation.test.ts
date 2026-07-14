import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryBridgeRateLimitRepository,
  InMemoryBridgeRuntimeRepository,
} from "@workspace/development-control-store";
import {
  createDab3cWebHandler,
  parseDab3cActivationConfig,
  type Dab3cEnvironment,
} from "../activation";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const publicKeyBase64 = Buffer.from(
  publicKey.export({ type: "spki", format: "pem" }).toString(),
).toString("base64");

function environment(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    DAB3C_ENABLED: "true",
    DAB3C_KILL_SWITCH: "false",
    DAB3C_CONTROL_DATABASE_URL: "postgresql://control.invalid/dab",
    DAB3C_RESOURCE_URL: "https://bridge.example.invalid/mcp",
    DAB3C_DOCUMENTATION_URL: "https://docs.example.invalid/dab3c",
    DAB3C_OAUTH_ISSUER: "https://identity.example.invalid/",
    DAB3C_OAUTH_AUTHORIZED_PARTY: "chatgpt-work",
    DAB3C_OAUTH_SUBJECT: "workload:chatgpt:development-control",
    DAB3C_OAUTH_KEY_ID: "fixture-key",
    DAB3C_OAUTH_PUBLIC_KEY_PEM_B64: publicKeyBase64,
    DAB3C_REVOCATION_GENERATION: "1",
    DAB3C_REPOSITORY_ID: "1000000001",
    DAB3C_MATTHEW_ACTOR_ID: "github-actor:256463127",
    ...overrides,
  };
}

function token(): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "fixture-key", typ: "JWT" }),
  ).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      iss: "https://identity.example.invalid/",
      sub: "workload:chatgpt:development-control",
      aud: "https://bridge.example.invalid/mcp",
      azp: "chatgpt-work",
      scope: "dab:read",
      jti: "dab3c-token",
      iat: Date.parse("2026-07-14T05:00:00.000Z") / 1_000,
      nbf: Date.parse("2026-07-14T05:00:00.000Z") / 1_000,
      exp: Date.parse("2026-07-14T05:10:00.000Z") / 1_000,
      rvg: 1,
    }),
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  return `${header}.${claims}.${signer.sign(privateKey).toString("base64url")}`;
}

function storeFactory() {
  return {
    store: {} as never,
    bridge: new InMemoryBridgeRuntimeRepository(),
    rateLimits: new InMemoryBridgeRateLimitRepository(),
    close: async () => undefined,
  };
}

describe("DAB-3C isolated bridge activation", () => {
  it("normalizes only the explicit isolated control-plane configuration", () => {
    const config = parseDab3cActivationConfig(environment());
    expect(config.resourceUrl).toBe("https://bridge.example.invalid/mcp");
    expect(config.auth.allowedAlgorithms).toEqual(["RS256"]);
    expect(config.auth.allowedAuthorizedParties).toEqual(["chatgpt-work"]);
    expect(config.expectedHumanAuthorityActorId).toBe(
      "github-actor:256463127",
    );
    expect(JSON.stringify(config)).not.toMatch(
      /private key|customer|tenant|ai-edge-os-ai-edge-solutions/i,
    );
  });

  it.each([
    ["disabled", { DAB3C_ENABLED: "false" }],
    ["kill switch", { DAB3C_KILL_SWITCH: "true" }],
    ["missing database", { DAB3C_CONTROL_DATABASE_URL: undefined }],
    ["generic database only", {
      DAB3C_CONTROL_DATABASE_URL: undefined,
      DATABASE_URL: "postgresql://customer.invalid/app",
    }],
    ["insecure resource", { DAB3C_RESOURCE_URL: "http://bridge.invalid/mcp" }],
    ["wrong resource path", { DAB3C_RESOURCE_URL: "https://bridge.invalid/api" }],
    ["private key", {
      DAB3C_OAUTH_PUBLIC_KEY_PEM_B64: Buffer.from(
        ["-----BEGIN", "PRIVATE KEY-----", "forbidden", "-----END PRIVATE KEY-----"].join("\n"),
      ).toString("base64"),
    }],
    ["non-numeric repository", { DAB3C_REPOSITORY_ID: "owner/repo" }],
  ])("fails closed before storage for %s", async (_name, changes) => {
    const createStoreRuntime = vi.fn(storeFactory);
    const handler = createDab3cWebHandler({
      readEnvironment: () => environment(changes),
      createStoreRuntime,
    });
    const response = await handler(
      new Request("https://bridge.example.invalid/mcp", { method: "POST" }),
    );
    expect(response.status).toBe(503);
    expect(createStoreRuntime).not.toHaveBeenCalled();
    expect(await response.text()).toBe(
      '{"error":"remote_bridge_unavailable"}',
    );
  });

  it("lazily composes once and serves protected-resource metadata", async () => {
    const createStoreRuntime = vi.fn(storeFactory);
    const handler = createDab3cWebHandler({
      readEnvironment: () => environment(),
      createStoreRuntime,
      clock: { now: () => "2026-07-14T05:05:00.000Z" },
    });
    expect(createStoreRuntime).not.toHaveBeenCalled();
    const request = new Request(
      "https://bridge.example.invalid/.well-known/oauth-protected-resource",
    );
    const first = await handler(request);
    const second = await handler(request);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      resource: "https://bridge.example.invalid/mcp",
      authorization_servers: ["https://identity.example.invalid/"],
      scopes_supported: ["dab:read"],
      resource_documentation: "https://docs.example.invalid/dab3c",
    });
    expect(second.status).toBe(200);
    expect(createStoreRuntime).toHaveBeenCalledTimes(1);
  });

  it("observes the kill switch after initialization and fails closed", async () => {
    const values = environment();
    const handler = createDab3cWebHandler({
      readEnvironment: () => values as Dab3cEnvironment,
      createStoreRuntime: storeFactory,
      clock: { now: () => "2026-07-14T05:05:00.000Z" },
    });
    await handler(
      new Request(
        "https://bridge.example.invalid/.well-known/oauth-protected-resource",
      ),
    );
    values.DAB3C_KILL_SWITCH = "true";
    const response = await handler(
      new Request("https://bridge.example.invalid/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "get_task", arguments: {} },
        }),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32000,
        message: "Request rejected",
        data: { reason: "BRIDGE_DISABLED" },
      },
    });
  });
});
