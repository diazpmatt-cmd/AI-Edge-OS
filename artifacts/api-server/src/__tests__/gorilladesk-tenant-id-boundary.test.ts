import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "src");
const csvImport = readFileSync(resolve(root, "lib/gorilladesk-csv-import.ts"), "utf8");
const sync = readFileSync(resolve(root, "lib/gorilladesk-sync.ts"), "utf8");

describe("GorillaDesk tenant provider-ID boundary", () => {
  it("refuses foreign job and payment collisions before global-key upserts", () => {
    expect(csvImport).toContain("classifyProviderIds");
    expect(csvImport).toContain("Provider job ID belongs to another tenant");
    expect(csvImport).toContain("Provider payment ID belongs to another tenant");
    expect(csvImport).toContain("setWhere: eq(gorilladeskJobsTable.projectId, projectId)");
    expect(csvImport).toContain("setWhere: eq(gorilladeskPaymentsTable.projectId, projectId)");
  });

  it("scopes live customer lookup and update by project", () => {
    expect(sync).toContain("gorilladeskCustomersTable.projectId, projectId");
    expect(sync).toContain("upserted += inserted.length");
  });

  it("does not leak a colliding provider identifier in import errors", () => {
    expect(csvImport).not.toContain("collision with another tenant: ${id}");
  });
});
