import { createHash } from "node:crypto";

export type ApollosDiagnosisConfidence =
  | "confirmed"
  | "probable"
  | "unknown";

export type ApollosRepairAuthority =
  | "apollos"
  | "operator"
  | "provider"
  | "deployment";

export interface ApollosDiagnosticEvidence {
  readonly source: "task" | "checkpoint" | "runtime" | "provider" | "deployment";
  readonly code: string;
  readonly detail: string | null;
  readonly observedAt: string | null;
  readonly stepKey: string | null;
}

export interface ApollosDiagnosticInput {
  readonly taskId: string;
  readonly taskStatus: string;
  readonly taskFailureCode: string | null;
  readonly taskDetail: string | null;
  readonly taskUpdatedAt: string | null;
  readonly steps: readonly {
    readonly stepKey: string;
    readonly status: string;
    readonly failureCode: string | null;
    readonly updatedAt: string | null;
  }[];
  readonly additionalEvidence?: readonly ApollosDiagnosticEvidence[];
}

export interface ApollosDiagnosis {
  readonly diagnosisId: string;
  readonly status: "healthy" | "failed" | "incomplete";
  readonly confidence: ApollosDiagnosisConfidence;
  readonly component: string;
  readonly rootCauseCode: string;
  readonly rootCause: string;
  readonly repairAuthority: ApollosRepairAuthority;
  readonly canApollosRepair: boolean;
  readonly requiresApproval: boolean;
  readonly recommendedRepair: string;
  readonly verification: readonly string[];
  readonly evidence: readonly ApollosDiagnosticEvidence[];
}

interface DiagnosticRule {
  readonly pattern: RegExp;
  readonly component: string;
  readonly rootCauseCode: string;
  readonly rootCause: string;
  readonly confidence: Exclude<ApollosDiagnosisConfidence, "unknown">;
  readonly repairAuthority: ApollosRepairAuthority;
  readonly canApollosRepair: boolean;
  readonly requiresApproval: boolean;
  readonly recommendedRepair: string;
  readonly verification: readonly string[];
}

