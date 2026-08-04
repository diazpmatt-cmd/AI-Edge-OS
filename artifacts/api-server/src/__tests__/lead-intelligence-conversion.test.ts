import { describe, expect, it } from "vitest";
import {
  CONVERSION_STAGES,
  isConversionStage,
  suppressFollowUpForStage,
} from "../services/lead-conversion";


describe("lead conversion stages", () => {
  it("accepts every supported appointment and conversion stage", () => {
    for (const stage of CONVERSION_STAGES) expect(isConversionStage(stage)).toBe(true);
  });

  it("rejects unknown or malformed stages", () => {
    expect(isConversionStage("quoted")).toBe(false);
    expect(isConversionStage(123)).toBe(false);
    expect(isConversionStage(null)).toBe(false);
  });

  it("suppresses follow-up after booking or closure", () => {
    expect(suppressFollowUpForStage("booked")).toBe(true);
    expect(suppressFollowUpForStage("completed")).toBe(true);
    expect(suppressFollowUpForStage("won")).toBe(true);
    expect(suppressFollowUpForStage("lost")).toBe(true);
  });

  it("keeps follow-up available during appointment handoff", () => {
    expect(suppressFollowUpForStage("appointment_requested")).toBe(false);
    expect(suppressFollowUpForStage("scheduling")).toBe(false);
  });
});
