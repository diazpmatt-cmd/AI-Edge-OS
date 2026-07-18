/**
 * GBP Schema Drift — static guard
 *
 * Compares the column sets declared in the Drizzle ORM schema
 * (lib/db/src/schema/gbp-audit.ts) against the hand-written DDL in
 * schema-migrate.ts. A developer who adds a column to one file and forgets
 * the other will see a clear failure message here before the code ships.
 *
 * No live database required — the check is purely static:
 *  - Drizzle columns are read via drizzle-orm's getTableColumns() utility.
 *  - DDL columns are parsed from the schema-migrate.ts source text with a
 *    depth-counted parenthesis walk (handles nested DEFAULT expressions).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getTableColumns } from "drizzle-orm";
import { gbpAuditSnapshotsTable, gbpAuditChecksTable } from "@workspace/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Source text ───────────────────────────────────────────────────────────────

const MIGRATION_SRC = readFileSync(
  resolve(__dirname, "../lib/schema-migrate.ts"),
  "utf-8"
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Walk the CREATE TABLE block for `tableName` inside the raw TypeScript/SQL
 * source and return the set of SQL column names it declares.
 *
 * Parsing strategy:
 *  1. Locate the CREATE TABLE IF NOT EXISTS marker.
 *  2. Find the opening parenthesis that follows it.
 *  3. Walk forward, counting open/close parens to handle nested expressions
 *     like `DEFAULT gen_random_uuid()` or `CHECK (x IN ('a','b'))`.
 *  4. Split the extracted body into lines; for each line that does NOT start
 *     with a table-level constraint keyword, treat the first identifier as the
 *     column name.
 */
function extractDdlColumns(source: string, tableName: string): Set<string> {
  const marker = `CREATE TABLE IF NOT EXISTS ${tableName}`;
  const markerIdx = source.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error(
      `Table "${tableName}" CREATE TABLE block not found in schema-migrate.ts. ` +
      `Add it, or update this test if the table was intentionally removed.`
    );
  }

  const openParen = source.indexOf("(", markerIdx);
  if (openParen === -1) {
    throw new Error(`No opening parenthesis found after "${marker}"`);
  }

  // Depth-counted walk to find the matching close paren
  let depth = 0;
  let i = openParen;
  while (i < source.length) {
    if      (source[i] === "(") depth++;
    else if (source[i] === ")") { depth--; if (depth === 0) break; }
    i++;
  }

  const body = source.slice(openParen + 1, i);
  const columns = new Set<string>();

  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;

    // Skip table-level constraint declarations
    if (/^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b/i.test(line)) continue;

    // First bare identifier on the line is the column name
    const match = line.match(/^([a-z_][a-z0-9_]*)\b/i);
    if (match) {
      columns.add(match[1].toLowerCase());
    }
  }

  return columns;
}

/** Return the SQL column names declared in a Drizzle table definition. */
function getDrizzleColumns(table: Parameters<typeof getTableColumns>[0]): Set<string> {
  const cols = getTableColumns(table);
  return new Set(
    (Object.values(cols) as Array<{ name: string }>).map(c => c.name.toLowerCase())
  );
}

/**
 * Produce a human-readable diff summary.
 * Returns undefined when there is no drift.
 */
function diffMessage(
  tableName: string,
  drizzle: Set<string>,
  ddl: Set<string>
): string | undefined {
  const onlyInDrizzle = [...drizzle].filter(c => !ddl.has(c));
  const onlyInDdl     = [...ddl].filter(c => !drizzle.has(c));

  if (onlyInDrizzle.length === 0 && onlyInDdl.length === 0) return undefined;

  const lines: string[] = [`Column drift detected in ${tableName}:`];
  if (onlyInDrizzle.length) {
    lines.push(
      `  In Drizzle schema but MISSING from schema-migrate.ts DDL: ${onlyInDrizzle.join(", ")}`
    );
    lines.push(`  → Add these columns to the CREATE TABLE block in schema-migrate.ts`);
    lines.push(`    (and an ALTER TABLE … ADD COLUMN IF NOT EXISTS guard for live deployments)`);
  }
  if (onlyInDdl.length) {
    lines.push(
      `  In schema-migrate.ts DDL but MISSING from Drizzle schema: ${onlyInDdl.join(", ")}`
    );
    lines.push(`  → Add these columns to lib/db/src/schema/gbp-audit.ts`);
  }
  return lines.join("\n");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GBP schema drift guard — Drizzle schema vs schema-migrate.ts DDL", () => {
  it("gbp_audit_snapshots: every Drizzle column exists in the DDL and vice-versa", () => {
    const drizzle = getDrizzleColumns(gbpAuditSnapshotsTable);
    const ddl     = extractDdlColumns(MIGRATION_SRC, "gbp_audit_snapshots");
    const msg     = diffMessage("gbp_audit_snapshots", drizzle, ddl);
    expect(msg, msg).toBeUndefined();
  });

  it("gbp_audit_checks: every Drizzle column exists in the DDL and vice-versa", () => {
    const drizzle = getDrizzleColumns(gbpAuditChecksTable);
    const ddl     = extractDdlColumns(MIGRATION_SRC, "gbp_audit_checks");
    const msg     = diffMessage("gbp_audit_checks", drizzle, ddl);
    expect(msg, msg).toBeUndefined();
  });
});
