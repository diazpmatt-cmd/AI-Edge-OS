import { createHash } from "node:crypto";
import type { ApollosDiagnosis } from "./apollos-diagnostics.js";

export type ApollosRepairEffect =
  | "read_only"
  | "checkpoint_resume"
  | "internal_change"
  | "deployment_change"
  | "credential_change"
  | "provider_change"
  | "external_publish";

export type ApollosRepairPlanStatus =
  | "not_required"
  | "ready"
  | "approval_required"
  | "manual_required"
  | "insufficient_evidence";

export interface ApollosRepairStep {
  readonly key: string;
  readonly position: number;
  readonly title: string;
  readonly action: string;
  readonly capability: "diagnose" | "prepare" | "publish";
  readonly effect: ApollosRepairEffect;
  readonly executableByApollos: boolean;
  readonly requiresApproval: boolean;
  readonly verification: string;
}

export interface ApollosRepairPlan {
  readonly planId: string;
  readonly diagnosisId: string;
  readonly rootCauseCode: string;
  readonly status: ApollosRepairPlanStatus;
  readonly smallestSafeRepair: string;
  readonly canApollosExecute: boolean;
  readonly approvalRequired: boolean;
  readonly approvalReason: string | null;
  readonly repairAuthority: ApollosDiagnosis["repairAuthority"];
  readonly steps: readonly ApollosRepairStep[];
  readonly finalVerification: readonly string[];
}

type StepInput = Omit<ApollosRepairStep, "position">;

const step = (
  key: string,
  title: string,
  action: string,
  capability: ApollosRepairStep["capability"],
  effect: ApollosRepairEffect,
  executableByApollos: boolean,
  verification: string,
): StepInput => ({
  key,
  title,
  action,
  capability,
  effect,
  executableByApollos,
  requiresApproval: effect !== "read_only" && effect !== "checkpoint_resume",
  verification,
});

const inspect = (key: string, title: string, action: string, verification: string) =>
  step(key, title, action, "diagnose", "read_only", true, verification);

const prepare = (
  key: string,
  title: string,
  action: string,
  effect: Exclude<ApollosRepairEffect, "read_only">,
  verification: string,
) => step(key, title, action, "prepare", effect, true, verification);

interface Template {
  readonly status: ApollosRepairPlanStatus;
  readonly summary: string;
  readonly approvalReason: string | null;
  readonly steps: readonly StepInput[];
}

