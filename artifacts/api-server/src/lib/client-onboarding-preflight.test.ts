import { describe, expect, it } from "vitest";
import { buildClientOnboardingPreflight } from "./client-onboarding-preflight.js";

describe("Client Onboarding preflight", () => {
  it("validates a fictional second client without BB&B leakage", () => {
    const report = buildClientOnboardingPreflight({
      businessName: "Lakeside Plumbing",
      industry: "Plumbing",
      website: "lakesideplumbing.example.com",
      mainPhone: "(303) 555-0100",
      forwardingPhone: "(303) 555-0199",
      email: "office@lakesideplumbing.example.com",
      city: "Fort Collins",
      state: "CO",
      zip: "80521",
      serviceRadius: "35",
      businessHours: "Mon-Fri 8am-5pm",
      services: ["Drain Cleaning", "Water Heater Repair", "Leak Repair"],
      modulesEnabled: ["workspace", "receptionist", "leads", "local", "reviews", "media"],
    });

    expect(report.valid).toBe(true);
    expect(report.normalized).toMatchObject({
      businessName: "Lakeside Plumbing",
      industry: "Plumbing",
      mainPhone: "+13035550100",
      forwardingPhone: "+13035550199",
      city: "Fort Collins",
      state: "CO",
      services: ["Drain Cleaning", "Water Heater Repair", "Leak Repair"],
    });

    const serialized = JSON.stringify(report).toLowerCase();
    expect(serialized).not.toContain("bed bugs & beyond");
    expect(serialized).not.toContain("bed bugs and beyond");
    expect(serialized).not.toContain("baldwin");
    expect(serialized).not.toContain("2512863200");
    expect(serialized).not.toContain("2513249090");
    expect(serialized).not.toContain("termite");
  });

  it("fails closed when local geography is missing", () => {
    const report = buildClientOnboardingPreflight({
      businessName: "Lakeside Plumbing",
      industry: "Plumbing",
      mainPhone: "+13035550100",
      services: "Drain Cleaning",
      modulesEnabled: ["workspace", "local"],
    });

    expect(report.valid).toBe(false);
    expect(report.errors).toContainEqual(expect.objectContaining({
      code: "local_geography_required",
    }));
    expect(report.modulePlan.find((item) => item.moduleId === "local")?.blockers)
      .toEqual(["city_required", "state_required"]);
  });

  it("requires an explicit receptionist transfer destination", () => {
    const report = buildClientOnboardingPreflight({
      businessName: "Lakeside Plumbing",
      industry: "Plumbing",
      mainPhone: "+13035550100",
      services: "Drain Cleaning",
      modulesEnabled: ["receptionist"],
    });

    expect(report.valid).toBe(false);
    expect(report.errors).toContainEqual(expect.objectContaining({
      code: "receptionist_transfer_required",
    }));
    expect(report.modulePlan[0]).toMatchObject({
      moduleId: "receptionist",
      canPrepareWithoutExternalSideEffects: false,
      blockers: ["human_transfer_destination_required"],
    });
  });

  it("warns when main and forwarding phones are the same instead of claiming routing is safe", () => {
    const report = buildClientOnboardingPreflight({
      businessName: "Lakeside Plumbing",
      industry: "Plumbing",
      mainPhone: "+13035550100",
      forwardingPhone: "+13035550100",
      services: "Drain Cleaning",
      modulesEnabled: ["receptionist"],
    });

    expect(report.warnings).toContainEqual(expect.objectContaining({
      code: "same_as_main_phone",
    }));
  });

  it("rejects unknown module identifiers instead of silently enabling them", () => {
    const report = buildClientOnboardingPreflight({
      businessName: "Lakeside Plumbing",
      industry: "Plumbing",
      mainPhone: "+13035550100",
      services: "Drain Cleaning",
      modulesEnabled: ["workspace", "mystery_module"],
    });

    expect(report.valid).toBe(false);
    expect(report.normalized.modulesEnabled).toEqual(["workspace"]);
    expect(report.errors).toContainEqual(expect.objectContaining({
      code: "unknown_module",
    }));
  });

  it("returns an explicit provider/readiness plan without performing side effects", () => {
    const report = buildClientOnboardingPreflight({
      businessName: "Lakeside Plumbing",
      industry: "Plumbing",
      mainPhone: "+13035550100",
      forwardingPhone: "+13035550199",
      city: "Fort Collins",
      state: "CO",
      services: "Drain Cleaning",
      modulesEnabled: ["workspace", "media", "reviews", "publishing"],
    });

    expect(report.modulePlan.find((item) => item.moduleId === "media")).toMatchObject({
      provisioningClass: "provider_required",
      blockers: ["media_generation_provider_activation_required"],
    });
    expect(report.modulePlan.find((item) => item.moduleId === "reviews")?.requirements)
      .toContain("owner_confirmed_review_url");
    expect(report.modulePlan.find((item) => item.moduleId === "publishing")?.blockers)
      .toEqual(["publishing_connection_required"]);
    expect(report.safety).toEqual({
      canonicalClientCreated: false,
      providerProvisioningExecuted: false,
      phoneNumberOrdered: false,
      customerMessagingExecuted: false,
      publishingExecuted: false,
      billingExecuted: false,
    });
  });
});
