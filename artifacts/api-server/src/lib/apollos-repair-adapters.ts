import type {
  ApollosRepairEffect,
  ApollosRepairPlan,
} from "./apollos-repair-planner.js";
import type {
  ApollosRepairAction,
  ApollosRepairActionContext,
  ApollosRepairActionResult,
} from "./apollos-repair-runner.js";

export interface ApollosRepairAdapterPolicy {
  readonly stepKey: string;
  readonly effect: ApollosRepairEffect;
  readonly allowedRootCauseCodes: readonly string[];
  readonly defaultEnabled: boolean;
  readonly enableEnvironmentVariable: string | null;
  readonly killSwitchEnvironmentVariable: string;
  readonly requiresApproval: boolean;
  readonly maxDurationMs: number;
}

export interface ApollosRepairAdapterDecision {
  readonly stepKey: string;
  readonly allowed: boolean;
  readonly reasonCode: string;
  readonly policy: ApollosRepairAdapterPolicy | null;
}

export interface ApollosRepairAdapterRegistry {
  readonly actions: Readonly<Record<string, ApollosRepairAction>>;
  readonly decisions: readonly ApollosRepairAdapterDecision[];
}

const policy = (
  stepKey: string,
  effect: ApollosRepairEffect,
  allowedRootCauseCodes: readonly string[],
  options: {
    defaultEnabled: boolean;
    enableEnvironmentVariable?: string;
    requiresApproval: boolean;
    maxDurationMs: number;
  },
): ApollosRepairAdapterPolicy =>
  Object.freeze({
    stepKey,
    effect,
    allowedRootCauseCodes: Object.freeze([...allowedRootCauseCodes]),
    defaultEnabled: options.defaultEnabled,
    enableEnvironmentVariable: options.enableEnvironmentVariable ?? null,
    killSwitchEnvironmentVariable:
      `APOLLOS_REPAIR_ADAPTER_${stepKey.toUpperCase().replace(/-/g, "_")}_KILL_SWITCH`,
    requiresApproval: options.requiresApproval,
    maxDurationMs: options.maxDurationMs,
  });

export const APOLLOS_REPAIR_ADAPTER_POLICIES: readonly ApollosRepairAdapterPolicy[] =
  Object.freeze([
    policy(
      "preserve-render-inputs",
      "read_only",
      ["APOLLOS_ROOT_VIDEO_RENDERER_FAILED"],
      { defaultEnabled: true, requiresApproval: false, maxDurationMs: 10_000 },
    ),
    policy(
      "preserve-binding-evidence",
      "read_only",
      ["APOLLOS_ROOT_EXECUTION_BINDING_MISMATCH"],
      { defaultEnabled: true, requiresApproval: false, maxDurationMs: 10_000 },
    ),
    policy(
      "find-earliest-failure",
      "read_only",
      ["APOLLOS_ROOT_RETRIES_EXHAUSTED"],
      { defaultEnabled: true, requiresApproval: false, maxDurationMs: 10_000 },
    ),
    policy(
      "collect-causal-evidence",
      "read_only",
      ["APOLLOS_ROOT_CAUSE_UNCLASSIFIED", "APOLLOS_INSUFFICIENT_FAILURE_EVIDENCE"],
      { defaultEnabled: true, requiresApproval: false, maxDurationMs: 10_000 },
    ),
    policy(
      "inspect-lease-owner",
      "read_only",
      ["APOLLOS_ROOT_EXECUTION_LEASE"],
      {
        defaultEnabled: false,
        enableEnvironmentVariable: "APOLLOS_REPAIR_ADAPTER_LEASE_INSPECTION_ENABLED",
        requiresApproval: false,
        maxDurationMs: 10_000,
      },
    ),
    policy(
      "recover-expired-lease",
      "checkpoint_resume",
      ["APOLLOS_ROOT_EXECUTION_LEASE"],
      {
        defaultEnabled: false,
        enableEnvironmentVariable: "APOLLOS_REPAIR_ADAPTER_LEASE_RECOVERY_ENABLED",
        requiresApproval: false,
        maxDurationMs: 15_000,
      },
    ),
    policy(
      "probe-upstream-health",
      "read_only",
      ["APOLLOS_ROOT_UPSTREAM_UNREACHABLE"],
      {
        defaultEnabled: false,
        enableEnvironmentVariable: "APOLLOS_REPAIR_ADAPTER_UPSTREAM_PROBE_ENABLED",
        requiresApproval: false,
        maxDurationMs: 15_000,
      },
    ),
    policy(
      "retry-upstream-checkpoint",
      "checkpoint_resume",
      ["APOLLOS_ROOT_UPSTREAM_UNREACHABLE"],
      {
        defaultEnabled: false,
        enableEnvironmentVariable: "APOLLOS_REPAIR_ADAPTER_UPSTREAM_RETRY_ENABLED",
        requiresApproval: false,
        maxDurationMs: 60_000,
      },
    ),
    policy(
      "prepare-renderer-fix",
      "internal_change",
      ["APOLLOS_ROOT_VIDEO_RENDERER_FAILED"],
      {
        defaultEnabled: false,
        enableEnvironmentVariable: "APOLLOS_REPAIR_ADAPTER_RENDERER_CHANGE_ENABLED",
        requiresApproval: true,
        maxDurationMs: 120_000,
      },
    ),
    policy(
      "deploy-renderer-fix",
      "deployment_change",
      ["APOLLOS_ROOT_VIDEO_RENDERER_FAILED"],
      {
        defaultEnabled: false,
        enableEnvironmentVariable: "APOLLOS_REPAIR_ADAPTER_DEPLOYMENT_ENABLED",
        requiresApproval: true,
        maxDurationMs: 120_000,
      },
    ),
    policy(
      "private-youtube-test",
      "external_publish",
      ["APOLLOS_ROOT_GOOGLE_CERTIFICATE_PATH_INVALID"],
      {
        defaultEnabled: false,
        enableEnvironmentVariable: "APOLLOS_REPAIR_ADAPTER_EXTERNAL_PUBLISH_ENABLED",
        requiresApproval: true,
        maxDurationMs: 120_000,
      },
    ),
  ]);

