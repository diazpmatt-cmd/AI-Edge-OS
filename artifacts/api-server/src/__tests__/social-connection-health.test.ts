import { describe, expect, it } from "vitest";
import { deriveSocialConnectionHealth } from "../lib/social-connection-health";

describe("social connection health", () => {
  it("does not describe a revoked YouTube authorization as connected", () => {
    expect(deriveSocialConnectionHealth(JSON.stringify({ needsReauthorization: true }))).toEqual({
      statusLabel: "needs_reauthorization",
      needsReauthorization: true,
    });
  });

  it("keeps a healthy connection connected", () => {
    expect(deriveSocialConnectionHealth(JSON.stringify({ needsReauthorization: false }))).toEqual({
      statusLabel: "connected",
      needsReauthorization: false,
    });
  });

  it("fails safely on malformed legacy metadata", () => {
    expect(deriveSocialConnectionHealth("not-json")).toEqual({
      statusLabel: "connected",
      needsReauthorization: false,
    });
  });
});
