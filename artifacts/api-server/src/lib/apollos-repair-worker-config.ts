export interface ApollosRepairWorkerConfig {
  readonly enabled: boolean;
  readonly killSwitch: boolean;
  readonly runtimeId: string;
  readonly intervalMs: number;
  readonly leaseMs: number;
  readonly maxAttempts: number;
}

function integer(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(code);
  }
  return parsed;
}

export function readApollosRepairWorkerConfig(
  env: NodeJS.ProcessEnv,
): ApollosRepairWorkerConfig {
  const runtimeId =
    env.APOLLOS_REPAIR_RUNTIME_ID?.trim() || "apollos-repair-production-1";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(runtimeId)) {
    throw new Error("APOLLOS_REPAIR_RUNTIME_ID_INVALID");
  }
  return Object.freeze({
    enabled: env.APOLLOS_REPAIR_WORKER_ENABLED === "true",
    killSwitch: env.APOLLOS_REPAIR_KILL_SWITCH !== "false",
    runtimeId,
    intervalMs: integer(
      env.APOLLOS_REPAIR_INTERVAL_MS,
      15_000,
      1_000,
      300_000,
      "APOLLOS_REPAIR_INTERVAL_INVALID",
    ),
    leaseMs: integer(
      env.APOLLOS_REPAIR_LEASE_MS,
      120_000,
      30_000,
      3_600_000,
      "APOLLOS_REPAIR_LEASE_INVALID",
    ),
    maxAttempts: integer(
      env.APOLLOS_REPAIR_MAX_ATTEMPTS,
      1,
      1,
      3,
      "APOLLOS_REPAIR_ATTEMPTS_INVALID",
    ),
  });
}
