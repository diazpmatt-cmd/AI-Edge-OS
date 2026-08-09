import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DevelopmentCoordinationStore, TaskRecord } from "@workspace/development-control";
import {
  DAB3A_FIXTURE_HUMAN,
  DAB3A_FIXTURE_NOW,
  DAB3A_FIXTURE_REPOSITORY_ID,
  createDab3aFixtureApproval,
  createDab3aFixtureSpecification,
} from "@workspace/development-control-bridge";
import type { GitHubEvidence } from "@workspace/development-control-github";
import { InMemoryBridgeRuntimeRepository } from "@workspace/development-control-store";
import {
  CanonicalBridgeReadAdapter,
  RemoteBridgeRuntime,
  REMOTE_BRIDGE_TOOL_NAMES,
  REMOTE_BRIDGE_TOOLS,
  createRemoteMcpHttpHandler,
  verifyWorkloadAccessToken,
  type RemoteBridgeAuthConfig,
  type RemoteBridgeToolInput,
} from "..";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const specification = createDab3aFixtureSpecification();
const approval = createDab3aFixtureApproval(specification, "scope");
const task: TaskRecord = Object.freeze({ specification, state: "approved", version: 2, claim: null, milestones: [] });
const auth: RemoteBridgeAuthConfig = Object.freeze({
  issuer: "https://issuer.example.invalid",
  audience: "https://bridge.example.invalid/mcp",
  allowedAuthorizedParties: ["chatgpt-work"],
  allowedSubjects: ["workload:chatgpt:development-control"],
  requiredScope: "dab:read",
  allowedAlgorithms: ["RS256"],
  pinnedPublicKeys: { "fixture-key": publicPem },
  revocationGeneration: 3,
  clockSkewSeconds: 0,
});

function signToken(overrides: Record<string, unknown> = {}, headerOverrides: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "fixture-key", typ: "JWT", ...headerOverrides })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    iss: auth.issuer, sub: auth.allowedSubjects[0], aud: auth.audience,
    azp: auth.allowedAuthorizedParties[0], scope: "dab:read", jti: "token-fixture-1",
    iat: Date.parse("2026-07-14T01:10:00.000Z") / 1000,
    nbf: Date.parse("2026-07-14T01:10:00.000Z") / 1000,
    exp: Date.parse("2026-07-14T01:20:00.000Z") / 1000,
    rvg: 3, ...overrides,
  })).toString("base64url");
  const signer = createSign("RSA-SHA256"); signer.update(`${header}.${claims}`); signer.end();
  return `${header}.${claims}.${signer.sign(privateKey).toString("base64url")}`;
}

function evidence(overrides: Partial<GitHubEvidence> = {}): GitHubEvidence {
  return Object.freeze({
    evidenceId: `github_evidence_${"1".repeat(64)}`,
    fingerprint: `github_observation_${"2".repeat(64)}`,
    repositoryId: DAB3A_FIXTURE_REPOSITORY_ID,
    repositoryName: "diazpmatt-cmd/AI-Edge-OS",
    objectType: "issue_comment",
    objectId: "23",
    sourceUrl: "https://github.com/diazpmatt-cmd/AI-Edge-OS/issues/23#fixture",
    actorId: "256463127", actorLogin: "diazpmatt-cmd",
    createdAt: "2026-07-14T01:05:00.000Z", updatedAt: "2026-07-14T01:05:00.000Z",
    contentHash: `content_${"3".repeat(64)}`, deleted: false,
    approvalBinding: { taskId: specification.taskId, specificationRevision: specification.revision, specificationHash: specification.specificationHash, expectedOriginMainSha: specification.expectedOriginMainSha, categories: ["scope"] },
    headSha: specification.expectedOriginMainSha, previousHeadSha: null, ...overrides,
  });
}

