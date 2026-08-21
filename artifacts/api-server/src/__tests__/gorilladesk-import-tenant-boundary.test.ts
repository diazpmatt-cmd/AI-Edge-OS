import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/routes/gorilladesk-import.ts"), "utf8");

describe("GorillaDesk import tenant boundary", () => {
  it("resolves active tenant identity instead of assigning BB&B to imports", () => {
    expect(source).toContain("resolveClientActiveCheck(userId)");
    expect(source).toContain("const projectId = tenant.slug");
    expect(source).toContain("res.locals.gorilladeskProjectId = tenant.slug");
    expect(source).not.toContain('const projectId = "bed-bugs-and-beyond"');
  });

  it("keeps global provider sync fail-closed for other tenants", () => {
    expect(source).toContain('tenant.slug !== "bed-bugs-and-beyond"');
    expect(source).toContain("provider credentials are tenant-bound");
  });

  it("retires destructive hard-coded seed writes", () => {
    expect(source).toContain('res.status(410)');
    expect(source).toContain("Legacy GorillaDesk seed writes are retired");
    expect(source).not.toContain("REAL_GORILLADESK_SNAPSHOT");
    expect(source).not.toContain("REAL_PAYMENT_ROWS");
    expect(source).not.toContain("db.delete(gorilladeskPaymentsTable)");
  });

  it("does not return raw exception details", () => {
    expect(source).not.toContain("detail: String(err)");
  });
});
