import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const bootstrap = readFileSync(resolve(here, "../lib/observed-backlink-migrate.ts"), "utf8");
const startup = readFileSync(resolve(here, "../index.ts"), "utf8");
const migration = readFileSync(resolve(here, "../../../../lib/db/migrations/0012_observed_backlink_lifecycle.sql"), "utf8");
const schema = readFileSync(resolve(here, "../../../../lib/db/src/schema/observed-backlinks.ts"), "utf8");

const tables = [
  "backlink_inventory_runs",
  "observed_backlinks",
  "observed_backlink_transitions",
] as const;

describe("observed backlink startup bootstrap", () => {
  it("keeps migration, Drizzle schema, and production bootstrap aligned", () => {
    for (const table of tables) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(bootstrap).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(schema).toContain(`pgTable(\"${table}\"`);
    }
  });

  it("runs the dedicated bootstrap before the application is imported", () => {
    const migrationCall = startup.indexOf(".then(() => migrateObservedBacklinks())");
    const appImport = startup.indexOf('.then(() => import("./app.js"))');

    expect(startup).toContain('import { migrateObservedBacklinks } from "./lib/observed-backlink-migrate.js"');
    expect(migrationCall).toBeGreaterThan(-1);
    expect(appImport).toBeGreaterThan(-1);
    expect(migrationCall).toBeLessThan(appImport);
  });

  it("remains additive and does not alter Authority opportunity tables", () => {
    expect(bootstrap).not.toMatch(/\b(DROP|TRUNCATE|RENAME)\b/i);
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|RENAME)\b/i);
    expect(bootstrap).not.toMatch(/ALTER\s+TABLE\s+(backlink_evidence|backlink_opportunities|backlink_ingestion_runs)/i);
    expect(migration).not.toMatch(/ALTER\s+TABLE\s+(backlink_evidence|backlink_opportunities|backlink_ingestion_runs)/i);
  });

  it("preserves fail-closed absence semantics in both SQL surfaces", () => {
    for (const source of [migration, bootstrap]) {
      expect(source).toContain("status = 'failed' AND absence_evaluation_applied = FALSE");
      expect(source).toContain("status = 'succeeded' AND completeness = 'incomplete' AND absence_evaluation_applied = FALSE");
      expect(source).toContain("status = 'succeeded' AND completeness = 'complete' AND absence_evaluation_applied = TRUE");
    }
  });
});
