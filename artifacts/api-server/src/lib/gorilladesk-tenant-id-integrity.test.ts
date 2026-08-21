import { describe, expect, it } from "vitest";
import { classifyProviderIds } from "./gorilladesk-tenant-id-integrity.js";

describe("classifyProviderIds", () => {
  it("separates tenant-owned IDs from foreign collisions", () => {
    const result = classifyProviderIds(["job-1", "job-2", "job-3"], [
      { externalId: "job-1", projectId: "tenant-a" },
      { externalId: "job-2", projectId: "tenant-b" },
      { externalId: null, projectId: "tenant-a" },
    ], "tenant-a");
    expect([...result.owned]).toEqual(["job-1"]);
    expect([...result.foreign]).toEqual(["job-2"]);
  });

  it("leaves previously unseen IDs available for insert", () => {
    const result = classifyProviderIds(["new-id"], [], "tenant-a");
    expect(result.owned.size).toBe(0);
    expect(result.foreign.size).toBe(0);
  });
});
