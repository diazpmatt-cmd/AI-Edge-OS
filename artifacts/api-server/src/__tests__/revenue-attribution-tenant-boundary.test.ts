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
});