function coordination(overrides: { approvals?: readonly typeof approval[]; task?: TaskRecord } = {}): DevelopmentCoordinationStore {
  const activeTask = overrides.task ?? task;
  return {
    getTask: () => activeTask,
    getApprovals: () => overrides.approvals ?? [approval],
    getEvents: () => [{ eventId: `event_${"4".repeat(64)}`, taskId: specification.taskId, priorState: "proposed", newState: "approved", actor: DAB3A_FIXTURE_HUMAN, reasonCode: "scope_approved", expectedGitSha: specification.expectedOriginMainSha, observedGitSha: specification.expectedOriginMainSha, specificationRevision: specification.revision, specificationHash: specification.specificationHash, correlationKey: "fixture", metadata: {}, timestamp: "2026-07-14T01:06:00.000Z" }],
    getSpecificationRevisions: () => [specification],
  } as unknown as DevelopmentCoordinationStore;
}

function toolInput(overrides: Partial<RemoteBridgeToolInput> = {}): RemoteBridgeToolInput {
  return Object.freeze({
    repositoryId: DAB3A_FIXTURE_REPOSITORY_ID, taskId: specification.taskId,
    specificationRevision: specification.revision, specificationHash: specification.specificationHash,
    expectedOriginMainSha: specification.expectedOriginMainSha, nonce: "nonce-1",
    issuedAt: "2026-07-14T01:10:00.000Z", expiresAt: "2026-07-14T01:15:00.000Z",
    correlationId: "correlation-1", idempotencyKey: "idempotency-1", ...overrides,
  });
}

function runtime(input: { evidence?: readonly GitHubEvidence[]; approvals?: readonly typeof approval[]; kill?: boolean; rate?: boolean; repository?: InMemoryBridgeRuntimeRepository } = {}) {
  const repository = input.repository ?? new InMemoryBridgeRuntimeRepository(input.evidence ?? [evidence()]);
  return { repository, runtime: new RemoteBridgeRuntime({
    auth, expectedRepositoryId: DAB3A_FIXTURE_REPOSITORY_ID,
    expectedHumanAuthorityActorId: DAB3A_FIXTURE_HUMAN.actorId,
    clock: { now: () => DAB3A_FIXTURE_NOW }, killSwitch: () => input.kill ?? false,
    rateLimiter: { consume: () => input.rate ?? true },
    adapter: new CanonicalBridgeReadAdapter(coordination({ approvals: input.approvals }), repository), ledger: repository,
  }) };
}

