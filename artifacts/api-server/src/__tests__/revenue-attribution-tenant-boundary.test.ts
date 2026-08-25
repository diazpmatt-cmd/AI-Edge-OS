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
const migrationSource = readFileSync(resolve(apiRoot, "lib/schema-migrate.ts"), "utf8");
const proofPackSource = readFileSync(resolve(apiRoot, "lib/proof-pack-read-model.ts"), "utf8");
const verificationSource = readFileSync(resolve(apiRoot, "lib/revenue-attribution-verification.ts"), "utf8");

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

  it("requires a tenant-scoped completed job and authenticated human transition for verified revenue", () => {
    expect(routeSource).toContain('/revenue-attribution/:id/verify');
    expect(routeSource).toContain("tenant_scoped_job_evidence_not_found");
    expect(routeSource).toContain("completed_job_evidence_required");
    expect(routeSource).toContain("actorUserId: tenant.actorUserId");
    expect(verificationSource).toContain('matchMethod: "human_verified"');
    expect(verificationSource).toContain("verifiedByUserId: actorUserId");
    expect(routeSource).toContain("gorilladeskJobsTable.projectId, tenant.slug");
  });

  it("does not let generic writes or first-name candidates create verified wins", () => {
    expect(routeSource).toContain("verified_revenue_transition_required");
    expect(routeSource).toContain("decision.automaticMatchAllowed");
    expect(routeSource).toContain('status: "matched"');
    expect(routeSource).not.toContain('matchedJob?.status === "completed"\n            ? "won"');
  });

  it("backfills legacy matches without inventing provenance", () => {
    expect(migrationSource).toContain("SET match_method = 'legacy_unknown'");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ");
    expect(migrationSource).not.toContain("SET verified_at =");
  });

  it("keeps legacy won amounts out of verified Proof Pack attribution", () => {
    expect(proofPackSource).toContain("row.verifiedAt != null");
    expect(proofPackSource).toContain("observedAttributableRevenue");
    expect(proofPackSource).toContain("unverified won records are excluded");
  });
});
