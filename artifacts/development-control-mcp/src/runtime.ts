import { deterministicHash } from "@workspace/development-control";
import {
  createBridgeRequestEnvelope,
  evaluateBridgePolicy,
  type BridgePolicyDecision,
} from "@workspace/development-control-bridge";
import type { BridgeRequestLedgerRepository } from "@workspace/development-control-store";
import { CanonicalBridgeReadAdapter, projectApprovals, projectProgress, projectSpecifications, projectTask } from "./adapters.js";
import { extractBearerToken, RemoteBridgeError, verifyWorkloadAccessToken, type RemoteBridgeAuthConfig, type VerifiedWorkloadIdentity } from "./auth.js";
import { assertToolName, canonicalOperation, parseToolInput, REMOTE_BRIDGE_TOOLS, type RemoteBridgeToolName } from "./tools.js";

export interface RemoteBridgeClock { now(): string }
export interface RemoteBridgeRateLimiter { consume(principalId: string, now: string): boolean | Promise<boolean> }

export interface RemoteBridgeRuntimeConfig {
  readonly auth: RemoteBridgeAuthConfig;
  readonly expectedRepositoryId: string;
  readonly expectedHumanAuthorityActorId: string;
  readonly clock: RemoteBridgeClock;
  readonly killSwitch: () => boolean;
  readonly rateLimiter: RemoteBridgeRateLimiter;
  readonly adapter: CanonicalBridgeReadAdapter;
  readonly ledger: BridgeRequestLedgerRepository;
}

export interface RemoteBridgeToolResult {
  readonly operation: RemoteBridgeToolName;
  readonly taskReference: BridgePolicyDecision["taskReference"];
  readonly policy: Readonly<{ status: "allowed"; reasonCodes: readonly string[]; requestFingerprint: string }>;
  readonly data: Readonly<Record<string, unknown>>;
}

const MAX_OUTPUT_BYTES = 32_768;

export class RemoteBridgeRuntime {
  constructor(private readonly config: RemoteBridgeRuntimeConfig) {}

  authenticate(authorizationHeader: string | null): VerifiedWorkloadIdentity {
    return verifyWorkloadAccessToken({
      token: extractBearerToken(authorizationHeader),
      config: this.config.auth,
      now: this.config.clock.now(),
    });
  }

  listTools(): typeof REMOTE_BRIDGE_TOOLS { return REMOTE_BRIDGE_TOOLS }

  async execute(input: {
    readonly authorizationHeader: string | null;
    readonly toolName: unknown;
    readonly arguments: unknown;
  }): Promise<RemoteBridgeToolResult> {
    if (this.config.killSwitch()) throw new RemoteBridgeError("BRIDGE_DISABLED", 503);
    const toolName = assertToolName(input.toolName);
    const args = parseToolInput(input.arguments);
    const identity = this.authenticate(input.authorizationHeader);
    if (!(await this.config.rateLimiter.consume(identity.principal.principalId, this.config.clock.now()))) {
      throw new RemoteBridgeError("RATE_LIMITED", 429);
    }
    const operation = canonicalOperation(toolName);
    const request = createBridgeRequestEnvelope({
      ...args,
      operation,
      authorizationCategory: "scope",
      principal: identity.principal,
    });
    const requestFingerprintHash = deterministicHash(request.requestFingerprint, "bridge_request_hash");
    const claim = await this.config.ledger.claim({
      requestFingerprintHash,
      principalReferenceHash: deterministicHash(identity.principal.principalId, "bridge_principal_hash"),
      tokenIdHash: deterministicHash(identity.tokenId, "bridge_token_hash"),
      nonceHash: deterministicHash(args.nonce, "bridge_nonce_hash"),
      idempotencyKeyHash: deterministicHash(args.idempotencyKey, "bridge_idempotency_hash"),
      correlationReference: args.correlationId,
      operation,
      createdAt: this.config.clock.now(),
      expiresAt: args.expiresAt,
    });
    if (claim.status === "conflicting") throw new RemoteBridgeError("IDEMPOTENCY_CONFLICT", 409);
    if (claim.status === "nonce_replayed") throw new RemoteBridgeError("NONCE_REPLAYED", 409);
    if (claim.status === "matching" && claim.outcome !== "allowed") {
      throw new RemoteBridgeError("IDEMPOTENT_RESULT_UNAVAILABLE", 409);
    }

    const task = await this.config.adapter.getTask(args.taskId);
    const [approvals, gitEvidence] = await Promise.all([
      this.config.adapter.getApprovals(args.taskId),
      this.config.adapter.getGitEvidence(args),
    ]);
    const decision = evaluateBridgePolicy({
      request,
      specification: task.specification,
      approvals,
      expectedRepositoryId: this.config.expectedRepositoryId,
      expectedHumanAuthorityActorId: this.config.expectedHumanAuthorityActorId,
      observedGitSha: gitEvidence.observedGitSha,
      gitEvidenceStatus: gitEvidence.status,
      nonceStatus: "unused",
      idempotency: claim.status === "matching"
        ? { status: "matching", requestFingerprint: request.requestFingerprint }
        : { status: "absent", requestFingerprint: null },
      now: this.config.clock.now(),
    });
    if (decision.status !== "allowed") {
      if (claim.status === "claimed") await this.config.ledger.finalize(requestFingerprintHash, "denied");
      throw new RemoteBridgeError(`POLICY_${decision.reasonCodes.join("_")}`, 403);
    }

    try {
      const data = await this.readProjection(toolName, args.taskId, task, approvals, gitEvidence, args.correlationId, decision.reasonCodes);
      const result = Object.freeze({
        operation: toolName,
        taskReference: decision.taskReference,
        policy: Object.freeze({ status: "allowed" as const, reasonCodes: Object.freeze([...decision.reasonCodes]), requestFingerprint: decision.requestFingerprint }),
        data,
      });
      if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_OUTPUT_BYTES) throw new RemoteBridgeError("OUTPUT_LIMIT_EXCEEDED", 500);
      if (claim.status === "claimed") await this.config.ledger.finalize(requestFingerprintHash, "allowed");
      return result;
    } catch (error) {
      if (claim.status === "claimed") await this.config.ledger.finalize(requestFingerprintHash, "failed");
      if (error instanceof RemoteBridgeError) throw error;
      throw new RemoteBridgeError("CANONICAL_READ_FAILED", 503);
    }
  }

  private async readProjection(
    toolName: RemoteBridgeToolName,
    taskId: string,
    task: Awaited<ReturnType<CanonicalBridgeReadAdapter["getTask"]>>,
    approvals: Awaited<ReturnType<CanonicalBridgeReadAdapter["getApprovals"]>>,
    gitEvidence: Awaited<ReturnType<CanonicalBridgeReadAdapter["getGitEvidence"]>>,
    correlationId: string,
    reasonCodes: readonly string[],
  ): Promise<Readonly<Record<string, unknown>>> {
    switch (toolName) {
      case "get_task": return projectTask(task);
      case "get_specification_revisions": return projectSpecifications(await this.config.adapter.getSpecificationRevisions(taskId));
      case "get_authorization_decisions": return projectApprovals(approvals);
      case "get_verified_git_evidence": return Object.freeze({ status: gitEvidence.status, observedGitSha: gitEvidence.observedGitSha, evidence: gitEvidence.evidence });
      case "get_task_progress": return projectProgress({ task, events: await this.config.adapter.getLatestEvents(taskId), correlationId, reasonCodes });
    }
  }
}

