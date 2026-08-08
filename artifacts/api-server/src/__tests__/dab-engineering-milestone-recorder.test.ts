import { describe, expect, it } from "vitest";
import { recordVerifiedDabEngineeringMilestone, type DabTrustedActorLike } from "../lib/dab-engineering-milestone-recorder.js";

const worker: DabTrustedActorLike = { actorId: "apollos:test", displayName: "Apollos", actorType: "bounded_sub_agent", verified: true, developmentControl: true };
const task = { specification: { taskId: "DAB-TEST" }, version: 4, milestones: [] as Array<{ kind: string; status: string; evidence: string }> };

describe("DAB engineering milestone recorder", () => {
  it("forwards factual Git evidence through the canonical recordMilestone shape", async () => {
    let observed: unknown = null;
    const store = {
      recordMilestone: async (input: any) => {
        observed = input;
        return { ...task, version: 5, milestones: [{ kind: input.kind, status: input.status, evidence: input.evidence }] };
      },
    };
    const updated = await recordVerifiedDabEngineeringMilestone({ store, task, kind: "committed", evidenceRef: "github:commit:abc", actor: worker, recordedAt: "2026-08-08T00:01:00.000Z", idempotencyKey: "milestone:commit" });
    expect(observed).toMatchObject({ taskId: "DAB-TEST", kind: "committed", status: "verified", evidence: "github:commit:abc", expectedTaskVersion: 4 });
    expect(updated.milestones[0]).toMatchObject({ kind: "committed", status: "verified", evidence: "github:commit:abc" });
  });

  it("rejects missing/unbounded evidence and unverified actors", async () => {
    const store = { recordMilestone: async () => task };
    await expect(recordVerifiedDabEngineeringMilestone({ store, task, kind: "merged", evidenceRef: "", actor: worker, recordedAt: "2026-08-08T00:01:00.000Z", idempotencyKey: "x" })).rejects.toThrow("DAB_ENGINEERING_MILESTONE_EVIDENCE_INVALID");
    await expect(recordVerifiedDabEngineeringMilestone({ store, task, kind: "merged", evidenceRef: "github:merge:abc", actor: { ...worker, verified: false }, recordedAt: "2026-08-08T00:01:00.000Z", idempotencyKey: "y" })).rejects.toThrow("DAB_ENGINEERING_MILESTONE_ACTOR_UNVERIFIED");
  });
});
