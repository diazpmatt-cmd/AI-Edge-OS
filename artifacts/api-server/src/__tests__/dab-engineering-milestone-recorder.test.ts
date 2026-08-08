import { describe, expect, it } from "vitest";
import { InMemoryDevelopmentCoordinationStore, createTaskSpecification, type TrustedDevelopmentActor } from "@workspace/development-control";
import { recordVerifiedDabEngineeringMilestone } from "../lib/dab-engineering-milestone-recorder.js";

const human: TrustedDevelopmentActor = { actorId: "github:diazpmatt-cmd", displayName: "Matthew Diaz", actorType: "human_authority", verified: true, developmentControl: true };
const worker: TrustedDevelopmentActor = { actorId: "apollos:test", displayName: "Apollos", actorType: "bounded_sub_agent", verified: true, developmentControl: true };

function specification() {
  return createTaskSpecification({ taskId: "DAB-TEST", title: "Milestone recorder", taskType: "implementation", revision: 1, expectedOriginMainSha: "a".repeat(40), branchMode: "dedicated_branch", intendedBranch: "feature/test", priority: "high", dependencies: [], origin: "test", proposedAgent: "apollos", authorizedScope: ["test"], authorizedFiles: ["a.ts"], explicitExclusions: [], acceptanceCriteria: ["done"], verificationRequirements: ["test"], documentationRequirements: [], references: [] });
}

describe("DAB engineering milestone recorder", () => {
  it("records factual Git evidence into the canonical DAB milestone model", async () => {
    const store = new InMemoryDevelopmentCoordinationStore();
    const registered = store.registerTask({ specification: specification(), actor: human, timestamp: "2026-08-08T00:00:00.000Z", idempotencyKey: "register" });
    const updated = await recordVerifiedDabEngineeringMilestone({ store, task: registered, kind: "committed", evidenceRef: "github:commit:abc", actor: worker, recordedAt: "2026-08-08T00:01:00.000Z", idempotencyKey: "milestone:commit" });
    expect(updated.milestones.find(item => item.kind === "committed")).toMatchObject({ status: "verified", evidence: "github:commit:abc" });
  });

  it("rejects missing/unbounded evidence and unverified actors", async () => {
    const store = new InMemoryDevelopmentCoordinationStore();
    const task = store.registerTask({ specification: specification(), actor: human, timestamp: "2026-08-08T00:00:00.000Z", idempotencyKey: "register" });
    await expect(recordVerifiedDabEngineeringMilestone({ store, task, kind: "merged", evidenceRef: "", actor: worker, recordedAt: "2026-08-08T00:01:00.000Z", idempotencyKey: "x" })).rejects.toThrow("DAB_ENGINEERING_MILESTONE_EVIDENCE_INVALID");
    await expect(recordVerifiedDabEngineeringMilestone({ store, task, kind: "merged", evidenceRef: "github:merge:abc", actor: { ...worker, verified: false }, recordedAt: "2026-08-08T00:01:00.000Z", idempotencyKey: "y" })).rejects.toThrow("DAB_ENGINEERING_MILESTONE_ACTOR_UNVERIFIED");
  });
});
