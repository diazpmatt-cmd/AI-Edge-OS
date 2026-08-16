import { describe, expect, it } from "vitest";
import {
  buildTenantSafeVideoTitle,
  resolveNativeVideoTenantPolicy,
} from "../lib/video-generation-tenant-policy.js";

describe("native video tenant policy", () => {
  it("allows the existing bespoke renderer only for canonical BB&B", () => {
    expect(resolveNativeVideoTenantPolicy("bed-bugs-and-beyond")).toEqual({
      allowed: true,
      reason: null,
      brandProfile: "bed-bugs-and-beyond-v1",
      phoneNumber: "(251) 324-9090",
      allowPestStoryMode: true,
    });
  });

  it("fails closed for a fictional second client instead of leaking BB&B assets", () => {
    const policy = resolveNativeVideoTenantPolicy("lakeside-plumbing");
    expect(policy.allowed).toBe(false);
    expect(policy.reason).toBe("tenant_video_branding_not_configured");
    expect(policy.phoneNumber).toBeNull();
    expect(policy.brandProfile).toBeNull();
    expect(policy.allowPestStoryMode).toBe(false);
    expect(JSON.stringify(policy)).not.toMatch(/Bed Bugs|Baldwin|pest|251\) 324-9090/i);
  });

  it("builds generic tenant titles from canonical industry data", () => {
    expect(buildTenantSafeVideoTitle({
      explicitTitle: null,
      topic: null,
      industryLabel: "plumbing",
      clientName: "Lakeside Plumbing",
    })).toBe("plumbing | Lakeside Plumbing");
  });

  it("preserves explicit titles without adding tenant-specific defaults", () => {
    expect(buildTenantSafeVideoTitle({
      explicitTitle: "Emergency Pipe Repair",
      topic: "Drain Cleaning",
      industryLabel: "plumbing",
      clientName: "Lakeside Plumbing",
    })).toBe("Emergency Pipe Repair");
  });
});
