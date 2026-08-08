import { describe, expect, it } from "vitest";
import { readDabGitWorkerConfig } from "../lib/dab-git-worker-config.js";
import { DabGitHubTransportAdapter, type DabGitHubHttpClient } from "../lib/dab-github-transport-adapter.js";
import type { DabGitCommandRunner } from "../lib/dab-git-workspace-adapter.js";

const baseSha = "a".repeat(40);
const commitSha = "b".repeat(40);
const mergeSha = "c".repeat(40);
const config = () => readDabGitWorkerConfig({ DAB_GIT_WORKER_ENABLED:"true", DAB_GIT_WORKER_KILL_SWITCH:"false", DAB_GIT_GITHUB_TOKEN:"fixture-secret-never-command-line", DAB_GIT_WORKSPACE_ROOT:"/workspace" });

describe("DAB bounded GitHub transport", () => {
  it("pushes exact SHA with force-with-lease and no credential in args", async () => {
    const calls:string[][]=[]; let remote=0;
    const git:DabGitCommandRunner={run:async(args)=>{calls.push([...args]);if(args[0]==="rev-parse")return commitSha;if(args[0]==="branch")return "feature/dab-live";if(args[0]==="ls-remote"){remote++;return remote===1?"":`${commitSha}\trefs/heads/feature/dab-live`;}return "";}};
    const http:DabGitHubHttpClient={request:async()=>({status:500,body:{}})};
    const adapter=new DabGitHubTransportAdapter({config:config(),git,http});
    await expect(adapter.pushCommit({repositoryId:"1",branchName:"feature/dab-live",commitSha,expectedRemoteSha:null,idempotencyKey:`dab-git-push:${"1".repeat(64)}`})).rejects.toThrow("DAB_GITHUB_TRANSPORT_REPOSITORY_MISMATCH");
    const result=await adapter.pushCommit({repositoryId:"1293944511",branchName:"feature/dab-live",commitSha,expectedRemoteSha:null,idempotencyKey:`dab-git-push:${"2".repeat(64)}`});
    expect(result.headSha).toBe(commitSha);
    expect(calls.find(a=>a[0]==="push")).toEqual(["push","--force-with-lease=refs/heads/feature/dab-live:","origin",`${commitSha}:refs/heads/feature/dab-live`]);
    expect(calls.flat().join(" ")).not.toContain("fixture-secret-never-command-line");
  });

  it("creates a PR bound to exact head and main base", async () => {
    const requests:any[]=[];
    const http:DabGitHubHttpClient={request:async(input)=>{requests.push(input);if(input.path==="/git/ref/heads/main")return {status:200,body:{object:{sha:baseSha}}};if(input.path==="/pulls")return {status:201,body:{number:348,head:{ref:"feature/dab-live",sha:commitSha},base:{ref:"main",sha:baseSha}}};return {status:404,body:{}};}};
    const adapter=new DabGitHubTransportAdapter({config:config(),git:{run:async()=>""},http});
    const pr=await adapter.createPullRequest({repositoryId:"1293944511",headBranch:"feature/dab-live",headSha:commitSha,baseBranch:"main",baseSha,idempotencyKey:`dab-git-pr:${"3".repeat(64)}`});
    expect(pr.prNumber).toBe(348);
    expect(requests.find(r=>r.method==="POST")?.body).toMatchObject({head:"feature/dab-live",base:"main",maintainer_can_modify:false});
    await expect(adapter.observeBase({repositoryId:"1293944511",baseBranch:"release"})).rejects.toThrow("DAB_GITHUB_TRANSPORT_BASE_BRANCH_INVALID");
  });

  it("filters CI to the two trusted workflow names on exact SHA", async () => {
    const http:DabGitHubHttpClient={request:async(input)=>{if(input.path==="/pulls/348")return {status:200,body:{head:{sha:commitSha},base:{sha:baseSha,ref:"main"},mergeable:true}};if(input.path.startsWith("/actions/runs?"))return {status:200,body:{workflow_runs:[{name:"Lead Intelligence CI",head_sha:commitSha,status:"completed",conclusion:"success",run_attempt:1},{name:"Coolify stack validation",head_sha:commitSha,status:"completed",conclusion:"success",run_attempt:1},{name:"Untrusted green badge",head_sha:commitSha,status:"completed",conclusion:"success",run_attempt:99}]}};return {status:404,body:{}};}};
    const adapter=new DabGitHubTransportAdapter({config:config(),git:{run:async()=>""},http});
    const observed=await adapter.observeTrustedCi({repositoryId:"1293944511",prNumber:348,headSha:commitSha,baseSha});
    expect(observed.checks.map(c=>c.name)).toEqual(["Lead Intelligence CI","Coolify stack validation"]);
  });

  it("merges only with exact expected head SHA", async () => {
    const requests:any[]=[];
    const http:DabGitHubHttpClient={request:async(input)=>{requests.push(input);return {status:200,body:{merged:true,sha:mergeSha}};}};
    const adapter=new DabGitHubTransportAdapter({config:config(),git:{run:async()=>""},http});
    const result=await adapter.mergeExact({repositoryId:"1293944511",prNumber:348,expectedHeadSha:commitSha,mergeMethod:"squash",idempotencyKey:`dab-git-merge:${"4".repeat(64)}`});
    expect(result.mergeSha).toBe(mergeSha);
    expect(requests[0]).toMatchObject({method:"PUT",path:"/pulls/348/merge",body:{sha:commitSha,merge_method:"squash"}});
  });
});
