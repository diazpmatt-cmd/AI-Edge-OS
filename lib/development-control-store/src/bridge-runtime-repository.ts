import type {
  GitHubApprovalBinding,
  GitHubEvidence,
} from "@workspace/development-control-github";
import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

type Database = NodePgDatabase<typeof schema>;

export type BridgeLedgerOutcome = "claimed" | "allowed" | "denied" | "failed";
export type BridgeLedgerClaimStatus =
  | "claimed"
  | "matching"
  | "conflicting"
  | "nonce_replayed";

export interface BridgeLedgerClaimInput {
  readonly requestFingerprintHash: string;
  readonly principalReferenceHash: string;
  readonly tokenIdHash: string;
  readonly nonceHash: string;
  readonly idempotencyKeyHash: string;
  readonly correlationReference: string;
  readonly operation: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface BridgeLedgerClaimResult {
  readonly status: BridgeLedgerClaimStatus;
  readonly requestFingerprintHash: string | null;
  readonly outcome: BridgeLedgerOutcome | null;
}

export interface BridgeRequestLedgerRepository {
  claim(input: BridgeLedgerClaimInput): Promise<BridgeLedgerClaimResult>;
  finalize(
    requestFingerprintHash: string,
    outcome: Exclude<BridgeLedgerOutcome, "claimed">,
  ): Promise<void>;
  cleanupExpired(before: string, limit: number): Promise<number>;
}

export type BridgeGitEvidenceStatus =
  | "verified"
  | "stale"
  | "unavailable"
  | "ambiguous"
  | "edited"
  | "deleted";

export interface BridgeGitEvidenceProjection {
  readonly evidenceId: string;
  readonly objectType: GitHubEvidence["objectType"];
  readonly objectId: string;
  readonly sourceUrl: string;
  readonly actorId: string | null;
  readonly actorLogin: string | null;
  readonly updatedAt: string;
  readonly contentHash: string;
  readonly headSha: string | null;
}

export interface BridgeGitEvidenceReadResult {
  readonly status: BridgeGitEvidenceStatus;
  readonly observedGitSha: string | null;
  readonly evidence: readonly BridgeGitEvidenceProjection[];
}

export interface BridgeGitEvidenceReader {
  readBoundEvidence(input: {
    readonly repositoryId: string;
    readonly taskId: string;
    readonly specificationRevision: number;
    readonly specificationHash: string;
    readonly expectedOriginMainSha: string;
    readonly limit?: number;
  }): Promise<BridgeGitEvidenceReadResult>;
}

interface StoredLedgerRecord extends BridgeLedgerClaimInput {
  outcome: BridgeLedgerOutcome;
}

const HASH_PATTERNS = Object.freeze({
  requestFingerprintHash: /^bridge_request_hash_[0-9a-f]{64}$/,
  principalReferenceHash: /^bridge_principal_hash_[0-9a-f]{64}$/,
  tokenIdHash: /^bridge_token_hash_[0-9a-f]{64}$/,
  nonceHash: /^bridge_nonce_hash_[0-9a-f]{64}$/,
  idempotencyKeyHash: /^bridge_idempotency_hash_[0-9a-f]{64}$/,
});

function assertClaim(input: BridgeLedgerClaimInput): void {
  for (const [field, pattern] of Object.entries(HASH_PATTERNS)) {
    if (!pattern.test(input[field as keyof typeof HASH_PATTERNS])) {
      throw new Error("BRIDGE_LEDGER_INVALID_HASH");
    }
  }
  if (
    !input.correlationReference.trim() ||
    input.correlationReference.length > 200 ||
    !input.operation.trim() ||
    input.operation.length > 100 ||
    Date.parse(input.expiresAt) <= Date.parse(input.createdAt)
  ) {
    throw new Error("BRIDGE_LEDGER_INVALID_INPUT");
  }
}

function freezeResult(
  status: BridgeLedgerClaimStatus,
  record: StoredLedgerRecord | null,
): BridgeLedgerClaimResult {
  return Object.freeze({
    status,
    requestFingerprintHash: record?.requestFingerprintHash ?? null,
    outcome: record?.outcome ?? null,
  });
}

export class InMemoryBridgeRuntimeRepository
  implements BridgeRequestLedgerRepository, BridgeGitEvidenceReader
{
  private readonly ledger = new Map<string, StoredLedgerRecord>();

  constructor(private readonly gitEvidence: readonly GitHubEvidence[] = []) {}

  async claim(input: BridgeLedgerClaimInput): Promise<BridgeLedgerClaimResult> {
    assertClaim(input);
    const now = Date.parse(input.createdAt);
    for (const [key, record] of this.ledger) {
      if (Date.parse(record.expiresAt) <= now) this.ledger.delete(key);
    }
    const records = [...this.ledger.values()];
    const sameIdempotency = records.find(
      (record) =>
        record.principalReferenceHash === input.principalReferenceHash &&
        record.idempotencyKeyHash === input.idempotencyKeyHash,
    );
    if (sameIdempotency) {
      return freezeResult(
        sameIdempotency.requestFingerprintHash === input.requestFingerprintHash
          ? "matching"
          : "conflicting",
        sameIdempotency,
      );
    }
    const sameNonce = records.find(
      (record) =>
        record.principalReferenceHash === input.principalReferenceHash &&
        record.nonceHash === input.nonceHash,
    );
    if (sameNonce) return freezeResult("nonce_replayed", sameNonce);
    this.ledger.set(input.requestFingerprintHash, {
      ...input,
      outcome: "claimed",
    });
    return freezeResult("claimed", null);
  }

  async finalize(
    requestFingerprintHash: string,
    outcome: Exclude<BridgeLedgerOutcome, "claimed">,
  ): Promise<void> {
    const record = this.ledger.get(requestFingerprintHash);
    if (!record) throw new Error("BRIDGE_LEDGER_RECORD_UNAVAILABLE");
    record.outcome = outcome;
  }

  async cleanupExpired(before: string, limit: number): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error("BRIDGE_LEDGER_INVALID_LIMIT");
    }
    const keys = [...this.ledger.entries()]
      .filter(([, record]) => Date.parse(record.expiresAt) < Date.parse(before))
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, limit)
      .map(([key]) => key);
    for (const key of keys) this.ledger.delete(key);
    return keys.length;
  }

  async readBoundEvidence(
    input: Parameters<BridgeGitEvidenceReader["readBoundEvidence"]>[0],
  ): Promise<BridgeGitEvidenceReadResult> {
    return projectEvidence(this.gitEvidence, input);
  }

  listLedger(): readonly StoredLedgerRecord[] {
    return Object.freeze(
      [...this.ledger.values()]
        .map((record) => Object.freeze({ ...record }))
        .sort((left, right) =>
          left.requestFingerprintHash.localeCompare(right.requestFingerprintHash),
        ),
    );
  }
}

