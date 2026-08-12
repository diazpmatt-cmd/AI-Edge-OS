import { createHash } from "node:crypto";
import type {
  ApollosDiagnosis,
  ApollosDiagnosticEvidence,
  ApollosRepairAuthority,
} from "./apollos-diagnostics.js";
import { buildApollosRepairPlan, type ApollosRepairPlan } from "./apollos-repair-planner.js";
import {
  getApollosSystemDiagnostic,
  type ApollosSystemDiagnostic,
  type ApollosSystemIssue,
} from "./apollos-system-diagnostic.js";

export interface ApollosSystemRepairProposal {
  readonly diagnostic: ApollosSystemDiagnostic;
  readonly diagnosis: ApollosDiagnosis;
  readonly repairPlan: ApollosRepairPlan;
}

export type ApollosSystemDiagnosticReader = (actorUserId: string) => Promise<ApollosSystemDiagnostic>;

function rootCauseForIssue(issue: ApollosSystemIssue): Readonly<{
  rootCauseCode: string;
  rootCause: string;
  component: string;
  repairAuthority: ApollosRepairAuthority;
  canApollosRepair: boolean;
  requiresApproval: boolean;
  recommendedRepair: string;
  verification: readonly string[];
}> {
  if (issue.code.endsWith("_NOT_CONFIGURED") || issue.code.endsWith("_REPOSITORY_NOT_CONFIGURED")) {
    return Object.freeze({
      rootCauseCode: "APOLLOS_ROOT_PROVIDER_NOT_CONFIGURED",
      rootCause: `${issue.provider} read-only control-plane visibility is missing required runtime configuration.`,
      component: `${issue.provider} control plane`,
      repairAuthority: "operator",
      canApollosRepair: false,
      requiresApproval: false,
      recommendedRepair: `Configure the missing ${issue.provider} read-only runtime credential or endpoint outside MCP, redeploy only the affected runtime, and rerun the system diagnostic.`,
      verification: Object.freeze([
        `Confirm ${issue.provider} reports configured without exposing the credential value.`,
        `Run the ${issue.provider} read-only control-plane check.`,
        "Rerun the synthesized system diagnostic and confirm the provider is no longer unconfigured.",
      ]),
    });
  }

  if (issue.code.endsWith("_AUTH_FAILED")) {
    return Object.freeze({
      rootCauseCode: "APOLLOS_ROOT_AUTHENTICATION_FAILED",
      rootCause: `${issue.provider} recognized the request path but rejected the configured credential.`,
      component: `${issue.provider} control-plane authentication`,
      repairAuthority: "operator",
      canApollosRepair: false,
      requiresApproval: false,
      recommendedRepair: `Rotate or reconnect the ${issue.provider} read-only credential, then rerun only the read-only verification.`,
      verification: Object.freeze([
        `Confirm the replacement ${issue.provider} credential is active without returning it through MCP.`,
        `Run the ${issue.provider} read-only control-plane check successfully.`,
        "Rerun the synthesized system diagnostic.",
      ]),
    });
  }

  if (issue.provider === "postgres" && issue.code.endsWith("_UNAVAILABLE")) {
    return Object.freeze({
      rootCauseCode: "APOLLOS_ROOT_POSTGRES_UNAVAILABLE",
      rootCause: "The production PostgreSQL health probe could not establish a read-only connection.",
      component: "PostgreSQL connection path",
      repairAuthority: "operator",
      canApollosRepair: false,
      requiresApproval: false,
      recommendedRepair: "Verify the production database service and runtime connection path outside MCP, restore only the failing service or configuration, and rerun the read-only PostgreSQL health check. Apollos must not execute database writes or autonomous database restarts for this condition.",
      verification: Object.freeze([
        "Confirm the production PostgreSQL service is reachable from the API runtime.",
        "Run the read-only PostgreSQL health check successfully without returning credentials or customer rows.",
        "Rerun the synthesized system diagnostic and confirm PostgreSQL is no longer broken.",
      ]),
    });
  }

  if (issue.code.endsWith("_UNAVAILABLE") || issue.code.endsWith("_REPOSITORY_NOT_FOUND")) {
    return Object.freeze({
      rootCauseCode: "APOLLOS_ROOT_UPSTREAM_UNREACHABLE",
      rootCause: `${issue.provider} could not be reached or the configured control-plane target could not be resolved.`,
      component: `${issue.provider} control-plane connectivity`,
      repairAuthority: issue.provider === "github" ? "apollos" : "deployment",
      canApollosRepair: true,
      requiresApproval: false,
      recommendedRepair: `Verify ${issue.provider} endpoint health and routing, then rerun the read-only check once.`,
      verification: Object.freeze([
        `Confirm the ${issue.provider} endpoint or configured target is reachable.`,
        `Confirm the ${issue.provider} read-only control-plane check succeeds.`,
        "Rerun the synthesized system diagnostic.",
      ]),
    });
  }

  const authority: ApollosRepairAuthority = issue.provider === "github"
    ? "apollos"
    : issue.provider === "clerk"
      ? "operator"
      : "deployment";
  return Object.freeze({
    rootCauseCode: `APOLLOS_ROOT_${issue.provider.toUpperCase()}_CONTROL_PLANE_DEGRADED`,
    rootCause: issue.summary,
    component: `${issue.provider} control plane`,
    repairAuthority: authority,
    canApollosRepair: false,
    requiresApproval: false,
    recommendedRepair: `Collect the nearest causal ${issue.provider} evidence before changing configuration or executing a repair.`,
    verification: Object.freeze([
      `Identify the exact degraded ${issue.provider} resource or failing operation.`,
      "Record a specific root-cause code supported by first-party evidence.",
      "Regenerate the repair plan only after the root cause is specific.",
    ]),
  });
}