describe("DAB-3B remote read-only MCP bridge", () => {
  it("declares exactly five closed read-only OAuth-protected tools", () => {
    expect(REMOTE_BRIDGE_TOOL_NAMES).toEqual(["get_task", "get_specification_revisions", "get_authorization_decisions", "get_verified_git_evidence", "get_task_progress"]);
    expect(REMOTE_BRIDGE_TOOLS).toHaveLength(5);
    for (const tool of REMOTE_BRIDGE_TOOLS) {
      expect(tool.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
      expect(tool.securitySchemes).toEqual([{ type: "oauth2", scopes: ["dab:read"] }]);
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.outputSchema.additionalProperties).toBe(false);
    }
  });

  it("maps a valid short-lived JWT to a read-only workload principal", () => {
    const identity = verifyWorkloadAccessToken({ token: signToken(), config: auth, now: DAB3A_FIXTURE_NOW });
    expect(identity.principal.actorType).toBe("read_only_automation");
    expect(identity.principal.subject).toBe(auth.allowedSubjects[0]);
    expect(identity.principal.principalId).not.toBe(DAB3A_FIXTURE_HUMAN.actorId);
  });

  it.each([
    ["wrong issuer", { iss: "https://wrong.invalid" }, {}, "TOKEN_ISSUER_INVALID"],
    ["wrong audience", { aud: "https://wrong.invalid/mcp" }, {}, "TOKEN_AUDIENCE_INVALID"],
    ["wrong party", { azp: "wrong-client" }, {}, "TOKEN_AUTHORIZED_PARTY_INVALID"],
    ["wrong subject", { sub: "workload:wrong" }, {}, "TOKEN_SUBJECT_INVALID"],
    ["missing scope", { scope: "other" }, {}, "TOKEN_SCOPE_INVALID"],
    ["missing token id", { jti: "" }, {}, "TOKEN_ID_MISSING"],
    ["expired", { exp: Date.parse("2026-07-14T01:10:59.000Z") / 1000 }, {}, "TOKEN_EXPIRED"],
    ["not yet valid", { nbf: Date.parse("2026-07-14T01:12:00.000Z") / 1000 }, {}, "TOKEN_NOT_YET_VALID"],
    ["revoked generation", { rvg: 2 }, {}, "TOKEN_REVOKED"],
    ["algorithm", {}, { alg: "HS256" }, "TOKEN_ALGORITHM_INVALID"],
  ])("rejects %s", (_name, claims, header, code) => {
    expect(() => verifyWorkloadAccessToken({ token: signToken(claims, header), config: auth, now: DAB3A_FIXTURE_NOW })).toThrowError(expect.objectContaining({ code }));
  });

  it("rejects invalid signatures without exposing token material", () => {
    const token = signToken(); const tampered = `${token.slice(0, -2)}aa`;
    expect(() => verifyWorkloadAccessToken({ token: tampered, config: auth, now: DAB3A_FIXTURE_NOW })).toThrowError(expect.objectContaining({ code: "TOKEN_SIGNATURE_INVALID" }));
  });

  it("executes every canonical read through policy and bounded adapters", async () => {
    for (const [index, name] of REMOTE_BRIDGE_TOOL_NAMES.entries()) {
      const current = runtime();
      const result = await current.runtime.execute({ authorizationHeader: `Bearer ${signToken({ jti: `token-${index}` })}`, toolName: name, arguments: toolInput({ nonce: `nonce-${index}`, idempotencyKey: `idempotency-${index}` }) });
      expect(result.operation).toBe(name);
      expect(result.policy.status).toBe("allowed");
      expect(JSON.stringify(result)).not.toMatch(/privateKey|DATABASE_URL|bearer|customerId|tenantId/i);
    }
  });

  it("keeps get_task_progress harmless and bounded to ten existing events", async () => {
    const current = runtime();
    const result = await current.runtime.execute({ authorizationHeader: `Bearer ${signToken()}`, toolName: "get_task_progress", arguments: toolInput() });
    expect((result.data.events as readonly unknown[]).length).toBeLessThanOrEqual(10);
    expect(current.repository.listLedger()).toHaveLength(1);
    expect(current.repository.listLedger()[0]).not.toHaveProperty("result");
    expect(current.repository.listLedger()[0]).not.toHaveProperty("payload");
  });

  it("rejects identity injection and unknown tool arguments", async () => {
    const current = runtime();
    await expect(current.runtime.execute({ authorizationHeader: `Bearer ${signToken()}`, toolName: "get_task", arguments: { ...toolInput(), principal: { subject: "forged" } } })).rejects.toMatchObject({ code: "TOOL_INPUT_INVALID" });
  });

  it("fails closed without exact human scope approval", async () => {
    const current = runtime({ approvals: [] });
    await expect(current.runtime.execute({ authorizationHeader: `Bearer ${signToken()}`, toolName: "get_task", arguments: toolInput() })).rejects.toMatchObject({ status: 403 });
  });

  it.each([
    ["stale", { headSha: "0".repeat(40) }],
    ["edited", { previousHeadSha: "0".repeat(40) }],
    ["deleted", { deleted: true }],
    ["unavailable", null],
  ])("fails closed for %s Git evidence", async (_status, change) => {
    const current = runtime({ evidence: change ? [evidence(change)] : [] });
    await expect(current.runtime.execute({ authorizationHeader: `Bearer ${signToken()}`, toolName: "get_task", arguments: toolInput() })).rejects.toMatchObject({ status: 403 });
  });

  it("converges matching retries and rejects conflicts and nonce replay", async () => {
    const current = runtime();
    const first = await current.runtime.execute({ authorizationHeader: `Bearer ${signToken()}`, toolName: "get_task", arguments: toolInput() });
    expect(await current.runtime.execute({ authorizationHeader: `Bearer ${signToken()}`, toolName: "get_task", arguments: toolInput() })).toEqual(first);
    await expect(current.runtime.execute({ authorizationHeader: `Bearer ${signToken()}`, toolName: "get_task", arguments: toolInput({ expectedOriginMainSha: "0".repeat(40) }) })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(current.runtime.execute({ authorizationHeader: `Bearer ${signToken()}`, toolName: "get_task", arguments: toolInput({ idempotencyKey: "other" }) })).rejects.toMatchObject({ code: "NONCE_REPLAYED" });
  });

  it("fails closed for rate exhaustion and kill-switch activation", async () => {
    await expect(runtime({ rate: false }).runtime.execute({ authorizationHeader: `Bearer ${signToken()}`, toolName: "get_task", arguments: toolInput() })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(runtime({ kill: true }).runtime.execute({ authorizationHeader: `Bearer ${signToken()}`, toolName: "get_task", arguments: toolInput() })).rejects.toMatchObject({ code: "BRIDGE_DISABLED" });
  });

  it("implements protected-resource metadata and Streamable HTTP discovery", async () => {
    const handler = createRemoteMcpHttpHandler({ runtime: runtime().runtime, resourceUrl: auth.audience, authorizationServerIssuer: auth.issuer, documentationUrl: "https://docs.example.invalid/bridge" });
    const metadata = await handler(new Request("https://bridge.example.invalid/.well-known/oauth-protected-resource"));
    expect(await metadata.json()).toEqual({ resource: auth.audience, authorization_servers: [auth.issuer], scopes_supported: ["dab:read"], resource_documentation: "https://docs.example.invalid/bridge" });
    const listed = await handler(new Request(auth.audience, { method: "POST", headers: { authorization: `Bearer ${signToken()}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }));
    const listedBody = (await listed.json()) as { result: { tools: typeof REMOTE_BRIDGE_TOOLS } };
    expect(listedBody.result.tools).toHaveLength(5);
    expect(listedBody.result.tools.every((tool) => tool.securitySchemes[0]?.type === "oauth2")).toBe(true);
  });

  it("returns ChatGPT tool-level OAuth challenge metadata without executing the tool", async () => {
    const current = runtime();
    const handler = createRemoteMcpHttpHandler({ runtime: current.runtime, resourceUrl: auth.audience, authorizationServerIssuer: auth.issuer, documentationUrl: "https://docs.example.invalid/bridge" });
    const response = await handler(new Request(auth.audience, {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_task", arguments: toolInput() } }),
    }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { result: { isError: boolean; _meta: { "mcp/www_authenticate": string[] } } };
    expect(body.result.isError).toBe(true);
    const challenge = body.result._meta["mcp/www_authenticate"][0];
    expect(challenge).toContain('resource_metadata="https://bridge.example.invalid/.well-known/oauth-protected-resource"');
    expect(challenge).toContain('scope="dab:read"');
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain("error_description=");
    expect(current.repository.listLedger()).toHaveLength(0);
  });

  it("returns bounded redacted HTTP errors and challenges missing authentication", async () => {
    const handler = createRemoteMcpHttpHandler({ runtime: runtime().runtime, resourceUrl: auth.audience, authorizationServerIssuer: auth.issuer, documentationUrl: "https://docs.example.invalid/bridge" });
    const response = await handler(new Request(auth.audience, { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("oauth-protected-resource");
    expect(response.headers.get("www-authenticate")).toContain('scope="dab:read"');
    expect(JSON.stringify(await response.json())).not.toMatch(/token-fixture|private|stack|DATABASE_URL/i);
  });
});
