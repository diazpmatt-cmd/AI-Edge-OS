import { describe, expect, it } from "vitest";
import { resolveActionReadiness } from "../platform-readiness";
import { getPlatformMediaSpec, validateGeneratedMedia } from "../platform-media-specs";
import { canTransitionAssistedWorkflow, requiresManualPosting } from "../assisted-channel-workflows";
import { deriveProvisioningState } from "../onboarding-provisioning";

describe("roadmap foundations", () => {
  it("keeps approval separate from connection readiness", () => {
    expect(resolveActionReadiness({ platform: "facebook", action: "publish", connected: true, configured: true, mediaReady: true, approved: false, observedAt: new Date().toISOString() })).toMatchObject({ state: "attention", allowed: false });
  });
  it("defines platform-specific media", () => {
    expect(getPlatformMediaSpec("facebook", "image")).toMatchObject({ width: 1200, height: 630 });
    expect(getPlatformMediaSpec("instagram", "image")).toMatchObject({ width: 1080, height: 1080 });
    expect(validateGeneratedMedia({ platform: "instagram", kind: "image", width: 1200, height: 630, mimeType: "image/png", storageKey: "x", humanReviewed: false })).toHaveLength(2);
  });
  it("keeps assisted channels manual", () => {
    expect(requiresManualPosting("nextdoor")).toBe(true);
    expect(canTransitionAssistedWorkflow("approved", "posted_manually")).toBe(true);
  });
  it("requires provisioning evidence", () => {
    expect(deriveProvisioningState([], ["tenant", "phone"])).toBe("ready_for_provisioning");
  });
});
