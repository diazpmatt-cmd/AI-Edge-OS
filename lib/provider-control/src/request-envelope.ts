import { createHash } from "node:crypto";
import type {
  AuthorizationClass,
  ProviderId,
  ProviderOperation,
  ProviderPrincipal,
  ProviderRequestEnvelope,
} from "./types.js";

const BOUNDED = /^[A-Za-z0-9._:@/-]{1,300}$/;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function providerControlHash(value: unknown, prefix: string): string {
  return `${prefix}_${createHash("sha256").update(canonical(value)).digest("hex")}`;
}

export function createProviderRequestEnvelope(input: {
  readonly provider: ProviderId;
  readonly operation: ProviderOperation;
  readonly resourceId: string;
  readonly principal: ProviderPrincipal;
  readonly authorizationClass: AuthorizationClass;
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
}): ProviderRequestEnvelope {
  for (const value of [input.resourceId, input.nonce, input.correlationId, input.idempotencyKey]) {
    if (!BOUNDED.test(value)) throw new Error("PROVIDER_REQUEST_INVALID");
  }
  const payload = Object.freeze({ ...input, principal: Object.freeze({ ...input.principal }) });
  return Object.freeze({
    ...payload,
    requestFingerprint: providerControlHash(payload, "provider_request"),
  });
}
