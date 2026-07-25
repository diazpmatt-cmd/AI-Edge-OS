import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panelSource = readFileSync(
  "src/components/referrals/ReferralInvitationsPanel.tsx",
  "utf8",
);
const pageSource = readFileSync("src/pages/ReferralProgramPage.tsx", "utf8");
const normalizedPanelSource = panelSource.replace(/\s+/g, " ");

describe("RGE-2 invitation UI safety contract", () => {
  it("adds a visible Invitations tab to Referral Growth", () => {
    expect(pageSource).toContain('"invitations"');
    expect(pageSource).toContain('label: "Invitations"');
    expect(pageSource).toContain(
      "<ReferralInvitationsPanel programs={programs} />",
    );
  });

  it("states clearly that sending is disabled", () => {
    expect(normalizedPanelSource).toContain(
      "real SMS and email delivery is disabled",
    );
    expect(normalizedPanelSource).toContain(
      "never call Telnyx, an email provider, or a scheduler",
    );
    expect(panelSource).toContain("Create draft — do not send");
    expect(panelSource).toContain("Approve — no send");
  });

  it("requires affirmative consent in the invitation form", () => {
    expect(panelSource).toContain("consentConfirmed");
    expect(panelSource).toContain("explicitly consented");
    expect(panelSource).toContain('type="checkbox"');
    expect(panelSource).toContain("required");
  });

  it("supports only SMS and email channels", () => {
    expect(panelSource).toContain('<option value="sms">SMS</option>');
    expect(panelSource).toContain('<option value="email">Email</option>');
    expect(panelSource).not.toContain("WhatsApp");
  });

  it("provides explicit contact suppression", () => {
    expect(panelSource).toContain('"/referrals/contact-preferences/opt-out"');
    expect(panelSource).toContain("Suppress contact");
    expect(panelSource).toContain("matching pending invitations blocked");
  });

  it("never calls a provider or exposes a send endpoint", () => {
    expect(panelSource).not.toContain("sendSms");
    expect(panelSource).not.toContain("TELNYX");
    expect(panelSource).not.toContain("nodemailer");
    expect(panelSource).not.toContain("/send");
  });
});