const TEMPLATES: Readonly<Record<string, Template>> = {
  APOLLOS_ROOT_PROVIDER_CREDITS_EXHAUSTED: {
    status: "manual_required",
    summary: "Restore the provider balance, then retry only the failed checkpoint.",
    approvalReason: null,
    steps: [
      inspect("confirm-provider-balance", "Confirm provider balance", "Read the provider billing/quota status without changing it.", "The provider reports the exact exhausted balance or quota."),
      step("restore-provider-balance", "Restore provider credits", "The operator adds credits or raises the funded quota in the provider account.", "prepare", "provider_change", false, "The provider reports a positive available balance."),
      prepare("retry-failed-checkpoint", "Retry failed checkpoint", "Resume only the checkpoint that failed; do not regenerate completed work.", "internal_change", "One new completion receipt is stored for the checkpoint."),
    ],
  },
  APOLLOS_ROOT_PROVIDER_NOT_CONFIGURED: {
    status: "manual_required",
    summary: "Correct the runtime credential or endpoint, redeploy, and run one bounded retry.",
    approvalReason: "Credentials and production environment configuration require operator control.",
    steps: [
      inspect("inspect-provider-config", "Inspect runtime configuration", "Confirm which provider fields are missing or invalid without exposing secret values.", "A sanitized configuration report identifies the missing field."),
      step("correct-provider-config", "Correct provider configuration", "The operator replaces the missing credential or invalid endpoint.", "prepare", "credential_change", false, "Runtime configuration reports the provider as configured."),
      prepare("redeploy-provider-config", "Redeploy affected services", "Redeploy only services that consume the corrected provider configuration.", "deployment_change", "Affected services pass health checks."),
      prepare("retry-provider-checkpoint", "Retry failed checkpoint", "Resume only the original failed checkpoint.", "internal_change", "The checkpoint records one completed receipt."),
    ],
  },
  APOLLOS_ROOT_GOOGLE_CERTIFICATE_PATH_INVALID: {
    status: "approval_required",
    summary: "Remove the stale optional certificate path while preserving normal OAuth, then redeploy.",
    approvalReason: "Changing production environment variables and redeploying services requires approval.",
    steps: [
      inspect("confirm-stale-cert-path", "Confirm stale certificate path", "Verify the optional certificate variable points to a missing temporary file.", "The stale variable and affected services are identified."),
      prepare("remove-stale-cert-path", "Prepare environment correction", "Remove only the stale certificate-path variable; preserve OAuth client and refresh-token settings.", "deployment_change", "The proposed environment diff contains no OAuth credential deletion."),
      prepare("redeploy-youtube-services", "Redeploy YouTube services", "Redeploy the API and publishing worker with the corrected environment.", "deployment_change", "Both services pass health checks and no certificate warning appears."),
      step("private-youtube-test", "Publish private verification video", "Send one explicitly approved private test and capture its external video ID.", "publish", "external_publish", true, "YouTube returns a durable external video ID."),
    ],
  },
  APOLLOS_ROOT_VIDEO_RENDERER_FAILED: {
    status: "approval_required",
    summary: "Preserve the source assets, correct the smallest renderer defect, test it, and deploy it.",
    approvalReason: "A code or production deployment change requires approval.",
    steps: [
      inspect("preserve-render-inputs", "Preserve render inputs", "Bind the draft, image, sanitized stderr, and renderer version to this repair plan.", "The repair record references the original immutable inputs."),
      inspect("reproduce-render-failure", "Reproduce in a bounded test", "Run the same render command in an isolated test without publishing.", "The test reproduces the same failure code."),
      prepare("prepare-renderer-fix", "Prepare minimal renderer fix", "Change only the failing FFmpeg filter, audio, or source-media command.", "internal_change", "Focused renderer tests pass without changing unrelated media behavior."),
      prepare("deploy-renderer-fix", "Deploy renderer correction", "Deploy the tested renderer build.", "deployment_change", "The API and media worker pass health checks."),
      prepare("rerun-video-checkpoint", "Rerun video checkpoint", "Resume only the failed video checkpoint.", "internal_change", "The checkpoint stores exactly one MP4 receipt."),
    ],
  },
  APOLLOS_ROOT_MEDIA_STORAGE_FAILED: {
    status: "approval_required",
    summary: "Repair the durable storage binding or permission, then retry only persistence.",
    approvalReason: "Storage configuration or production permissions require approval.",
    steps: [
      inspect("probe-media-storage", "Probe durable media storage", "Perform a disposable write/read/delete through the configured adapter.", "The failing storage operation and adapter are identified."),
      prepare("prepare-storage-fix", "Prepare storage correction", "Correct only the named volume, object-store binding, or required permission.", "deployment_change", "The proposed change is limited to the failing storage target."),
      prepare("retry-storage-checkpoint", "Retry storage checkpoint", "Resume only the storage-dependent checkpoint.", "internal_change", "The canonical media URL returns HTTP 200 and the receipt is durable."),
    ],
  },
  APOLLOS_ROOT_EXECUTION_BINDING_MISMATCH: {
    status: "approval_required",
    summary: "Stop the stale execution and create a new plan from current inputs.",
    approvalReason: "A fresh plan and approval are required because the old binding is invalid.",
    steps: [
      inspect("preserve-binding-evidence", "Preserve binding evidence", "Freeze the mismatched input digest, approval ID, and checkpoint receipts.", "The stale execution cannot mutate further."),
      prepare("create-fresh-plan", "Create fresh execution plan", "Build a new plan from current inputs with a new stable digest.", "internal_change", "The replacement digest differs from the stale digest."),
      prepare("request-fresh-approval", "Request fresh approval", "Present the complete replacement package for a new decision.", "internal_change", "No prior approval or completion receipt is reused."),
    ],
  },
  APOLLOS_ROOT_RETRIES_EXHAUSTED: {
    status: "insufficient_evidence",
    summary: "Identify the earliest underlying checkpoint failure before authorizing another attempt.",
    approvalReason: null,
    steps: [
      inspect("find-earliest-failure", "Find earliest failure", "Trace checkpoint evidence to the first causal failure rather than the final retry error.", "A more specific root-cause code is recorded."),
    ],
  },
  APOLLOS_ROOT_EXECUTION_LEASE: {
    status: "ready",
    summary: "Wait for an active lease or recover an expired lease, then resume the next incomplete checkpoint.",
    approvalReason: null,
    steps: [
      inspect("inspect-lease-owner", "Inspect lease ownership", "Confirm whether the lease is active, expired, and uniquely owned.", "At most one live worker owns the checkpoint."),
      step("recover-expired-lease", "Recover expired lease", "If and only if expired, reclaim the internal lease and skip completed checkpoints.", "prepare", "checkpoint_resume", true, "The next incomplete checkpoint is selected without duplicating receipts."),
    ],
  },
  APOLLOS_ROOT_AUTHENTICATION_FAILED: {
    status: "manual_required",
    summary: "Reconnect the affected account, verify the connection, and retry only the failed checkpoint.",
    approvalReason: null,
    steps: [
      inspect("identify-expired-connection", "Identify affected connection", "Run a read-only connection test and identify the expired account.", "The rejected provider and account are identified."),
      step("reconnect-account", "Reconnect account", "The operator completes the provider OAuth or token refresh flow.", "prepare", "credential_change", false, "A read-only provider connection test succeeds."),
      prepare("retry-auth-checkpoint", "Retry failed checkpoint", "Resume only the operation rejected by authentication.", "internal_change", "The checkpoint records one completed receipt."),
    ],
  },
  APOLLOS_ROOT_PERMISSION_DENIED: {
    status: "manual_required",
    summary: "Grant the missing provider role or scope, reconnect, and retry the original operation.",
    approvalReason: null,
    steps: [
      inspect("inspect-provider-scopes", "Inspect provider scopes", "Compare granted permissions with the operation's required capability.", "The exact missing role or scope is identified."),
      step("grant-provider-scope", "Grant missing permission", "The provider administrator grants the required role or OAuth scope.", "prepare", "provider_change", false, "A read-only provider capability test succeeds."),
      prepare("retry-permission-checkpoint", "Retry original checkpoint", "Resume only the permission-denied checkpoint.", "internal_change", "The operation receives a successful provider receipt."),
    ],
  },
  APOLLOS_ROOT_PROVIDER_RATE_LIMITED: {
    status: "ready",
    summary: "Honor the provider cooldown and retry exactly one failed checkpoint.",
    approvalReason: null,
    steps: [
      inspect("confirm-retry-window", "Confirm retry window", "Read the provider retry-after or cooldown value.", "The next eligible retry time is recorded."),
      step("resume-after-cooldown", "Resume after cooldown", "After eligibility, resume exactly one failed checkpoint with bounded backoff.", "prepare", "checkpoint_resume", true, "The provider returns success and no duplicate receipt is created."),
    ],
  },
  APOLLOS_ROOT_UPSTREAM_UNREACHABLE: {
    status: "ready",
    summary: "Verify upstream health and routing, then perform one bounded checkpoint retry.",
    approvalReason: null,
    steps: [
      inspect("probe-upstream-health", "Probe upstream health", "Check the upstream health endpoint, DNS, and container route.", "The expected upstream returns HTTP 200 and resolves correctly."),
      step("retry-upstream-checkpoint", "Retry failed checkpoint", "Resume one failed checkpoint with bounded backoff.", "prepare", "checkpoint_resume", true, "The checkpoint records a successful receipt."),
    ],
  },
};

