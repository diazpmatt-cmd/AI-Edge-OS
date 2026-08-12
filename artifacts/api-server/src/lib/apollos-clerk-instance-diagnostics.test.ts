import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getApollosClerkInstanceDiagnostics } from "./apollos-clerk-readonly.js";

const originalEnv = { ...process.env };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("getApollosClerkInstanceDiagnostics", () => {
  beforeEach(() => {
    process.env.APOLLOS_ADMIN_USER_IDS = "clerk-admin";
    process.env.CLERK_SECRET_KEY = "clerk-secret";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("fails closed for a non-admin before contacting Clerk", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getApollosClerkInstanceDiagnostics("not-admin"))
      .rejects.toThrow("APOLLOS_MCP_CLERK_ADMIN_REQUIRED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns sanitized production instance, Organization settings, and actor memberships", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/instance")) {
        return json({
          id: "ins_secret-ish-id-not-needed",
          environment_type: "production",
          allowed_origins: ["https://aiedgesolutions.online"],
          private_metadata: { secret: "must-not-leak" },
        });
      }
      if (url.endsWith("/v1/instance/organization_settings")) {
        return json({
          enabled: true,
          force_organization_selection: true,
          domains_enabled: false,
          domains_enrollment_modes: [],
          creator_role: "org:admin",
          domains_default_role: "org:member",
          max_allowed_memberships: 20,
          max_allowed_permissions: 100,
          max_allowed_roles: 10,
          slug_disabled: false,
          admin_delete_enabled: true,
          internal_secret: "must-not-leak",
        });
      }
      if (url.includes("/v1/organizations?")) {
        return json({
          total_count: 1,
          data: [{
            id: "org_1",
            name: "AI Edge Solutions",
            slug: "ai-edge-solutions",
            members_count: 1,
            max_allowed_memberships: 20,
            private_metadata: { secret: "must-not-leak" },
          }],
        });
      }
      if (url.includes("/v1/users/clerk-admin/organization_memberships?")) {
        return json({
          total_count: 1,
          data: [{
            id: "orgmem_1",
            role: "org:admin",
            organization: { id: "org_1", name: "AI Edge Solutions", slug: "ai-edge-solutions" },
            created_at: 123,
            updated_at: 456,
            permissions: ["must-not-leak-sensitive-expansion"],
          }],
        });
      }
      return json({ message: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getApollosClerkInstanceDiagnostics("clerk-admin");

    expect(result).toMatchObject({
      instance: {
        environmentType: "production",
        allowedOrigins: ["https://aiedgesolutions.online"],
      },
      organizations: {
        enabled: true,
        membershipRequired: true,
        personalAccountsEnabled: false,
        totalOrganizations: 1,
        items: [{ id: "org_1", name: "AI Edge Solutions", membersCount: 1 }],
      },
      actorMemberships: {
        totalCount: 1,
        items: [{ role: "org:admin", organization: { id: "org_1" } }],
      },
      interpretation: {
        membershipPolicyKnown: true,
        actorHasOrganizationMembership: true,
        requiresDashboardConfirmation: false,
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("clerk-secret");
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("ins_secret-ish-id-not-needed");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("marks membership policy unknown when Clerk does not expose force organization selection", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/instance")) return json({ environment_type: "production", allowed_origins: [] });
      if (url.endsWith("/v1/instance/organization_settings")) return json({ enabled: true });
      if (url.includes("/v1/organizations?")) return json({ total_count: 0, data: [] });
      if (url.includes("/organization_memberships?")) return json({ total_count: 0, data: [] });
      return json({}, 404);
    }));

    const result = await getApollosClerkInstanceDiagnostics("clerk-admin");
    expect(result).toMatchObject({
      organizations: { enabled: true, membershipRequired: null, personalAccountsEnabled: null },
      actorMemberships: { totalCount: 0 },
      interpretation: {
        membershipPolicyKnown: false,
        actorHasOrganizationMembership: false,
        requiresDashboardConfirmation: true,
      },
    });
  });
});
