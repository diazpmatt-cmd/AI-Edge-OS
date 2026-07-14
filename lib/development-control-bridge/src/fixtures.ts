import {
  createApprovalRecord,
  createTaskSpecification,
  type ApprovalRecord,
  type AuthorizationCategory,
  type TaskSpecification,
  type TrustedDevelopmentActor,
} from "@workspace/development-control";
import { getBridgeOperationPolicy } from "./operation-catalog.js";
import { createBridgePrincipal } from "./principal.js";
import { createBridgeRequestEnvelope } from "./request-envelope.js";
import type {
  BridgeOperation,
  BridgePolicyInput,
  BridgePrincipal,
  BridgeRequestEnvelope,
} from "./types.js";

export const DAB3A_FIXTURE_REPOSITORY_ID = "1000000001";
export const DAB3A_FIXTURE_SHA = "4c8e04e0f0fa97631d266b37fc17117766de8013";
export const DAB3A_FIXTURE_NOW = "2026-07-14T01:11:00.000Z";

export const DAB3A_FIXTURE_HUMAN: TrustedDevelopmentActor = Object.freeze({
  actorId: "github-actor:256463127",
  displayName: "Matthew Diaz",
  actorType: "human_authority",
  verified: true,
  developmentControl: true,
});

export function createDab3aFixturePrincipal(
  overrides: Partial<Parameters<typeof createBridgePrincipal>[0]> = {},
): BridgePrincipal {
  return createBridgePrincipal({
    issuer: "https://identity.example.invalid",
    subject: "workload:codex:alex",
    audience: "ai-edge-development-control",
    credentialReferenceId: "fixture-key-reference",
    verifiedAt: "2026-07-14T01:00:00.000Z",
    expiresAt: "2026-07-14T02:00:00.000Z",
    status: "active",
    actorType: "codex_implementer",
    ...overrides,
  });
}

export function createDab3aFixtureSpecification(): TaskSpecification {
  return createTaskSpecification({
    taskId: "DAB-3A-FIXTURE",
    title: "Offline bridge fixture",
    taskType: "implementation",
    revision: 1,
    expectedOriginMainSha: DAB3A_FIXTURE_SHA,
    branchMode: "dedicated_branch",
    intendedBranch: "feature/dab3a-fixture",
    priority: "high",
    dependencies: [],
    origin: "credential-free DAB-3A fixture",
    proposedAgent: "Alex/Codex",
    authorizedScope: ["offline policy evaluation"],
    authorizedFiles: ["fixture.ts"],
    explicitExclusions: ["network", "credentials", "customer data"],
    acceptanceCriteria: ["deterministic"],
    verificationRequirements: ["pure tests"],
    documentationRequirements: [],
    references: [],
  });
}

export function createDab3aFixtureApproval(
  specification: TaskSpecification,
  category: AuthorizationCategory,
  overrides: Partial<{
    decision: ApprovalRecord["decision"];
    decidedAt: string;
    expiresAt: string | null;
    decidingActor: TrustedDevelopmentActor;
  }> = {},
): ApprovalRecord {
  return createApprovalRecord({
    specification,
    categories: [category],
    decidingActor: overrides.decidingActor ?? DAB3A_FIXTURE_HUMAN,
    decision: overrides.decision ?? "approved",
    decidedAt: overrides.decidedAt ?? "2026-07-14T01:05:00.000Z",
    expiresAt: overrides.expiresAt ?? "2026-07-14T01:30:00.000Z",
    rationale: "bounded fixture approval",
    idempotencyKey: `fixture-approval-${category}-${overrides.decision ?? "approved"}`,
    authorityPolicy: {
      materialAuthorityActorId:
        (overrides.decidingActor ?? DAB3A_FIXTURE_HUMAN).actorId,
    },
  });
}

export function createDab3aFixtureRequest(
  specification: TaskSpecification,
  operation: BridgeOperation = "get_task",
  principal = createDab3aFixturePrincipal(),
): BridgeRequestEnvelope {
  return createBridgeRequestEnvelope({
    repositoryId: DAB3A_FIXTURE_REPOSITORY_ID,
    taskId: specification.taskId,
    specificationRevision: specification.revision,
    specificationHash: specification.specificationHash,
    expectedOriginMainSha: specification.expectedOriginMainSha,
    operation,
    authorizationCategory:
      getBridgeOperationPolicy(operation).authorizationCategory,
    principal,
    nonce: `fixture-nonce-${operation}`,
    issuedAt: "2026-07-14T01:10:00.000Z",
    expiresAt: "2026-07-14T01:15:00.000Z",
    correlationId: `fixture-correlation-${operation}`,
    idempotencyKey: `fixture-idempotency-${operation}`,
  });
}

export function createDab3aFixturePolicyInput(
  operation: BridgeOperation = "get_task",
): BridgePolicyInput {
  const specification = createDab3aFixtureSpecification();
  const request = createDab3aFixtureRequest(specification, operation);
  const category = getBridgeOperationPolicy(operation).authorizationCategory;
  return Object.freeze({
    request,
    specification,
    approvals: Object.freeze([
      createDab3aFixtureApproval(specification, category),
    ]),
    expectedRepositoryId: DAB3A_FIXTURE_REPOSITORY_ID,
    expectedHumanAuthorityActorId: DAB3A_FIXTURE_HUMAN.actorId,
    observedGitSha: specification.expectedOriginMainSha,
    gitEvidenceStatus: "verified",
    nonceStatus: "unused",
    idempotency: Object.freeze({
      status: "absent",
      requestFingerprint: null,
    }),
    now: DAB3A_FIXTURE_NOW,
  });
}
