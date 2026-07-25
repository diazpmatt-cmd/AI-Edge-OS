/**
 * Content Autopilot Phase 1 — V1 Acceptance Tests
 *
 * Evidence that the Content Autopilot pure-function layer enforces every V1
 * behavioral contract.  These tests do NOT hit the database or HTTP layer —
 * they exercise the @workspace/db bbb-services module directly.
 *
 * Contracts under test
 * ────────────────────
 * P1  weeklyPlanId is deterministic per (userId, ISO-week)
 * P2  weeklyPlanId changes when the ISO week changes
 * P3  validateTopicForGeneration rejects hard-locked topics (termites)
 * P4  validateTopicForGeneration accepts every topic in getDefaultTopics()
 * P5  Unknown topics are ALLOWED (pest not yet in registry may be valid)
 * P6  getDefaultTopics returns only generationAllowed services
 * P7  termites service exists in BBB_SERVICES but has generationAllowed:false
 * P8  BBB_DEFAULT_APPROVAL_MODE equals "approval_required"
 * P9  selectWeeklyServices returns the requested slot count with correct fields
 * P10 selectWeeklyServices never includes hard-locked services
 * P11 normalizeTopics filters out hard-locked topics from a list
 * P12 matchServiceByTopic finds a service by single-string topic
 */

import { describe, it, expect } from "vitest";
import {
  createWeeklyPlanId,
  validateTopicForGeneration,
  getDefaultTopics,
  BBB_SERVICES,
  BBB_DEFAULT_APPROVAL_MODE,
  selectWeeklyServices,
  normalizeTopics,
  matchServiceByTopic,
} from "@workspace/db";

// ── P1 + P2: weeklyPlanId determinism ────────────────────────────────────────
describe("P1–P2: createWeeklyPlanId", () => {
  const userId = "user_abc123";

  it("P1 — same userId and same calendar date always produces the same id", () => {
    const date = new Date("2026-07-20");          // Monday of ISO week 30-2026
    const id1  = createWeeklyPlanId(userId, date);
    const id2  = createWeeklyPlanId(userId, date);
    expect(id1).toBe(id2);
    // Format: week-YYYY-WW-<alphanum slug>
    expect(id1).toMatch(/^week-\d{4}-\d{2}-[a-zA-Z0-9]+$/);
  });

  it("P1 — two dates in the SAME ISO week produce the same id", () => {
    const monday  = createWeeklyPlanId(userId, new Date("2026-07-20"));  // week 30 Mon
    const friday  = createWeeklyPlanId(userId, new Date("2026-07-24"));  // week 30 Fri
    expect(monday).toBe(friday);
  });

  it("P2 — consecutive ISO weeks produce different ids", () => {
    const week30  = createWeeklyPlanId(userId, new Date("2026-07-20"));  // week 30
    const week31  = createWeeklyPlanId(userId, new Date("2026-07-27"));  // week 31
    expect(week30).not.toBe(week31);
  });

  it("P2 — different userIds produce different ids for the same week", () => {
    const date = new Date("2026-07-20");
    const a = createWeeklyPlanId("user_A", date);
    const b = createWeeklyPlanId("user_B", date);
    expect(a).not.toBe(b);
  });
});

// ── P3 + P4 + P5: validateTopicForGeneration ─────────────────────────────────
describe("P3–P5: validateTopicForGeneration", () => {
  it("P3 — returns a non-null error code for 'termites' (hard-locked)", () => {
    const result = validateTopicForGeneration("termites");
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });

  it("P4 — returns null (no error) for every topic in getDefaultTopics()", () => {
    const topics = getDefaultTopics();
    expect(topics.length).toBeGreaterThan(0);

    for (const topic of topics) {
      const err = validateTopicForGeneration(topic);
      expect(err, `Topic "${topic}" should be valid but got: ${err}`).toBeNull();
    }
  });

  it("P5 — unknown topics are allowed (null), not rejected (pest may be valid)", () => {
    // Per design: "Unknown topic — allow (may be a valid pest not in registry yet)"
    const result = validateTopicForGeneration("dragons");
    expect(result).toBeNull();
  });
});

