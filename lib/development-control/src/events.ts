import {
  DevelopmentControlError,
  type AuditEvent,
  type TaskRecord,
  type TrustedDevelopmentActor,
} from "./types.js";
import { deterministicHash } from "./specification.js";

const MAX_METADATA_KEYS = 20;
const MAX_METADATA_STRING = 500;

export function validateActor(actor: TrustedDevelopmentActor): void {
  const candidate = actor as TrustedDevelopmentActor & {
    tenantId?: unknown;
    clientId?: unknown;
  };
  if (candidate.tenantId !== undefined || candidate.clientId !== undefined)
    throw new DevelopmentControlError(
      "CUSTOMER_IDENTITY_FORBIDDEN",
      "development actors cannot carry customer identity",
    );
  if (
    !actor.developmentControl ||
    !actor.verified ||
    !actor.actorId.trim() ||
    !actor.displayName.trim()
  )
    throw new DevelopmentControlError(
      "UNTRUSTED_ACTOR",
      "actor must be a verified development-control identity",
    );
}

export function boundedMetadata(
  metadata: Readonly<Record<string, string | number | boolean | null>>,
): Readonly<Record<string, string | number | boolean | null>> {
  const entries = Object.entries(metadata);
  if (entries.length > MAX_METADATA_KEYS)
    throw new DevelopmentControlError(
      "UNBOUNDED_METADATA",
      `metadata exceeds ${MAX_METADATA_KEYS} keys`,
    );
  const normalized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    if (
      !key.trim() ||
      key.length > 100 ||
      (typeof value === "string" && value.length > MAX_METADATA_STRING)
    )
      throw new DevelopmentControlError(
        "UNBOUNDED_METADATA",
        "metadata key or string value exceeds bounds",
      );
    normalized[key] = value;
  }
  return Object.freeze(normalized);
}

export function createAuditEvent(input: {
  task: TaskRecord;
  priorState: AuditEvent["priorState"];
  newState: AuditEvent["newState"];
  actor: TrustedDevelopmentActor;
  reasonCode: string;
  expectedGitSha?: string | null;
  observedGitSha?: string | null;
  correlationKey: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
  timestamp: string;
}): AuditEvent {
  validateActor(input.actor);
  const payload = {
    taskId: input.task.specification.taskId,
    priorState: input.priorState,
    newState: input.newState,
    actorId: input.actor.actorId,
    reasonCode: input.reasonCode,
    expectedGitSha: input.expectedGitSha ?? null,
    observedGitSha: input.observedGitSha ?? null,
    specificationRevision: input.task.specification.revision,
    specificationHash: input.task.specification.specificationHash,
    correlationKey: input.correlationKey,
    timestamp: input.timestamp,
    metadata: boundedMetadata(input.metadata ?? {}),
  };
  return Object.freeze({
    eventId: deterministicHash(payload, "event"),
    taskId: payload.taskId,
    priorState: payload.priorState,
    newState: payload.newState,
    actor: Object.freeze({ ...input.actor }),
    reasonCode: payload.reasonCode,
    expectedGitSha: payload.expectedGitSha,
    observedGitSha: payload.observedGitSha,
    specificationRevision: payload.specificationRevision,
    specificationHash: payload.specificationHash,
    correlationKey: payload.correlationKey,
    metadata: payload.metadata,
    timestamp: payload.timestamp,
  });
}
