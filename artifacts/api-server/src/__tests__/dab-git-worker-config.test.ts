import { describe, expect, it } from "vitest";
import { readDabGitWorkerConfig, sanitizeDabGitWorkerConfig } from "../lib/dab-git-worker-config.js";

describe("DAB Git worker config", () => {
  it("fails closed by default", () => {
    const config = readDabGitWorkerConfig({});
    expect(config.enabled).toBe(false);
    expect(config.killSwitch).toBe(true);
    expect(config.credentialPresent).toBe(false);
    expect(config.readinessCode).toBe("DAB_GIT_WORKER_DISABLED");
  });

  it("requires kill switch off and a credential before readiness", () => {
    expect(readDabGitWorkerConfig({ DAB_GIT_WORKER_ENABLED: "true" }).readinessCode).toBe("DAB_GIT_WORKER_KILL_SWITCH");
    expect(readDabGitWorkerConfig({ DAB_GIT_WORKER_ENABLED: "true", DAB_GIT_WORKER_KILL_SWITCH: "false" }).readinessCode).toBe("DAB_GIT_WORKER_CREDENTIAL_MISSING");
    expect(readDabGitWorkerConfig({ DAB_GIT_WORKER_ENABLED: "true", DAB_GIT_WORKER_KILL_SWITCH: "false", DAB_GIT_GITHUB_TOKEN: "fixture-secret" }).readinessCode).toBe("DAB_GIT_WORKER_READY");
  });

  it("rejects repository widening", () => {
    expect(readDabGitWorkerConfig({ DAB_GIT_WORKER_ENABLED: "true", DAB_GIT_WORKER_KILL_SWITCH: "false", DAB_GIT_GITHUB_TOKEN: "fixture-secret", DAB_GIT_REPOSITORY: "someone/else" }).readinessCode).toBe("DAB_GIT_WORKER_REPOSITORY_MISMATCH");
    expect(readDabGitWorkerConfig({ DAB_GIT_WORKER_ENABLED: "true", DAB_GIT_WORKER_KILL_SWITCH: "false", DAB_GIT_GITHUB_TOKEN: "fixture-secret", DAB_GIT_REPOSITORY_ID: "1" }).readinessCode).toBe("DAB_GIT_WORKER_REPOSITORY_MISMATCH");
  });

  it("never exposes the credential through sanitized diagnostics", () => {
    const config = readDabGitWorkerConfig({ DAB_GIT_WORKER_ENABLED: "true", DAB_GIT_WORKER_KILL_SWITCH: "false", DAB_GIT_GITHUB_TOKEN: "fixture-secret" });
    const safe = sanitizeDabGitWorkerConfig(config);
    expect(JSON.stringify(safe)).not.toContain("fixture-secret");
    expect(safe.credentialPresent).toBe(true);
  });
});
