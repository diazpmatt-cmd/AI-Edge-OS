import { pool } from "@workspace/db";
import type { TrustedDevelopmentActor } from "../../../lib/development-control/src/index.js";
import { createDevelopmentControlDatabaseConfig, createDevelopmentControlStoreRuntime } from "../../../lib/development-control-store/src/index.js";
import { readDabGitWorkerConfig, sanitizeDabGitWorkerConfig } from "./lib/dab-git-worker-config.js";
import { createDabGitCommandRunner } from "./lib/dab-git-command-runner.js";
import { DabGitWorkspaceAdapter } from "./lib/dab-git-workspace-adapter.js";
import { DabGitHubTransportAdapter } from "./lib/dab-github-transport-adapter.js";
import { createDabGitHubHttpClient } from "./lib/dab-github-http-client.js";
import { DabGitHubPostMergeObserver } from "./lib/dab-github-post-merge-observer.js";
import { resolveNextDabGitMission } from "./lib/dab-git-mission-resolver.js";
import { DabGitMissionRunner, type DabGitMissionResult } from "./lib/dab-git-mission-runner.js";

const config = readDabGitWorkerConfig(process.env);
const safe = sanitizeDabGitWorkerConfig(config);
const intervalMs = 15_000;
const leaseMs = 120_000;
let stopped = false;

const actor: TrustedDevelopmentActor = Object.freeze({
  actorId: `bounded:${config.runtimeId}`,
  displayName: "Apollos Git Worker",
  actorType: "bounded_sub_agent",
  verified: true,
  developmentControl: true,
});

function log(event: string, detail: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, runtimeId: config.runtimeId, ...detail }));
}

async function ensureClaim(store: ReturnType<typeof createDevelopmentControlStoreRuntime>["store"], taskId: string) {
  let task = await store.getTask(taskId);
  const now = new Date();
  if (task.claim && Date.parse(task.claim.expiresAt) <= now.getTime()) {
    task = await store.recoverExpiredClaim({ taskId, actor, expectedTaskVersion: task.version, recoveredAt: now.toISOString(), idempotencyKey: `dab-git-recover:${taskId}:${task.claim.leaseVersion}` });
  }
  if (task.state === "approved" && !task.claim) {
    task = await store.claimTask({ taskId, actor, observedGitSha: task.specification.expectedOriginMainSha, expectedTaskVersion: task.version, claimedAt: now.toISOString(), leaseDurationMs: leaseMs, idempotencyKey: `dab-git-claim:${taskId}:${task.specification.specificationHash}` });
  }
  if (!task.claim || task.claim.owner.actorId !== actor.actorId) throw new Error("DAB_GIT_WORKER_CLAIM_UNAVAILABLE");
  if (task.state === "claimed") {
    task = await store.transitionTask({ taskId, nextState: "in_progress", actor, observedGitSha: task.specification.expectedOriginMainSha, expectedTaskVersion: task.version, reasonCode: "dab_git_worker_started", timestamp: new Date().toISOString(), idempotencyKey: `dab-git-start:${taskId}:${task.specification.specificationHash}` });
  }
  if (task.claim && Date.parse(task.claim.expiresAt) - Date.now() < leaseMs / 2) {
    task = await store.renewClaim({ taskId, actor, expectedTaskVersion: task.version, expectedLeaseVersion: task.claim.leaseVersion, renewedAt: new Date().toISOString(), leaseDurationMs: leaseMs, idempotencyKey: `dab-git-renew:${taskId}:${task.claim.leaseVersion}` });
  }
  return task;
}

