import {
  DevelopmentControlError,
  type ClaimLease,
  type TrustedDevelopmentActor,
} from "./types.js";
import { validateActor } from "./events.js";

export const MIN_LEASE_MS = 1_000;
export const MAX_LEASE_MS = 60 * 60 * 1_000;

function assertLeaseDuration(durationMs: number): void {
  if (
    !Number.isInteger(durationMs) ||
    durationMs < MIN_LEASE_MS ||
    durationMs > MAX_LEASE_MS
  ) {
    throw new DevelopmentControlError(
      "INVALID_LEASE_DURATION",
      `lease must be ${MIN_LEASE_MS}-${MAX_LEASE_MS}ms`,
    );
  }
}

export function isLeaseExpired(lease: ClaimLease, now: string): boolean {
  return Date.parse(now) >= Date.parse(lease.expiresAt);
}

export function createClaimLease(input: {
  taskId: string;
  owner: TrustedDevelopmentActor;
  claimedAt: string;
  durationMs: number;
  leaseVersion?: number;
}): ClaimLease {
  validateActor(input.owner);
  if (
    !new Set([
      "codex_implementer",
      "bounded_sub_agent",
      "read_only_automation",
    ]).has(input.owner.actorType)
  ) {
    throw new DevelopmentControlError(
      "INVALID_CLAIMANT",
      "actor type cannot claim development work",
    );
  }
  assertLeaseDuration(input.durationMs);
  const claimedAtMs = Date.parse(input.claimedAt);
  if (!Number.isFinite(claimedAtMs))
    throw new DevelopmentControlError(
      "INVALID_TIMESTAMP",
      "claim timestamp is invalid",
    );
  return Object.freeze({
    taskId: input.taskId,
    owner: Object.freeze({ ...input.owner }),
    claimedAt: new Date(claimedAtMs).toISOString(),
    expiresAt: new Date(claimedAtMs + input.durationMs).toISOString(),
    leaseVersion: input.leaseVersion ?? 1,
  });
}

export function renewClaimLease(input: {
  lease: ClaimLease;
  owner: TrustedDevelopmentActor;
  expectedLeaseVersion: number;
  renewedAt: string;
  durationMs: number;
}): ClaimLease {
  validateActor(input.owner);
  if (input.lease.owner.actorId !== input.owner.actorId)
    throw new DevelopmentControlError(
      "CLAIM_OWNED_BY_ANOTHER_ACTOR",
      "only the claim owner may renew",
    );
  if (input.lease.leaseVersion !== input.expectedLeaseVersion)
    throw new DevelopmentControlError(
      "STALE_LEASE_VERSION",
      "lease version is stale",
    );
  if (isLeaseExpired(input.lease, input.renewedAt))
    throw new DevelopmentControlError(
      "LEASE_EXPIRED",
      "expired claims must be explicitly recovered, not renewed",
    );
  return createClaimLease({
    taskId: input.lease.taskId,
    owner: input.owner,
    claimedAt: input.renewedAt,
    durationMs: input.durationMs,
    leaseVersion: input.lease.leaseVersion + 1,
  });
}
