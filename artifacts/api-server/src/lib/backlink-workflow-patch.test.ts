import { describe, expect, it } from "vitest";
import { buildLegacyBacklinkWorkflowTransition } from "./backlink-workflow-patch.js";

describe("legacy backlink workflow patch adapter", () => {
  it("preserves omitted workflow metadata on a status-only transition", () => {
    const input = buildLegacyBacklinkWorkflowTransition(
      { toStatus: "reviewing" },
      "user-1",
    );

    expect(input).toEqual({
      toStatus: "reviewing",
      actorId: "user-1",
    });
    expect("ownerId" in input).toBe(false);
    expect("nextAction" in input).toBe(false);
    expect("dueAt" in input).toBe(false);
    expect("outcomeSummary" in input).toBe(false);
    expect("reason" in input).toBe(false);
  });

  it("preserves explicit null as an intentional clear", () => {
    const input = buildLegacyBacklinkWorkflowTransition(
      {
        toStatus: "approved",
        reason: null,
        ownerId: null,
        nextAction: null,
        dueAt: null,
        outcomeSummary: null,
      },
      "user-1",
    );

    expect(input).toMatchObject({
      reason: null,
      ownerId: null,
      nextAction: null,
      dueAt: null,
      outcomeSummary: null,
    });
  });

  it("parses an explicitly supplied due date without manufacturing other fields", () => {
    const input = buildLegacyBacklinkWorkflowTransition(
      {
        toStatus: "pursuing",
        dueAt: "2026-08-15T15:00:00.000Z",
      },
      "user-1",
    );

    expect(input.dueAt).toEqual(new Date("2026-08-15T15:00:00.000Z"));
    expect("ownerId" in input).toBe(false);
    expect("nextAction" in input).toBe(false);
  });

  it("requires a destination status", () => {
    expect(() => buildLegacyBacklinkWorkflowTransition({}, "user-1"))
      .toThrow("toStatus_required");
  });
});
