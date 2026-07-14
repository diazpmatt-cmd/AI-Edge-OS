import { createPublicKey, createVerify, timingSafeEqual } from "node:crypto";
import { deterministicHash } from "@workspace/development-control";
import { createBridgePrincipal, type BridgePrincipal } from "@workspace/development-control-bridge";

export class RemoteBridgeError extends Error {
  constructor(readonly code: string, readonly status: number, message = "remote bridge request rejected") {
    super(message);
    this.name = "RemoteBridgeError";
  }
}

export interface RemoteBridgeAuthConfig {
  readonly issuer: string;
  readonly audience: string;
  readonly allowedAuthorizedParties: readonly string[];
  readonly allowedSubjects: readonly string[];
  readonly requiredScope: "dab:read";
  readonly allowedAlgorithms: readonly ["RS256", ..."RS256"[]];
  readonly pinnedPublicKeys: Readonly<Record<string, string>>;
  readonly revocationGeneration: number;
  readonly maxTokenLifetimeSeconds?: number;
  readonly clockSkewSeconds?: number;
}

export interface VerifiedWorkloadIdentity {
  readonly principal: BridgePrincipal;
  readonly tokenId: string;
  readonly authorizedParty: string;
  readonly revocationGeneration: number;
}

interface JwtHeader { readonly alg?: unknown; readonly kid?: unknown; readonly typ?: unknown }
interface JwtClaims {
  readonly iss?: unknown; readonly sub?: unknown; readonly aud?: unknown;
  readonly azp?: unknown; readonly scope?: unknown; readonly jti?: unknown;
  readonly iat?: unknown; readonly nbf?: unknown; readonly exp?: unknown; readonly rvg?: unknown;
}

const MAX_TOKEN_LENGTH = 16_384;
const DEFAULT_MAX_LIFETIME_SECONDS = 15 * 60;
const DEFAULT_CLOCK_SKEW_SECONDS = 30;

function reject(code: string): never { throw new RemoteBridgeError(code, 401) }

function decodePart<T>(part: string): T {
  try {
    const parsed = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) reject("TOKEN_STRUCTURE_INVALID");
    return parsed as T;
  } catch (error) {
    if (error instanceof RemoteBridgeError) throw error;
    reject("TOKEN_STRUCTURE_INVALID");
  }
}

function exactString(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 300) reject(code);
  return value;
}

function exactInteger(value: unknown, code: string): number {
  if (!Number.isInteger(value)) reject(code);
  return value as number;
}

function includesExact(values: readonly string[], value: string): boolean {
  return values.some((candidate) => {
    const left = Buffer.from(candidate); const right = Buffer.from(value);
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

function audienceMatches(audience: unknown, expected: string): boolean {
  return typeof audience === "string"
    ? audience === expected
    : Array.isArray(audience) && audience.length === 1 && audience[0] === expected;
}

export function extractBearerToken(header: string | null): string {
  if (!header) reject("TOKEN_MISSING");
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header);
  if (!match || match[1].length > MAX_TOKEN_LENGTH) reject("TOKEN_MALFORMED");
  return match[1];
}

export function verifyWorkloadAccessToken(input: { readonly token: string; readonly config: RemoteBridgeAuthConfig; readonly now: string }): VerifiedWorkloadIdentity {
  if (input.token.length > MAX_TOKEN_LENGTH) reject("TOKEN_MALFORMED");
  const parts = input.token.split(".");
  if (parts.length !== 3) reject("TOKEN_STRUCTURE_INVALID");
  const [encodedHeader, encodedClaims, signature] = parts;
  const header = decodePart<JwtHeader>(encodedHeader);
  const claims = decodePart<JwtClaims>(encodedClaims);
  const algorithm = exactString(header.alg, "TOKEN_ALGORITHM_INVALID");
  const keyId = exactString(header.kid, "TOKEN_KEY_UNAVAILABLE");
  if (header.typ !== undefined && header.typ !== "JWT") reject("TOKEN_TYPE_INVALID");
  if (algorithm !== "RS256" || !input.config.allowedAlgorithms.includes(algorithm)) reject("TOKEN_ALGORITHM_INVALID");
  const publicKey = input.config.pinnedPublicKeys[keyId];
  if (!publicKey) reject("TOKEN_KEY_UNAVAILABLE");
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${encodedHeader}.${encodedClaims}`); verifier.end();
    if (!verifier.verify(createPublicKey(publicKey), Buffer.from(signature, "base64url"))) reject("TOKEN_SIGNATURE_INVALID");
  } catch (error) {
    if (error instanceof RemoteBridgeError) throw error;
    reject("TOKEN_SIGNATURE_INVALID");
  }

  const issuer = exactString(claims.iss, "TOKEN_ISSUER_INVALID");
  const subject = exactString(claims.sub, "TOKEN_SUBJECT_INVALID");
  const authorizedParty = exactString(claims.azp, "TOKEN_AUTHORIZED_PARTY_INVALID");
  const scope = exactString(claims.scope, "TOKEN_SCOPE_INVALID").split(/\s+/).filter(Boolean);
  const tokenId = exactString(claims.jti, "TOKEN_ID_MISSING");
  const issuedAt = exactInteger(claims.iat, "TOKEN_TIME_INVALID");
  const notBefore = claims.nbf === undefined ? issuedAt : exactInteger(claims.nbf, "TOKEN_TIME_INVALID");
  const expiresAt = exactInteger(claims.exp, "TOKEN_TIME_INVALID");
  const generation = exactInteger(claims.rvg, "TOKEN_REVOCATION_INVALID");
  const nowSeconds = Math.floor(Date.parse(input.now) / 1_000);
  const skew = input.config.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
  const maxLifetime = input.config.maxTokenLifetimeSeconds ?? DEFAULT_MAX_LIFETIME_SECONDS;

  if (issuer !== input.config.issuer) reject("TOKEN_ISSUER_INVALID");
  if (!audienceMatches(claims.aud, input.config.audience)) reject("TOKEN_AUDIENCE_INVALID");
  if (!includesExact(input.config.allowedAuthorizedParties, authorizedParty)) reject("TOKEN_AUTHORIZED_PARTY_INVALID");
  if (!includesExact(input.config.allowedSubjects, subject)) reject("TOKEN_SUBJECT_INVALID");
  if (scope.length !== 1 || scope[0] !== input.config.requiredScope) reject("TOKEN_SCOPE_INVALID");
  if (!Number.isFinite(nowSeconds)) reject("TOKEN_TIME_INVALID");
  if (notBefore > nowSeconds + skew || issuedAt > nowSeconds + skew) reject("TOKEN_NOT_YET_VALID");
  if (expiresAt <= nowSeconds - skew) reject("TOKEN_EXPIRED");
  if (expiresAt <= issuedAt || expiresAt - issuedAt > maxLifetime) reject("TOKEN_LIFETIME_INVALID");
  if (generation !== input.config.revocationGeneration) reject("TOKEN_REVOKED");

  const credentialReferenceId = deterministicHash(
    { issuer, subject, audience: input.config.audience, authorizedParty, keyId, generation },
    "bridge_credential_ref",
  );
  return Object.freeze({
    principal: createBridgePrincipal({
      issuer, subject, audience: input.config.audience, credentialReferenceId,
      verifiedAt: new Date(issuedAt * 1_000).toISOString(),
      expiresAt: new Date(expiresAt * 1_000).toISOString(),
      status: "active", actorType: "read_only_automation",
    }),
    tokenId, authorizedParty, revocationGeneration: generation,
  });
}
