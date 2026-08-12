import { describe, expect, it, vi } from "vitest";
import {
  buildApollosSystemDiagnosis,
  getApollosSystemRepairProposal,
} from "./apollos-system-repair-proposal.js";
import type { ApollosSystemDiagnostic } from "./apollos-system-diagnostic.js";

function diagnostic(overrides: Partial<ApollosSystemDiagnostic> = {}): ApollosSystemDiagnostic {
  return {
    overallState: "healthy",
    generatedAt: "2026-08-12T00:40:00.000Z",
    whatIsBroken: [],
    whatChanged: [],
    highestRoiNextAction: {
      action: "Advance",
      reason: "Control plane verified",
      provider: null,
      authority: "apollos",
      canApollosExecuteNow: false,
      confidence: "confirmed",
    },
    whatApollosVerified: ["github: healthy"],
    humanOnlyActions: [],
    providers: [
      { provider: "github", state: "healthy", confidence: "confirmed", summary: "GitHub healthy.", evidence: ["combinedStatus=success"], reasonCode: null },
      { provider: "coolify", state: "healthy", confidence: "confirmed", summary: "Coolify healthy.", evidence: ["unusableServers=0"], reasonCode: null },
      { provider: "hetzner", state: "healthy", confidence: "confirmed", summary: "Hetzner healthy.", evidence: ["nonRunningServers=0"], reasonCode: null },
      { provider: "clerk", state: "healthy", confidence: "confirmed", summary: "Clerk control plane healthy.", evidence: ["actorResolved=true"], reasonCode: null },
      { provider: "postgres", state: "healthy", confidence: "confirmed", summary: "PostgreSQL healthy.", evidence: ["poolWaiting=0"], reasonCode: null },
    ],
    ...overrides,
  };
}

