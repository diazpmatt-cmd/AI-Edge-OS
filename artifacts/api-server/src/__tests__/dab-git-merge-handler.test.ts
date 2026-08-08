import {describe,expect,it} from "vitest";
import {mergeBoundPullRequest,type DabGitMergeReceipt} from "../lib/dab-git-merge-handler.js";
import type {DabGitPrReceipt,ReceiptStore} from "../lib/dab-git-push-pr-handler.js";
import type {DabCiReceipt} from "../lib/dab-ci-reconciliation.js";
const pr:DabGitPrReceipt={outcome:"verified",repositoryId:"1293944511",prNumber:10,headBranch:"feature/x",headSha:"a".repeat(40),baseBranch:"main",baseSha:"b".repeat(40),prAuthorizationRef:"pr",actorId:"h",workloadIdentity:"w",requestFingerprint:"f",idempotencyKey:"k",createdAt:"x"};
const ci:DabCiReceipt={outcome:"green",repositoryId:pr.repositoryId,prNumber:10,headSha:pr.headSha,baseSha:pr.baseSha,trustedChecks:[],blockerCodes:[],evidenceDigest:"c".repeat(64),reconciledAt:"x"};
function store(){const m=new Map<string,DabGitMergeReceipt>();return {getByIdempotencyKey:async k=>m.get(k)??null,save:async r=>{m.set(r.idempotencyKey,r)}} as ReceiptStore<DabGitMergeReceipt>}
const adapter={observePullRequest:async()=>({headSha:pr.headSha,baseSha:pr.baseSha,mergeable:true}),mergeExact:async()=>({merged:true,mergeSha:"d".repeat(40),headSha:pr.headSha})};
const base={prReceipt:pr,ciReceipt:ci,mergeMethod:"squash" as const,mergeAuthorizationRef:"auth:merge",authorizationUsable:true,killSwitch:false,adapterEnabled:true,handlerRegistered:true,actorId:"h",workloadIdentity:"w",adapter};
describe("DAB merge milestone",()=>{
 it("merges exact green PR once and replays idempotently",async()=>{const receipts=store();const a=await mergeBoundPullRequest({...base,receipts});expect(await mergeBoundPullRequest({...base,receipts})).toEqual(a);expect(a.mergeSha).toBe("d".repeat(40))});
 it("requires green CI and independent merge authorization",async()=>{await expect(mergeBoundPullRequest({...base,ciReceipt:{...ci,outcome:"blocked"},receipts:store()})).rejects.toThrow("DAB_GIT_MERGE_TRUSTED_CI_NOT_GREEN");await expect(mergeBoundPullRequest({...base,authorizationUsable:false,receipts:store()})).rejects.toThrow("DAB_GIT_MERGE_AUTHORIZATION_UNUSABLE")});
 it("fails closed on stale head/base, conflict, and kill switch",async()=>{await expect(mergeBoundPullRequest({...base,adapter:{...adapter,observePullRequest:async()=>({headSha:"e".repeat(40),baseSha:pr.baseSha,mergeable:true})},receipts:store()})).rejects.toThrow("DAB_GIT_MERGE_HEAD_SHA_STALE");await expect(mergeBoundPullRequest({...base,adapter:{...adapter,observePullRequest:async()=>({headSha:pr.headSha,baseSha:pr.baseSha,mergeable:false})},receipts:store()})).rejects.toThrow("DAB_GIT_MERGE_CONFLICT");await expect(mergeBoundPullRequest({...base,killSwitch:true,receipts:store()})).rejects.toThrow("DAB_GIT_MERGE_KILL_SWITCH")});
});
