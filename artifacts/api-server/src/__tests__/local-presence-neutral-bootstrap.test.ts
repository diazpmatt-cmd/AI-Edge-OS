import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routeSource = readFileSync("src/routes/local-presence.ts", "utf8");
const defaults = routeSource.match(/const DEFAULT_CHANNELS = \[([\s\S]*?)\n\];/)?.[1] ?? "";

function count(fragment: string): number {
  return defaults.split(fragment).length - 1;
}

describe("Local Presence generic tenant bootstrap", () => {
  it("starts every seeded provider in an evidence-neutral state", () => {
    expect(defaults).not.toBe("");
    expect(count('status: "not_started"')).toBe(9);
    expect(count("score: 0")).toBe(9);
    expect(count('verificationStatus: "not_started"')).toBe(9);

    expect(defaults).not.toContain('status: "setup_in_progress"');
    expect(defaults).not.toContain('status: "verified_publishing"');
    expect(defaults).not.toContain('verificationStatus: "pending"');
    expect(defaults).not.toContain('verificationStatus: "verified"');
  });

  it("does not seed BB&B-specific listing progress into reusable defaults", () => {
    expect(defaults).not.toContain("Awaiting Apple verification");
    expect(defaults).not.toContain("7–12 days");
    expect(defaults).not.toContain("Complete Angi Pro profile");
    expect(defaults).not.toContain("Complete profile approval at thumbtack.com/pro");
  });

  it("preserves existing tenant-owned channel rows instead of overwriting them", () => {
    expect(routeSource).toContain("if (!existingNames.has(ch.channelName))");
    expect(routeSource).toContain("await db.insert(localPresenceChannelsTable).values");
  });
});
