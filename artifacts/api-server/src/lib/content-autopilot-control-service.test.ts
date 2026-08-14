import { describe, expect, it } from "vitest";

import {
  deriveContentAutopilotControls,
  executeContentAutopilotControl,
  type ContentAutopilotControlRow,
  type ContentAutopilotControlStore,
  type ContentAutopilotTenantGate,
} from "./content-autopilot-control-service";

const NOW = new Date("2026-08-14T22:15:00.000Z");

function row(overrides: Partial<ContentAutopilotControlRow> = {}): ContentAutopilotControlRow {
  return {
    autopilotEnabled: "false",
    autoMediaEnabled: "false",
    enginePaused: "false",
    nextGenerationAt: null,
    approvalMode: "approval_required",
    ...overrides,
  };
}

function fakeStore(initial: ContentAutopilotControlRow | null) {
  let current = initial ? { ...initial } : null;
  let updateCalls = 0;
  const store: ContentAutopilotControlStore = {
    async read() {
      return current ? { ...current } : null;
    },
    async update(_ownerUserId, values) {
      updateCalls += 1;
      if (!current) return false;
      current = {
        ...current,
        autopilotEnabled: values.autopilotEnabled ?? current.autopilotEnabled,
        autoMediaEnabled: values.autoMediaEnabled ?? current.autoMediaEnabled,
        enginePaused: values.enginePaused ?? current.enginePaused,
        nextGenerationAt: values.nextGenerationAt === undefined
          ? current.nextGenerationAt
          : values.nextGenerationAt,
      };
      return true;
    },
  };
  return {
    store,
    get updateCalls() { return updateCalls; },
    get current() { return current; },
  };
}

function tenantGate(overrides: Partial<ContentAutopilotTenantGate> = {}): ContentAutopilotTenantGate {
  return {
    active: async () => ({ ok: true, clientId: "client-bbb", clientName: "Bed Bugs & Beyond" }),
    registryReady: async () => ({ ok: true }),
    ...overrides,
  };
}

describe("deriveContentAutopilotControls", () => {
  it("matches the existing PUT semantics when enabling continuous generation", () => {
    const derived = deriveContentAutopilotControls({
      existing: row({ enginePaused: "true" }),
      autopilotEnabled: true,
      now: NOW,
    });

    expect(derived).toEqual({
      autopilotEnabled: "true",
      autoMediaEnabled: "false",
      enginePaused: "false",
      nextGenerationAt: NOW,
    });
  });

  it("preserves an existing generation timestamp when disabling", () => {
    const scheduled = new Date("2026-08-18T14:00:00.000Z");
    const derived = deriveContentAutopilotControls({
      existing: row({ autopilotEnabled: "true", nextGenerationAt: scheduled }),
      autopilotEnabled: false,
      now: NOW,
    });

    expect(derived.autopilotEnabled).toBe("false");
    expect(derived.nextGenerationAt).toBe(scheduled);
  });
});

