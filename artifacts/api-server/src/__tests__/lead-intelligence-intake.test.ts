import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@workspace/db/schema";

const defaultDb = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("@workspace/db", () => ({ db: defaultDb }));

import {
  createDrizzleLeadIntakeStore,
  createLeadIntakeService,
  type LeadIntakeStore,
  type NormalizedLeadIntake,
} from "../services/lead-intake";

function leadFrom(input: NormalizedLeadIntake, id = "00000000-0000-4000-8000-000000000001"): Lead {
  const now = new Date("2026-08-03T12:00:00.000Z");
  return {
    id,
    ...input,
    draftResponse: null,
    lastFollowUpAt: null,
    outcome: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
}

function capturingStore() {
  const inputs: NormalizedLeadIntake[] = [];
  const store: LeadIntakeStore = {
    async createOrGet(input) {
      inputs.push(input);
      return { lead: leadFrom(input), created: true };
    },
  };
  return { inputs, store };
}

describe("Lead Intelligence V1 intake", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a normalized lead through the canonical intake store", async () => {
    const { inputs, store } = capturingStore();
    const intake = createLeadIntakeService(store);

    const result = await intake({
      clientName: " Bed Bugs & Beyond ",
      source: " web-form ",
      phone: " 251-324-9090 ",
      customerName: " Jane Customer ",
      message: " Need furniture treatment ",
      eventType: " form_submission ",
      service: " bed bug item treatment ",
      location: " Daphne, AL ",
      urgency: " urgent ",
      sourceMessageId: " form-123 ",
      receivedAt: "2026-08-03T10:30:00.000Z",
    });

    expect(result.created).toBe(true);
    expect(inputs[0]).toMatchObject({
      clientName: "Bed Bugs & Beyond",
      source: "web-form",
      phone: "251-324-9090",
      customerName: "Jane Customer",
      message: "Need furniture treatment",
      eventType: "form_submission",
      service: "bed bug item treatment",
      location: "Daphne, AL",
      urgency: "urgent",
      sourceMessageId: "form-123",
    });
    expect(inputs[0]?.receivedAt.toISOString()).toBe("2026-08-03T10:30:00.000Z");
  });

  it("accepts partial lead data and normalizes missing optional values", async () => {
    const { inputs, store } = capturingStore();
    const intake = createLeadIntakeService(store);

    await intake({ clientName: "Bed Bugs & Beyond", source: "manual" });

    expect(inputs[0]).toMatchObject({
      phone: "",
      customerName: null,
      message: null,
      service: null,
      location: null,
      sourceMessageId: null,
    });
    expect(inputs[0]?.receivedAt).toBeInstanceOf(Date);
  });

  it("applies canonical new-lead defaults", async () => {
    const { inputs, store } = capturingStore();
    const intake = createLeadIntakeService(store);

    await intake({ clientName: "Bed Bugs & Beyond", source: "inbox", urgency: " " });

    expect(inputs[0]).toMatchObject({
      eventType: "sms",
      urgency: "normal",
      responseStatus: "pending",
      status: "new",
    });
  });

  it("returns an existing lead for the same client, source, and source message ID", async () => {
    const existing = leadFrom({
      clientName: "Bed Bugs & Beyond",
      source: "telnyx_sms",
      phone: "+12513249090",
      customerName: null,
      message: "Existing message",
      eventType: "sms",
      service: null,
      location: null,
      urgency: "normal",
      sourceMessageId: "telnyx-123",
      responseStatus: "pending",
      status: "new",
      receivedAt: new Date("2026-08-03T11:00:00.000Z"),
    });
    const execute = vi.fn().mockResolvedValue(undefined);
    const limit = vi.fn().mockResolvedValue([existing]);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const insert = vi.fn();
    const tx = { execute, select, insert };
    const database = {
      transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    };
    const intake = createLeadIntakeService(
      createDrizzleLeadIntakeStore(database as never),
    );

    const result = await intake({
      clientName: "Bed Bugs & Beyond",
      source: "telnyx_sms",
      sourceMessageId: "telnyx-123",
      message: "Retried delivery",
    });

    expect(result).toEqual({ lead: existing, created: false });
    expect(execute).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledOnce();
    expect(insert).not.toHaveBeenCalled();
  });

  it("keeps legacy Telnyx lead input backward compatible", async () => {
    const { inputs, store } = capturingStore();
    const intake = createLeadIntakeService(store);

    const result = await intake({
      clientName: "Bed Bugs & Beyond",
      source: "telnyx_sms",
      phone: "+12513249090",
      message: "Legacy inbound SMS",
      eventType: "sms",
    });

    expect(result.created).toBe(true);
    expect(inputs[0]).toMatchObject({
      clientName: "Bed Bugs & Beyond",
      source: "telnyx_sms",
      phone: "+12513249090",
      message: "Legacy inbound SMS",
      eventType: "sms",
      status: "new",
      responseStatus: "pending",
      urgency: "normal",
      sourceMessageId: null,
    });
  });
});
