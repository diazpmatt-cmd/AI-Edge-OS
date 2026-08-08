import { createHash } from "node:crypto";
import type { DabGitPrReceipt } from "./dab-git-push-pr-handler.js";

export type DabTrustedCheck = Readonly<{ name:string; status:"queued"|"in_progress"|"completed"; conclusion:"success"|"failure"|"cancelled"|"timed_out"|"skipped"|null }>;
export type DabCiReceipt = Readonly<{ outcome:"green"|"blocked"; repositoryId:string; prNumber:number; headSha:string; baseSha:string; trustedChecks:readonly DabTrustedCheck[]; blockerCodes:readonly string[]; evidenceDigest:string; reconciledAt:string }>;

export function reconcileDabPullRequestCi(input:{prReceipt:DabGitPrReceipt;observed:{prNumber:number;headSha:string;baseSha:string;checks:readonly DabTrustedCheck[]};trustedCheckNames:readonly string[];now?:()=>Date}):DabCiReceipt{
  if(input.observed.prNumber!==input.prReceipt.prNumber)throw new Error("DAB_CI_PR_MISMATCH");
  if(input.observed.headSha!==input.prReceipt.headSha)throw new Error("DAB_CI_HEAD_SHA_STALE");
  if(input.observed.baseSha!==input.prReceipt.baseSha)throw new Error("DAB_CI_BASE_SHA_STALE");
  const trusted=[...input.observed.checks.filter(c=>input.trustedCheckNames.includes(c.name))].sort((a,b)=>a.name.localeCompare(b.name));
  const blockers:string[]=[];
  for(const name of input.trustedCheckNames){const check=trusted.find(c=>c.name===name);if(!check)blockers.push(`trusted_check_missing:${name}`);else if(check.status!=="completed")blockers.push(`trusted_check_pending:${name}`);else if(check.conclusion!=="success")blockers.push(`trusted_check_failed:${name}`)}
  const evidenceDigest=createHash("sha256").update(JSON.stringify({prNumber:input.observed.prNumber,headSha:input.observed.headSha,baseSha:input.observed.baseSha,trusted})).digest("hex");
  return Object.freeze({outcome:blockers.length?"blocked" as const:"green" as const,repositoryId:input.prReceipt.repositoryId,prNumber:input.prReceipt.prNumber,headSha:input.prReceipt.headSha,baseSha:input.prReceipt.baseSha,trustedChecks:Object.freeze(trusted),blockerCodes:Object.freeze(blockers),evidenceDigest,reconciledAt:(input.now??(()=>new Date()))().toISOString()});
}

export function evaluateDabSameScopeRepair(input:{ci:DabCiReceipt;currentHeadSha:string;currentBaseSha:string;specHash:string;currentSpecHash:string;approvedPaths:readonly string[];proposedPaths:readonly string[];attempt:number;maxAttempts:number;repairAuthorizationUsable:boolean;killSwitch:boolean}){
  if(input.ci.outcome!=="blocked")return Object.freeze({allowed:false,reasonCode:"DAB_CI_REPAIR_NOT_REQUIRED"});
  if(input.currentHeadSha!==input.ci.headSha)return Object.freeze({allowed:false,reasonCode:"DAB_CI_REPAIR_HEAD_STALE"});
  if(input.currentBaseSha!==input.ci.baseSha)return Object.freeze({allowed:false,reasonCode:"DAB_CI_REPAIR_BASE_STALE"});
  if(input.specHash!==input.currentSpecHash)return Object.freeze({allowed:false,reasonCode:"DAB_CI_REPAIR_SPEC_STALE"});
  if(!input.repairAuthorizationUsable)return Object.freeze({allowed:false,reasonCode:"DAB_CI_REPAIR_AUTHORIZATION_UNUSABLE"});
  if(input.killSwitch)return Object.freeze({allowed:false,reasonCode:"DAB_CI_REPAIR_KILL_SWITCH"});
  if(input.attempt>=input.maxAttempts)return Object.freeze({allowed:false,reasonCode:"DAB_CI_REPAIR_ATTEMPT_LIMIT"});
  const approved=new Set(input.approvedPaths);if(input.proposedPaths.some(path=>!approved.has(path)))return Object.freeze({allowed:false,reasonCode:"DAB_CI_REPAIR_SCOPE_EXPANSION"});
  return Object.freeze({allowed:true,reasonCode:"DAB_CI_REPAIR_SAME_SCOPE_ALLOWED"});
}
