import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = resolve(process.cwd(), "src");
const repoRoot = resolve(process.cwd(), "../..");

const safeRouteSource = readFileSync(
  resolve(apiRoot, "routes/reviews-safe.ts"),
  "utf8",
);
const routeIndexSource = readFileSync(
  resolve(apiRoot, "routes/index.ts"),
  "utf8",
);
const pageSource = readFileSync(
  resolve(repoRoot, "ai-edge-solutions/src/pages/ReviewsEnginePage.tsx"),
  "utf8",
);

describe("Reviews Stage 1 safety boundary", () => {
  it("uses authenticated tenant identity and the canonical tenant-safe review repository", () => {
    expect(safeRouteSource).toContain("resolveClientActiveCheck");
    expect(safeRouteSource).toContain("DrizzleTenantSafeReviewRepository");
    expect(safeRouteSource).toContain("findByClientId(tenant.clientId)");
    expect(safeRouteSource).toContain('source: "tenant_safe_review_summaries"');
  });

  it("mounts the safety router before the legacy Reviews router", () => {
    const safeIndex = routeIndexSource.indexOf("router.use(reviewsSafeRouter)");
    const legacyIndex = routeIndexSource.indexOf("router.use(reviewsRouter)");
    expect(safeIndex).toBeGreaterThan(-1);
    expect(legacyIndex).toBeGreaterThan(-1);
    expect(safeIndex).toBeLessThan(legacyIndex);
  });

  it("retires every legacy manual/request mutation path before it can send", () => {
    expect(safeRouteSource).toContain('router.get("/reviews/stats", retired)');
    expect(safeRouteSource).toContain('router.put("/reviews/stats/:platform", retired)');
    expect(safeRouteSource).toContain('router.get("/reviews/requests", retired)');
    expect(safeRouteSource).toContain('router.post("/reviews/requests", retired)');
    expect(safeRouteSource).toContain('router.patch("/reviews/requests/:id", retired)');
    expect(safeRouteSource).toContain('router.delete("/reviews/requests/:id", retired)');
    expect(safeRouteSource).toContain("No customer message was sent");
  });

  it("removes legacy send/edit/request controls from the production page", () => {
    expect(pageSource).toContain('apiFetch<ReviewOverview>("/reviews/overview")');
    expect(pageSource).not.toContain('apiFetch("/reviews/requests"');
    expect(pageSource).not.toContain('apiFetch<{ requests: ReviewRequest[] }>("/reviews/requests")');
    expect(pageSource).not.toContain('apiFetch<{ stats: PlatformStat[] }>("/reviews/stats")');
    expect(pageSource).not.toContain("Request Center");
    expect(pageSource).not.toContain("handleLogRequest");
    expect(pageSource).not.toContain("handleSaveStat");
  });

  it("does not hard-code BB&B outreach or a generic Google review URL", () => {
    expect(pageSource).not.toContain("Bed Bugs & Beyond");
    expect(pageSource).not.toContain("251) 324-9090");
    expect(pageSource).not.toContain("g.page/r/review");
    expect(safeRouteSource).not.toContain("sendSMS");
    expect(safeRouteSource).not.toContain("g.page/r/review");
  });

  it("states the automation boundary explicitly", () => {
    expect(pageSource).toContain("Automated review requests are not activated yet");
    expect(pageSource).toContain("verified completed job");
    expect(pageSource).toContain("tenant-specific review link");
  });
});