describe("Apollos system repair proposal", () => {
  it("returns not_required when the control plane is healthy", async () => {
    const snapshot = diagnostic();
    const reader = vi.fn(async () => snapshot);
    const proposal = await getApollosSystemRepairProposal("clerk-admin", reader);

    expect(reader).toHaveBeenCalledWith("clerk-admin");
    expect(proposal.diagnosis).toMatchObject({
      status: "healthy",
      rootCauseCode: "APOLLOS_NO_FAILURE_DETECTED",
      canApollosRepair: false,
    });
    expect(proposal.repairPlan).toMatchObject({
      status: "not_required",
      canApollosExecute: false,
      approvalRequired: false,
    });
  });

  it("reuses the existing provider-not-configured repair template for missing control-plane credentials", () => {
    const snapshot = diagnostic({
      overallState: "incomplete",
      whatIsBroken: [{
        provider: "hetzner",
        severity: "low",
        code: "APOLLOS_MCP_HETZNER_NOT_CONFIGURED",
        summary: "Hetzner visibility is not configured.",
        confidence: "confirmed",
      }],
      providers: [{
        provider: "hetzner",
        state: "unconfigured",
        confidence: "confirmed",
        summary: "Hetzner visibility is not configured.",
        evidence: ["APOLLOS_MCP_HETZNER_NOT_CONFIGURED"],
        reasonCode: "APOLLOS_MCP_HETZNER_NOT_CONFIGURED",
      }],
    });

    const diagnosis = buildApollosSystemDiagnosis(snapshot);
    expect(diagnosis).toMatchObject({
      rootCauseCode: "APOLLOS_ROOT_PROVIDER_NOT_CONFIGURED",
      repairAuthority: "operator",
      canApollosRepair: false,
      confidence: "confirmed",
    });
    const proposalReader = vi.fn(async () => snapshot);
    return getApollosSystemRepairProposal("clerk-admin", proposalReader).then((proposal) => {
      expect(proposal.repairPlan).toMatchObject({
        status: "manual_required",
        approvalRequired: true,
        repairAuthority: "operator",
      });
      expect(proposal.repairPlan.steps.map((step) => step.key)).toEqual([
        "inspect-provider-config",
        "correct-provider-config",
        "redeploy-provider-config",
        "retry-provider-checkpoint",
      ]);
    });
  });

  it("maps control-plane credential rejection into the existing authentication repair plan", async () => {
    const snapshot = diagnostic({
      overallState: "broken",
      whatIsBroken: [{
        provider: "github",
        severity: "high",
        code: "APOLLOS_MCP_GITHUB_AUTH_FAILED",
        summary: "GitHub rejected the read credential.",
        confidence: "confirmed",
      }],
      providers: [{
        provider: "github",
        state: "broken",
        confidence: "confirmed",
        summary: "GitHub rejected the read credential.",
        evidence: ["APOLLOS_MCP_GITHUB_AUTH_FAILED"],
        reasonCode: "APOLLOS_MCP_GITHUB_AUTH_FAILED",
      }],
    });

    const proposal = await getApollosSystemRepairProposal("clerk-admin", async () => snapshot);
    expect(proposal.diagnosis).toMatchObject({
      rootCauseCode: "APOLLOS_ROOT_AUTHENTICATION_FAILED",
      repairAuthority: "operator",
      canApollosRepair: false,
    });
    expect(proposal.repairPlan).toMatchObject({
      status: "manual_required",
      approvalRequired: true,
    });
  });

  it("keeps an unavailable Postgres connection operator-only and blocks generic upstream auto-retry", async () => {
    const snapshot = diagnostic({
      overallState: "broken",
      whatIsBroken: [{
        provider: "postgres",
        severity: "critical",
        code: "APOLLOS_MCP_POSTGRES_UNAVAILABLE",
        summary: "PostgreSQL read-only health check failed.",
        confidence: "confirmed",
      }],
      providers: [{
        provider: "postgres",
        state: "broken",
        confidence: "confirmed",
        summary: "PostgreSQL read-only health check failed.",
        evidence: ["APOLLOS_MCP_POSTGRES_UNAVAILABLE"],
        reasonCode: "APOLLOS_MCP_POSTGRES_UNAVAILABLE",
      }],
    });

    const proposal = await getApollosSystemRepairProposal("clerk-admin", async () => snapshot);

    expect(proposal.diagnosis).toMatchObject({
      rootCauseCode: "APOLLOS_ROOT_POSTGRES_UNAVAILABLE",
      repairAuthority: "operator",
      canApollosRepair: false,
      confidence: "confirmed",
    });
    expect(proposal.diagnosis.recommendedRepair).toContain("must not execute database writes");
    expect(proposal.repairPlan).toMatchObject({
      status: "insufficient_evidence",
      canApollosExecute: false,
      approvalRequired: false,
      repairAuthority: "operator",
    });
    expect(proposal.repairPlan.steps).toEqual([
      expect.objectContaining({ key: "collect-causal-evidence", effect: "read_only", executableByApollos: true }),
    ]);
  });

  it("refuses to invent a mutable repair for a generic degraded provider", async () => {
    const snapshot = diagnostic({
      overallState: "degraded",
      whatIsBroken: [{
        provider: "coolify",
        severity: "medium",
        code: "APOLLOS_COOLIFY_DEGRADED",
        summary: "One noncritical application is unhealthy.",
        confidence: "confirmed",
      }],
      providers: [{
        provider: "coolify",
        state: "degraded",
        confidence: "confirmed",
        summary: "One noncritical application is unhealthy.",
        evidence: ["unhealthyApplications=1"],
        reasonCode: null,
      }],
    });

    const proposal = await getApollosSystemRepairProposal("clerk-admin", async () => snapshot);
    expect(proposal.diagnosis.rootCauseCode).toBe("APOLLOS_ROOT_COOLIFY_CONTROL_PLANE_DEGRADED");
    expect(proposal.repairPlan).toMatchObject({
      status: "insufficient_evidence",
      canApollosExecute: false,
      approvalRequired: false,
    });
    expect(proposal.repairPlan.steps).toEqual([
      expect.objectContaining({ key: "collect-causal-evidence", effect: "read_only", executableByApollos: true }),
    ]);
  });

  it("binds change evidence into the proposal without secrets", () => {
    const snapshot = diagnostic({
      whatChanged: [{
        source: "github",
        kind: "commit",
        summary: "abcd1234: repair control plane",
        observedAt: "2026-08-12T00:39:00Z",
      }],
    });
    const diagnosis = buildApollosSystemDiagnosis(snapshot);
    expect(diagnosis.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "runtime",
        code: "APOLLOS_OBSERVED_GITHUB_COMMIT",
        detail: "abcd1234: repair control plane",
      }),
    ]));
  });
});
