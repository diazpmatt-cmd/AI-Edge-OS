import { DevelopmentControlError, deterministicHash } from "@workspace/development-control";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

const { developmentIdempotencyRecordsTable, developmentTasksTable } = schema;
type Database = NodePgDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const DEVELOPMENT_GIT_RECEIPT_OPERATIONS = [
  "apply",
  "commit",
  "push",
  "pull_request",
  "repair_handoff",
  "merge",
] as const;
export type DevelopmentGitReceiptOperation = typeof DEVELOPMENT_GIT_RECEIPT_OPERATIONS[number];

export type DevelopmentGitReceiptRecord<T = unknown> = Readonly<{
  taskId: string;
  operation: DevelopmentGitReceiptOperation;
  idempotencyKey: string;
  requestFingerprint: string;
  receipt: T;
  createdAt: string;
}>;

function operationName(operation: DevelopmentGitReceiptOperation): string {
  if (!DEVELOPMENT_GIT_RECEIPT_OPERATIONS.includes(operation)) {
    throw new DevelopmentControlError("INVALID_GIT_RECEIPT_OPERATION", "unsupported bounded Git receipt operation");
  }
  return `git_receipt:${operation}`;
}

function assertBounded(value: string, code: string, max = 200): void {
  if (!value.trim() || value.length > max) throw new DevelopmentControlError(code, "bounded value is required");
}

function assertReceiptSafe(value: unknown): void {
  let serialized: string;
  try { serialized = JSON.stringify(value); } catch { throw new DevelopmentControlError("INVALID_GIT_RECEIPT", "receipt must be JSON serializable"); }
  if (!serialized || Buffer.byteLength(serialized, "utf8") > 65536) throw new DevelopmentControlError("INVALID_GIT_RECEIPT", "receipt exceeds bounded storage limit");
  const forbidden = /"(?:credential|githubToken|token|secret|password|authorizationHeader)"\s*:/i;
  if (forbidden.test(serialized)) throw new DevelopmentControlError("SENSITIVE_GIT_RECEIPT", "receipt contains a forbidden sensitive field");
}

export class PostgresDevelopmentGitReceiptRepository {
  constructor(private readonly db: Database) {}

  private async databaseNow(tx: Transaction): Promise<string> {
    const result = await tx.execute<{ now: Date }>(sql`SELECT clock_timestamp() AS now`);
    return result.rows[0].now.toISOString();
  }

  async get<T>(input: {
    taskId: string;
    operation: DevelopmentGitReceiptOperation;
    idempotencyKey: string;
  }): Promise<DevelopmentGitReceiptRecord<T> | null> {
    assertBounded(input.taskId, "INVALID_TASK_ID");
    assertBounded(input.idempotencyKey, "INVALID_IDEMPOTENCY_KEY");
    const operation = operationName(input.operation);
    const [row] = await this.db.select().from(developmentIdempotencyRecordsTable).where(and(
      eq(developmentIdempotencyRecordsTable.operation, operation),
      eq(developmentIdempotencyRecordsTable.taskId, input.taskId),
      eq(developmentIdempotencyRecordsTable.idempotencyKey, input.idempotencyKey),
    )).limit(1);
    if (!row) return null;
    const stored = row.result as { receipt: T; requestFingerprint: string; createdAt: string };
    return Object.freeze({ taskId: input.taskId, operation: input.operation, idempotencyKey: input.idempotencyKey, requestFingerprint: stored.requestFingerprint, receipt: stored.receipt, createdAt: stored.createdAt });
  }

  async put<T>(input: {
    taskId: string;
    operation: DevelopmentGitReceiptOperation;
    idempotencyKey: string;
    requestMaterial: unknown;
    receipt: T;
  }): Promise<DevelopmentGitReceiptRecord<T>> {
    assertBounded(input.taskId, "INVALID_TASK_ID");
    assertBounded(input.idempotencyKey, "INVALID_IDEMPOTENCY_KEY");
    assertReceiptSafe(input.requestMaterial);
    assertReceiptSafe(input.receipt);
    const operation = operationName(input.operation);
    const requestFingerprint = deterministicHash(input.requestMaterial, "request");
    const lockKey = `${operation}|${input.taskId}|${input.idempotencyKey}`;

    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
      const [task] = await tx.select({ taskId: developmentTasksTable.taskId }).from(developmentTasksTable).where(eq(developmentTasksTable.taskId, input.taskId)).limit(1);
      if (!task) throw new DevelopmentControlError("TASK_NOT_FOUND", `task ${input.taskId} was not found`);

      const [existing] = await tx.select().from(developmentIdempotencyRecordsTable).where(and(
        eq(developmentIdempotencyRecordsTable.operation, operation),
        eq(developmentIdempotencyRecordsTable.taskId, input.taskId),
        eq(developmentIdempotencyRecordsTable.idempotencyKey, input.idempotencyKey),
      )).limit(1);
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) throw new DevelopmentControlError("IDEMPOTENCY_CONFLICT", "idempotency key was reused for different Git receipt input");
        const stored = existing.result as { receipt: T; requestFingerprint: string; createdAt: string };
        return Object.freeze({ taskId: input.taskId, operation: input.operation, idempotencyKey: input.idempotencyKey, requestFingerprint: stored.requestFingerprint, receipt: stored.receipt, createdAt: stored.createdAt });
      }

      const createdAt = await this.databaseNow(tx);
      const result = { receipt: input.receipt, requestFingerprint, createdAt };
      await tx.insert(developmentIdempotencyRecordsTable).values({
        operation,
        taskId: input.taskId,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        result,
        createdAt: new Date(createdAt),
      });
      return Object.freeze({ taskId: input.taskId, operation: input.operation, idempotencyKey: input.idempotencyKey, requestFingerprint, receipt: input.receipt, createdAt });
    });
  }
}
