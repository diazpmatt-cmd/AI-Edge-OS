import { describe, expect, it } from "vitest";
import {
  BACKLINK_WORKFLOW_HUMAN_ACTIONS,
  auditReasonForBacklinkWorkflowHumanAction,
  isBacklinkWorkflowHumanAction,
  statusForBacklinkWorkflowHumanAction,
} from "./backlink-workflow-human-action.js";

describe("backlink workflow human action policy", () => {
  it("exposes only the bounded human action vocabulary", () => {
    expect(BACKLINK_WORKFLOW_HUMAN_ACTIONS).toEqual([
      "review",
      "approve",
      "start_pursuing",
      "mark_won",
      "reject",
    ]);
  });

  it("rejects arbitrary or automation-shaped action values", () => {
    expect(isBacklinkWorkflowHumanAction("review")).toBe(true);
    expect(isBacklinkWorkflowHumanAction("approve")).toBe(true);
    expect(isBacklinkWorkflowHumanAction("send_outreach")).toBe(false);
    expect(isBacklinkWorkflowHumanAction("auto_approve")).toBe(false);
    expect(isBacklinkWorkflowHumanAction("won")).toBe(false);
    expect(isBacklinkWorkflowHumanAction(null)).toBe(false);
  });

  it("maps human actions to canonical workflow statuses", () => {
    expect(statusForBacklinkWorkflowHumanAction("review")).toBe("reviewing");
    expect(statusForBacklinkWorkflowHumanAction("approve")).toBe("approved");
    expect(statusForBacklinkWorkflowHumanAction("start_pursuing")).toBe("pursuing");
    expect(statusForBacklinkWorkflowHumanAction("mark_won")).toBe("won");
    expect(statusForBacklinkWorkflowHumanAction("reject")).toBe("rejected");
  });

  it("creates a bounded attributable audit reason", () => {
    expect(auditReasonForBacklinkWorkflowHumanAction("approve"))
      .toBe("authority_human_action:approve");
  });
});
