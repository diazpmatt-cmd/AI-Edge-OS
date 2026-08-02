export interface DabPlannerWorkerConfig {
  readonly enabled: boolean;
  readonly killSwitch: boolean;
  readonly runtimeId: string;
  readonly scheduleId: string;
  readonly intervalMs: number;
  readonly leaseMs: number;
  readonly activationAuthorizationRef: string;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("DAB_PLANNER_INVALID_BOOLEAN");
}

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("DAB_PLANNER_INVALID_INTEGER");
  }
  return parsed;
}

function parseId(value: string | undefined, fallback: string): string {
  const resolved = value?.trim() || fallback;
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(resolved)) {
    throw new Error("DAB_PLANNER_INVALID_IDENTIFIER");
  }
  return resolved;
}

export function readDabPlannerWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): DabPlannerWorkerConfig {
  const enabled = parseBoolean(environment["DAB_PLANNER_WORKER_ENABLED"], false);
  const activationAuthorizationRef =
    environment["DAB_PLANNER_ACTIVATION_AUTHORIZATION_REF"]?.trim() || "";

  if (enabled && !activationAuthorizationRef) {
    throw new Error("DAB_PLANNER_ACTIVATION_AUTHORIZATION_REQUIRED");
  }

  return Object.freeze({
    enabled,
    killSwitch: parseBoolean(environment["DAB_PLANNER_KILL_SWITCH"], true),
    runtimeId: parseId(environment["DAB_PLANNER_RUNTIME_ID"], "dab-planner-production-1"),
    scheduleId: parseId(environment["DAB_PLANNER_SCHEDULE_ID"], "dab-planner"),
    intervalMs: parseBoundedInteger(
      environment["DAB_PLANNER_INTERVAL_MS"],
      60_000,
      10_000,
      3_600_000,
    ),
    leaseMs: parseBoundedInteger(
      environment["DAB_PLANNER_LEASE_MS"],
      120_000,
      30_000,
      600_000,
    ),
    activationAuthorizationRef,
  });
}
