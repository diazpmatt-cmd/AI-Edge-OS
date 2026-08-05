import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

describe("approval-safe autonomous media foundation", () => {
  const route = source("src/routes/auto-content.ts");
  const scheduler = source("src/lib/scheduler.ts");
  const migration = source("src/lib/schema-migrate.ts");

  it("persists explicit opt-in controls with safe defaults", () => {
    expect(migration).toContain("auto_media_enabled TEXT DEFAULT 'false'");
    expect(route).toContain("autopilotEnabled:    row.autopilotEnabled === \"true\"");
    expect(route).toContain("autoMediaEnabled:    row.autoMediaEnabled === \"true\"");
  });

  it("requires scheduler trust and tenant media opt-in", () => {
    expect(route).toContain("isValidSchedulerSecret(req.headers[\"x-scheduler-secret\"])");
    expect(route).toContain("settingsRow.autopilotEnabled !== \"true\"");
    expect(route).toContain("settingsRow.autoMediaEnabled !== \"true\"");
    expect(route).toContain("Forbidden: autonomous media is not enabled");
  });

  it("uses one reusable square asset per draft with deterministic idempotency", () => {
    expect(scheduler).toContain('size: "1024x1024"');
    expect(scheduler).toContain('idempotencyKey: `${weeklyPlanId}-${postId}-square`');
    expect(route).toContain("SET image_data = $1");
    expect(route).toContain("matched_image_score = '100'");
  });

  it("isolates media failures without discarding generated text drafts", () => {
    expect(scheduler).toContain("media generation failed");
    expect(scheduler).toContain("media request error");
    expect(scheduler.indexOf("media generation failed")).toBeLessThan(scheduler.indexOf("summary.clientsSucceeded++"));
  });
});