// ── P6 + P7: service registry enforcement ────────────────────────────────────
describe("P6–P7: BBB_SERVICES and getDefaultTopics", () => {
  it("P6 — getDefaultTopics only includes services where generationAllowed is true", () => {
    const topics    = getDefaultTopics();
    const topicSet  = new Set(topics.map(t => t.toLowerCase()));

    // Hard-locked services (generationAllowed=false) must NOT appear in default topics.
    const lockedServices = BBB_SERVICES.filter(s => !s.generationAllowed);
    for (const svc of lockedServices) {
      // Check that neither the serviceId (normalised) nor the displayName appears.
      const idNorm = svc.serviceId.replace(/_/g, " ");
      const dnNorm = svc.displayName.toLowerCase();
      expect(topicSet.has(idNorm),   `Locked service "${svc.serviceId}" id in topics`).toBe(false);
      expect(topicSet.has(dnNorm),   `Locked service "${svc.serviceId}" displayName in topics`).toBe(false);
    }
  });

  it("P7 — termites exists in BBB_SERVICES with generationAllowed:false (hard-lock)", () => {
    const termites = BBB_SERVICES.find(s => s.serviceId === "termites");
    expect(termites).toBeDefined();
    expect(termites!.generationAllowed).toBe(false);
  });

  it("P7 — at least one service other than termites has generationAllowed:true", () => {
    const allowed = BBB_SERVICES.filter(s => s.generationAllowed);
    expect(allowed.length).toBeGreaterThan(0);
  });
});

// ── P8: default approval mode ─────────────────────────────────────────────────
describe("P8: BBB_DEFAULT_APPROVAL_MODE", () => {
  it("P8 — is 'approval_required' (posts go to draft, not auto-publish)", () => {
    expect(BBB_DEFAULT_APPROVAL_MODE).toBe("approval_required");
  });
});

// ── P9 + P10: selectWeeklyServices ───────────────────────────────────────────
describe("P9–P10: selectWeeklyServices", () => {
  it("P9 — returns exactly the requested number of service slots", () => {
    for (const n of [5, 7, 10, 14]) {
      const slots = selectWeeklyServices(n, []);
      expect(slots.length).toBe(n);
    }
  });

  it("P9 — each slot has service, campaignGoal, audienceId, bucket fields", () => {
    const slots = selectWeeklyServices(7, []);
    for (const slot of slots) {
      expect(typeof slot.service.serviceId).toBe("string");
      expect(typeof slot.campaignGoal).toBe("string");
      expect(typeof slot.audienceId).toBe("string");
      expect(["revenue", "education", "trust"]).toContain(slot.bucket);
    }
  });

  it("P10 — never includes hard-locked services (termites)", () => {
    // Run 20 trials to exercise random selection; hard-locked must NEVER appear.
    for (let trial = 0; trial < 20; trial++) {
      const slots = selectWeeklyServices(14, []);
      for (const slot of slots) {
        expect(
          slot.service.generationAllowed,
          `Trial ${trial}: slot "${slot.service.serviceId}" must have generationAllowed=true`,
        ).toBe(true);
      }
    }
  });
});

// ── P11: normalizeTopics ──────────────────────────────────────────────────────
describe("P11: normalizeTopics", () => {
  it("P11 — filters out hard-locked topics, keeps valid ones", () => {
    // "termites" is hard-locked; "bed bugs" is valid.
    const result = normalizeTopics(["bed bugs", "termites", "ants"]);
    expect(result).not.toContain("termites");
    // Valid ones pass through.
    // (normalizeTopics keeps topics where validateTopicForGeneration returns null)
  });

  it("P11 — returns empty array if all topics are blocked", () => {
    const result = normalizeTopics(["termites"]);
    expect(result).toHaveLength(0);
  });

  it("P11 — keeps all valid topics", () => {
    const validTopics = getDefaultTopics().slice(0, 3);
    const result = normalizeTopics(validTopics);
    expect(result).toHaveLength(validTopics.length);
  });
});

// ── P12: matchServiceByTopic ──────────────────────────────────────────────────
describe("P12: matchServiceByTopic", () => {
  it("P12 — finds the correct service for a known keyword (single-arg API)", () => {
    const match = matchServiceByTopic("bed bug inspection");
    expect(match).toBeDefined();
    expect(match!.serviceId).toMatch(/bed_bug/);
  });

  it("P12 — returns undefined for a topic that matches no known service", () => {
    // Use a string that cannot partially match any BBBService serviceId or displayName.
    // (Avoid words like "ants", "rat", "bee", "wasp", "fly", etc.)
    const match = matchServiceByTopic("zymurgical_quux_vortex_XYZ_9999");
    expect(match).toBeUndefined();
  });
});
