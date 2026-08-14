import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(resolve(here, "../routes/backlink-measurement.ts"), "utf8");
const appSource = readFileSync(resolve(here, "../app.ts"), "utf8");

const TRUSTED_SOURCE = "observed_backlink_lifecycle_v1";

describe("trusted backlink measurement read surface", () => {
  it("is mounted behind Clerk and exposes only read operations", () => {
    const clerkMount = appSource.indexOf("clerkMiddleware(");
    const measurementMount = appSource.indexOf("app.use(backlinkMeasurementRouter)");

    expect(clerkMount).toBeGreaterThan(-1);
    expect(measurementMount).toBeGreaterThan(clerkMount);
    expect(routeSource).toContain('router.get("/api/backlinks/measurement/current"');
    expect(routeSource).toContain('router.get("/api/backlinks/measurement/history"');
    expect(routeSource).not.toMatch(/router\.(post|put|patch|delete)\(/);
  });

  it("filters every measurement read to the canonical lifecycle provenance", () => {
    expect(routeSource).toContain("measurement_source = $2");
    expect(routeSource).toContain("measurement_inventory_run_id IS NOT NULL");
    expect(routeSource).toContain("measurement_observed_at IS NOT NULL");
    expect(routeSource).toContain("OBSERVED_BACKLINK_MEASUREMENT_SOURCE");
    expect(readFileSync(resolve(here, "../lib/observed-backlink-measurement.ts"), "utf8")).toContain(TRUSTED_SOURCE);
  });

  it("reports unavailable rather than manufacturing a zero snapshot", () => {
    expect(routeSource).toContain('available: false');
    expect(routeSource).toContain('reason: "trusted_measurement_unavailable"');
    expect(routeSource).toContain("snapshot: null");
  });
});