async function recordResult(store: ReturnType<typeof createDevelopmentControlStoreRuntime>["store"], taskId: string, result: DabGitMissionResult): Promise<void> {
  const milestone = result.step === "commit" ? ["committed", result.commitReceipt?.commitSha]
    : result.step === "push" ? ["pushed", result.pushReceipt?.commitSha]
      : result.step === "pull_request" ? ["pull_request_opened", result.prReceipt ? `pr:${result.prReceipt.prNumber}` : null]
        : result.step === "merge" ? ["merged", result.mergeReceipt?.mergeSha]
          : null;
  if (!milestone) return;
  const task = await store.getTask(taskId);
  if (task.milestones.some((item) => item.kind === milestone[0] && item.status === "verified")) return;
  await store.recordMilestone({ taskId, kind: milestone[0] as "committed" | "pushed" | "pull_request_opened" | "merged", status: "verified", evidence: milestone[1] ?? null, actor, expectedTaskVersion: task.version, recordedAt: new Date().toISOString(), idempotencyKey: `dab-git-milestone:${taskId}:${milestone[0]}:${milestone[1] ?? "none"}` });
}

async function completeTask(store: ReturnType<typeof createDevelopmentControlStoreRuntime>["store"], taskId: string): Promise<void> {
  let task = await store.getTask(taskId);
  if (task.state === "in_progress") task = await store.transitionTask({ taskId, nextState: "review_requested", actor, observedGitSha: task.specification.expectedOriginMainSha, expectedTaskVersion: task.version, reasonCode: "dab_git_post_merge_verified", timestamp: new Date().toISOString(), idempotencyKey: `dab-git-review:${taskId}:${task.specification.specificationHash}` });
  if (task.state === "review_requested") task = await store.transitionTask({ taskId, nextState: "verified", actor, observedGitSha: task.specification.expectedOriginMainSha, expectedTaskVersion: task.version, reasonCode: "dab_git_verified", timestamp: new Date().toISOString(), idempotencyKey: `dab-git-verified:${taskId}:${task.specification.specificationHash}` });
  if (task.state === "verified") await store.transitionTask({ taskId, nextState: "completed", actor, observedGitSha: task.specification.expectedOriginMainSha, expectedTaskVersion: task.version, reasonCode: "dab_git_completed", timestamp: new Date().toISOString(), idempotencyKey: `dab-git-complete:${taskId}:${task.specification.specificationHash}` });
}

async function main(): Promise<void> {
  log("dab_git_worker_readiness", safe);
  if (config.readinessCode !== "DAB_GIT_WORKER_READY") {
    log("dab_git_worker_inert", { code: config.readinessCode });
    return;
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DAB_GIT_WORKER_DATABASE_URL_REQUIRED");
  const control = createDevelopmentControlStoreRuntime({ database: createDevelopmentControlDatabaseConfig({ connectionString: databaseUrl, maxConnections: 3 }) });
  const git = createDabGitCommandRunner(config);
  const workspace = new DabGitWorkspaceAdapter({ config, runner: git });
  const http = createDabGitHubHttpClient(config);
  const transport = new DabGitHubTransportAdapter({ config, git, http });
  const postMerge = new DabGitHubPostMergeObserver({ config, http });
  log("dab_git_worker_started", { repository: config.repository });
  try {
    while (!stopped) {
      try {
        const resolved = await resolveNextDabGitMission({ sql: pool, store: control.store });
        if (!resolved) {
          log("dab_git_worker_heartbeat", { status: "idle" });
        } else {
          await ensureClaim(control.store, resolved.mission.taskId);
          const runner = new DabGitMissionRunner({ mission: resolved.mission, workspace, transport, receipts: control.gitReceipts, postMerge, actorId: actor.actorId, workloadIdentity: config.runtimeId, killSwitch: config.killSwitch });
          const result = await runner.runOne();
          await recordResult(control.store, resolved.mission.taskId, result);
          if (result.status === "complete") await completeTask(control.store, resolved.mission.taskId);
          log("dab_git_worker_heartbeat", { status: result.status, taskId: resolved.mission.taskId, step: result.step });
        }
      } catch (error) {
        log("dab_git_worker_blocked", { code: error instanceof Error ? error.message.slice(0, 240) : "DAB_GIT_WORKER_UNKNOWN_ERROR" });
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  } finally {
    await control.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { stopped = true; log("dab_git_worker_shutdown", { signal }); });
main().catch((error) => { log("dab_git_worker_startup_failed", { code: error instanceof Error ? error.message : "unknown" }); process.exit(1); });
