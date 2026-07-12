// Phase B4 — Scheduler Eligibility Tests
// Covers: evaluateClientEligibility() pure function, all skip-reason paths,
// calculateNextGenerationAt per-tenant timezone, and isValidIanaTimezone.

import { describe, it, expect } from "vitest";
import {
  evaluateClientEligibility,
  isValidIanaTimezone,
  type EligibilityInput,
} from "../../../../../lib/db/src/scheduler-eligibility";
import {
  calculateNextGenerationAt,
} from "../../../../../artifacts/api-server/src/lib/scheduler";

// ── Helpers ────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-07-11T14:00:00.000Z"); // Saturday 9am CDT

function makeInput(overrides: {
  isActive?: boolean;
  autopilotEnabled?: string | null;
  enginePaused?: string | null;
  nextGenerationAt?: Date | null;
  serviceAreas?: string | null;
  topics?: string | null;
  timezone?: string | null;
} = {}): EligibilityInput {
  // Use explicit "in" check so that passing null is preserved (not ?? "true")
  return {
    settings: {
      autopilotEnabled: "autopilotEnabled" in overrides ? overrides.autopilotEnabled : "true",
      enginePaused:     "enginePaused"     in overrides ? overrides.enginePaused     : null,
      nextGenerationAt: "nextGenerationAt" in overrides
        ? overrides.nextGenerationAt
        : new Date(NOW.getTime() - 60_000), // 1 minute ago (due)
      serviceAreas: "serviceAreas" in overrides
        ? overrides.serviceAreas
        : JSON.stringify(["Foley, AL", "Daphne, AL"]),
      topics: "topics" in overrides
        ? overrides.topics
        : JSON.stringify(["Bed Bug Inspection", "Roach Control"]),
    },
    client: {
      isActive: "isActive" in overrides ? overrides.isActive! : true,
      timezone: "timezone" in overrides ? overrides.timezone : "America/Chicago",
    },
    now: NOW,
  };
}

// ── T-B4-ELIG-1: Happy path ───────────────────────────────────────────────────

describe("T-B4-ELIG-1: eligible client — all conditions met", () => {
  it("returns eligible:true for active + enabled + unpaused + due + non-empty config", () => {
    const result = evaluateClientEligibility(makeInput());
    expect(result.eligible).toBe(true);
    expect(result.skipReason).toBeUndefined();
  });
});

// ── T-B4-ELIG-2: is_active = false ───────────────────────────────────────────

describe("T-B4-ELIG-2: inactive client skipped", () => {
  it("returns eligible:false with client_inactive when is_active=false", () => {
    const result = evaluateClientEligibility(makeInput({ isActive: false }));
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("client_inactive");
  });

  it("client_inactive is the first check — other fields are not evaluated", () => {
    const result = evaluateClientEligibility(makeInput({
      isActive: false,
      autopilotEnabled: null,
      enginePaused: "true",
      nextGenerationAt: null,
      serviceAreas: null,
      topics: null,
    }));
    expect(result.skipReason).toBe("client_inactive");
  });
});

// ── T-B4-ELIG-3: autopilot_enabled != 'true' ─────────────────────────────────

describe("T-B4-ELIG-3: autopilot disabled — client skipped", () => {
  it("returns autopilot_disabled when autopilotEnabled='false'", () => {
    const result = evaluateClientEligibility(makeInput({ autopilotEnabled: "false" }));
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("autopilot_disabled");
  });

  it("returns autopilot_disabled when autopilotEnabled=null", () => {
    const result = evaluateClientEligibility(makeInput({ autopilotEnabled: null }));
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("autopilot_disabled");
  });

  it("returns autopilot_disabled when autopilotEnabled=''", () => {
    const result = evaluateClientEligibility(makeInput({ autopilotEnabled: "" }));
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("autopilot_disabled");
  });
});

// ── T-B4-ELIG-4: engine_paused = 'true' ──────────────────────────────────────

describe("T-B4-ELIG-4: engine paused — client skipped", () => {
  it("returns engine_paused when enginePaused='true'", () => {
    const result = evaluateClientEligibility(makeInput({ enginePaused: "true" }));
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("engine_paused");
  });

  it("is eligible when enginePaused='false'", () => {
    const result = evaluateClientEligibility(makeInput({ enginePaused: "false" }));
    expect(result.eligible).toBe(true);
  });

  it("is eligible when enginePaused=null (not paused)", () => {
    const result = evaluateClientEligibility(makeInput({ enginePaused: null }));
    expect(result.eligible).toBe(true);
  });
});

// ── T-B4-ELIG-5: invalid timezone ─────────────────────────────────────────────

describe("T-B4-ELIG-5: invalid timezone — client skipped", () => {
  it("returns invalid_timezone for a garbage timezone string", () => {
    const result = evaluateClientEligibility(makeInput({ timezone: "Not/ATimezone" }));
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("invalid_timezone");
  });

  it("returns invalid_timezone for empty string timezone", () => {
    const result = evaluateClientEligibility(makeInput({ timezone: "" }));
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("invalid_timezone");
  });

  it("returns invalid_timezone when timezone=null", () => {
    const result = evaluateClientEligibility(makeInput({ timezone: null }));
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("invalid_timezone");
  });

  it("accepts America/Chicago as valid", () => {
    const result = evaluateClientEligibility(makeInput({ timezone: "America/Chicago" }));
    expect(result.eligible).toBe(true);
  });

  it("accepts America/New_York as valid", () => {
    const result = evaluateClientEligibility(makeInput({ timezone: "America/New_York" }));
    expect(result.eligible).toBe(true);
  });

  it("accepts America/Los_Angeles as valid", () => {
    const result = evaluateClientEligibility(makeInput({ timezone: "America/Los_Angeles" }));
    expect(result.eligible).toBe(true);
  });
});

