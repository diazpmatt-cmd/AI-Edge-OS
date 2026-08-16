import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  pool: {
    connect: vi.fn(),
    query: vi.fn(),
  },
}));
vi.mock("../lib/client-resolver.js", () => ({ clientBootstrapReady: Promise.resolve(true) }));
vi.mock("../lib/service-registry-loader.js", () => ({ registryBootstrapReady: Promise.resolve() }));

let buildCanonicalProvisioningPlan: typeof import("../lib/client-onboarding-provisioning.js").buildCanonicalProvisioningPlan;
let CanonicalProvisioningError: typeof import("../lib/client-onboarding-provisioning.js").CanonicalProvisioningError;

beforeAll(async () => {
  const mod = await import("../lib/client-onboarding-provisioning.js");
  buildCanonicalProvisioningPlan = mod.buildCanonicalProvisioningPlan;
  CanonicalProvisioningError = mod.CanonicalProvisioningError;
});

const fictionalClient = {
  id: "00000000-0000-4000-8000-000000000002",
  createdByUserId: "user_owner_admin",
  businessName: "Lakeside Plumbing",
  industry: "Plumbing",
  website: "lakeside.example",
  mainPhone: "972-555-0100",
  forwardingPhone: "972-555-0199",
  email: "ops@lakeside.example",
  city: "Huntsville",
  state: "AL",
  zip: "35801",
  serviceRadius: "25",
  businessHours: "Mon-Fri 8am-6pm",
  services: "Pipe Repair, Drain Cleaning, Water Heater",
  modulesEnabled: JSON.stringify(["workspace", "receptionist", "local", "revenue", "apollos"]),
  status: "draft",
};

describe("canonical client provisioning plan", () => {
  it("builds a fictional second tenant without BB&B identity, phone, or geography leakage", () => {
    const plan = buildCanonicalProvisioningPlan(fictionalClient, "user_lakeside_002");
    const serialized = JSON.stringify(plan);

    expect(plan.targetUserId).toBe("user_lakeside_002");
    expect(plan.client).toMatchObject({
      slug: "lakeside-plumbing",
      clientName: "Lakeside Plumbing",
      industry: "plumbing",
      industryLabel: "plumbing",
      region: "Huntsville, AL",
      serviceAreas: ["Huntsville, AL"],
    });
    expect(plan.services.map(service => service.serviceKey)).toEqual([
      "pipe_repair",
      "drain_cleaning",
      "water_heater",
    ]);
    expect(plan.autoContent.approvalMode).toBe("approval_required");
    expect(plan.autoContent.enginePaused).toBe("true");
    expect(plan.autoContent.autopilotEnabled).toBe("false");
    expect(plan.autoContent.autoMediaEnabled).toBe("false");
    expect(plan.autoContent.ctaText).toContain("+19725550100");
    expect(plan.receptionist?.businessName).toBe("Lakeside Plumbing");
    expect(plan.localPresence?.city).toBe("Huntsville");

    expect(serialized).not.toContain("Bed Bugs & Beyond");
    expect(serialized).not.toContain("2513249090");
    expect(serialized).not.toContain("Baldwin County");
  });

  it("preserves provider and customer side effects as readiness-only work", () => {
    const plan = buildCanonicalProvisioningPlan(fictionalClient, "user_lakeside_002");
    const externalModules = plan.preflight.modulePlan.filter(
      item => item.provisioningClass !== "internal",
    );

    expect(externalModules.map(item => item.moduleId)).toEqual(["receptionist", "local"]);
    expect(plan.preflight.safety).toEqual({
      canonicalClientCreated: false,
      providerProvisioningExecuted: false,
      phoneNumberOrdered: false,
      customerMessagingExecuted: false,
      publishingExecuted: false,
      billingExecuted: false,
    });
  });

  it("fails closed when canonical geography is missing even if Local Presence was not selected", () => {
    const row = {
      ...fictionalClient,
      city: "",
      state: "",
      modulesEnabled: JSON.stringify(["workspace", "revenue", "apollos"]),
    };

    expect(() => buildCanonicalProvisioningPlan(row, "user_lakeside_002")).toThrowError(
      expect.objectContaining({ code: "CANONICAL_GEOGRAPHY_REQUIRED", status: 422 }),
    );
  });

  it("rejects service names that collide after stable-key normalization", () => {
    const row = {
      ...fictionalClient,
      services: "Drain Cleaning, Drain-Cleaning",
    };

    expect(() => buildCanonicalProvisioningPlan(row, "user_lakeside_002")).toThrowError(
      expect.objectContaining({ code: "SERVICE_KEY_COLLISION", status: 422 }),
    );
  });

  it("requires the explicit trusted target identity contract", () => {
    try {
      buildCanonicalProvisioningPlan(fictionalClient, "not a clerk id");
      throw new Error("expected trusted target identity rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(CanonicalProvisioningError);
      expect(error).toMatchObject({ code: "TRUSTED_TARGET_IDENTITY_REQUIRED", status: 400 });
    }
  });
});
