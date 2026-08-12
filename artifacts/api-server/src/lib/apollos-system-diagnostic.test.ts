import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getApollosSystemDiagnostic,
  type ApollosSystemDiagnosticReaders,
} from "./apollos-system-diagnostic.js";

const originalEnv = { ...process.env };

function healthyReaders(): ApollosSystemDiagnosticReaders {
  return {
    github: vi.fn(async () => ({
      repository: { fullName: "diazpmatt-cmd/AI-Edge-OS", defaultBranch: "main", archived: false, disabled: false },
      combinedStatus: { state: "success" },
      counts: { openPullRequests: 1, workflowRuns: 3 },
      recentCommits: [{
        sha: "a".repeat(40),
        message: "Merge control-plane visibility",
        committedAt: "2026-08-12T00:10:00Z",
      }],
    })),
    coolify: vi.fn(async () => ({
      applications: [{ name: "AI Edge OS", status: "running:healthy", updatedAt: "2026-08-12T00:11:00Z" }],
      servers: [{ settings: { isReachable: true, isUsable: true } }],
      databases: [{ status: "running:healthy" }],
      activeDeployments: [],
    })),
    hetzner: vi.fn(async () => ({
      servers: [{ status: "running" }],
      primaryIps: [{ blocked: false }],
    })),
    clerk: vi.fn(async () => ({
      oauthSettings: { dynamicClientRegistrationEnabled: true },
      oauthApplications: { totalCount: 1, applications: [{}] },
      user: { id: "clerk-admin" },
    })),
  };
}

describe("getApollosSystemDiagnostic", () => {
  beforeEach(() => {
    process.env.APOLLOS_ADMIN_USER_IDS = "clerk-admin";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("fails closed for a non-admin before invoking any provider", async () => {
    const readers = healthyReaders();
    await expect(getApollosSystemDiagnostic("not-admin", readers))
      .rejects.toThrow("APOLLOS_MCP_SYSTEM_DIAGNOSTIC_ADMIN_REQUIRED");
    expect(readers.github).not.toHaveBeenCalled();
    expect(readers.coolify).not.toHaveBeenCalled();
    expect(readers.hetzner).not.toHaveBeenCalled();
    expect(readers.clerk).not.toHaveBeenCalled();
  });

  it("answers the four operator questions when the control plane is healthy", async () => {
    const readers = healthyReaders();
    const result = await getApollosSystemDiagnostic("clerk-admin", readers);

    expect(result.overallState).toBe("healthy");
    expect(result.whatIsBroken).toEqual([]);
    expect(result.whatChanged[0]).toMatchObject({
      source: "coolify",
      kind: "runtime_update",
      observedAt: "2026-08-12T00:11:00Z",
    });
    expect(result.whatChanged).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "github", kind: "commit", summary: expect.stringContaining("Merge control-plane visibility") }),
    ]));
    expect(result.highestRoiNextAction).toMatchObject({
      provider: null,
      authority: "apollos",
      confidence: "confirmed",
    });
    expect(result.whatApollosVerified).toHaveLength(4);
    expect(result.humanOnlyActions).toEqual([]);
    for (const reader of Object.values(readers)) {
      expect(reader).toHaveBeenCalledWith("clerk-admin");
    }
  });

  it("prioritizes a confirmed Coolify outage over lower-layer visibility gaps", async () => {
    const readers = healthyReaders();
    readers.coolify = vi.fn(async () => ({
      applications: [{ name: "AI Edge OS", status: "exited:unhealthy" }],
      servers: [{ settings: { isReachable: false, isUsable: false } }],
      databases: [{ status: "running:healthy" }],
      activeDeployments: [],
    }));
    readers.hetzner = vi.fn(async () => { throw new Error("APOLLOS_MCP_HETZNER_NOT_CONFIGURED"); });

    const result = await getApollosSystemDiagnostic("clerk-admin", readers);

    expect(result.overallState).toBe("broken");
    expect(result.whatIsBroken).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "coolify", severity: "critical", confidence: "confirmed" }),
      expect.objectContaining({ provider: "hetzner", severity: "low", code: "APOLLOS_MCP_HETZNER_NOT_CONFIGURED" }),
    ]));
    expect(result.highestRoiNextAction).toMatchObject({
      provider: "coolify",
      authority: "operator",
      canApollosExecuteNow: false,
      confidence: "confirmed",
    });
    expect(result.humanOnlyActions).toEqual([
      expect.stringContaining("hetzner read-only runtime credential"),
    ]);
  });

  it("reports provider authorization failures as confirmed broken evidence without leaking raw exceptions", async () => {
    const readers = healthyReaders();
    readers.github = vi.fn(async () => { throw new Error("APOLLOS_MCP_GITHUB_AUTH_FAILED"); });
    readers.coolify = vi.fn(async () => { throw new Error("unexpected provider body with secret material"); });

    const result = await getApollosSystemDiagnostic("clerk-admin", readers);

    expect(result.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "github", state: "broken", reasonCode: "APOLLOS_MCP_GITHUB_AUTH_FAILED" }),
      expect.objectContaining({ provider: "coolify", state: "unknown", reasonCode: "APOLLOS_MCP_CONTROL_PLANE_UNKNOWN" }),
    ]));
    expect(JSON.stringify(result)).not.toContain("secret material");
  });

  it("marks the report incomplete when evidence is unavailable rather than guessing", async () => {
    const readers = healthyReaders();
    readers.github = vi.fn(async () => { throw new Error("APOLLOS_MCP_GITHUB_NOT_CONFIGURED"); });
    readers.coolify = vi.fn(async () => { throw new Error("APOLLOS_MCP_COOLIFY_NOT_CONFIGURED"); });
    readers.hetzner = vi.fn(async () => { throw new Error("APOLLOS_MCP_HETZNER_NOT_CONFIGURED"); });

    const result = await getApollosSystemDiagnostic("clerk-admin", readers);

    expect(result.overallState).toBe("incomplete");
    expect(result.highestRoiNextAction).toMatchObject({
      provider: "github",
      authority: "operator",
      canApollosExecuteNow: false,
    });
    expect(result.humanOnlyActions).toHaveLength(3);
  });
});