// ── T-B4-ELIG-6: missing next_generation_at ────────────────────────────────────

describe("T-B4-ELIG-6: missing next_generation_at — client skipped", () => {
  it("returns missing_next_generation_at when nextGenerationAt=null", () => {
    const result = evaluateClientEligibility(makeInput({ nextGenerationAt: null }));
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("missing_next_generation_at");
  });
});

// ── T-B4-ELIG-7: not yet due ──────────────────────────────────────────────────

describe("T-B4-ELIG-7: not_due — client skipped", () => {
  it("returns not_due when nextGenerationAt is in the future", () => {
    const future = new Date(NOW.getTime() + 60 * 60 * 1000);
    const result = evaluateClientEligibility(makeInput({ nextGenerationAt: future }));
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("not_due");
  });

  it("is eligible when nextGenerationAt is exactly now", () => {
    const result = evaluateClientEligibility(makeInput({ nextGenerationAt: NOW }));
    expect(result.eligible).toBe(true);
  });
});

// ── T-B4-ELIG-8: missing service areas ────────────────────────────────────────

describe("T-B4-ELIG-8: missing service areas — client skipped", () => {
  it("returns missing_service_areas when serviceAreas='[]'", () => {
    const result = evaluateClientEligibility(makeInput({ serviceAreas: "[]" }));
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("missing_service_areas");
  });

  it("returns missing_service_areas when serviceAreas=null", () => {
    const result = evaluateClientEligibility(makeInput({ serviceAreas: null }));
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("missing_service_areas");
  });

  it("returns missing_service_areas when serviceAreas is invalid JSON", () => {
    const result = evaluateClientEligibility(makeInput({ serviceAreas: "not-json" }));
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("missing_service_areas");
  });
});

// ── T-B4-ELIG-9: missing topics ───────────────────────────────────────────────

describe("T-B4-ELIG-9: missing topics — client skipped", () => {
  it("returns missing_topics when topics='[]'", () => {
    const result = evaluateClientEligibility(makeInput({ topics: "[]" }));
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("missing_topics");
  });

  it("returns missing_topics when topics=null", () => {
    const result = evaluateClientEligibility(makeInput({ topics: null }));
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("missing_topics");
  });

  it("returns missing_topics when topics is invalid JSON", () => {
    const result = evaluateClientEligibility(makeInput({ topics: "{broken}" }));
    expect(result.eligible).toBe(false);
    expect(result.skipReason).toBe("missing_topics");
  });
});

// ── T-B4-ELIG-10: isValidIanaTimezone helper ──────────────────────────────────

describe("T-B4-ELIG-10: isValidIanaTimezone helper", () => {
  it("returns true for America/Chicago", () => {
    expect(isValidIanaTimezone("America/Chicago")).toBe(true);
  });

  it("returns true for Europe/London", () => {
    expect(isValidIanaTimezone("Europe/London")).toBe(true);
  });

  it("returns true for Asia/Tokyo", () => {
    expect(isValidIanaTimezone("Asia/Tokyo")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isValidIanaTimezone("")).toBe(false);
  });

  it("returns false for 'America/InvalidCity'", () => {
    expect(isValidIanaTimezone("America/InvalidCity")).toBe(false);
  });

  it("returns false for a clearly invalid string", () => {
    expect(isValidIanaTimezone("Not_A_Timezone_12345")).toBe(false);
  });
});

// ── T-B4-ELIG-11: calculateNextGenerationAt per-tenant timezone ──────────────

describe("T-B4-ELIG-11: calculateNextGenerationAt uses per-tenant timezone", () => {
  const base = new Date("2026-07-13T14:00:00.000Z"); // Monday 9am CDT

  it("produces different UTC times for the same wall-clock in different timezones", () => {
    const chicago = calculateNextGenerationAt(
      { generationDay: "monday", generationTime: "08:00" },
      base,
      "America/Chicago",
    );
    const newYork = calculateNextGenerationAt(
      { generationDay: "monday", generationTime: "08:00" },
      base,
      "America/New_York",
    );
    // New York is UTC-4 in summer; Chicago is UTC-5. Same 8am wall-clock = 1 hour apart in UTC.
    expect(chicago.getTime()).not.toBe(newYork.getTime());
  });

  it("falls back to America/Chicago when timezone is null", () => {
    const withNull  = calculateNextGenerationAt({ generationDay: "monday", generationTime: "08:00" }, base, null);
    const chicago   = calculateNextGenerationAt({ generationDay: "monday", generationTime: "08:00" }, base, "America/Chicago");
    expect(withNull.getTime()).toBe(chicago.getTime());
  });

  it("falls back to America/Chicago for an invalid timezone string", () => {
    const withBad = calculateNextGenerationAt({ generationDay: "monday", generationTime: "08:00" }, base, "Not/ATimezone");
    const chicago = calculateNextGenerationAt({ generationDay: "monday", generationTime: "08:00" }, base, "America/Chicago");
    expect(withBad.getTime()).toBe(chicago.getTime());
  });

  it("returns now + 7 days when no generationDay configured", () => {
    const result   = calculateNextGenerationAt({ generationDay: null, generationTime: null }, base, "America/Chicago");
    const expected = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(result.getTime()).toBe(expected.getTime());
  });
});
