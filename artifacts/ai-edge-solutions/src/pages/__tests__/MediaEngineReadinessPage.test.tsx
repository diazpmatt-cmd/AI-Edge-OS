import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MediaEngineReadinessPage from "../MediaEngineReadinessPage";

const apiFetchMock = vi.fn();

vi.mock("../../lib/api", () => ({
  useApiFetch: () => apiFetchMock,
}));

vi.mock("../MediaEnginePage", () => ({
  default: () => <div>Existing Media Studio</div>,
}));

const blockedReadiness = {
  checkedAt: "2026-08-13T06:00:00.000Z",
  clientId: "client-1",
  executionStatus: "blocked",
  blocker: "media_generation_provider_not_configured",
  readiness: {
    status: "not_configured",
    generationAllowed: false,
    capabilities: { image: false, video: false, audio: false },
    providers: [],
  },
  safety: {
    generationEndpointExposed: false,
    demoProviderRegistered: false,
    paidGenerationExecuted: false,
  },
};

describe("MediaEngineReadinessPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("renders the existing studio while showing fail-closed provider truth", async () => {
    apiFetchMock.mockResolvedValue(blockedReadiness);

    render(<MediaEngineReadinessPage />);

    expect(screen.getByText("Existing Media Studio")).toBeTruthy();
    expect(await screen.findByText("Generation blocked — no provider configured")).toBeTruthy();
    expect(screen.getByTestId("media-capability-image").textContent).toContain("Not configured");
    expect(screen.getByTestId("media-capability-video").textContent).toContain("Not configured");
    expect(screen.getByTestId("media-capability-audio").textContent).toContain("Not configured");
    expect(screen.getByText(/cannot generate paid media until a real provider is configured and verified/i)).toBeTruthy();
    expect(apiFetchMock).toHaveBeenCalledWith("/media-generation/readiness");
  });

  it("fails closed when readiness cannot be verified", async () => {
    apiFetchMock.mockRejectedValue(new Error("network unavailable"));

    render(<MediaEngineReadinessPage />);

    expect(await screen.findByText("Generation blocked — readiness unverified")).toBeTruthy();
    expect(screen.getByText(/Provider readiness could not be verified/i)).toBeTruthy();
    expect(screen.getByTestId("media-capability-image").textContent).toContain("Not configured");
  });

  it("shows only capabilities the backend proves ready", async () => {
    apiFetchMock.mockResolvedValue({
      ...blockedReadiness,
      executionStatus: "provider_ready",
      blocker: null,
      readiness: {
        status: "partial",
        generationAllowed: true,
        capabilities: { image: true, video: false, audio: false },
        providers: [
          {
            id: "real-image-provider",
            displayName: "Real Image Provider",
            capabilities: ["image"],
            ready: true,
            reason: null,
          },
        ],
      },
    });

    render(<MediaEngineReadinessPage />);

    await waitFor(() => {
      expect(screen.getByText("Provider-backed generation available")).toBeTruthy();
    });
    expect(screen.getByTestId("media-capability-image").textContent).toContain("Provider ready");
    expect(screen.getByTestId("media-capability-video").textContent).toContain("Not configured");
    expect(screen.getByTestId("media-capability-audio").textContent).toContain("Not configured");
  });
});
