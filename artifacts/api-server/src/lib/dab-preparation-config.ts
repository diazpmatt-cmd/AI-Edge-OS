export type DabPreparationConfig = {
  enabled: boolean;
  killSwitch: boolean;
  runtimeId: string;
  intervalMs: number;
  timeoutMs: number;
  maxAttempts: number;
  model: string;
  sourceRoot: string;
  sandboxRoot: string;
};

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}

export function readDabPreparationConfig(): DabPreparationConfig {
  const enabled = bool("DAB_PREPARATION_WORKER_ENABLED", false);
  const killSwitch = bool("DAB_PREPARATION_KILL_SWITCH", true);
  const runtimeId = process.env.DAB_PREPARATION_RUNTIME_ID?.trim() ?? "";
  if (enabled && !runtimeId) throw new Error("DAB_PREPARATION_RUNTIME_ID is required when enabled");
  if (enabled && killSwitch) throw new Error("DAB preparation kill switch must be false before the worker can start");
  return {
    enabled,
    killSwitch,
    runtimeId,
    intervalMs: integer("DAB_PREPARATION_INTERVAL_MS", 60_000, 10_000, 3_600_000),
    timeoutMs: integer("DAB_PREPARATION_TIMEOUT_MS", 60_000, 5_000, 120_000),
    maxAttempts: integer("DAB_PREPARATION_MAX_ATTEMPTS", 2, 1, 5),
    model: process.env.DAB_PREPARATION_MODEL?.trim() || process.env.DAB_AGENT_MODEL?.trim() || "gpt-4o-mini",
    sourceRoot: process.env.DAB_PREPARATION_SOURCE_ROOT?.trim() || "/app/preparation-source",
    sandboxRoot: process.env.DAB_PREPARATION_SANDBOX_ROOT?.trim() || "/tmp/dab-preparation",
  };
}
