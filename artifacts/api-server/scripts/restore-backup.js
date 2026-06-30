#!/usr/bin/env node
/**
 * AI Edge Solutions — Database Restore Script
 *
 * Usage:
 *   node artifacts/api-server/scripts/restore-backup.js <path-to-backup.json>
 *
 * What it does:
 *   - Reads a backup JSON exported from the System Diagnostics UI
 *   - Inserts every row back into PostgreSQL using INSERT … ON CONFLICT DO NOTHING
 *   - Safe to run on a live database — existing rows are never overwritten
 *
 * Requirements:
 *   - DATABASE_URL environment variable must be set
 *   - Run from the workspace root or the artifacts/api-server directory
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node restore-backup.js <backup-file.json>");
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(absPath, "utf-8");
  const backup = JSON.parse(raw);

  console.log(`\n📦 Backup: ${path.basename(absPath)}`);
  console.log(`   Exported at : ${backup.exportedAt}`);
  console.log(`   Version     : ${backup.version}`);
  console.log(`   Tables      : ${Object.keys(backup.tables).join(", ")}\n`);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("✅ Connected to database\n");

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const [tableName, rows] of Object.entries(backup.tables)) {
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`   ⏭  ${tableName}: 0 rows — skipped`);
      continue;
    }

    const columns = Object.keys(rows[0]);
    const colList = columns.map((c) => `"${c}"`).join(", ");
    let inserted = 0;

    for (const row of rows) {
      const values = columns.map((c) => row[c]);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
      const query = `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      try {
        const result = await client.query(query, values);
        if (result.rowCount > 0) inserted++;
        else totalSkipped++;
      } catch (err) {
        console.warn(`   ⚠  ${tableName} row skipped (${err.message.split("\n")[0]})`);
        totalSkipped++;
      }
    }

    totalInserted += inserted;
    console.log(`   ✓  ${tableName}: ${inserted} inserted, ${rows.length - inserted} already existed`);
  }

  await client.end();

  console.log(`\n🎉 Restore complete`);
  console.log(`   Rows inserted : ${totalInserted}`);
  console.log(`   Rows skipped  : ${totalSkipped} (already existed or conflict)\n`);
  console.log("Next step: Open System Diagnostics and verify Section 1 platform health\nand Section 8 content performance counts.\n");
}

main().catch((err) => {
  console.error("Restore failed:", err.message);
  process.exit(1);
});
