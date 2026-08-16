import { describe, expect, it } from "vitest";
import {
  buildTenantImagePrompt,
  resolveImageBrandPolicy,
} from "../lib/image-generation-brand-policy.js";

describe("tenant-safe image generation brand policy", () => {
  it("preserves the official BB&B palette and overlay requirement only for the canonical BB&B slug", () => {
    const policy = resolveImageBrandPolicy({
      clientSlug: "bed-bugs-and-beyond",
      clientName: "Bed Bugs & Beyond",
      effectivePrompt: "Professional pest control marketing image for Bed Bug Treatment",
    });

    expect(policy.mode).toBe("bbb_official");
    expect(policy.requiresOverlay).toBe(true);
    expect(policy.metadataBrand).toBe("bed-bugs-and-beyond-v1");
    expect(policy.providerPrompt).toContain("deep navy");
    expect(policy.providerPrompt).toContain("official logo overlay");
  });

  it("keeps a fictional plumbing tenant free of BB&B palette, logo, geography, and pest-control language", () => {
    const effectivePrompt = buildTenantImagePrompt({
      industryLabel: "plumbing",
      serviceDisplayName: "Pipe Repair",
      city: "Huntsville, AL",
      creativeBrief: "Clean residential service scene",
    });
    const policy = resolveImageBrandPolicy({
      clientSlug: "lakeside-plumbing",
      clientName: "Lakeside Plumbing",
      effectivePrompt,
    });
    const serialized = JSON.stringify(policy);

    expect(effectivePrompt).toContain("Professional plumbing marketing image for Pipe Repair");
    expect(effectivePrompt).toContain("Huntsville, AL");
    expect(policy.mode).toBe("tenant_unbranded");
    expect(policy.requiresOverlay).toBe(false);
    expect(policy.metadataBrand).toBe("tenant-unbranded-v1");
    expect(serialized).not.toContain("Bed Bugs & Beyond");
    expect(serialized).not.toContain("Baldwin County");
    expect(serialized).not.toContain("pest control");
    expect(serialized).not.toContain("official logo overlay");
    expect(serialized).not.toContain("coral orange");
  });

  it("uses a neutral local-service label rather than silently injecting pest control", () => {
    const prompt = buildTenantImagePrompt({
      industryLabel: "",
      serviceDisplayName: "Emergency Service",
    });
    expect(prompt).toBe("Professional local service marketing image for Emergency Service");
    expect(prompt).not.toContain("pest control");
  });
});
