import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const backlinksSource = readFileSync(resolve(here, "../routes/backlinks.ts"), "utf8");
const safetySource = readFileSync(resolve(here, "../routes/backlink-scheduled-safety.ts"), "utf8");
const appSource = readFileSync(resolve(here, "../app.ts"), "utf8");

const scheduledRoutePattern = /router\.post\(\s*["']\/api\/backlinks\/ingest\/scheduled["']/g;

function countScheduledRoutes(source: string): number {
  return [...source.matchAll(scheduledRoutePattern)].length;
}

describe("scheduled backlink route ownership", () => {
  it("has exactly one scheduled-ingest route and keeps it out of the legacy backlinks router", () => {
    expect(countScheduledRoutes(backlinksSource)).toBe(0);
    expect(countScheduledRoutes(safetySource)).toBe(1);
    expect(countScheduledRoutes(backlinksSource) + countScheduledRoutes(safetySource)).toBe(1);
  });

  it("mounts the fail-closed safety router before the general backlinks router", () => {
    const safetyMount = appSource.indexOf("app.use(backlinkScheduledSafetyRouter)");
    const backlinksMount = appSource.indexOf("app.use(backlinksRouter)");

    expect(safetyMount).toBeGreaterThan(-1);
    expect(backlinksMount).toBeGreaterThan(-1);
    expect(safetyMount).toBeLessThan(backlinksMount);
  });

  it("cannot execute backlink discovery or ingestion from the scheduled safety route", () => {
    expect(safetySource).not.toContain(".discover(");
    expect(safetySource).not.toContain("ingestBacklinks(");
    expect(safetySource).not.toContain("ingestFixtureBacklinks(");
    expect(safetySource).toContain("executionActivated: false");
    expect(safetySource).toContain("outcome: \"skipped\"");
  });
});
