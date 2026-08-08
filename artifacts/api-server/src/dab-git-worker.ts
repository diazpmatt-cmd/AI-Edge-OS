import { readDabGitWorkerConfig, sanitizeDabGitWorkerConfig } from "./lib/dab-git-worker-config.js";

const config = readDabGitWorkerConfig(process.env);
const safe = sanitizeDabGitWorkerConfig(config);

console.log(JSON.stringify({ event: "dab_git_worker_readiness", ...safe }));

if (config.readinessCode === "DAB_GIT_WORKER_READY") {
  console.log(JSON.stringify({
    event: "dab_git_worker_activation_blocked",
    code: "DAB_GIT_WORKER_HANDLER_NOT_REGISTERED",
    message: "Credential readiness alone does not authorize or register repository mutation handlers.",
  }));
}

const timer = setInterval(() => {
  console.log(JSON.stringify({ event: "dab_git_worker_heartbeat", runtimeId: config.runtimeId, readinessCode: config.readinessCode }));
}, 60_000);

timer.unref();
await new Promise<void>(() => undefined);
