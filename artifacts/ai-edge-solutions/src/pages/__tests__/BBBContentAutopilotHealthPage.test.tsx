import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BBBContentAutopilotHealthPage from "../BBBContentAutopilotHealthPage";

const apiFetchMock = vi.fn();

vi.mock("../../lib/api", () => ({
  useApiFetch: () => apiFetchMock,
}));

vi.mock("../BBBContentAutopilotPage", () => ({
  default: () => <div>Existing Content Autopilot</div>,
}));

function deliveryStatus(overrides: Record<string, unknown> = {}) {
  return {
    taskId: "weekly-task-1",
    taskStatus: "executed",
    planStartDate: "2026-08-10",
    planEndDate: "2026-08-16",
    verificationRule: "external_post_id_or_url_required",
    expectedDeliveries: 4,
    publishedDeliveries: 4,
    failedDeliveries: 0,
    receiptMissingDeliveries: 0,
    unresolvedDeliveries: 0,
    lifecycle: "published",
    channels: [
      { platform: "facebook", expected: 1, published: 1, failed: 0, receiptMissing: 0, unresolved: 0, lifecycle: "published", receipts: [{ externalPostId: "fb-1", externalPostUrl: null, publishedAt: "2026-08-10T12:00:00Z" }] },
      { platform: "instagram", expected: 1, published: 1, failed: 0, receiptMissing: 0, unresolved: 0, lifecycle: "published", receipts: [{ externalPostId: "ig-1", externalPostUrl: null, publishedAt: "2026-08-11T12:00:00Z" }] },
      { platform: "google_business", expected: 1, published: 1, failed: 0, receiptMissing: 0, unresolved: 0, lifecycle: "published", receipts: [{ externalPostId: null, externalPostUrl: "https://example.test/gbp/1", publishedAt: "2026-08-12T12:00:00Z" }] },
      { platform: "youtube", expected: 1, published: 1, failed: 0, receiptMissing: 0, unresolved: 0, lifecycle: "published", receipts: [{ externalPostId: "yt-1", externalPostUrl: null, publishedAt: "2026-08-13T12:00:00Z" }] },
    ],
    ...overrides,
  };
}

describe("BBBContentAutopilotHealthPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("shows all four lanes verified only from the receipt-backed status API", async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/agent-tasks") {
        return {
          tasks: [
            { id: "newer-other-task", taskType: "repair" },
            { id: "weekly-task-1", taskType: "weekly_campaign" },
          ],
        };
      }
      if (path === "/agent-tasks/weekly-task-1/weekly-delivery-status") {
        return deliveryStatus();
      }
      throw new Error(`unexpected path ${path}`);
    });

    render(<BBBContentAutopilotHealthPage />);

    expect(screen.getByText("Existing Content Autopilot")).toBeTruthy();
    expect(await screen.findByText("All 4/4 deliveries receipt-verified")).toBeTruthy();
    expect(screen.getByTestId("weekly-health-facebook").textContent).toContain("Verified 1/1");
    expect(screen.getByTestId("weekly-health-instagram").textContent).toContain("Verified 1/1");
    expect(screen.getByTestId("weekly-health-google_business").textContent).toContain("Verified 1/1");
    expect(screen.getByTestId("weekly-health-youtube").textContent).toContain("Verified 1/1");
    expect(screen.getByText(/scheduled\/queued status alone does not count/i)).toBeTruthy();
  });

  it("shows attention when a platform lane fails or lacks receipt evidence", async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/agent-tasks") {
        return { tasks: [{ id: "weekly-task-1", taskType: "weekly_campaign" }] };
      }
      return deliveryStatus({
        publishedDeliveries: 3,
        failedDeliveries: 1,
        lifecycle: "partial",
        channels: [
          ...deliveryStatus().channels.slice(0, 3),
          { platform: "youtube", expected: 1, published: 0, failed: 1, receiptMissing: 0, unresolved: 0, lifecycle: "failed", receipts: [] },
        ],
      });
    });

    render(<BBBContentAutopilotHealthPage />);

    expect(await screen.findByText("Weekly delivery needs attention")).toBeTruthy();
    expect(screen.getByTestId("weekly-health-youtube").textContent).toContain("Needs attention 0/1");
  });

  it("fails closed when there is no weekly campaign task", async () => {
    apiFetchMock.mockResolvedValue({ tasks: [{ id: "other", taskType: "repair" }] });

    render(<BBBContentAutopilotHealthPage />);

    expect(await screen.findByText("No weekly campaign receipt evidence")).toBeTruthy();
    expect(screen.getByTestId("weekly-health-facebook").textContent).toContain("No lane evidence");
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when receipt status cannot be loaded", async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/agent-tasks") {
        return { tasks: [{ id: "weekly-task-1", taskType: "weekly_campaign" }] };
      }
      throw new Error("receipt API unavailable");
    });

    render(<BBBContentAutopilotHealthPage />);

    expect(await screen.findByText("Publishing health unverified")).toBeTruthy();
    expect(screen.getByText(/No delivery success is assumed/i)).toBeTruthy();
  });
});
