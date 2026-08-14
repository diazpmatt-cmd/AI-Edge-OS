import { createHash } from "node:crypto";
import type { DabGitCommitReceipt } from "./dab-git-commit-handler.js";

export type DabGitPushReceipt = Readonly<{ outcome:"verified"; repositoryId:string; branchName:string; commitSha:string; pushAuthorizationRef:string; actorId:string; workloadIdentity:string; requestFingerprint:string; idempotencyKey:string; pushedAt:string }>;
export type DabGitPrReceipt = Readonly<{ outcome:"verified"; repositoryId:string; prNumber:number; headBranch:string; headSha:string; baseBranch:string; baseSha:string; prAuthorizationRef:string; actorId:string; workloadIdentity:string; requestFingerprint:string; idempotencyKey:string; createdAt:string }>;
export interface ReceiptStore<T>{getByIdempotencyKey(key:string):Promise<T|null>;save(value:T):Promise<void>}
export interface DabGitPushPrAdapter {
  observeRemoteBranch(input:{repositoryId:string;branchName:string}):Promise<{headSha:string|null}>;
  pushCommit(input:{repositoryId:string;branchName:string;commitSha:string;expectedRemoteSha:string|null;idempotencyKey:string}):Promise<{branchName:string;headSha:string}>;
  observeBase(input:{repositoryId:string;baseBranch:string}):Promise<{baseSha:string}>;
  createPullRequest(input:{repositoryId:string;headBranch:string;headSha:string;baseBranch:string;baseSha:string;idempotencyKey:string}):Promise<{prNumber:number;headBranch:string;headSha:string;baseBranch:string;baseSha:string}>;
  observePullRequest?(input:{repositoryId:string;prNumber:number}):Promise<{headSha:string;baseSha:string;mergeable:boolean}>;
}
const sha=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const goodSha=(v:string)=>/^[a-f0-9]{40}$/.test(v);
function enabled(input:{authorizationUsable:boolean;killSwitch:boolean;adapterEnabled:boolean;handlerRegistered:boolean},prefix:string){if(!input.authorizationUsable)throw new Error(`${prefix}_AUTHORIZATION_UNUSABLE`);if(input.killSwitch)throw new Error(`${prefix}_KILL_SWITCH`);if(!input.adapterEnabled)throw new Error(`${prefix}_ADAPTER_DISABLED`);if(!input.handlerRegistered)throw new Error(`${prefix}_HANDLER_MISSING`);}

export async function pushCommittedArtifact(input:{commitReceipt:DabGitCommitReceipt;expectedRemoteSha:string|null;defaultBranch:string;pushAuthorizationRef:string;authorizationUsable:boolean;killSwitch:boolean;adapterEnabled:boolean;handlerRegistered:boolean;actorId:string;workloadIdentity:string;adapter:DabGitPushPrAdapter;receipts:ReceiptStore<DabGitPushReceipt>;now?:()=>Date}):Promise<DabGitPushReceipt>{
  if(input.commitReceipt.outcome!=="verified")throw new Error("DAB_GIT_PUSH_COMMIT_RECEIPT_INVALID");
  if(input.commitReceipt.branchName===input.defaultBranch)throw new Error("DAB_GIT_PUSH_DEFAULT_BRANCH_FORBIDDEN");
  if(!input.pushAuthorizationRef.trim())throw new Error("DAB_GIT_PUSH_AUTHORIZATION_REQUIRED");
  const material={repositoryId:input.commitReceipt.repositoryId,branchName:input.commitReceipt.branchName,commitSha:input.commitReceipt.commitSha,expectedRemoteSha:input.expectedRemoteSha,pushAuthorizationRef:input.pushAuthorizationRef.trim()};
  const requestFingerprint=sha(material),idempotencyKey=`dab-git-push:${requestFingerprint}`;
  const prior=await input.receipts.getByIdempotencyKey(idempotencyKey);if(prior)return prior;
  enabled(input,"DAB_GIT_PUSH");
  const remote=await input.adapter.observeRemoteBranch({repositoryId:material.repositoryId,branchName:material.branchName});
  if(remote.headSha!==input.expectedRemoteSha)throw new Error("DAB_GIT_PUSH_REMOTE_SHA_MISMATCH");
  const pushed=await input.adapter.pushCommit({repositoryId:material.repositoryId,branchName:material.branchName,commitSha:material.commitSha,expectedRemoteSha:input.expectedRemoteSha,idempotencyKey});
  if(pushed.branchName!==material.branchName||pushed.headSha!==material.commitSha)throw new Error("DAB_GIT_PUSH_VERIFICATION_FAILED");
  const receipt=Object.freeze({outcome:"verified" as const,repositoryId:material.repositoryId,branchName:material.branchName,commitSha:material.commitSha,pushAuthorizationRef:material.pushAuthorizationRef,actorId:input.actorId.trim(),workloadIdentity:input.workloadIdentity.trim(),requestFingerprint,idempotencyKey,pushedAt:(input.now??(()=>new Date()))().toISOString()});await input.receipts.save(receipt);return receipt;
}