const RULES: readonly DiagnosticRule[] = [
  {
    pattern: /(?:insufficient_quota|no credits|credits remaining|billing|quota.*openai|openai.*quota)/i,
    component: "AI image/text provider",
    rootCauseCode: "APOLLOS_ROOT_PROVIDER_CREDITS_EXHAUSTED",
    rootCause: "The AI provider rejected generation because the funded API balance or quota is exhausted.",
    confidence: "confirmed",
    repairAuthority: "operator",
    canApollosRepair: false,
    requiresApproval: false,
    recommendedRepair: "Add provider API credits or restore the configured quota, then retry only the failed checkpoint.",
    verification: [
      "Confirm the provider account reports an available funded balance.",
      "Retry the failed generation checkpoint.",
      "Verify the checkpoint receives a completed receipt.",
    ],
  },
  {
    pattern: /(?:provider not configured|credential.*missing|api key.*missing|invalid_api_key|no openai api key)/i,
    component: "AI provider configuration",
    rootCauseCode: "APOLLOS_ROOT_PROVIDER_NOT_CONFIGURED",
    rootCause: "The required AI provider credential or endpoint is missing or invalid at runtime.",
    confidence: "confirmed",
    repairAuthority: "operator",
    canApollosRepair: false,
    requiresApproval: false,
    recommendedRepair: "Correct the runtime provider credential and endpoint, redeploy, then retry the failed checkpoint.",
    verification: [
      "Confirm the credential is available at runtime, not only build time.",
      "Confirm the provider base URL is absolute and includes the expected API version.",
      "Run one bounded generation retry.",
    ],
  },
  {
    pattern: /(?:certificate config path is invalid|certificate-config\.json|context_aware_certificate)/i,
    component: "Google/YouTube client configuration",
    rootCauseCode: "APOLLOS_ROOT_GOOGLE_CERTIFICATE_PATH_INVALID",
    rootCause: "A stale Google mutual-TLS certificate path points to a temporary file that does not exist in the running container.",
    confidence: "confirmed",
    repairAuthority: "deployment",
    canApollosRepair: true,
    requiresApproval: true,
    recommendedRepair: "Remove the stale certificate-path variable, keep normal OAuth credentials, and redeploy the API and publishing worker.",
    verification: [
      "Confirm the certificate-path variable is absent from the running container.",
      "Reconnect or refresh YouTube OAuth if required.",
      "Publish one private test video and verify the external video ID.",
    ],
  },
  {
    pattern: /(?:ffmpeg_failed|video_render_failed|native video could not be rendered|aevalsrc|filter.*invalid argument)/i,
    component: "Native video renderer",
    rootCauseCode: "APOLLOS_ROOT_VIDEO_RENDERER_FAILED",
    rootCause: "The native media renderer rejected its FFmpeg filter, audio, or source-media command.",
    confidence: "confirmed",
    repairAuthority: "apollos",
    canApollosRepair: true,
    requiresApproval: true,
    recommendedRepair: "Preserve the draft and image, inspect the sanitized FFmpeg stderr, correct the renderer command, and rerun only the video checkpoint.",
    verification: [
      "Render the same draft in a bounded test.",
      "Probe the MP4 and confirm H.264 video plus AAC audio streams.",
      "Preview the complete video before publishing.",
    ],
  },
  {
    pattern: /(?:storage_failure|failed to store|private_object_dir|local_media_dir|object storage)/i,
    component: "Durable media storage",
    rootCauseCode: "APOLLOS_ROOT_MEDIA_STORAGE_FAILED",
    rootCause: "Generation completed, but the durable media store could not persist or expose the asset.",
    confidence: "confirmed",
    repairAuthority: "deployment",
    canApollosRepair: true,
    requiresApproval: true,
    recommendedRepair: "Verify the named media volume or object-store configuration and permissions, then retry only the storage-dependent checkpoint.",
    verification: [
      "Write and read a disposable object through the configured storage adapter.",
      "Confirm the canonical media URL returns HTTP 200.",
      "Retry the failed checkpoint and verify its durable receipt.",
    ],
  },
  {
    pattern: /(?:binding_mismatch|payload_hash_mismatch|input_digest|checkpoint.*conflict)/i,
    component: "Execution integrity boundary",
    rootCauseCode: "APOLLOS_ROOT_EXECUTION_BINDING_MISMATCH",
    rootCause: "The task, checkpoint, approval, or payload no longer matches the work being executed.",
    confidence: "confirmed",
    repairAuthority: "apollos",
    canApollosRepair: false,
    requiresApproval: true,
    recommendedRepair: "Stop execution, preserve the evidence, create a new plan from the current inputs, and request a fresh approval.",
    verification: [
      "Confirm the replacement plan has a new stable input digest.",
      "Confirm no old completion receipt was reused.",
      "Approve only the newly reviewable package.",
    ],
  },
  {
    pattern: /(?:retries_exhausted|attempt.*ceiling)/i,
    component: "Execution retry policy",
    rootCauseCode: "APOLLOS_ROOT_RETRIES_EXHAUSTED",
    rootCause: "The same bounded step failed until its configured retry ceiling was reached.",
    confidence: "confirmed",
    repairAuthority: "apollos",
    canApollosRepair: false,
    requiresApproval: true,
    recommendedRepair: "Inspect the earliest underlying checkpoint failure before authorizing any additional attempt.",
    verification: [
      "Identify and repair the original failure code.",
      "Create a fresh bounded attempt rather than increasing retries blindly.",
      "Verify the new attempt completes once and records a receipt.",
    ],
  },
  {
    pattern: /(?:lease_active|lease_expired|lease_recovered)/i,
    component: "Execution lease",
    rootCauseCode: "APOLLOS_ROOT_EXECUTION_LEASE",
    rootCause: "A worker lease is active or expired, indicating concurrent execution or recovery after interruption.",
    confidence: "confirmed",
    repairAuthority: "apollos",
    canApollosRepair: true,
    requiresApproval: false,
    recommendedRepair: "Allow the active lease to finish or recover the expired lease, then resume from the next incomplete checkpoint.",
    verification: [
      "Confirm only one worker owns the checkpoint lease.",
      "Confirm completed checkpoints were skipped.",
      "Confirm the resumed step records one completion receipt.",
    ],
  },
  {
    pattern: /(?:401|unauthorized|unauthenticated|token.*invalid|token.*expired)/i,
    component: "Authentication",
    rootCauseCode: "APOLLOS_ROOT_AUTHENTICATION_FAILED",
    rootCause: "The target provider or internal endpoint rejected the credential.",
    confidence: "probable",
    repairAuthority: "operator",
    canApollosRepair: false,
    requiresApproval: false,
    recommendedRepair: "Reconnect or refresh the affected account, then retry only the failed checkpoint.",
    verification: [
      "Confirm the refreshed credential is active.",
      "Run the provider's read-only connection test.",
      "Retry the failed checkpoint and verify its receipt.",
    ],
  },
  {
    pattern: /(?:403|permission denied|insufficient permission|scope)/i,
    component: "Provider permissions",
    rootCauseCode: "APOLLOS_ROOT_PERMISSION_DENIED",
    rootCause: "The credential is recognized, but it lacks a required permission or account role.",
    confidence: "probable",
    repairAuthority: "provider",
    canApollosRepair: false,
    requiresApproval: false,
    recommendedRepair: "Grant the required provider scope or account role, reconnect, and retry the failed checkpoint.",
    verification: [
      "Inspect the granted OAuth scopes or account roles.",
      "Run a read-only provider capability test.",
      "Retry the original operation.",
    ],
  },
  {
    pattern: /(?:429|rate limit|quota cooldown|cooldown active)/i,
    component: "Provider rate limit",
    rootCauseCode: "APOLLOS_ROOT_PROVIDER_RATE_LIMITED",
    rootCause: "The provider temporarily rejected the request because its rate or quota window is exhausted.",
    confidence: "confirmed",
    repairAuthority: "provider",
    canApollosRepair: true,
    requiresApproval: false,
    recommendedRepair: "Honor the provider cooldown and resume the failed checkpoint after the eligible time.",
    verification: [
      "Confirm the cooldown or retry-after window has elapsed.",
      "Retry exactly one checkpoint.",
      "Verify the provider returns a success receipt.",
    ],
  },
  {
    pattern: /(?:timeout|failed to fetch|network|econnreset|enotfound|bad gateway|502|503|504)/i,
    component: "Network or upstream service",
    rootCauseCode: "APOLLOS_ROOT_UPSTREAM_UNREACHABLE",
    rootCause: "The operation could not reach a healthy upstream service within its bounded request window.",
    confidence: "probable",
    repairAuthority: "deployment",
    canApollosRepair: true,
    requiresApproval: false,
    recommendedRepair: "Verify upstream health and routing, then resume only the failed checkpoint with bounded backoff.",
    verification: [
      "Confirm the upstream health endpoint returns HTTP 200.",
      "Confirm DNS and container routing resolve the expected service.",
      "Retry the failed checkpoint once.",
    ],
  },
];