function bindingMatches(
  binding: GitHubApprovalBinding | null,
  input: Parameters<BridgeGitEvidenceReader["readBoundEvidence"]>[0],
): boolean {
  return Boolean(
    binding &&
      binding.taskId === input.taskId &&
      binding.specificationRevision === input.specificationRevision &&
      binding.specificationHash === input.specificationHash &&
      binding.expectedOriginMainSha === input.expectedOriginMainSha,
  );
}

function projectEvidence(
  evidence: readonly GitHubEvidence[],
  input: Parameters<BridgeGitEvidenceReader["readBoundEvidence"]>[0],
): BridgeGitEvidenceReadResult {
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("BRIDGE_GIT_EVIDENCE_INVALID_LIMIT");
  }
  const matched = evidence
    .filter(
      (item) =>
        item.repositoryId === input.repositoryId &&
        bindingMatches(item.approvalBinding, input),
    )
    .slice()
    .sort((left, right) =>
      `${right.updatedAt}:${right.evidenceId}`.localeCompare(
        `${left.updatedAt}:${left.evidenceId}`,
      ),
    )
    .slice(0, limit);
  const heads = [...new Set(matched.map((item) => item.headSha).filter(Boolean))];
  const status: BridgeGitEvidenceStatus =
    matched.length === 0
      ? "unavailable"
      : matched.some((item) => item.deleted)
        ? "deleted"
        : matched.some(
              (item) =>
                item.previousHeadSha && item.previousHeadSha !== item.headSha,
            )
          ? "edited"
          : heads.length > 1
            ? "ambiguous"
            : heads[0] !== input.expectedOriginMainSha
              ? "stale"
              : "verified";
  return Object.freeze({
    status,
    observedGitSha: status === "verified" ? heads[0] ?? null : null,
    evidence: Object.freeze(
      matched.map((item) =>
        Object.freeze({
          evidenceId: item.evidenceId,
          objectType: item.objectType,
          objectId: item.objectId,
          sourceUrl: item.sourceUrl,
          actorId: item.actorId,
          actorLogin: item.actorLogin,
          updatedAt: item.updatedAt,
          contentHash: item.contentHash,
          headSha: item.headSha,
        }),
      ),
    ),
  });
}

