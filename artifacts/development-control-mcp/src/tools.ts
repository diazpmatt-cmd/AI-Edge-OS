import type { BridgeOperation } from "@workspace/development-control-bridge";
import { RemoteBridgeError } from "./auth.js";

export const REMOTE_BRIDGE_TOOL_NAMES = [
  "get_task", "get_specification_revisions", "get_authorization_decisions",
  "get_verified_git_evidence", "get_task_progress",
] as const;
export type RemoteBridgeToolName = (typeof REMOTE_BRIDGE_TOOL_NAMES)[number];

export interface RemoteBridgeToolInput {
  readonly repositoryId: string; readonly taskId: string; readonly specificationRevision: number;
  readonly specificationHash: string; readonly expectedOriginMainSha: string; readonly nonce: string;
  readonly issuedAt: string; readonly expiresAt: string; readonly correlationId: string; readonly idempotencyKey: string;
}

const INPUT_KEYS = ["repositoryId", "taskId", "specificationRevision", "specificationHash", "expectedOriginMainSha", "nonce", "issuedAt", "expiresAt", "correlationId", "idempotencyKey"] as const;
const boundedString = Object.freeze({ type: "string", minLength: 1, maxLength: 300 });
const oauthSecuritySchemes = Object.freeze([
  Object.freeze({ type: "oauth2" as const, scopes: Object.freeze(["dab:read"] as const) }),
]);
export const REMOTE_BRIDGE_INPUT_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false, required: [...INPUT_KEYS],
  properties: Object.freeze({
    repositoryId: { type: "string", pattern: "^[1-9][0-9]{0,19}$" }, taskId: boundedString,
    specificationRevision: { type: "integer", minimum: 1 },
    specificationHash: { type: "string", pattern: "^spec_[0-9a-f]{64}$" },
    expectedOriginMainSha: { type: "string", pattern: "^[0-9a-f]{40}$" },
    nonce: boundedString, issuedAt: boundedString, expiresAt: boundedString,
    correlationId: boundedString, idempotencyKey: boundedString,
  }),
});
export const REMOTE_BRIDGE_OUTPUT_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false,
  required: ["operation", "taskReference", "policy", "data"],
  properties: Object.freeze({ operation: { type: "string", enum: [...REMOTE_BRIDGE_TOOL_NAMES] }, taskReference: { type: "object" }, policy: { type: "object" }, data: { type: "object" } }),
});
export const REMOTE_BRIDGE_TOOLS = Object.freeze(REMOTE_BRIDGE_TOOL_NAMES.map((name) => Object.freeze({
  name, title: name.replaceAll("_", " "), description: `Read one bounded canonical DAB projection using ${name}.`,
  inputSchema: REMOTE_BRIDGE_INPUT_SCHEMA, outputSchema: REMOTE_BRIDGE_OUTPUT_SCHEMA,
  securitySchemes: oauthSecuritySchemes,
  annotations: Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }),
})));

export function canonicalOperation(name: RemoteBridgeToolName): BridgeOperation { return name === "get_task_progress" ? "get_events" : name }

export function parseToolInput(value: unknown): RemoteBridgeToolInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RemoteBridgeError("TOOL_INPUT_INVALID", 400);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== INPUT_KEYS.length || Object.keys(record).some((key) => !INPUT_KEYS.includes(key as never))) throw new RemoteBridgeError("TOOL_INPUT_INVALID", 400);
  for (const key of INPUT_KEYS) if (record[key] === undefined) throw new RemoteBridgeError("TOOL_INPUT_INVALID", 400);
  if (typeof record.repositoryId !== "string" || !/^[1-9][0-9]{0,19}$/.test(record.repositoryId) || typeof record.taskId !== "string" || typeof record.specificationRevision !== "number" || !Number.isInteger(record.specificationRevision) || record.specificationRevision < 1 || typeof record.specificationHash !== "string" || !/^spec_[0-9a-f]{64}$/.test(record.specificationHash) || typeof record.expectedOriginMainSha !== "string" || !/^[0-9a-f]{40}$/.test(record.expectedOriginMainSha)) throw new RemoteBridgeError("TOOL_INPUT_INVALID", 400);
  for (const key of ["taskId", "nonce", "issuedAt", "expiresAt", "correlationId", "idempotencyKey"] as const) {
    if (typeof record[key] !== "string" || !(record[key] as string).trim() || (record[key] as string).length > 300) throw new RemoteBridgeError("TOOL_INPUT_INVALID", 400);
  }
  return Object.freeze(record as unknown as RemoteBridgeToolInput);
}

export function assertToolName(value: unknown): RemoteBridgeToolName {
  if (typeof value !== "string" || !REMOTE_BRIDGE_TOOL_NAMES.includes(value as RemoteBridgeToolName)) throw new RemoteBridgeError("TOOL_NOT_ALLOWED", 404);
  return value as RemoteBridgeToolName;
}