export function createRemoteMcpHttpHandler(input: {
  readonly runtime: RemoteBridgeRuntime;
  readonly resourceUrl: string;
  readonly authorizationServerIssuer: string;
  readonly documentationUrl: string;
}): (request: Request) => Promise<Response> {
  const resource = new URL(input.resourceUrl);
  if (resource.protocol !== "https:" || resource.pathname !== "/mcp") throw new Error("REMOTE_BRIDGE_RESOURCE_INVALID");
  const metadataPath = "/.well-known/oauth-protected-resource";
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
  return async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (path === metadataPath && request.method === "GET") {
      return json({ resource: input.resourceUrl, authorization_servers: [input.authorizationServerIssuer], scopes_supported: ["dab:read"], resource_documentation: input.documentationUrl });
    }
    if (path !== "/mcp") return json({ error: "not_found" }, 404);
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
    try {
      input.runtime.authenticate(request.headers.get("authorization"));
      const text = await request.text();
      if (Buffer.byteLength(text, "utf8") > 65_536) throw new RemoteBridgeError("REQUEST_TOO_LARGE", 413);
      const message = JSON.parse(text) as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
      if (message.jsonrpc !== "2.0" || typeof message.method !== "string") throw new RemoteBridgeError("JSON_RPC_INVALID", 400);
      if (message.method === "notifications/initialized") return new Response(null, { status: 202 });
      if (message.method === "initialize") return json({ jsonrpc: "2.0", id: message.id ?? null, result: { protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "ai-edge-development-control-readonly", version: "0.1.0" } } });
      if (message.method === "tools/list") return json({ jsonrpc: "2.0", id: message.id ?? null, result: { tools: input.runtime.listTools() } });
      if (message.method === "tools/call") {
        const params = message.params as { name?: unknown; arguments?: unknown } | null;
        if (!params || typeof params !== "object") throw new RemoteBridgeError("JSON_RPC_INVALID", 400);
        const result = await input.runtime.execute({ authorizationHeader: request.headers.get("authorization"), toolName: params.name, arguments: params.arguments });
        return json({ jsonrpc: "2.0", id: message.id ?? null, result: { structuredContent: result, content: [{ type: "text", text: JSON.stringify(result) }], isError: false } });
      }
      return json({ jsonrpc: "2.0", id: message.id ?? null, error: { code: -32601, message: "Method not found" } });
    } catch (error) {
      const bridgeError = error instanceof RemoteBridgeError ? error : new RemoteBridgeError("REQUEST_REJECTED", 400);
      const extra: Record<string, string> = bridgeError.status === 401
        ? { "www-authenticate": `Bearer resource_metadata="${resource.origin}${metadataPath}"` }
        : {};
      return json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Request rejected", data: { reason: bridgeError.code } } }, bridgeError.status, extra);
    }
  };
}