function deepFreezeSteps(inputs: readonly StepInput[]): readonly ApollosRepairStep[] {
  return Object.freeze(inputs.map((item, index) => Object.freeze({ ...item, position: index + 1 })));
}

function validateSafety(steps: readonly ApollosRepairStep[]): void {
  for (const item of steps) {
    if (item.effect !== "read_only" && item.effect !== "checkpoint_resume" && !item.requiresApproval) {
      throw new Error(`Unsafe repair step ${item.key}: mutable effects require approval`);
    }
  }
}

export function buildApollosRepairPlan(diagnosis: ApollosDiagnosis): ApollosRepairPlan {
  let template = TEMPLATES[diagnosis.rootCauseCode];
  if (diagnosis.status === "healthy") {
    template = { status: "not_required", summary: "No repair is required.", approvalReason: null, steps: [] };
  } else if (!template || diagnosis.confidence === "unknown") {
    template = {
      status: "insufficient_evidence",
      summary: "Collect stronger evidence before changing anything.",
      approvalReason: null,
      steps: [
        inspect("collect-causal-evidence", "Collect causal evidence", "Preserve the earliest checkpoint failure plus its nearest runtime or provider receipt.", "A specific, evidence-backed root cause can be diagnosed."),
      ],
    };
  }

  const steps = deepFreezeSteps(template.steps);
  validateSafety(steps);
  const approvalRequired = steps.some((item) => item.requiresApproval);
  const canApollosExecute =
    template.status === "ready" &&
    steps.every((item) => item.executableByApollos && !item.requiresApproval);
  const planId = createHash("sha256")
    .update(diagnosis.diagnosisId)
    .update(diagnosis.rootCauseCode)
    .update(JSON.stringify(steps))
    .digest("hex")
    .slice(0, 24);

  return Object.freeze({
    planId,
    diagnosisId: diagnosis.diagnosisId,
    rootCauseCode: diagnosis.rootCauseCode,
    status: template.status,
    smallestSafeRepair: template.summary,
    canApollosExecute,
    approvalRequired,
    approvalReason: template.approvalReason,
    repairAuthority: diagnosis.repairAuthority,
    steps,
    finalVerification: Object.freeze([...diagnosis.verification]),
  });
}