export async function createBoundPullRequest(input:{pushReceipt:DabGitPushReceipt;baseBranch:string;expectedBaseSha:string;prAuthorizationRef:string;authorizationUsable:boolean;killSwitch:boolean;adapterEnabled:boolean;handlerRegistered:boolean;actorId:string;workloadIdentity:string;adapter:DabGitPushPrAdapter;receipts:ReceiptStore<DabGitPrReceipt>;now?:()=>Date}):Promise<DabGitPrReceipt>{
  if(input.pushReceipt.outcome!=="verified")throw new Error("DAB_GIT_PR_PUSH_RECEIPT_INVALID");if(!goodSha(input.expectedBaseSha))throw new Error("DAB_GIT_PR_BASE_SHA_INVALID");if(!input.prAuthorizationRef.trim())throw new Error("DAB_GIT_PR_AUTHORIZATION_REQUIRED");
  const material={repositoryId:input.pushReceipt.repositoryId,headBranch:input.pushReceipt.branchName,headSha:input.pushReceipt.commitSha,baseBranch:input.baseBranch,baseSha:input.expectedBaseSha,prAuthorizationRef:input.prAuthorizationRef.trim()};const requestFingerprint=sha(material),idempotencyKey=`dab-git-pr:${requestFingerprint}`;
  const prior=await input.receipts.getByIdempotencyKey(idempotencyKey);if(prior)return prior;enabled(input,"DAB_GIT_PR");
  const base=await input.adapter.observeBase({repositoryId:material.repositoryId,baseBranch:material.baseBranch});if(base.baseSha!==material.baseSha)throw new Error("DAB_GIT_PR_BASE_SHA_MISMATCH");
  const pr=await input.adapter.createPullRequest({...material,idempotencyKey});if(!Number.isInteger(pr.prNumber)||pr.prNumber<=0||pr.headBranch!==material.headBranch||pr.headSha!==material.headSha||pr.baseBranch!==material.baseBranch||pr.baseSha!==material.baseSha)throw new Error("DAB_GIT_PR_VERIFICATION_FAILED");
  const receipt=Object.freeze({outcome:"verified" as const,repositoryId:material.repositoryId,prNumber:pr.prNumber,headBranch:material.headBranch,headSha:material.headSha,baseBranch:material.baseBranch,baseSha:material.baseSha,prAuthorizationRef:material.prAuthorizationRef,actorId:input.actorId.trim(),workloadIdentity:input.workloadIdentity.trim(),requestFingerprint,idempotencyKey,createdAt:(input.now??(()=>new Date()))().toISOString()});await input.receipts.save(receipt);return receipt;
}

export async function rebindBoundPullRequest(input:{existingPrNumber:number;priorHeadSha:string;pushReceipt:DabGitPushReceipt;baseBranch:string;expectedBaseSha:string;prAuthorizationRef:string;authorizationUsable:boolean;killSwitch:boolean;adapterEnabled:boolean;handlerRegistered:boolean;actorId:string;workloadIdentity:string;adapter:DabGitPushPrAdapter;receipts:ReceiptStore<DabGitPrReceipt>;now?:()=>Date}):Promise<DabGitPrReceipt>{
  if(input.pushReceipt.outcome!=="verified")throw new Error("DAB_GIT_PR_REBIND_PUSH_RECEIPT_INVALID");
  if(!Number.isInteger(input.existingPrNumber)||input.existingPrNumber<=0)throw new Error("DAB_GIT_PR_REBIND_PR_NUMBER_INVALID");
  if(!goodSha(input.priorHeadSha)||!goodSha(input.pushReceipt.commitSha)||!goodSha(input.expectedBaseSha))throw new Error("DAB_GIT_PR_REBIND_SHA_INVALID");
  if(input.priorHeadSha===input.pushReceipt.commitSha)throw new Error("DAB_GIT_PR_REBIND_HEAD_UNCHANGED");
  if(!input.prAuthorizationRef.trim())throw new Error("DAB_GIT_PR_REBIND_AUTHORIZATION_REQUIRED");
  const material={repositoryId:input.pushReceipt.repositoryId,prNumber:input.existingPrNumber,headBranch:input.pushReceipt.branchName,priorHeadSha:input.priorHeadSha,headSha:input.pushReceipt.commitSha,baseBranch:input.baseBranch,baseSha:input.expectedBaseSha,prAuthorizationRef:input.prAuthorizationRef.trim()};
  const requestFingerprint=sha(material),idempotencyKey=`dab-git-pr-rebind:${requestFingerprint}`;
  const prior=await input.receipts.getByIdempotencyKey(idempotencyKey);if(prior)return prior;
  enabled(input,"DAB_GIT_PR_REBIND");
  if(!input.adapter.observePullRequest)throw new Error("DAB_GIT_PR_REBIND_HANDLER_MISSING");
  const base=await input.adapter.observeBase({repositoryId:material.repositoryId,baseBranch:material.baseBranch});if(base.baseSha!==material.baseSha)throw new Error("DAB_GIT_PR_REBIND_BASE_SHA_MISMATCH");
  const observed=await input.adapter.observePullRequest({repositoryId:material.repositoryId,prNumber:material.prNumber});
  if(observed.headSha!==material.headSha||observed.baseSha!==material.baseSha)throw new Error("DAB_GIT_PR_REBIND_VERIFICATION_FAILED");
  const receipt=Object.freeze({outcome:"verified" as const,repositoryId:material.repositoryId,prNumber:material.prNumber,headBranch:material.headBranch,headSha:material.headSha,baseBranch:material.baseBranch,baseSha:material.baseSha,prAuthorizationRef:material.prAuthorizationRef,actorId:input.actorId.trim(),workloadIdentity:input.workloadIdentity.trim(),requestFingerprint,idempotencyKey,createdAt:(input.now??(()=>new Date()))().toISOString()});await input.receipts.save(receipt);return receipt;
}
