import { describe, expect, it } from "vitest";

import { extractPublishingMutationPostIds } from "./publishingMutationGuardMiddleware";

describe("extractPublishingMutationPostIds", () => {
  it("extracts a single post ID from a parameterized route", () => {
    expect(
      extractPublishingMutationPostIds({
        params: { id: "post-123" },
        body: {},
      } as never),
    ).toEqual(["post-123"]);
  });

  it("extracts and deduplicates bulk post IDs", () => {
    expect(
      extractPublishingMutationPostIds({
        params: { id: "bulk" },
        body: { postIds: ["post-1", "post-2", "post-1", 42, ""] },
      } as never),
    ).toEqual(["post-1", "post-2"]);
  });

  it("combines route and body IDs without duplicates", () => {
    expect(
      extractPublishingMutationPostIds({
        params: { id: "post-1" },
        body: { postIds: ["post-1", "post-2"] },
      } as never),
    ).toEqual(["post-1", "post-2"]);
  });

  it("returns an empty list for unrelated requests", () => {
    expect(
      extractPublishingMutationPostIds({ params: {}, body: {} } as never),
    ).toEqual([]);
  });
});