function enabled(
  adapterPolicy: ApollosRepairAdapterPolicy,
  env: NodeJS.ProcessEnv,
): boolean {
  const explicitlyEnabled = adapterPolicy.enableEnvironmentVariable
    ? env[adapterPolicy.enableEnvironmentVariable] === "true"
    : adapterPolicy.defaultEnabled;
  return (
    explicitlyEnabled &&
    env[adapterPolicy.killSwitchEnvironmentVariable] !== "true"
  );
}

async function runWithTimeout(
  handler: ApollosRepairAction,
  context: ApollosRepairActionContext,
  maxDurationMs: number,
): Promise<ApollosRepairActionResult> {
  const controller = new AbortController();
  const abort = () => controller.abort(context.signal.reason);
  context.signal.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      handler({ ...context, signal: controller.signal }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort("APOLLOS_REPAIR_ADAPTER_TIMEOUT");
          reject(new Error("APOLLOS_REPAIR_ADAPTER_TIMEOUT"));
        }, maxDurationMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    context.signal.removeEventListener("abort", abort);
  }
}

export function buildApollosRepairAdapterRegistry(input: {
  readonly plan: ApollosRepairPlan;
  readonly handlers: Readonly<Record<string, ApollosRepairAction>>;
  readonly env: NodeJS.ProcessEnv;
}): ApollosRepairAdapterRegistry {
  const actions: Record<string, ApollosRepairAction> = {};
  const decisions = input.plan.steps.map((step) => {
    const adapterPolicy =
      APOLLOS_REPAIR_ADAPTER_POLICIES.find(
        (candidate) => candidate.stepKey === step.key,
      ) ?? null;
    let reasonCode = "APOLLOS_REPAIR_ADAPTER_ALLOWED";
    if (!adapterPolicy) {
      reasonCode = "APOLLOS_REPAIR_ADAPTER_POLICY_MISSING";
    } else if (adapterPolicy.effect !== step.effect) {
      reasonCode = "APOLLOS_REPAIR_ADAPTER_EFFECT_MISMATCH";
    } else if (
      !adapterPolicy.allowedRootCauseCodes.includes(input.plan.rootCauseCode)
    ) {
      reasonCode = "APOLLOS_REPAIR_ADAPTER_ROOT_CAUSE_DENIED";
    } else if (
      step.requiresApproval &&
      !adapterPolicy.requiresApproval
    ) {
      reasonCode = "APOLLOS_REPAIR_ADAPTER_APPROVAL_POLICY_WEAK";
    } else if (!enabled(adapterPolicy, input.env)) {
      reasonCode = "APOLLOS_REPAIR_ADAPTER_DISABLED";
    } else if (!input.handlers[step.key]) {
      reasonCode = "APOLLOS_REPAIR_ADAPTER_HANDLER_MISSING";
    }

    const allowed = reasonCode === "APOLLOS_REPAIR_ADAPTER_ALLOWED";
    if (allowed && adapterPolicy) {
      const handler = input.handlers[step.key]!;
      actions[step.key] = (context) =>
        runWithTimeout(handler, context, adapterPolicy.maxDurationMs);
    }
    return Object.freeze({
      stepKey: step.key,
      allowed,
      reasonCode,
      policy: adapterPolicy,
    });
  });

  return Object.freeze({
    actions: Object.freeze(actions),
    decisions: Object.freeze(decisions),
  });
}
