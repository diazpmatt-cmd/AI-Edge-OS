import { readFileSync } from "node:fs";
import path from "node:path";
import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createDevelopmentControlDatabaseConfig,
  PostgresDevelopmentCoordinationStore,
} from "..";
import * as schema from "../schema";

const TABLES = [
  schema.developmentTasksTable,
  schema.developmentTaskSpecificationsTable,
  schema.developmentActorIdentitiesTable,
  schema.developmentAuthorizationDecisionsTable,
  schema.developmentTaskClaimsTable,
  schema.developmentAuditEventsTable,
  schema.developmentMilestonesTable,
  schema.developmentCompletionReportsTable,
  schema.developmentIdempotencyRecordsTable,
] as const;

describe("DAB-2B1 PostgreSQL storage boundary", () => {
  it("declares exactly the nine tenant-independent ledger tables", () => {
    expect(TABLES.map(getTableName)).toEqual([
      "development_tasks",
      "development_task_specifications",
      "development_actor_identities",
      "development_authorization_decisions",
      "development_task_claims",
      "development_audit_events",
      "development_milestones",
      "development_completion_reports",
      "development_idempotency_records",
    ]);
    for (const table of TABLES) {
      const columns = Object.keys(getTableColumns(table));
      expect(columns).not.toContain("clientId");
      expect(columns).not.toContain("tenantId");
      expect(columns).not.toContain("customerId");
    }
  });

  it("accepts configuration only from an explicit caller", () => {
    const config = createDevelopmentControlDatabaseConfig({
      connectionString: "postgresql://example.invalid/development_control",
      maxConnections: 3,
    });
    expect(config.applicationName).toBe("ai-edge-development-control");
    expect(config.maxConnections).toBe(3);
    expect(() =>
      createDevelopmentControlDatabaseConfig({ connectionString: undefined }),
    ).toThrowError(
      expect.objectContaining({
        code: "DEVELOPMENT_CONTROL_DATABASE_CONFIG_REQUIRED",
      }),
    );
  });

  it("never places a supplied sensitive value in configuration errors", () => {
    const sensitive = "not-a-postgresql-connection-with-sensitive-material";
    try {
      createDevelopmentControlDatabaseConfig({ connectionString: sensitive });
      throw new Error("expected configuration rejection");
    } catch (error) {
      expect(String(error)).not.toContain(sensitive);
    }
  });

  it("exposes the complete durable store operation and read surface", () => {
    for (const method of [
      "registerTask",
      "reviseTask",
      "decideApproval",
      "transitionTask",
      "claimTask",
      "renewClaim",
      "recoverExpiredClaim",
      "releaseClaim",
      "recordMilestone",
      "submitCompletionReport",
      "getTask",
      "getApprovals",
      "getEvents",
      "getCompletionReport",
      "getSpecificationRevisions",
      "getCompletionReports",
    ]) {
      expect(
        typeof PostgresDevelopmentCoordinationStore.prototype[
          method as keyof PostgresDevelopmentCoordinationStore
        ],
      ).toBe("function");
    }
  });

  it("keeps the migration additive and aligned to the bounded table set", () => {
    const migration = readFileSync(
      path.join(
        process.cwd(),
        "lib/development-control-store/migrations/0001_dab2b1_coordination_ledger.sql",
      ),
      "utf8",
    );
    const creates = [...migration.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(
      (match) => match[1],
    );
    expect(creates).toEqual(TABLES.map(getTableName));
    expect(migration).not.toMatch(/\b(?:DROP|TRUNCATE|ALTER TABLE)\b/i);
    expect(migration).not.toMatch(/\b(?:client_id|tenant_id|customer_id)\b/i);
    expect(migration).not.toMatch(/github_inbox|webhook|outbox|reconciliation/i);
    expect(migration).not.toMatch(/CREATE TRIGGER/i);
  });

  it("requires no environment or live database access for bounded verification", () => {
    const configSource = readFileSync(
      path.join(
        process.cwd(),
        "lib/development-control-store/src/config.ts",
      ),
      "utf8",
    );
    const drizzleSource = readFileSync(
      path.join(
        process.cwd(),
        "lib/development-control-store/drizzle.config.ts",
      ),
      "utf8",
    );
    expect(configSource).not.toContain("process.env");
    expect(drizzleSource).not.toContain("process.env");
    expect(drizzleSource).not.toContain("dbCredentials");
  });
});
