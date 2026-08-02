export interface DabAgentWorkerConfig {
  readonly enabled: boolean;
  readonly providerEnabled: boolean;
  readonly killSwitch: boolean;
  readonly runtimeId: string;
  readonly intervalMs: number;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
  readonly maxContextBytes: number;
  readonly maxAttempts: number;
  readonly dailyRequestLimit: number;
  readonly dailyTokenLimit: number;
  readonly model: string;
}

function readBoolean(value: string | undefined, fallback: boolean, name: string): boolean {
  if (value == null || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function readInteger(value: string | undefined, fallback: number, name: string, min: number, max: number): number {
  const parsed = value == null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer from ${min} through ${max}`);
  }
  return parsed;
}

export function readDabAgentWorkerConfig(env: NodeJS.ProcessEnv = process.env): DabAgentWorkerConfig {
  const enabled = readBoolean(env.DAB_AGENT_WORKER_ENABLED, false, "DAB_AGENT_WORKER_ENABLED");
  const providerEnabled = readBoolean(env.DAB_AGENT_PROVIDER_ENABLED, false, "DAB_AGENT_PROVIDER_ENABLED");
  const killSwitch = readBoolean(env.DAB_AGENT_KILL_SWITCH, true, "DAB_AGENT_KILL_SWITCH");
  const runtimeId = env.DAB_AGENT_RUNTIME_ID?.trim() || "dab-agent-disabled";
  const model = env.DAB_AGENT_MODEL?.trim() || env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  if (enabled && runtimeId === "dab-agent-disabled") {
    throw new Error("DAB_AGENT_RUNTIME_ID is required when the agent worker is enabled");
  }
  if (enabled && providerEnabled && killSwitch) {
    throw new Error("DAB_AGENT_KILL_SWITCH must be false before provider dispatch can be enabled");
  }
  if (model.length > 120) throw new Error("DAB_AGENT_MODEL is too long");

  return Object.freeze({
    enabled,
    providerEnabled,
    killSwitch,
    runtimeId,
    intervalMs: readInteger(env.DAB_AGENT_INTERVAL_MS, 60_000, "DAB_AGENT_INTERVAL_MS", 10_000, 3_600_000),
    timeoutMs: readInteger(env.DAB_AGENT_TIMEOUT_MS, 45_000, "DAB_AGENT_TIMEOUT_MS", 5_000, 120_000),
    maxOutputTokens: readInteger(env.DAB_AGENT_MAX_OUTPUT_TOKENS, 700, "DAB_AGENT_MAX_OUTPUT_TOKENS", 100, 2_000),
    maxContextBytes: readInteger(env.DAB_AGENT_MAX_CONTEXT_BYTES, 16_384, "DAB_AGENT_MAX_CONTEXT_BYTES", 1_024, 65_536),
    maxAttempts: readInteger(env.DAB_AGENT_MAX_ATTEMPTS, 2, "DAB_AGENT_MAX_ATTEMPTS", 1, 3),
    dailyRequestLimit: readInteger(env.DAB_AGENT_DAILY_REQUEST_LIMIT, 12, "DAB_AGENT_DAILY_REQUEST_LIMIT", 1, 100),
    dailyTokenLimit: readInteger(env.DAB_AGENT_DAILY_TOKEN_LIMIT, 24_000, "DAB_AGENT_DAILY_TOKEN_LIMIT", 1_000, 500_000),
    model,
  });
}
