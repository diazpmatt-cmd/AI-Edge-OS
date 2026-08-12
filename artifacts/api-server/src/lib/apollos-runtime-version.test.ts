import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getApollosRuntimeVersion } from "./apollos-runtime-version.js";

const originalEnv = { ...process.env };

describe("getApollosRuntimeVersion", () => {
  beforeEach(() => {
    process.env.APP_COMMIT_SHA = "a".repeat(40);
    process.env.COOLIFY_BRANCH = "main";
    process.env.COOLIFY_RESOURCE_UUID = "production-resource";
    process.env.APP_BUILD_TIME = "2026-08-12T02:00:00Z";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns only the secret-free runtime build identity", () => {
    process.env.CLERK_SECRET_KEY = "must-not-leak";
    process.env.DATABASE_URL = "postgresql://must-not-leak";

    const result = getApollosRuntimeVersion();

    expect(result).toEqual({
      commit: "a".repeat(40),
      branch: "main",
      resource: "production-resource",
      builtAt: "2026-08-12T02:00:00Z",
    });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("returns bounded unknown markers when version metadata is absent", () => {
    delete process.env.APP_COMMIT_SHA;
    delete process.env.COOLIFY_BRANCH;
    delete process.env.COOLIFY_RESOURCE_UUID;
    delete process.env.APP_BUILD_TIME;

    expect(getApollosRuntimeVersion()).toEqual({
      commit: "unknown",
      branch: "unknown",
      resource: "unknown",
      builtAt: "unknown",
    });
  });

  it("bounds unexpectedly large metadata", () => {
    process.env.APP_COMMIT_SHA = "a".repeat(500);
    process.env.COOLIFY_BRANCH = "b".repeat(500);
    process.env.COOLIFY_RESOURCE_UUID = "r".repeat(500);
    process.env.APP_BUILD_TIME = "t".repeat(500);

    const result = getApollosRuntimeVersion();
    expect(result.commit).toHaveLength(100);
    expect(result.branch).toHaveLength(200);
    expect(result.resource).toHaveLength(200);
    expect(result.builtAt).toHaveLength(100);
  });
});
