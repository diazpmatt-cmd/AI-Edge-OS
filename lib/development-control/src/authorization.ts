import {
  AUTHORIZATION_CATEGORIES,
  DevelopmentControlError,
  type ApprovalRecord,
  type AuthorizationCategory,
  type DevelopmentAuthorityPolicy,
  type TaskSpecification,
  type TrustedDevelopmentActor,
} from "./types";
import { deterministicHash } from "./specification";
import { validateActor } from "./events";

const MAX_RATIONALE = 1_000;
const MAX_CONSTRAINTS = 50;

export const DAB2A_AUTHORITY_POLICY: DevelopmentAuthorityPolicy = Object.freeze(
  {
    materialAuthorityActorId: "github:diazpmatt-cmd",
  },
);

function normalizedCategories(
  categories: readonly AuthorizationCategory[],
): readonly AuthorizationCategory[] {
  const valid = new Set<AuthorizationCategory>(AUTHORIZATION_CATEGORIES);
  if (
    categories.length === 0 ||
    categories.some((category) => !valid.has(category))
  ) {
    throw new DevelopmentControlError(
      "INVALID_AUTHORIZATION_CATEGORY",
      "at least one valid authorization category is required",
    );
  }
  return Object.freeze([...new Set(categories)].sort());
}

export function createApprovalRecord(input: {
  specification: TaskSpecification;
  categories: readonly AuthorizationCategory[];
  decidingActor: TrustedDevelopmentActor;
  decision: ApprovalRecord["decision"];
  decidedAt: string;
  expiresAt?: string | null;
  constraints?: readonly string[];
  rationale: string;
  idempotencyKey: string;
  authorityPolicy?: DevelopmentAuthorityPolicy;
}): ApprovalRecord {
  validateActor(input.decidingActor);
  const authorityPolicy = input.authorityPolicy ?? DAB2A_AUTHORITY_POLICY;
  const authorityDecision = new Set<ApprovalRecord["decision"]>([
    "approved",
    "rejected",
    "revoked",
  ]).has(input.decision);
  if (
    authorityDecision &&
    (input.decidingActor.actorType !== "human_authority" ||
      input.decidingActor.actorId !== authorityPolicy.materialAuthorityActorId)
  ) {
    throw new DevelopmentControlError(
      "UNAUTHORIZED_APPROVER",
      "only the configured trusted human authority may decide material-action authorization",
    );
  }
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200) {
    throw new DevelopmentControlError(
      "INVALID_IDEMPOTENCY_KEY",
      "approval idempotency key is required and bounded",
    );
  }
  const rationale = input.rationale.trim();
  if (!rationale || rationale.length > MAX_RATIONALE) {
    throw new DevelopmentControlError(
      "UNBOUNDED_RATIONALE",
      "approval rationale must be bounded",
    );
  }
  const constraints = [
    ...new Set(
      (input.constraints ?? []).map((value) => value.trim()).filter(Boolean),
    ),
  ].sort();
  if (
    constraints.length > MAX_CONSTRAINTS ||
    constraints.some((value) => value.length > 500)
  ) {
    throw new DevelopmentControlError(
      "UNBOUNDED_CONSTRAINTS",
      "approval constraints exceed bounds",
    );
  }
  const categories = normalizedCategories(input.categories);
  const decidedAt = new Date(input.decidedAt).toISOString();
  const expiresAt = input.expiresAt
    ? new Date(input.expiresAt).toISOString()
    : null;
  const payload = {
    taskId: input.specification.taskId,
    specificationRevision: input.specification.revision,
    specificationHash: input.specification.specificationHash,
    expectedGitSha: input.specification.expectedOriginMainSha,
    categories,
    decidingActorId: input.decidingActor.actorId,
    decision: input.decision,
    decidedAt,
    expiresAt,
    constraints,
    rationale,
    idempotencyKey: input.idempotencyKey,
  };
  return Object.freeze({
    approvalId: deterministicHash(payload, "approval"),
    taskId: payload.taskId,
    specificationRevision: payload.specificationRevision,
    specificationHash: payload.specificationHash,
    expectedGitSha: payload.expectedGitSha,
    categories,
    decidingActor: Object.freeze({ ...input.decidingActor }),
    decision: payload.decision,
    decidedAt,
    expiresAt,
    constraints: Object.freeze(constraints),
    rationale,
    idempotencyKey: input.idempotencyKey,
  });
}

export function assertApprovalUsable(input: {
  approval: ApprovalRecord;
  specification: TaskSpecification;
  category: AuthorizationCategory;
  observedGitSha: string;
  now: string;
}): void {
  const { approval, specification } = input;
  if (
    approval.taskId !== specification.taskId ||
    approval.specificationRevision !== specification.revision ||
    approval.specificationHash !== specification.specificationHash
  ) {
    throw new DevelopmentControlError(
      "STALE_APPROVAL",
      "approval does not bind to the active specification revision and hash",
    );
  }
  if (
    approval.expectedGitSha !== specification.expectedOriginMainSha ||
    input.observedGitSha !== specification.expectedOriginMainSha
  ) {
    throw new DevelopmentControlError(
      "STALE_GIT_SHA",
      "observed origin/main SHA differs from the approved expected SHA",
    );
  }
  if (!approval.categories.includes(input.category)) {
    throw new DevelopmentControlError(
      "WRONG_AUTHORIZATION_CATEGORY",
      `approval does not grant ${input.category}`,
    );
  }
  if (approval.decision !== "approved") {
    throw new DevelopmentControlError(
      "APPROVAL_NOT_USABLE",
      `approval decision ${approval.decision} is not usable`,
    );
  }
  if (
    approval.expiresAt &&
    Date.parse(input.now) >= Date.parse(approval.expiresAt)
  ) {
    throw new DevelopmentControlError(
      "APPROVAL_EXPIRED",
      "approval has expired",
    );
  }
}