function sanitize(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/(?:sk|pk|rk)_[A-Za-z0-9_-]{16,}/g, "[REDACTED_KEY]")
    .replace(/[A-Za-z0-9+/]{80,}={0,2}/g, "[REDACTED_BLOB]")
    .slice(0, 500);
}

function evidenceFingerprint(
  taskId: string,
  evidence: readonly ApollosDiagnosticEvidence[],
): string {
  return createHash("sha256")
    .update(taskId)
    .update(JSON.stringify(evidence))
    .digest("hex")
    .slice(0, 24);
}

export function diagnoseApollosTask(
  input: ApollosDiagnosticInput,
): ApollosDiagnosis {
  const evidence: ApollosDiagnosticEvidence[] = [];
  for (const step of input.steps) {
    if (!step.failureCode) continue;
    evidence.push(Object.freeze({
      source: "checkpoint",
      code: sanitize(step.failureCode) ?? "UNKNOWN",
      detail: null,
      observedAt: step.updatedAt,
      stepKey: step.stepKey,
    }));
  }
  if (input.taskFailureCode || input.taskDetail) {
    evidence.push(Object.freeze({
      source: "task",
      code: sanitize(input.taskFailureCode) ?? "APOLLOS_TASK_FAILURE",
      detail: sanitize(input.taskDetail),
      observedAt: input.taskUpdatedAt,
      stepKey: null,
    }));
  }
  for (const item of input.additionalEvidence ?? []) {
    evidence.push(Object.freeze({
      ...item,
      code: sanitize(item.code) ?? "UNKNOWN",
      detail: sanitize(item.detail),
    }));
  }

  const frozenEvidence = Object.freeze([...evidence]);
  const fingerprint = evidenceFingerprint(input.taskId, frozenEvidence);
  if (evidence.length === 0) {
    const healthy = input.taskStatus === "executed" || input.taskStatus === "pending_review";
    return Object.freeze({
      diagnosisId: fingerprint,
      status: healthy ? "healthy" : "incomplete",
      confidence: healthy ? "confirmed" : "unknown",
      component: "Apollos task",
      rootCauseCode: healthy
        ? "APOLLOS_NO_FAILURE_DETECTED"
        : "APOLLOS_INSUFFICIENT_FAILURE_EVIDENCE",
      rootCause: healthy
        ? "No failed checkpoint or task failure is recorded."
        : "There is not enough recorded evidence to identify a failure.",
      repairAuthority: "apollos",
      canApollosRepair: false,
      requiresApproval: false,
      recommendedRepair: healthy
        ? "No repair is required."
        : "Wait for a failure receipt or collect runtime/provider evidence before diagnosing.",
      verification: Object.freeze([
        "Inspect the task and checkpoint status.",
        "Confirm failure codes are persisted when an operation fails.",
      ]),
      evidence: frozenEvidence,
    });
  }

  const combined = evidence
    .map((item) => `${item.code} ${item.detail ?? ""}`)
    .join("\n");
  const rule = RULES.find((candidate) => candidate.pattern.test(combined));
  if (!rule) {
    return Object.freeze({
      diagnosisId: fingerprint,
      status: "failed",
      confidence: "unknown",
      component: "Unknown component",
      rootCauseCode: "APOLLOS_ROOT_CAUSE_UNCLASSIFIED",
      rootCause: "A failure is recorded, but the current evidence does not prove a specific root cause.",
      repairAuthority: "operator",
      canApollosRepair: false,
      requiresApproval: false,
      recommendedRepair: "Open Under the Hood, preserve the exact evidence, and collect the nearest provider or runtime receipt before changing anything.",
      verification: Object.freeze([
        "Confirm the earliest failing checkpoint.",
        "Collect its provider response or runtime stderr.",
        "Rerun diagnosis with the additional evidence.",
      ]),
      evidence: frozenEvidence,
    });
  }

  return Object.freeze({
    diagnosisId: fingerprint,
    status: "failed",
    confidence: rule.confidence,
    component: rule.component,
    rootCauseCode: rule.rootCauseCode,
    rootCause: rule.rootCause,
    repairAuthority: rule.repairAuthority,
    canApollosRepair: rule.canApollosRepair,
    requiresApproval: rule.requiresApproval,
    recommendedRepair: rule.recommendedRepair,
    verification: Object.freeze([...rule.verification]),
    evidence: frozenEvidence,
  });
}
