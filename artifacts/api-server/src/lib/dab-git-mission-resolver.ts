import type {
  ApprovalRecord,
  AuthorizationCategory,
  DevelopmentCoordinationStore,
  TaskRecord,
} from "../../../../lib/development-control/src/index.js";
import { DAB_GIT_CI_REPAIR_CONSTRAINT, type DabGitCiRepairHandoffReceipt } from "./dab-git-ci-repair-handoff.js";
import { DAB_GIT_MUTATION_AUTHORIZATIONS, type DabGitMissionAuthorizationMap, type DabResolvedGitMission } from "./dab-git-mission-runner.js";
import { sha256, validateManifest } from "./dab-preparation-policy.js";

export interface DabGitMissionQueryClient {
  query<T extends Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

type PreparedCandidate = {
  job_id: string;
  proposal_id: string;
  proposal_fingerprint: string;
  context_hash: string;
  manifest_content: string;
  manifest_sha256: string;
  completed_at: string | null;
  task_id: string;
};

type RepairHandoffRow = { receipt: DabGitCiRepairHandoffReceipt };

function isRepairApproval(approval: ApprovalRecord): boolean {
  return approval.categories.includes("editing") && approval.constraints.includes(DAB_GIT_CI_REPAIR_CONSTRAINT);
}

function latestApprovalForCategory(input: {
  approvals: readonly ApprovalRecord[];
  task: TaskRecord;
  category: AuthorizationCategory;
  now: Date;
}): ApprovalRecord {
  const relevant = input.approvals
    .filter((approval) => approval.categories.includes(input.category) && (input.category !== "editing" || !isRepairApproval(approval)))
    .sort((a, b) => Date.parse(b.decidedAt) - Date.parse(a.decidedAt));
  const latest = relevant[0];
  if (!latest) throw new Error(`DAB_GIT_RESOLVER_${input.category.toUpperCase()}_APPROVAL_MISSING`);
  if (latest.decision !== "approved") throw new Error(`DAB_GIT_RESOLVER_${input.category.toUpperCase()}_NOT_APPROVED`);
  if (latest.specificationRevision !== input.task.specification.revision || latest.specificationHash !== input.task.specification.specificationHash || latest.expectedGitSha !== input.task.specification.expectedOriginMainSha) {
    throw new Error(`DAB_GIT_RESOLVER_${input.category.toUpperCase()}_APPROVAL_STALE`);
  }
  if (latest.expiresAt && Date.parse(latest.expiresAt) <= input.now.getTime()) throw new Error(`DAB_GIT_RESOLVER_${input.category.toUpperCase()}_APPROVAL_EXPIRED`);
  if (!latest.decidingActor.verified || latest.decidingActor.actorType !== "human_authority") throw new Error(`DAB_GIT_RESOLVER_${input.category.toUpperCase()}_ACTOR_INVALID`);
  return latest;
}

function latestRepairApproval(approvals: readonly ApprovalRecord[], task: TaskRecord, now: Date): ApprovalRecord | null {
  const latest = approvals.filter(isRepairApproval).sort((a, b) => Date.parse(b.decidedAt) - Date.parse(a.decidedAt))[0];
  if (!latest || latest.decision !== "approved") return null;
  if (latest.specificationRevision !== task.specification.revision || latest.specificationHash !== task.specification.specificationHash || latest.expectedGitSha !== task.specification.expectedOriginMainSha) return null;
  if (latest.expiresAt && Date.parse(latest.expiresAt) <= now.getTime()) return null;
  if (!latest.decidingActor.verified || latest.decidingActor.actorType !== "human_authority") return null;
  return latest;
}

function authorizationMap(task: TaskRecord, approvals: readonly ApprovalRecord[], now: Date): DabGitMissionAuthorizationMap {
  return Object.freeze(Object.fromEntries(DAB_GIT_MUTATION_AUTHORIZATIONS.map((category) => [category, latestApprovalForCategory({ approvals, task, category, now })])) as unknown as DabGitMissionAuthorizationMap);
}

function exactAuthorizedFiles(task: TaskRecord, manifestContent: string): readonly string[] {
  let parsed: unknown;
  try { parsed = JSON.parse(manifestContent); } catch { throw new Error("DAB_GIT_RESOLVER_MANIFEST_JSON_INVALID"); }
  const manifest = validateManifest("prepare_code_patch", parsed);
  const manifestPaths = manifest.files.map((file) => file.path).sort();
  const authorized = [...task.specification.authorizedFiles].sort();
  if (manifestPaths.length < 1 || JSON.stringify(manifestPaths) !== JSON.stringify(authorized)) throw new Error("DAB_GIT_RESOLVER_FILE_SCOPE_MISMATCH");
  return Object.freeze(manifestPaths);
}

function validRepairHandoff(receipt: DabGitCiRepairHandoffReceipt | null, task: TaskRecord, files: readonly string[]): DabGitCiRepairHandoffReceipt | null {
  if (!receipt) return null;
  if (receipt.operation !== "ci_repair_handoff" || receipt.outcome !== "requested") return null;
  if (receipt.taskId !== task.specification.taskId || receipt.specificationRevision !== task.specification.revision || receipt.specificationHash !== task.specification.specificationHash) return null;
  if (receipt.expectedBaseSha !== task.specification.expectedOriginMainSha || !/^[a-f0-9]{40}$/.test(receipt.failedHeadSha)) return null;
  if (!Number.isInteger(receipt.prNumber) || receipt.prNumber <= 0 || !Number.isInteger(receipt.attempt) || receipt.attempt < 1 || receipt.attempt > receipt.maxAttempts) return null;
  if (JSON.stringify([...receipt.authorizedFiles].sort()) !== JSON.stringify([...files].sort())) return null;
  return receipt;
}

export async function resolveNextDabGitMission(input: {
  sql: DabGitMissionQueryClient;
  store: DevelopmentCoordinationStore;
  now?: Date;
}): Promise<{ mission: DabResolvedGitMission; task: TaskRecord } | null> {
  const now = input.now ?? new Date();
  const candidateResult = await input.sql.query<PreparedCandidate>(`
    SELECT j.job_id,
           j.proposal_id,
           j.proposal_fingerprint,
           j.context_hash,
           a.content AS manifest_content,
           a.sha256 AS manifest_sha256,
           j.completed_at::text AS completed_at,
           c.task_id
      FROM dab_preparation_jobs j
      JOIN dab_preparation_artifacts a
        ON a.job_id = j.job_id AND a.kind = 'manifest'
      JOIN dab_approval_proposals p
        ON p.proposal_id = j.proposal_id
      JOIN dab_agent_requests r
        ON r.request_id = p.request_id
      JOIN dab_runner_cycles c
        ON c.cycle_key = r.context->'planner'->>'attemptedCycleKey'
     WHERE j.status = 'succeeded'
       AND j.capability = 'prepare_code_patch'
       AND p.status = 'approved'
       AND c.task_id IS NOT NULL
     ORDER BY j.completed_at ASC NULLS LAST, j.created_at ASC
     LIMIT 25
  `);

  for (const row of candidateResult.rows) {
    if (!row.task_id || !row.job_id || !row.proposal_id || !row.proposal_fingerprint || !row.context_hash || !row.manifest_content || !row.manifest_sha256) continue;
    if (!/^[a-f0-9]{64}$/.test(row.proposal_fingerprint) || !/^[a-f0-9]{64}$/.test(row.context_hash) || !/^[a-f0-9]{64}$/.test(row.manifest_sha256)) continue;
    if (sha256(row.manifest_content) !== row.manifest_sha256) continue;

    let task: TaskRecord;
    try { task = await input.store.getTask(row.task_id); } catch { continue; }
    if (!["approved", "claimed", "in_progress", "review_requested", "verified"].includes(task.state)) continue;
    if (task.specification.taskType !== "implementation" || task.specification.branchMode !== "dedicated_branch" || !task.specification.intendedBranch) continue;
    if (task.specification.intendedBranch === "main" || task.specification.intendedBranch === "master") continue;

    let files: readonly string[];
    let approvals: DabGitMissionAuthorizationMap;
    let repairApproval: ApprovalRecord | null;
    try {
      files = exactAuthorizedFiles(task, row.manifest_content);
      const taskApprovals = await input.store.getApprovals(task.specification.taskId);
      approvals = authorizationMap(task, taskApprovals, now);
      repairApproval = latestRepairApproval(taskApprovals, task, now);
    } catch {
      continue;
    }

    let repairHandoff: DabGitCiRepairHandoffReceipt | null = null;
    try {
      const repairRows = await input.sql.query<RepairHandoffRow>(`
        SELECT result->'receipt' AS receipt
          FROM development_idempotency_records
         WHERE operation='git_receipt:repair_handoff'
           AND task_id=$1
         ORDER BY created_at DESC
         LIMIT 1
      `, [task.specification.taskId]);
      repairHandoff = validRepairHandoff(repairRows.rows[0]?.receipt ?? null, task, files);
    } catch {
      continue;
    }

    if (repairHandoff) {
      if (!row.completed_at || Date.parse(row.completed_at) <= Date.parse(repairHandoff.createdAt)) continue;
      if (row.job_id === repairHandoff.sourcePreparationJobId || row.proposal_id === repairHandoff.sourceProposalId) continue;
    }

    return Object.freeze({
      task,
      mission: Object.freeze({
        taskId: task.specification.taskId,
        specificationRevision: task.specification.revision,
        specificationHash: task.specification.specificationHash,
        preparationJobId: row.job_id,
        proposalId: row.proposal_id,
        proposalFingerprint: row.proposal_fingerprint,
        contextHash: row.context_hash,
        manifestContent: row.manifest_content,
        manifestSha256: row.manifest_sha256,
        expectedBaseSha: task.specification.expectedOriginMainSha,
        branchName: task.specification.intendedBranch,
        authorizedFiles: files,
        approvals,
        repairApproval,
        repairAttempt: repairHandoff?.attempt ?? 0,
        expectedRemoteSha: repairHandoff?.failedHeadSha ?? null,
        existingPrNumber: repairHandoff?.prNumber ?? null,
      }),
    });
  }
  return null;
}
