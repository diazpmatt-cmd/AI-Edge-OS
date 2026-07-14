import { readFileSync } from "node:fs";
import path from "node:path";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  approvalFixture,
  normalizeGitHubObservation,
} from "@workspace/development-control-github";
import { InMemoryBridgeRuntimeRepository } from "../bridge-runtime-repository";
import { InMemoryBridgeRateLimitRepository } from "../bridge-rate-limit-repository";
import {
  developmentBridgeRateLimitsTable,
  developmentBridgeRequestLedgerTable,
} from "../schema";

const HASH = "1".repeat(64);
const baseClaim = Object.freeze({
  requestFingerprintHash: `bridge_request_hash_${HASH}`,
  principalReferenceHash: `bridge_principal_hash_${"2".repeat(64)}`,
  tokenIdHash: `bridge_token_hash_${"3".repeat(64)}`,
  nonceHash: `bridge_nonce_hash_${"4".repeat(64)}`,
  idempotencyKeyHash: `bridge_idempotency_hash_${"5".repeat(64)}`,
  correlationReference: "correlation-1",
  operation: "get_task",
  createdAt: "2026-07-14T02:00:00.000Z",
  expiresAt: "2026-07-14T02:15:00.000Z",
});

describe("DAB-3B bridge runtime repository", () => {
  it("keeps the additive migration and Drizzle schema aligned", () => {
    expect(getTableName(developmentBridgeRequestLedgerTable)).toBe(
      "development_bridge_request_ledger",
    );
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "lib/development-control-store/migrations/0003_dab3b_bridge_request_ledger.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS development_bridge_request_ledger/,
    );
    for (const column of Object.values(
      getTableColumns(developmentBridgeRequestLedgerTable),
    )) {
      expect(sql).toMatch(new RegExp(`(?:^|\\n)\\s*${column.name}\\s`, "m"));
    }
    expect(sql).not.toMatch(
      /\b(?:DROP|TRUNCATE|ALTER TABLE|CREATE TRIGGER|client_id|tenant_id|customer_id|database_url)\b/i,
    );
  });

  it("stores only bounded hashed security fields", () => {
    expect(Object.keys(getTableColumns(developmentBridgeRequestLedgerTable))).toEqual([
      "requestFingerprintHash",
      "principalReferenceHash",
      "tokenIdHash",
      "nonceHash",
      "idempotencyKeyHash",
      "correlationReference",
      "operation",
      "outcome",
      "createdAt",
      "expiresAt",
    ]);
    expect(JSON.stringify(Object.keys(getTableColumns(developmentBridgeRequestLedgerTable)))).not.toMatch(
      /token$|nonce$|credential|payload|result|metadata|client|tenant|customer/i,
    );
  });

  it("keeps the DAB-3C rate-limit migration and schema additive", () => {
    expect(getTableName(developmentBridgeRateLimitsTable)).toBe(
      "development_bridge_rate_limits",
    );
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "lib/development-control-store/migrations/0004_dab3c_bridge_rate_limits.sql",
      ),
      "utf8",
    );
    for (const column of Object.values(
      getTableColumns(developmentBridgeRateLimitsTable),
    )) {
      expect(sql).toMatch(new RegExp(`(?:^|\\n)\\s*${column.name}\\s`, "m"));
    }
    expect(sql).not.toMatch(
      /\b(?:DROP|TRUNCATE|ALTER TABLE|CREATE TRIGGER|client_id|tenant_id|customer_id|database_url|token|credential|payload|result|metadata)\b/i,
    );
  });

  it("enforces deterministic cross-instance rate-limit semantics", async () => {
    const repository = new InMemoryBridgeRateLimitRepository();
    const input = {
      principalReferenceHash: `bridge_principal_hash_${"9".repeat(64)}`,
      now: "2026-07-14T05:00:10.000Z",
      windowSeconds: 60,
      limit: 2,
    };
    await expect(repository.consume(input)).resolves.toBe(true);
    await expect(repository.consume(input)).resolves.toBe(true);
    await expect(repository.consume(input)).resolves.toBe(false);
    expect(repository.listRecords()).toEqual([
      {
        principalReferenceHash: input.principalReferenceHash,
        windowStartedAt: "2026-07-14T05:00:00.000Z",
        requestCount: 2,
        expiresAt: "2026-07-14T05:02:00.000Z",
      },
    ]);
    await expect(
      repository.cleanupExpired("2026-07-14T05:02:01.000Z", 10),
    ).resolves.toBe(1);
  });

  it("atomically claims first use and converges matching retries", async () => {
    const repository = new InMemoryBridgeRuntimeRepository();
    const results = await Promise.all([
      repository.claim(baseClaim),
      repository.claim(baseClaim),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "claimed",
      "matching",
    ]);
    await repository.finalize(baseClaim.requestFingerprintHash, "allowed");
    expect((await repository.claim(baseClaim)).outcome).toBe("allowed");
    expect(repository.listLedger()).toHaveLength(1);
  });

  it("fails closed on idempotency conflicts and nonce replay", async () => {
    const repository = new InMemoryBridgeRuntimeRepository();
    await repository.claim(baseClaim);
    expect(
      (
        await repository.claim({
          ...baseClaim,
          requestFingerprintHash: `bridge_request_hash_${"6".repeat(64)}`,
        })
      ).status,
    ).toBe("conflicting");
    expect(
      (
        await repository.claim({
          ...baseClaim,
          requestFingerprintHash: `bridge_request_hash_${"7".repeat(64)}`,
          idempotencyKeyHash: `bridge_idempotency_hash_${"8".repeat(64)}`,
        })
      ).status,
    ).toBe("nonce_replayed");
  });

  it("cleans expired records with a bounded limit", async () => {
    const repository = new InMemoryBridgeRuntimeRepository();
    await repository.claim(baseClaim);
    expect(
      await repository.cleanupExpired("2026-07-14T02:16:00.000Z", 10),
    ).toBe(1);
    expect(repository.listLedger()).toHaveLength(0);
  });

  it("reads only bounded Git evidence matching the exact task binding", async () => {
    const evidence = normalizeGitHubObservation(approvalFixture());
    const binding = evidence.approvalBinding;
    expect(binding).not.toBeNull();
    const repository = new InMemoryBridgeRuntimeRepository([
      Object.freeze({
        ...evidence,
        headSha: binding!.expectedOriginMainSha,
      }),
    ]);
    const result = await repository.readBoundEvidence({
      repositoryId: evidence.repositoryId,
      taskId: binding!.taskId,
      specificationRevision: binding!.specificationRevision,
      specificationHash: binding!.specificationHash,
      expectedOriginMainSha: binding!.expectedOriginMainSha,
    });
    expect(result.status).toBe("verified");
    expect(result.observedGitSha).toBe(binding!.expectedOriginMainSha);
    expect(result.evidence).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/raw|payload|token|credential/i);
  });
});
