import { describe, expect, it } from "vitest";
import {
  decideCheckpointAction,
  validateCheckpointDefinitions,
} from "../lib/apollos-checkpoints";

const digest = "a".repeat(64);

describe("Apollos checkpoint definitions", () => {
  it("sorts and freezes valid ordered steps", () => {
    const result = validateCheckpointDefinitions([
      { stepKey: "youtube", position: 1, capability: "prepare", inputDigest: digest, maxAttempts: 3 },
      { stepKey: "facebook", position: 0, capability: "prepare", inputDigest: digest, maxAttempts: 3 },
    ]);
    expect(result.map((step) => step.stepKey)).toEqual(["facebook", "youtube"]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.every(Object.isFrozen)).toBe(true);
  });

  it.each([
    [[{ stepKey: "Bad Key", position: 0, capability: "prepare", inputDigest: digest, maxAttempts: 3 }], "APOLLOS_CHECKPOINT_KEY_INVALID"],
    [[{ stepKey: "one", position: -1, capability: "prepare", inputDigest: digest, maxAttempts: 3 }], "APOLLOS_CHECKPOINT_POSITION_INVALID"],
    [[{ stepKey: "one", position: 0, capability: "", inputDigest: digest, maxAttempts: 3 }], "APOLLOS_CHECKPOINT_CAPABILITY_INVALID"],
    [[{ stepKey: "one", position: 0, capability: "prepare", inputDigest: "bad", maxAttempts: 3 }], "APOLLOS_CHECKPOINT_DIGEST_INVALID"],
    [[{ stepKey: "one", position: 0, capability: "prepare", inputDigest: digest, maxAttempts: 0 }], "APOLLOS_CHECKPOINT_ATTEMPTS_INVALID"],
  ])("rejects malformed definitions", (steps, error) => {
    expect(() => validateCheckpointDefinitions(steps)).toThrow(error);
  });

  it("rejects duplicate keys and positions", () => {
    expect(() =>
      validateCheckpointDefinitions([
        { stepKey: "same", position: 0, capability: "prepare", inputDigest: digest, maxAttempts: 3 },
        { stepKey: "same", position: 1, capability: "prepare", inputDigest: digest, maxAttempts: 3 },
      ]),
    ).toThrow("APOLLOS_CHECKPOINT_KEY_DUPLICATE");
    expect(() =>
      validateCheckpointDefinitions([
        { stepKey: "one", position: 0, capability: "prepare", inputDigest: digest, maxAttempts: 3 },
        { stepKey: "two", position: 0, capability: "prepare", inputDigest: digest, maxAttempts: 3 },
      ]),
    ).toThrow("APOLLOS_CHECKPOINT_POSITION_DUPLICATE");
  });
});

describe("Apollos checkpoint decisions", () => {
  const now = "2026-08-06T18:00:00.000Z";

  it("never re-runs a completed step", () => {
    expect(
      decideCheckpointAction(
        { status: "completed", attemptCount: 1, maxAttempts: 3, leaseExpiresAt: null },
        now,
      ),
    ).toMatchObject({
      action: "skip_completed",
      nextAttemptCount: 1,
      terminal: true,
    });
  });

  it("waits while another worker owns an active lease", () => {
    expect(
      decideCheckpointAction(
        {
          status: "running",
          attemptCount: 1,
          maxAttempts: 3,
          leaseExpiresAt: "2026-08-06T18:05:00.000Z",
        },
        now,
      ),
    ).toMatchObject({
      action: "wait_for_lease",
      nextAttemptCount: 1,
      reasonCode: "APOLLOS_CHECKPOINT_LEASE_ACTIVE",
    });
  });

  it("recovers an expired running step", () => {
    expect(
      decideCheckpointAction(
        {
          status: "running",
          attemptCount: 1,
          maxAttempts: 3,
          leaseExpiresAt: "2026-08-06T17:59:00.000Z",
        },
        now,
      ),
    ).toMatchObject({
      action: "run",
      nextAttemptCount: 2,
      reasonCode: "APOLLOS_CHECKPOINT_LEASE_RECOVERED",
    });
  });

  it("retries a failed step within its bound", () => {
    expect(
      decideCheckpointAction(
        { status: "failed", attemptCount: 1, maxAttempts: 3, leaseExpiresAt: null },
        now,
      ),
    ).toMatchObject({
      action: "run",
      nextAttemptCount: 2,
      reasonCode: "APOLLOS_CHECKPOINT_RETRY",
    });
  });

  it("fails closed after the attempt ceiling", () => {
    expect(
      decideCheckpointAction(
        { status: "failed", attemptCount: 3, maxAttempts: 3, leaseExpiresAt: null },
        now,
      ),
    ).toMatchObject({
      action: "fail_exhausted",
      terminal: true,
      reasonCode: "APOLLOS_CHECKPOINT_RETRIES_EXHAUSTED",
    });
  });

  it("rejects malformed state and timestamps", () => {
    expect(() =>
      decideCheckpointAction(
        { status: "pending", attemptCount: -1, maxAttempts: 3, leaseExpiresAt: null },
        now,
      ),
    ).toThrow("APOLLOS_CHECKPOINT_STATE_INVALID");
    expect(() =>
      decideCheckpointAction(
        { status: "pending", attemptCount: 0, maxAttempts: 3, leaseExpiresAt: null },
        "not-a-date",
      ),
    ).toThrow("APOLLOS_CHECKPOINT_NOW_INVALID");
  });
});
