import { describe, expect, it } from "vitest";
import { blockerForBacklinkWorkflowWinEvidence } from "./backlink-workflow-win-evidence-policy.js";

const actions = ["review", "approve", "start_pursuing", "mark_won", "reject"] as const;

describe("backlink workflow win evidence policy", () => {
  it("blocks mark_won without verified evidence", () => {
    expect(blockerForBacklinkWorkflowWinEvidence("mark_won", false)).toBe("verified_win_evidence_required");
  });

  it("allows mark_won with verified evidence", () => {
    expect(blockerForBacklinkWorkflowWinEvidence("mark_won", true)).toBeNull();
  });

  it("does not impose the win-evidence gate on other human actions", () => {
    for (const action of actions.filter((candidate) => candidate !== "mark_won")) {
      expect(blockerForBacklinkWorkflowWinEvidence(action, false)).toBeNull();
    }
  });
});
