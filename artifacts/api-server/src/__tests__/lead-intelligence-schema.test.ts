import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getTableColumns } from "drizzle-orm";
import { insertLeadSchema, leadsTable } from "@workspace/db/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationSource = readFileSync(resolve(__dirname, "../lib/schema-migrate.ts"), "utf8");
const leadsSection = migrationSource.slice(
  migrationSource.indexOf("// ── Leads"),
  migrationSource.indexOf("// ── Social Posts"),
);
const normalizedLeadsSection = leadsSection.replace(/\s+/g, " ");

const expectedColumns = {
  service: "service",
  location: "location",
  urgency: "urgency",
  sourceMessageId: "source_message_id",
  draftResponse: "draft_response",
  responseStatus: "response_status",
  receivedAt: "received_at",
  lastFollowUpAt: "last_follow_up_at",
  outcome: "outcome",
} as const;

describe("Lead Intelligence V1 schema foundation", () => {
  it("extends the canonical leads table with the expected columns", () => {
    const columns = getTableColumns(leadsTable) as Record<string, { name: string }>;

    for (const [property, sqlName] of Object.entries(expectedColumns)) {
      expect(columns[property]?.name).toBe(sqlName);
    }
  });

  it("keeps legacy partial lead inserts backward compatible", () => {
    expect(insertLeadSchema.safeParse({
      clientName: "Bed Bugs & Beyond",
      source: "telnyx_sms",
      phone: "+12513249090",
      message: "Existing lead payload",
      eventType: "sms",
      status: "new",
    }).success).toBe(true);
  });

  it.each([
    ["service", "TEXT"],
    ["location", "TEXT"],
    ["urgency", "TEXT NOT NULL DEFAULT 'normal'"],
    ["source_message_id", "TEXT"],
    ["draft_response", "TEXT"],
    ["response_status", "TEXT NOT NULL DEFAULT 'pending'"],
    ["received_at", "TIMESTAMPTZ NOT NULL DEFAULT NOW()"],
    ["last_follow_up_at", "TIMESTAMPTZ"],
    ["outcome", "TEXT"],
  ])("includes %s in the fresh-database CREATE TABLE definition", (column, definition) => {
    expect(normalizedLeadsSection).toContain(`${column} ${definition}`);
  });

  it.each([
    ["service", "TEXT"],
    ["location", "TEXT"],
    ["urgency", "TEXT NOT NULL DEFAULT 'normal'"],
    ["source_message_id", "TEXT"],
    ["draft_response", "TEXT"],
    ["response_status", "TEXT NOT NULL DEFAULT 'pending'"],
    ["received_at", "TIMESTAMPTZ NOT NULL DEFAULT NOW()"],
    ["last_follow_up_at", "TIMESTAMPTZ"],
    ["outcome", "TEXT"],
  ])("adds %s to existing databases idempotently", (column, definition) => {
    expect(migrationSource).toContain(
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS ${column} ${definition}`,
    );
  });

  it("uses no destructive leads migration operations", () => {
    expect(leadsSection).not.toMatch(/\b(DROP|RENAME|TRUNCATE|DELETE)\b/i);
  });
});
