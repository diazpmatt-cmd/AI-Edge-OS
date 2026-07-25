import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  "src/pages/ReferralProgramPage.tsx",
  "utf8",
);
const panelSource = readFileSync(
  "src/components/referrals/ReferralFraudReviewPanel.tsx",
  "utf8",
);
const normalizedPanelSource = panelSource.replace(/\s+/g, " ");

describe("RGE-5 fraud review UI contract", () => {
  it("adds a visible review queue with status filters and evidence labels", () => {
    expect(pageSource).toContain('label: "Fraud Review"');
    expect(pageSource).toContain("<ReferralFraudReviewPanel />");
    for (const status of ["open", "held", "cleared", "rejected", "all"]) {
      expect(panelSource).toContain(`"${status}"`);
    }
    expect(panelSource).toContain("Duplicate identity");
    expect(panelSource).toContain("Suspicious velocity");
    expect(panelSource).toContain("Reward stacking");
    expect(panelSource).toContain("Object.entries(signal.evidence)");
    expect(panelSource).toContain("{signal.points} points");
  });

  it("requires two explicit human confirmations and an evidence note", () => {
    expect(panelSource).toContain("window.prompt");
    expect(panelSource).toContain("window.confirm");
    expect(panelSource).toContain("confirmEvaluation: true");
    expect(panelSource).toContain("confirmDecision: true");
    expect(panelSource).toContain("expectedVersion: review.version");
    expect(panelSource).toContain("idempotencyKey:");
  });

  it("states that decisions are queue-only and fingerprint collection is absent", () => {
    expect(normalizedPanelSource).toContain(
      "risk signals are evidence, not guilt",
    );
    expect(normalizedPanelSource).toContain("affect this queue only");
    expect(normalizedPanelSource).toContain(
      "Device/IP fingerprinting is not collected",
    );
    expect(normalizedPanelSource).toContain(
      "No customer or reward action will occur",
    );
  });

  it("contains no provider, payment, scheduler, or CRM mutation", () => {
    expect(panelSource).not.toContain("TELNYX_API_KEY");
    expect(panelSource).not.toContain("stripe");
    expect(panelSource).not.toContain("sendMail");
    expect(panelSource).not.toContain("setInterval");
    expect(panelSource).not.toContain("gorilladesk");
  });
});
