import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

type Database = NodePgDatabase<typeof schema>;

export interface BridgeRateLimitConsumeInput {
  readonly principalReferenceHash: string;
  readonly now: string;
  readonly windowSeconds: number;
  readonly limit: number;
}
export interface BridgeRateLimitRepository {
  consume(input: BridgeRateLimitConsumeInput): Promise<boolean>;
  cleanupExpired(before: string, limit: number): Promise<number>;
}

interface RateLimitRecord {
  readonly principalReferenceHash: string;
  readonly windowStartedAt: string;
  requestCount: number;
  readonly expiresAt: string;
}

const PRINCIPAL_HASH = /^bridge_principal_hash_[0-9a-f]{64}$/;

function normalize(input: BridgeRateLimitConsumeInput): {
  readonly principalReferenceHash: string;
  readonly windowStartedAt: string;
  readonly expiresAt: string;
  readonly limit: number;
} {
  const now = Date.parse(input.now);
  if (
    !PRINCIPAL_HASH.test(input.principalReferenceHash) ||
    !Number.isFinite(now) ||
    !Number.isInteger(input.windowSeconds) ||
    input.windowSeconds < 1 ||
    input.windowSeconds > 3_600 ||
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 1_000
  ) {
    throw new Error("BRIDGE_RATE_LIMIT_INVALID_INPUT");
  }
  const windowMs = input.windowSeconds * 1_000;
  const windowStartedAt = new Date(Math.floor(now / windowMs) * windowMs);
  return Object.freeze({
    principalReferenceHash: input.principalReferenceHash,
    windowStartedAt: windowStartedAt.toISOString(),
    expiresAt: new Date(windowStartedAt.getTime() + windowMs * 2).toISOString(),
    limit: input.limit,
  });
}

export class InMemoryBridgeRateLimitRepository
  implements BridgeRateLimitRepository
{
  private readonly records = new Map<string, RateLimitRecord>();

  async consume(input: BridgeRateLimitConsumeInput): Promise<boolean> {
    const normalized = normalize(input);
    const key = `${normalized.principalReferenceHash}:${normalized.windowStartedAt}`;
    const record = this.records.get(key);
    if (!record) {
      this.records.set(key, {
        principalReferenceHash: normalized.principalReferenceHash,
        windowStartedAt: normalized.windowStartedAt,
        requestCount: 1,
        expiresAt: normalized.expiresAt,
      });
      return true;
    }
    if (record.requestCount >= normalized.limit) return false;
    record.requestCount += 1;
    return true;
  }

  async cleanupExpired(before: string, limit: number): Promise<number> {
    const beforeMs = Date.parse(before);
    if (
      !Number.isFinite(beforeMs) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1_000
    ) {
      throw new Error("BRIDGE_RATE_LIMIT_INVALID_CLEANUP");
    }
    const keys = [...this.records.entries()]
      .filter(([, record]) => Date.parse(record.expiresAt) < beforeMs)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, limit)
      .map(([key]) => key);
    for (const key of keys) this.records.delete(key);
    return keys.length;
  }

  listRecords(): readonly Readonly<RateLimitRecord>[] {
    return Object.freeze(
      [...this.records.values()]
        .map((record) => Object.freeze({ ...record }))
        .sort((left, right) =>
          `${left.windowStartedAt}:${left.principalReferenceHash}`.localeCompare(
            `${right.windowStartedAt}:${right.principalReferenceHash}`,
          ),
        ),
    );
  }
}

export class PostgresBridgeRateLimitRepository
  implements BridgeRateLimitRepository
{
  constructor(private readonly db: Database) {}

  async consume(input: BridgeRateLimitConsumeInput): Promise<boolean> {
    const normalized = normalize(input);
    const result = await this.db.execute(sql`
      INSERT INTO development_bridge_rate_limits (
        principal_reference_hash,
        window_started_at,
        request_count,
        expires_at
      ) VALUES (
        ${normalized.principalReferenceHash},
        ${new Date(normalized.windowStartedAt)},
        1,
        ${new Date(normalized.expiresAt)}
      )
      ON CONFLICT (principal_reference_hash, window_started_at)
      DO UPDATE SET request_count = development_bridge_rate_limits.request_count + 1
      WHERE development_bridge_rate_limits.request_count < ${normalized.limit}
      RETURNING request_count
    `);
    return (result.rowCount ?? 0) === 1;
  }

  async cleanupExpired(before: string, limit: number): Promise<number> {
    const beforeMs = Date.parse(before);
    if (
      !Number.isFinite(beforeMs) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1_000
    ) {
      throw new Error("BRIDGE_RATE_LIMIT_INVALID_CLEANUP");
    }
    const result = await this.db.execute(sql`
      WITH expired AS (
        SELECT principal_reference_hash, window_started_at
        FROM development_bridge_rate_limits
        WHERE expires_at < ${new Date(before)}
        ORDER BY expires_at, principal_reference_hash
        LIMIT ${limit}
      )
      DELETE FROM development_bridge_rate_limits limits
      USING expired
      WHERE limits.principal_reference_hash = expired.principal_reference_hash
        AND limits.window_started_at = expired.window_started_at
      RETURNING limits.principal_reference_hash
    `);
    return result.rowCount ?? 0;
  }
}