describe("executeContentAutopilotControl", () => {
  it("enables continuous generation, unpauses, initializes schedule, and verifies", async () => {
    const fake = fakeStore(row({ enginePaused: "true" }));
    const result = await executeContentAutopilotControl({
      ownerUserId: "owner-1",
      expectedClientId: "client-bbb",
      action: "set_continuous_generation",
      enabled: true,
      now: NOW,
    }, { store: fake.store, tenantGate: tenantGate() });

    expect(result.changed).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.after).toMatchObject({
      autopilotEnabled: true,
      enginePaused: false,
      nextGenerationAt: NOW.toISOString(),
      approvalMode: "approval_required",
    });
    expect(result.approvalBoundary).toBe("human_approval_required");
    expect(result.externalSideEffects).toBe(false);
    expect(result.providerCalls).toBe(false);
    expect(fake.updateCalls).toBe(1);
  });

  it("changes Automatic Media without changing approval or continuous-generation state", async () => {
    const scheduled = new Date("2026-08-18T14:00:00.000Z");
    const fake = fakeStore(row({
      autopilotEnabled: "true",
      nextGenerationAt: scheduled,
    }));
    const result = await executeContentAutopilotControl({
      ownerUserId: "owner-1",
      expectedClientId: "client-bbb",
      action: "set_automatic_media",
      enabled: true,
      now: NOW,
    }, { store: fake.store, tenantGate: tenantGate() });

    expect(result.after.autoMediaEnabled).toBe(true);
    expect(result.after.autopilotEnabled).toBe(true);
    expect(result.after.nextGenerationAt).toBe(scheduled.toISOString());
    expect(result.after.approvalMode).toBe("approval_required");
  });

  it("pauses as a safety action without requiring registry readiness", async () => {
    let registryCalls = 0;
    const fake = fakeStore(row({ autopilotEnabled: "true" }));
    const result = await executeContentAutopilotControl({
      ownerUserId: "owner-1",
      expectedClientId: "client-bbb",
      action: "pause_content_autopilot",
      now: NOW,
    }, {
      store: fake.store,
      tenantGate: tenantGate({
        registryReady: async () => {
          registryCalls += 1;
          return { ok: false, reason: "registry_unavailable" };
        },
      }),
    });

    expect(result.after.enginePaused).toBe(true);
    expect(registryCalls).toBe(0);
  });

  it("treats an already-matching control as an idempotent verified no-op", async () => {
    const fake = fakeStore(row({ autoMediaEnabled: "true" }));
    const result = await executeContentAutopilotControl({
      ownerUserId: "owner-1",
      expectedClientId: "client-bbb",
      action: "set_automatic_media",
      enabled: true,
      now: NOW,
    }, { store: fake.store, tenantGate: tenantGate() });

    expect(result.changed).toBe(false);
    expect(result.verified).toBe(true);
    expect(fake.updateCalls).toBe(0);
  });

  it("fails closed when enabling against a legacy non-approval-required row", async () => {
    const fake = fakeStore(row({ approvalMode: "auto_schedule" }));

    await expect(executeContentAutopilotControl({
      ownerUserId: "owner-1",
      expectedClientId: "client-bbb",
      action: "set_continuous_generation",
      enabled: true,
      now: NOW,
    }, { store: fake.store, tenantGate: tenantGate() }))
      .rejects.toThrow("APOLLOS_MCP_CONTENT_AUTOPILOT_APPROVAL_MODE_UNSAFE");
    expect(fake.updateCalls).toBe(0);
  });

  it("still permits safety-reducing actions on a legacy approval row without relabeling it safe", async () => {
    const fake = fakeStore(row({
      approvalMode: "auto_schedule",
      autopilotEnabled: "true",
    }));
    const disabled = await executeContentAutopilotControl({
      ownerUserId: "owner-1",
      expectedClientId: "client-bbb",
      action: "set_continuous_generation",
      enabled: false,
      now: NOW,
    }, { store: fake.store, tenantGate: tenantGate() });

    expect(disabled.after.autopilotEnabled).toBe(false);
    expect(disabled.after.approvalMode).toBe("auto_schedule");
    expect(disabled.approvalBoundary).toBe("legacy_non_approval_required");
  });

  it("rejects a cross-client owner mapping before mutation", async () => {
    const fake = fakeStore(row());

    await expect(executeContentAutopilotControl({
      ownerUserId: "owner-1",
      expectedClientId: "different-client",
      action: "pause_content_autopilot",
      now: NOW,
    }, { store: fake.store, tenantGate: tenantGate() }))
      .rejects.toThrow("APOLLOS_MCP_CONTENT_AUTOPILOT_CLIENT_MISMATCH");
    expect(fake.updateCalls).toBe(0);
  });

  it("fails closed instead of creating a settings row with legacy defaults", async () => {
    const fake = fakeStore(null);

    await expect(executeContentAutopilotControl({
      ownerUserId: "owner-1",
      expectedClientId: "client-bbb",
      action: "set_continuous_generation",
      enabled: true,
      now: NOW,
    }, { store: fake.store, tenantGate: tenantGate() }))
      .rejects.toThrow("APOLLOS_MCP_CONTENT_AUTOPILOT_SETTINGS_NOT_INITIALIZED");
    expect(fake.updateCalls).toBe(0);
  });

  it("requires a healthy registry before resume", async () => {
    const fake = fakeStore(row({ enginePaused: "true" }));

    await expect(executeContentAutopilotControl({
      ownerUserId: "owner-1",
      expectedClientId: "client-bbb",
      action: "resume_content_autopilot",
      now: NOW,
    }, {
      store: fake.store,
      tenantGate: tenantGate({ registryReady: async () => ({ ok: false, reason: "registry_invalid" }) }),
    })).rejects.toThrow("APOLLOS_MCP_CONTENT_AUTOPILOT_REGISTRY_INVALID");
    expect(fake.updateCalls).toBe(0);
  });
});
