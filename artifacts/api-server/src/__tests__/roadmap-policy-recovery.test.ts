import { describe, expect, it } from "vitest";
import { evaluateBusinessAction } from "../../../../lib/db/src/business-action-gateway";
import { evaluateContentClaims } from "../../../../lib/db/src/content-claims-policy";
import fs from "node:fs";

describe("roadmap safety policies", () => {
  it("blocks unsupported claims", () => expect(evaluateContentClaims("Guaranteed results with whole-home heat treatment")).toMatchObject({ allowed: false }));
  it("requires matching human approval", () => {
    const preview = { actionId: "a", clientId: "c", category: "publish_content" as const, summary: "Publish", destination: "facebook", payloadHash: "hash", idempotencyKey: "key", createdAt: "2026-08-05T00:00:00Z", expiresAt: "2026-08-06T00:00:00Z" };
    expect(evaluateBusinessAction(preview, null, new Date("2026-08-05T01:00:00Z"))).toMatchObject({ allowed: false });
    expect(evaluateBusinessAction(preview, { actionId: "a", clientId: "c", payloadHash: "hash", approvedBy: "owner", approvedAt: "2026-08-05T00:10:00Z", expiresAt: "2026-08-06T00:00:00Z" }, new Date("2026-08-05T01:00:00Z"))).toMatchObject({ allowed: true });
  });
  it("enforces claims at the final publishing boundary", () => {
    const source = fs.readFileSync(new URL("../lib/publishing-service.ts", import.meta.url), "utf8");
    expect(source).toContain("evaluateContentClaims");
    expect(source).toContain("Content blocked by claims policy");
  });
});
