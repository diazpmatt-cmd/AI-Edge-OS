import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getApollosSystemDiagnostic,
  type ApollosSystemDiagnosticReaders,
} from "./apollos-system-diagnostic.js";

const originalEnv = { ...process.env };
const MAIN_SHA = "a".repeat(40);

function healthyReaders(
  overrides: Partial<ApollosSystemDiagnosticReaders> = {},
): ApollosSystemDiagnosticReaders {
  return {
    github: vi.fn(async () => ({
      repository: { fullName: "diazpmatt-cmd/AI-Edge-OS", defaultBranch: "main", archived: false, disabled: false },
      head: {
        sha: MAIN_SHA,
        message: "Merge control-plane visibility",
        committedAt: "2026-08-12T00:10:00Z",
      },
      combinedStatus: { state: "success" },
      counts: { openPullRequests: 1, workflowRuns: 3 },
      recentCommits: [{
        sha: MAIN_SHA,
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
    postgres: vi.fn(async () => ({
      database: { name: "aiedge", inRecovery: false },
      connections: { applicationPool: { total: 5, idle: 4, waiting: 0 } },
      workload: {
        deadlocks: 0,
        rollbackRatioPercent: 0.2,
        cacheHitRatioPercent: 99.8,
      },
    })),
    runtime: vi.fn(async () => ({
      commit: MAIN_SHA,
      branch: "main",
      resource: "production-resource",
      builtAt: "2026-08-12T00:05:00Z",
    })),
    ...overrides,
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
    expect(readers.postgres).not.toHaveBeenCalled();
    expect(readers.runtime).not.toHaveBeenCalled();
  });

  it("answers the four operator questions when the control plane and deployed image are healthy", async () => {
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
    expect(result.whatApollosVerified).toHaveLength(6);
    expect(result.whatApollosVerified).toEqual(expect.arrayContaining([
      expect.stringContaining("postgres:"),
      expect.stringContaining("runtime:"),
    ]));
    expect(result.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: "runtime",
        state: "healthy",
        confidence: "confirmed",
        evidence: expect.arrayContaining([
          `deployedCommit=${MAIN_SHA}`,
          `githubHead=${MAIN_SHA}`,
        ]),
      }),
    ]));
    expect(result.humanOnlyActions).toEqual([]);
    for (const reader of Object.values(readers)) {
      expect(reader).toHaveBeenCalledWith("clerk-admin");
    }
  });

  it("prioritizes a confirmed Coolify outage over lower-layer visibility gaps", async () => {
    const readers = healthyReaders({
      coolify: vi.fn(async () => ({
        applications: [{ name: "AI Edge OS", status: "exited:unhealthy" }],
        servers: [{ settings: { isReachable: false, isUsable: false } }],
        databases: [{ status: "running:healthy" }],
        activeDeployments: [],
      })),
      hetzner: vi.fn(async () => { throw new Error("APOLLOS_MCP_HETZNER_NOT_CONFIGURED"); }),
    });

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
      expect.stringContaining("hetzner read-only runtime settings"),
    ]);
  });

  it("prioritizes a confirmed Postgres outage without granting database repair authority", async () => {
    const readers = healthyReaders({
      postgres: vi.fn(async () => { throw new Error("APOLLOS_MCP_POSTGRES_UNAVAILABLE"); }),
    });

    const result = await getApollosSystemDiagnostic("clerk-admin", readers);

    expect(result.overallState).toBe("broken");
    expect(result.whatIsBroken).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: "postgres",
        severity: "critical",
        code: "APOLLOS_MCP_POSTGRES_UNAVAILABLE",
        confidence: "confirmed",
      }),
    ]));
    expect(result.highestRoiNextAction).toMatchObject({
      provider: "postgres",
      authority: "operator",
      canApollosExecuteNow: false,
      confidence: "confirmed",
    });
  });

  it("treats current application-pool waiting as Postgres degradation", async () => {
    const readers = healthyReaders({
      postgres: vi.fn(async () => ({
        database: { name: "aiedge", inRecovery: false },
        connections: { applicationPool: { total: 10, idle: 0, waiting: 3 } },
        workload: {
          deadlocks: 0,
          rollbackRatioPercent: 0.3,
          cacheHitRatioPercent: 99.9,
        },
      })),
    });

    const result = await getApollosSystemDiagnostic("clerk-admin", readers);

    expect(result.overallState).toBe("degraded");
    expect(result.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "postgres", state: "degraded", confidence: "confirmed" }),
    ]));
    expect(result.highestRoiNextAction.provider).toBe("postgres");
  });

  it("treats active Postgres recovery mode as degradation", async () => {
    const readers = healthyReaders({
      postgres: vi.fn(async () => ({
        database: { name: "aiedge", inRecovery: true },
        connections: { applicationPool: { total: 5, idle: 5, waiting: 0 } },
        workload: {
          deadlocks: 0,
          rollbackRatioPercent: 0.2,
          cacheHitRatioPercent: 99.8,
        },
      })),
    });

    const result = await getApollosSystemDiagnostic("clerk-admin", readers);

    expect(result.overallState).toBe("degraded");
    expect(result.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: "postgres",
        state: "degraded",
        evidence: expect.arrayContaining(["inRecovery=true"]),
      }),
    ]));
    expect(result.highestRoiNextAction.provider).toBe("postgres");
  });

  it("keeps cumulative Postgres counters as evidence instead of treating old history as a live outage", async () => {
    const readers = healthyReaders({
      postgres: vi.fn(async () => ({
        database: { name: "aiedge", inRecovery: false },
        connections: { applicationPool: { total: 5, idle: 5, waiting: 0 } },
        workload: {
          deadlocks: 7,
          rollbackRatioPercent: 12,
          cacheHitRatioPercent: 89,
        },
      })),
    });

    const result = await getApollosSystemDiagnostic("clerk-admin", readers);

    expect(result.overallState).toBe("healthy");
    expect(result.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: "postgres",
        state: "healthy",
        evidence: expect.arrayContaining([
          "deadlocks=7",
          "rollbackRatioPercent=12",
          "cacheHitRatioPercent=89",
        ]),
      }),
    ]));
  });

  it("detects a healthy-but-stale production image as deployment drift without granting deployment authority", async () => {
    const deployedSha = "b".repeat(40);
    const readers = healthyReaders({
      runtime: vi.fn(async () => ({
        commit: deployedSha,
        branch: "main",
        resource: "production-resource",
        builtAt: "unknown",
      })),
    });

    const result = await getApollosSystemDiagnostic("clerk-admin", readers);

    expect(result.overallState).toBe("degraded");
    expect(result.whatIsBroken).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: "runtime",
        severity: "medium",
        code: "APOLLOS_RUNTIME_DEPLOYMENT_DRIFT",
        confidence: "confirmed",
      }),
    ]));
    expect(result.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: "runtime",
        state: "degraded",
        evidence: expect.arrayContaining([
          `deployedCommit=${deployedSha}`,
          `githubHead=${MAIN_SHA}`,
        ]),
      }),
    ]));
    expect(result.highestRoiNextAction).toMatchObject({
      provider: "runtime",
      authority: "operator",
      canApollosExecuteNow: false,
      confidence: "confirmed",
    });
    expect(result.highestRoiNextAction.action).toContain("Coolify deployment runbook");
  });

  it("reports unknown deployment parity instead of guessing when the runtime SHA is missing", async () => {
    const readers = healthyReaders({
      runtime: vi.fn(async () => ({
        commit: "unknown",
        branch: "main",
        resource: "production-resource",
        builtAt: "unknown",
      })),
    });

    const result = await getApollosSystemDiagnostic("clerk-admin", readers);

    expect(result.overallState).toBe("incomplete");
    expect(result.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: "runtime",
        state: "unknown",
        confidence: "unknown",
        reasonCode: "APOLLOS_RUNTIME_COMMIT_UNKNOWN",
      }),
    ]));
    expect(result.highestRoiNextAction).toMatchObject({
      provider: null,
      authority: "apollos",
      canApollosExecuteNow: true,
      confidence: "unknown",
    });
  });

  it("reports provider authorization failures as confirmed broken evidence without leaking raw exceptions", async () => {
    const readers = healthyReaders({
      github: vi.fn(async () => { throw new Error("APOLLOS_MCP_GITHUB_AUTH_FAILED"); }),
      coolify: vi.fn(async () => { throw new Error("unexpected provider body with secret material"); }),
    });

    const result = await getApollosSystemDiagnostic("clerk-admin", readers);

    expect(result.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "github", state: "broken", reasonCode: "APOLLOS_MCP_GITHUB_AUTH_FAILED" }),
      expect.objectContaining({ provider: "coolify", state: "unknown", reasonCode: "APOLLOS_MCP_CONTROL_PLANE_UNKNOWN" }),
      expect.objectContaining({ provider: "runtime", state: "unknown", reasonCode: "APOLLOS_RUNTIME_GITHUB_HEAD_UNKNOWN" }),
    ]));
    expect(JSON.stringify(result)).not.toContain("secret material");
  });

  it("marks the report incomplete when evidence is unavailable rather than guessing", async () => {
    const readers = healthyReaders({
      github: vi.fn(async () => { throw new Error("APOLLOS_MCP_GITHUB_NOT_CONFIGURED"); }),
      coolify: vi.fn(async () => { throw new Error("APOLLOS_MCP_COOLIFY_NOT_CONFIGURED"); }),
      hetzner: vi.fn(async () => { throw new Error("APOLLOS_MCP_HETZNER_NOT_CONFIGURED"); }),
    });

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
