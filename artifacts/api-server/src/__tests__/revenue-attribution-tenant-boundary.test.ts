import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = resolve(process.cwd(), "src");
const repoRoot = resolve(process.cwd(), "../..");

const routeSource = readFileSync(
  resolve(apiRoot, "routes/revenue-attribution.ts"),
  "utf8",
);
const pageSource = readFileSync(
  resolve(repoRoot, "artifacts/ai-edge-solutions/src/pages/RevenueAttributionPage.tsx"),
  "utf8",
);
const gorilladeskImportSource = readFileSync(
  resolve(apiRoot, "lib/gorilladesk-csv-import.ts"),
  "utf8",
);

describe("revenue attribution tenant and truth boundary", () => {
  it("resolves the authenticated client instead of trusting default/demo client identifiers", () => {
    expect(routeSource).toContain("resolveClientActiveCheck");
    expect(routeSource).not.toContain('?? "default"');
    expect(pageSource).not.toContain("clientId=default");
    expect(pageSource).not.toContain('clientId: "demo"');
  });

  it("scopes revenue writes and GorillaDesk reads to canonical tenant identity", () => {
    expect(routeSource).toContain("revenueAttributionTable.clientId, tenant.clientId");
    expect(routeSource).toContain("gorilladeskCustomersTable.projectId, tenant.slug");
    expect(routeSource).toContain("gorilladeskJobsTable.projectId, tenant.slug");
  });

  it("does not present hard-coded calls or a fabricated fixed-cost ROI", () => {
    expect(pageSource).not.toContain("value: 73");
    expect(pageSource).not.toContain("2997");
    expect(pageSource).toContain("ROI is intentionally not calculated");
  });

  it("keeps direct provider job sync disabled until credentials are tenant-bound", () => {
    expect(routeSource).toContain("not_configured_per_tenant");
    expect(routeSource).toContain("Direct GorillaDesk job-provider sync is disabled");
    expect(routeSource).not.toContain("https://api.gorilladesk.com/api/v1/jobs");
  });

  it("requires tenant-scoped completed-job and collected-payment evidence before won revenue", () => {
    expect(routeSource).toContain('/revenue-attribution/:id/verify');
    expect(routeSource).toContain("verifiedByUserId: userId");
    expect(routeSource).toContain("revenueAttributionTable.gorilladeskJobId");
    expect(routeSource).toContain("gorilladeskPaymentsTable.projectId, tenant.slug");
    expect(routeSource).toContain("gorilladeskPaymentsTable.jobId, candidate.gorilladeskJobId");
    expect(routeSource).toContain('gorilladeskPaymentsTable.status, "collected"');
    expect(routeSource).toContain('gorilladeskJobsTable.status, "completed"');
    expect(routeSource).toContain("Completed job and collected payment evidence are required");
    expect(routeSource).toContain("Human verification is required before attribution can be marked won");
    expect(routeSource).toContain("GorillaDesk job evidence can only be set by tenant-scoped snapshot matching");
    expect(routeSource).toContain("revenueAttributionTable.clientId, tenant.clientId");
  });

  it("does not promote first-name-only candidates to matched revenue", () => {
    expect(routeSource).toContain('found.candidate.method === "normalized_phone"');
    expect(routeSource).toContain('status: isObservedMatch ? "matched" : "unmatched"');
  });

  it("does not fabricate collected status when a payment import omits status", () => {
    expect(gorilladeskImportSource).toContain(': "unknown"');
    expect(gorilladeskImportSource).not.toContain(': "collected",\n    paidAt:');
  });
});