export class PostgresBridgeRuntimeRepository
  implements BridgeRequestLedgerRepository, BridgeGitEvidenceReader
{
  constructor(private readonly db: Database) {}

  async claim(input: BridgeLedgerClaimInput): Promise<BridgeLedgerClaimResult> {
    assertClaim(input);
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${input.principalReferenceHash}))`,
      );
      const [idempotency] = await tx
        .select()
        .from(schema.developmentBridgeRequestLedgerTable)
        .where(
          and(
            eq(
              schema.developmentBridgeRequestLedgerTable.principalReferenceHash,
              input.principalReferenceHash,
            ),
            eq(
              schema.developmentBridgeRequestLedgerTable.idempotencyKeyHash,
              input.idempotencyKeyHash,
            ),
          ),
        )
        .limit(1);
      if (idempotency) {
        return Object.freeze({
          status:
            idempotency.requestFingerprintHash === input.requestFingerprintHash
              ? "matching"
              : "conflicting",
          requestFingerprintHash: idempotency.requestFingerprintHash,
          outcome: idempotency.outcome as BridgeLedgerOutcome,
        });
      }
      const [nonce] = await tx
        .select()
        .from(schema.developmentBridgeRequestLedgerTable)
        .where(
          and(
            eq(
              schema.developmentBridgeRequestLedgerTable.principalReferenceHash,
              input.principalReferenceHash,
            ),
            eq(
              schema.developmentBridgeRequestLedgerTable.nonceHash,
              input.nonceHash,
            ),
          ),
        )
        .limit(1);
      if (nonce) {
        return Object.freeze({
          status: "nonce_replayed" as const,
          requestFingerprintHash: nonce.requestFingerprintHash,
          outcome: nonce.outcome as BridgeLedgerOutcome,
        });
      }
      await tx.insert(schema.developmentBridgeRequestLedgerTable).values({
        ...input,
        outcome: "claimed",
        createdAt: new Date(input.createdAt),
        expiresAt: new Date(input.expiresAt),
      });
      return Object.freeze({
        status: "claimed" as const,
        requestFingerprintHash: null,
        outcome: null,
      });
    });
  }

  async finalize(
    requestFingerprintHash: string,
    outcome: Exclude<BridgeLedgerOutcome, "claimed">,
  ): Promise<void> {
    const rows = await this.db
      .update(schema.developmentBridgeRequestLedgerTable)
      .set({ outcome })
      .where(
        eq(
          schema.developmentBridgeRequestLedgerTable.requestFingerprintHash,
          requestFingerprintHash,
        ),
      )
      .returning({
        requestFingerprintHash:
          schema.developmentBridgeRequestLedgerTable.requestFingerprintHash,
      });
    if (rows.length !== 1) throw new Error("BRIDGE_LEDGER_RECORD_UNAVAILABLE");
  }

  async cleanupExpired(before: string, limit: number): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error("BRIDGE_LEDGER_INVALID_LIMIT");
    }
    const result = await this.db.execute(sql`
      WITH expired AS (
        SELECT request_fingerprint_hash
        FROM development_bridge_request_ledger
        WHERE expires_at < ${new Date(before)}
        ORDER BY expires_at, request_fingerprint_hash
        LIMIT ${limit}
      )
      DELETE FROM development_bridge_request_ledger ledger
      USING expired
      WHERE ledger.request_fingerprint_hash = expired.request_fingerprint_hash
      RETURNING ledger.request_fingerprint_hash
    `);
    return result.rowCount ?? 0;
  }

  async readBoundEvidence(
    input: Parameters<BridgeGitEvidenceReader["readBoundEvidence"]>[0],
  ): Promise<BridgeGitEvidenceReadResult> {
    const rows = await this.db
      .select()
      .from(schema.developmentGitHubEvidenceTable)
      .where(
        eq(
          schema.developmentGitHubEvidenceTable.repositoryId,
          input.repositoryId,
        ),
      )
      .orderBy(
        asc(schema.developmentGitHubEvidenceTable.sourceUpdatedAt),
        asc(schema.developmentGitHubEvidenceTable.evidenceId),
      )
      .limit(100);
    const evidence: GitHubEvidence[] = rows.map((row) => ({
      evidenceId: row.evidenceId,
      fingerprint: row.fingerprint,
      repositoryId: row.repositoryId,
      repositoryName: row.repositoryName,
      objectType: row.objectType as GitHubEvidence["objectType"],
      objectId: row.objectId,
      sourceUrl: row.sourceUrl,
      actorId: row.actorId,
      actorLogin: row.actorLogin,
      createdAt: row.sourceCreatedAt.toISOString(),
      updatedAt: row.sourceUpdatedAt.toISOString(),
      contentHash: row.contentHash,
      deleted: row.deleted,
      approvalBinding: row.approvalBinding,
      headSha: row.headSha,
      previousHeadSha: row.previousHeadSha,
    }));
    return projectEvidence(evidence, input);
  }
}
