import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getApollosRuntimeReadiness } from "./apollos-runtime-readiness.js";

const originalEnv = { ...process.env };

describe("getApollosRuntimeReadiness", () => {
  beforeEach(() => {
    process.env.APOLLOS_ADMIN_USER_IDS = "clerk-admin";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("fails closed for a non-admin caller", () => {
    expect(() => getApollosRuntimeReadiness("not-admin", {}))
      .toThrow("APOLLOS_MCP_RUNTIME_READINESS_ADMIN_REQUIRED");
  });

  it("reports configured production providers without returning any secret values", () => {
    const env = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://secret-db-value",
      CLERK_SECRET_KEY: "sk_live_secret",
      CLERK_PUBLISHABLE_KEY: "pk_live_public",
      APOLLOS_ADMIN_USER_IDS: "clerk-admin",
      APOLLOS_MCP_RESOURCE_URL: "https://tunnel.example/mcp",
      APOLLOS_COOLIFY_BASE_URL: "https://coolify.example",
      APOLLOS_COOLIFY_READ_TOKEN: "coolify-secret",
      HETZNER_API_TOKEN: "hetzner-secret",
    } as NodeJS.ProcessEnv;

    const result = getApollosRuntimeReadiness("clerk-admin", env);

    expect(result).toMatchObject({
      readyForAuthenticatedMcp: true,
      configuredProviders: 7,
      totalProviders: 7,
      humanSetupQueue: [],
      safety: {
        secretValuesReturned: false,
        credentialsMutated: false,
        providerCallsMade: false,
      },
    });
    expect(result.providers.every((item) => item.configured)).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("secret-db-value");
    expect(serialized).not.toContain("sk_live_secret");
    expect(serialized).not.toContain("coolify-secret");
    expect(serialized).not.toContain("hetzner-secret");
  });

  it("returns the exact secret-free human setup queue for missing providers", () => {
    const env = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://configured",
      CLERK_SECRET_KEY: "configured",
      CLERK_PUBLISHABLE_KEY: "configured",
      APOLLOS_ADMIN_USER_IDS: "clerk-admin",
      APOLLOS_MCP_RESOURCE_URL: "https://tunnel.example/mcp",
    } as NodeJS.ProcessEnv;

    const result = getApollosRuntimeReadiness("clerk-admin", env);

    expect(result.readyForAuthenticatedMcp).toBe(true);
    expect(result.providers.find((item) => item.key === "github")?.configured).toBe(true);
    expect(result.providers.find((item) => item.key === "coolify")?.configured).toBe(false);
    expect(result.providers.find((item) => item.key === "hetzner")?.configured).toBe(false);
    expect(result.humanSetupQueue).toEqual([
      expect.stringContaining("APOLLOS_COOLIFY_BASE_URL"),
      expect.stringContaining("HETZNER_API_TOKEN"),
    ]);
  });

  it("keeps OAuth resource readiness separate from provider observability", () => {
    const env = {
      NODE_ENV: "production",
      DATABASE_URL: "configured",
      CLERK_SECRET_KEY: "configured",
      APOLLOS_ADMIN_USER_IDS: "clerk-admin",
      APOLLOS_GITHUB_REPOSITORY: "diazpmatt-cmd/AI-Edge-OS",
    } as NodeJS.ProcessEnv;

    const result = getApollosRuntimeReadiness("clerk-admin", env);

    expect(result.readyForAuthenticatedMcp).toBe(false);
    expect(result.providers.find((item) => item.key === "mcp_resource")?.configured).toBe(false);
    expect(result.providers.find((item) => item.key === "authorization_server")?.configured).toBe(false);
    expect(result.humanSetupQueue).toEqual(expect.arrayContaining([
      expect.stringContaining("APOLLOS_MCP_RESOURCE_URL"),
      expect.stringContaining("APOLLOS_MCP_AUTHORIZATION_SERVER"),
    ]));
  });
});
