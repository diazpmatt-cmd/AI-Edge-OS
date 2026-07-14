import { describe, expect, it } from "vitest";
import {
  BRIDGE_OPERATIONS,
  BRIDGE_OPERATION_AUTHORIZATION_MATRIX,
  BRIDGE_OPERATION_CATALOG,
  DAB3A_FIXTURE_NOW,
  DAB3A_FIXTURE_REPOSITORY_ID,
  DAB3A_FIXTURE_SHA,
  DevelopmentControlBridgeError,
  createBridgePrincipal,
  createBridgeRequestEnvelope,
  createDab3aFixtureApproval,
  createDab3aFixturePolicyInput,
  createDab3aFixturePrincipal,
  createDab3aFixtureRequest,
  createDab3aFixtureSpecification,
  evaluateBridgePolicy,
  getBridgeOperationPolicy,
  type BridgeOperation,
  type BridgePolicyInput,
  type BridgeRequestEnvelope,
} from "..";

function withRequest(
  input: BridgePolicyInput,
  changes: Partial<BridgeRequestEnvelope>,
): BridgePolicyInput {
  return { ...input, request: { ...input.request, ...changes } };
}

describe("DAB-3A bridge principal and request contracts", () => {
  it("normalizes deterministic workload principals", () => {
    const first = createDab3aFixturePrincipal();
    const second = createBridgePrincipal({
      actorType: "codex_implementer",
      status: "active",
      expiresAt: "2026-07-14T02:00:00Z",
      verifiedAt: "2026-07-14T01:00:00Z",
      credentialReferenceId: " fixture-key-reference ",
      audience: "ai-edge-development-control",
      subject: "workload:codex:alex",
      issuer: "https://identity.example.invalid",
    });
    expect(second).toEqual(first);
    expect(first.principalId).toMatch(/^bridge_principal_[0-9a-f]{64}$/);
  });

  it("rejects human identities as workload principals", () => {
    expect(() =>
      createDab3aFixturePrincipal({ actorType: "human_authority" as never }),
    ).toThrowError(
      expect.objectContaining({ code: "HUMAN_PRINCIPAL_FORBIDDEN" }),
    );
  });

  it("rejects secrets, customer identity, and unrestricted metadata", () => {
    for (const forbidden of ["token", "secret", "clientId", "tenantId", "metadata"]) {
      expect(() =>
        createBridgePrincipal({
          ...createDab3aFixturePrincipal(),
          [forbidden]: "forbidden",
        } as never),
      ).toThrowError(
        expect.objectContaining({ code: "SENSITIVE_PRINCIPAL_FIELD" }),
      );
    }
  });

  it("rejects invalid principal time bounds and unknown runtime statuses", () => {
    expect(() =>
      createDab3aFixturePrincipal({
        verifiedAt: "2026-07-14T02:00:00Z",
        expiresAt: "2026-07-14T01:00:00Z",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_PRINCIPAL_TIME" }));
    expect(() =>
      createDab3aFixturePrincipal({ status: "invented" as never }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_PRINCIPAL_STATUS" }));
  });

  it("normalizes and fingerprints request envelopes deterministically", () => {
    const specification = createDab3aFixtureSpecification();
    const first = createDab3aFixtureRequest(specification);
    const second = createBridgeRequestEnvelope({
      idempotencyKey: "fixture-idempotency-get_task",
      correlationId: "fixture-correlation-get_task",
      expiresAt: "2026-07-14T01:15:00Z",
      issuedAt: "2026-07-14T01:10:00Z",
      nonce: "fixture-nonce-get_task",
      principal: first.principal,
      authorizationCategory: "scope",
      operation: "get_task",
      expectedOriginMainSha: specification.expectedOriginMainSha.toUpperCase(),
      specificationHash: specification.specificationHash,
      specificationRevision: specification.revision,
      taskId: specification.taskId,
      repositoryId: DAB3A_FIXTURE_REPOSITORY_ID,
    });
    expect(second).toEqual(first);
    expect(first.requestFingerprint).toMatch(/^bridge_request_[0-9a-f]{64}$/);
  });

  it("rejects unallowlisted operations and invalid identifiers", () => {
    const specification = createDab3aFixtureSpecification();
    const base = createDab3aFixtureRequest(specification);
    expect(() =>
      createBridgeRequestEnvelope({ ...base, operation: "shell" as never }),
    ).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_OPERATION" }));
    expect(() =>
      createBridgeRequestEnvelope({ ...base, repositoryId: "owner/repository" }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_REPOSITORY_ID" }));
    expect(() =>
      createBridgeRequestEnvelope({ ...base, specificationHash: "spec_invalid" }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_SPECIFICATION_HASH" }));
  });

  it("rejects excessive request lifetime and sensitive request properties", () => {
    const specification = createDab3aFixtureSpecification();
    const base = createDab3aFixtureRequest(specification);
    expect(() =>
      createBridgeRequestEnvelope({
        ...base,
        issuedAt: "2026-07-14T01:00:00Z",
        expiresAt: "2026-07-14T01:16:00Z",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_REQUEST_LIFETIME" }));
    expect(() =>
      createBridgeRequestEnvelope({ ...base, environment: "forbidden" } as never),
    ).toThrowError(expect.objectContaining({ code: "SENSITIVE_REQUEST_FIELD" }));
  });

  it("rejects tampered or sensitive principal objects at the request boundary", () => {
    const specification = createDab3aFixtureSpecification();
    const base = createDab3aFixtureRequest(specification);
    expect(() =>
      createBridgeRequestEnvelope({
        ...base,
        principal: { ...base.principal, subject: "workload:tampered" },
      }),
    ).toThrowError(
      expect.objectContaining({ code: "PRINCIPAL_INTEGRITY_MISMATCH" }),
    );
    expect(() =>
      createBridgeRequestEnvelope({
        ...base,
        principal: { ...base.principal, token: "forbidden" } as never,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "SENSITIVE_PRINCIPAL_FIELD" }),
    );
  });
});

describe("DAB-3A operation allowlist", () => {
  it("exports a complete stable authorization matrix", () => {
    expect(Object.keys(BRIDGE_OPERATION_CATALOG).sort()).toEqual(
      [...BRIDGE_OPERATIONS].sort(),
    );
    expect(Object.keys(BRIDGE_OPERATION_AUTHORIZATION_MATRIX).sort()).toEqual(
      [...BRIDGE_OPERATIONS].sort(),
    );
    expect(BRIDGE_OPERATIONS).toHaveLength(20);
  });

  for (const operation of BRIDGE_OPERATIONS) {
    it(`allows or explicitly defers ${operation} with exact authorization`, () => {
      const decision = evaluateBridgePolicy(createDab3aFixturePolicyInput(operation));
      const expected =
        getBridgeOperationPolicy(operation).availability === "deferred"
          ? "deferred"
          : "allowed";
      expect(decision.status).toBe(expected);
      expect(decision.authorizationCategory).toBe(
        BRIDGE_OPERATION_AUTHORIZATION_MATRIX[operation],
      );
      expect(decision.humanApprovalRequired).toBe(true);
    });

    it(`rejects ${operation} when its requested category differs`, () => {
      const input = createDab3aFixturePolicyInput(operation);
      const wrongCategory =
        getBridgeOperationPolicy(operation).authorizationCategory === "scope"
          ? "editing"
          : "scope";
      const decision = evaluateBridgePolicy(
        withRequest(input, { authorizationCategory: wrongCategory }),
      );
      expect(decision.status).toBe("denied");
      expect(decision.reasonCodes).toContain("AUTHORIZATION_CATEGORY_MISMATCH");
    });
  }
});

describe("DAB-3A fail-closed policy evaluation", () => {
  it("requires an exact repository, task, revision, specification hash, and SHA", () => {
    const input = createDab3aFixturePolicyInput();
    const decision = evaluateBridgePolicy({
      ...withRequest(input, {
        repositoryId: "999",
        taskId: "OTHER",
        specificationRevision: 2,
        specificationHash: `spec_${"0".repeat(64)}`,
        expectedOriginMainSha: "0".repeat(40),
      }),
      observedGitSha: "1".repeat(40),
    });
    expect(decision.reasonCodes).toEqual([
      "GIT_SHA_MISMATCH",
      "REPOSITORY_MISMATCH",
      "SPECIFICATION_HASH_MISMATCH",
      "SPECIFICATION_REVISION_MISMATCH",
      "TASK_MISMATCH",
    ]);
  });

  for (const [status, reason] of [
    ["stale", "GIT_EVIDENCE_STALE"],
    ["unavailable", "GIT_EVIDENCE_UNAVAILABLE"],
    ["ambiguous", "GIT_EVIDENCE_AMBIGUOUS"],
    ["edited", "GIT_EVIDENCE_EDITED"],
    ["deleted", "GIT_EVIDENCE_DELETED"],
  ] as const) {
    it(`fails closed for ${status} Git evidence`, () => {
      const decision = evaluateBridgePolicy({
        ...createDab3aFixturePolicyInput(),
        gitEvidenceStatus: status,
      });
      expect(decision.status).toBe("denied");
      expect(decision.reasonCodes).toContain(reason);
    });
  }

  it("rejects missing, expired, revoked, and wrong-category approval", () => {
    const input = createDab3aFixturePolicyInput();
    expect(
      evaluateBridgePolicy({ ...input, approvals: [] }).reasonCodes,
    ).toContain("APPROVAL_MISSING");
    expect(
      evaluateBridgePolicy({
        ...input,
        approvals: [
          createDab3aFixtureApproval(input.specification, "scope", {
            expiresAt: "2026-07-14T01:10:00Z",
          }),
        ],
      }).reasonCodes,
    ).toContain("APPROVAL_EXPIRED");
    expect(
      evaluateBridgePolicy({
        ...input,
        approvals: [
          createDab3aFixtureApproval(input.specification, "scope", {
            decision: "revoked",
          }),
        ],
      }).reasonCodes,
    ).toContain("APPROVAL_NOT_USABLE");
    expect(
      evaluateBridgePolicy({
        ...input,
        approvals: [createDab3aFixtureApproval(input.specification, "editing")],
      }).reasonCodes,
    ).toContain("APPROVAL_MISSING");
  });

  it("rejects workload self-approval", () => {
    const input = createDab3aFixturePolicyInput();
    const actor = {
      actorId: input.request.principal.subject,
      displayName: "Impersonating workload",
      actorType: "human_authority" as const,
      verified: true,
      developmentControl: true as const,
    };
    const decision = evaluateBridgePolicy({
      ...input,
      approvals: [
        createDab3aFixtureApproval(input.specification, "scope", {
          decidingActor: actor,
        }),
      ],
    });
    expect(decision.reasonCodes).toContain("SELF_APPROVAL_FORBIDDEN");
  });

  it("requires the exact verified stable human-authority identity", () => {
    const input = createDab3aFixturePolicyInput();
    const otherHuman = {
      actorId: "github-actor:999999999",
      displayName: "Impersonating human",
      actorType: "human_authority" as const,
      verified: true,
      developmentControl: true as const,
    };
    const wrongActorApproval = createDab3aFixtureApproval(
      input.specification,
      "scope",
      { decidingActor: otherHuman },
    );
    expect(
      evaluateBridgePolicy({
        ...input,
        approvals: [wrongActorApproval],
      }).reasonCodes,
    ).toContain("APPROVER_IDENTITY_MISMATCH");
    expect(
      evaluateBridgePolicy({
        ...input,
        approvals: [
          {
            ...input.approvals[0],
            decidingActor: {
              ...input.approvals[0].decidingActor,
              verified: false,
            },
          },
        ],
      }).reasonCodes,
    ).toContain("APPROVAL_NOT_USABLE");
  });

  it("rejects revoked, unknown, expired, and not-yet-verified principals", () => {
    const input = createDab3aFixturePolicyInput();
    for (const principal of [
      createDab3aFixturePrincipal({ status: "revoked" }),
      createDab3aFixturePrincipal({ status: "unknown" }),
      createDab3aFixturePrincipal({ expiresAt: DAB3A_FIXTURE_NOW }),
      createDab3aFixturePrincipal({
        verifiedAt: "2026-07-14T01:12:00Z",
        expiresAt: "2026-07-14T02:00:00Z",
      }),
    ]) {
      const request = createDab3aFixtureRequest(
        input.specification,
        "get_task",
        principal,
      );
      expect(
        evaluateBridgePolicy({ ...input, request }).status,
      ).toBe("denied");
    }
  });

  it("rejects requests outside their validity window", () => {
    const input = createDab3aFixturePolicyInput();
    expect(
      evaluateBridgePolicy({ ...input, now: "2026-07-14T01:09:00Z" })
        .reasonCodes,
    ).toContain("REQUEST_NOT_YET_VALID");
    expect(
      evaluateBridgePolicy({ ...input, now: input.request.expiresAt })
        .reasonCodes,
    ).toContain("REQUEST_EXPIRED");
    expect(
      evaluateBridgePolicy({ ...input, now: "not-a-time" }).reasonCodes,
    ).toContain("POLICY_TIME_INVALID");
  });

  it("rejects replayed or unavailable nonce state", () => {
    const input = createDab3aFixturePolicyInput();
    expect(
      evaluateBridgePolicy({ ...input, nonceStatus: "used" }).reasonCodes,
    ).toContain("NONCE_REPLAYED");
    expect(
      evaluateBridgePolicy({ ...input, nonceStatus: "unknown" }).reasonCodes,
    ).toContain("NONCE_STATUS_UNAVAILABLE");
  });

  it("allows exact idempotent replay and rejects conflicting evidence", () => {
    const input = createDab3aFixturePolicyInput();
    expect(
      evaluateBridgePolicy({
        ...input,
        idempotency: {
          status: "matching",
          requestFingerprint: input.request.requestFingerprint,
        },
      }).status,
    ).toBe("allowed");
    expect(
      evaluateBridgePolicy({
        ...input,
        idempotency: {
          status: "matching",
          requestFingerprint: `bridge_request_${"0".repeat(64)}`,
        },
      }).reasonCodes,
    ).toContain("IDEMPOTENCY_EVIDENCE_MISMATCH");
    expect(
      evaluateBridgePolicy({
        ...input,
        idempotency: { status: "conflicting", requestFingerprint: null },
      }).reasonCodes,
    ).toContain("IDEMPOTENCY_CONFLICT");
    expect(
      evaluateBridgePolicy({
        ...input,
        idempotency: {
          status: "absent",
          requestFingerprint: input.request.requestFingerprint,
        },
      }).reasonCodes,
    ).toContain("IDEMPOTENCY_EVIDENCE_MISMATCH");
  });

  it("returns bounded deterministic decisions with stable reason ordering", () => {
    const input = createDab3aFixturePolicyInput();
    const first = evaluateBridgePolicy({
      ...withRequest(input, { repositoryId: "999" }),
      nonceStatus: "used",
      gitEvidenceStatus: "unavailable",
    });
    const second = evaluateBridgePolicy({
      ...withRequest(input, { repositoryId: "999" }),
      gitEvidenceStatus: "unavailable",
      nonceStatus: "used",
      approvals: [...input.approvals].reverse(),
    });
    expect(second).toEqual(first);
    expect(first.reasonCodes).toEqual([...first.reasonCodes].sort());
    expect(JSON.stringify(first)).not.toMatch(
      /token|secret|password|environment|clientId|tenantId|stack/i,
    );
  });

  it("does not manufacture execution for modeled writes or deferred operations", () => {
    const modeled = evaluateBridgePolicy(
      createDab3aFixturePolicyInput("claim_approved_task"),
    );
    const deferred = evaluateBridgePolicy(
      createDab3aFixturePolicyInput("record_authorization_decision"),
    );
    expect(modeled.status).toBe("allowed");
    expect(modeled).not.toHaveProperty("executed");
    expect(deferred.status).toBe("deferred");
    expect(deferred.reasonCodes).toEqual(["OPERATION_DEFERRED"]);
  });

  it("keeps fixtures credential-free and tenant-independent", () => {
    const fixture = createDab3aFixturePolicyInput();
    const serialized = JSON.stringify(fixture);
    expect(serialized).not.toMatch(
      /DATABASE_URL|bearer|api[_-]?key|private[_-]?key|clientId|tenantId/i,
    );
    expect(fixture.observedGitSha).toBe(DAB3A_FIXTURE_SHA);
    expect(fixture.now).toBe(DAB3A_FIXTURE_NOW);
  });

  it("uses bounded package-specific errors", () => {
    try {
      createDab3aFixturePrincipal({ issuer: "" });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(DevelopmentControlBridgeError);
      expect(error).toMatchObject({ code: "INVALID_PRINCIPAL" });
      expect((error as Error).message.length).toBeLessThan(200);
    }
  });
});
