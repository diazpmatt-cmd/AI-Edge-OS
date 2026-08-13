import { describe, expect, it } from "vitest";
import { buildStagingRowPreflight } from "./client-onboarding-staging-preflight.js";

describe("buildStagingRowPreflight", () => {
  it("normalizes a fictional second client without BB&B leakage", () => {
    const result = buildStagingRowPreflight({
      businessName: "Lakeside Plumbing",
      industry: "Plumbing",
      website: "lakesideplumbing.example",
      mainPhone: "303-555-0100",
      forwardingPhone: "303-555-0199",
      email: "service@lakesideplumbing.example",
      city: "Denver",
      state: "CO",
      zip: "80202",
      serviceRadius: "30",
      businessHours: "Mon-Fri 7am-7pm",
      services: "Drain Cleaning, Water Heater Repair, Leak Repair",
      modulesEnabled: JSON.stringify(["workspace", "receptionist", "local", "reviews"]),
    });

    expect(result.valid).toBe(true);
    expect(result.normalized.businessName).toBe("Lakeside Plumbing");
    expect(result.normalized.mainPhone).toBe("+13035550100");
    expect(result.normalized.forwardingPhone).toBe("+13035550199");
    expect(result.normalized.services).toEqual([
      "Drain Cleaning",
      "Water Heater Repair",
      "Leak Repair",
    ]);
    expect(result.normalized.modulesEnabled).toEqual([
      "workspace",
      "receptionist",
      "local",
      "reviews",
    ]);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Bed Bugs");
    expect(serialized).not.toContain("Baldwin");
    expect(serialized).not.toContain("Termite");
    expect(serialized).not.toContain("2512863200");
    expect(serialized).not.toContain("2513249090");
  });

  it("fails closed to no modules when legacy JSON is malformed", () => {
    const result = buildStagingRowPreflight({
      businessName: "Lakeside Plumbing",
      industry: "Plumbing",
      mainPhone: "303-555-0100",
      services: "Drain Cleaning",
      modulesEnabled: "not-json",
    });

    expect(result.normalized.modulesEnabled).toEqual([]);
    expect(result.warnings.some((issue) => issue.code === "none_selected")).toBe(true);
  });

  it("does not accept a non-array JSON module payload", () => {
    const result = buildStagingRowPreflight({
      businessName: "Lakeside Plumbing",
      industry: "Plumbing",
      mainPhone: "303-555-0100",
      services: "Drain Cleaning",
      modulesEnabled: JSON.stringify({ receptionist: true }),
    });

    expect(result.normalized.modulesEnabled).toEqual([]);
    expect(result.safety.canonicalClientCreated).toBe(false);
    expect(result.safety.providerProvisioningExecuted).toBe(false);
    expect(result.safety.phoneNumberOrdered).toBe(false);
    expect(result.safety.customerMessagingExecuted).toBe(false);
    expect(result.safety.publishingExecuted).toBe(false);
    expect(result.safety.billingExecuted).toBe(false);
  });
});
