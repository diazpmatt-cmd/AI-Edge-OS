import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import AIReceptionistPage from "../AIReceptionistPage";

const apiFetchMock = vi.fn();

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/contexts/theme-context", () => ({
  useTheme: () => ({
    colors: { text: "#E2E8F0", text2: "#94A3B8" },
    isDark: true,
  }),
}));

vi.mock("@/lib/api", () => ({
  useApiFetch: () => apiFetchMock,
}));

const settings = {
  id: "settings-1",
  clientId: "client-1",
  businessName: "Bed Bugs & Beyond",
  transferPhone: "+12513249090",
  greetingScript: "Thanks for calling.",
  callbackMessage: "We will call you back.",
  voicemailMessage: "Please leave a message.",
  textRoutingMessage: "Reply here for help.",
  customGreetingUrl: "",
  voiceStyle: "Polly.Joanna",
  businessHoursJson: "{}",
  afterHoursMode: "voicemail",
};

const blockedReadiness = {
  checkedAt: "2026-08-13T04:00:00.000Z",
  clientId: "client-1",
  telnyx: {
    apiKeyConfigured: true,
    publicKeyConfigured: true,
    fromNumber: "+12512863200",
  },
  communicationEndpoint: {
    found: true,
    active: true,
    verified: true,
    purpose: "voice_sms",
    ready: true,
  },
  aiReceptionist: {
    settingsPresent: true,
    businessName: "Bed Bugs & Beyond",
    transferConfigured: true,
    transferPhone: "+12513249090",
    afterHoursMode: "voicemail",
    transferSafety: {
      status: "blocked",
      reason: "matches_known_legacy_public_forwarding_number",
      sameAsTelnyxAiNumber: false,
      sameAsCanonicalPublicInbound: false,
      knownLegacyUnsafeDefaultDetected: true,
      canonicalPublicInboundPhone: null,
      manualVerificationRequired: false,
    },
  },
  recoveryOwnership: {
    schedulerEnabled: false,
    immediateWebhookOwner: true,
    duplicateOwnerRisk: false,
  },
  safetyMaintenance: {
    schemaDefaultNeutralized: true,
    existingTransferRowMutated: false,
  },
  readiness: {
    inboundRoutingReady: true,
    missedCallRecoveryReady: true,
    signedWebhookVerificationReady: true,
    receptionistTransferConfigurationReady: true,
    receptionistTransferSafetyVerified: false,
    receptionistTransferReady: false,
  },
};

describe("AIReceptionistPage readiness truth", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/ai-receptionist/settings" && !init?.method) return settings;
      if (path === "/lead-recovery/readiness") return blockedReadiness;
      if (path === "/ai-receptionist/test-call-flow" && init?.method === "POST") {
        return {
          digit: "2",
          action: "Callback",
          response: "We will call you back.",
          voice: "Polly.Joanna",
          settings: { businessName: "Bed Bugs & Beyond", transferPhone: "+12513249090" },
        };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
  });

  it("uses the authenticated API helper without double-prefixing /api", async () => {
    render(<AIReceptionistPage />);

    await screen.findByText("Bed Bugs & Beyond", { exact: false });

    expect(apiFetchMock).toHaveBeenCalledWith("/ai-receptionist/settings");
    expect(apiFetchMock).toHaveBeenCalledWith("/lead-recovery/readiness");
    expect(apiFetchMock.mock.calls.some(([path]) => String(path).startsWith("/api/"))).toBe(false);
  });

  it("blocks the historical public-forwarding transfer instead of claiming it is live", async () => {
    render(<AIReceptionistPage />);

    expect(await screen.findByText(/legacy public forwarding number detected/i)).toBeTruthy();
    expect(screen.getByText("Live test blocked")).toBeTruthy();
    expect(screen.getByText("Gate closed")).toBeTruthy();
    expect(screen.queryByText(/Press 1: Transfer.*Live/i)).toBeNull();
  });

  it("does not expose the production live-SMS tester", async () => {
    render(<AIReceptionistPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Safe Simulation" }));

    expect(screen.queryByRole("button", { name: /Send Test SMS/i })).toBeNull();
    expect(screen.queryByText(/Uses live Telnyx API/i)).toBeNull();
    expect(screen.getByText(/do not place a phone call and do not send an SMS/i)).toBeTruthy();
  });

  it("keeps IVR testing on the server-side simulation endpoint", async () => {
    render(<AIReceptionistPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Safe Simulation" }));
    fireEvent.click(screen.getByRole("button", { name: /Press 2/i }));

    expect(await screen.findByText(/We will call you back/i)).toBeTruthy();
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/ai-receptionist/test-call-flow",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ digit: "2" }),
        }),
      );
    });
  });
});
