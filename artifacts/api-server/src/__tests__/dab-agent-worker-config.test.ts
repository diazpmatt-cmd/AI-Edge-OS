import { describe, expect, it } from "vitest";
import { readDabAgentWorkerConfig } from "../lib/dab-agent-worker-config";

describe("readDabAgentWorkerConfig", () => {
  it("defaults to inert with provider disabled and kill switch engaged", () => {
    const config = readDabAgentWorkerConfig({});
    expect(config.enabled).toBe(false);
    expect(config.providerEnabled).toBe(false);
    expect(config.killSwitch).toBe(true);
  });

  it("accepts a bounded production profile", () => {
    const config = readDabAgentWorkerConfig({
      DAB_AGENT_WORKER_ENABLED: "true",
      DAB_AGENT_PROVIDER_ENABLED: "true",
      DAB_AGENT_KILL_SWITCH: "false",
      DAB_AGENT_RUNTIME_ID: "dab-agent-production-1",
      DAB_AGENT_INTERVAL_MS: "60000",
      DAB_AGENT_TIMEOUT_MS: "45000",
      DAB_AGENT_MAX_OUTPUT_TOKENS: "700",
      DAB_AGENT_MAX_CONTEXT_BYTES: "16384",
      DAB_AGENT_MAX_ATTEMPTS: "2",
      DAB_AGENT_DAILY_REQUEST_LIMIT: "12",
      DAB_AGENT_DAILY_TOKEN_LIMIT: "24000",
    });
    expect(config.enabled).toBe(true);
    expect(config.providerEnabled).toBe(true);
    expect(config.dailyRequestLimit).toBe(12);
    expect(config.dailyTokenLimit).toBe(24000);
  });

  it("rejects provider activation while the kill switch is engaged", () => {
    expect(() => readDabAgentWorkerConfig({
      DAB_AGENT_WORKER_ENABLED: "true",
      DAB_AGENT_PROVIDER_ENABLED: "true",
      DAB_AGENT_KILL_SWITCH: "true",
      DAB_AGENT_RUNTIME_ID: "agent-1",
    })).toThrow(/kill switch/i);
  });

  it("rejects an enabled worker without an explicit runtime id", () => {
    expect(() => readDabAgentWorkerConfig({ DAB_AGENT_WORKER_ENABLED: "true" }))
      .toThrow(/runtime_id/i);
  });

  it("rejects malformed booleans and unbounded values", () => {
    expect(() => readDabAgentWorkerConfig({ DAB_AGENT_WORKER_ENABLED: "yes" }))
      .toThrow(/true or false/i);
    expect(() => readDabAgentWorkerConfig({ DAB_AGENT_MAX_OUTPUT_TOKENS: "10000" }))
      .toThrow(/100 through 2000/i);
  });
});