function evidenceFromDiagnostic(diagnostic: ApollosSystemDiagnostic): readonly ApollosDiagnosticEvidence[] {
  const evidence: ApollosDiagnosticEvidence[] = diagnostic.providers.map((provider) => Object.freeze({
    source: "provider" as const,
    code: provider.reasonCode ?? `APOLLOS_${provider.provider.toUpperCase()}_${provider.state.toUpperCase()}`,
    detail: provider.summary.slice(0, 500),
    observedAt: diagnostic.generatedAt,
    stepKey: null,
  }));
  for (const change of diagnostic.whatChanged.slice(0, 4)) {
    evidence.push(Object.freeze({
      source: change.kind === "deployment" || change.kind === "runtime_update" ? "deployment" as const : "runtime" as const,
      code: `APOLLOS_OBSERVED_${change.source.toUpperCase()}_${change.kind.toUpperCase()}`,
      detail: change.summary.slice(0, 500),
      observedAt: change.observedAt,
      stepKey: null,
    }));
  }
  return Object.freeze(evidence);
}

function diagnosisId(diagnostic: ApollosSystemDiagnostic, evidence: readonly ApollosDiagnosticEvidence[]): string {
  return createHash("sha256")
    .update(diagnostic.generatedAt)
    .update(JSON.stringify(evidence))
    .digest("hex")
    .slice(0, 24);
}

export function buildApollosSystemDiagnosis(diagnostic: ApollosSystemDiagnostic): ApollosDiagnosis {
  const evidence = evidenceFromDiagnostic(diagnostic);
  const primaryIssue = diagnostic.whatIsBroken[0] ?? null;

  if (!primaryIssue) {
    const healthy = diagnostic.overallState === "healthy";
    return Object.freeze({
      diagnosisId: diagnosisId(diagnostic, evidence),
      status: healthy ? "healthy" : "incomplete",
      confidence: healthy ? "confirmed" : "unknown",
      component: "AI Edge control plane",
      rootCauseCode: healthy ? "APOLLOS_NO_FAILURE_DETECTED" : "APOLLOS_INSUFFICIENT_FAILURE_EVIDENCE",
      rootCause: healthy
        ? "All configured control-plane providers passed the current read-only verification."
        : "The control plane has incomplete or unknown evidence but no specific evidence-backed failure.",
      repairAuthority: "apollos",
      canApollosRepair: false,
      requiresApproval: false,
      recommendedRepair: healthy ? "No repair is required." : "Collect the missing read-only evidence before changing anything.",
      verification: Object.freeze([
        "Rerun the synthesized system diagnostic after any provider state changes.",
      ]),
      evidence,
    });
  }

  const mapped = rootCauseForIssue(primaryIssue);
  return Object.freeze({
    diagnosisId: diagnosisId(diagnostic, evidence),
    status: "failed",
    confidence: primaryIssue.confidence,
    component: mapped.component,
    rootCauseCode: mapped.rootCauseCode,
    rootCause: mapped.rootCause,
    repairAuthority: mapped.repairAuthority,
    canApollosRepair: mapped.canApollosRepair,
    requiresApproval: mapped.requiresApproval,
    recommendedRepair: mapped.recommendedRepair,
    verification: mapped.verification,
    evidence,
  });
}

export async function getApollosSystemRepairProposal(
  actorUserId: string,
  diagnosticReader: ApollosSystemDiagnosticReader = getApollosSystemDiagnostic,
): Promise<ApollosSystemRepairProposal> {
  const diagnostic = await diagnosticReader(actorUserId);
  const diagnosis = buildApollosSystemDiagnosis(diagnostic);
  const repairPlan = buildApollosRepairPlan(diagnosis);
  return Object.freeze({ diagnostic, diagnosis, repairPlan });
}
